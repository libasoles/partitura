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
  await page.goto(instrument === 'voices' ? '/es/#pro' : '/es/');
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
}

async function enable(page) {
  await page.locator('#scoreSettingsToggle').click();
  await page.getByRole('checkbox', { name: 'Reproducción', exact: true }).check();
  await page.keyboard.press('Escape');
}

for (const tools of [{ voices: true, playback: true }, { voices: true }, { playback: true }]) {
  test(`the left toolbar stays in the viewport while scrolling (${Object.keys(tools).join(', ')})`, async ({ page }) => {
    await open(page, 'piano', {
      rows: Array.from({ length: 12 }, () => [[{ d: 'w', n: 35 }]]), tools,
    });
    const first = page.locator(tools.playback ? '#scorePlayback' : '.score-voice-legend');
    const last = page.locator(tools.voices ? '.score-voice-legend' : '#scorePlayback');
    const initial = await first.boundingBox();
    const stickyTop = await page.locator('.score-side').evaluate(e => parseFloat(getComputedStyle(e).top));
    for (const y of [initial.y + 100, initial.y + 400]) {
      await page.evaluate(y => window.scrollTo(0, y), y);
      await expect.poll(async () => (await first.boundingBox()).y).toBeCloseTo(stickyTop, 0);
      expect((await last.boundingBox()).y + (await last.boundingBox()).height).toBeLessThan(1000);
      expect((await first.boundingBox()).x).toBeCloseTo(initial.x, 0);
    }
    await page.evaluate(() => {
      const stage = document.querySelector('#scoreStage').getBoundingClientRect();
      window.scrollBy(0, stage.bottom - 100);
    });
    await expect.poll(async () => {
      const end = await last.boundingBox();
      const stage = await page.locator('#scoreStage').boundingBox();
      return end.y + end.height - stage.y - stage.height;
    }).toBeLessThanOrEqual(1);
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(async () => (await first.boundingBox()).y).toBeCloseTo(initial.y, 0);
  });
}

test('play follows active voices on both staves and clears the cached track when they change', async ({ page }) => {
  await open(page, 'piano', {
    rows: [[[{ d: 'w', n: 35, v: 1, at: 0 }, { d: 'w', n: 37, v: 2, at: 0 }]]],
    lower: { 0: [{ d: 'w', n: 28, v: 1, at: 0 }, { d: 'w', n: 30, v: 2, at: 0 }] },
    tools: { voices: true, playback: true },
  });
  const play = page.locator('#scorePlayback');
  const voice = page.locator('.score-voice-legend button[data-voice="2"]');
  await voice.click();
  await play.click();
  await expect(play).toHaveAccessibleName('Pausar');
  expect(await page.evaluate(() => window.audioStarts.length)).toBe(2);
  await play.click();
  await voice.click();
  await page.evaluate(() => { window.audioStarts = []; });
  await play.click();
  await expect(play).toHaveAccessibleName('Pausar');
  expect(await page.evaluate(() => window.audioStarts.length)).toBe(4);
  await voice.click();
  await expect(play).toHaveAccessibleName('Reproducir');
  await page.evaluate(() => { window.audioStarts = []; });
  await play.click();
  await expect(play).toHaveAccessibleName('Pausar');
  expect(await page.evaluate(() => window.audioStarts.length)).toBe(2);
});

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
  test(`play starts at the selected ${staff === 'e' ? 'upper' : 'lower'} note's onset, skipping its initial rest`, async ({ page }) => {
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
    expect(timing.time).toBeGreaterThanOrEqual(120);
    expect(timing.time).toBeLessThan(144);
    expect(timing.firstAttack).toBeLessThan(0.15);
    expect(timing.notes).toBe(6);
    await button.click();
    await page.locator(`[id="${staff}2-0"] .notehead`).click({ force: true });
    await button.click();
    await expect(cursor).toHaveAttribute('data-measure', '2');
    expect(Number(await cursor.getAttribute('data-time'))).toBeGreaterThanOrEqual(192);
  });
}

for (const staff of ['e', 'l']) {
  test(`play remembers the last ${staff} position after deselecting and seeks while playing`, async ({ page }) => {
    await open(page, 'piano', {
      rows: [[[{ d: 'w', n: 35 }], [{ d: 'w', n: 37 }], [{ d: 'w', n: 39 }]]],
      lower: { 0: [{ d: 'w', n: 28 }], 1: [{ d: 'w', n: 29 }], 2: [{ d: 'w', n: 30 }] },
      tools: { playback: true },
    });
    const button = page.locator('#scorePlayback');
    const cursor = page.locator('.score-playback-cursor');
    await page.locator(`[id="${staff}1-0"] .notehead`).click({ force: true });
    await page.keyboard.press('Escape');
    await expect(page.locator('g.note.is-selected')).toHaveCount(0);
    await button.click();
    await expect(cursor).toHaveAttribute('data-measure', '1');
    expect(await page.evaluate(() => window.audioStarts.length)).toBe(4);
    await page.evaluate(() => { window.audioStarts = []; });
    await page.locator(`[id="${staff}0-0"] .notehead`).click({ force: true });
    await expect(button).toHaveAccessibleName('Pausar');
    await expect(cursor).toHaveAttribute('data-measure', '0');
    expect(await page.evaluate(() => window.audioStarts.length)).toBe(6);
    // Clicking empty staff space also seeks, without needing a selected note.
    await page.evaluate(() => { window.audioStarts = []; });
    const line = page.locator('[id="m2"] > g.staff > path').first();
    const box = await line.boundingBox();
    await page.mouse.click(box.x + box.width * 0.8, box.y + 5);
    await expect(button).toHaveAccessibleName('Pausar');
    await expect(cursor).toHaveAttribute('data-measure', '2');
    expect(await page.evaluate(() => window.audioStarts.length)).toBe(2);
    await button.click();
    const paused = Number(await cursor.getAttribute('data-time'));
    await button.click();
    expect(Number(await cursor.getAttribute('data-time'))).toBeGreaterThanOrEqual(paused);
    await button.click();
    await page.locator(`[id="${staff}1-0"] .notehead`).click({ force: true });
    await page.keyboard.press('Escape');
    await button.click();
    await expect(cursor).toHaveAttribute('data-measure', '1');
  });
}

test('neutral clicks keep the cursor at the exact playback position after waiting and resizing', async ({ page }) => {
  await open(page, 'piano', {
    rows: [[[{ d: 'q', n: 35 }, { d: 'q', n: 37 }, { d: 'h', n: 38 }]]],
    tools: { playback: true }, tempo: 60,
  });
  const hint = page.locator('.score-playback-hint');
  const head = page.locator('[id="e0-1"] .notehead');
  await head.click();
  await expect(hint).toHaveCount(0);
  const before = await page.locator('[id="e0-0"] .notehead').boundingBox();
  const after = await head.boundingBox();
  const staff = await page.locator('[id="m0"] > g.staff > path').first().boundingBox();
  const x = (before.x + before.width / 2 + after.x + after.width / 2) / 2;
  await page.mouse.click(x, staff.y - 15);
  await expect(hint).toHaveCount(1);
  expect((await hint.boundingBox()).x + 1).toBeCloseTo(x, 0);
  await page.waitForTimeout(1100);
  await expect(hint).toBeVisible();
  expect(await hint.evaluate((node) => Number(getComputedStyle(node).opacity))).toBeCloseTo(0.8);
  await page.setViewportSize({ width: 1300, height: 1000 });
  await expect(hint).toBeVisible();
  await page.locator('#scorePlayback').click();
  const cursor = page.locator('.score-playback-cursor');
  await expect(cursor).toHaveCount(1);
  const time = Number(await cursor.getAttribute('data-time'));
  expect(time).toBeGreaterThanOrEqual(11);
  expect(time).toBeLessThan(20);
  await expect(hint).toHaveCount(0);
  await head.click({ force: true });
  expect(Number(await cursor.getAttribute('data-time'))).toBeGreaterThanOrEqual(24);
  expect(Number(await cursor.getAttribute('data-time'))).toBeLessThan(32);
  await expect(hint).toHaveCount(0);
  await page.locator('#scorePlayback').click();
  const a = await head.boundingBox();
  const b = await page.locator('[id="e0-2"] .notehead').boundingBox();
  const line = await page.locator('[id="m0"] > g.staff > path').first().boundingBox();
  await page.mouse.click((a.x + a.width / 2 + b.x + b.width / 2) / 2, line.y - 15);
  await expect(hint).toHaveCount(1);
  await page.locator('#scorePlayback').click();
  await expect(hint).toHaveCount(0);
  await expect(page.locator('#scorePlayback')).toHaveAccessibleName('Pausar');
  expect(Number(await cursor.getAttribute('data-time'))).toBeGreaterThanOrEqual(35);
  expect(Number(await cursor.getAttribute('data-time'))).toBeLessThan(44);
});

test('space toggles playback only when enabled and outside text fields', async ({ page }) => {
  await open(page);
  const stage = page.locator('#scoreStage');
  const button = page.locator('#scorePlayback');
  await stage.focus();
  await page.keyboard.press('Space');
  expect(await page.evaluate(() => window.audioStarts.length)).toBe(0);
  await enable(page);
  await stage.focus();
  await page.keyboard.press('Space');
  await expect(button).toHaveAccessibleName('Pausar');
  await page.keyboard.press('Space');
  await expect(button).toHaveAccessibleName('Reproducir');
  await page.locator('input').first().focus();
  await page.keyboard.press('Space');
  await expect(button).toHaveAccessibleName('Reproducir');
  await stage.focus();
  await page.keyboard.press('Space');
  await expect(button).toHaveAccessibleName('Pausar');
});

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

for (const [sound, file] of [[undefined, 'choir-ah'], ['oh', 'choir-oh'], ['mm', 'choir-oh']]) test(`voices (${sound || 'default'}): plays the choir samples`, async ({ page }) => {
  const audioRequests = [];
  page.on('request', (request) => { if (request.url().includes('/audio/')) audioRequests.push(request.url()); });
  await page.addInitScript((sound) => {
    if (!sessionStorage.getItem('playbackFixture')) localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [{
      instrument: 'voices', parts: 2, sound, meter: '4/4', clef: 'treble', fifths: 0, tempo: 120,
      rows: [[[{ d: 'w', n: 35 }]]], lower: { 0: [{ d: 'w', n: 28 }] }, tools: { playback: true },
    }] }));
    sessionStorage.setItem('playbackFixture', '1');
  }, sound);
  await page.goto('/es/#pro');
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
  const button = page.locator('#scorePlayback');
  await button.click();
  await expect(button).toHaveAccessibleName('Pausar');
  expect(audioRequests).toHaveLength(1);
  expect(audioRequests[0]).toContain(`/${file}.json`);
});

test('voices: the Ajustes sound selector defaults to Ah, is voices-only and drives the samples', async ({ page }) => {
  const audioRequests = [];
  page.on('request', (request) => { if (request.url().includes('/audio/')) audioRequests.push(request.url()); });
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('playbackFixture')) localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [{
      instrument: 'voices', parts: 2, meter: '4/4', clef: 'treble', fifths: 0, tempo: 120,
      rows: [[[{ d: 'w', n: 35 }]]], lower: { 0: [{ d: 'w', n: 28 }] }, tools: { playback: true },
    }] }));
    sessionStorage.setItem('playbackFixture', '1');
  });
  await page.goto('/es/#pro');
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
  await page.locator('#scoreSettingsToggle').click();
  await expect(page.getByRole('radio', { name: 'Ah', exact: true })).toBeChecked();
  await page.locator('.score-settings-radio').filter({ hasText: /^Piano$/ }).click();
  await expect(page.getByRole('radio', { name: 'Oh', exact: true })).toBeHidden();
  await page.locator('.score-settings-radio').filter({ hasText: /^Voces$/ }).click();
  await page.locator('.score-settings-radio').filter({ hasText: /^Oh$/ }).click();
  await page.keyboard.press('Escape');
  await page.locator('#scorePlayback').click();
  await expect(page.locator('#scorePlayback')).toHaveAccessibleName('Pausar');
  expect(audioRequests).toHaveLength(1);
  expect(audioRequests[0]).toContain('/choir-oh.json');
});

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

test('changing choir sound keeps playing at the current position while new samples load', async ({ page }) => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  await page.route('**/choir-oh.json', async (route) => { await pending; await route.continue(); });
  await open(page, 'voices', { parts: 2, tempo: 30, tools: { playback: true } });
  const button = page.locator('#scorePlayback');
  await button.click();
  await expect(button).toHaveAccessibleName('Pausar');
  await page.waitForFunction(() => Number(document.querySelector('.score-playback-cursor')?.dataset.time) > 2);
  await page.locator('#scoreSettingsToggle').click();
  await expect(page.locator('input[name="scoreSound"]')).toHaveCount(31);
  await expect(page.getByRole('radio', { name: 'Uh', exact: true })).toHaveValue('mm');
  const before = await page.locator('.score-playback-cursor').getAttribute('data-time');
  await page.getByRole('radio', { name: 'Oh', exact: true }).check();
  await expect(button).toHaveAccessibleName('Pausar');
  await page.waitForFunction((before) => Number(document.querySelector('.score-playback-cursor')?.dataset.time) > Number(before) + 1, before);
  expect(await page.evaluate(() => window.audioStarts.length)).toBe(2);
  release();
  await page.waitForFunction(() => window.audioStarts.length === 4);
  await expect(button).toHaveAccessibleName('Pausar');
  expect(await page.evaluate(() => window.audioStarts[2].args[1])).toBeGreaterThan(0.2);
  expect(Number(await page.locator('.score-playback-cursor').getAttribute('data-time'))).toBeGreaterThan(Number(before));
  await page.getByRole('radio', { name: 'Uh', exact: true }).check();
  await page.waitForFunction(() => window.audioStarts.length === 6);
  await expect(button).toHaveAccessibleName('Pausar');
});

test('changing choir sound during pause keeps the position and resumes with the new sound', async ({ page }) => {
  await open(page, 'voices', { parts: 2, tempo: 30, tools: { playback: true } });
  const button = page.locator('#scorePlayback');
  await button.click();
  await expect(button).toHaveAccessibleName('Pausar');
  await page.waitForFunction(() => Number(document.querySelector('.score-playback-cursor')?.dataset.time) > 2);
  await button.click();
  const before = await page.locator('.score-playback-cursor').getAttribute('data-time');
  await page.locator('#scoreSettingsToggle').click();
  await page.getByRole('radio', { name: 'Uh', exact: true }).check();
  await expect(button).toHaveAccessibleName('Reproducir');
  await page.keyboard.press('Escape');
  await button.click();
  await expect(button).toHaveAccessibleName('Pausar');
  await page.waitForFunction(() => window.audioStarts.length === 4);
  expect(Number(await page.locator('.score-playback-cursor').getAttribute('data-time'))).toBeGreaterThanOrEqual(Number(before));
  expect(await page.evaluate(() => window.audioStarts[2].args[1])).toBeGreaterThan(0.2);
});
