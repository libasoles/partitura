import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreModel } from '../src/client/score-model.js';
import { soundingNotes } from '../src/client/score-notes.js';

const M = createScoreModel({ grandStaff: true });

test('playback timing respects rests, accidentals, simultaneous staves and tied notes', () => {
  const score = M.emptyScore();
  score.rows = [[
    [{ d: 'q', rest: true }, { d: 'q', n: 35, acc: '#' }, { d: 'h', n: 35, tie: true }],
    [{ d: 'h', n: 35 }, { d: 'h', n: 36 }],
  ]];
  score.lower = { 0: [{ d: 'w', n: 28 }] };
  const notes = soundingNotes(score, M);
  assert.deepEqual(notes.map(({ midi, start, end, channel }) => [midi, start / M.DIVISIONS, end / M.DIVISIONS, channel]), [
    [61, 1, 2, 0], [61, 2, 4, 0], [60, 4, 6, 0], [62, 6, 8, 0], [48, 0, 4, 1],
  ]);
  // Explicitly tie the same pitch across the barline.
  score.rows[0][1][0].acc = '#';
  assert.equal(soundingNotes(score, M)[1].end / M.DIVISIONS, 6);
});

test('playback tool is kept when saving/sanitizing a score', () => {
  const score = M.emptyScore();
  M.setTool(score, 'playback', true);
  assert.equal(M.sanitize(score).tools.playback, true);
});
