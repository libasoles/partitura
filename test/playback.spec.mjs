import { test, expect } from '@playwright/test';

async function open(page, instrument = 'piano') {
  await page.addInitScript((instrument) => {
    if (!sessionStorage.getItem('playbackFixture')) localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [{
      instrument, meter: '4/4', clef: instrument === 'piano' ? 'treble' : 'guitar', fifths: 0, tempo: 120,
      rows: [[[{ d: 'w', n: 35 }]]], lower: { 0: [{ d: 'w', n: 28 }] },
    }] }));
    sessionStorage.setItem('playbackFixture', '1');
    const NativeAudioContext = window.AudioContext;
    window.audioStarts = [];
    window.AudioContext = class extends NativeAudioContext {
      constructor(...args) { super(...args); window.playbackContext = this; }
      createBufferSource() {
        const source = super.createBufferSource();
        const start = source.start.bind(source);
        source.start = (...args) => { window.audioStarts.push({ args, length: source.buffer.length }); start(...args); };
        return source;
      }
    };
  }, instrument);
  await page.goto('/es/');
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
}

async function enable(page) {
  await page.locator('#scoreSettingsToggle').click();
  await page.getByRole('checkbox', { name: 'Reproducción', exact: true }).check();
  await page.keyboard.press('Escape');
}

for (const instrument of ['piano', 'guitar']) {
  test(`${instrument}: lazy samples, real decoded audio, pause/resume and end`, async ({ page }) => {
    const audioRequests = [];
    const playerRequests = [];
    const errors = [];
    page.on('request', (request) => { if (request.url().includes('/audio/')) audioRequests.push(request.url()); });
    page.on('request', (request) => { if (request.url().includes('score-playback')) playerRequests.push(request.url()); });
    page.on('pageerror', (error) => errors.push(error.message));
    await open(page, instrument);
    await expect(page.locator('#scorePlayback')).toBeHidden();
    expect(audioRequests).toHaveLength(0);
    await enable(page);
    expect(audioRequests).toHaveLength(0);
    expect(playerRequests).toHaveLength(0);
    const button = page.locator('#scorePlayback');
    await expect(button).toHaveAccessibleName('Reproducir');
    await button.click();
    await expect(button).toHaveAccessibleName('Pausar');
    expect(audioRequests).toHaveLength(1);
    expect(audioRequests[0]).toContain(`/${instrument}.json`);
    const starts = await page.evaluate(() => window.audioStarts);
    expect(starts).toHaveLength(instrument === 'piano' ? 2 : 1);
    expect(starts.every((source) => source.length > 0)).toBe(true);
    await page.waitForFunction(() => window.playbackContext.currentTime > window.audioStarts[0].args[0] + 0.15);
    await button.click();
    await expect(button).toHaveAccessibleName('Reproducir');
    await button.click();
    await expect(button).toHaveAccessibleName('Pausar');
    const resumed = await page.evaluate(() => window.audioStarts.at(-1).args[1]);
    expect(resumed).toBeGreaterThan(0);
    expect(audioRequests).toHaveLength(1);
    await expect(button).toHaveAccessibleName('Reproducir', { timeout: 5000 });
    expect(errors).toEqual([]);
  });
}

test('playback preference persists; disabling or changing document cancels audio', async ({ page }) => {
  await open(page);
  await enable(page);
  await page.evaluate(() => window.ScoreStore.flush());
  await page.reload();
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
  const button = page.locator('#scorePlayback');
  await expect(button).toBeVisible();
  await button.click();
  await expect(button).toHaveAccessibleName('Pausar');
  await page.locator('#scoreSettingsToggle').click();
  await page.getByRole('checkbox', { name: 'Reproducción', exact: true }).uncheck();
  await expect(button).toBeHidden();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('checkbox', { name: 'Reproducción', exact: true }).check();
  await page.keyboard.press('Escape');
  await button.click();
  await expect(button).toHaveAccessibleName('Pausar');
  await page.locator('#scoreNewTab').click();
  await expect(button).toBeHidden();
  await expect(button).toHaveAttribute('aria-pressed', 'false');
});

test('a failed sound download can be retried', async ({ page }) => {
  await open(page);
  await enable(page);
  await page.route('**/audio/**', (route) => route.fulfill({ status: 503, body: '' }));
  const button = page.locator('#scorePlayback');
  await button.click();
  await expect(button).toHaveAccessibleName('Reproducir');
  await expect(button).toBeEnabled();
  await page.unroute('**/audio/**');
  await button.click();
  await expect(button).toHaveAccessibleName('Pausar');
});

test('changing instrument while sounds load prevents stale playback', async ({ page }) => {
  await open(page);
  await enable(page);
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  await page.route('**/audio/**', async (route) => { await pending; await route.continue(); });
  const button = page.locator('#scorePlayback');
  try {
    await button.click();
    await expect(button).toHaveAttribute('aria-busy', 'true');
    await page.locator('#scoreSettingsToggle').click();
    await page.locator('.score-settings-radio').filter({ hasText: 'Guitarra' }).click();
  } finally { release(); }
  await expect(button).toHaveAttribute('aria-busy', 'false');
  await expect(button).toHaveAccessibleName('Reproducir');
  expect(await page.evaluate(() => window.audioStarts)).toEqual([]);
});
