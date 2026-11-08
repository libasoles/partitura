import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreModel } from '../src/client/score-model.js';
import { soundingNotes } from '../src/client/score-notes.js';

const G = createScoreModel({ grandStaff: true, choir: true });
const free = createScoreModel({ grandStaff: true }); // sitio sin Pro

function guitar(M = G) {
  const score = M.emptyScore();
  M.setInstrument(score, 'guitar');
  return score;
}

test('guitar has one staff by default and a Pro slider adds up to four, all in guitar clef', () => {
  const score = guitar();
  assert.equal(G.stavesOf(score), 1);
  assert.ok(G.setGuitarParts(score, 3));
  assert.equal(G.stavesOf(score), 3);
  assert.deepEqual([0, 1, 2].map((k) => G.clefOf(score, k)), ['guitar', 'guitar', 'guitar']);
  assert.ok(G.setGuitarParts(score, 1));
  assert.equal(G.stavesOf(score), 1);
  assert.equal(score.parts, undefined);
  assert.equal(G.setGuitarParts(score, 5), false);
});

test('without Pro the guitar keeps a single staff', () => {
  const score = guitar(free);
  score.parts = 3;
  assert.equal(free.stavesOf(score), 1);
});

test('one TAB column gathers the notes that start together in every staff', () => {
  const score = guitar();
  G.setGuitarParts(score, 2);
  score.rows[0][0] = [{ d: 'h', n: 37 }, { d: 'h', n: 39 }];
  score.lower = { 0: [{ d: 'h', n: 30 }, { d: 'h', n: 32 }] };
  G.sanitize(score);
  const attacks = G.attacks(score);
  assert.deepEqual(attacks.map((attack) => attack.key), ['0:0', '0:' + attacks[1].at]);
  assert.equal(attacks[0].midis.length, 2);
  assert.ok(attacks[0].midis[0] - attacks[0].midis[1] >= 12);
});

test('each staff is a voice of the legend and sounds on its own channel', () => {
  const score = guitar();
  G.setGuitarParts(score, 2);
  score.rows[0][0] = [{ d: 'w', n: 37 }];
  score.lower = { 0: [{ d: 'w', n: 30 }] };
  G.sanitize(score);
  assert.ok(G.voicePerStaff(score));
  const only2 = soundingNotes(score, G, new Set([2]));
  assert.deepEqual(only2.map((note) => note.channel), [1]);
  assert.equal(soundingNotes(score, G, null).length, 2);
});

test('hiding voices keeps the staff data', () => {
  const score = guitar();
  G.setGuitarParts(score, 2);
  score.lower = { 0: [{ d: 'w', n: 30 }] };
  G.setGuitarParts(score, 1);
  G.sanitize(score);
  G.setGuitarParts(score, 2);
  assert.equal(G.measures(score, 1)[0].length, 1);
});
