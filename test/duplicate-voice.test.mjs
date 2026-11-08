import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreModel } from '../src/client/score-model.js';

const M = createScoreModel({ grandStaff: true });

test('duplicates the top voice a third below across every measure', () => {
  const score = M.emptyScore();
  score.rows[0][0] = [37, 40, 39, 38].map((n) => ({ d: 'q', n }));
  score.rows[0][1] = [{ d: 'h', n: 41 }, { d: 'h', n: 40 }];
  const created = M.duplicateVoice(score);
  assert.equal(created.length, 6);
  assert.deepEqual(score.rows[0][0].filter((ev) => ev.v === 2).map((ev) => ev.n), [35, 38, 37, 36]);
  assert.deepEqual(score.rows[0][1].filter((ev) => ev.v === 2).map((ev) => ev.n), [39, 38]);
  assert.equal(M.voices(score.rows[0][1]).length, 2);
});

test('lists the voice numbers present in the score', () => {
  const score = M.emptyScore();
  score.rows[0][0] = [{ n: 40, d: 'w', at: 0, v: 1 }, { n: 30, d: 'w', at: 0, v: 2 }];
  assert.deepEqual(M.voiceNumbers(score), [1, 2]);
});

test('several voices are duplicated a third below, stacked under the lowest chosen one', () => {
  const score = M.emptyScore();
  score.rows[0][0] = [
    { n: 40, d: 'w', at: 0, v: 1 }, { n: 34, d: 'w', at: 0, v: 2 }, { n: 25, d: 'w', at: 0, v: 3 },
  ];
  const created = M.duplicateVoice(score, [1, 2]);
  assert.equal(created.length, 2);
  const byVoice = (v) => score.rows[0][0].filter((ev) => ev.v === v).map((ev) => ev.n);
  assert.deepEqual([1, 2, 3, 4, 5].map(byVoice), [[40], [34], [38], [32], [25]]);
});

test('a single chosen voice is copied right below itself', () => {
  const score = M.emptyScore();
  score.rows[0][0] = [{ n: 40, d: 'w', at: 0, v: 1 }, { n: 30, d: 'w', at: 0, v: 2 }];
  M.duplicateVoice(score, [1]);
  const byVoice = (v) => score.rows[0][0].filter((ev) => ev.v === v).map((ev) => ev.n);
  assert.deepEqual([1, 2, 3].map(byVoice), [[40], [38], [30]]);
});

test('leaves the score untouched when nothing can be duplicated', () => {
  const score = M.emptyScore();
  const before = JSON.stringify(score);
  assert.equal(M.duplicateVoice(score), null);
  assert.equal(JSON.stringify(score), before);
});
