import { test, expect } from '@playwright/test';
import M from '../src/client/score-model.js';

test('dropping a note left of the first figure of a bar puts it first, not on top of it', async ({ page }) => {
  const score = { ...M.emptyScore(), clef: 'guitar' };
  score.rows[0][0] = [{ d: 'q', n: 37, v: 1, at: 0 }];
  score.rows[0][1] = [{ d: 'e', n: 38, v: 1, at: 0 }, { d: 'q', n: 38, v: 1, at: 12 }, { d: 'e', n: 36, v: 1, at: 36 }];
  await page.addInitScript(score => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [score] }));
  }, score);
  await page.goto('/es/');
  await expect(page.locator('#scoreStage g.note')).toHaveCount(4);
  await page.evaluate(() => {
    const save = window.ScoreStore.save;
    window.ScoreStore.save = value => { window.lastSavedScore = structuredClone(value); save(value); };
  });
  const first = await page.locator('[id="e1-0"] .notehead').boundingBox();
  const a = await page.locator('[id="e0-0"] .notehead').boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x - 14, a.y + a.height / 2, { steps: 10 });
  await page.mouse.up();
  const rows = await page.evaluate(() => window.lastSavedScore.scores[0].rows[0]);
  expect(rows[0]).toHaveLength(0);
  expect(rows[1].map(e => e.d)).toEqual(['q', 'e', 'q', 'e']);
  expect(new Set(rows[1].map(e => e.at)).size).toBe(4);
});
