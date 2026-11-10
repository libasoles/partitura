import { test, expect } from '@playwright/test';
import M from '../src/client/score-model.js';

test('dragging a quarter into a bar with room for an eighth splits it across the barline with a tie', async ({ page }) => {
  const score = { ...M.emptyScore(), clef: 'guitar' };
  score.rows[0][0] = [
    { d: 'q', n: 37, v: 1, at: 0 }, { d: 'q', n: 37, v: 1, at: 24 }, { d: 'q', n: 37, v: 1, at: 48 }, { d: 'e', n: 37, v: 1, at: 72 },
  ];
  score.rows[0][1] = [{ d: 'q', n: 38, v: 1, at: 0 }];
  await page.addInitScript(score => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [score] }));
  }, score);
  await page.goto('/es/');
  await expect(page.locator('#scoreStage g.note')).toHaveCount(5);
  await page.evaluate(() => {
    const save = window.ScoreStore.save;
    window.ScoreStore.save = value => { window.lastSavedScore = structuredClone(value); save(value); };
  });
  const last = await page.locator('[id="e0-3"] .notehead').boundingBox();
  const a = await page.locator('[id="e1-0"] .notehead').boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width + 40, a.y + a.height / 2, { steps: 10 });
  await page.mouse.up();
  const rows = await page.evaluate(() => window.lastSavedScore.scores[0].rows[0]);
  expect(rows[0].map(e => e.d)).toEqual(['q', 'q', 'q', 'e', 'e']);
  expect(rows[0][4].tie).toBe(true);
  expect(rows[1].map(e => e.d)).toEqual(['e']);
  expect(rows[1][0].tie).toBeUndefined();
});
