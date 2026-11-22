import { test, expect } from '@playwright/test';

for (const modifier of ['Meta', 'Control']) {
  for (const instrument of ['piano', 'voices']) {
    test(`${modifier}+A selects the score respecting legend voices (${instrument})`, async ({ page }) => {
      await page.goto('/es/#pro');
      await page.waitForFunction(() => window.scoreEditor);
      const before = await page.evaluate((instrument) => {
        const M = window.ScoreModel, editor = window.scoreEditor, score = editor.score;
        M.setInstrument(score, instrument);
        if (instrument === 'voices') {
          M.setParts(score, 2);
          score.voiceMap = [[2, 1], [1, 2]];
        }
        score.tools = { voices: true };
        score.rows = [[
          [{ d: 'q', n: 35, at: 0, v: 1 }, { d: 'q', n: 28, at: 0, v: 2 }, { d: 'q', rest: true, at: 24, v: 2 }],
          [{ d: 'q', n: 36, at: 0, v: 1 }, { d: 'q', n: 29, at: 0, v: 2 }],
        ]];
        score.lower = {
          0: [{ d: 'q', n: 23, at: 0, v: 1 }, { d: 'q', n: 21, at: 0, v: 2 }],
          1: [{ d: 'q', rest: true, at: 0, v: 1 }, { d: 'q', n: 22, at: 0, v: 2 }],
        };
        editor.render();
        return { rows: structuredClone(score.rows), lower: structuredClone(score.lower) };
      }, instrument);
      const selected = page.locator('#scoreStage g.note.is-selected, #scoreStage g.rest.is-selected');
      const stage = page.locator('#scoreStage');
      await stage.focus();
      await page.keyboard.press(`${modifier}+a`);
      await expect(selected).toHaveCount(9);
      await expect(stage).toBeFocused();
      await page.keyboard.press('Escape');
      const voice = page.locator('.score-voice-legend button[data-voice="2"]');
      await voice.click();
      await page.keyboard.press(`${modifier}+a`);
      const expected = instrument === 'piano' ? ['e0-1', 'e0-2', 'e1-1', 'l0-1', 'l1-1'] : ['e0-0', 'e1-0', 'l0-1', 'l1-1'];
      await expect.poll(() => selected.evaluateAll(nodes => nodes.map(n => n.id).sort())).toEqual(expected);
      await page.keyboard.press('Delete');
      const remaining = await page.evaluate(() => ({ rows: window.scoreEditor.score.rows, lower: window.scoreEditor.score.lower }));
      const upperVoice = instrument === 'piano' ? 1 : 2;
      expect(remaining.rows).toEqual(before.rows.map(row => row.map(measure => measure.filter(ev => ev.v === upperVoice))));
      expect(remaining.lower).toEqual(Object.fromEntries(Object.entries(before.lower).map(([mi, measure]) => [mi, measure.filter(ev => ev.v === 1)])));
      await page.keyboard.press(`${modifier}+z`);
      expect(await page.evaluate(() => ({ rows: window.scoreEditor.score.rows, lower: window.scoreEditor.score.lower }))).toEqual(before);
      // Multiple legend voices are combined; an empty voice clears the old selection.
      await page.locator('.score-voice-legend button[data-voice="1"]').click();
      await page.keyboard.press(`${modifier}+a`);
      await expect(selected).toHaveCount(9);
      await page.locator('.score-voice-legend button[data-voice="1"]').click();
      await voice.click();
      await page.locator('.score-voice-legend button[data-voice="4"]').click();
      await page.keyboard.press(`${modifier}+a`);
      await expect(selected).toHaveCount(0);
      await page.evaluate(() => {
        window.ScoreModel.setTool(window.scoreEditor.score, 'voices', false);
        window.scoreEditor.render();
      });
      await page.keyboard.press(`${modifier}+a`);
      await expect(selected).toHaveCount(9);
      // Text fields retain the browser's native select-all behavior.
      await page.locator('#scoreTitle').click();
      await page.locator('#scoreTitle').fill('Mi partitura');
      const prevented = await page.locator('#scoreTitle').evaluate((input, modifier) => {
        const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true, metaKey: modifier === 'Meta', ctrlKey: modifier === 'Control' });
        input.dispatchEvent(event);
        return event.defaultPrevented;
      }, modifier);
      expect(prevented).toBe(false);
      await page.keyboard.press('ControlOrMeta+a');
      await expect(selected).toHaveCount(0);
      expect(await page.locator('#scoreTitle').evaluate(input => [input.selectionStart, input.selectionEnd])).toEqual([0, 12]);
    });
  }
}
