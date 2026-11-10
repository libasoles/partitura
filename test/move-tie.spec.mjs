import { test, expect } from '@playwright/test';
import M from '../src/client/score-model.js';

test('dragging both ends of a tie together keeps the tie', async ({ page }) => {
  const score = { ...M.emptyScore(), clef: 'guitar' };
  score.rows[0][0] = [{ d: 'h', n: 37, v: 1, at: 0 }, { d: 'h', n: 38, v: 1, at: 48, tie: true }];
  score.rows[0][1] = [{ d: 'h', n: 38, v: 1, at: 0 }, { d: 'h', n: 37, v: 1, at: 48 }];
  await page.addInitScript(score => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [score] }));
  }, score);
  await page.goto('/es/');
  await expect(page.locator('#scoreStage g.note')).toHaveCount(4);
  await page.evaluate(() => {
    const save = window.ScoreStore.save;
    window.ScoreStore.save = value => { window.lastSavedScore = structuredClone(value); save(value); };
  });
  const a = await page.locator('[id="e0-1"] .notehead').boundingBox();
  const b = await page.locator('[id="e1-0"] .notehead').boundingBox();
  await page.mouse.click(a.x + a.width / 2, a.y + a.height / 2);
  await page.keyboard.down('Shift');
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.keyboard.up('Shift');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width / 2, a.y - 30, { steps: 10 });
  await page.mouse.up();
  const rows = await page.evaluate(() => window.lastSavedScore.scores[0].rows[0]);
  expect(rows[0][1].n).toBeGreaterThan(38);
  expect(rows[0][1].tie).toBe(true);
  expect(rows[1][0].n).toBe(rows[0][1].n);
});
