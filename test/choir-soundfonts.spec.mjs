import { test, expect } from '@playwright/test';
import { ARCHIVE_CHOIRS } from '../src/client/choir-sounds.js';

test('all 28 choir fonts load on demand and can be auditioned from settings', async ({ page }) => {
  test.setTimeout(120_000);
  const requests = [], errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => { if (request.url().includes('/audio/')) requests.push(request.url()); });
  await page.addInitScript(() => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [{
      instrument: 'voices', parts: 2, meter: '4/4', clef: 'treble', fifths: 0,
      rows: [[[{ d: 'w', n: 35 }]]], lower: { 0: [{ d: 'w', n: 28 }] }, tools: { playback: true },
    }] }));
    const NativeAudioContext = window.AudioContext;
    window.fontStarts = [];
    window.AudioContext = class extends NativeAudioContext {
      createBufferSource() {
        const source = super.createBufferSource(), start = source.start.bind(source);
        source.start = (...args) => {
          window.fontStarts.push({ loop: source.loop, rate: source.playbackRate.value, duration: source.buffer.duration });
          start(...args);
        };
        return source;
      }
    };
  });
  await page.goto('/es/#pro');
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
  await page.locator('#scoreSettingsToggle').click();
  for (const { name } of ARCHIVE_CHOIRS) await expect(page.getByRole('radio', { name, exact: true })).toHaveCount(1);
  expect(requests).toHaveLength(0);
  await page.screenshot({ path: '/tmp/partitura-choir-soundfonts.png' });
  await page.keyboard.press('Escape');
  const play = page.locator('#scorePlayback');
  for (const { id, name, file } of ARCHIVE_CHOIRS) {
    await page.locator('#scoreSettingsToggle').click();
    await page.getByRole('radio', { name, exact: true }).check();
    await page.keyboard.press('Escape');
    const count = await page.evaluate(() => window.fontStarts.length);
    await play.click();
    await expect(play, name).toHaveAccessibleName('Pausar');
    expect(requests.at(-1)).toContain(`/${file}`);
    await expect.poll(() => page.evaluate(() => window.fontStarts.length), { message: id }).toBeGreaterThan(count);
    await play.click();
  }
  expect(requests).toHaveLength(28);
  expect(errors).toEqual([]);
  expect(await page.evaluate(() => window.fontStarts.every(({ rate, duration }) => rate > 0 && Number.isFinite(rate) && duration > 0))).toBe(true);
});
