import { test } from 'node:test';
import assert from 'node:assert/strict';
import M, { createScoreModel } from '../src/client/score-model.js';
import { atTimeline, xmlTimeline } from '../src/client/debug-timing.js';

const bar = (...figures) => ({ meter: '4/4', clef: 'treble', fifths: 0, rows: [[figures]] });

test('a lone note asked at 72 stays at 72: `at` is the real start', () => {
  const score = bar();
  const measure = M.measures(score)[0];
  const spot = M.placement(measure, { d: 'q', n: 37 }, 72, score, 0);
  M.insertNote(measure, { d: 'q', n: 37 }, spot.at, M.capacity(score, 0));
  const [figure] = atTimeline(M, score, 0).figures;
  assert.equal(figure.at, 72);
  assert.equal(figure.start, 72);
});

test('two voices with at 0 and 72: the late voice starts at 72, with a <forward> before it', () => {
  const score = bar({ d: 'q', n: 37, at: 0, v: 1 }, { d: 'q', n: 35, at: 72, v: 2 });
  const [first, late] = atTimeline(M, score, 0).figures;
  assert.equal(first.start, 0);
  assert.equal(late.at, 72);
  assert.equal(late.start, 72);
  const forwards = xmlTimeline(M, score, 0).items.filter((i) => i.kind === 'forward' && i.voice === 2);
  assert.deepEqual(forwards.map((f) => [f.start, f.dur]), [[0, 72]]);
});

test('the MusicXML pads each voice to the end of the bar with one <forward>, not hidden rests', () => {
  const score = bar({ d: 'q', n: 37, at: 0, v: 1 }, { d: 'q', n: 35, at: 0, v: 2 });
  const { items } = xmlTimeline(M, score, 0);
  assert.deepEqual(items.filter((i) => i.kind === 'forward').map((i) => [i.voice, i.start, i.dur]), [[1, 24, 72], [2, 24, 72]]);
  assert.equal(items.some((i) => i.kind === 'hidden'), false);
});

test('a second voice that waits behind a rest starts where the rest ends', () => {
  const score = bar({ d: 'h', n: 37, at: 0, v: 1 }, { d: 'h', rest: true, at: 0, v: 2 }, { d: 'q', n: 35, at: 48, v: 2 });
  const { items } = xmlTimeline(M, score, 0);
  const note = items.find((i) => i.kind === 'note' && i.voice === 2);
  assert.equal(note.start, 48);
});

test('the MusicXML items say which staff they belong to', () => {
  const score = { ...bar({ d: 'q', n: 37, at: 0 }), instrument: 'piano', lower: { 0: [{ d: 'q', n: 25, at: 0 }] } };
  const Grand = createScoreModel({ grandStaff: true });
  const { items } = xmlTimeline(Grand, score, 0);
  assert.deepEqual([...new Set(items.map((i) => i.staff))].sort(), [0, 1]);
  assert.equal(atTimeline(Grand, score, 0, 1).figures.length, 1);
});

test('a model asked for one row of two bars starts that way; the default is still three rows of four', () => {
  const small = createScoreModel({ minRows: 1, initialMeasures: 2 });
  assert.deepEqual(small.emptyScore().rows.map((row) => row.length), [2]);
  assert.deepEqual(createScoreModel().emptyScore().rows.map((row) => row.length), [4, 4, 4]);
});
