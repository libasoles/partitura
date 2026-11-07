import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreModel } from '../src/client/score-model.js';

const M = createScoreModel({ grandStaff: true, choir: true });

const withNotes = (instrument, staff = 0) => {
  const score = { ...M.emptyScore(), instrument };
  const measure = M.measures(score, staff)[0];
  [0, 1, 2, 3].forEach((k) => M.insertNote(measure, { d: 'q', n: 30 }, k * 24));
  return score;
};

test('a syllable is stored per measure, staff and time, only on notes', () => {
  const score = withNotes('guitarra');
  assert.ok(M.setLyric(score, 0, 24, 'la'));
  assert.ok(M.setLyric(score, 0, 0, ' en-a '));
  assert.deepEqual(score.lyrics, { 0: [{ at: 0, text: 'en a' }, { at: 24, text: 'la' }] });
  assert.equal(M.setLyric(score, 0, 12, 'x'), false, 'no note there');
  assert.equal(M.setLyric(score, 0, 0, 'x'.repeat(M.MAX_LYRIC + 1)), false);
  assert.equal(M.setLyric(score, 0, 0, 'a', 1), false, 'one staff only');
  assert.ok(M.removeLyric(score, 0, 0));
  assert.ok(M.removeLyric(score, 0, 24));
  assert.equal(score.lyrics, undefined);
});

test('piano writes lyrics on the top staff only; voices on every visible staff', () => {
  const piano = withNotes('piano', 1);
  assert.equal(M.lyricStaves(piano), 1);
  assert.equal(M.setLyric(piano, 0, 0, 'a', 1), false);
  const choir = withNotes('voices', 2);
  choir.parts = 3;
  assert.equal(M.lyricStaves(choir), 3);
  assert.ok(M.setLyric(choir, 0, 0, 'a', 2));
  assert.deepEqual(choir.lyrics[0], [{ at: 0, text: 'a', s: 2 }]);
});

test('MusicXML writes every syllable as single, so no hyphens are drawn between notes', () => {
  const score = withNotes('guitarra');
  M.setLyric(score, 0, 0, 'glo');
  M.setLyric(score, 0, 24, 'ri');
  M.setLyric(score, 0, 48, 'a');
  M.setLyric(score, 0, 72, 'sí');
  const xml = M.toMusicXml(score);
  assert.deepEqual([...xml.matchAll(/<syllabic>(\w+)<\/syllabic><text>([^<]*)<\/text>/g)].map((m) => m[1] + ':' + m[2]), ['single:glo', 'single:ri', 'single:a', 'single:sí']);
});

test('a hyphen or a space inside a syllable is stored as a space and drawn as an elision tie', () => {
  const score = withNotes('guitarra');
  M.setLyric(score, 0, 0, 'me-a');
  M.setLyric(score, 0, 24, 'la  la');
  assert.deepEqual(score.lyrics[0].map((l) => l.text), ['me a', 'la la']);
  assert.ok(M.toMusicXml(score).includes('<text>me\u203fa</text>'));
  assert.equal(M.setLyric(score, 0, 48, '-'), false);
});

test('lyrics are escaped, reload from saved data and move with a measure split', () => {
  const score = withNotes('guitarra');
  M.setLyric(score, 0, 48, 'a&b');
  assert.match(M.toMusicXml(score), /<text>a&amp;b<\/text>/);
  assert.deepEqual(M.sanitize(JSON.parse(JSON.stringify(score))).lyrics, score.lyrics);
  assert.ok(M.setBarline(score, 0, 'double', 48));
  assert.deepEqual(score.lyrics, { 1: [{ at: 0, text: 'a&b' }] });
});

test('next spot walks the notes in reading order', () => {
  const score = withNotes('guitarra');
  assert.deepEqual(M.nextLyricSpot(score, 0, 0), { mi: 0, at: 24 });
  assert.deepEqual(M.nextLyricSpot(score, 0, 24, 0, true), { mi: 0, at: 0 });
  assert.equal(M.nextLyricSpot(score, 0, 0, 0, true), null);
});
