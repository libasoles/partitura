import { test, expect } from '@playwright/test';
import M from '../src/client/score-model.js';

test('adding an eighth below the first eighth preserves both measures', async ({ page }, testInfo) => {
  const score = { ...M.emptyScore(), clef: 'guitar', meter: '6/8', fifths: -1 };
  score.rows[0][0] = [
    { d: 'e', rest: true, v: 1, at: 0 },
    { d: 'e', n: 33, v: 1, at: 12 },
    { d: 'e', n: 35, v: 1, at: 24 },
    { d: 'e', n: 28, v: 1, at: 24 },
    { d: 'e', n: 40, v: 1, at: 36 },
    { d: 'e', n: 39, v: 1, at: 48 },
    { d: 'e', n: 24, v: 2, at: 48 },
    { d: 'e', n: 41, tie: true, v: 1, at: 60 },
  ];
  score.rows[0][1] = [
    { d: 'h', n: 41, dot: true, v: 1, at: 0 },
    { d: 'q', rest: true, n: 24, v: 2, at: 0 },
    { d: 'q', n: 25, v: 2, at: 24 },
    { d: 'q', n: 25, v: 2, at: 48 },
  ];
  await page.addInitScript(score => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [score] }));
  }, score);
  await page.goto('/es/');
  await expect(page.locator('#scoreStage g.note')).toHaveCount(10);
  const first = await page.locator('[id="e0-1"] .notehead').boundingBox();
  const low = await page.locator('[id="e0-3"] .notehead').boundingBox();
  const tool = await page.locator('[data-shortcut="3"]').boundingBox();
  await page.mouse.move(tool.x + tool.width / 2, tool.y + tool.height / 2);
  await page.mouse.down();
  await page.mouse.move(first.x + first.width / 2 + 2, low.y + low.height / 2 + 2, { steps: 10 });
  await page.mouse.up();
  const result = await page.evaluate(() => window.scoreEditor.score);
  const expected = structuredClone(score.rows[0][0]);
  expected.splice(2, 0, { d: 'e', n: 28, v: 2, at: 12 });
  expect(result.rows[0][0]).toEqual(expected);
  expect(result.rows[0][1]).toEqual(score.rows[0][1]);
  const ids = await page.locator('#scoreStage g.note, #scoreStage g.rest').evaluateAll(nodes => nodes.map(node => node.id));
  const refs = ids.map(id => /^e(\d+)-(\d+)$/.exec(id)).filter(Boolean).map(match => ({ mi: +match[1], i: +match[2] }));
  // Copying a visible selection must include the beamed notes too (regression for 339effc).
  const copied = M.copySelection(result, refs);
  expect(copied.measures).toEqual([expected, score.rows[0][1]]);
  await expect(page.locator('#scoreStage g.note')).toHaveCount(11);
  await page.screenshot({ path: testInfo.outputPath('inserted-eighth.png') });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#scoreStage g.note')).toHaveCount(10);
  expect(await page.evaluate(() => window.scoreEditor.score.rows[0].slice(0, 2))).toEqual(score.rows[0].slice(0, 2));
});
