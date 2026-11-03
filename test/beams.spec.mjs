import { test, expect } from '@playwright/test';
import M from '../src/client/score-model.js';

test('beaming selected lower chord notes preserves every chord and supports undo', async ({ page }, testInfo) => {
  const score = { ...M.emptyScore(), clef: 'guitar', fifths: -1, meter: '6/8' };
  score.rows[0][0] = [
    { n: 28, d: 'q', at: 0 }, { n: 35, d: 'q', at: 0 },
    { n: 30, d: 'e', at: 24 }, { n: 36, d: 'e', at: 24 },
    { n: 32, d: 'e', at: 36 }, { n: 38, d: 'e', at: 36 },
    { n: 28, d: 'q', at: 48 }, { n: 35, d: 'q', at: 48 },
  ];
  await page.addInitScript(score => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [score] }));
      sessionStorage.setItem('seeded', 'true');
    }
  }, score);
  await page.goto('/es/');
  const notes = page.locator('#scoreStage g.note');
  await expect(notes).toHaveCount(8);
  await page.locator('[id="e0-2"] .notehead').click();
  await page.locator('[id="e0-4"] .notehead').click({ modifiers: ['ControlOrMeta'] });
  await page.locator('[data-action="beam"]').click();
  await expect(notes).toHaveCount(8);
  const beam = page.locator('#scoreStage g.beam');
  await expect(beam).toHaveCount(1);
  await expect(beam.locator('g.note')).toHaveCount(4);
  await expect(beam.locator(':scope > polygon')).toHaveCount(1);
  await expect(page.locator('#scoreStage g.chord')).toHaveCount(4);
  await page.screenshot({ path: testInfo.outputPath('beamed-chords.png') });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(beam).toHaveCount(0);
  await expect(notes).toHaveCount(8);
});
