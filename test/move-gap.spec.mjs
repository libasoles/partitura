import { test, expect } from '@playwright/test';
import M from '../src/client/score-model.js';

async function open(page, measure) {
  const score = { ...M.emptyScore(), clef: 'treble' };
  score.rows[0][0] = measure;
  await page.addInitScript(score => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [score] }));
  }, score);
  await page.goto('/es/');
  await expect(page.locator('#scoreStage g.note')).toHaveCount(measure.length);
  await page.evaluate(() => {
    const save = window.ScoreStore.save;
    window.ScoreStore.save = value => { window.lastSavedScore = structuredClone(value); save(value); };
  });
}

async function drag(page, id, dx) {
  const a = await page.locator(`[id="${id}"] .notehead`).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + dx, a.y + a.height / 2, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  return page.evaluate(() => window.lastSavedScore?.scores[0].rows[0][0] ?? []);
}

test('dropping the last note further right inside the bar leaves a rest in the gap', async ({ page }) => {
  await open(page, [{ d: 'e', n: 40, v: 1, at: 0 }, { d: 'q', n: 38, v: 1, at: 12 }]);
  const bar = await drag(page, 'e0-1', 120);
  expect(bar.map(e => e.d)).toContain('q');
  expect(bar.some(e => e.rest)).toBe(true);
  const last = bar[bar.length - 1];
  expect(last.rest).toBeUndefined();
  expect(last.at).toBeGreaterThan(12);
});

test('dropping a note within its own spot adds no rest', async ({ page }) => {
  await open(page, [{ d: 'e', n: 40, v: 1, at: 0 }, { d: 'q', n: 38, v: 1, at: 12 }]);
  const bar = await drag(page, 'e0-1', 4);
  expect(bar.some(e => e.rest)).toBe(false);
});
