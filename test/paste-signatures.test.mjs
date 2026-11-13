import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreModel } from '../src/client/score-model.js';

const M = createScoreModel();

function fragment() {
  const score = M.emptyScore();
  score.meter = '6/8';
  score.fifths = -2;
  score.keys = { 2: 3 };
  score.rows[0][2] = [{ d: 'q', n: 37, at: 0 }];
  return JSON.parse(JSON.stringify(M.copySelection(score, [{ mi: 2, i: 0 }])));
}

test('pasting a fragment with another key signature keeps the pitch of the notes already there', () => {
  const score = M.emptyScore();
  score.rows[0][2] = [{ d: 'q', n: 38, at: 0 }];
  const before = M.attacks(score)[0].midis[0];
  assert.ok(M.pasteSelection(score, fragment(), 2));
  assert.equal(M.keyAt(score, 2), 3);
  assert.ok(M.attacks(score)[0].midis.includes(before));
  assert.equal(score.rows[0][2].find((ev) => ev.n === 38).acc, 'n');
});
