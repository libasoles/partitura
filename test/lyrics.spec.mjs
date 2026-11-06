import { test, expect } from '@playwright/test';

async function open(page, hash = '#pro') {
  await page.goto('/es/' + hash);
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
}

// Cuatro negras en el primer compas del pentagrama indicado, escritas desde el modelo.
async function notes(page, staff = 0) {
  await page.evaluate((staffIndex) => {
    const { score, render } = window.scoreEditor;
    const M = window.ScoreModel;
    const measure = M.measures(score, staffIndex)[0];
    [0, 1, 2, 3].forEach((k) => M.insertNote(measure, { d: 'q', n: 33 - staffIndex * 7 }, k * 24));
    render && render();
  }, staff);
}

test('lyrics are typed under the notes and advance with space and hyphen', async ({ page }) => {
  await open(page);
  await notes(page);
  await page.locator('[data-tool="lyric"]').click({ position: { x: 5, y: 5 } });
  const note = await page.locator('#scoreStage g.measure').first().locator('.notehead').first().boundingBox();
  await page.mouse.click(note.x + note.width / 2, note.y + note.height / 2);
  const draft = page.locator('.score-lyric-draft');
  await expect(draft).toBeFocused();
  await page.keyboard.type('glo-ri-a pa');
  await draft.press('Enter');
  expect(await page.evaluate(() => window.scoreEditor.score.lyrics)).toEqual({
    0: [{ at: 0, text: 'glo', hy: true }, { at: 24, text: 'ri', hy: true }, { at: 48, text: 'a' }, { at: 72, text: 'pa' }],
  });
  await expect(page.locator('#scoreStage g.verse')).toHaveCount(4);
  await expect(page.locator('.score-lyric-trigger')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/lyrics-written.png' });

  // Editar y quitar una silaba.
  await page.locator('.score-lyric-trigger').nth(3).click();
  await expect(draft).toHaveValue('pa');
  await draft.fill('');
  await draft.press('Enter');
  expect(await page.evaluate(() => window.scoreEditor.score.lyrics[0].length)).toBe(3);
});

test('piano takes lyrics on the top staff only', async ({ page }) => {
  await open(page);
  await notes(page, 1);
  await page.locator('[data-tool="lyric"]').click({ position: { x: 5, y: 5 } });
  const note = await page.locator('#scoreStage g.measure').first().locator('.notehead').first().boundingBox();
  await page.mouse.click(note.x + note.width / 2, note.y + note.height / 2);
  await expect(page.locator('.score-lyric-draft')).toHaveCount(0);
  expect(await page.evaluate(() => window.scoreEditor.score.lyrics)).toBeUndefined();
});

test('a pasted lyric is syllabified and spread over the notes and measures', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const { score, render } = window.scoreEditor;
    const M = window.ScoreModel;
    [0, 1].forEach((mi) => [0, 1, 2, 3].forEach((k) => M.insertNote(M.measures(score)[mi], { d: 'q', n: 33 }, k * 24)));
    render();
  });
  await page.locator('[data-tool="lyric"]').click({ position: { x: 5, y: 5 } });
  const note = await page.locator('#scoreStage g.measure').first().locator('.notehead').first().boundingBox();
  await page.mouse.click(note.x + note.width / 2, note.y + note.height / 2);
  const draft = page.locator('.score-lyric-draft');
  await expect(draft).toBeFocused();
  await draft.evaluate((input) => {
    const data = new DataTransfer();
    data.setData('text', 'Camino de la noche\nYpacaraí');
    input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  // Ocho notas: las ocho primeras silabas; el resto se avisa.
  await expect(page.locator('#scoreStage g.verse')).toHaveCount(8);
  const lyrics = await page.evaluate(() => window.scoreEditor.score.lyrics);
  expect(lyrics[0].map((l) => l.text)).toEqual(['Ca', 'mi', 'no', 'de']);
  expect(lyrics[1].map((l) => l.text)).toEqual(['la', 'no', 'che', 'Y']);
  await page.screenshot({ path: 'test-results/lyrics-pasted.png' });
});

test('lyrics are a Pro feature: no tool without #pro in the URL', async ({ page }) => {
  await open(page, '');
  await expect(page.locator('[data-tool="lyric"]')).toHaveCount(0);
});

test("the \"Letra de canto\" setting shows or hides the lyric tool", async ({ page }) => {
  await open(page);
  await expect(page.locator('[data-tool="lyric"]')).toBeVisible();
  await page.locator('#scoreSettingsToggle').click();
  const check = page.locator('#scoreSettingsPopup').getByRole('checkbox', { name: 'Letra de canto', exact: true });
  await expect(check).toBeChecked();
  await check.uncheck();
  await expect(page.locator('[data-tool="lyric"]')).toBeHidden();
  await check.check();
  await expect(page.locator('[data-tool="lyric"]')).toBeVisible();
});
