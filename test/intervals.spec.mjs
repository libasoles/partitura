import { test, expect } from '@playwright/test';

test('interval toggle sits below voices and engraves stacked intervals on both staves', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [{
      instrument: 'piano', meter: '4/4', clef: 'treble', fifths: 0,
      tools: { intervals: true, voices: true, playback: true },
      rows: [[[
        { d: 'h', n: 35, v: 1, at: 0 },
        { d: 'q', n: 33, v: 2, at: 0 }, { d: 'q', n: 32, v: 2, at: 16 },
        { d: 'h', n: 28, v: 3, at: 0 },
      ]]], lower: { 0: [{ d: 'w', n: 21, v: 1, at: 0 }, { d: 'w', n: 25, v: 2, at: 0 }] },
    }] }));
  });
  await page.goto('/es/');
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
  const button = page.locator('#scoreIntervals');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  const voice = await page.locator('.score-voice-legend').boundingBox();
  const box = await button.boundingBox();
  expect(box.y).toBeGreaterThan(voice.y + voice.height);
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  const directions = page.locator('#scoreStage g.dir');
  await page.screenshot({ path: '/tmp/partitura-intervals.png', fullPage: true });
  await expect(directions).toHaveCount(3, { timeout: 5000 });
  expect(await directions.evaluateAll(nodes => nodes.map(node => node.textContent.replace(/\s/g, '')))).toEqual(['IIIVI', 'IVV', 'V']);
  const levels = await directions.first().locator('tspan.text').evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top));
  expect(new Set(levels).size).toBeGreaterThan(1);
  await page.screenshot({ path: '/tmp/partitura-intervals.png', fullPage: true });
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect(directions).toHaveCount(3);
  await button.click();
  await expect(directions).toHaveCount(0);
  await page.locator('#scoreSettingsToggle').click();
  await page.getByRole('checkbox', { name: 'Intervalos', exact: true }).uncheck();
  await expect(button).toHaveCount(0);
});
