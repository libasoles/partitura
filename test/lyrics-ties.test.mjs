import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreModel } from '../src/client/score-model.js';

const M = createScoreModel({ grandStaff: true, choir: true });

// Cuatro negras en el compas 0 y cuatro en el 1.
const twoMeasures = () => {
  const score = { ...M.emptyScore(), instrument: 'guitarra' };
  [0, 1].forEach((mi) => [0, 24, 48, 72].forEach((at) => M.insertNote(M.measures(score)[mi], { d: 'q', n: 30 }, at)));
  return score;
};
const texts = (score) => Object.entries(score.lyrics || {}).flatMap(([mi, list]) => list.map((l) => mi + ':' + l.at + ':' + l.text));
const syllables = (...list) => list.map((text) => ({ text }));

test('a note continuing a tie takes no syllable and is skipped when pasting', () => {
  const score = twoMeasures();
  M.measures(score)[0][2].tie = true; // la tercera se liga a la cuarta (at 72)
  assert.equal(M.setLyric(score, 0, 72, 'x'), false, 'the tied note');
  assert.ok(M.setLyric(score, 0, 48, 'a'), 'the note that starts the tie');
  assert.deepEqual(M.lyricSpots(score).map((s) => s.mi + ':' + s.at), ['0:0', '0:24', '0:48', '1:0', '1:24', '1:48', '1:72']);
  M.distributeLyrics(score, 0, 0, 0, syllables('a', 'b', 'c', 'd'));
  assert.deepEqual(texts(score), ['0:0:a', '0:24:b', '0:48:c', '1:0:d']);
});

test('a tie across a barline also blocks the first note of the next measure', () => {
  const score = twoMeasures();
  M.measures(score)[0][3].tie = true;
  assert.equal(M.setLyric(score, 1, 0, 'x'), false);
  assert.ok(M.setLyric(score, 1, 24, 'y'));
});

test('a slur between different pitches still takes a syllable on every note', () => {
  const score = twoMeasures();
  M.measures(score)[0][2].n = 31;
  M.measures(score)[0][2].slur = true;
  assert.ok(M.setLyric(score, 0, 72, 'x'));
});

test('a syllable already on a note that becomes tied is kept but neither drawn nor exported', () => {
  const score = twoMeasures();
  M.setLyric(score, 0, 72, 'hola');
  M.measures(score)[0][2].tie = true;
  assert.equal(score.lyrics[0].length, 1);
  assert.doesNotMatch(M.toMusicXml(score), /<text>hola<\/text>/);
  delete M.measures(score)[0][2].tie;
  assert.match(M.toMusicXml(score), /<text>hola<\/text>/);
});

test('a syllable moves to a free note of its staff, across measures', () => {
  const score = twoMeasures();
  M.setLyric(score, 0, 0, 'a');
  M.setLyric(score, 0, 24, 'b');
  assert.equal(M.moveLyric(score, 0, 0, 0, 24), false, 'occupied');
  assert.equal(M.moveLyric(score, 0, 0, 0, 12), false, 'no note there');
  assert.ok(M.moveLyric(score, 0, 0, 1, 48));
  assert.deepEqual(texts(score), ['0:24:b', '1:48:a']);
  M.measures(score)[0][2].tie = true;
  assert.equal(M.moveLyric(score, 0, 24, 0, 72), false, 'tied note');
  assert.equal(M.moveLyric(score, 0, 24, 0, 24), false, 'same place');
});

test('merging joins the texts with a space and the following syllables close the gap', () => {
  const score = twoMeasures();
  M.distributeLyrics(score, 0, 0, 0, syllables('Can', 'to', 'de', 'la', 'ma', 'ña'));
  assert.equal(M.applySelection(score, [{ mi: 0, i: 0 }, { mi: 0, i: 1 }], 'mergeLyrics'), true);
  assert.deepEqual(texts(score), ['0:0:Can to', '0:24:de', '0:48:la', '0:72:ma', '1:0:ña']);
});

test('merging three syllables, with a gap between them, closes every vacated place', () => {
  const score = twoMeasures();
  M.setLyric(score, 0, 0, 'a');
  M.setLyric(score, 0, 24, 'b');
  M.setLyric(score, 0, 72, 'c');
  M.setLyric(score, 1, 0, 'd');
  M.setLyric(score, 1, 48, 'e');
  const sel = [0, 1, 3].map((i) => ({ mi: 0, i }));
  assert.ok(M.selectionActions(score, sel).includes('mergeLyrics'));
  assert.ok(M.applySelection(score, sel, 'mergeLyrics'));
  assert.deepEqual(texts(score), ['0:0:a b c', '0:48:d', '1:0:e']);
});

test('merging needs two syllables and respects the length limit', () => {
  const score = twoMeasures();
  M.setLyric(score, 0, 0, 'a');
  const pair = [{ mi: 0, i: 0 }, { mi: 0, i: 1 }];
  assert.ok(!M.selectionActions(score, pair).includes('mergeLyrics'));
  M.setLyric(score, 0, 24, 'x'.repeat(M.MAX_LYRIC));
  assert.equal(M.applySelection(score, pair, 'mergeLyrics'), false);
  assert.equal(score.lyrics[0].length, 2, 'nothing changed');
});

test('merge skips tied notes when closing the gap', () => {
  const score = twoMeasures();
  M.measures(score)[0][2].tie = true;
  M.distributeLyrics(score, 0, 0, 0, syllables('a', 'b', 'c', 'd', 'e'));
  assert.ok(M.applySelection(score, [{ mi: 0, i: 0 }, { mi: 0, i: 1 }], 'mergeLyrics'));
  assert.deepEqual(texts(score), ['0:0:a b', '0:24:c', '0:48:d', '1:0:e']);
});
