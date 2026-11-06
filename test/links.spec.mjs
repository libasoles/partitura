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

for (const type of ['tie', 'slur']) {
  for (const staff of [0, 1]) {
    for (const placement of ['within measure', 'across rows']) {
      test(`click selects and deletes only a ${type} on staff ${staff} ${placement}`, async ({ page }) => {
        const score = { ...M.emptyScore(), instrument: 'piano', tools: { voices: true } };
        const first = { d: placement === 'within measure' ? 'h' : 'w', n: staff ? 23 : 37, [type]: true };
        const second = { d: first.d, n: first.n + (type === 'slur' ? 1 : 0) };
        const from = placement === 'within measure' ? 0 : score.rows[0].length - 1;
        const to = placement === 'within measure' ? 0 : from + 1;
        const lane = M.measures(score, staff);
        lane[from].push(first);
        lane[to].push(second);
        await page.addInitScript(score => {
          localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [score] }));
        }, score);
        await page.goto('/es/');
        const links = page.locator(`#scoreStage g.${type}`);
        await expect(links.first()).toBeVisible();
        await page.keyboard.press('Escape');
        const notes = page.locator('#scoreStage g.note');
        await expect(notes).toHaveCount(2);
        const clickArc = async () => {
          const arc = placement === 'across rows' ? links.last() : links.first();
          await arc.scrollIntoViewIfNeeded();
          const point = await arc.locator('path:not(.score-link-hit)').evaluate(path => {
            const p = path.getPointAtLength(path.getTotalLength() / 4);
            const screen = new DOMPoint(p.x, p.y).matrixTransform(path.getScreenCTM());
            return { x: screen.x, y: screen.y };
          });
          await page.mouse.click(point.x, point.y);
        };
        await clickArc();
        for (const arc of await links.all()) await expect(arc).toHaveClass(/is-selected/);
        await expect(page.locator('#scoreStage g.note.is-selected')).toHaveCount(0);
        await expect(page.locator('#scoreStage .is-bar-selected')).toHaveCount(0);
        await expect(links.first().locator('path:not(.score-link-hit)')).toHaveCSS('fill', 'rgb(246, 200, 95)');
        await page.keyboard.press('Escape');
        await expect(page.locator(`#scoreStage g.${type}.is-selected`)).toHaveCount(0);
        await clickArc();
        await page.keyboard.press('Delete');
        await expect(links).toHaveCount(0);
        await expect(notes).toHaveCount(2);
        await page.keyboard.press('ControlOrMeta+z');
        await expect(links.first()).toBeVisible();
        await clickArc();
        await page.keyboard.press('Backspace');
        await expect(links).toHaveCount(0);
        await expect(notes).toHaveCount(2);
      });
    }
  }
}
