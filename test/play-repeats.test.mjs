import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreModel } from '../src/client/score-model.js';
import { expandRepeats, soundingNotes } from '../src/client/score-notes.js';

const M = createScoreModel({});
const bar = (count) => {
  const score = M.emptyScore();
  score.rows = [Array.from({ length: count }, (_, k) => [{ d: 'w', n: 30 + k, at: 0 }])];
  return score;
};

test('a closing repeat bar plays from the start again', () => {
  const score = bar(2);
  score.barlines = { 1: { end: true } };
  assert.deepEqual(M.playOrder(score), [0, 1, 0, 1]);
});

test('start repeat, first and second endings', () => {
  const score = bar(4);
  score.barlines = { 0: { start: true }, 1: { end: true } };
  M.setNavigation(score, 1, 'first');
  M.setNavigation(score, 2, 'second');
  assert.deepEqual(M.playOrder(score), [0, 1, 0, 2, 3]);
});

test('D.S. jumps once to the segno without taking repeats again', () => {
  const score = bar(3);
  M.setNavigation(score, 0, 'segno');
  M.setNavigation(score, 2, 'ds');
  score.barlines = { 0: { end: true } };
  assert.deepEqual(M.playOrder(score), [0, 0, 1, 2, 0, 1, 2]);
});

test('notes are copied into each pass, and a tie into the next measure stays one note', () => {
  const score = bar(2);
  score.rows[0][0][0].tie = true;
  score.rows[0][1][0].n = 30;
  score.barlines = { 1: { end: true } };
  const notes = expandRepeats(score, M, soundingNotes(score, M), M.playSlots(score));
  const w = M.capacity(score, 0);
  assert.deepEqual(notes.map((n) => [n.start, n.end]), [[0, 2 * w], [2 * w, 4 * w]]);
});

test('without repeats the notes are untouched', () => {
  const score = bar(2);
  const notes = soundingNotes(score, M);
  assert.equal(expandRepeats(score, M, notes, M.playSlots(score)), notes);
});
