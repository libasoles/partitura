import { test, expect } from '@playwright/test';

test('Pro: the left sidebar button under the voices duplicates the top voice a third below', async ({ page }) => {
  await page.goto('/es/#pro');
  await page.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
  await page.waitForFunction(() => window.scoreEditor && document.querySelector('.score-doc-tab-input'));
  await page.evaluate(() => {
    window.scoreEditor.score.rows[0][0] = [37, 40, 39, 38].map((n) => ({ d: 'q', n }));
    window.scoreEditor.render();
  });
  await page.locator('#scoreStage g.note').first().waitFor();
  await page.locator('#scoreSettingsToggle').click();
  await page.locator('[data-category="voices"] input[type=checkbox]').check();
  await page.locator('#scoreDuplicateVoice').click();
  await expect(page.locator('#scoreStage g.note')).toHaveCount(8);
  const pitches = await page.evaluate(() => window.scoreEditor.score.rows[0][0].filter((ev) => ev.v === 2).map((ev) => ev.n));
  expect(pitches).toEqual([35, 38, 37, 36]);
});

test('Pro: with several voices a popup anchored to the button picks which to duplicate', async ({ page }) => {
  await page.goto('/es/#pro');
  await page.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
  await page.waitForFunction(() => window.scoreEditor && document.querySelector('.score-doc-tab-input'));
  await page.evaluate(() => {
    window.scoreEditor.score.rows[0][0] = [{ n: 40, d: 'w', at: 0, v: 1 }, { n: 34, d: 'w', at: 0, v: 2 }, { n: 25, d: 'w', at: 0, v: 3 }];
    window.scoreEditor.render();
  });
  await page.locator('#scoreStage g.note').first().waitFor();
  await page.locator('#scoreSettingsToggle').click();
  await page.locator('[data-category="voices"] input[type=checkbox]').check();
  await page.locator('#scoreDuplicateVoice').click();
  const picker = page.locator('#scoreVoicePicker');
  await expect(picker).toBeVisible();
  await expect(page.locator('#scoreStage > #scoreDuplicateVoice')).toHaveCount(1);
  await expect(picker.locator('.score-voice-picker-list button')).toHaveText(['1', '2', '3']);
  await expect(picker.locator('.score-voice-picker-confirm')).toBeDisabled();
  await picker.locator('button[data-voice="1"]').click();
  await picker.locator('button[data-voice="2"]').click();
  await picker.locator('.score-voice-picker-confirm').click();
  await expect(page.locator('#scoreStage g.note')).toHaveCount(5);
  const voices = await page.evaluate(() => [1, 2, 3, 4, 5].map((v) => window.scoreEditor.score.rows[0][0].filter((ev) => ev.v === v).map((ev) => ev.n)));
  expect(voices).toEqual([[40], [34], [38], [32], [25]]);
});

test('Pro: with a voice chosen in the legend only that voice is duplicated, without the popup', async ({ page }) => {
  await page.goto('/es/#pro');
  await page.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
  await page.waitForFunction(() => window.scoreEditor && document.querySelector('.score-doc-tab-input'));
  await page.evaluate(() => {
    window.scoreEditor.score.rows[0][0] = [{ n: 40, d: 'w', at: 0, v: 1 }, { n: 34, d: 'w', at: 0, v: 2 }, { n: 25, d: 'w', at: 0, v: 3 }];
    window.scoreEditor.render();
  });
  await page.locator('#scoreStage g.note').first().waitFor();
  await page.locator('#scoreSettingsToggle').click();
  await page.locator('[data-category="voices"] input[type=checkbox]').check();
  await page.locator('button[data-voice="2"]').first().click();
  await page.locator('#scoreDuplicateVoice').click();
  await expect(page.locator('#scoreVoicePicker')).toBeHidden();
  await expect(page.locator('#scoreStage g.note')).toHaveCount(4);
  const pitches = await page.evaluate(() => window.scoreEditor.score.rows[0][0].map((ev) => ev.n).sort((a, b) => a - b));
  expect(pitches).toEqual([25, 32, 34, 40]);
});

test('Pro: the sixth button duplicates the top voice a sixth below, with its own icon', async ({ page }) => {
  await page.goto('/es/#pro');
  await page.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
  await page.waitForFunction(() => window.scoreEditor && document.querySelector('.score-doc-tab-input'));
  await page.evaluate(() => {
    window.scoreEditor.score.rows[0][0] = [37, 40, 39, 38].map((n) => ({ d: 'q', n }));
    window.scoreEditor.render();
  });
  await page.locator('#scoreStage g.note').first().waitFor();
  await page.locator('#scoreSettingsToggle').click();
  await page.locator('[data-category="voices"] input[type=checkbox]').check();
  await expect(page.locator('#scoreDuplicateVoice text')).toHaveText('3');
  await expect(page.locator('#scoreDuplicateVoiceSixth text')).toHaveText('6');
  await page.locator('#scoreDuplicateVoiceSixth').click();
  const pitches = await page.evaluate(() => window.scoreEditor.score.rows[0][0].filter((ev) => ev.v === 2).map((ev) => ev.n));
  expect(pitches).toEqual([32, 35, 34, 33]);
});

test('without #pro the duplicate voice button does not exist', async ({ page }) => {
  await page.goto('/es/');
  await page.waitForFunction(() => window.scoreEditor);
  await expect(page.locator('#scoreDuplicateVoice')).toHaveCount(0);
});
