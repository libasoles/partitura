import { test, expect } from '@playwright/test';

async function open(page, instrument = 'piano', overrides = {}) {
  await page.addInitScript(({ instrument, overrides }) => {
    if (!sessionStorage.getItem('playbackFixture')) localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [{
      instrument, meter: '4/4', clef: instrument === 'piano' ? 'treble' : 'guitar', fifths: 0, tempo: 120,
      rows: [[[{ d: 'w', n: 35 }]]], lower: { 0: [{ d: 'w', n: 28 }] },
      ...overrides,
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
  }, { instrument, overrides });
  await page.goto('/es/');
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
}

async function enable(page) {
  await page.locator('#scoreSettingsToggle').click();
  await page.getByRole('checkbox', { name: 'Reproducción', exact: true }).check();
  await page.keyboard.press('Escape');
}

test('playback sits left of the staff above voices; settings show play and pause', async ({ page }) => {
  await open(page);
  await page.locator('#scoreSettingsToggle').click();
  const popup = page.locator('#scoreSettingsPopup');
  const category = popup.locator('.score-settings-category').filter({ has: page.getByRole('checkbox', { name: 'Reproducción', exact: true }) });
  await expect(category.getByRole('img', { name: 'Reproducir', exact: true })).toBeVisible();
  await expect(category.getByRole('img', { name: 'Pausar', exact: true })).toBeVisible();
  await category.getByRole('checkbox').check();
  await popup.getByRole('checkbox', { name: 'Voces', exact: true }).check();
  await page.keyboard.press('Escape');
  const button = page.locator('#scorePlayback');
  await expect(page.locator('#scoreBarlines #scorePlayback')).toHaveCount(0);
  const bounds = await button.boundingBox();
  const staff = await page.locator('#scoreStage g.staff > path').first().boundingBox();
  const voices = await page.locator('.score-voice-legend').boundingBox();
  expect(bounds.x + bounds.width).toBeLessThan(staff.x);
  expect(bounds.y + bounds.height).toBeLessThan(voices.y);
  await page.screenshot({ path: '/tmp/partitura-playback-left.png' });
});

test('the playhead follows audio and notation, pauses, and moves to the next row', async ({ page }) => {
  await open(page, 'piano', {
    rows: [[[{ d: 'q', n: 35 }, { d: 'q', rest: true }, { d: 'q', n: 37 }, { d: 'q', n: 38 }]], [[{ d: 'w', n: 39 }]]],
    lower: { 0: [{ d: 'w', n: 28 }], 1: [{ d: 'w', n: 30 }] },
  });
  await enable(page);
  const button = page.locator('#scorePlayback');
  const cursor = page.locator('.score-playback-cursor');
  await expect(cursor).toHaveCount(0);
  await button.click();
  await expect(cursor).toHaveCount(1);
  await page.waitForFunction(() => Number(document.querySelector('.score-playback-cursor')?.dataset.time) > 10);
  const initial = await page.evaluate(() => {
    const cursor = document.querySelector('.score-playback-cursor');
    const head = document.querySelector('[id="e0-0"] .notehead').getBoundingClientRect();
    const rest = document.querySelector('[id="e0-1"]').getBoundingClientRect();
    const box = cursor.getBoundingClientRect();
    const time = Number(cursor.dataset.time);
    const staves = [...document.querySelector('[id="m0"]').querySelectorAll(':scope > g.staff')];
    const expected = (head.left + head.right) / 2 + ((rest.left + rest.right - head.left - head.right) / 2) * time / window.ScoreModel.DIVISIONS;
    return { x: box.x, y: box.y, height: box.height, expected, time,
      audioTime: (window.playbackContext.currentTime - window.audioStarts[0].args[0]) * 2 * window.ScoreModel.DIVISIONS,
      staffHeight: staves.at(-1).querySelectorAll(':scope > path')[4].getBoundingClientRect().bottom - staves[0].querySelector('path').getBoundingClientRect().top };
  });
  expect(Math.abs(initial.x + 1 - initial.expected)).toBeLessThan(3);
  expect(Math.abs(initial.time - initial.audioTime)).toBeLessThan(3);
  expect(initial.height).toBeGreaterThan(initial.staffHeight);
  await button.click();
  const paused = await cursor.getAttribute('data-time');
  await page.waitForTimeout(100);
  await expect(cursor).toHaveAttribute('data-time', paused);
  await page.setViewportSize({ width: 1300, height: 1000 });
  await expect(cursor).toHaveAttribute('data-time', paused);
  await button.click();
  await expect(cursor).toHaveAttribute('data-measure', '1');
  expect((await cursor.boundingBox()).y).toBeGreaterThan(initial.y);
  await page.locator('.score-sheet').screenshot({ path: '/tmp/partitura-playback-cursor.png' });
  await expect(cursor).toHaveCount(0, { timeout: 5000 });
});

for (const staff of ['e', 'l']) {
  test(`play starts at the selected ${staff === 'e' ? 'upper' : 'lower'} note's measure, including its initial rest`, async ({ page }) => {
    await open(page, 'piano', {
      rows: [[[{ d: 'w', n: 35 }], [{ d: 'q', rest: true }, { d: 'q', n: 37 }, { d: 'h', n: 38 }]], [[{ d: 'w', n: 39 }]]],
      lower: { 0: [{ d: 'w', n: 28 }], 1: [{ d: 'q', rest: true }, { d: 'q', n: 28 }, { d: 'h', n: 29 }], 2: [{ d: 'w', n: 30 }] },
    });
    await enable(page);
    await page.locator(`[id="${staff}1-1"] .notehead`).click();
    const button = page.locator('#scorePlayback');
    await button.click();
    const cursor = page.locator('.score-playback-cursor');
    await expect(cursor).toHaveAttribute('data-measure', '1');
    const timing = await page.evaluate(() => ({
      time: Number(document.querySelector('.score-playback-cursor').dataset.time),
      firstAttack: window.audioStarts[0].args[0] - window.playbackContext.currentTime,
      notes: window.audioStarts.length,
    }));
    expect(timing.time).toBeGreaterThanOrEqual(96);
    expect(timing.time).toBeLessThan(120);
    expect(timing.firstAttack).toBeGreaterThan(0.25);
    expect(timing.notes).toBe(6);
    await button.click();
    await page.locator(`[id="${staff}2-0"] .notehead`).click({ force: true });
    await button.click();
    await expect(cursor).toHaveAttribute('data-measure', '2');
    expect(Number(await cursor.getAttribute('data-time'))).toBeGreaterThanOrEqual(192);
  });
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
