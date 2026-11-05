import { test, expect } from '@playwright/test';
import M from '../src/client/score-model.js';

// do-sol-mi-re en corcheas en el primer compas; el resto vacio.
function source() {
  const score = M.emptyScore();
  [30, 34, 32, 31].forEach((n, i) => M.insertAt(score.rows[0][0], { d: 'e', n }, i * 12));
  return score;
}

async function open(page, extra = {}) {
  await page.addInitScript(({ score, extra }) => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [score] }));
    localStorage.setItem('partitura.settings.v1', JSON.stringify(extra));
  }, { score: source(), extra });
  await page.goto('/es/');
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
}

test('the library is off until it is switched on in the settings', async ({ page }) => {
  await open(page);
  await expect(page.locator('.score-library')).toBeHidden();
  await page.locator('#scoreSettingsToggle').click();
  await page.getByRole('checkbox', { name: 'Patrones' }).check();
  await expect(page.locator('.score-library')).toBeVisible();
  await expect(page.locator('.score-library-empty')).toHaveText('No hay patrones guardados');
});

test('Shift+S saves the selected notes as degrees and a drag writes them at the dropped pitch', async ({ page }) => {
  await open(page, { patterns: true });
  await page.locator('#scoreStage').focus();
  await page.locator('[id="e0-0"] .notehead').click();
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Shift+ArrowRight');
  const first = await page.locator('[id="e0-0"] .notehead').boundingBox();
  await page.keyboard.press('Shift+S');
  await expect(page.locator('.score-pattern')).toHaveCount(1);
  await expect(page.locator('.score-pattern-degrees')).toHaveText('I V III II');
  // Saved once: the same selection again does not add a duplicate.
  await page.keyboard.press('Shift+S');
  await expect(page.locator('.score-pattern')).toHaveCount(1);

  // Drag the relative section onto the second measure, two steps above where the original began.
  const item = await page.locator('.score-pattern-notes').boundingBox();
  const target = first;
  const staff = await page.locator('#scoreStage g.measure').nth(1).boundingBox();
  await page.mouse.move(item.x + item.width / 2, item.y + item.height / 2);
  await page.mouse.down();
  await page.mouse.move(staff.x + 40, target.y + target.height / 2 - 10, { steps: 8 });
  await page.mouse.up();
  const notes = await page.evaluate(() => window.scoreEditor.score.rows[0][1].map((ev) => ev.n));
  expect(notes).toHaveLength(4);
  expect(notes.map((n) => n - notes[0])).toEqual([0, 4, 2, 1]);

  // The rhythm section writes the same figures all at one pitch.
  const third = await page.locator('#scoreStage g.measure').nth(2).boundingBox();
  const rhythm = await page.locator('.score-pattern-rhythm').boundingBox();
  await page.mouse.move(rhythm.x + rhythm.width / 2, rhythm.y + rhythm.height / 2);
  await page.mouse.down();
  await page.mouse.move(third.x + 40, third.y + third.height * 0.25, { steps: 8 });
  await page.mouse.up();
  const flat = await page.evaluate(() => window.scoreEditor.score.rows[0][2].map((ev) => ev.n));
  expect(flat).toHaveLength(4);
  expect(new Set(flat).size).toBe(1);
});

test('a chosen measure is saved with Shift+S and a click on a pattern writes it there', async ({ page }) => {
  await open(page, { patterns: true });
  const measure = await page.locator('#scoreStage g.measure').nth(0).boundingBox();
  // Click an empty stretch of the first measure, away from its notes, to choose the measure.
  await page.mouse.click(measure.x + measure.width * 0.8, measure.y + measure.height / 2);
  await page.keyboard.press('Shift+S');
  await expect(page.locator('.score-pattern')).toHaveCount(1);
  await page.locator('#scoreStage g.measure').nth(1).click({ position: { x: 30, y: 4 }, force: true });
  await page.locator('.score-pattern-notes').click();
  const count = await page.evaluate(() => window.scoreEditor.score.rows[0][1].length);
  expect(count).toBe(4);
});
