import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreModel } from '../src/client/score-model.js';
import { expandRepeats, soundingNotes } from '../src/client/score-notes.js';

const M = createScoreModel();
const eighth = M.DIVISIONS / 2;
const fixture = (first) => {
  const score = M.emptyScore();
  score.meter = '6/8';
  score.rows = [[first, [{ d: 'q', n: 30 }]]];
  return score;
};
const timeline = (score) => expandRepeats(score, M, soundingNotes(score, M), M.playSlots(score));

for (const [name, first] of [
  ['sin relleno', [{ d: 'e', n: 30 }]],
  ['con silencios iniciales', [{ d: 'q', dot: true, rest: true }, { d: 's', rest: true }, { d: 'e', n: 30 }]],
]) {
  test(`anacrusa ${name}: suena la corchea y comienza el segundo compás`, () => {
    const score = fixture(first);
    assert.deepEqual(timeline(score).map(({ start, end }) => [start, end]), [[0, eighth], [eighth, eighth + M.DIVISIONS]]);
    assert.equal(M.playSlots(score)[0].end, eighth);
    assert.equal(M.capacity(score, 0), 3 * M.DIVISIONS);
  });
}

test('varias notas conservan los silencios intermedios y finales escritos', () => {
  const score = fixture([{ d: 'e', rest: true }, { d: 'e', n: 30 }, { d: 's', rest: true }, { d: 'e', n: 32 }, { d: 's', rest: true }]);
  assert.deepEqual(timeline(score).map(({ start, end }) => [start, end]), [[0, 12], [18, 30], [36, 60]]);
});

test('los compases incompletos posteriores conservan su duración normal', () => {
  const score = fixture([{ d: 'e', n: 30 }]);
  score.rows[0].push([{ d: 'e', n: 32 }]);
  assert.deepEqual(timeline(score).map(({ start }) => start), [0, 12, 84]);
});

test('un primer compás vacío o con solo silencios no se omite', () => {
  for (const first of [[], [{ d: 'q', rest: true }]]) {
    const score = fixture(first);
    assert.equal(timeline(score)[0].start, 72);
  }
});

test('una repetición vuelve a tocar la anacrusa sin relleno', () => {
  const score = fixture([{ d: 'q', rest: true }, { d: 'e', n: 30 }]);
  score.barlines = { 1: { end: true } };
  assert.deepEqual(timeline(score).map(({ start, end }) => [start, end]), [[0, 12], [84, 96], [12, 36], [96, 120]]);
});

test('la ligadura al segundo compás sigue siendo un solo sonido', () => {
  const score = fixture([{ d: 'e', n: 30, tie: true }]);
  assert.deepEqual(timeline(score).map(({ start, end }) => [start, end]), [[0, 36]]);
});

test('el cálculo considera las notas de ambos pentagramas', () => {
  const piano = createScoreModel({ grandStaff: true });
  const score = fixture([{ d: 'q', rest: true }, { d: 'e', n: 30 }]);
  score.lower = { 0: [{ d: 'q', n: 24 }] };
  const slots = piano.playSlots(score);
  assert.equal(slots[0].end, 36);
  assert.equal(slots[0].offset, undefined);
  // Filtrar una voz no cambia la duración de la anacrusa.
  assert.equal(expandRepeats(score, piano, soundingNotes(score, piano, new Set([1])), slots)[0].start, 24);
});

test('los compases excedidos no se recortan', () => {
  const score = fixture([{ d: 'w', n: 30 }]);
  assert.equal(M.playSlots(score)[0].end, 72);
  assert.equal(timeline(score)[0].end, 96);
});
