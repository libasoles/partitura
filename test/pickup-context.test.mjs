import { test } from 'node:test';
import assert from 'node:assert/strict';
import M from '../src/client/score-model.js';
import { xmlTimelines } from '../src/client/debug-timing.js';

// Anacrusa deducida del contexto (primer compás, o tras una doble barra, incompleto y con música detrás). El editor lo
// dibuja completo (forward detrás, para que Verovio no mueva las figuras); al exportar sale con un forward previo y nada detrás.
const q = (n, at) => ({ d: 'q', n, at });
const whole = [{ d: 'w', n: 37, at: 0 }];
const score = (...bars) => ({ meter: '4/4', clef: 'treble', fifths: 0, rows: [bars] });
const forwards = (s, mi) => xmlTimelines(M.toMusicXml(s))[mi].items.filter((item) => item.kind === 'forward');

test('el primer compás incompleto seguido de música es una anacrusa: en el editor sigue completo, con forward detrás', () => {
  const s = score([q(37, 0)], whole);
  assert.equal(M.capacity(s, 0), 96); // la edición sigue viendo un 4/4
  assert.equal(M.pickupLength(s, 0), 24);
  assert.deepEqual(forwards(s, 0).map((f) => [f.start, f.dur]), [[24, 72]]);
  assert.doesNotMatch(M.toMusicXml(s), /implicit/);
});

test('al exportar, la anacrusa sale como compás completo: un forward previo y nada detrás', () => {
  const s = score([q(37, 0)], whole);
  const xml = M.toMusicXml(s, { pickups: true });
  assert.deepEqual(xmlTimelines(xml)[0].items.filter((i) => i.kind === 'forward').map((f) => [f.start, f.dur]), [[0, 72]]);
  assert.doesNotMatch(xml, /implicit/);
  assert.equal(s.rows[0][0][0].at, 0); // el modelo no cambia
});

test('una negra en el pulso 3 es una anacrusa: en el editor forward previo y posterior, al exportar solo el previo', () => {
  const s = score([q(37, 48)], whole);
  assert.equal(M.pickupLength(s, 0), 72);
  assert.deepEqual(forwards(s, 0).map((f) => [f.start, f.dur]), [[0, 48], [72, 24]]);
  assert.deepEqual(xmlTimelines(M.toMusicXml(s, { pickups: true }))[0].items.filter((i) => i.kind === 'forward').map((f) => [f.start, f.dur]), [[0, 72]]);
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
  assert.deepEqual(xmlTimelines(M.toMusicXml(s, { pickups: true }))[1].items.filter((i) => i.kind === 'forward').map((f) => [f.start, f.dur]), [[0, 72]]);
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
