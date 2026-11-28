import { test } from 'node:test';
import assert from 'node:assert/strict';
import M from '../src/client/score-model.js';
import { atTimeline, xmlTimeline, planPlacement } from '../src/client/debug-timing.js';

const bar = (...figures) => ({ meter: '4/4', clef: 'treble', fifths: 0, rows: [[figures]] });

test('a lone note asked at 72 is settled at 0: a gap in at lasts nothing', () => {
  const plan = planPlacement(M, bar(), { d: 'q' }, { mi: 0, t: 72, n: 37 });
  assert.equal(plan.ok, true);
  assert.equal(plan.requested, 72);
  const [figure] = atTimeline(M, plan.trial, 0).figures;
  assert.equal(figure.at, 0);
  assert.equal(figure.start, 0);
});

test('two voices with at 0 and 72: the late voice starts at 0, and at is drawn apart from the real start', () => {
  const score = bar({ d: 'q', n: 37, at: 0, v: 1 }, { d: 'q', n: 35, at: 72, v: 2 });
  const [first, late] = atTimeline(M, score, 0).figures;
  assert.equal(first.start, 0);
  assert.equal(late.at, 72);
  assert.equal(late.start, 0);
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

test('a refused placement reports why instead of throwing', () => {
  const score = bar({ d: 'q', n: 37, at: 0 });
  const plan = planPlacement(M, score, { d: 'q' }, { mi: 0, t: 0, n: 37 });
  assert.equal(plan.ok, false);
  assert.match(plan.reason, /null/);
});
