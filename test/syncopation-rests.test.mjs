import { test } from 'node:test';
import assert from 'node:assert/strict';
import M from '../src/client/score-model.js';

const place = (score, mi, t) => {
  const measure = M.measures(score)[mi];
  const ev = { d: 'e', n: 30 };
  const spot = M.placement(measure, ev, t, score, mi);
  measure.push(...M.leadingRests(score, mi, 0, spot.at));
  M.insertNote(measure, ev, spot.at);
  return M.onsets(measure).map((at, i) => [measure[i].rest || false, at]).sort((a, b) => a[1] - b[1]);
};

const twoMeasures = () => {
  const score = { ...M.emptyScore(), meter: '6/8' };
  score.rows[0] = [[{ d: 'w', rest: true, at: 0 }], []];
  return score;
};

test('syncopation in the first measure is preceded by rests', () => {
  assert.deepEqual(place({ ...M.emptyScore(), meter: '6/8' }, 0, 12), [[true, 0], [false, 12]]);
});

test('syncopation after a double bar, final bar or repeat start is preceded by rests', () => {
  for (const barlines of [{ 0: { double: true } }, { 0: { end: true } }, { 1: { start: true } }]) {
    const score = twoMeasures();
    score.barlines = barlines;
    assert.deepEqual(place(score, 1, 12), [[true, 0], [false, 12]]);
  }
});

test('an empty measure after a plain bar and an on-beat note get no rests', () => {
  assert.deepEqual(place(twoMeasures(), 1, 12), [[false, 0]]);
  assert.deepEqual(place({ ...M.emptyScore(), meter: '6/8' }, 0, 0), [[false, 0]]);
});
