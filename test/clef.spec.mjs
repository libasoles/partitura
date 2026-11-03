import { test, expect } from '@playwright/test';
import M from '../src/client/score-model.js';

async function expectSaved(page, expected) {
  // Wait for the debounced IndexedDB write before exercising restoration.
  await expect.poll(() => page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('partitura', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const read = db.transaction('workspace').objectStore('workspace').get('tabs');
      read.onsuccess = () => { db.close(); resolve(read.result); };
      read.onerror = () => { db.close(); reject(read.error); };
    };
  }))).toMatchObject(expected);
}

async function expectTreble(page) {
  await expect(page.locator('.score-clef-trigger').first()).toHaveAttribute('aria-label', 'Clave y armadura: Sol, Do mayor / La menor');
  // E050 is the ordinary treble glyph; an octave clef adds another glyph.
  const clefs = page.locator('#scoreStage g.clef');
  await expect(clefs).toHaveCount(M.MIN_ROWS);
  for (const clef of await clefs.all()) {
    await expect(clef.locator('use')).toHaveCount(1);
    await expect(clef.locator('use')).toHaveAttribute('xlink:href', /^#E050-/);
  }
}

test('the server renders the ordinary treble clef before JavaScript runs', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4325/es/');
    const clefs = page.locator('#scoreStage g.clef');
    await expect(clefs).toHaveCount(M.MIN_ROWS);
    for (const clef of await clefs.all()) {
      await expect(clef.locator('use')).toHaveCount(1);
      await expect(clef.locator('use')).toHaveAttribute('xlink:href', /^#E050-/);
    }
  } finally {
    await context.close();
  }
});

test('initial and newly created scores use ordinary treble, including after reload', async ({ page }) => {
  await page.goto('/es/');
  await expectTreble(page);
  await page.locator('#scoreNewTab').click();
  await expect(page.locator('.score-doc-tab')).toHaveCount(2);
  await expectTreble(page);
  await expectSaved(page, { active: 1, scores: [{ clef: 'treble' }, { clef: 'treble' }] });
  await page.reload();
  await expect(page.locator('.score-doc-tab')).toHaveCount(2);
  await expectTreble(page);
});

test('a saved guitar clef is restored and can be changed to ordinary treble', async ({ page }) => {
  const saved = { ...M.emptyScore(), clef: 'guitar' };
  await page.addInitScript((score) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [score] }));
      sessionStorage.setItem('seeded', 'true');
    }
  }, saved);
  await page.goto('/es/');
  const trigger = page.locator('.score-clef-trigger').first();
  await expect(trigger).toHaveAttribute('aria-label', /Sol \(guitarra, octava baja\)/);
  await trigger.click();
  await page.locator('#scoreClefPopup button[data-clef="treble"]').click();
  await expectTreble(page);
  await expectSaved(page, { active: 0, scores: [{ clef: 'treble' }] });
  await page.reload();
  await expectTreble(page);
});
