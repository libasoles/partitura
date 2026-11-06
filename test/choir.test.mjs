import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreModel } from '../src/client/score-model.js';
import IO from '../src/client/score-io.js';
import { soundingNotes } from '../src/client/score-notes.js';

const C = createScoreModel({ grandStaff: true, choir: true });
const free = createScoreModel({ grandStaff: true }); // sitio sin Voces (sin #pro)

function choir() {
  const score = C.emptyScore();
  C.setInstrument(score, 'voices');
  score.rows[0][0] = [{ d: 'w', n: 37 }];
  score.lower = { 0: [{ d: 'w', n: 35 }] };
  score.lower2 = { 0: [{ d: 'w', n: 30 }] };
  score.lower3 = { 0: [{ d: 'w', n: 23 }] };
  return C.sanitize(score);
}

const count = (xml, tag) => (xml.match(new RegExp('<' + tag + '[ >]', 'g')) || []).length;

test('Voces starts with three staves, all in treble clef (tenor in treble 8), registers S A T', () => {
  const score = C.emptyScore();
  assert.ok(C.setInstrument(score, 'voices'));
  assert.equal(C.stavesOf(score), 3);
  assert.deepEqual([0, 1, 2].map((k) => C.registerOf(score, k)), ['soprano', 'alto', 'tenor']);
  assert.deepEqual([0, 1, 2].map((k) => C.clefOf(score, k)), ['treble', 'treble', 'guitar']);
});

test('the register decides the clef', () => {
  const score = C.emptyScore();
  C.setInstrument(score, 'voices');
  assert.ok(C.setRegister(score, 1, 'bass'));
  assert.equal(C.registerOf(score, 1), 'bass');
  assert.equal(C.clefOf(score, 1), 'bass');
  assert.equal(C.setRegister(score, 1, 'nope'), false);
  assert.equal(C.clefOf(score, 1), 'bass');
});

test('reducing the voices hides staves without deleting them, and they come back with their data', () => {
  const score = choir();
  assert.ok(C.setParts(score, 4));
  assert.equal(C.stavesOf(score), 4);
  assert.equal(count(C.toMusicXml(score), 'pitch'), 4);
  C.setParts(score, 2);
  assert.equal(C.stavesOf(score), 2);
  const xml = C.toMusicXml(score);
  assert.match(xml, /<staves>2<\/staves>/);
  assert.equal(count(xml, 'staff') >= 1, true);
  assert.ok(!xml.includes('id="p0-0"') && !xml.includes('id="q0-0"'));
  const kept = C.sanitize(JSON.parse(JSON.stringify(score)));
  assert.equal(kept.lower2[0][0].n, 30);
  assert.equal(kept.lower3[0][0].n, 23);
  C.setParts(kept, 4);
  const back = C.toMusicXml(kept);
  assert.match(back, /<staves>4<\/staves>/);
  assert.ok(back.includes('id="p0-0"') && back.includes('id="q0-0"'));
});

test('hidden staves are neither played nor exported to MIDI', () => {
  const score = choir();
  C.setParts(score, 4);
  assert.deepEqual([...new Set(soundingNotes(score, C).map((n) => n.channel))].sort(), [0, 1, 2, 3]);
  C.setParts(score, 2);
  assert.deepEqual([...new Set(soundingNotes(score, C).map((n) => n.channel))].sort(), [0, 1]);
  const bytes = IO.toMidi(score, C);
  const noteOns = [];
  for (let i = 22; i < bytes.length - 2; i += 1) if ((bytes[i] & 0xf0) === 0x90 && bytes[i + 2] === 80) noteOns.push(bytes[i] & 0x0f);
  assert.deepEqual([...new Set(noteOns)].sort(), [0, 1]);
});

test('measure operations move the hidden staves too', () => {
  const score = choir();
  C.setParts(score, 2);
  assert.ok(C.setBarline(score, 0, 'double', 48));
  assert.equal(score.lower3[0][0].d, 'h');
  assert.equal(score.lower3[1][0].d, 'h');
  assert.equal(score.lower2[1][0].n, 30);
});

test('without the pro flag the model keeps one staff and still preserves the voice data', () => {
  const score = choir();
  score.instrument = 'voices';
  const clean = free.sanitize(JSON.parse(JSON.stringify(score)));
  assert.equal(free.stavesOf(clean), 1);
  assert.equal(free.setInstrument(free.emptyScore(), 'voices'), false);
  assert.equal(clean.lower3[0][0].n, 23);
});

test('MIDI export of a choir uses the choir program on every visible staff', () => {
  const score = choir();
  const bytes = IO.toMidi(score, C);
  const programs = [];
  for (let i = 22; i < bytes.length - 2; i += 1) if ((bytes[i] & 0xf0) === 0xc0 && bytes[i + 1] === 52) programs.push(bytes[i] & 0x0f);
  assert.deepEqual(programs, [0, 1, 2]);
});
