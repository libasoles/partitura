import { test } from 'node:test';
import assert from 'node:assert/strict';
import M from '../src/client/score-model.js';

// `at` es el inicio real de la figura. Se respeta donde el usuario hizo clic; solo se mueve lo que choca (empuje hacia la
// derecha, absorbido por los huecos que haya mas adelante) y, si el compas se desborda, se cierran huecos hacia la izquierda.
const score = (...bar) => ({ meter: '4/4', clef: 'treble', fifths: 0, rows: [[bar]] });
const LIMIT = 96;

// Lo que hace el editor al hacer clic con una herramienta: `placement` pide el lugar e `insertNote` lo asienta.
function write(measure, ev, t) {
  const s = score(...[measure]);
  const spot = M.placement(measure, ev, t, s, 0);
  if (!spot) return null;
  M.insertNote(measure, { ...ev }, spot.at, LIMIT);
  return measure;
}
const at = (measure) => measure.map((ev) => ev.at);

test('1. una nota escrita en el centro de un compás vacío se queda donde se hizo clic', () => {
  const measure = [];
  write(measure, { d: 'q', n: 37 }, 48);
  assert.deepEqual(at(measure), [48]);
  assert.deepEqual(M.onsets(measure), [48]);
});

test('1. el clic se respeta exacto (cuadrícula de semicorchea), sin ajustar al pulso', () => {
  const measure = [];
  write(measure, { d: 'q', n: 37 }, 43);
  assert.deepEqual(at(measure), [42]);
});

test('1. una negra pedida tan a la derecha que no entra se corre a la izquierda, lo justo', () => {
  const measure = [];
  write(measure, { d: 'q', n: 37 }, 90);
  assert.deepEqual(at(measure), [72]);
});

test('3. una negra al final que no entra cierra el hueco de la izquierda: se corre ella, no la anterior', () => {
  const measure = [{ d: 'q', n: 40, at: 24 }];
  write(measure, { d: 'q', n: 37 }, 90);
  assert.deepEqual(measure.map((ev) => [ev.n, ev.at]).sort((a, b) => a[1] - b[1]), [[40, 24], [37, 72]]);
});

test('1. una nota a la izquierda no mueve a la central: el hueco entre ambas se conserva', () => {
  const measure = [];
  write(measure, { d: 'q', n: 37 }, 48);
  write(measure, { d: 'q', n: 35 }, 0);
  assert.deepEqual(measure.map((ev) => [ev.n, ev.at]).sort((a, b) => a[1] - b[1]), [[35, 0], [37, 48]]);
});

test('2. una nota que choca empuja a la de su derecha, que queda pegada a ella', () => {
  const measure = [{ d: 'q', n: 37, at: 48 }];
  write(measure, { d: 'h', dot: true, n: 35 }, 0); // 0–72 pisa a la negra de 48
  assert.deepEqual(measure.map((ev) => [ev.n, ev.at]).sort((a, b) => a[1] - b[1]), [[35, 0], [37, 72]]);
});

test('2. el hueco que hay más adelante absorbe el empuje: lo que sigue no se mueve', () => {
  const measure = [{ d: 'q', n: 37, at: 24 }, { d: 'q', n: 40, at: 72 }];
  write(measure, { d: 'h', n: 35 }, 0); // 0–48 empuja a la de 24 hasta 48; la de 72 ya tiene lugar
  assert.deepEqual(measure.map((ev) => [ev.n, ev.at]).sort((a, b) => a[1] - b[1]), [[35, 0], [37, 48], [40, 72]]);
});

test('2. las voces alineadas siguen alineadas cuando una es empujada', () => {
  const measure = [{ d: 'q', n: 40, v: 1, at: 48 }, { d: 'q', n: 35, v: 2, at: 48 }];
  M.settle(measure);
  write(measure, { d: 'h', dot: true, n: 42, v: 1 }, 0);
  const starts = measure.filter((ev) => ev.n !== 42).map((ev) => ev.at);
  assert.deepEqual(starts, [72, 72]);
});

test('3. si el compás se desborda se cierra el hueco de la izquierda, solo lo necesario', () => {
  const measure = [{ d: 'q', n: 37, at: 48 }];
  write(measure, { d: 'h', dot: true, n: 35 }, 24); // 24–96 pisa a la central, que iria a 96–120
  assert.deepEqual(measure.map((ev) => [ev.n, ev.at]).sort((a, b) => a[1] - b[1]), [[35, 0], [37, 72]]);
  assert.equal(M.measureLength(measure), 96);
});

test('3. un hueco a la izquierda se cierra solo en la medida en que hace falta', () => {
  // Contenido de 48 a 120 (24 de exceso) con 48 de hueco delante: se cierran 24 de los 48, no todo.
  const measure = [{ d: 'q', n: 37, at: 48 }, { d: 'h', n: 40, at: 72 }];
  M.settle(measure);
  M.closeGaps(measure, LIMIT);
  assert.equal(M.measureLength(measure), 96);
  assert.deepEqual(at(measure), [24, 48]);
});

test('3. sin huecos que cerrar el compás queda excedido, como hasta ahora', () => {
  const measure = [{ d: 'q', n: 37, at: 48 }];
  M.insertNote(measure, { d: 'w', n: 35 }, 0, LIMIT); // 0–96, y la central va a 96–120
  assert.deepEqual(measure.map((ev) => [ev.n, ev.at]).sort((a, b) => a[1] - b[1]), [[35, 0], [37, 96]]);
  assert.equal(M.measureLength(measure), 120);
});

test('un hueco donde suena otra voz no se cierra (no se desalinean las voces)', () => {
  const measure = [
    { d: 'h', n: 40, v: 1, at: 0 }, { d: 'q', n: 42, v: 1, at: 72 },
    { d: 'q', n: 35, v: 2, at: 24 }, { d: 'q', n: 33, v: 2, at: 72 },
  ];
  M.settle(measure);
  const before = structuredClone(measure);
  M.closeGaps(measure, 200); // cabe de sobra: no se toca nada
  assert.deepEqual(measure, before);
});

test('4. mismo inicio y misma altura: no pasa nada, con cualquier duración', () => {
  const measure = [{ d: 'q', n: 37, at: 48 }];
  assert.equal(M.placement(measure, { d: 'q', n: 37 }, 48, score(...[measure]), 0), null);
  assert.equal(M.placement(measure, { d: 'h', n: 37 }, 48, score(...[measure]), 0), null);
});

test('5. mismo inicio y otra altura: otra voz', () => {
  const measure = [{ d: 'q', n: 37, at: 48 }];
  write(measure, { d: 'h', n: 40 }, 48);
  assert.equal(M.voices(measure).length, 2);
  assert.deepEqual(at(measure), [48, 48]);
});

test('settle usado como callback de forEach (el indice llega como 2º argumento) no compacta nada', () => {
  const bars = [[{ d: 'q', n: 37, at: 48 }], [{ d: 'q', n: 37, at: 72 }]];
  bars.forEach(M.settle);
  assert.deepEqual(bars.map((bar) => bar[0].at), [48, 72]);
});

test('borrar una nota no corre las que siguen: el tiempo queda como estaba', () => {
  const measure = [{ d: 'q', n: 37, at: 0 }, { d: 'q', n: 35, at: 24 }, { d: 'q', n: 40, at: 48 }];
  measure.splice(1, 1);
  M.settle(measure);
  assert.deepEqual(at(measure), [0, 48]);
});

test('lo escrito se guarda y se recarga igual (sanitize respeta los huecos)', () => {
  const measure = [];
  write(measure, { d: 'q', n: 37 }, 48);
  const saved = M.sanitize(score(...measure));
  assert.deepEqual(M.onsets(saved.rows[0][0]), [48]);
});

test('clic a la izquierda de una nota con hueco libre: la nueva queda donde se hizo clic y la otra no se mueve', () => {
  const measure = [{ d: 'q', n: 37, at: 48 }];
  const placed = M.placeBefore(measure, { d: 'q', n: 39 }, 48, 39, { meter: '4/4' }, 0, 0, 10);
  const byPitch = Object.fromEntries(placed.measure.map((ev) => [ev.n, ev.at]));
  assert.equal(byPitch[37], 48);
  assert.ok(byPitch[39] < 24, `la nueva queda a la izquierda: ${byPitch[39]}`);
});

test('clic pegado a la nota: la nueva se acomoda en el hueco, sin empujarla', () => {
  const measure = [{ d: 'q', n: 37, at: 48 }];
  const placed = M.placeBefore(measure, { d: 'q', n: 39 }, 48, 39, { meter: '4/4' }, 0, 0, 44);
  assert.deepEqual(Object.fromEntries(placed.measure.map((ev) => [ev.n, ev.at])), { 37: 48, 39: 24 });
});

test('sin hueco antes de la columna se intercala: la columna pasa a ir después de la nueva', () => {
  const measure = [{ d: 'q', n: 37, at: 0 }, { d: 'q', n: 35, at: 24 }];
  const placed = M.placeBefore(measure, { d: 'q', n: 36 }, 24, 36, { meter: '4/4' }, 0, 0, 12);
  assert.deepEqual(placed.measure.map((ev) => [ev.n, ev.at]).sort((a, b) => a[1] - b[1]), [[37, 0], [36, 24], [35, 48]]);
});

test('antes de la primera columna con hueco delante, la nota queda donde se soltó', () => {
  const measure = [{ d: 'q', n: 37, at: 48 }];
  const placed = M.prependFigure(measure, { d: 'q', n: 39 }, 39, undefined, 10);
  const byPitch = Object.fromEntries(placed.measure.map((ev) => [ev.n, ev.at]));
  assert.equal(byPitch[37], 48);
  assert.ok(byPitch[39] < 24);
});
