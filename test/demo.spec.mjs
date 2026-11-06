import { test, expect } from '@playwright/test';

const demoPath = '/demos/Canto%20en%20la%20rama%20-%203%20voces.musicxml';
const xml = `<?xml version="1.0"?><score-partwise version="3.1"><work><work-title>Demo de prueba</work-title></work><identification><creator type="composer">Autor de prueba</creator></identification><part-list><score-part id="P1"><part-name>Coro</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line></clef></attributes><note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><type>whole</type></note></measure></part></score-partwise>`;

async function ready(page, url = '/es/') {
  await page.goto(url);
  await page.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
  await page.waitForFunction(() => window.scoreEditor);
}

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
  expect(await page.evaluate(() => window.scoreEditor.score.tools)).toEqual({ repeats: false, dynamics: false, voices: true, playback: true, intervals: false });
  expect(await page.evaluate(() => window.scoreEditor.score.sound)).toBe('oh');
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
});

test('the published song imports its three choir staves and URL defaults without #pro', async ({ page }) => {
  await ready(page, '/pt/?tools=voices,play,intervals&sound=mm');
  await page.locator('#siteMenuToggle').click();
  await page.locator('[data-demo-url]').click();
  await expect(page.locator('#scoreTitle')).toHaveValue('Canto en la rama');
  await expect(page.locator('#scoreAuthor')).toHaveValue('Aca Seca Trío');
  expect(await page.evaluate(() => {
    const score = window.scoreEditor.score;
    return { staves: window.ScoreModel.stavesOf(score), instrument: score.instrument, sound: score.sound, intervals: score.tools.intervals };
  })).toEqual({ staves: 3, instrument: 'voices', sound: 'mm', intervals: true });
  await expect(page.locator('#scoreStage g.note[id^="p"]')).not.toHaveCount(0);
});

for (const query of ['tools=voices,play', 'sound=oh']) {
  test(`${query} enables choir import without #pro`, async ({ page }) => {
    await ready(page, `/es/?${query}`);
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
  await expect(popup.locator('[data-category="intervals"] input')).not.toBeChecked();
  await popup.locator('[data-category="dynamics"] input').check();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-hairpin="cresc"]')).toBeVisible();
  await page.locator('#scoreNewTab').click();
  await expect(page.locator('[data-hairpin="cresc"]')).toBeHidden();
  expect(await page.evaluate(() => window.scoreEditor.score.tools.voices)).toBe(true);
});
