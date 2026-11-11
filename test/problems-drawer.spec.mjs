import { test, expect } from '@playwright/test';
import M from '../src/client/score-model.js';

test('an overfull measure shows a red dot and lists it; fixing it removes it from the list', async ({ page }) => {
  const score = { ...M.emptyScore(), clef: 'treble', meter: '2/4' };
  score.rows[0][0] = [{ d: 'h', n: 38, v: 1, at: 0 }, { d: 'q', n: 38, v: 1, at: 48 }];
  await page.addInitScript(score => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [score] }));
  }, score);
  await page.goto('/es/');
  const dot = page.locator('#scoreProblemsDot');
  await expect(dot).toBeVisible();
  await dot.click();
  const items = page.locator('#scoreProblemsDrawer li button');
  await expect(items).toHaveCount(1);
  await expect(items.first()).toContainText('Compás 1');
  await expect(items.first().locator('svg.score-problems-sketch g.note')).toHaveCount(2);
  // Quitar la figura que sobra resuelve el problema solo.
  await page.locator('#scoreStage [id="e0-1"] .notehead').click();
  await page.keyboard.press('Delete');
  await expect(dot).toBeHidden();
  await expect(page.locator('#scoreProblemsDrawer')).toBeHidden();
});
