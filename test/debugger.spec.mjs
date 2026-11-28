import { test, expect } from '@playwright/test';

// Página interna /debugger/: el editor real de Partitura y, debajo, los gráficos de at y forward de la partitura abierta.

async function openDebugger(page) {
  await page.goto('/debugger/');
  await expect(page.locator('#scoreStage g.measure').first()).toBeVisible();
  await expect(page.locator('#debugMeasures .measure-debug').first()).toBeVisible();
}

const TWO_VOICES = { meter: '4/4', clef: 'treble', fifths: 0, instrument: 'guitar', rows: [[[{ d: 'q', n: 37, at: 0, v: 1 }, { d: 'q', n: 35, at: 0, v: 2 }]]] };
const RAW_AT = { meter: '4/4', clef: 'treble', fifths: 0, instrument: 'guitar', rows: [[[{ d: 'q', n: 37, at: 0, v: 1 }, { d: 'q', n: 35, at: 72, v: 2 }]]] };

async function loadScore(page, score) {
  await page.locator('.debug-panel summary').click();
  await page.locator('#debugJson').fill(JSON.stringify(score));
  await page.locator('#debugApply').click();
}

test('is not indexable', async ({ page }) => {
  await page.goto('/debugger/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  const sitemap = await (await page.request.get('/sitemap-0.xml')).text();
  expect(sitemap).not.toContain('/debugger/');
});

test('it is the real editor: its palette and tabs are there', async ({ page }) => {
  await openDebugger(page);
  await expect(page.getByRole('button', { name: 'Negra', exact: true })).toBeVisible();
  await expect(page.locator('#scoreTabs')).toBeVisible();
  await expect(page.locator('#scoreNewTab')).toBeVisible();
});

test('a figure written with the editor shows up in the at and forward graphs', async ({ page }) => {
  await openDebugger(page);
  await loadScore(page, TWO_VOICES);
  const measure = page.locator('#debugMeasures .measure-debug').first();
  await expect(measure.locator('.graph').first().locator('.sq')).toHaveCount(2);
  await expect(measure.locator('.graph').nth(1).locator('.sq.is-forward')).toHaveCount(2);
});

test('moving a note in the editor updates the panel', async ({ page }) => {
  await openDebugger(page);
  await loadScore(page, { meter: '4/4', clef: 'treble', fifths: 0, instrument: 'guitar', rows: [[[{ d: 'q', n: 37, at: 0 }]]] });
  const table = page.locator('#debugMeasures table.values').first();
  await expect(table).toContainText('E4');
  await page.locator('#scoreStage g.note .notehead').first().click({ force: true });
  await page.keyboard.press('ArrowUp');
  await expect(table).toContainText('F4');
});

test('the real model closes a gap in at, so the graph shows the note where it sounds', async ({ page }) => {
  await openDebugger(page);
  await loadScore(page, RAW_AT);
  const atGraph = page.locator('#debugMeasures .graph').first();
  await expect(atGraph.locator('.sq')).toHaveCount(2);
  await expect(atGraph.locator('.sq.is-ghost')).toHaveCount(0);
  await expect(atGraph).not.toContainText('at: 72');
});

test('applying the JSON can be undone with the editor history', async ({ page }) => {
  await openDebugger(page);
  await loadScore(page, TWO_VOICES);
  await expect(page.locator('#debugMeasures table.values').first().locator('tbody tr')).toHaveCount(2);
  await page.locator('#scoreStage').focus();
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('#debugMeasures table.values').first().locator('tbody tr')).toHaveCount(0);
});

test('the debugger keeps its own scores, apart from the site IndexedDB', async ({ page }) => {
  await openDebugger(page);
  await loadScore(page, TWO_VOICES);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('partitura.debugger.v2'))).toContain('"d":"q"');
  const databases = await page.evaluate(async () => (await indexedDB.databases()).map((db) => db.name));
  expect(databases).not.toContain('partitura');
});
