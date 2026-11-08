import { test, expect } from '@playwright/test';

test('Pro: Ajustes > Voces duplicates the top voice a third below', async ({ page }) => {
  await page.goto('/es/#pro');
  await page.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
  await page.waitForFunction(() => window.scoreEditor && document.querySelector('.score-doc-tab-input'));
  await page.evaluate(() => {
    window.scoreEditor.score.rows[0][0] = [37, 40, 39, 38].map((n) => ({ d: 'q', n }));
    window.scoreEditor.render();
  });
  await page.locator('#scoreStage g.note').first().waitFor();
  await page.locator('#scoreSettingsToggle').click();
  await page.locator('[data-category="voices"] input[type=checkbox]').check();
  await page.locator('#scoreDuplicateVoice').click();
  await expect(page.locator('#scoreStage g.note')).toHaveCount(8);
  const pitches = await page.evaluate(() => window.scoreEditor.score.rows[0][0].filter((ev) => ev.v === 2).map((ev) => ev.n));
  expect(pitches).toEqual([35, 38, 37, 36]);
});

test('without #pro the duplicate voice button does not exist', async ({ page }) => {
  await page.goto('/es/');
  await page.waitForFunction(() => window.scoreEditor);
  await expect(page.locator('#scoreDuplicateVoice')).toHaveCount(0);
});
