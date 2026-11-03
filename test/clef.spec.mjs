import { test, expect } from '@playwright/test';
import M from '../src/client/score-model.js';

test('signature previews stay framed when switching between clef and key popups', async ({ page }, testInfo) => {
  await page.addInitScript((score) => {
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [score] }));
  }, { ...M.emptyScore(), clef: 'guitar', fifths: -1, meter: '6/8' });
  await page.goto('/es/');
  const clef = page.locator('.score-clef-trigger').first();
  const key = page.locator('.score-key-trigger').first();

  async function expectFramed(selector) {
    const previews = page.locator(selector + ' svg');
    await expect(previews).not.toHaveCount(0);
    const boxes = await previews.evaluateAll(nodes => nodes.map(svg => {
      const glyph = svg.querySelector(':scope > g');
      const box = glyph.getBBox();
      const view = svg.viewBox.baseVal;
      return {
        view: [view.x, view.y, view.width, view.height],
        glyph: [box.x, box.y, box.width, box.height],
        width: box.width,
        height: box.height,
        inside: box.x >= view.x && box.y >= view.y &&
          box.x + box.width <= view.x + view.width && box.y + box.height <= view.y + view.height,
      };
    }));
    for (const box of boxes) {
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
      expect(box.inside, JSON.stringify(box)).toBe(true);
    }
  }

  // Opening clefs first must not cache incorrectly measured, hidden key previews.
  await clef.click();
  await expectFramed('.score-clef-options');
  await page.keyboard.press('Escape');
  await key.click();
  await expectFramed('.score-key-options');
  await page.screenshot({ path: testInfo.outputPath('key-popup.png') });
  await page.keyboard.press('Escape');

  // Also exercise the opposite order on a fresh page.
  await page.reload();
  await key.click();
  await expectFramed('.score-key-options');
  await page.keyboard.press('Escape');
  await clef.click();
  await expectFramed('.score-clef-options');
});

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
