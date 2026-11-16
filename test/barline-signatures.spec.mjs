import { test, expect } from '@playwright/test';
import M from '../src/client/score-model.js';

async function openScore(page, barlines) {
  await page.addInitScript((score) => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [score] }));
  }, { ...M.emptyScore(), barlines, tools: { repeats: true } });
  await page.goto('/es/?banner=hide');
  await expect(page.locator('.score-barline-trigger').first()).toBeVisible();
}

test('the double bar tool replaces an existing simple bar without splitting the measure', async ({ page }) => {
  await openScore(page);
  const count = await page.evaluate(() => window.scoreEditor.score.rows.flat().length);
  await page.locator('#scoreBarlines [data-barline="double"]').click();
  await page.locator('.score-barline-trigger[data-measure="0"][data-side="end"]').click();
  await expect.poll(() => page.evaluate(() => window.scoreEditor.score.barlines?.[0])).toEqual({ double: true });
  expect(await page.evaluate(() => window.scoreEditor.score.rows.flat().length)).toBe(count);
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => page.evaluate(() => window.scoreEditor.score.barlines?.[0]?.double || false)).toBe(false);
});

test('a double bar offers a time signature change from the following measure', async ({ page }, testInfo) => {
  await openScore(page, { 0: { double: true } });
  await page.locator('.score-barline-trigger[data-measure="0"][data-side="end"]').click({ position: { x: 8, y: 120 } });
  const option = page.locator('#scoreClefPopup [data-meter="3/4"]');
  await expect(option).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('barline-meter-popup.png') });
  await option.click();
  await expect.poll(() => page.evaluate(() => window.scoreEditor.score.meters)).toEqual({ 1: '3/4' });
  expect(await page.evaluate(() => window.scoreEditor.score.meter || '4/4')).toBe('4/4');
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+z');
  await expect.poll(() => page.evaluate(() => window.scoreEditor.score.meters)).toBeUndefined();
});
