import { test, expect } from '@playwright/test';
import M from '../src/client/score-model.js';
import F from '../src/client/score-fingering.js';

test('adding a note to a fingered attack keeps the existing string and fret', () => {
  const opens = M.TUNINGS[0].opens;
  const pinned = [[1, 5]];
  const column = F.complete(opens, pinned, [64, 52]);
  expect(column[1]).toBe(5);
  expect(column.filter((fret) => fret !== null).length).toBe(2);
  expect(F.complete(opens, [[5, 0]], [40, 30])).toBeNull();
});
