import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreModel } from '../src/client/score-model.js';
import { choirColumns, withIntervals } from '../src/client/score-intervals.js';

const C = createScoreModel({ grandStaff: true, choir: true });

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
