import { test, expect } from '@playwright/test';

test('V toggles intervals tool without Voces, and the sidebar button appears on its own', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [{
      instrument: 'piano', meter: '4/4', clef: 'treble', fifths: 0,
      rows: [[[
        { d: 'h', n: 35, v: 1, at: 0 },
        { d: 'h', n: 33, v: 2, at: 0 },
      ]]],
    }] }));
  });
  await page.goto('/es/');
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
  const button = page.locator('#scoreIntervals');
  await expect(button).toHaveCount(0);
  await page.keyboard.press('v');
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#scoreStage g.dir').first()).toBeVisible();
  await page.keyboard.press('v');
  await expect(button).toHaveCount(0);
});
