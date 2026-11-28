import { test, expect } from '@playwright/test';

// Página interna /debugger/: dibuja casos de un compás y muestra at y forward de cada figura.

async function openDebugger(page) {
  await page.goto('/debugger/');
  await expect(page.locator('.case')).toHaveCount(4);
  await expect(page.locator('.case').first().locator('g.measure')).toHaveCount(1);
}

// Punto de pantalla a la derecha del compás del primer caso, sobre la línea del medio del pentagrama.
async function pointAt(page, fraction) {
  const lines = await page.locator('.case').first().locator('g.measure > g.staff > path').evaluateAll((paths) => paths.slice(0, 5).map((p) => p.getBoundingClientRect()));
  const box = await page.locator('.case').first().locator('g.measure > g.staff > path').first().boundingBox();
  const middle = (lines[2].top + lines[2].bottom) / 2;
  return { x: box.x + box.width * fraction, y: middle };
}

test('is not indexable', async ({ page }) => {
  await page.goto('/debugger/');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  const sitemap = await (await page.request.get('/sitemap-0.xml')).text();
  expect(sitemap).not.toContain('/debugger/');
});

test('the sticky figure bar stays in view while scrolling the cases', async ({ page }) => {
  await openDebugger(page);
  await page.locator('.case').last().scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator('#debugTools')).toBeInViewport();
});

test('a note written far to the right of an empty bar starts at 0 and the live box says why', async ({ page }) => {
  await openDebugger(page);
  await page.keyboard.press('4');
  const p = await pointAt(page, 0.8);
  await page.mouse.move(p.x, p.y);
  const live = page.locator('#debugLive');
  await expect(live).toContainText('at pedido');
  await expect(live).toContainText('Se pidió at 72');
  await expect(live.locator('.live-row.warn')).toContainText('0');
  await page.mouse.click(p.x, p.y);
  const first = page.locator('.case').first();
  await expect(first.locator('table.values').first().locator('tbody tr')).toHaveCount(1);
  // Ya asentada: el at pedido (72) se perdió y la nota está en 0.
  await expect(first.locator('table.values').first().locator('tbody tr').first()).toContainText(/0\s*0\s*24/);
  await expect(first.locator('.graph').first().locator('.sq')).toHaveCount(1);
});

test('a raw at that the model ignores is drawn twice: where at says and where the model starts it', async ({ page }) => {
  await openDebugger(page);
  const first = page.locator('.case').first();
  const raw = { meter: '4/4', clef: 'treble', fifths: 0, rows: [[[{ d: 'q', n: 37, at: 0, v: 1 }, { d: 'q', n: 35, at: 72, v: 2 }]]] };
  await first.locator('summary').click();
  await first.locator('textarea.json').fill(JSON.stringify(raw));
  await first.getByRole('button', { name: 'Aplicar' }).click();
  const atGraph = first.locator('.graph').first();
  await expect(atGraph.locator('.sq.is-ghost')).toHaveCount(1);
  await expect(atGraph).toContainText('at: 72');
  await expect(first.locator('.graph').nth(1).locator('.sq.is-forward')).toHaveCount(2);
});

test('adding a bar and a second note updates the graphs', async ({ page }) => {
  await openDebugger(page);
  const first = page.locator('.case').first();
  await first.getByRole('button', { name: '+ Compás' }).click();
  await expect(first.locator('g.measure')).toHaveCount(2);
  await expect(first.locator('.measure-debug')).toHaveCount(2);
  await page.keyboard.press('4');
  const p = await pointAt(page, 0.25);
  await page.mouse.click(p.x, p.y);
  await expect(first.locator('.measure-debug').first().locator('.graph').nth(1).locator('.sq.is-forward')).toHaveCount(1);
  await expect(first.locator('.measure-debug').first()).toContainText('forward: 72');
});
