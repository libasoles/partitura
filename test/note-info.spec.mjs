import { test, expect } from '@playwright/test';

const seed = (page, instrument, rows) => page.addInitScript(([instrument, rows]) => {
  localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [{ instrument, meter: '4/4', clef: 'treble', fifths: 0, rows }] }));
}, [instrument, rows]);

// Un arpegio de do mayor (do-mi-sol-mi): notas en sucesion, no alineadas.
const arpeggio = [[[
  { d: 'q', n: 28, v: 1, at: 0 }, { d: 'q', n: 30, v: 1, at: 24 }, { d: 'q', n: 32, v: 1, at: 48 }, { d: 'q', n: 30, v: 1, at: 72 },
]]];

async function selectAll(page) {
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
  await page.locator('#scoreStage').click({ position: { x: 5, y: 5 } });
  await page.keyboard.press('Control+A');
}

test('I names the chord formed by a selected arpeggio and draws its fingering on guitar', async ({ page }) => {
  await seed(page, 'guitar', arpeggio);
  await page.goto('/es/');
  await selectAll(page);
  await page.keyboard.press('i');
  const popup = page.locator('#scoreNoteInfo');
  await expect(popup).toBeVisible();
  await expect(popup.locator('.score-note-info-name')).toHaveText('C');
  await expect(popup.locator('.score-note-info-notes')).toContainText('C3');
  await expect(popup.locator('svg.chord-diagram')).toHaveCount(1);
  await page.keyboard.press('i');
  await expect(popup).toBeHidden();
});

test('I on piano shows the chord without a fingering, and asks for three notes otherwise', async ({ page }) => {
  await seed(page, 'piano', arpeggio);
  await page.goto('/es/');
  await selectAll(page);
  await page.keyboard.press('i');
  const popup = page.locator('#scoreNoteInfo');
  await expect(popup.locator('.score-note-info-name')).toHaveText('C');
  await expect(popup.locator('svg.chord-diagram')).toHaveCount(0);
});

test('I with fewer than three different notes explains why there is no chord', async ({ page }) => {
  await seed(page, 'piano', [[[{ d: 'h', n: 28, v: 1, at: 0 }, { d: 'h', n: 30, v: 1, at: 48 }]]]);
  await page.goto('/es/');
  await selectAll(page);
  await page.keyboard.press('i');
  await expect(page.locator('#scoreNoteInfo .score-note-info-none')).toHaveText('Elegí al menos tres notas distintas para ver el acorde');
});
