import { test, expect } from '@playwright/test';
import M from '../src/client/score-model.js';

test.use({ viewport: { width: 1920, height: 1080 } });

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
  await page.goto('/es/#pro');
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
}

test('the library is off until it is switched on in the settings', async ({ page }) => {
  await open(page);
  await expect(page.locator('.score-library')).toBeHidden();
  await page.locator('#scoreSettingsToggle').click();
  await page.getByRole('checkbox', { name: 'Biblioteca de patrones', exact: true }).check();
  await expect(page.locator('.score-library')).toBeVisible();
  await expect(page.locator('.score-library-empty')).toHaveText('No hay patrones guardados');
});

test('the library is Pro only and preserves saved patterns without Pro', async ({ page }) => {
  const pattern = M.patternFromMeasure(source(), 0);
  await open(page, { patterns: true, patternItems: [pattern] });
  await expect(page.locator('.score-library')).toBeVisible();
  await page.goto('/es/');
  await page.reload();
  await page.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
  await page.locator('#scoreSettingsToggle').click();
  await expect(page.getByRole('checkbox', { name: 'Biblioteca de patrones', exact: true })).toHaveCount(0);
  await expect(page.locator('.score-library')).toBeHidden();
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+S');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('partitura.settings.v1')).patternItems)).toEqual([pattern]);
  await page.goto('/es/#pro');
  await page.reload();
  await expect(page.locator('.score-pattern')).toHaveCount(1);
});

test('Shift+S saves the selected notes as degrees and a drag writes them at the dropped pitch', async ({ page }) => {
  await open(page, { patterns: true });
  await page.locator('#scoreStage').focus();
  await page.locator('[id="e0-0"] .notehead').click();
  for (let i = 0; i < 3; i += 1) await page.keyboard.press('Shift+ArrowRight');
  const first = await page.locator('[id="e0-0"] .notehead').boundingBox();
  await page.keyboard.press('Shift+S');
  await expect(page.locator('.score-pattern')).toHaveCount(1);
  await expect(page.locator('.score-pattern-notes g.note')).toHaveCount(4);
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

test('multi-measure patterns stay on one scrollable line with internal barlines', async ({ page }) => {
  const score = source();
  score.rows[0][0] = [{ d: 'h', n: 37 }, { d: 'e', n: 37 }, { d: 'e', n: 36 }];
  score.rows[0][1] = [{ d: 'e', n: 35 }, { d: 'e', n: 35 }, { d: 'q', rest: true }, { d: 'e', rest: true }, { d: 'e', n: 34 }];
  const refs = [0, 1].flatMap(mi => score.rows[0][mi].map((_, i) => ({ mi, i })));
  const pattern = M.patternFrom(score, refs);
  await open(page, { patterns: true, patternItems: [pattern] });
  const preview = page.locator('.score-pattern-notes');
  await expect(preview.locator('g.system')).toHaveCount(1);
  await expect(preview.locator('g.measure')).toHaveCount(2);
  await expect(preview.locator('g.note')).toHaveCount(6);
  await expect(preview.locator('g.rest')).toHaveCount(2);
  await expect(preview.locator('g.barLine:not([display="none"])')).toHaveCount(1);
  const scroll = page.locator('.score-pattern-scroll');
  expect(await scroll.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  const rhythmBefore = await page.locator('.score-pattern-rhythm').boundingBox();
  await scroll.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  expect(await scroll.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  expect(await page.locator('.score-pattern-rhythm').boundingBox()).toEqual(rhythmBefore);
  const last = await preview.locator('g.note').last().boundingBox();
  const frame = await scroll.boundingBox();
  expect(last.x).toBeGreaterThanOrEqual(frame.x);
  expect(last.x + last.width).toBeLessThanOrEqual(frame.x + frame.width);
});

test('saved patterns show both kinds of links and restore them when applied', async ({ page }) => {
  const score = source();
  score.rows[0][0] = [{ d: 'h', n: 37, tie: true }];
  score.rows[0][1] = [{ d: 'q', n: 37, slur: true }, { d: 'q', n: 38 }];
  const pattern = M.patternFrom(score, [{ mi: 0, i: 0 }, { mi: 1, i: 0 }, { mi: 1, i: 1 }]);
  await open(page, { patterns: true, patternItems: [JSON.parse(JSON.stringify(pattern))] });
  const preview = page.locator('.score-pattern-notes');
  await expect(preview.locator('g.tie')).toHaveCount(1);
  await expect(preview.locator('g.slur')).toHaveCount(1);
  // Arcs sit outside g.layer; the crop must include their complete bounds.
  for (const arc of await preview.locator('g.tie, g.slur').all()) {
    const box = await arc.boundingBox();
    const frame = await preview.locator('.score-pattern-staff').boundingBox();
    expect(box.y).toBeGreaterThanOrEqual(frame.y);
    expect(box.y + box.height).toBeLessThanOrEqual(frame.y + frame.height);
  }
  await page.locator('#scoreStage g.measure').nth(1).click({ position: { x: 30, y: 4 }, force: true });
  await preview.click();
  await expect(page.locator('#scoreStage g.tie')).toHaveCount(1);
  await expect(page.locator('#scoreStage g.slur')).toHaveCount(1);
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
