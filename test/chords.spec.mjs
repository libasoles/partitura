import { test, expect } from '@playwright/test';

async function guitar(page) {
  await page.goto('/es/');
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
  await page.locator('#scoreSettingsToggle').click();
  await page.locator('#scoreSettingsPopup').getByRole('group', { name: 'Instrumento' }).getByRole('radio', { name: 'Guitarra' }).check({ force: true });
  await page.keyboard.press('Escape');
}

// Punto sobre el pentagrama, a `spaces` espacios por encima de la primera linea del primer compas.
async function above(page, spaces, dx = 0) {
  const staff = await page.locator('#scoreStage g.measure').first().locator(':scope > g.staff > path').first().boundingBox();
  const second = await page.locator('#scoreStage g.measure').first().locator(':scope > g.staff > path').nth(1).boundingBox();
  const space = second.y - staff.y;
  return { x: staff.x + staff.width / 2 + dx, y: staff.y - spaces * space };
}

test('the chord tool is a guitar tool and the zone above the staff writes a chord name', async ({ page }) => {
  await page.goto('/es/');
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
  await expect(page.locator('[data-tool="chord"]')).toBeHidden();
  await guitar(page);
  await expect(page.locator('[data-tool="chord"]')).toBeVisible();

  // Sin herramienta activa, pasar el mouse bien arriba del pentagrama muestra el subrayado de la zona.
  const point = await above(page, 4.5);
  await page.mouse.move(point.x, point.y);
  await expect(page.locator('.score-chord-zone')).toBeVisible();
  await page.screenshot({ path: 'test-results/chord-zone.png' });

  // Pegado al pentagrama no hay zona.
  const near = await above(page, 1);
  await page.mouse.move(near.x, near.y);
  await expect(page.locator('.score-chord-zone')).toBeHidden();

  await page.mouse.move(point.x, point.y);
  await page.mouse.click(point.x, point.y);
  const draft = page.locator('.score-chord-draft');
  await expect(draft).toBeFocused();
  await draft.fill('Am7');
  await draft.press('Enter');
  expect(await page.evaluate(() => window.scoreEditor.score.chords)).toEqual({ 0: [{ at: 0, name: 'Am7' }] });
  const trigger = page.locator('.score-chord-trigger');
  await expect(trigger).toHaveCount(1);
  await expect(page.locator('#scoreStage g.dir').first()).toContainText('Am7');
  await page.screenshot({ path: 'test-results/chord-written.png' });

  // Click sobre el nombre: popup anclado con la digitacion y selectores de variante.
  await trigger.click();
  const popup = page.locator('#scoreChordPopup');
  await expect(popup).toBeVisible();
  await expect(popup.locator('svg.chord-diagram')).toBeVisible();
  await expect(popup.getByLabel('Nombre del acorde')).toHaveCount(0);
  await expect(popup.getByRole('button', { name: 'Quitar acorde' })).toHaveCount(0);
  const first = await popup.locator('svg.chord-diagram').innerHTML();
  await page.screenshot({ path: 'test-results/chord-popup.png' });
  await expect(popup.getByText('Variante 1 de')).toBeVisible();
  await popup.getByRole('button', { name: 'Variante siguiente' }).click();
  await expect(popup.getByText('Variante 2 de')).toBeVisible();
  expect(await popup.locator('svg.chord-diagram').innerHTML()).not.toBe(first);
  expect(await page.evaluate(() => window.scoreEditor.score.chords[0][0].variant)).toBe(1);

  // La linea donde se escribe, la zona y el nombre ya escrito comparten lugar.
  const written = await trigger.boundingBox();
  expect(written.y + written.height).toBeLessThan(point.y + 12);

  // Doble clic renombra; Suprimir quita.
  await trigger.dblclick();
  const edit = page.locator('.score-chord-draft');
  await expect(edit).toHaveValue('Am7');
  await edit.fill('G');
  await edit.press('Enter');
  expect(await page.evaluate(() => window.scoreEditor.score.chords[0][0])).toEqual({ at: 0, name: 'G' });
  await page.locator('.score-chord-trigger').focus();
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => window.scoreEditor.score.chords)).toBeUndefined();
  await expect(page.locator('.score-chord-trigger')).toHaveCount(0);
});

test('the palette button places a chord on a dropped note column and Escape cancels the draft', async ({ page }) => {
  await guitar(page);
  await page.locator('[data-tool="chord"]').click({ position: { x: 5, y: 5 } });
  const staff = await page.locator('#scoreStage g.measure').first().locator(':scope > g.staff > path').nth(2).boundingBox();
  await page.mouse.click(staff.x + 200, staff.y);
  const draft = page.locator('.score-chord-draft');
  await expect(draft).toBeFocused();
  await draft.press('Escape');
  await expect(draft).toHaveCount(0);
  expect(await page.evaluate(() => window.scoreEditor.score.chords)).toBeUndefined();
});
