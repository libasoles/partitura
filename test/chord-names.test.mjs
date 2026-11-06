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

test('the chord of a column is picked from the harmony of the whole line', async () => {
  const { pickChords } = await import('../src/client/chord-context.js');
  const column = (names, pcs) => ({ names, pcs });
  const dm7 = column(['Dm7', 'F6/D'], [2, 5, 9, 0]);
  const g7 = column(['G7'], [7, 11, 2, 5]);
  const ambiguous = column(['C6', 'Am7/C'], [0, 4, 7, 9]);
  assert.equal(pickChords([dm7, g7, ambiguous])[2][0], 'C6');
  const am = column(['Am'], [9, 0, 4]);
  const e7 = column(['E7'], [4, 8, 11, 2]);
  assert.equal(pickChords([am, ambiguous, column(['Dm'], [2, 5, 9]), e7, am])[1][0], 'Am7/C');
  assert.deepEqual(pickChords([dm7, g7, ambiguous])[2], ['C6', 'Am7/C']);
});
