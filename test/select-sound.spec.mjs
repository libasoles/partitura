import { test, expect } from '@playwright/test';

async function open(page) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('selectFixture')) localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [{
      instrument: 'piano', meter: '4/4', clef: 'treble', fifths: 0, tempo: 120,
      rows: [[[{ d: 'q', n: 35 }, { d: 'q', rest: true }, { d: 'h', rest: true }]]],
    }] }));
    sessionStorage.setItem('selectFixture', '1');
    const NativeAudioContext = window.AudioContext;
    window.audioStarts = [];
    window.AudioContext = class extends NativeAudioContext {
      createBufferSource() {
        const source = super.createBufferSource();
        const start = source.start.bind(source);
        source.start = (...args) => { window.audioStarts.push(args); start(...args); };
        return source;
      }
    };
  });
  await page.goto('/es/');
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
}

test('selecting a single note sounds it, and selecting a rest does not', async ({ page }) => {
  await open(page);
  await page.locator('#scoreStage g.note').first().click();
  await expect.poll(() => page.evaluate(() => window.audioStarts.length)).toBeGreaterThan(0);
  const heard = await page.evaluate(() => window.audioStarts.length);
  await page.locator('#scoreStage g.rest').first().click();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.audioStarts.length)).toBe(heard);
});
