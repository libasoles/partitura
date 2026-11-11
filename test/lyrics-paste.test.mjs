import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hyphenateWord, splitIntoWords } from 'el-silbador';
import { createScoreModel } from '../src/client/score-model.js';
import { lyricSyllables } from '../src/client/lyrics-text.js';
import { syllabifyFileName } from '../scripts/lib/syllabify-data.mjs';

const M = createScoreModel({ grandStaff: true, choir: true });
const lib = { hyphenateWord, splitIntoWords };

test('a pasted lyric is split into syllables, hyphenating inside words only', () => {
  const syllables = lyricSyllables('Camino, amor\nYpacaraí', lib);
  assert.deepEqual(syllables.map((s) => s.text), ['Ca', 'mi', 'no,', 'a', 'mor', 'Y', 'pa', 'ca', 'ra', 'í']);
});

test('hyphens already typed join the syllables into one tied syllable and dashes alone are ignored', () => {
  const syllables = lyricSyllables('can-tan-do-en la - no-che', lib);
  assert.deepEqual(syllables.map((s) => s.text), ['can tan do en', 'la', 'no che']);
  assert.deepEqual(lyricSyllables('Sa le can tan do-en la', lib).map((s) => s.text), ['Sa', 'le', 'can', 'tan', 'do en', 'la']);
});

test('without the syllabifier each word is one syllable', () => {
  assert.deepEqual(lyricSyllables('la casa').map((s) => s.text), ['la', 'casa']);
});

const scoreWith = (measures) => {
  const score = { ...M.emptyScore(), instrument: 'guitarra' };
  for (let mi = 0; mi < measures; mi += 1) [0, 1, 2, 3].forEach((k) => M.insertNote(M.measures(score)[mi], { d: 'q', n: 30 }, k * 24));
  return score;
};

test('lyrics are distributed note by note across measures from the chosen note', () => {
  const score = scoreWith(5);
  const syllables = lyricSyllables('Camino de la noche ' .repeat(2), lib);
  const result = M.distributeLyrics(score, 0, 24, 0, syllables);
  assert.equal(result.left, 0);
  assert.equal(result.placed, syllables.length);
  assert.equal(score.lyrics[0].length, 3, 'measure 0 from its second note');
  assert.equal(score.lyrics[0][0].at, 24);
  assert.equal(score.lyrics[1].length, 4);
  assert.ok(score.lyrics[2]);
});

test('syllables beyond the last note are reported, and rests and other staves are respected', () => {
  const score = scoreWith(1);
  const syllables = lyricSyllables('uno dos tres cuatro cinco seis', lib);
  assert.deepEqual(M.distributeLyrics(score, 0, 0, 0, syllables), { placed: 4, left: 5 });
  assert.equal(M.distributeLyrics(score, 0, 12, 0, syllables), null, 'not a note');
  assert.equal(M.distributeLyrics(score, 0, 0, 1, syllables), null, 'one staff only');
});

test('the build publishes the syllabifier under a hashed name', () => {
  assert.match(syllabifyFileName(), /^syllabify-[0-9a-f]{10}\.js$/);
});
