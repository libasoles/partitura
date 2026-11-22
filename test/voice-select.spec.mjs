import { test, expect } from '@playwright/test';

for (const instrument of ['piano', 'voices']) {
  test(`Shift+click selects a whole legend voice for deletion and undo (${instrument})`, async ({ page }) => {
    await page.goto('/es/#pro');
    await page.waitForFunction(() => window.scoreEditor);
    const before = await page.evaluate((instrument) => {
      const M = window.ScoreModel, editor = window.scoreEditor, score = editor.score;
      M.setInstrument(score, instrument);
      if (instrument === 'voices') {
        M.setParts(score, 2);
        // Joined staves can have legend numbers different from notation voices.
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
    const voice = page.locator('.score-voice-legend button[data-voice="2"]');
    await voice.click();
    await expect(page.locator('#scoreStage g.note.is-selected, #scoreStage g.rest.is-selected')).toHaveCount(0);
    const expected = instrument === 'piano' ? ['e0-1', 'e0-2', 'e1-1', 'l0-1', 'l1-1'] : ['e0-0', 'e1-0', 'l0-1', 'l1-1'];
    await voice.click({ modifiers: ['Shift'] });
    await expect.poll(() => page.locator('#scoreStage g.note.is-selected, #scoreStage g.rest.is-selected').evaluateAll(nodes => nodes.map(n => n.id).sort())).toEqual(expected);
    await expect(voice).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#scoreStage')).toBeFocused();
    await page.keyboard.press('Delete');
    const remaining = await page.evaluate(() => {
      const score = window.scoreEditor.score;
      return { rows: score.rows, lower: score.lower };
    });
    const upperVoice = instrument === 'piano' ? 1 : 2;
    expect(remaining.rows).toEqual(before.rows.map(row => row.map(measure => measure.filter(ev => ev.v === upperVoice))));
    expect(remaining.lower).toEqual(Object.fromEntries(Object.entries(before.lower).map(([mi, measure]) => [mi, measure.filter(ev => ev.v === 1)])));
    await page.keyboard.press('ControlOrMeta+z');
    expect(await page.evaluate(() => ({ rows: window.scoreEditor.score.rows, lower: window.scoreEditor.score.lower }))).toEqual(before);
    // Empty voices clear the previous selection, so Delete cannot remove another voice.
    await page.locator('.score-voice-legend button[data-voice="4"]').click({ modifiers: ['Shift'] });
    await expect(page.locator('#scoreStage g.note.is-selected, #scoreStage g.rest.is-selected')).toHaveCount(0);
    await page.keyboard.press('Delete');
    expect(await page.evaluate(() => ({ rows: window.scoreEditor.score.rows, lower: window.scoreEditor.score.lower }))).toEqual(before);
  });
}
