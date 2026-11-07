import { test, expect } from '@playwright/test';

test('choir intervals stay above the first staff when the first two voices are silent', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [{
      instrument: 'voices', parts: 4, meter: '4/4', clef: 'treble',
      tools: { intervals: true, voices: true }, rows: [[[]]],
      lower2: { 0: [{ d: 'h', n: 35 }, { d: 'h', n: 36 }] },
      lower3: { 0: [{ d: 'w', n: 30 }] },
      lyrics: { 0: [{ s: 2, at: 0, text: 'Can' }, { s: 2, at: 32, text: 'to' }] },
    }] }));
  });
  await page.goto('/es/#pro');
  await page.locator('#scoreStage:not([aria-busy]) g.note').first().waitFor();
  for (const voice of [3, 4]) await page.locator(`.score-voice-legend button[data-voice="${voice}"]`).click();
  await page.locator('#scoreIntervals').click();
  const intervals = page.locator('#scoreStage g.dir').filter({ hasText: /^[IVXL\s]+$/ });
  await expect(intervals).toHaveCount(2);
  for (const width of [1440, 1100]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect.poll(() => intervals.evaluateAll((nodes) => nodes.every((node) => {
      const top = node.closest('g.measure').querySelector('g.staff > path').getBoundingClientRect().top;
      return top - node.getBoundingClientRect().bottom >= 8;
    }))).toBe(true);
  }
});

test('interval labels keep a minimum gap above the staff and notes, and chord names sit above them', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [{
      instrument: 'guitarra', meter: '4/4', clef: 'treble', fifths: -1,
      tools: { intervals: true, voices: true },
      chords: { 0: [{ at: 0, name: 'Am' }, { at: 2, name: 'Dm' }] },
      rows: [[[
        { d: 'h', n: 35, at: 0 }, { d: 'h', n: 33, at: 0 },
        { d: 'e', n: 36, at: 16 }, { d: 'e', n: 34, at: 16 }, { d: 'e', n: 39, at: 24 }, { d: 'e', n: 32, at: 24 },
      ], [
        { d: 'q', n: 30, at: 0 }, { d: 'q', n: 28, at: 0 }, { d: 'q', n: 31, at: 8 }, { d: 'q', n: 27, at: 8 },
      ]]],
    }] }));
  });
  await page.goto('/es/');
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
  for (const voice of [1, 2]) await page.locator(`.score-voice-legend button[data-voice="${voice}"]`).click();
  await page.locator('#scoreIntervals').click();
  await expect(page.locator('#scoreIntervals')).toHaveAttribute('aria-pressed', 'true');
  await page.waitForTimeout(500);
  const result = await page.evaluate(() => {
    const roman = /^[IVXL]+$/;
    const boxes = [...document.querySelectorAll('#scoreStage g.measure g.dir')].map((node) => ({ text: node.textContent.replace(/\s/g, ''), r: node.getBoundingClientRect() }));
    const intervals = boxes.filter((b) => roman.test(b.text));
    const chords = boxes.filter((b) => !roman.test(b.text));
    const staffTop = document.querySelector('#scoreStage g.staff > path').getBoundingClientRect().top;
    const notes = [...document.querySelectorAll('#scoreStage g.note, #scoreStage g.beam')].map((n) => n.getBoundingClientRect());
    return {
      count: intervals.length,
      gapToStaff: Math.min(...intervals.map((b) => staffTop - b.r.bottom)),
      noteOverlap: intervals.some((b) => notes.some((n) => n.right > b.r.left && n.left < b.r.right && n.top < b.r.bottom && n.bottom > b.r.top)),
      chordsAbove: chords.every((c) => intervals.every((b) => b.r.right < c.r.left || b.r.left > c.r.right || c.r.bottom <= b.r.top)),
      chordCount: chords.length,
    };
  });
  expect(result.count).toBeGreaterThan(0);
  expect(result.gapToStaff).toBeGreaterThanOrEqual(8);
  expect(result.noteOverlap).toBe(false);
  expect(result.chordCount).toBe(2);
  expect(result.chordsAbove).toBe(true);
});
