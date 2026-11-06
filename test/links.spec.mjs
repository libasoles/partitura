import { test, expect } from '@playwright/test';
import M from '../src/client/score-model.js';

for (const shortcut of [false, true]) {
  for (const [type, pitch] of [['tie', 37], ['slur', 38]]) {
    test(`${shortcut ? 'parentheses' : 'the selection menu'} create, undo and remove an in-measure ${type}`, async ({ page }) => {
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
      if (shortcut) await page.keyboard.press('(');
      else await page.locator('.score-selection-action[data-action="link"]').click();
      const count = type === 'tie' ? 2 : 1;
      await expect(page.locator(`#scoreStage g.${type}`)).toHaveCount(count);
      await page.keyboard.press('Escape');
      await page.keyboard.press('ControlOrMeta+z');
      await expect(page.locator(`#scoreStage g.${type}`)).toHaveCount(count - 1);
      await page.keyboard.press('Escape');
      await select();
      if (shortcut) await page.keyboard.press('(');
      else await page.locator('.score-selection-action[data-action="link"]').click();
      await expect(page.locator(`#scoreStage g.${type}`)).toHaveCount(count);
      await page.evaluate(() => window.ScoreStore.flush());
      await page.reload();
      await expect(page.locator(`#scoreStage g.${type}`)).toHaveCount(count);
      await page.keyboard.press('Escape');
      await select();
      if (shortcut) await page.keyboard.press(')');
      else await page.locator('.score-selection-action[data-action="unlink"]').click();
      await expect(page.locator(`#scoreStage g.${type}`)).toHaveCount(count - 1);
      await expect(page.locator('#scoreStage g.tie')).toHaveCount(1);
    });
  }
}

test('parentheses follow the character, ignore repeats and reject invalid selections', async ({ page }) => {
  const score = { ...M.emptyScore(), instrument: 'guitar', clef: 'guitar' };
  score.rows[0][0] = [{ d: 'q', n: 37 }, { d: 'q', n: 38 }, { d: 'q', n: 39 }];
  await page.addInitScript(score => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [score] }));
  }, score);
  await page.goto('/es/');
  const note = i => page.locator(`[id="e0-${i}"] .notehead`);
  await expect(note(0)).toBeVisible();
  await page.keyboard.press('Escape');
  await note(0).click({ force: true });
  await note(2).click({ modifiers: ['ControlOrMeta'], force: true });
  await page.keyboard.press('(');
  await expect(page.locator('#scoreStage g.slur')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await note(0).click({ force: true });
  await note(1).click({ modifiers: ['ControlOrMeta'], force: true });
  const dispatch = init => page.locator('#scoreStage').dispatchEvent('keydown', { bubbles: true, ...init });
  await dispatch({ key: '8', code: 'Digit8' });
  await expect(page.locator('#scoreStage g.slur')).toHaveCount(0);
  await dispatch({ key: '(', code: 'Digit8', shiftKey: true });
  await expect(page.locator('#scoreStage g.slur')).toHaveCount(1);
  await dispatch({ key: '(', code: 'Digit8', shiftKey: true, repeat: true });
  await expect(page.locator('#scoreStage g.slur')).toHaveCount(1);
  await dispatch({ key: ')', code: 'Digit0', shiftKey: true, ctrlKey: true });
  await expect(page.locator('#scoreStage g.slur')).toHaveCount(1);
  await dispatch({ key: ')', code: 'Digit0', shiftKey: true });
  await expect(page.locator('#scoreStage g.slur')).toHaveCount(0);
});
