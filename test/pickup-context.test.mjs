import { test } from 'node:test';
import assert from 'node:assert/strict';
import M from '../src/client/score-model.js';
import { xmlTimelines } from '../src/client/debug-timing.js';

// Anacrusa deducida del contexto: un compás corto, sin <forward>, solo cuando es el primero (o sigue a una doble
// barra) y después viene música. El hueco de un compás final queda atrás.
const q = (n, at) => ({ d: 'q', n, at });
const whole = [{ d: 'w', n: 37, at: 0 }];
const score = (...bars) => ({ meter: '4/4', clef: 'treble', fifths: 0, rows: [bars] });
const forwards = (s, mi) => xmlTimelines(M.toMusicXml(s))[mi].items.filter((item) => item.kind === 'forward');

test('el primer compás incompleto seguido de música es una anacrusa: dura lo escrito y no se rellena', () => {
  const s = score([q(37, 0)], whole);
  assert.equal(M.capacity(s, 0), 96); // la edición sigue viendo un 4/4
  assert.equal(M.pickupLength(s, 0), 24);
  assert.deepEqual(forwards(s, 0), []);
  assert.match(M.toMusicXml(s), /<measure number="1" id="m0" implicit="yes">/);
  assert.doesNotMatch(M.toMusicXml(s), /<measure number="2" id="m1" implicit/);
});

test('mientras es lo único escrito sigue siendo un compás completo (se puede seguir llenando)', () => {
  const s = score([q(37, 0)], []);
  assert.equal(M.pickupLength(s, 0), null);
  assert.deepEqual(forwards(s, 0).map((f) => [f.start, f.dur]), [[24, 72]]);
});

test('un primer compás completo no es anacrusa', () => {
  assert.equal(M.pickupLength(score(whole, whole), 0), null);
});

test('un compás intermedio incompleto no es anacrusa y su hueco queda atrás', () => {
  const s = score(whole, [q(37, 0)], whole);
  assert.equal(M.pickupLength(s, 1), null);
  assert.deepEqual(forwards(s, 1).map((f) => [f.start, f.dur]), [[24, 72]]);
});

test('el compás que completa la anacrusa, al final, rellena atrás', () => {
  const s = score([q(37, 0)], whole, [{ d: 'h', n: 37, at: 0 }, { d: 'q', n: 35, at: 48 }]);
  assert.equal(M.pickupLength(s, 2), null);
  assert.deepEqual(forwards(s, 2).map((f) => [f.start, f.dur]), [[72, 24]]);
});

test('después de una doble barra el compás incompleto con música detrás es una anacrusa', () => {
  const s = { ...score(whole, [q(37, 0)], whole), barlines: { 0: { double: true } } };
  assert.equal(M.pickupLength(s, 1), 24);
  assert.deepEqual(forwards(s, 1), []);
  assert.equal(M.pickupLength({ ...s, barlines: {} }, 1), null);
});

test('un compás corto declarado manda sobre la deducción', () => {
  const s = { ...score([q(37, 0)], whole), measureDurations: { 0: 48 } };
  assert.equal(M.pickupLength(s, 0), null);
  assert.equal(M.capacity(s, 0), 48);
});

test('la edición no cambia: la capacidad y el lugar de una figura siguen midiéndose con el compás completo', () => {
  const s = score([q(37, 0)], whole);
  const spot = M.placement(M.measures(s)[0], { d: 'q', n: 40 }, 72, s, 0);
  assert.equal(spot.at, 72); // todavía entra en el tiempo 4: se puede completar el compás
});
