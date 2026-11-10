import { test, expect } from '@playwright/test';
import M from '../src/client/score-model.js';

// La nota hereda la alteracion (de otra nota del compas o de la armadura): el becuadro debe dibujarse.
for (const [name, fifths, first] of [['from a previous sharp', 0, { d: 'e', n: 30, acc: '#' }], ['from the key signature', 2, { d: 'e', n: 31 }]]) {
  test(`natural on a note that inherits an accidental ${name}`, async ({ page }) => {
    const score = { ...M.emptyScore(), fifths };
    score.rows[0][0] = [first, { d: 'e', n: first.n }];
    await page.addInitScript(score => {
      localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [score] }));
    }, score);
    await page.goto('/es/');
    await expect(page.locator('#scoreStage g.note')).toHaveCount(2);
    await page.locator('[id="e0-1"] .notehead').click();
    await page.keyboard.press('c');
    await expect.poll(() => page.evaluate(() => window.scoreEditor.score.rows[0][0][1].acc)).toBe('n');
    await expect(page.locator('[id="e0-1"] .accid')).toHaveCount(1);
  });
}
