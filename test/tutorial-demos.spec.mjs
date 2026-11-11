import { test, expect } from '@playwright/test';

async function frame(page, seconds) {
  await page.evaluate(time => document.getAnimations().forEach(animation => {
    animation.pause();
    animation.currentTime = time * 1000;
  }), seconds);
}
const opacity = node => node.evaluate(el => Number(getComputedStyle(el).opacity));

test('eighth notes appear one click at a time, then form a beam', async ({ page }) => {
  await page.goto('/es/tutoriales/notes-rests/');
  await frame(page, 2.9);
  expect(await opacity(page.locator('.d-first-eighth'))).toBe(1);
  expect(await opacity(page.locator('.d-beamed'))).toBe(0);
  await frame(page, 3.6);
  expect(await opacity(page.locator('.d-first-eighth'))).toBe(0);
  expect(await opacity(page.locator('.d-beamed'))).toBe(1);
});

test('gesture examples show a drop, a prepend, rest filling and rejection toast', async ({ page }, testInfo) => {
  await page.goto('/es/tutoriales/notes-rests/');
  await frame(page, 3);
  expect(await opacity(page.locator('.d-drag-ghost'))).toBeGreaterThan(0);
  expect(await opacity(page.locator('.d-prepended'))).toBe(0);
  expect(await opacity(page.locator('.d-filled-rest').first())).toBe(0);
  await frame(page, 5.5);
  expect(await opacity(page.locator('.d-drag-ghost'))).toBe(0);
  expect(await opacity(page.locator('.d-prepended'))).toBe(1);
  expect(await opacity(page.locator('.d-filled-rest').first())).toBe(1);
  expect(await opacity(page.locator('.d-overfull-note'))).toBe(1);
  expect(await opacity(page.locator('.d-problems-example'))).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('notes-rests.png'), fullPage: true });
});

test('double-click toggles the dot and keyboard shortcuts toggle a tie', async ({ page }, testInfo) => {
  await page.goto('/es/tutoriales/accidentals/');
  await frame(page, 4);
  expect(await opacity(page.locator('.d-toggled-dot'))).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('accidentals.png'), fullPage: true });
  await frame(page, 8);
  expect(await opacity(page.locator('.d-toggled-dot'))).toBe(0);
  await page.goto('/es/tutoriales/shortcuts/');
  await frame(page, 5);
  expect(await opacity(page.locator('.d-keyboard-tie'))).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('shortcuts.png'), fullPage: true });
  await frame(page, 9);
  expect(await opacity(page.locator('.d-keyboard-tie'))).toBe(0);
});

test('adjusting a duplicated voice leaves the source voice in place', async ({ page }) => {
  await page.goto('/es/tutoriales/shortcuts/');
  const demo = page.locator('.tutorial-demo').filter({ has: page.locator('[style*="adjust-copy"]') });
  const position = selector => demo.locator(selector).first().evaluate(el => el.getCTM().f);
  await frame(page, 3);
  const sourceY = await position('.d-source-voice');
  const copyY = await position('.d-copy-voice');
  await frame(page, 5);
  expect(await position('.d-source-voice')).toBe(sourceY);
  expect(await position('.d-copy-voice')).toBeLessThan(copyY);
});

test('the expanded tutorials fit narrow screens and show a complete reduced-motion state', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const slug of ['notes-rests', 'accidentals', 'shortcuts']) {
    await page.goto(`/es/tutoriales/${slug}/`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('.d-pointer').first()).toBeHidden();
    if (slug === 'notes-rests') {
      await expect(page.locator('.d-first-eighth')).toBeHidden();
      await expect(page.locator('.d-beamed')).toBeVisible();
    }
  }
});

test('copy colours only the notes that were clicked, at the moment they are clicked', async ({ page }) => {
  await page.goto('/es/tutoriales/copy/');
  const demo = page.locator('.tutorial-demo').first();
  const colors = () => demo.locator('[style*="copy-"]').evaluateAll(nodes => nodes.slice(0, 2).map(n => getComputedStyle(n).color));
  await frame(page, 2);
  const [first, second] = await colors();
  expect(first).not.toBe(second);
});

test('key presses show a fingertip and the menu keeps dots after accidentals and shortcuts last', async ({ page }) => {
  await page.goto('/es/tutoriales/voices/');
  expect(await page.locator('.tutorial-demo').count()).toBeGreaterThanOrEqual(7);
  await frame(page, 3.7);
  expect(await page.locator('.d-finger-actor').count()).toBeGreaterThan(0);
  const links = await page.locator('nav a[href*="/es/tutoriales/"]').evaluateAll(nodes => nodes.map(n => n.getAttribute('href')));
  const at = slug => links.findIndex(href => href.includes(`/${slug}/`));
  expect(at('dots')).toBe(at('accidentals') + 1);
  expect(at('shortcuts')).toBeGreaterThan(at('playback'));
});

test('tool shortcuts light the matching palette item until the next tool is chosen', async ({ page }) => {
  await page.goto('/es/tutoriales/notes-rests/');
  const demo = page.locator('.tutorial-demo').first();
  await expect(demo.locator('[data-demo-tool]')).toHaveCount(4);
  const active = key => demo.locator(`.d-tool-active-${key}`);
  await frame(page, 1);
  for (const key of ['3', 'R', '5']) expect(await opacity(active(key))).toBe(0);
  for (const [time, chosen] of [[2, '3'], [6, 'R'], [9, '5']]) {
    await frame(page, time);
    for (const key of ['3', 'R', '5']) expect(await opacity(active(key))).toBe(key === chosen ? 1 : 0);
    expect(await active(chosen).evaluate(el => getComputedStyle(el).color)).not.toBe(
      await demo.evaluate(el => getComputedStyle(el).color));
  }
});
