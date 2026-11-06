import { test, expect } from '@playwright/test';

async function open(page) {
  await page.goto('/es/#pro');
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
}

// Dos compases de cuatro negras con una sílaba por nota (Can-to-de-la-ma-ñana ...), escritos desde el modelo.
async function prepare(page, { tie = false } = {}) {
  await page.evaluate((withTie) => {
    const { score, render } = window.scoreEditor;
    const M = window.ScoreModel;
    [0, 1].forEach((mi) => [0, 1, 2, 3].forEach((k) => M.insertNote(M.measures(score)[mi], { d: 'q', n: 33 }, k * 24)));
    if (withTie) M.measures(score)[0][2].tie = true;
    M.distributeLyrics(score, 0, 0, 0, ['Can', 'to', 'de', 'la', 'ma', 'ña'].map((text) => ({ text })));
    render();
  }, tie);
  await expect(page.locator('#scoreStage g.verse')).toHaveCount(6);
}

const lyrics = (page) => page.evaluate(() => Object.entries(window.scoreEditor.score.lyrics || {}).flatMap(([mi, list]) => list.map((l) => mi + ':' + l.at + ':' + l.text)));

test('the lyric tool does not open a field on a tied note', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const { score, render } = window.scoreEditor;
    const M = window.ScoreModel;
    [0, 1, 2, 3].forEach((k) => M.insertNote(M.measures(score)[0], { d: 'q', n: 33 }, k * 24));
    M.measures(score)[0][2].tie = true;
    render();
  });
  await page.locator('[data-tool="lyric"]').click({ position: { x: 5, y: 5 } });
  const tied = await page.locator('#scoreStage g.measure').first().locator('.notehead').nth(3).boundingBox();
  await page.mouse.click(tied.x + tied.width / 2, tied.y + tied.height / 2);
  await expect(page.locator('.score-lyric-draft')).toHaveCount(0);
  await expect(page.getByText('Nota ligada').first()).toBeVisible();
  await page.locator('[data-tool="lyric"]').click({ position: { x: 5, y: 5 } });
  const free = await page.locator('#scoreStage g.measure').first().locator('.notehead').nth(2).boundingBox();
  await page.mouse.click(free.x + free.width / 2, free.y + free.height / 2);
  await expect(page.locator('.score-lyric-draft')).toBeFocused();
});

test('a written syllable is dragged to a free note', async ({ page }) => {
  await open(page);
  await prepare(page);
  await page.evaluate(() => window.ScoreModel.removeLyric(window.scoreEditor.score, 1, 0) && window.scoreEditor.render());
  const trigger = page.locator('.score-lyric-trigger[data-measure="0"][data-at="24"]');
  const from = await trigger.boundingBox();
  // La nota libre del compás 1 (at 0): se arrastra la sílaba "to" hasta su columna.
  const target = await page.locator('#scoreStage g.measure').nth(1).locator('.notehead').first().boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, from.y + from.height / 2, { steps: 12 });
  await expect(page.locator('.score-lyric-zone:not([hidden])')).toHaveCount(1);
  await page.mouse.up();
  expect(await lyrics(page)).toEqual(['0:0:Can', '0:48:de', '0:72:la', '1:0:to', '1:24:ña']);
});

test('two selected syllables are merged from the menu and the rest close the gap', async ({ page }) => {
  await open(page);
  await prepare(page);
  await page.locator('[id="e0-0"] .notehead').click({ force: true });
  await page.locator('[id="e0-1"] .notehead').click({ modifiers: ['ControlOrMeta'], force: true });
  const action = page.locator('.score-selection-action[data-action="mergeLyrics"]');
  await expect(action).toBeVisible();
  await expect(action).toContainText('Unir sílabas');
  await action.click();
  expect(await lyrics(page)).toEqual(['0:0:Can-to', '0:24:de', '0:48:la', '0:72:ma', '1:0:ña']);
  await expect(page.locator('.score-selection-action[data-action="mergeLyrics"]')).toHaveCount(0);
  // Se puede deshacer.
  await page.keyboard.press('Control+z');
  expect(await lyrics(page)).toEqual(['0:0:Can', '0:24:to', '0:48:de', '0:72:la', '1:0:ma', '1:24:ña']);
});

test('shift-clicking syllables adds their notes to the selection', async ({ page }) => {
  await open(page);
  await prepare(page);
  await page.locator('.score-lyric-trigger[data-measure="0"][data-at="0"]').click({ modifiers: ['Shift'] });
  await page.locator('.score-lyric-trigger[data-measure="0"][data-at="48"]').click({ modifiers: ['Shift'] });
  await expect(page.locator('.score-lyric-draft')).toHaveCount(0);
  await expect(page.locator('.score-selection-action[data-action="mergeLyrics"]')).toBeVisible();
  await page.locator('.score-selection-action[data-action="mergeLyrics"]').click();
  expect(await lyrics(page)).toEqual(['0:0:Can-de', '0:24:to', '0:48:la', '0:72:ma', '1:0:ña']);
});
