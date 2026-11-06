import { test, expect } from '@playwright/test';
import M from '../src/client/score-model.js';

for (const [type, pitch] of [['tie', 37], ['slur', 38]]) {
  test(`the selection menu creates, undoes and removes an in-measure ${type}`, async ({ page }) => {
    const score = { ...M.emptyScore(), instrument: 'guitar', clef: 'guitar' };
    score.rows[0][0] = [{ d: 'w', n: 37, tie: true }];
    score.rows[0][1] = [{ d: 'h', n: 37 }, { d: 'e', n: pitch }, { d: 'e', n: 36 }];
    await page.addInitScript(score => {
      if (!sessionStorage.getItem('links-seeded')) {
        localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [score] }));
        sessionStorage.setItem('links-seeded', 'true');
      }
    }, score);
    await page.goto('/es/');
    await expect(page.locator('#scoreStage g.tie')).toHaveCount(1);
    const select = async () => {
      await page.locator('[id="e1-0"] .notehead').click({ force: true });
      await page.locator('[id="e1-1"] .notehead').click({ modifiers: ['ControlOrMeta'], force: true });
    };
    await page.keyboard.press('Escape');
    await select();
    await page.locator('.score-selection-action[data-action="link"]').click();
    const count = type === 'tie' ? 2 : 1;
    await expect(page.locator(`#scoreStage g.${type}`)).toHaveCount(count);
    await page.keyboard.press('Escape');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator(`#scoreStage g.${type}`)).toHaveCount(count - 1);
    await page.keyboard.press('Escape');
    await select();
    await page.locator('.score-selection-action[data-action="link"]').click();
    await expect(page.locator(`#scoreStage g.${type}`)).toHaveCount(count);
    await page.evaluate(() => window.ScoreStore.flush());
    await page.reload();
    await expect(page.locator(`#scoreStage g.${type}`)).toHaveCount(count);
    await page.keyboard.press('Escape');
    await select();
    await page.locator('.score-selection-action[data-action="unlink"]').click();
    await expect(page.locator(`#scoreStage g.${type}`)).toHaveCount(count - 1);
    await expect(page.locator('#scoreStage g.tie')).toHaveCount(1);
  });
}
