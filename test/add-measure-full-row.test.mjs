import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreModel } from '../src/client/score-model.js';

const M = createScoreModel({});

test('+ en un renglon lleno inserta el compas al inicio del siguiente y empuja el resto', () => {
  const score = M.emptyScore();
  while (score.rows[0].length < M.PER_ROW) M.addMeasure(score, 0);
  const rows = score.rows.length;
  const total = M.measures(score).length;
  assert.ok(M.addMeasure(score, 0));
  assert.equal(score.rows[0].length, M.PER_ROW);
  assert.equal(M.measures(score).length, total + 1);
  assert.ok(score.rows.length >= rows);
  assert.ok(score.rows[1].length >= 1);
});

test('+ en el ultimo renglon lleno crea un renglon nuevo', () => {
  const score = M.emptyScore();
  const last = score.rows.length - 1;
  while (score.rows[last].length < M.PER_ROW) M.addMeasure(score, last);
  const rows = score.rows.length;
  assert.ok(M.addMeasure(score, last));
  assert.equal(score.rows.length, rows + 1);
  assert.equal(score.rows[last].length, M.PER_ROW);
});
