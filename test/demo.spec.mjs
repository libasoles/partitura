import { test, expect } from '@playwright/test';

const demoPath = '/demos/Canto%20en%20la%20rama%20-%203%20voces.musicxml';
const xml = `<?xml version="1.0"?><score-partwise version="3.1"><work><work-title>Demo de prueba</work-title></work><identification><creator type="composer">Autor de prueba</creator></identification><part-list><score-part id="P1"><part-name>Coro</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure></part></score-partwise>`;

async function ready(page, url = '/es/') {
  await page.goto(url);
  await page.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
  await page.waitForFunction(() => window.scoreEditor);
}

test('demo is readable without JavaScript on desktop and mobile', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto('/es/demos/canto-en-la-rama/');
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 900 });
      const notes = page.locator('#scoreStage g.note');
      await expect(notes.first()).toBeVisible();
      await expect(notes.last()).toBeVisible();
      await expect(page.locator('#scoreStage g.verse').first()).toBeVisible();
      const title = await page.locator('#scoreTitle').evaluate((input) => ({ width: input.clientWidth, text: input.scrollWidth }));
      expect(title.width).toBeGreaterThanOrEqual(title.text);
      const heights = await page.locator('#scoreStage').evaluate((stage) => ({ stage: stage.clientHeight, svg: [...stage.querySelectorAll(':scope > svg')].reduce((h, svg) => h + svg.getBoundingClientRect().height, 0) }));
      expect(heights.stage).toBeGreaterThanOrEqual(Math.floor(heights.svg));
    }
  } finally {
    await context.close();
  }
});

test('prerendered demo becomes editable without downloading MusicXML or losing personal scores', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [{ title: 'Mi partitura', rows: [[[]]] }] }));
  });
  let downloads = 0;
  await page.route(`**${demoPath}`, (route) => { downloads++; return route.abort(); });
  await ready(page, '/es/demos/canto-en-la-rama/');
  await expect(page.locator('#scoreTitle')).toHaveValue('Canto en la rama');
  expect(downloads).toBe(0);
  await expect(page.locator('#scoreIntervals')).toHaveAttribute('aria-pressed', 'true');
  await page.locator('#scoreTitle').fill('Demo editada');
  await expect(page.locator('.score-doc-tab.is-active input')).toHaveValue('Demo editada');
  await page.locator('.score-doc-tab:not(.is-active)').click();
  await expect(page.locator('#scoreTitle')).toHaveValue('Mi partitura');
  await page.locator('.score-doc-tab:not(.is-active)').click();
  await expect(page.locator('#scoreTitle')).toHaveValue('Demo editada');
});

test('demo is fetched only on selection and opens through the importer in a new tab', async ({ page }) => {
  let requests = 0;
  await page.route(`**${demoPath}`, async (route) => {
    requests += 1;
    await route.fulfill({ contentType: 'application/xml', body: xml });
  });
  await ready(page, '/es/?tools=voices,play&sound=oh#pro');
  await page.locator('#scoreTitle').fill('Mi partitura');
  expect(requests).toBe(0);
  await page.locator('#siteMenuToggle').click();
  await page.locator('[data-demo-url]').click();
  await expect(page.locator('.score-doc-tab')).toHaveCount(2);
  await expect(page.locator('#scoreTitle')).toHaveValue('Demo de prueba');
  await expect(page.locator('#scoreAuthor')).toHaveValue('Autor de prueba');
  expect(requests).toBe(1);
  expect(await page.evaluate(() => window.scoreEditor.score.tools)).toEqual({ repeats: false, dynamics: false, voices: true, playback: true, intervals: true });
  expect(await page.evaluate(() => window.scoreEditor.score.sound)).toBe('mm');
  await expect(page.locator('.welcome-banner')).toBeHidden();
  expect(await page.context().cookies()).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: 'banner-closed' })]));
  await page.locator('.score-doc-tab-label').first().click();
  await expect(page.locator('#scoreTitle')).toHaveValue('Mi partitura');
});

test('a failed demo download preserves the current score and allows retry', async ({ page }) => {
  await page.route(`**${demoPath}`, (route) => route.fulfill({ status: 404 }));
  await ready(page);
  await page.locator('#scoreTitle').fill('Conservar');
  await page.locator('#siteMenuToggle').click();
  await page.locator('[data-demo-url]').click();
  await expect(page.locator('[data-demo-url]')).toBeEnabled();
  await expect(page.locator('.score-doc-tab')).toHaveCount(1);
  await expect(page.locator('#scoreTitle')).toHaveValue('Conservar');
  expect(new URL(page.url()).searchParams.has('demo')).toBe(false);
});

test('a demo opened without URL options produces a shareable link for a fresh browser', async ({ page, browser }) => {
  await ready(page, '/es/');
  await page.locator('#scoreTitle').fill('Mi canción privada');
  expect(new URL(page.url()).search).toBe('');
  await page.locator('#scoreNewTab').click();
  expect(new URL(page.url()).search).toBe('');
  await page.locator('#menuFile').setInputFiles({ name: 'privada.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await expect(page.locator('#scoreTitle')).toHaveValue('Demo de prueba');
  expect(new URL(page.url()).search).toBe('');
  await page.locator('#siteMenuToggle').click();
  await page.locator('[data-demo-url]').click();
  await expect(page.locator('#scoreTitle')).toHaveValue('Canto en la rama');
  await expect(page).toHaveURL(/\/es\/demos\/canto-en-la-rama\//);
  const link = page.url();
  const params = new URL(link).searchParams;
  expect(Object.fromEntries(params)).toEqual({ tools: 'voices,play,intervals', sound: 'uh', banner: 'hide' });
  expect(await page.evaluate(() => window.ScoreModel.stavesOf(window.scoreEditor.score))).toBe(3);
  const context = await browser.newContext();
  try {
    const recipient = await context.newPage();
    await recipient.goto(link);
    await expect(recipient.locator('#scoreTitle')).toHaveValue('Canto en la rama');
    expect(await recipient.evaluate(() => {
      const score = window.scoreEditor.score;
      return { staves: window.ScoreModel.stavesOf(score), sound: score.sound, tools: score.tools };
    })).toEqual({ staves: 3, sound: 'mm', tools: { repeats: false, dynamics: false, voices: true, playback: true, intervals: true } });
    await expect(recipient.locator('.welcome-banner')).toBeHidden();
    await expect(recipient.locator('.score-doc-tab')).toHaveCount(2);
    await recipient.evaluate(() => window.ScoreStore.flush());
    // Demos are volatile: the reload at the demo URL opens a fresh copy next to the visitor's own score.
    await recipient.reload();
    await expect(recipient.locator('#scoreTitle')).toHaveValue('Canto en la rama');
    await expect(recipient.locator('.score-doc-tab')).toHaveCount(2);
    await recipient.goto('/es/');
    await recipient.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
    await expect(recipient.locator('.score-doc-tab')).toHaveCount(1);
    await expect(recipient.locator('#scoreTitle')).not.toHaveValue('Canto en la rama');
  } finally {
    await context.close();
  }
});

test('a demo page loads the song and its defaults even without query parameters', async ({ page }) => {
  await ready(page, '/en/demos/canto-en-la-rama/');
  await expect(page.locator('#scoreTitle')).toHaveValue('Canto en la rama');
  await expect(page.locator('#scoreAuthor')).toHaveValue('Aca Seca Trío / Leda Valladares');
  expect(await page.evaluate(() => window.ScoreModel.stavesOf(window.scoreEditor.score))).toBe(3);
  await expect(page.locator('#scoreIntervals')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#scoreStage g.dir').filter({ hasText: /^[IVXL\s]+$/ }).first()).toBeVisible();
  await page.locator('#scoreIntervals').click();
  await expect(page.locator('#scoreIntervals')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.welcome-banner')).toBeHidden();
});

test('the choir demo legend colours each of its three staves independently', async ({ page }) => {
  await ready(page, '/es/demos/canto-en-la-rama/');
  await expect(page.locator('#scoreTitle')).toHaveValue('Canto en la rama');
  const legend = page.locator('.score-voice-legend button');
  for (const [staff, prefix] of ['e', 'l', 'p'].entries()) {
    const notes = page.locator(`#scoreStage g.note[id^="${prefix}"]`);
    await expect(notes.first()).toHaveAttribute('data-voice', String(staff + 1));
    await legend.nth(staff).click();
    await expect(notes.first()).toHaveClass(/is-voice-on/);
    expect(await page.locator('#scoreStage g.note.is-voice-on').count()).toBe(await notes.count());
    await legend.nth(staff).click();
    await expect(page.locator('#scoreStage g.note.is-voice-on')).toHaveCount(0);
  }
});

test('unknown demo identifiers do not import remote files', async ({ page }) => {
  let requested = false;
  page.on('request', (request) => { if (new URL(request.url()).pathname.endsWith('.musicxml')) requested = true; });
  await ready(page, '/en/?demo=https://example.com/song.musicxml');
  await expect(page.locator('.score-doc-tab')).toHaveCount(1);
  expect(requested).toBe(false);
});

test('demo copies stay out of personal scores across edits, reloads and repeated openings', async ({ page }) => {
  await page.route(`**${demoPath}`, (route) => route.fulfill({ contentType: 'application/xml', body: xml }));
  await ready(page, '/es/#pro');
  await page.locator('#scoreTitle').fill('Mi canción');
  const openDemo = async () => {
    await page.locator('#siteMenuToggle').click();
    await page.locator('[data-demo-url]').click();
    await expect(page.locator('#scoreTitle')).toHaveValue('Demo de prueba');
  };
  await openDemo();
  await page.locator('#scoreTitle').fill('Demo editada');
  await openDemo();
  await expect(page.locator('.score-doc-tab')).toHaveCount(3);
  await page.evaluate(() => window.ScoreStore.flush());
  // Demos are never stored: the index shows only the personal score.
  await page.goto('/es/#pro');
  await page.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
  await expect(page.locator('.score-doc-tab')).toHaveCount(1);
  await expect(page.locator('#scoreTitle')).toHaveValue('Mi canción');
  await page.locator('#siteMenuToggle').click();
  await expect(page.locator('#menuScores [role=menuitem]')).toHaveText(['Mi canción']);
  await page.locator('#siteMenuToggle').click();
  await openDemo();
  await expect(page.locator('.score-doc-tab')).toHaveCount(2);
  // Closing a demo discards just that copy; the personal score remains.
  await page.locator('.score-doc-tab.is-active .score-doc-tab-close').click();
  await expect(page.locator('.score-doc-tab')).toHaveCount(1);
  await expect(page.locator('#scoreTitle')).toHaveValue('Mi canción');
  await openDemo();
  await page.locator('#siteMenuToggle').click();
  await expect(page.locator('#menuScores [role=menuitem]')).toHaveText(['Mi canción']);
});

test('the published song imports its three choir staves and URL defaults without #pro', async ({ page }) => {
  await ready(page, '/pt/?tools=repeats,dynamics&sound=mm');
  await page.locator('#siteMenuToggle').click();
  await page.locator('[data-demo-url]').click();
  await expect(page.locator('#scoreTitle')).toHaveValue('Canto en la rama');
  await expect(page.locator('#scoreAuthor')).toHaveValue('Aca Seca Trío / Leda Valladares');
  expect(await page.evaluate(() => {
    const score = window.scoreEditor.score;
    return { staves: window.ScoreModel.stavesOf(score), instrument: score.instrument, sound: score.sound, tools: score.tools };
  })).toEqual({ staves: 3, instrument: 'voices', sound: 'mm', tools: { repeats: false, dynamics: false, voices: true, playback: true, intervals: true } });
  await expect(page.locator('#scoreStage g.note[id^="p"]')).not.toHaveCount(0);
});

for (const query of ['tools=voices,play', 'sound=oh', 'sound=uh']) {
  test(`${query} enables choir import without #pro`, async ({ page }) => {
    await ready(page, `/es/?${query}`);
    if (query === 'sound=uh') expect(await page.evaluate(() => window.scoreEditor.score.sound)).toBe('mm');
    await page.locator('#siteMenuToggle').click();
    await page.locator('[data-demo-url]').click();
    await expect(page.locator('#scoreTitle')).toHaveValue('Canto en la rama');
    expect(await page.evaluate(() => window.ScoreModel.stavesOf(window.scoreEditor.score))).toBe(3);
    await page.locator('#scoreSettingsToggle').click();
    await expect(page.locator('input[name="scoreSound"][value="oh"]')).toBeVisible();
  });
}

test('URL groups override saved tools, allow changes, and apply to new scores', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [{ rows: [[[]]], tools: { repeats: true, dynamics: true, intervals: true } }] }));
  });
  await ready(page, '/en/?tools=voices,play');
  await expect(page.locator('[data-hairpin="cresc"]')).toBeHidden();
  await expect(page.locator('[data-barline="start"]')).toBeHidden();
  await expect(page.locator('.score-voice-legend')).toBeVisible();
  await page.locator('#scoreSettingsToggle').click();
  const popup = page.locator('#scoreSettingsPopup');
  await expect(popup.locator('[data-category="playback"] input')).toBeChecked();
  await expect(popup.locator('[data-category="intervals"] input[type="checkbox"]')).not.toBeChecked();
  await popup.locator('[data-category="dynamics"] input').check();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-hairpin="cresc"]')).toBeVisible();
  await page.locator('#scoreNewTab').click();
  await expect(page.locator('[data-hairpin="cresc"]')).toBeHidden();
  expect(await page.evaluate(() => window.scoreEditor.score.tools.voices)).toBe(true);
});
