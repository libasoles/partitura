import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreModel } from '../src/client/score-model.js';
import { soundingNotes } from '../src/client/score-notes.js';
import { choirColumns } from '../src/client/score-intervals.js';

const M = createScoreModel({ grandStaff: true, choir: true });
const free = createScoreModel({ grandStaff: true });

// Guitarra con tres voces: cada pentagrama tiene una redonda distinta.
function three() {
  const score = M.emptyScore();
  M.setInstrument(score, 'guitar');
  M.setGuitarParts(score, 3);
  score.rows[0][0] = [{ d: 'w', n: 40 }];
  score.lower = { 0: [{ d: 'w', n: 37 }] };
  score.lower2 = { 0: [{ d: 'w', n: 30 }] };
  return M.sanitize(score);
}

const pitches = (score, staff) => M.measures(score, staff)[0].map((ev) => ev.n);

test('joining two staves keeps both as separate voices of one staff and renumbers the rest', () => {
  const score = three();
  assert.ok(M.joinStaves(score, [1, 2]));
  assert.equal(M.stavesOf(score), 2);
  assert.deepEqual(pitches(score, 0), [40]);
  assert.deepEqual(pitches(score, 1), [37, 30]);
  assert.deepEqual(M.measures(score, 1)[0].map((ev) => ev.v), [1, 2]);
  assert.deepEqual(M.voices(M.measures(score, 1)[0]).map((voice) => voice.groups.length), [1, 1]);
  assert.deepEqual([0, 1].map((k) => M.legendOf(score, 1, k)), [2, 3]);
  assert.equal(M.legendOf(score, 0, 0), 1);
  assert.deepEqual(M.legendsOf(score, 1), [2, 3]);
});

test('the legend selects the joined voices on their own, in audio and in intervals', () => {
  const score = three();
  M.joinStaves(score, [1, 2]);
  const only3 = soundingNotes(score, M, new Set([3]));
  assert.equal(only3.length, 1);
  assert.equal(only3[0].midi, soundingNotes(score, M, null).sort((a, b) => a.midi - b.midi)[0].midi);
  assert.equal(choirColumns(score, 0, M, new Set([1])).length, 0);
  assert.equal(choirColumns(score, 0, M, new Set([1, 3])).length, 1);
});

test('separating the voices of a staff moves the chosen ones to a new staff below', () => {
  const score = three();
  M.joinStaves(score, [1, 2]);
  assert.ok(M.splitStaff(score, 1, [3]));
  assert.equal(M.stavesOf(score), 3);
  assert.deepEqual([0, 1, 2].map((staff) => pitches(score, staff)), [[40], [37], [30]]);
  assert.deepEqual([0, 1, 2].map((staff) => M.legendOf(score, staff, 0)), [1, 2, 3]);
});

test('a single guitar staff with two voices splits into two staves', () => {
  const score = M.emptyScore();
  M.setInstrument(score, 'guitar');
  score.rows[0][0] = [{ d: 'w', n: 40, v: 1 }, { d: 'w', n: 33, v: 2 }];
  M.sanitize(score);
  assert.deepEqual(M.legendsOf(score, 0), [1, 2]);
  assert.ok(M.splitStaff(score, 0, [2]));
  assert.equal(M.stavesOf(score), 2);
  assert.deepEqual([pitches(score, 0), pitches(score, 1)], [[40], [33]]);
  assert.ok(M.joinStaves(score, [0, 1]));
  assert.equal(M.stavesOf(score), 1);
  assert.deepEqual(pitches(score, 0).sort(), [33, 40]);
});

test('unrelated voices keep their order when only some staves are joined or split', () => {
  const score = three();
  assert.ok(M.joinStaves(score, [0, 2]));
  assert.deepEqual([pitches(score, 0), pitches(score, 1)], [[40, 30], [37]]);
  assert.deepEqual([0, 1].map((k) => M.legendOf(score, 0, k)), [1, 3]);
  assert.equal(M.legendOf(score, 1, 0), 2);
});

test('joined voices and their legend survive sanitization', () => {
  const score = three();
  M.joinStaves(score, [1, 2]);
  const saved = M.sanitize(JSON.parse(JSON.stringify(score)));
  assert.deepEqual(saved.voiceMap?.[1], [2, 3]);
  assert.equal(M.stavesOf(saved), 2);
  assert.deepEqual(pitches(saved, 1), [37, 30]);
});

test('the clefs and registers follow their staves', () => {
  const score = M.emptyScore();
  M.setInstrument(score, 'voices');
  M.setParts(score, 4);
  M.setRegister(score, 0, 'soprano');
  assert.ok(M.joinStaves(score, [0, 1]));
  assert.equal(M.stavesOf(score), 3);
  assert.deepEqual([0, 1, 2].map((staff) => M.registerOf(score, staff)), ['soprano', 'tenor', 'bass']);
});

test('refusals leave the score untouched', () => {
  const score = three();
  const before = JSON.stringify(score);
  assert.equal(M.joinStaves(score, [1]), false);
  assert.equal(M.splitStaff(score, 0, [1]), false);
  const unison = three();
  unison.lower2 = { 0: [{ d: 'w', n: 37 }] };
  const saved = JSON.stringify(unison);
  assert.equal(M.joinStaves(unison, [1, 2]), false);
  assert.equal(JSON.stringify(unison), saved);
  assert.equal(JSON.stringify(score), before);
  const choir = M.emptyScore();
  M.setInstrument(choir, 'voices');
  M.setParts(choir, 2);
  assert.equal(M.joinStaves(choir, [0, 1]), false);
  const plain = free.emptyScore();
  free.setInstrument(plain, 'guitar');
  assert.equal(free.joinStaves(plain, [0, 1]), false);
});

test('there is no room to separate beyond four staves', () => {
  const score = M.emptyScore();
  M.setInstrument(score, 'guitar');
  M.setGuitarParts(score, 4);
  score.rows[0][0] = [{ d: 'w', n: 40, v: 1 }, { d: 'w', n: 33, v: 2 }];
  assert.equal(M.splitStaff(score, 0, [2]), false);
});

test('splitting keeps the shared rests on both staves', () => {
  const score = M.emptyScore();
  M.setInstrument(score, 'guitar');
  score.rows[0][0] = [
    { d: 'h', rest: true, v: 1, at: 0 },
    { d: 'q', n: 40, v: 1, at: 2 }, { d: 'q', n: 33, v: 2, at: 2 },
    { d: 'q', n: 41, v: 1, at: 3 }, { d: 'q', n: 35, v: 2, at: 3 },
  ];
  M.sanitize(score);
  assert.ok(M.splitStaff(score, 0, [2]));
  assert.ok(M.measures(score, 0)[0].some((ev) => ev.rest && ev.at === 0));
  assert.ok(M.measures(score, 1)[0].some((ev) => ev.rest && ev.at === 0));
});
