import { test, expect } from '@playwright/test';

for (const staff of [0, 1]) {
  test(`Cmd+vertical arrows duplicate a melody by a third in staff ${staff}, select copies and undo`, async ({ page }) => {
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
      await page.keyboard.press(`ControlOrMeta+${key}`);
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
      expect(state.copies).toEqual([37, 40, 39, 38].map((n, i) => ({ n: n - staff * 12 + 2 * delta, at: i * 24 })));
      await page.keyboard.press(key);
      const pitches = await page.evaluate((staff) => {
        const measure = window.ScoreModel.measures(window.scoreEditor.score, staff)[0];
        const selected = new Set([...document.querySelectorAll('#scoreStage g.note.is-selected')].map(node => +node.id.split('-')[1]));
        return {
          copies: measure.filter((_, i) => selected.has(i)).map(ev => ev.n),
          originals: measure.filter((_, i) => !selected.has(i)).map(ev => ev.n),
        };
      }, staff);
      expect(pitches.copies).toEqual([37, 40, 39, 38].map(n => n - staff * 12 + 3 * delta));
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

test('duplicating a melody in separate selections continues the existing second voice', async ({ page }) => {
  await page.addInitScript(() => {
    const score = {
      clef: 'guitar', instrument: 'guitar', meter: '6/8', fifths: -1,
      rows: [[[
        { d: 'h', n: 35, v: 1, at: 0, tie: true },
        { d: 'e', n: 35, v: 1, at: 48 },
        { d: 'e', n: 34, v: 1, at: 60 },
      ], [], [], []], [[], [], [], []], [[], [], [], []]],
    };
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [score] }));
  });
  await page.goto('/es/');
  await page.waitForFunction(() => window.scoreEditor);
  await expect(page.locator('[id="e0-0"] .notehead')).toBeVisible();
  // The hollow half-note head passes its centre hit through to the SVG;
  // the editor selects it by coordinates rather than by the painted target.
  const head = await page.locator('[id="e0-0"] .notehead').boundingBox();
  await page.mouse.click(head.x + head.width / 2, head.y + head.height / 2);
  await page.locator('[id="e0-1"] .notehead').click({ modifiers: ['ControlOrMeta'] });
  await expect(page.locator('#scoreStage g.note.is-selected')).toHaveCount(2);
  await page.locator('#scoreStage').focus();
  await page.keyboard.press('ControlOrMeta+ArrowDown');
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowDown');
  const before = await page.evaluate(() => structuredClone(window.scoreEditor.score.rows[0][0]));
  await page.locator('[id="e0-4"] .notehead').click();
  await page.keyboard.press('ControlOrMeta+ArrowDown');
  const expected = [...before, { d: 'e', n: 32, v: 2, at: 60 }];
  expect(await page.evaluate(() => window.scoreEditor.score.rows[0][0])).toEqual(expected);
  await expect(page.locator('#scoreStage g.tie')).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await page.evaluate(() => window.scoreEditor.score.rows[0][0])).toEqual(before);
});

test('Cmd+horizontal arrows duplicate the selection after and before it, and undo', async ({ page }) => {
  await page.goto('/es/');
  await page.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
  await page.waitForFunction(() => window.scoreEditor && document.querySelector('.score-doc-tab-input'));
  await page.evaluate(() => {
    const score = window.scoreEditor.score;
    score.rows[0][1] = [{ d: 'q', n: 37 }, { d: 'q', n: 40 }];
    window.scoreEditor.render();
  });
  const notes = () => page.evaluate(() => window.scoreEditor.score.rows.flatMap((row) => row.flat()).filter((e) => !e.rest).map((e) => e.n));
  await page.locator('[id="e1-0"] .notehead').click();
  await page.locator('#scoreStage').focus();
  await page.keyboard.press('ControlOrMeta+ArrowRight');
  expect((await notes()).filter((n) => n === 37)).toHaveLength(2);
  await page.keyboard.press('ControlOrMeta+z');
  expect((await notes()).filter((n) => n === 37)).toHaveLength(1);
  await page.locator('[id="e1-1"] .notehead').click();
  await page.keyboard.press('ControlOrMeta+ArrowLeft');
  expect((await notes()).filter((n) => n === 40)).toHaveLength(2);
});
