import { test, expect } from '@playwright/test';

async function guitar(page) {
  await page.goto('/es/');
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
  await page.locator('#scoreSettingsToggle').click();
  await page.locator('#scoreSettingsPopup').getByRole('group', { name: 'Instrumento' }).getByRole('radio', { name: 'Guitarra' }).check({ force: true });
  await page.keyboard.press('Escape');
}

async function writeChord(page, name) {
  const staff = await page.locator('#scoreStage g.measure').first().locator(':scope > g.staff > path').first().boundingBox();
  const second = await page.locator('#scoreStage g.measure').first().locator(':scope > g.staff > path').nth(1).boundingBox();
  const x = staff.x + staff.width / 2, y = staff.y - 4.5 * (second.y - staff.y);
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
  await page.locator('.score-chord-draft').fill(name);
  await page.locator('.score-chord-draft').press('Enter');
  return staff;
}

test('a name without fingering opens a search: solfege and any case find the chord, and picking one renames it', async ({ page }) => {
  await guitar(page);
  await writeChord(page, 'Qx');
  await page.locator('.score-chord-trigger').click();
  const popup = page.locator('#scoreChordPopup');
  await expect(popup.getByText('No hay digitación para este acorde')).toBeVisible();
  const field = popup.getByRole('searchbox');
  await expect(field).toHaveValue('Qx');
  await field.fill('si');
  const first = popup.locator('.score-chord-results button').first();
  await expect(first).toContainText('B');
  await expect(popup.getByText('No hay digitación para este acorde')).toBeHidden();
  await expect(popup.locator('.score-chord-results button', { hasText: 'Em(add9)' })).toHaveCount(0);
  await first.click();
  expect(await page.evaluate(() => window.scoreEditor.score.chords)).toEqual({ 0: [{ at: 0, name: 'B' }] });
  await expect(popup.locator('.score-chord-picture svg.chord-diagram')).toBeVisible();
  await expect(popup.getByRole('searchbox')).toBeHidden();
});

test('a click outside the chord popup closes it', async ({ page }) => {
  await guitar(page);
  const staff = await writeChord(page, 'Am7');
  const popup = page.locator('#scoreChordPopup');
  const trigger = page.locator('.score-chord-trigger');

  await trigger.click();
  await expect(popup).toBeVisible();
  await page.mouse.click(staff.x + staff.width * 0.8, staff.y + 8); // sobre el pentagrama
  await expect(popup).toBeHidden();

  await trigger.click();
  await expect(popup).toBeVisible();
  await page.mouse.click(5, 500); // fuera del editor
  await expect(popup).toBeHidden();
});
