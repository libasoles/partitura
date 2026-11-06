import { test, expect } from '@playwright/test';
import { createScoreModel } from '../src/client/score-model.js';

const M = createScoreModel({ grandStaff: true });

for (const staff of [0, 1]) {
  test(`clipboard events preserve ties and slurs on staff ${staff}, including undo`, async ({ page }) => {
    const score = { ...M.emptyScore(), instrument: 'piano' };
    const lane = M.measures(score, staff);
    lane[0].push({ d: 'w', n: staff ? 25 : 37, tie: true });
    lane[1].push({ d: 'h', n: staff ? 25 : 37, slur: true }, { d: 'h', n: staff ? 27 : 39 });
    await page.addInitScript(score => {
      localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [score] }));
    }, score);
    await page.goto('/es/');
    await expect(page.locator('#scoreStage g.tie')).toHaveCount(1);
    await expect(page.locator('#scoreStage g.slur')).toHaveCount(1);
    await page.keyboard.press('Escape');
    const prefix = staff ? 'l' : 'e';
    await page.locator(`[id="${prefix}0-0"] .notehead`).click({ force: true });
    for (const i of [0, 1]) await page.locator(`[id="${prefix}1-${i}"] .notehead`).click({ modifiers: ['ControlOrMeta'], force: true });
    const clipboard = await page.locator('#scoreStage').evaluate(stage => {
      const data = new DataTransfer();
      stage.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
      return data.getData('text/plain');
    });
    expect(JSON.parse(clipboard).measures[0][0].tie).toBe(true);
    expect(JSON.parse(clipboard).measures[1][0].slur).toBe(true);
    await page.locator('[id="m2"] > g.staff').nth(staff).click({ position: { x: 30, y: 4 }, force: true });
    await page.locator('#scoreStage').evaluate((stage, clipboard) => {
      const data = new DataTransfer();
      data.setData('text/plain', clipboard);
      stage.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
    }, clipboard);
    await expect(page.locator('#scoreStage g.tie')).toHaveCount(2);
    await expect(page.locator('#scoreStage g.slur')).toHaveCount(2);
    await page.keyboard.press('ControlOrMeta+z');
    await expect(page.locator('#scoreStage g.tie')).toHaveCount(1);
    await expect(page.locator('#scoreStage g.slur')).toHaveCount(1);
  });
}
