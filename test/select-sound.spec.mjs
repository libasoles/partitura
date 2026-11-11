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

test('Space sounds the selected notes', async ({ page }) => {
  const heard = () => page.evaluate(() => window.audioStarts.length);
  await open(page);
  await page.locator('[id="e0-0"] .notehead').click();
  await expect.poll(heard, { intervals: [200] }).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  const before = await heard();
  await page.keyboard.press('Space');
  await expect.poll(heard, { intervals: [200] }).toBeGreaterThan(before);
});

test('selecting a single note sounds it, and selecting a rest does not', async ({ page }) => {
  const heard = () => page.evaluate(() => window.audioStarts.length);
  await open(page);
  await page.locator('[id="e0-0"] .notehead').click();
  await expect.poll(heard, { intervals: [200] }).toBeGreaterThan(0);
  const before = await heard();
  await page.locator('[id="e0-1"]').first().click({ force: true, timeout: 5000 });
  await page.waitForTimeout(700);
  expect(await heard()).toBe(before);
});

test('moving a selected note with the arrow keys sounds it at its new pitch', async ({ page }) => {
  const heard = () => page.evaluate(() => window.audioStarts.length);
  await open(page);
  await page.locator('[id="e0-0"] .notehead').click();
  await expect.poll(heard, { intervals: [200] }).toBeGreaterThan(0);
  await page.waitForTimeout(1800);
  const before = await heard();
  await page.keyboard.press('ArrowUp');
  await expect.poll(heard, { intervals: [200] }).toBeGreaterThan(before);
});

test('dropping a dragged single note sounds it at its new pitch', async ({ page }) => {
  const heard = () => page.evaluate(() => window.audioStarts.length);
  await open(page);
  const head = page.locator('[id="e0-0"] .notehead');
  await head.click();
  await expect.poll(heard, { intervals: [200] }).toBeGreaterThan(0);
  await page.waitForTimeout(1800);
  const before = await heard();
  const box = await head.boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 20, { steps: 5 });
  await page.mouse.up();
  await expect.poll(heard, { intervals: [200] }).toBeGreaterThan(before);
});
