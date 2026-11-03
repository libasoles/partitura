import { test, expect } from '@playwright/test';
import M from '../src/client/score-model.js';
import F from '../src/client/score-fingering.js';

test('alternate tunings assign sounding pitches and survive sanitization', () => {
  for (const tuning of M.TUNINGS) {
    const score = M.sanitize({ ...M.emptyScore(), tuning: tuning.id });
    expect(M.tuningOf(score).id).toBe(tuning.id);
    const midis = tuning.opens.map(midi => [midi]);
    F.assign(midis, tuning.opens).forEach((cells, i) => {
      expect(cells.length).toBe(1);
      expect(tuning.opens[cells[0][0]] + cells[0][1]).toBe(midis[i][0]);
    });
  }
  expect(M.tuningOf(M.sanitize({ ...M.emptyScore(), tuning: 'invalid' })).id).toBe('standard');
  expect(F.assign([[38]], M.tuningOf({ tuning: 'drop-d' }).opens)).toEqual([[[5, 0]]]);
});

test('first tab opens tuning popup, recalculates frets, undoes and persists', async ({ page }, testInfo) => {
  const score = { ...M.emptyScore(), showTabs: true, clef: 'guitar' };
  score.rows[0][0] = [{ n: 23, d: 'q' }]; // E3 written, sounding E2 in guitar clef.
  await page.addInitScript(score => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [score] }));
      sessionStorage.setItem('seeded', 'true');
    }
  }, score);
  await page.goto('/es/');
  const trigger = page.locator('.score-tuning-trigger');
  await expect(trigger).toHaveCount(1);
  await expect(trigger.locator('span')).toHaveText(['E', 'B', 'G', 'D', 'A', 'E']);
  const fret = page.locator('ascii-tabs').first().locator('.ascii-tabs-fret');
  await expect(fret).toHaveText(['0']);
  await trigger.click();
  await expect(page.locator('#scoreTuningPopup')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('tuning-popup.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('#scoreTuningPopup')).not.toBeVisible();
  await trigger.click();
  await page.locator('[data-tuning="drop-d"]').click();
  await expect(trigger.locator('span')).toHaveText(['E', 'B', 'G', 'D', 'A', 'D']);
  await expect(fret).toHaveText(['2']);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(trigger.locator('span')).toHaveText(['E', 'B', 'G', 'D', 'A', 'E']);
  await expect(fret).toHaveText(['0']);
  await trigger.click();
  await page.locator('[data-tuning="dadgad"]').click();
  await expect(trigger.locator('span')).toHaveText(['D', 'A', 'G', 'D', 'A', 'D']);
  await page.waitForTimeout(500);
  await page.reload();
  await expect(trigger.locator('span')).toHaveText(['D', 'A', 'G', 'D', 'A', 'D']);
  const labels = await trigger.boundingBox();
  const firstFret = await fret.first().boundingBox();
  expect(labels.x + labels.width).toBeLessThan(firstFret.x);
});
