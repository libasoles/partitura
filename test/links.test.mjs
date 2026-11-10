import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreModel } from '../src/client/score-model.js';

const M = createScoreModel({ grandStaff: true });
const ref = (i, mi = 0, s = 0) => M.refOf(s, mi, i);
function scoreWith(measure) {
  const score = M.emptyScore();
  score.rows[0][0] = measure;
  return score;
}

test('a carried accidental makes equal written notes differ: no stale tie, linking makes a slur', () => {
  const score = scoreWith([{ d: 'q', n: 41, acc: 'b', at: 0 }, { d: 'q', n: 38, at: 24 }, { d: 'q', n: 41, tie: true, at: 48 }]);
  score.rows[0][1] = [{ d: 'q', n: 41, at: 0 }];
  assert.deepEqual(M.links(score), []);
  const pair = [ref(2), ref(0, 1)];
  assert.ok(M.selectionActions(score, pair).includes('link'));
  assert.ok(M.applySelection(score, pair, 'link'));
  assert.deepEqual(M.links(score), [{ type: 'slur', from: ref(2), to: ref(0, 1) }]);
});

test('a tie continues across a bar and within the measure, survives saving and exports both ends', () => {
  const score = scoreWith([{ d: 'w', n: 37, tie: true }]);
  score.rows[0][1] = [{ d: 'h', n: 37 }, { d: 'e', n: 37 }, { d: 'e', n: 36 }];
  const pair = [ref(1, 1), ref(0, 1)];
  assert.ok(M.selectionActions(score, pair).includes('link'));
  assert.ok(M.applySelection(score, pair, 'link'));
  assert.deepEqual(M.links(score), [
    { type: 'tie', from: ref(0), to: ref(0, 1) },
    { type: 'tie', from: ref(0, 1), to: ref(1, 1) },
  ]);
  const saved = M.sanitize(JSON.parse(JSON.stringify(score)));
  assert.deepEqual(M.links(saved), M.links(score));
  const xml = M.toMusicXml(saved);
  assert.equal((xml.match(/<tie type="start"/g) || []).length, 2);
  assert.equal((xml.match(/<tie type="stop"/g) || []).length, 2);
  assert.ok(M.selectionActions(score, pair).includes('unlink'));
  assert.ok(M.applySelection(score, pair, 'unlink'));
  assert.equal(M.links(score).length, 1);
});

test('slurs within the lower staff persist when moving their measure', () => {
  const score = scoreWith([]);
  score.lower = { 0: [{ d: 'h', n: 25 }, { d: 'h', n: 27 }] };
  assert.ok(M.applySelection(score, [ref(0, 0, 1), ref(1, 0, 1)], 'link'));
  assert.equal(M.links(score)[0].type, 'slur');
  assert.match(M.toMusicXml(score), /<slur type="start"/);
  assert.ok(M.moveMeasure(score, 0, 2));
  assert.deepEqual(M.links(score), [{ type: 'slur', from: ref(0, 1, 1), to: ref(1, 1, 1) }]);
});

test('links reject rests, skipped notes, simultaneous notes, different voices and different staves', () => {
  const score = scoreWith([
    { d: 'q', n: 37, v: 1, at: 0 },
    { d: 'q', n: 25, v: 2, at: 0 },
    { d: 'q', n: 38, v: 1, at: 24 },
    { d: 'q', n: 26, v: 2, at: 24 },
    { d: 'q', rest: true, v: 1, at: 48 },
    { d: 'q', n: 39, v: 1, at: 72 },
  ]);
  score.lower = { 0: [{ d: 'q', n: 25 }] };
  assert.ok(M.applySelection(score, [ref(0), ref(2)], 'link'));
  assert.deepEqual(M.links(score), [{ type: 'slur', from: ref(0), to: ref(2) }]);
  for (const pair of [[ref(0), ref(5)], [ref(2), ref(4)], [ref(0), ref(1)], [ref(0), ref(3)], [ref(0), ref(0, 0, 1)]]) {
    assert.ok(!M.selectionActions(score, pair).includes('link'));
    assert.equal(M.applySelection(score, pair, 'link'), false);
  }
});
