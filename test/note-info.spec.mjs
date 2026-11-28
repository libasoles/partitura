import { test, expect } from '@playwright/test';

const seed = (page, instrument, rows, tonic) => page.addInitScript(([instrument, rows, tonic]) => {
  localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [{ instrument, meter: '4/4', clef: 'treble', fifths: 0, rows, ...(tonic ? { tonic } : {}) }] }));
}, [instrument, rows, tonic]);

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

test('the neighbouring measures break the tie between C6 and Am7/C', async ({ page }) => {
  const at = (ns, d = 'q', step = 24) => ns.map((n, k) => ({ d, n, v: 1, at: k * step }));
  // E G B D F A | C E G A (selected) | G7, all arpeggiated. The measure before has six different pitch classes, so only
  // sweeping from the selection outwards finds Dm (A, F, D) and stops before reaching E G B.
  await seed(page, 'piano', [[at([30, 32, 34, 29, 31, 33], 'e', 12), at([28, 30, 32, 33]), at([32, 34, 36, 38])]], 'C');
  await page.goto('/es/?banner=hide');
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
  await page.locator('[id="e1-0"] .notehead').click();
  for (let k = 0; k < 3; k += 1) await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('i');
  const popup = page.locator('#scoreNoteInfo');
  await expect(popup.locator('.score-note-info-name')).toHaveText('Am7/C');
  await expect(popup.locator('.score-note-info-others')).toContainText('C6');
  await expect(popup.locator('.score-note-info-context')).toHaveText('Según el contexto: Dm → Am7/C → G');
});

test('I on piano shows the chord without a fingering', async ({ page }) => {
  await seed(page, 'piano', arpeggio);
  await page.goto('/es/');
  await selectAll(page);
  await page.keyboard.press('i');
  const popup = page.locator('#scoreNoteInfo');
  await expect(popup.locator('.score-note-info-name')).toHaveText('C');
  await expect(popup.locator('svg.chord-diagram')).toHaveCount(0);
});

test('I with two notes shows their interval and no chord section', async ({ page }) => {
  await seed(page, 'piano', [[[{ d: 'h', n: 28, v: 1, at: 0 }, { d: 'h', n: 30, v: 1, at: 48 }]]]);
  await page.goto('/es/');
  await selectAll(page);
  await page.keyboard.press('i');
  const popup = page.locator('#scoreNoteInfo');
  await expect(popup.locator('h3')).toHaveText(['Notas', 'Intervalo']);
  await expect(popup.locator('.score-note-info-intervals li')).toHaveCount(1);
  await expect(popup.locator('.score-note-info-intervals strong')).toHaveText('3ª mayor');
  await expect(popup.locator('.score-note-info-semitones')).toHaveText('4 semitonos');
  await expect(popup).not.toContainText('Acorde');
});

test('I with several notes lists every interval between them', async ({ page }) => {
  await seed(page, 'piano', arpeggio);
  await page.goto('/es/');
  await selectAll(page);
  await page.keyboard.press('i');
  const popup = page.locator('#scoreNoteInfo');
  await expect(popup.locator('h3')).toHaveText(['Notas', 'Intervalos', 'Acorde']);
  // C3 E3 G3 (the repeated E is one pitch): three pairs.
  await expect(popup.locator('.score-note-info-intervals li')).toHaveCount(3);
  await expect(popup.locator('.score-note-info-intervals strong')).toHaveText(['3ª mayor', '5ª justa', '3ª menor']);
});
