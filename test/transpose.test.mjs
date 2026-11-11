import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreModel } from '../src/client/score-model.js';
import { soundingNotes } from '../src/client/score-notes.js';

const M = createScoreModel();

function score() {
  const s = M.emptyScore();
  s.rows[0][0] = [{ d: 'q', n: 35 }, { d: 'q', n: 37 }];
  return M.sanitize(s);
}

test('transposition shifts what sounds, not the notation', () => {
  const s = score();
  assert.equal(M.setTranspose(s, 3), true);
  assert.equal(M.transposeOf(s), 3);
  assert.deepEqual(soundingNotes(s, M).map((n) => n.midi), [63, 67]);
  assert.deepEqual(s.rows[0][0].map((e) => e.n), [35, 37]);
});

test('transposition is limited to an octave each way, 0 is not saved and it survives sanitize', () => {
  const s = score();
  assert.equal(M.setTranspose(s, 13), false);
  assert.equal(M.setTranspose(s, -12), true);
  assert.equal(M.sanitize(JSON.parse(JSON.stringify(s))).transpose, -12);
  assert.equal(M.setTranspose(s, 0), true);
  assert.equal('transpose' in s, false);
  assert.equal(M.transposeOf(M.sanitize({ ...s, transpose: 40 })), 0);
});

test('the displayed copy moves the notes without touching the score', () => {
  const s = score();
  M.setTranspose(s, 2);
  const shown = M.transposedForDisplay(s);
  assert.deepEqual(shown.rows[0][0].map((e) => e.n), [36, 38]);
  assert.deepEqual(s.rows[0][0].map((e) => e.n), [35, 37]);
  assert.equal(M.transposedForDisplay(M.sanitize(M.emptyScore())).transpose, undefined);
});

test('the displayed copy transposes the key signature too', () => {
  const s = score();
  s.fifths = 1; // G
  M.setTranspose(s, 2);
  assert.equal(M.transposedForDisplay(s).fifths, 3); // A
  M.setTranspose(s, -1);
  assert.equal(M.transposedForDisplay(s).fifths, -6); // G down a semitone: Gb (flats going down)
  assert.equal(s.fifths, 1);
});
