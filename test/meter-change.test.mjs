import { test } from 'node:test';
import assert from 'node:assert/strict';
import M from '../src/client/score-model.js';

test('a passage meter change preserves earlier measures, later changes and notes', () => {
  const score = M.emptyScore();
  score.meters = { 3: '6/8' };
  score.rows[0][1] = [{ d: 'w', n: 30 }];
  const rows = M.clone(score.rows);
  assert.equal(M.setMeterAt(score, 1, '3/4'), true);
  assert.equal(M.meterAt(score, 0), '4/4');
  assert.equal(M.meterAt(score, 1), '3/4');
  assert.equal(M.meterAt(score, 2), '3/4');
  assert.equal(M.meterAt(score, 3), '6/8');
  assert.deepEqual(score.rows, rows);
  assert.match(M.toMusicXml(score), /<time><beats>3<\/beats><beat-type>4<\/beat-type><\/time>/);
  assert.equal(M.setMeterAt(score, 1, '4/4'), true);
  assert.deepEqual(score.meters, { 3: '6/8' });
  assert.equal(M.setMeterAt(score, -1, '3/4'), false);
  assert.equal(M.setMeterAt(score, 1, 'bad'), false);
});
