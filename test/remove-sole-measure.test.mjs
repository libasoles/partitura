import test from 'node:test';
import assert from 'node:assert/strict';
import { createScoreModel } from '../src/client/score-model.js';

const M = createScoreModel();

test('removeMeasure drops a row whose only measure is removed, if other rows exist', () => {
  const score = M.emptyScore();
  score.rows = [[[], []], [[]]];
  assert.equal(M.removeMeasure(score, 1), true);
  assert.equal(score.rows.length, 1);
  assert.equal(M.removeMeasure(score, 0), true);
  assert.equal(M.removeMeasure(score, 0), false);
});
