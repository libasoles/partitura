import { test, expect } from '@playwright/test';

async function open(page) {
  await page.goto('/es/');
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
}

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
  await instrument.getByRole('radio', { name: 'Guitarra' }).check();
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
  await page.reload();
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
  await expect(page.locator('[data-hairpin="cresc"]')).toBeHidden();

  // Back to piano: TAB and barre go away and the guitar clef becomes a plain treble clef.
  await page.locator('#scoreSettingsToggle').click();
  await page.locator('#scoreSettingsPopup').getByRole('radio', { name: 'Piano' }).check();
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
  const legend = page.locator('.score-voice-legend li');
  await expect(legend).toHaveText(['1', '2', '3', '4']);
  const colors = await legend.evaluateAll((items) => items.map((li) => getComputedStyle(li).backgroundColor));
  expect(new Set(colors).size).toBe(4);
  await voices.uncheck();
  await expect(page.locator('.score-voice-legend')).toHaveCount(0);
});

test('with Voces on, notes of different voices get different colours', async ({ page }) => {
  const score = { rows: [[[{ d: 'h', n: 35, v: 1, at: 0 }, { d: 'h', n: 28, v: 2, at: 0 }]]], meter: '4/4', clef: 'treble', fifths: 0 };
  await page.addInitScript((data) => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [data] }));
    localStorage.setItem('partitura.settings.v1', JSON.stringify({ 'tools.voices': true }));
  }, score);
  await open(page);
  await expect(page.locator('#scoreStage g.note[data-voice]')).toHaveCount(2);
  const fills = await page.locator('#scoreStage g.note[data-voice] .notehead').evaluateAll((nodes) => nodes.map((n) => getComputedStyle(n).fill));
  expect(new Set(fills).size).toBe(2);
});
