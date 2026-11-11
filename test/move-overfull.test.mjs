import { test } from 'node:test';
import assert from 'node:assert/strict';
import M from '../src/client/score-model.js';

// Compás de 6/8 que ya se pasa de su duración (84 sobre 72): cambiar la altura de la última negra
// no debe reordenar las voces.
const bar = () => [
  { d: 'e', n: 37, v: 1, at: 0 }, { d: 'e', n: 35, v: 2, at: 0 },
  { d: 'q', n: 37, v: 1, at: 12 }, { d: 'q', n: 35, v: 2, at: 12 },
  { d: 'e', n: 36, v: 1, at: 36, acc: '#' }, { d: 'e', n: 34, v: 2, at: 36, acc: '#' },
  { d: 'e', n: 37, v: 1, at: 48 }, { d: 'e', n: 35, v: 2, at: 48 },
  { d: 'q', n: 37, v: 1, at: 60 }, { d: 'q', n: 35, v: 2, at: 60 },
];

test('moving the last quarter of an overfull bar keeps its slot and voice', () => {
  const score = { ...M.emptyScore(), meter: '6/8', fifths: 1 };
  score.rows[0][0] = bar();
  const measure = score.rows[0][0];
  const ev = measure[8];
  const others = measure.filter((o) => o !== ev);
  const moved = M.clone(ev);
  moved.n = 38;
  const spot = M.placement(others, moved, 60, score, 0, true);
  assert.equal(spot.at, 60);
  M.insertAt(others, moved, spot.at);
  assert.deepEqual(others.map((o) => [o.v, o.n, o.at]).sort((a, b) => a[0] - b[0] || a[2] - b[2]), [
    [1, 37, 0], [1, 37, 12], [1, 36, 36], [1, 37, 48], [1, 38, 60],
    [2, 35, 0], [2, 35, 12], [2, 34, 36], [2, 35, 48], [2, 35, 60],
  ]);
});
