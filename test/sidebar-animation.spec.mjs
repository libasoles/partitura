import { test, expect } from '@playwright/test';

test('both sidebars reveal once and survive score renders without restarting', async ({ page }) => {
  await page.addInitScript(() => {
    window.sidebarAnimations = [];
    document.addEventListener('animationstart', event => {
      if (event.animationName === 'score-tool-fade-in') {
        window.sidebarAnimations.push(event.target.closest('.score-side') ? 'right' : 'left');
      }
    });
  });
  await page.goto('/es/demos/canto-en-la-rama/?tools=voices,play,intervals#pro');
  await expect(page.locator('#scoreFixVoices')).toBeVisible();
  await expect.poll(() => page.evaluate(() => [...new Set(window.sidebarAnimations)].sort())).toEqual(['left', 'right']);
  await page.waitForFunction(() => !document.getAnimations().some(a => a.animationName === 'score-tool-fade-in' && a.playState !== 'finished'));
  await page.evaluate(() => {
    window.sidebarAnimations.length = 0;
    window.removedSidebarNodes = [];
    const controls = [...document.querySelectorAll('#scoreStage > .score-playback, #scoreStage > .score-interval-toggle, #scoreStage > .score-voice-legend')];
    new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.removedNodes) {
          if (controls.includes(node)) window.removedSidebarNodes.push(node.id || node.className);
        }
      }
    }).observe(document.getElementById('scoreStage'), { childList: true });
  });
  await page.locator('#scoreFixVoices').click();
  await page.evaluate(() => window.scoreEditor.render());
  await expect(page.locator('#scoreFixVoices')).toBeFocused();
  await page.locator('.score-voice-legend button').first().click();
  expect(await page.evaluate(() => window.removedSidebarNodes)).toEqual([]);
  expect(await page.evaluate(() => window.sidebarAnimations)).toEqual([]);
  await page.locator('#scoreSettingsToggle').click();
  await page.getByRole('checkbox', { name: 'Voces', exact: true }).uncheck();
  await page.getByRole('checkbox', { name: 'Voces', exact: true }).check();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.sidebarAnimations)).toEqual([]);
});
