import { test, expect } from '@playwright/test';
import M from '../src/client/score-model.js';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

async function seed(page, measure) {
  const score = { ...M.emptyScore(), clef: 'guitar', meter: '6/8', fifths: -1 };
  score.rows[0][0] = measure;
  await page.addInitScript(score => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [score] }));
      sessionStorage.setItem('seeded', 'true');
    }
  }, score);
  await page.goto('/es/');
  await expect(page.locator('#scoreStage g.note')).toHaveCount(measure.length);
}

async function select(page, indices) {
  await page.keyboard.press('Escape');
  for (const [k, i] of indices.entries()) {
    await page.locator(`[id="e0-${i}"] .notehead`).click(k ? { modifiers: ['ControlOrMeta'] } : {});
  }
}

async function expectPersisted(page, measure) {
  await expect.poll(() => page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('partitura', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const read = db.transaction('workspace').objectStore('workspace').get('tabs');
      read.onsuccess = () => { db.close(); resolve(read.result?.scores[0].rows[0][0]); };
      read.onerror = () => { db.close(); reject(read.error); };
    };
  }))).toEqual(measure);
}

test('the reported bass becomes a separate line, beams independently and supports undo', async ({ page }, testInfo) => {
  const measure = [
    { d: 'q', n: 35, v: 1, at: 0 }, { d: 'e', n: 28, v: 2, at: 0 },
    { d: 'e', n: 36, v: 1, at: 24 }, { d: 'e', n: 30, v: 1, at: 24 },
    { d: 'e', n: 38, v: 1, at: 36 }, { d: 'e', n: 32, v: 1, at: 36 },
    { d: 'q', n: 35, v: 1, at: 48 }, { d: 'q', n: 28, v: 1, at: 48 },
  ];
  await seed(page, measure);
  await expect(page.locator('#scoreStage g.chord')).toHaveCount(3);
  await page.locator('#scoreSettingsToggle').click();
  await page.getByRole('checkbox', { name: 'Voces', exact: true }).check();
  await page.keyboard.press('Escape');
  await page.locator('.score-voice-legend button[data-voice="2"]').click();
  await select(page, [1, 3, 5, 7]);
  await page.getByRole('button', { name: 'Asignar notas a voz 2', exact: true }).click();
  await expect(page.locator('#scoreStage g.chord')).toHaveCount(0);
  expect(await page.evaluate(() => window.scoreEditor.score.rows[0][0].map(ev => ev.v))).toEqual([1, 2, 1, 2, 1, 2, 1, 2]);
  await expect(page.locator('[data-action="beam"]')).toHaveCount(0);
  await select(page, [3, 5]);
  await page.getByRole('button', { name: 'Barrar', exact: true }).click();
  const beam = page.locator('#scoreStage g.beam');
  await expect(beam).toHaveCount(1);
  expect(await beam.locator('g.note').evaluateAll(nodes => nodes.map(n => n.id))).toEqual(['e0-3', 'e0-5']);
  await page.screenshot({ path: testInfo.outputPath('independent-bass.png') });
  await page.keyboard.press('ControlOrMeta+z');
  await expect(beam).toHaveCount(0);
  await expect(page.locator('#scoreStage g.chord')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#scoreStage g.chord')).toHaveCount(3);
  expect(await page.evaluate(() => window.scoreEditor.score.rows[0][0])).toEqual(measure);
});

test('voice destinations follow the active legend, work for one note and survive undo and reload', async ({ page }, testInfo) => {
  await seed(page, [{ n: 35, d: 'q', at: 0, v: 1 }]);
  await page.locator('#scoreSettingsToggle').click();
  await page.getByRole('checkbox', { name: 'Voces', exact: true }).check();
  await page.keyboard.press('Escape');
  await select(page, [0]);
  const options = page.locator('[data-action^="assignVoice"]');
  await expect(options).toHaveCount(0);
  await page.locator('.score-voice-legend button[data-voice="1"]').click();
  await expect(options).toHaveCount(0);
  await page.locator('.score-voice-legend button[data-voice="2"]').click();
  await expect(options).toHaveCount(1);
  await expect(options).toHaveText('Asignar notas a voz 2');
  const swatch = options.locator('.score-voice-swatch[data-voice="2"]');
  await expect(swatch).toBeVisible();
  const activeColor = await page.locator('.score-voice-legend button[data-voice="2"]').evaluate(el => getComputedStyle(el).backgroundColor);
  await expect(swatch).toHaveCSS('background-color', activeColor);
  await expect(swatch).toHaveCSS('border-radius', '50%');
  await expect(options.locator('svg')).toHaveCount(0);
  await page.locator('.score-voice-legend button[data-voice="4"]').click();
  await expect(options).toHaveCount(2);
  await page.screenshot({ path: testInfo.outputPath('voice-assignment-menu.png') });
  await page.locator('.score-voice-legend button[data-voice="2"]').click();
  await expect(options).toHaveCount(1);
  await expect(options).toHaveText('Asignar notas a voz 4');
  await options.click();
  await expect(page.locator('[id="e0-0"]')).toHaveAttribute('data-voice', '4');
  await expect(page.locator('[id="e0-0"]')).toHaveClass(/is-selected/);
  await expect(page.locator('[data-action="assignVoice4"]')).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+z');
  expect(await page.evaluate(() => window.scoreEditor.score.rows[0][0][0].v)).toBe(1);
  await select(page, [0]);
  await page.getByRole('button', { name: 'Asignar notas a voz 4', exact: true }).click();
  const measure = await page.evaluate(() => window.scoreEditor.score.rows[0][0]);
  await expectPersisted(page, measure);
  await page.reload();
  await expect(page.locator('[id="e0-0"]')).toHaveAttribute('data-voice', '4');
});

test('explicit chord grouping can be undone and survives reload', async ({ page }) => {
  await seed(page, [{ n: 35, d: 'e', at: 0 }, { n: 28, d: 'e', at: 0 }]);
  await expect(page.locator('#scoreStage g.chord')).toHaveCount(0);
  await select(page, [0, 1]);
  await page.getByRole('button', { name: 'Formar acorde', exact: true }).click();
  await expect(page.locator('#scoreStage g.chord')).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#scoreStage g.chord')).toHaveCount(0);
  await select(page, [0, 1]);
  await page.getByRole('button', { name: 'Formar acorde', exact: true }).click();
  const measure = await page.evaluate(() => window.scoreEditor.score.rows[0][0]);
  await expectPersisted(page, measure);
  await page.reload();
  await expect(page.locator('#scoreStage g.chord')).toHaveCount(1);
  await expect(page.locator('#scoreStage g.note')).toHaveCount(2);
});

test('MusicXML preserves a declared single-voice chord and independent homorhythmic parts', async ({ page }) => {
  await page.goto('/es/');
  await page.waitForFunction(() => window.scoreEditor);
  // Exercise the browser's actual model against the parser, including on static hosting.
  const parser = buildSync({
    entryPoints: [fileURLToPath(new URL('../src/client/score-io.js', import.meta.url))],
    bundle: true, write: false, format: 'iife', globalName: 'TestScoreIO',
  });
  await page.addScriptTag({ content: parser.outputFiles[0].text });
  const result = await page.evaluate(() => {
    const M = window.ScoreModel;
    const IO = window.TestScoreIO.default;
    const score = M.emptyScore();
    const roundTrip = (measure) => {
      score.rows[0][0] = measure;
      const parsed = IO.parseMusicXml(M.toMusicXml(score), M);
      return M.voices(parsed.rows[0][0]).map(v => v.groups.map(g => g.indices
        .filter(i => !parsed.rows[0][0][i].rest).map(i => parsed.rows[0][0][i].n)).filter(g => g.length));
    };
    return {
      chord: roundTrip([{ n: 35, d: 'q', at: 0, v: 1 }, { n: 28, d: 'q', at: 0, v: 1 }]),
      parts: roundTrip([{ n: 35, d: 'q', at: 0, v: 1 }, { n: 28, d: 'q', at: 0, v: 2 }]),
    };
  });
  expect(result.chord).toEqual([[[35, 28]]]);
  expect(result.parts).toEqual([[[35]], [[28]]]);
});
