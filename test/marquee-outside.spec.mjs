import { test, expect } from '@playwright/test';
import M from '../src/client/score-model.js';

test('a drag that starts outside the score still draws the selection box', async ({ page }) => {
  const score = { ...M.emptyScore(), clef: 'guitar' };
  score.rows[0][0] = [
    { d: 'q', n: 28, v: 1, at: 0 },
    { d: 'q', n: 33, v: 1, at: 48 },
  ];
  await page.addInitScript(score => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [score] }));
  }, score);
  await page.goto('/es/');
  const notes = page.locator('#scoreStage g.note');
  await expect(notes).toHaveCount(2);
  const stage = await page.locator('#scoreStage').boundingBox();
  const last = await page.locator('[id="e0-1"] .notehead').boundingBox();
  // Starts in the neutral gap left of the stage, well away from the staff.
  await page.mouse.move(stage.x - 6, stage.y + 4);
  await page.mouse.down();
  await page.mouse.move(last.x + last.width + 20, last.y + last.height + 20, { steps: 10 });
  await expect(page.locator('.score-marquee')).toHaveCount(1);
  await page.mouse.up();
  await expect(page.locator('.score-marquee')).toHaveCount(0);
  expect(await page.evaluate(() => String(getSelection()))).toBe('');
});
