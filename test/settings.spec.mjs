import { test, expect } from '@playwright/test';

async function open(page, url = '/es/') {
  await page.goto(url);
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
}

for (const url of ['/es/?tools=voices,play#pro', '/es/demos/canto-en-la-rama/#pro']) {
  test(`${url}: URL tools start the library off but keep its setting available`, async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.addInitScript(() => {
      localStorage.setItem('partitura.settings.v1', JSON.stringify({ patterns: true }));
    });
    await page.goto(url);
    await page.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
    await expect(page.locator('.score-library')).toBeHidden();
    await page.locator('#scoreSettingsToggle').click();
    const library = page.getByRole('checkbox', { name: 'Biblioteca de patrones', exact: true });
    await expect(library).toHaveCount(1, { timeout: 1000 });
    await expect(library).toBeEnabled();
    await expect(library).not.toBeChecked();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('partitura.settings.v1')).patterns)).toBe(true);
    await library.check();
    await expect(page.locator('.score-library')).toBeVisible();
    await library.uncheck();
    await expect(page.locator('.score-library')).toBeHidden();
  });
}

test('settings stay inside a short viewport and all options remain reachable by scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await open(page, '/es/#pro');
  await page.locator('#scoreSettingsToggle').click();
  const popup = page.locator('#scoreSettingsPopup');
  await expect.poll(async () => {
    const box = await popup.boundingBox();
    return Math.abs(box.x + box.width - 1600);
  }).toBeLessThan(0.1);
  const category = (name) => popup.locator('.score-settings-category').filter({ has: page.getByRole('checkbox', { name, exact: true }) });
  const grid = await popup.locator('.score-settings-tools').boundingBox();
  let previousBottom = 0;
  for (const name of ['Repetición', 'Dinámica', 'Identificador de voces', 'Reproducción', 'Intervalos']) {
    const row = category(name);
    const box = await row.boundingBox();
    const label = await row.locator(':scope > .score-settings-check').boundingBox();
    const icons = await row.locator('.score-settings-icons').boundingBox();
    expect(box.width).toBe(grid.width);
    expect(box.y).toBeGreaterThanOrEqual(previousBottom);
    expect(icons.x).toBeGreaterThan(label.x + label.width);
    expect(icons.x + icons.width).toBeCloseTo(box.x + box.width, 1);
    expect(Math.abs(label.y + label.height / 2 - icons.y - icons.height / 2)).toBeLessThan(1);
    previousBottom = box.y + box.height;
  }
  const repeatIcons = await category('Repetición').locator('.score-settings-icon').evaluateAll((icons) => icons.map((el) => { const box = el.getBoundingClientRect(); return box.top + box.height / 2; }));
  expect(Math.max(...repeatIcons) - Math.min(...repeatIcons)).toBeLessThan(1);
  await expect(category('Intervalos').locator('svg path')).toHaveAttribute('d', 'm6 4 5.765 15.835a.25.25 0 00.47 0L18 4');
  await page.setViewportSize({ width: 1600, height: 360 });
  await expect.poll(async () => {
    const box = await popup.boundingBox();
    return box.y === 0 && box.y + box.height === 360 && box.x + box.width === 1600;
  }).toBe(true);
  const content = popup.locator('.score-settings-content');
  expect(await content.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await content.hover();
  await page.mouse.wheel(0, 1000);
  await expect.poll(() => content.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const library = popup.getByRole('checkbox', { name: 'Biblioteca de patrones', exact: true });
  const libraryBox = await library.boundingBox();
  const popupBox = await popup.boundingBox();
  expect(libraryBox.y).toBeGreaterThan(popupBox.y);
  expect(libraryBox.y + libraryBox.height).toBeLessThan(popupBox.y + popupBox.height);
  await library.check();
  await expect(page.locator('.score-library')).toBeVisible();
  const intervals = popup.getByRole('checkbox', { name: 'Intervalos', exact: true });
  const modes = popup.getByRole('radiogroup', { name: 'Intervalos', exact: true });
  await expect(modes).toBeHidden();
  await intervals.check();
  await expect(modes).toBeVisible();
  await expect(modes.getByRole('radio').first()).toHaveAccessibleName('En relación al bajo');
  await expect(modes.getByRole('radio').first()).toBeChecked();
  const labelBox = await category('Intervalos').locator(':scope > .score-settings-check').boundingBox();
  const modesBox = await modes.boundingBox();
  expect(modesBox.y).toBeGreaterThanOrEqual(labelBox.y + labelBox.height);
  await intervals.uncheck();
  await expect(modes).toBeHidden();
  await intervals.check();
  await page.evaluate(() => window.ScoreStore.flush());
  await page.reload();
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
  await page.locator('#scoreSettingsToggle').click();
  await expect(intervals).toBeChecked();
  await popup.getByRole('button', { name: 'Cerrar ajustes' }).click();
  await expect(popup).not.toBeVisible();
  await expect(page.locator('#scoreSettingsToggle')).toBeFocused();
});

test('the drawer explains why the library needs a wider window and closes with Escape', async ({ page }) => {
  await open(page, '/es/#pro');
  await page.locator('#scoreSettingsToggle').click();
  const popup = page.locator('#scoreSettingsPopup');
  const library = popup.getByRole('checkbox', { name: 'Biblioteca de patrones', exact: true });
  await library.scrollIntoViewIfNeeded();
  await expect(library).toBeVisible();
  await expect(library).toBeDisabled();
  await expect(popup.getByText(/Disponible en ventanas de al menos 1560/)).toBeVisible();
  await page.setViewportSize({ width: 1600, height: 1000 });
  await expect(library).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(popup).not.toBeVisible();
});

test('the cog is the first sidebar tool and the dialog switches instrument, tempo and tool groups', async ({ page }) => {
  await open(page);
  const cog = page.locator('#scoreSettingsToggle');
  await expect(page.locator('#scoreBarlines > :first-child')).toHaveId('scoreSettingsToggle');

  // A blank score is a piano score: no TAB, no barre, and the repeat/dynamics groups are there.
  await expect(page.locator('#scoreTabToggle')).toBeHidden();
  await expect(page.locator('[data-tool="barre"]')).toBeHidden();
  await expect(page.locator('[data-hairpin="cresc"]')).toBeVisible();

  await cog.click();
  const popup = page.locator('#scoreSettingsPopup');
  await expect(popup).toBeVisible();
  const instrument = popup.getByRole('group', { name: 'Instrumento' });
  await expect(instrument.getByRole('radio')).toHaveCount(2);
  await expect(instrument.getByRole('radio', { name: 'Piano' })).toBeChecked();

  // Guitar: TAB and barre appear and the clef becomes treble 8.
  await instrument.locator('label').filter({ hasText: 'Guitarra' }).click();
  await expect(page.locator('#scoreTabToggle')).toBeVisible();
  await expect(page.locator('[data-tool="barre"]')).toBeVisible();
  expect(await page.evaluate(() => window.scoreEditor.score.clef)).toBe('guitar');

  // Tempo is a slider and is written as a metronome mark.
  const slider = popup.getByRole('slider');
  const none = popup.getByRole('checkbox', { name: 'Sin indicación' });
  await expect(none).toBeChecked();
  await slider.fill('140');
  expect(await page.evaluate(() => window.scoreEditor.score.tempo)).toBe(140);
  await expect(page.locator('#scoreStage svg.definition-scale g.tempo')).toContainText('140');
  await expect(none).not.toBeChecked();
  await none.check();
  expect(await page.evaluate(() => window.scoreEditor.score.tempo)).toBeUndefined();

  // Tool groups are checkboxes, each listing its icons.
  await expect(popup.locator('.score-settings-category').nth(0).locator('.score-settings-icon')).toHaveCount(8);
  await expect(popup.locator('.score-settings-category').nth(1).locator('.score-settings-icon')).toHaveCount(10);
  await popup.getByRole('checkbox', { name: 'Dinámica' }).uncheck();
  await expect(page.locator('[data-hairpin="cresc"]')).toBeHidden();
  await popup.getByRole('checkbox', { name: 'Repetición' }).uncheck();
  await expect(page.locator('[data-barline="start"]')).toBeHidden();
  await expect(page.locator('[data-navigation="segno"]')).toBeHidden();
  await page.evaluate(() => window.ScoreStore.flush());
  await page.reload();
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
  await expect(page.locator('[data-hairpin="cresc"]')).toBeHidden();

  // Back to piano: TAB and barre go away and the guitar clef becomes a plain treble clef.
  await page.locator('#scoreSettingsToggle').click();
  await instrument.locator('label').filter({ hasText: 'Piano' }).click();
  await expect(page.locator('#scoreTabToggle')).toBeHidden();
  expect(await page.evaluate(() => window.scoreEditor.score.clef)).toBe('treble');
  await page.keyboard.press('Escape');
  await expect(page.locator('#scoreSettingsPopup')).toBeHidden();
});

test('Voces is off by default; turning it on colours each voice and shows a 1-4 legend', async ({ page }) => {
  await open(page);
  await expect(page.locator('.score-voice-legend')).toHaveCount(0);
  await page.locator('#scoreSettingsToggle').click();
  const popup = page.locator('#scoreSettingsPopup');
  const voices = popup.getByRole('checkbox', { name: 'Identificador de voces' });
  await expect(voices).not.toBeChecked();
  await expect(popup.locator('.score-voice-swatch')).toHaveCount(4);
  await voices.check();
  const legend = page.locator('.score-voice-legend button');
  await expect(legend).toHaveText(['1', '2', '3', '4']);
  const colors = await legend.evaluateAll((items) => items.map((li) => getComputedStyle(li).borderTopColor));
  expect(new Set(colors).size).toBe(4);
  await voices.uncheck();
  await expect(page.locator('.score-voice-legend')).toHaveCount(0);
});

test('with Voces on, the legend picks which voices are coloured and nothing is hidden', async ({ page }) => {
  const score = { rows: [[[{ d: 'h', n: 35, v: 1, at: 0 }, { d: 'h', n: 28, v: 2, at: 0 }]]], meter: '4/4', clef: 'treble', fifths: 0, tools: { voices: true } };
  await page.addInitScript((data) => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [data] }));
    localStorage.setItem('partitura.settings.v1', JSON.stringify({ 'tools.voices': true }));
  }, score);
  await open(page);
  await expect(page.locator('#scoreStage g.note[data-voice]')).toHaveCount(2);
  const fills = () => page.locator('#scoreStage g.note[data-voice] .notehead').evaluateAll((nodes) => nodes.map((n) => getComputedStyle(n).fill));
  // Nothing picked: no colour, so both heads look alike.
  expect(new Set(await fills()).size).toBe(1);

  const legend = page.locator('.score-voice-legend button');
  await legend.nth(1).click();
  await expect(legend.nth(1)).toHaveAttribute('aria-pressed', 'true');
  expect(new Set(await fills()).size).toBe(2);
  await legend.nth(0).click();
  expect(new Set(await fills()).size).toBe(2);
  await expect(page.locator('#scoreStage .is-voice-on')).toHaveCount(2);
  await legend.nth(0).click();
  await legend.nth(1).click();
  await expect(legend.nth(1)).toHaveAttribute('aria-pressed', 'false');
  expect(new Set(await fills()).size).toBe(1);
});

test('with Voces on, a tie follows the voice of its first note', async ({ page }) => {
  const score = { rows: [[[{ d: 'w', n: 35, v: 1, at: 0, tie: true }, { d: 'w', n: 28, v: 2, at: 0 }], [{ d: 'w', n: 35, v: 1, at: 0 }]]], meter: '4/4', clef: 'treble', fifths: 0, tools: { voices: true } };
  await page.addInitScript((data) => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [data] }));
    localStorage.setItem('partitura.settings.v1', JSON.stringify({ 'tools.voices': true }));
  }, score);
  await open(page);
  const tie = page.locator('#scoreStage g.tie');
  await expect(tie).toHaveCount(1);
  await expect(tie).toHaveAttribute('data-voice', '1');
  const legend = page.locator('.score-voice-legend button');
  await expect(tie).not.toHaveClass(/is-voice-on/);
  await legend.nth(1).click();
  await expect(tie).not.toHaveClass(/is-voice-on/);
  await legend.nth(1).click();
  await legend.nth(0).click();
  await expect(tie).toHaveClass(/is-voice-on/);
});

test('with Voces on, both staves of a piano score are coloured by the same legend', async ({ page }) => {
  const score = { rows: [[[{ d: 'h', n: 35, v: 1, at: 0 }, { d: 'h', n: 33, v: 2, at: 0 }]]], lower: { 0: [{ d: 'h', n: 21, v: 1, at: 0 }, { d: 'h', n: 19, v: 2, at: 0 }] }, meter: '4/4', clef: 'treble', fifths: 0, instrument: 'piano', tools: { voices: true } };
  await page.addInitScript((data) => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [data] }));
    localStorage.setItem('partitura.settings.v1', JSON.stringify({ 'tools.voices': true }));
  }, score);
  await open(page);
  await expect(page.locator('#scoreStage g.note[id^="e"][data-voice]')).toHaveCount(2);
  await expect(page.locator('#scoreStage g.note[id^="l"][data-voice]')).toHaveCount(2);
  const legend = page.locator('.score-voice-legend button');
  await legend.nth(1).click();
  await expect(page.locator('#scoreStage g.note.is-voice-on')).toHaveCount(2);
  await expect(page.locator('#scoreStage g.note[id^="l"][data-voice="2"].is-voice-on')).toHaveCount(1);
});
