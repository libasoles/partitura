import { test, expect } from '@playwright/test';

const seed = (page, rows) => page.addInitScript((rows) => {
  localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [{
    instrument: 'piano', meter: '4/4', clef: 'treble', fifths: 0,
    tools: { intervals: true, voices: true },
    rows,
  }] }));
}, rows);

test('chord names sit above the intervals and list the other possibilities in a tooltip', async ({ page }) => {
  await seed(page, [[[
    { d: 'w', n: 32, v: 1, at: 0 }, { d: 'w', n: 30, v: 2, at: 0 }, { d: 'w', n: 28, v: 3, at: 0 }, { d: 'w', n: 33, v: 4, at: 0 },
  ]]]);
  await page.goto('/es/#pro');
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
  const chords = page.locator('#scoreChordNames');
  const intervals = page.locator('#scoreIntervals');
  await expect(chords).toHaveAttribute('data-tooltip', 'Nombre del acorde');
  expect((await chords.boundingBox()).y).toBeLessThan((await intervals.boundingBox()).y);
  for (const voice of [1, 2, 3, 4]) await page.locator(`.score-voice-legend button[data-voice="${voice}"]`).click();
  await chords.click();
  await expect(chords).toHaveAttribute('aria-pressed', 'true');
  const dir = page.locator('#scoreStage g.dir');
  await expect(dir).toHaveCount(1);
  await expect(dir.locator('title')).toHaveText('También podría ser: Am7/C');
  expect(await dir.evaluate((node) => [...node.querySelectorAll('tspan.text')].map((span) => span.textContent).join('').replace(/\s/g, ''))).toBe('C6');
  await intervals.click();
  await expect(page.locator('#scoreStage g.dir')).toHaveCount(2);
  const boxes = await page.locator('#scoreStage g.dir').evaluateAll((nodes) => nodes.map((node) => ({ text: [...node.querySelectorAll('tspan.text')].map((span) => span.textContent).join('').replace(/\s/g, ''), bottom: node.getBoundingClientRect().bottom, top: node.getBoundingClientRect().top })));
  const name = boxes.find((box) => box.text.startsWith('C6'));
  const labels = boxes.find((box) => /^[IVX]+$/.test(box.text));
  expect(name.bottom).toBeLessThanOrEqual(labels.top);
  await page.screenshot({ path: '/tmp/partitura-chord-names.png' });
});

test('chord names are Pro only and need three voices', async ({ page }) => {
  await seed(page, [[[{ d: 'w', n: 32, v: 1, at: 0 }, { d: 'w', n: 30, v: 2, at: 0 }]]]);
  await page.goto('/es/');
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
  await expect(page.locator('#scoreChordNames')).toHaveCount(0);
  await page.goto('/es/#pro');
  await page.reload();
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
  await page.locator('#scoreChordNames').click();
  await expect(page.locator('#scoreChordNames')).toHaveAttribute('aria-pressed', 'false');
});
