import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import M from '../src/client/score-model.js';
import { indexChords, findChord, positionsOf } from '../src/client/chords.js';
import { chordsFileName, chordSearchFileName } from '../scripts/lib/chords-data.mjs';
const require = createRequire(import.meta.url);

const guitar = () => ({ ...M.emptyScore(), clef: 'guitar' });

test('a chord is stored by measure and time, one per time, sorted', () => {
  const score = guitar();
  assert.ok(M.setChord(score, 0, 48, 'G'));
  assert.ok(M.setChord(score, 0, 0, ' Am7 '));
  assert.ok(M.setChord(score, 0, 48, 'D'));
  assert.deepEqual(score.chords, { 0: [{ at: 0, name: 'Am7' }, { at: 48, name: 'D' }] });
  assert.equal(M.setChord(score, 0, 0, ''), false);
  assert.equal(M.setChord(score, 0, 96, 'C'), false, 'past the end of the measure');
  assert.equal(M.setChord(score, 99, 0, 'C'), false, 'no such measure');
  assert.ok(M.removeChord(score, 0, 0));
  assert.ok(M.removeChord(score, 0, 48));
  assert.equal(score.chords, undefined);
});

test('moving a chord keeps its name and variant and refuses an occupied or invalid target', () => {
  const score = guitar();
  M.setChord(score, 0, 0, 'C', 2);
  M.setChord(score, 0, 48, 'G');
  assert.equal(M.moveChord(score, 0, 0, 0, 48), false, 'target taken');
  assert.equal(M.moveChord(score, 0, 0, 0, 96), false, 'past the end');
  assert.equal(M.moveChord(score, 0, 24, 0, 12), false, 'no chord there');
  assert.deepEqual(score.chords[0], [{ at: 0, name: 'C', variant: 2 }, { at: 48, name: 'G' }]);
  assert.ok(M.moveChord(score, 0, 0, 0, 24));
  assert.deepEqual(score.chords[0], [{ at: 24, name: 'C', variant: 2 }, { at: 48, name: 'G' }]);
});

test('renaming keeps the variant only when the name is the same', () => {
  const score = guitar();
  M.setChord(score, 0, 0, 'C', 2);
  M.setChord(score, 0, 0, 'C');
  assert.equal(score.chords[0][0].variant, 2);
  M.setChord(score, 0, 0, 'G');
  assert.equal(score.chords[0][0].variant, undefined);
});

test('chords travel with their measure and an added chord makes the score a guitar one', () => {
  const score = M.emptyScore();
  M.setChord(score, 1, 0, 'F');
  assert.equal(M.instrumentOf(score), 'guitar');
  M.insertMeasure(score, 0);
  assert.deepEqual(Object.keys(score.chords), ['2']);
  M.removeMeasureAt(score, 0);
  assert.deepEqual(Object.keys(score.chords), ['1']);
  M.removeMeasureAt(score, 1);
  assert.equal(score.chords, undefined);
});

test('splitting a measure moves the later chords to the new measure', () => {
  const score = guitar();
  score.rows[0][0] = [{ d: 'h', n: 40, at: 0 }, { d: 'h', n: 42, at: 48 }];
  M.setChord(score, 0, 0, 'Em');
  M.setChord(score, 0, 48, 'B7');
  assert.ok(M.setBarline(score, 0, 'double', 48));
  assert.deepEqual(score.chords, { 0: [{ at: 0, name: 'Em' }], 1: [{ at: 0, name: 'B7' }] });
});

test('a shorter meter drops the chords that no longer fit', () => {
  const score = guitar();
  M.setChord(score, 0, 0, 'C');
  M.setChord(score, 0, 72, 'G');
  assert.ok(M.setMeter(score, '3/4'));
  assert.deepEqual(score.chords, { 0: [{ at: 0, name: 'C' }] });
});

test('sanitize keeps valid chords only', () => {
  const clean = M.sanitize({
    ...guitar(),
    chords: { 0: [{ at: 0, name: 'Am' }, { at: 0, name: 'dup' }, { at: -4, name: 'x' }, { at: 24, name: '' }, { at: 48, name: 'G', variant: 1 }, { at: 72, name: 'D', variant: 99 }], 40: [{ at: 0, name: 'Z' }] },
  });
  assert.deepEqual(clean.chords, { 0: [{ at: 0, name: 'Am' }, { at: 48, name: 'G', variant: 1 }, { at: 72, name: 'D' }] });
});

test('MusicXML writes each name in bold above the staff, before the figure of its time', () => {
  const score = guitar();
  score.rows[0][0] = [{ d: 'h', n: 40, at: 0 }, { d: 'h', n: 42, at: 48 }];
  M.setChord(score, 0, 0, 'A<m');
  M.setChord(score, 0, 48, 'G');
  const xml = M.toMusicXml(score);
  const words = [...xml.matchAll(/<words font-weight="bold"[^>]*>([^<]*)<\/words>/g)].map((match) => match[1]);
  assert.deepEqual(words, ['A&lt;m', 'G']);
  assert.ok(xml.indexOf('>G</words>') < xml.lastIndexOf('<note '), 'the second name comes before the second note');
});

test('the build publishes the guitar-chords dictionary and names are found by name or alias', () => {
  assert.match(chordsFileName(), /^chords-[0-9a-f]{10}\.json$/);
  const index = indexChords(require('guitar-chords').CHORDS);
  assert.equal(findChord(index, 'Am7').name, 'Am7');
  assert.equal(findChord(index, 'Bb').name, 'B♭');
  assert.equal(findChord(index, 'CM').name, 'C', 'by alias');
  assert.notEqual(findChord(index, 'Em7').name, findChord(index, 'Emaj7').name, 'm7 and maj7 are not the same chord');
  assert.equal(findChord(index, 'Qx'), null);
  assert.equal(findChord(index, '  '), null);
});

test('the build publishes guitar-chords search and names resolve through its normalization (solfege, any case)', async () => {
  const file = chordSearchFileName();
  assert.match(file, /^chord-search-[0-9a-f]{10}\.js$/);
  const { matchChords, normalize } = await import(new URL('../public/vendor/' + file, import.meta.url));
  const rows = require('guitar-chords').CHORDS;
  const index = indexChords(rows, normalize);
  assert.equal(findChord(index, 'Si').name, 'B');
  assert.equal(findChord(index, 'sol7').name, 'G7');
  assert.equal(findChord(index, 'c').name, 'C');
  assert.notEqual(findChord(index, 'Em7').name, findChord(index, 'Emaj7').name, 'the exact match still tells m7 from maj7');
  const names = matchChords('Si', rows).map((chord) => chord.name);
  assert.equal(names[0], 'B');
  assert.ok(!names.includes('Em(add9)'));
  assert.equal(matchChords('si', rows)[0].name, 'B', 'case does not matter');
});

test('a chord has its stored fingering, a movable barre one and the hand-picked alternates', () => {
  const index = indexChords(require('guitar-chords').CHORDS);
  const c = positionsOf(findChord(index, 'C'));
  assert.ok(c.length >= 2);
  assert.ok(c[1].barres.length === 1 && c[1].position > 1, 'the second one is a barre shape up the neck');
  assert.equal(positionsOf(findChord(index, 'E7')).length, 3, 'E7: stored, computed barre and one hand-picked alternate');
  assert.equal(positionsOf(findChord(index, 'Bdim7')).length, 3, 'dim7 has two movable shapes');
});
