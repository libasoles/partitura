import { test } from 'node:test';
import assert from 'node:assert/strict';
import M from '../src/client/score-model.js';

const fragmentOf = () => {
  const source = M.emptyScore();
  M.measures(source)[0].push({ d: 'q', n: 35, at: 0 }, { d: 'e', n: 36, at: 24 });
  return JSON.parse(JSON.stringify(M.copySelection(source, [M.refOf(0, 0, 0), M.refOf(0, 0, 1)])));
};

test('pasting at a cursor time starts after the existing rests', () => {
  const target = M.emptyScore();
  M.measures(target)[0].push({ d: 'q', rest: true, at: 0 }, { d: 'e', rest: true, at: 24 });
  const refs = M.pasteSelection(target, fragmentOf(), 0, { at: 36 });
  assert.equal(refs.length, 2);
  const starts = M.onsets(M.measures(target)[0]);
  assert.deepEqual(refs.map((ref) => starts[ref.i]), [36, 60]);
});

test('pasting beyond the measure length is allowed and reported as a problem', () => {
  const target = Object.assign(M.emptyScore(), { meter: '2/4' });
  M.measures(target)[0].push({ d: 'h', n: 35, at: 0 });
  assert.ok(M.pasteSelection(target, fragmentOf(), 0, { at: 48, preserveSignatures: false }));
  assert.equal(M.problems(target).length, 1);
});
