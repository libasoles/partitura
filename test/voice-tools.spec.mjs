import { test, expect } from '@playwright/test';

async function open(page) {
  await page.goto('/es/#pro');
  await page.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
  await page.evaluate(() => {
    const score = window.scoreEditor.score;
    score.instrument = 'guitar';
    score.clef = 'guitar';
    score.tools = { voices: true, intervals: true };
    score.rows[0][0] = [37, 40, 39, 38].map(n => ({ d: 'q', n }));
    window.scoreEditor.render();
  });
}

for (const [id, steps] of [['Fourth', 3], ['Fifth', 4]]) {
  test(`duplicate a ${id.toLowerCase()} below and undo`, async ({ page }) => {
    await open(page);
    await page.locator('#scoreDuplicateVoice' + id).click();
    expect(await page.evaluate(() => window.scoreEditor.score.rows[0][0].filter(ev => ev.v === 2).map(ev => ev.n)))
      .toEqual([37, 40, 39, 38].map(n => n - steps));
    await page.locator('#scoreStage').focus();
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('#scoreStage g.note')).toHaveCount(4);
    const ids = await page.locator('.score-duplicate-voice-toggle').evaluateAll(nodes => nodes.map(n => n.id));
    expect(ids).toEqual(['scoreDuplicateVoice', 'scoreDuplicateVoiceFourth', 'scoreDuplicateVoiceFifth', 'scoreDuplicateVoiceSixth']);
  });
}

test('repair voices from Settings preserves rhythm in both staves and undoes', async ({ page }) => {
  await open(page);
  const before = await page.evaluate(() => {
    const score = window.scoreEditor.score;
    score.instrument = 'piano';
    const measure = [0, 24].flatMap(at => [40, 34].map(n => ({ d: 'q', n, at, v: 1 })));
    score.rows[0][0] = structuredClone(measure);
    score.lower = { 0: structuredClone(measure).map(ev => ({ ...ev, n: ev.n - 14 })) };
    window.scoreEditor.render();
    return { upper: structuredClone(score.rows[0][0]), lower: structuredClone(score.lower[0]) };
  });
  await page.locator('#scoreSettingsToggle').click();
  await page.getByRole('button', { name: 'Recalcular voces', exact: true }).click();
  const after = await page.evaluate(() => ({ upper: window.scoreEditor.score.rows[0][0], lower: window.scoreEditor.score.lower[0] }));
  for (const staff of ['upper', 'lower']) {
    expect(after[staff].map(ev => ev.v)).toEqual([1, 2, 1, 2]);
    expect(after[staff].map(({ v, ...ev }) => ev)).toEqual(before[staff].map(({ v, ...ev }) => ev));
  }
  await page.keyboard.press('Escape');
  await page.locator('#scoreStage').focus();
  await page.keyboard.press('ControlOrMeta+z');
  expect(await page.evaluate(() => ({ upper: window.scoreEditor.score.rows[0][0], lower: window.scoreEditor.score.lower[0] }))).toEqual(before);
});

test('tooltips rise above neighboring tool icons', async ({ page }) => {
  await open(page);
  const interval = page.locator('#scoreIntervals');
  await interval.hover();
  await page.waitForTimeout(650);
  const layers = await page.evaluate(() => {
    const interval = document.querySelector('#scoreIntervals');
    const chord = document.querySelector('#scoreChordNames');
    return { tooltipOwner: (parseInt(getComputedStyle(interval).zIndex) || 0), neighbor: (parseInt(getComputedStyle(chord).zIndex) || 0) };
  });
  expect(layers.tooltipOwner).toBeGreaterThan(layers.neighbor);
});

test('choir: a third followed by a sixth keeps three independent legend voices', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const M = window.ScoreModel, score = window.scoreEditor.score;
    M.setInstrument(score, 'voices');
    M.setParts(score, 2);
    window.scoreEditor.render();
  });
  await page.locator('#scoreDuplicateVoice').click();
  const oldLegend = await page.evaluate(() => window.ScoreModel.legendOf(window.scoreEditor.score, 0, 1));
  await page.locator('.score-voice-legend button[data-voice="1"]').click();
  await page.locator('#scoreDuplicateVoiceSixth').click();
  const state = await page.evaluate(() => {
    const M = window.ScoreModel, score = window.scoreEditor.score;
    const measure = score.rows[0][0];
    return { legends: M.voices(measure).map((_, k) => M.legendOf(score, 0, k)), pitches: measure.filter(ev => ev.v === 2).map(ev => ev.n) };
  });
  expect(state.legends[2]).toBe(oldLegend);
  expect(new Set(state.legends).size).toBe(3);
  expect(state.pitches).toEqual([32, 35, 34, 33]);
});
