import { test, expect } from '@playwright/test';

async function open(page, url) {
  await page.goto(url);
  await page.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
  await page.waitForFunction(() => window.scoreEditor && document.querySelector('.score-doc-tab-input'));
}

test('Pro: the menu lists 7 scores and a drawer holds them all, in folders moved by drag and drop', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page, '/es/#pro');
  await page.locator('#scoreTitle').fill('S1');
  for (let n = 2; n <= 9; n += 1) {
    await page.locator('#scoreNewTab').click();
    await page.locator('#scoreTitle').fill(`S${n}`);
  }

  await page.locator('#siteMenuToggle').click();
  await expect(page.locator('#menuScores [role=menuitem]:not(#menuScoresMore)')).toHaveCount(7);
  await page.locator('#menuScoresMore').click();
  const drawer = page.locator('.scores-drawer');
  await expect(drawer).toBeVisible();
  await expect(drawer.locator('.scores-drawer-score')).toHaveCount(9);

  // New folder: starts in rename mode.
  await drawer.getByRole('button', { name: 'Nueva carpeta' }).click();
  await page.keyboard.type('Coros');
  await page.keyboard.press('Enter');
  const folder = drawer.locator('.scores-drawer-folder');
  await expect(folder.locator('.scores-drawer-folder-toggle .scores-drawer-name')).toHaveText('Coros');

  await drawer.locator('.scores-drawer-score', { hasText: 'S2' }).dragTo(folder);
  await expect(folder.locator('.scores-drawer-score')).toHaveText(['S2']);
  await expect(drawer.locator('.scores-drawer-root .scores-drawer-score')).toHaveCount(8);

  // Back to the root, then the folder survives a reload with its score.
  await drawer.locator('.scores-drawer-score', { hasText: 'S2' }).dragTo(drawer.locator('.scores-drawer-root'));
  await expect(folder.locator('.scores-drawer-score')).toHaveCount(0);
  await drawer.locator('.scores-drawer-score', { hasText: 'S3' }).dragTo(folder);
  await page.waitForTimeout(500);
  await page.reload();
  await page.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
  await page.waitForFunction(() => window.scoreEditor && document.querySelector('.score-doc-tab-input'));
  await page.locator('#siteMenuToggle').click();
  await page.locator('#menuScoresMore').click();
  await expect(page.locator('.scores-drawer .scores-drawer-folder .scores-drawer-score')).toHaveText(['S3']);

  // Opening a score from the drawer closes it; deleting the folder keeps the scores.
  await page.locator('.scores-drawer-score', { hasText: 'S5' }).locator('.scores-drawer-open').click();
  await expect(drawer).toBeHidden();
  await expect(page.locator('#scoreTitle')).toHaveValue('S5');
  await page.locator('#siteMenuToggle').click();
  await page.locator('#menuScoresMore').click();
  await drawer.getByRole('button', { name: /Eliminar carpeta/ }).click();
  await expect(drawer.locator('.scores-drawer-folder')).toHaveCount(0);
  await expect(drawer.locator('.scores-drawer-score')).toHaveCount(9);
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  expect(errors).toEqual([]);
});
