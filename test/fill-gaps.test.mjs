import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreModel } from '../src/client/score-model.js';

const M = createScoreModel({ grandStaff: true });

const measure = () => [
  { d: 'e', rest: true, v: 1, at: 0 }, { d: 'e', rest: true, v: 1, at: 12 }, { d: 'q', n: 34, v: 1, at: 24 }, { d: 'q', n: 32, v: 2, at: 24 },
  { d: 'e', n: 35, v: 1, at: 48 }, { d: 'e', n: 32, v: 2, at: 48 },
];

test('a gap before a voice enters is written as rests, so moving the other voice no longer displaces it', () => {
  const m = measure();
  const before = M.onsets(m);
  assert.equal(M.fillGaps(m), true);
  const rests = m.filter((ev) => ev.v === 2 && ev.rest);
  assert.equal(rests.reduce((sum, ev) => sum + M.length(ev), 0), 24);
  const lower = m.find((ev) => ev.n === 32);
  assert.equal(M.onsets(m)[m.indexOf(lower)], before[3]);
  // The upper quarter can now leave its column without moving the lower note.
  const rest = m.filter((ev) => ev !== m[2]);
  M.insertAt(rest, { ...m[2] }, 36);
  assert.equal(M.onsets(rest)[rest.indexOf(lower)], 24);
  assert.equal(M.fillGaps(m), false);
});
