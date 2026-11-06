import { test, expect } from '@playwright/test';

for (const staff of [0, 1]) {
  test(`Shift+vertical arrows duplicate a melody in staff ${staff}, select copies and undo`, async ({ page }) => {
    await page.goto('/es/');
    await page.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
    await page.waitForFunction(() => window.scoreEditor && document.querySelector('.score-doc-tab-input'));
    await page.evaluate((staff) => {
      const score = window.scoreEditor.score;
      const melody = [37, 40, 39, 38].map(n => ({ d: 'q', n: n - staff * 12 }));
      if (staff) score.lower = { 0: melody };
      else score.rows[0][0] = melody;
      window.scoreEditor.render();
    }, staff);
    const prefix = staff ? 'l' : 'e';
    await page.locator(`[id="${prefix}0-0"] .notehead`).click();
    await page.locator('#scoreStage').focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight');
    await expect(page.locator('#scoreStage g.note.is-selected')).toHaveCount(4);

    for (const [key, delta] of [['ArrowUp', 1], ['ArrowDown', -1]]) {
      await page.keyboard.press(`Shift+${key}`);
      await expect(page.locator('#scoreStage g.note')).toHaveCount(8);
      await expect(page.locator('#scoreStage g.note.is-selected')).toHaveCount(4);
      const state = await page.evaluate((staff) => {
        const M = window.ScoreModel;
        const measure = M.measures(window.scoreEditor.score, staff)[0];
        const selected = [...document.querySelectorAll('#scoreStage g.note.is-selected')].map(node => +node.id.split('-')[1]);
        return {
          voices: M.voices(measure).length,
          copies: selected.map(i => ({ n: measure[i].n, at: M.onsets(measure)[i] })),
        };
      }, staff);
      expect(state.voices).toBe(2);
      expect(state.copies).toEqual([37, 40, 39, 38].map((n, i) => ({ n: n - staff * 12 + delta, at: i * 24 })));
      await page.keyboard.press(key);
      const pitches = await page.evaluate((staff) => {
        const measure = window.ScoreModel.measures(window.scoreEditor.score, staff)[0];
        const selected = new Set([...document.querySelectorAll('#scoreStage g.note.is-selected')].map(node => +node.id.split('-')[1]));
        return {
          copies: measure.filter((_, i) => selected.has(i)).map(ev => ev.n),
          originals: measure.filter((_, i) => !selected.has(i)).map(ev => ev.n),
        };
      }, staff);
      expect(pitches.copies).toEqual([37, 40, 39, 38].map(n => n - staff * 12 + 2 * delta));
      expect(pitches.originals).toEqual([37, 40, 39, 38].map(n => n - staff * 12));
      await page.keyboard.press('ControlOrMeta+z');
      await page.keyboard.press('ControlOrMeta+z');
      await expect(page.locator('#scoreStage g.note')).toHaveCount(4);
      // Undo clears the selection; select the original line again for the next direction.
      await page.locator(`[id="${prefix}0-0"] .notehead`).click();
      await page.locator('#scoreStage').focus();
      for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowRight');
    }
  });
}
