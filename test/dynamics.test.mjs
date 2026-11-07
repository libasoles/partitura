import { test } from 'node:test';
import assert from 'node:assert/strict';
import M from '../src/client/score-model.js';
import { renderScoreStaff } from '../src/lib/staff.js';

test('independent intensities persist, replace at the same time, and render without a hairpin', async () => {
  const score = M.emptyScore();
  M.DYNAMICS.forEach((value, i) => assert.ok(M.setDynamic(score, 0, i * 6, value)));
  assert.equal(M.setDynamic(score, 0, 0, 'invalid'), false);
  assert.equal(M.setDynamic(score, 99, 0, 'p'), false);
  assert.equal(M.setDynamic(score, 0, 96, 'p'), false);
  assert.deepEqual(M.sanitize(score).dynamics, score.dynamics);
  const xml = M.toMusicXml(score);
  assert.equal((xml.match(/<dynamics>/g) || []).length, 8);
  assert.ok(!xml.includes('<wedge'));
  const svg = await renderScoreStaff(score);
  assert.equal((svg.match(/class="dynam"/g) || []).length, 8);
  assert.ok(M.setDynamic(score, 0, 0, 'ff'));
  assert.equal(score.dynamics[0].length, 8);
  assert.equal(score.dynamics[0][0].value, 'ff');
  assert.ok(M.setDynamic(score, 0, 0, null));
  assert.equal(score.dynamics[0].length, 7);
});

test('intensities follow split, move, insert and remove measure operations', () => {
  const score = M.emptyScore();
  M.setDynamic(score, 0, 0, 'p');
  M.setDynamic(score, 0, 48, 'f');
  assert.ok(M.setBarline(score, 0, 'double', 48));
  assert.deepEqual(score.dynamics, { 0: [{ at: 0, value: 'p' }], 1: [{ at: 0, value: 'f' }] });
  assert.ok(M.moveMeasure(score, 1, 0));
  assert.deepEqual(score.dynamics, { 0: [{ at: 0, value: 'f' }], 1: [{ at: 0, value: 'p' }] });
  assert.ok(M.insertMeasure(score, 0));
  assert.deepEqual(score.dynamics, { 1: [{ at: 0, value: 'f' }], 2: [{ at: 0, value: 'p' }] });
  assert.ok(M.removeMeasureAt(score, 1));
  assert.deepEqual(score.dynamics, { 1: [{ at: 0, value: 'p' }] });
  // The surviving marks keep their position through saving.
  assert.deepEqual(M.sanitize(score).dynamics, score.dynamics);
});

test('an independent intensity overrides a hairpin endpoint without duplicating it', () => {
  const score = M.emptyScore();
  M.setHairpin(score, 0, { at: 0, to: 48, kind: 'cresc', startDyn: 'p', endDyn: 'f' });
  M.setDynamic(score, 0, 0, 'pp');
  const xml = M.toMusicXml(score);
  assert.equal((xml.match(/<dynamics>/g) || []).length, 2);
  assert.ok(xml.includes('<pp/>'));
  assert.ok(!xml.includes('<p/>'));
  M.setDynamic(score, 0, 0, null);
  assert.ok(M.toMusicXml(score).includes('<p/>'));
});
