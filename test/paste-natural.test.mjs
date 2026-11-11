import { test } from 'node:test';
import assert from 'node:assert/strict';
import M from '../src/client/score-model.js';

const paste = (fifths, acc) => {
  const source = M.emptyScore();
  source.fifths = 1;
  M.measures(source)[0].push({ d: 'q', n: 35, at: 0, acc });
  const fragment = JSON.parse(JSON.stringify(M.copySelection(source, [M.refOf(0, 0, 0)])));
  const target = M.emptyScore();
  target.fifths = fifths;
  const refs = M.pasteSelection(target, fragment, 0, { preserveSignatures: false });
  return M.measures(target)[0][refs[0].i];
};

test('a natural the destination does not need is dropped on paste', () => {
  assert.equal(paste(0, 'n').acc, undefined);
});

test('a sharp is kept on paste', () => {
  assert.equal(paste(0, '#').acc, '#');
});
