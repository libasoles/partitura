import { test, expect } from '@playwright/test';
import M from '../src/client/score-model.js';

// Verovio antepone un g.mNum al primer compás de cada renglón salvo el primero: el botón de la
// armadura no debe depender de que g.staff sea el primer g hijo del compás.
test('every row with a key signature gets its own key button', async ({ page }) => {
  await page.addInitScript((score) => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [score] }));
  }, { ...M.emptyScore(), fifths: 2 });
  await page.goto('/es/');
  const withKey = page.locator('#scoreStage g.measure:has(> g.staff g.keySig)');
  await expect(withKey).not.toHaveCount(0);
  const rows = await withKey.count();
  expect(rows).toBeGreaterThan(1);
  await expect(page.locator('.score-key-trigger')).toHaveCount(rows);

  await page.locator('.score-key-trigger').nth(1).click();
  await expect(page.locator('#scoreClefPopup')).toBeVisible();
});
