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
  await expect(instrument.getByRole('button')).toHaveText(['Piano', 'Guitarra']);
  await expect(instrument.getByRole('button', { name: 'Piano' })).toHaveAttribute('aria-pressed', 'true');

  // Guitar: TAB and barre appear and the clef becomes treble 8.
  await instrument.getByRole('button', { name: 'Guitarra' }).click();
  await expect(page.locator('#scoreTabToggle')).toBeVisible();
  await expect(page.locator('[data-tool="barre"]')).toBeVisible();
  expect(await page.evaluate(() => window.scoreEditor.score.clef)).toBe('guitar');

  // Tempo is a slider and is written as a metronome mark.
  const slider = popup.getByRole('slider');
  await slider.fill('140');
  expect(await page.evaluate(() => window.scoreEditor.score.tempo)).toBe(140);
  await expect(page.locator('#scoreStage svg.definition-scale g.tempo')).toContainText('140');
  await popup.getByRole('button', { name: 'Sin indicación' }).click();
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
  await page.locator('#scoreSettingsPopup').getByRole('button', { name: 'Piano' }).click();
  await expect(page.locator('#scoreTabToggle')).toBeHidden();
  expect(await page.evaluate(() => window.scoreEditor.score.clef)).toBe('treble');
  await page.keyboard.press('Escape');
  await expect(page.locator('#scoreSettingsPopup')).toBeHidden();
});
