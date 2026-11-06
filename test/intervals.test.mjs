import { test } from 'node:test';
import assert from 'node:assert/strict';
import M from '../src/client/score-model.js';
import { intervalColumns } from '../src/client/score-intervals.js';

test('intervals include sustained notes, exclude ended notes and rests, and preserve compound intervals', () => {
  const columns = intervalColumns([
    { d: 'h', n: 35, at: 0, v: 1 },
    { d: 'q', n: 33, at: 0, v: 2 }, { d: 'q', n: 32, at: 16, v: 2 },
    { d: 'h', n: 28, at: 0, v: 3 },
    { d: 'q', rest: true, at: 32, v: 1 }, { d: 'q', n: 25, at: 32, v: 2 },
  ], M);
  assert.deepEqual(columns.map(c => c.intervals), [['III', 'VI'], ['IV', 'V']]);
  assert.deepEqual(intervalColumns([{ d: 'w', n: 35, at: 0 }, { d: 'w', n: 26, at: 0 }], M)[0].intervals, ['X']);
});

test('piano intervals bridge unselected voices without changing note indices or onsets', () => {
  const measure = [
    { d: 'w', n: 39, at: 0, v: 1 },
    { d: 'q', n: 37, at: 0, v: 2 }, { d: 'q', n: 38, at: 24, v: 2 },
    { d: 'w', n: 35, at: 0, v: 3 },
  ];
  assert.deepEqual(intervalColumns(measure, M, new Set([1, 3])), [{ at: 0, indices: [0, 3], intervals: ['V'] }]);
  assert.deepEqual(intervalColumns(measure, M, new Set([1])), []);
  assert.deepEqual(intervalColumns(measure, M, new Set()), []);
});
