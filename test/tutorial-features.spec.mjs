import { test, expect } from '@playwright/test';

test('the feature example toggles each voice color independently without hiding notes', async ({ page }, testInfo) => {
  await page.goto('/es/tutoriales/features/');
  const example = page.locator('[data-voice-example]');
  const first = example.locator('[data-example-voice="1"] .notehead').first();
  const second = example.locator('[data-example-voice="2"] .notehead').first();
  const color = node => node.evaluate(el => getComputedStyle(el).fill);
  const colors = [await color(first), await color(second)];
  expect(colors[0]).not.toBe(colors[1]);
  const count = await example.locator('g.note').count();
  await example.getByRole('button', { name: 'Voz 1', exact: true }).click();
  await expect(example.getByRole('button', { name: 'Voz 1', exact: true })).toHaveAttribute('aria-pressed', 'false');
  expect(await color(first)).not.toBe(colors[0]);
  expect(await color(second)).toBe(colors[1]);
  await example.getByRole('button', { name: 'Voz 2', exact: true }).click();
  expect(await color(first)).toBe(await color(second));
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  expect(await example.locator('g.note').count()).toBe(count);
  await example.getByRole('button', { name: 'Voz 1', exact: true }).click();
  expect(await color(first)).toBe(colors[0]);
  await page.screenshot({ path: testInfo.outputPath('features.png'), fullPage: true });
});

test('voice controls remain usable on narrow screens with the keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/es/tutoriales/features/');
  const button = page.getByRole('button', { name: 'Voz 1', exact: true });
  await button.focus();
  await page.keyboard.press('Space');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
