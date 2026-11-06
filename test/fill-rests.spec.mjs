import { test, expect } from '@playwright/test';
import M from '../src/client/score-model.js';

test('Shift+Tab completes the selected staff, supports undo, and Tab only fills empty measures', async ({ page }) => {
  const score = M.emptyScore();
  score.rows[0][0] = [{ d: 'q', n: 40, at: 0 }];
  await page.addInitScript(score => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [score] }));
  }, score);
  await page.goto('/es/');
  await expect(page.locator('[id="e0-0"]')).toBeVisible();
  const select = async (staff, mi = 0) => {
    const box = await page.locator(`[id="m${mi}"] > g.staff`).nth(staff).locator(':scope > path').last().boundingBox();
    await page.mouse.click(box.x + box.width * 0.85, box.y + box.height / 2);
  };
  const measure = () => page.evaluate(() => window.scoreEditor.score.rows[0][0]);
  await select(0);
  await page.keyboard.press('Tab');
  expect(await measure()).toEqual(score.rows[0][0]);
  await select(0);
  await page.keyboard.press('Shift+Tab');
  expect(await measure()).toEqual([...score.rows[0][0], { d: 'h', rest: true, at: 24, dot: true }]);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await measure()).toEqual(score.rows[0][0]);
  await select(1);
  await page.keyboard.press('Tab');
  expect(await page.evaluate(() => window.scoreEditor.score.lower[0])).toEqual([{ d: 'w', rest: true, at: 0 }]);
  expect(await measure()).toEqual(score.rows[0][0]);
});
