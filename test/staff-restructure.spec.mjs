import { test, expect } from '@playwright/test';

const score = (extra = {}) => ({
  instrument: 'guitar', meter: '4/4', clef: 'guitar', fifths: 0, parts: 3, tools: { voices: true },
  rows: [[[{ d: 'w', n: 40 }]]], lower: { 0: [{ d: 'w', n: 37 }] }, lower2: { 0: [{ d: 'w', n: 30 }] }, ...extra,
});

const staves = (page) => page.locator('#scoreStage g.measure').first().locator(':scope > g.staff');

async function open(page, hash = '#pro', extra = {}) {
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript((data) => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [data] }));
  }, score(extra));
  await page.goto('/es/' + hash);
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
  return errors;
}

test('Pro: the voices category offers join and split, asking which staves or voices', async ({ page }) => {
  const errors = await open(page);
  await expect(staves(page)).toHaveCount(3);
  const button = page.locator('#scoreRestructure');
  await expect(button).toBeVisible();
  await button.click();
  const popup = page.locator('#scoreRestructurePopup');
  await expect(popup).toBeVisible();
  // Nothing happens until two staves are chosen.
  const join = popup.getByRole('button', { name: 'Unir', exact: true });
  await expect(join).toBeDisabled();
  await popup.locator('.score-restructure-staff[data-staff="1"]').click();
  await expect(join).toBeDisabled();
  await popup.locator('.score-restructure-staff[data-staff="2"]').click();
  await join.click();
  await expect(staves(page)).toHaveCount(2);
  // The joined staff now has two voices (2 and 3) that can be told apart again.
  await button.click();
  await expect(popup.locator('.score-restructure-row button')).toHaveCount(2);
  const split = popup.getByRole('button', { name: 'Separar', exact: true });
  await expect(split).toBeDisabled();
  await popup.locator('.score-restructure-row button[data-voice="3"]').click();
  await split.click();
  await expect(staves(page)).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('without the voices tool, or without Pro, there is no join/split button', async ({ page }) => {
  await open(page, '#pro', { tools: { voices: false } });
  await expect(page.locator('#scoreRestructure')).toHaveCount(0);
});

test('free sites do not offer it', async ({ page }) => {
  await open(page, '');
  await expect(page.locator('#scoreRestructure')).toHaveCount(0);
});
