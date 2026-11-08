import { test, expect } from '@playwright/test';

test('Pro guitar adds voices as staves that share one TAB', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [{
      instrument: 'guitar', showTabs: true, meter: '4/4', clef: 'guitar', fifths: 0,
      rows: [[[{ d: 'w', n: 37 }]]], parts: 2, lower: { 0: [{ d: 'w', n: 30 }] },
    }] }));
  });
  await page.goto('/es/#pro');
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
  await expect(page.locator('#scoreStage g.measure').first().locator(':scope > g.staff')).toHaveCount(2);
  await expect(page.locator('#scoreStage ascii-tabs')).toHaveCount(await page.locator('#scoreStage g.system').count());
  await page.locator('#scoreSettingsToggle').click();
  const slider = page.getByRole('slider', { name: 'Cantidad de voces' }).and(page.locator(':visible'));
  await expect(slider).toHaveCount(1);
  await slider.fill('3');
  await expect(page.locator('#scoreStage g.measure').first().locator(':scope > g.staff')).toHaveCount(3);
  await expect(page.locator('#scoreStage ascii-tabs')).toHaveCount(await page.locator('#scoreStage g.system').count());
  await slider.fill('1');
  await expect(page.locator('#scoreStage g.measure').first().locator(':scope > g.staff')).toHaveCount(1);
  expect(errors).toEqual([]);
});

test('guitar voices slider is Pro only', async ({ page }) => {
  await page.goto('/es/');
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
  await page.locator('#scoreSettingsToggle').click();
  await page.getByRole('group', { name: 'Instrumento' }).locator('label').filter({ hasText: 'Guitarra' }).click();
  await expect(page.getByRole('slider', { name: 'Cantidad de voces' }).and(page.locator(':visible'))).toHaveCount(0);
});
