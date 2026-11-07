import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreModel } from '../src/client/score-model.js';
import { choirColumns, withIntervals } from '../src/client/score-intervals.js';

const C = createScoreModel({ grandStaff: true, choir: true });

test('Voces: intervals stay above staff one when only lower voices start notes', () => {
  const score = C.emptyScore();
  C.setInstrument(score, 'voices');
  C.setParts(score, 4);
  score.lower2 = { 0: [{ d: 'h', n: 35 }, { d: 'h', n: 36 }] };
  score.lower3 = { 0: [{ d: 'w', n: 30 }] };
  const xml = withIntervals(C.toMusicXml(score), score, C, new Set([3, 4]));
  const directions = [...xml.matchAll(/<direction placement="above"><direction-type><words font-family="PartituraIntervals"[\s\S]*?<\/direction>/g)];
  assert.equal(directions.length, 2);
  directions.forEach(([direction]) => assert.match(direction, /<staff>1<\/staff>/));
});

function choir() {
  const score = C.emptyScore();
  C.setInstrument(score, 'voices');
  score.rows[0][0] = [{ d: 'h', n: 37 }, { d: 'q', n: 38 }];
  score.lower = { 0: [{ d: 'h', n: 35 }, { d: 'q', n: 36 }] };
  score.lower2 = { 0: [{ d: 'w', n: 30 }] };
  return C.sanitize(score);
}

test('Voces: intervals are taken between staves, each staff being one voice', () => {
  const columns = choirColumns(choir(), 0, C);
  assert.deepEqual(columns.map((c) => c.intervals), [['III', 'VI'], ['III', 'VII']]);
  assert.deepEqual(columns.map((c) => c.staff), [0, 0]);
});

test('Voces: one mark per column is engraved, including a third staff', () => {
  const score = choir();
  const xml = withIntervals(C.toMusicXml(score), score, C);
  assert.equal((xml.match(/PartituraIntervals/g) || []).length, 2);
  assert.match(xml, /<note id="p0-0">/);
});

test('Voces: selected outer voices form a fifth instead of the two adjacent thirds', () => {
  const score = choir();
  score.rows[0][0] = [{ d: 'w', n: 39 }];
  score.lower = { 0: [{ d: 'q', n: 37 }, { d: 'h', n: 38 }] };
  score.lower2 = { 0: [{ d: 'w', n: 35 }] };
  assert.deepEqual(choirColumns(score, 0, C, new Set([1, 2, 3]))[0].intervals, ['III', 'III']);
  const selected = choirColumns(score, 0, C, new Set([1, 3]));
  assert.deepEqual(selected.map((column) => column.intervals), [['V']]);
  assert.deepEqual(choirColumns(score, 0, C, new Set([2])), []);
  assert.deepEqual(choirColumns(score, 0, C, new Set()), []);
  const xml = withIntervals(C.toMusicXml(score), score, C, new Set([1, 3]));
  assert.equal((xml.match(/PartituraIntervals/g) || []).length, 1);
  assert.match(xml, />V<\/words>/);
});

test('Voces: F–B is IV; a sustained G between them gives III and II', () => {
  const score = C.emptyScore();
  C.setInstrument(score, 'voices');
  score.rows[0][0] = [{ d: 'h', n: 39 }, { d: 'q', n: 41 }];
  score.lower = { 0: [{ d: 'h', dot: 1, n: 39 }] };
  score.lower2 = { 0: [{ d: 'h', n: 36 }, { d: 'q', n: 38 }] };
  assert.deepEqual(choirColumns(score, 0, C).at(-1).intervals, ['III', 'II']);
  score.lower = { 0: [{ d: 'h', n: 39 }] };
  assert.deepEqual(choirColumns(score, 0, C).at(-1).intervals, ['IV']);
  score.lower = {};
  assert.deepEqual(choirColumns(score, 0, C).at(-1).intervals, ['IV']);
});

test('Intervals relative to the bass label every note against the lowest one', () => {
  const score = choir();
  score.rows[0][0] = [{ d: 'w', n: 39 }];
  score.lower = { 0: [{ d: 'w', n: 37 }] };
  score.lower2 = { 0: [{ d: 'w', n: 35 }] };
  assert.deepEqual(choirColumns(score, 0, C)[0].intervals, ['III', 'III']);
  assert.deepEqual(choirColumns(score, 0, C, null, true)[0].intervals, ['V', 'III']);
  assert.equal(C.intervalModeOf(score), 'bass');
  C.setIntervalMode(score, 'voices');
  assert.equal(C.intervalModeOf(C.sanitize(score)), 'voices');
  assert.equal(C.sanitize(score).intervalMode, 'voices');
  C.setIntervalMode(score, 'bass');
  assert.equal(score.intervalMode, undefined);
  assert.equal(C.intervalModeOf(C.sanitize(score)), 'bass');
  assert.equal(C.intervalModeOf(C.sanitize({ ...score, intervalMode: 'bass' })), 'bass');
  const xml = withIntervals(C.toMusicXml(score), score, C);
  assert.match(xml, />V\nIII<\/words>/);
});
