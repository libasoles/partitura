import { test, expect } from '@playwright/test';

async function open(page, url) {
  await page.goto(url);
  await page.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
  await page.waitForFunction(() => window.scoreEditor && document.querySelector('.score-doc-tab-input'));
}

test('without #pro there are no close buttons and no scores section in the menu', async ({ page }) => {
  await open(page, '/es/');
  await page.locator('#scoreNewTab').click();
  await expect(page.locator('.score-doc-tab')).toHaveCount(2);
  await expect(page.locator('.score-doc-tab-close')).toHaveCount(0);
  await page.locator('#siteMenuToggle').click();
  await expect(page.locator('#menuScoresSection')).toBeHidden();
});

test('Pro: closing a tab keeps the score, and the menu lists and reopens it', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await open(page, '/es/#pro');
  await expect(page.locator('.score-doc-tab-close')).toHaveCount(0); // a single tab cannot be closed
  await page.locator('#scoreTitle').fill('Uno');
  await page.locator('#scoreNewTab').click();
  await page.locator('#scoreTitle').fill('Dos');
  await expect(page.locator('.score-doc-tab')).toHaveCount(2);
  await expect(page.locator('.score-doc-tab-close')).toHaveCount(2);

  // Close the active tab: the neighbour opens and the closed score stays stored.
  await page.locator('.score-doc-tab.is-active .score-doc-tab-close').click();
  await expect(page.locator('.score-doc-tab')).toHaveCount(1);
  await expect(page.locator('#scoreTitle')).toHaveValue('Uno');
  await expect(page.locator('.score-doc-tab-close')).toHaveCount(0);

  await page.locator('#siteMenuToggle').click();
  const items = page.locator('#menuScores [role=menuitem]');
  await expect(page.locator('#menuScoresSection')).toBeVisible();
  await expect(items).toHaveText(['Uno', 'Dos']);
  const box = await page.locator('#siteMenuList').boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(272);

  await items.nth(1).click();
  await expect(page.locator('#siteMenuList')).toBeHidden();
  await expect(page.locator('.score-doc-tab')).toHaveCount(2);
  await expect(page.locator('#scoreTitle')).toHaveValue('Dos');

  // Closing an inactive tab leaves the active score alone.
  await page.locator('.score-doc-tab:not(.is-active) .score-doc-tab-close').click();
  await expect(page.locator('.score-doc-tab')).toHaveCount(1);
  await expect(page.locator('#scoreTitle')).toHaveValue('Dos');

  // Closed tabs survive a reload.
  await page.waitForTimeout(500);
  await page.reload();
  await page.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
  await page.waitForFunction(() => window.scoreEditor && document.querySelector('.score-doc-tab-input'));
  await expect(page.locator('.score-doc-tab')).toHaveCount(1);
  await page.locator('#siteMenuToggle').click();
  await expect(page.locator('#menuScores [role=menuitem]')).toHaveText(['Uno', 'Dos']);
  expect(errors).toEqual([]);
});
