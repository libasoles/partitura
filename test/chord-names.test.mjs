import { test } from 'node:test';
import assert from 'node:assert/strict';
import M from '../src/client/score-model.js';
import { chordNames } from '../src/client/chord-names.js';
import { chordMarks } from '../src/client/score-intervals.js';

const note = (n, alter = 0) => ({ n, alter, midi: 12 * Math.floor(n / 7) + [0, 2, 4, 5, 7, 9, 11][n % 7] + alter });

test('chord names list every fit, root position first, with inversions as slash chords', () => {
  assert.deepEqual(chordNames([note(28), note(30), note(32)]), ['C']);
  assert.deepEqual(chordNames([note(30), note(32), note(35)]), ['C/E']);
  assert.deepEqual(chordNames([note(28), note(30), note(32), note(33)]), ['C6', 'Am7/C']);
  assert.deepEqual(chordNames([note(28), note(30, -1), note(32)]), ['Cm']);
  assert.deepEqual(chordNames([note(28), note(30)]), []);
  assert.deepEqual(chordNames([note(28), note(30), note(30)]), []);
});

test('a seventh chord without its fifth is still named', () => {
  assert.equal(chordNames([note(28), note(30), note(34, -1)])[0], 'C7');
});

test('chord marks need three simultaneous voices', () => {
  const measure = [
    { d: 'w', n: 32, at: 0, v: 1 },
    { d: 'w', n: 30, at: 0, v: 2 },
    { d: 'w', n: 28, at: 0, v: 3 },
  ];
  const score = M.emptyScore();
  score.rows[0][0] = measure;
  assert.deepEqual(chordMarks(M.sanitize(score), M).map((mark) => mark.names), [['C']]);
  const dyad = M.emptyScore();
  dyad.rows[0][0] = measure.slice(0, 2);
  assert.deepEqual(chordMarks(M.sanitize(dyad), M), []);
});
