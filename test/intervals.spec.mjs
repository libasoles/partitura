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
  await expect(button).toHaveAttribute('data-tooltip', 'Intervalos entre voces');
  const toolbarPosition = () => page.evaluate(() => ({
    left: parseFloat(document.querySelector('#scoreIntervals').style.top),
    right: parseFloat(document.querySelector('.score-side').style.marginTop),
  }));
  const before = await toolbarPosition();
  for (const voice of [1, 2, 3]) await page.locator(`.score-voice-legend button[data-voice="${voice}"]`).click();
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  expect(await toolbarPosition()).toEqual(before);
  const directions = page.locator('#scoreStage g.dir');
  await page.screenshot({ path: '/tmp/partitura-intervals.png', fullPage: true });
  await expect(directions).toHaveCount(3, { timeout: 5000 });
  await expect(directions.first().locator('tspan[font-size]').first()).toHaveAttribute('font-size', '243px');
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

test('interval toggle explains that it needs simultaneous voices when there are none', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [{
      instrument: 'piano', meter: '4/4', clef: 'treble', fifths: 0,
      tools: { intervals: true, voices: true },
      rows: [[[{ d: 'h', n: 35, at: 0 }, { d: 'h', n: 33, at: 32 }]]],
    }] }));
  });
  await page.goto('/es/');
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
  const button = page.locator('#scoreIntervals');
  await button.click();
  await expect(page.locator('.toast-description')).toContainText('dos o más voces');
  await expect(button).toHaveAttribute('aria-pressed', 'false');
});

test('choir intervals follow the selected staves and depend on the Voices tool', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [{
      instrument: 'voices', parts: 3, meter: '4/4', clef: 'treble', fifths: 0,
      tools: { intervals: true, voices: true },
      rows: [[[{ d: 'w', n: 39 }]]],
      lower: { 0: [{ d: 'w', n: 37 }] },
      lower2: { 0: [{ d: 'w', n: 35 }] },
    }] }));
  });
  await page.goto('/es/#pro');
  await page.locator('#scoreStage:not([aria-busy]) g.note').first().waitFor();
  const legend = page.locator('.score-voice-legend button');
  for (const voice of [0, 1, 2]) await legend.nth(voice).click();
  await page.locator('#scoreIntervals').click();
  const directions = page.locator('#scoreStage g.dir');
  await expect(directions).toHaveText([/III\s*III/]);
  await legend.nth(1).click();
  await expect(directions).toHaveText(['V']);
  await legend.nth(0).click();
  await expect(directions).toHaveCount(0);
  await legend.nth(0).click();
  await expect(directions).toHaveText(['V']);
  await page.locator('#scoreSettingsToggle').click();
  await page.getByRole('checkbox', { name: 'Identificador de voces', exact: true }).uncheck();
  await expect(page.locator('#scoreIntervals')).toHaveCount(0);
  await expect(directions).toHaveCount(0);
});
