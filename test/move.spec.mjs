import { test, expect } from '@playwright/test';
import M from '../src/client/score-model.js';

test('moving a bass eighth under the A preserves the measure', async ({ page }, testInfo) => {
  const score = { ...M.emptyScore(), clef: 'guitar', meter: '6/8', fifths: -1 };
  score.rows[0][0] = [
    { d: 'e', rest: true, v: 1, at: 0 },
    { d: 'e', n: 28, v: 2, at: 0 },
    { d: 'e', n: 33, v: 1, at: 12 },
    { d: 'e', n: 35, v: 1, at: 24 },
    { d: 'e', n: 28, v: 1, at: 24 },
    { d: 'e', n: 40, v: 1, at: 36 },
    { d: 'e', n: 39, v: 1, at: 48 },
    { d: 'q', n: 24, v: 2, at: 48 },
    { d: 'e', n: 41, tie: true, v: 1, at: 60 },
  ];
  await page.addInitScript(score => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [score] }));
  }, score);
  await page.goto('/es/');
  const notes = page.locator('#scoreStage g.note');
  await expect(notes).toHaveCount(8);
  await page.evaluate(() => {
    const save = window.ScoreStore.save;
    window.ScoreStore.save = value => {
      window.lastSavedScore = structuredClone(value);
      save(value);
    };
  });
  const source = await page.locator('[id="e0-1"] .notehead').boundingBox();
  const target = await page.locator('[id="e0-2"] .notehead').boundingBox();
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2 + 2, source.y + source.height / 2 + 2, { steps: 10 });
  await page.mouse.up();
  await expect(notes).toHaveCount(8);
  // Moving a bass note onto a melody column must not turn it into a chord member.
  await expect(page.locator('[id="e0-2"]')).toHaveClass(/note/);
  expect(await page.locator('[id="e0-2"]').evaluate(node => !!node.closest('g.chord'))).toBe(false);
  const expected = structuredClone(score.rows[0][0]);
  const moved = expected.splice(1, 1)[0];
  moved.at = 12;
  expected.splice(2, 0, moved);
  expect(await page.evaluate(() => window.lastSavedScore.scores[0].rows[0][0])).toEqual(expected);
  await page.screenshot({ path: testInfo.outputPath('moved-bass.png') });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(notes).toHaveCount(8);
  expect(await page.evaluate(() => window.lastSavedScore.scores[0].rows[0][0])).toEqual(score.rows[0][0]);
});
