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
  await expect(page.locator('.score-doc-tab-close')).toHaveCount(1); // Pro can close even the last tab
  await page.locator('#scoreTitle').fill('Uno');
  await page.locator('#scoreNewTab').click();
  await page.locator('#scoreTitle').fill('Dos');
  await expect(page.locator('.score-doc-tab')).toHaveCount(2);
  await expect(page.locator('.score-doc-tab-close')).toHaveCount(2);

  // Close the active tab: the neighbour opens and the closed score stays stored.
  await page.locator('.score-doc-tab.is-active .score-doc-tab-close').click();
  await expect(page.locator('.score-doc-tab')).toHaveCount(1);
  await expect(page.locator('#scoreTitle')).toHaveValue('Uno');
  await expect(page.locator('.score-doc-tab-close')).toHaveCount(1);

  await page.locator('#siteMenuToggle').click();
  const items = page.locator('#menuScores [role=menuitem]:not(#menuScoresMore)');
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

  // Closing the last tab leaves only "+"; the menu reopens a score.
  await page.locator('.score-doc-tab.is-active .score-doc-tab-close').click();
  await expect(page.locator('.score-doc-tab')).toHaveCount(0);
  await expect(page.locator('#scoreNewTab')).toBeVisible();
  await expect(page.locator('#scoreStage')).toBeHidden();
  await page.locator('#siteMenuToggle').click();
  await page.locator('#menuScores [role=menuitem]:not(#menuScoresMore)').nth(1).click();
  await expect(page.locator('.score-doc-tab')).toHaveCount(1);
  await expect(page.locator('#scoreTitle')).toHaveValue('Dos');
  await expect(page.locator('#scoreStage')).toBeVisible();

  // Closed tabs survive a reload.
  await page.waitForTimeout(500);
  await page.reload();
  await page.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
  await page.waitForFunction(() => window.scoreEditor && document.querySelector('.score-doc-tab-input'));
  await expect(page.locator('.score-doc-tab')).toHaveCount(1);
  await page.locator('#siteMenuToggle').click();
  await expect(page.locator('#menuScores [role=menuitem]:not(#menuScoresMore)')).toHaveText(['Uno', 'Dos']);
  expect(errors).toEqual([]);
});

test('without #pro only the demo tab has a close button, and closing it removes it', async ({ page }) => {
  await page.goto('/es/demos/canto-en-la-rama/');
  await page.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
  await page.waitForFunction(() => window.scoreEditor && document.querySelector('.score-doc-tab-input'));
  await page.locator('#scoreNewTab').click();
  await expect(page.locator('.score-doc-tab')).toHaveCount(3);
  await expect(page.locator('.score-doc-tab-close')).toHaveCount(1);
  await expect(page.locator('.score-doc-tab.has-close')).toHaveCount(1);
  await page.locator('.score-doc-tab.has-close .score-doc-tab-close').click();
  await expect(page.locator('.score-doc-tab-close')).toHaveCount(0);
});

test('Pro: a demo URL with ?score= opens that score, not the demo, after a reload', async ({ page }) => {
  await open(page, '/es/demos/canto-en-la-rama/#pro');
  await page.locator('#scoreNewTab').click();
  await page.locator('#scoreTitle').fill('Mi obra');
  await expect.poll(() => new URL(page.url()).searchParams.get('score')).toBeTruthy();
  await page.waitForTimeout(600); // the debounced write to IndexedDB
  await page.reload();
  await page.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
  await page.waitForTimeout(500); // restoreDemo runs once the editor is ready
  await expect(page.locator('#scoreTitle')).toHaveValue('Mi obra');
});
