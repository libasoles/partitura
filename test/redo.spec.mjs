import { test, expect } from '@playwright/test';
import M from '../src/client/score-model.js';

test('Shift+Z redoes what Ctrl+Z undid, and a new edit clears the redo', async ({ page }) => {
  const score = { ...M.emptyScore(), instrument: 'guitar', clef: 'guitar' };
  score.rows[0][0] = [{ d: 'q', n: 34, at: 0 }, { d: 'q', n: 36, at: 24 }];
  await page.addInitScript(score => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [score] }));
  }, score);
  await page.goto('/es/');
  const notes = page.locator('#scoreStage g.note');
  await expect(notes).toHaveCount(2);
  await page.locator('[id="e0-0"] .notehead').click();
  await page.keyboard.press('Delete');
  await expect(notes).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(notes).toHaveCount(2);
  await page.keyboard.press('Control+Shift+z');
  await expect(notes).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(notes).toHaveCount(2);
  await page.keyboard.press('Control+y');
  await expect(notes).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(notes).toHaveCount(2);
  await page.locator('[id="e0-1"] .notehead').click();
  await page.keyboard.press('Delete');
  await expect(notes).toHaveCount(1);
  await page.keyboard.press('Control+Shift+z');
  await expect(notes).toHaveCount(1);
});
