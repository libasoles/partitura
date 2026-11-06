import { test, expect } from '@playwright/test';

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
