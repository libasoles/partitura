import { test } from 'node:test';
import assert from 'node:assert/strict';
import M from '../src/client/score-model.js';
import { intervalColumns, scoreKey, spellTonic, withIntervals } from '../src/client/score-intervals.js';

// C major triad over two bars ending on C: E G C and then the same.
const triad = (low) => [{ d: 'w', n: low + 4, at: 0, v: 1 }, { d: 'w', n: low + 2, at: 0, v: 2 }, { d: 'w', n: low, at: 0, v: 3 }];

test('tonic mode labels every note, the lowest included, as a degree of the tonic', () => {
  // C E G over a C tonic: V III I (highest first); the same chord against A (letter 5) is VII V III
  const measure = triad(28);
  assert.deepEqual(intervalColumns(measure, M, null, 0)[0].intervals, ['V', 'III', 'I']);
  assert.deepEqual(intervalColumns(measure, M, null, 5)[0].intervals, ['VII', 'V', 'III']);
  // octaves fold into the degree
  assert.deepEqual(intervalColumns([{ d: 'w', n: 35, at: 0 }, { d: 'w', n: 28, at: 0 }], M, null, 0)[0].intervals, ['I', 'I']);
});

test('the tonic is spelled the way the key signature would', () => {
  assert.equal(spellTonic(0, 'maj', 0), 'C');
  assert.equal(spellTonic(9, 'min', 0), 'Am');
  assert.equal(spellTonic(10, 'maj', -2), 'Bb');
  assert.equal(spellTonic(6, 'maj', 6), 'F#');
  assert.equal(spellTonic(6, 'maj', -6), 'Gb');
  assert.equal(spellTonic(1, 'min', 4), 'C#m');
  assert.equal(spellTonic(3, 'min', -6), 'Ebm');
});

test('the tonic is detected from the music and the user can fix it', () => {
  const score = M.emptyScore();
  score.rows[0][0] = [{ d: 'h', n: 28 }, { d: 'q', n: 30 }, { d: 'q', n: 32 }];
  score.rows[0][1] = [{ d: 'h', n: 32 }, { d: 'h', n: 28 }];
  const key = scoreKey(score, M);
  assert.equal(key.detectedName, 'C');
  assert.equal(key.detected, true);
  assert.equal(M.setTonic(score, 'A'), true);
  assert.equal(scoreKey(score, M).name, 'A');
  assert.equal(scoreKey(score, M).letter, 5);
  assert.equal(scoreKey(score, M).detected, false);
  assert.equal(scoreKey(score, M).detectedName, 'C');
});

test('tonic mode and a fixed tonic persist; invalid values are dropped', () => {
  const score = M.emptyScore();
  assert.equal(M.intervalModeOf(score), 'bass');
  assert.equal(M.setIntervalMode(score, 'tonic'), true);
  assert.equal(M.setTonic(score, 'F#m'), true);
  assert.equal(M.setTonic(score, 'H'), false);
  const saved = M.sanitize(JSON.parse(JSON.stringify(score)));
  assert.equal(M.intervalModeOf(saved), 'tonic');
  assert.equal(M.tonicOf(saved), 'F#m');
  assert.equal(M.tonicOf(M.sanitize({ ...score, tonic: 'nope' })), null);
  M.setTonic(score, null);
  assert.equal(score.tonic, undefined);
});

test('tonic mode engraves the degrees in the interval labels', () => {
  const score = M.emptyScore();
  score.rows[0][0] = triad(28);
  M.setIntervalMode(score, 'tonic');
  const xml = withIntervals(M.toMusicXml(M.sanitize(score)), M.sanitize(score), M);
  assert.match(xml, /PartituraIntervals[^>]*>V\nIII\nI</);
});
