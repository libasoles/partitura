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

  // Tempo is written as a metronome mark.
  await popup.getByRole('group', { name: 'Tempo' }).getByRole('button', { name: '140' }).click();
  expect(await page.evaluate(() => window.scoreEditor.score.tempo)).toBe(140);
  await expect(page.locator('#scoreStage svg.definition-scale g.tempo')).toContainText('140');
  await popup.getByLabel('Tempo (negras por minuto)').fill('93');
  await popup.getByLabel('Tempo (negras por minuto)').press('Enter');
  expect(await page.evaluate(() => window.scoreEditor.score.tempo)).toBe(93);

  // Tool groups.
  const tools = popup.getByRole('group', { name: 'Herramientas' });
  await tools.getByRole('button', { name: 'Dinámica' }).click();
  await expect(page.locator('[data-hairpin="cresc"]')).toBeHidden();
  await tools.getByRole('button', { name: 'Repetición' }).click();
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
