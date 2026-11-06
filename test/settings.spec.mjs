import { test, expect } from '@playwright/test';

async function open(page) {
  await page.goto('/es/');
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
}

test('settings stay inside a short viewport and all options remain reachable by scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await open(page);
  await page.locator('#scoreSettingsToggle').click();
  const popup = page.locator('#scoreSettingsPopup');
  const category = (name) => popup.locator('.score-settings-category').filter({ has: page.getByRole('checkbox', { name, exact: true }) });
  for (const [left, right] of [['Voces', 'Reproducción'], ['Reproducción', 'Intervalos']]) {
    const a = await category(left).boundingBox();
    const b = await category(right).boundingBox();
    expect(a.y).toBe(b.y);
    expect(b.x - a.x - a.width).toBeGreaterThan(0);
    expect(b.x - a.x - a.width).toBeLessThanOrEqual(20);
  }
  const repeats = await category('Repetición').boundingBox();
  const grid = await popup.locator('.score-settings-tools').boundingBox();
  expect(repeats.width).toBe(grid.width);
  const repeatIcons = await category('Repetición').locator('.score-settings-icon').evaluateAll((icons) => icons.map((el) => el.getBoundingClientRect().top));
  expect(new Set(repeatIcons).size).toBe(1);
  await expect(category('Intervalos').locator('svg path')).toHaveAttribute('d', 'm6 4 5.765 15.835a.25.25 0 00.47 0L18 4');
  await page.setViewportSize({ width: 1600, height: 360 });
  await expect.poll(async () => {
    const box = await popup.boundingBox();
    return box.y >= 8 && box.y + box.height <= 352;
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
  await intervals.check();
  await page.evaluate(() => window.ScoreStore.flush());
  await page.reload();
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
  await page.locator('#scoreSettingsToggle').click();
  await expect(intervals).toBeChecked();
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
  await expect(popup.locator('.score-settings-category').nth(1).locator('.score-settings-icon')).toHaveCount(2);
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
  await page.locator('#scoreSettingsPopup label').filter({ hasText: 'Piano' }).click();
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
  const voices = popup.getByRole('checkbox', { name: 'Voces' });
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
