import { test, expect } from '@playwright/test';

for (const locale of ['es', 'en', 'pt']) {
  test(`${locale}: banner=hide hides the welcome banner without persisting the preference`, async ({ page, context }) => {
    // The head script must work before editor modules run, also on the mobile gate.
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto(`/${locale}/?banner=hide`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveClass(/banner-closed/);
    expect(await page.evaluate(() => ({ ...localStorage }))).toEqual({});
    expect((await context.cookies()).some((cookie) => cookie.name === 'banner-closed')).toBe(false);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.locator('.welcome-banner__body')).toBeHidden();
    await page.goto(`/${locale}/`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).not.toHaveClass(/banner-closed/);
    await expect(page.locator('.welcome-banner__body')).toBeVisible();
  });
}
