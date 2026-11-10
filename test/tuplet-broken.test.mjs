import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreModel } from '../src/client/score-model.js';

const M = createScoreModel();

test('a triplet missing a figure turns back into plain figures', () => {
  const measure = [{ d: 'e', n: 30, tp: 1, at: 0 }, { d: 'e', n: 31, at: 1 }, { d: 'e', n: 32, tp: 1, at: 2 }];
  M.dropBrokenTuplets(measure, new Set([1]));
  assert.ok(measure.every((ev) => !ev.tp));
});

test('a complete triplet is kept', () => {
  const measure = [{ d: 'e', n: 30, tp: 1 }, { d: 'e', n: 31, tp: 1 }, { d: 'e', n: 32, tp: 1 }];
  M.dropBrokenTuplets(measure, new Set([1]));
  assert.ok(measure.every((ev) => ev.tp === 1));
});
