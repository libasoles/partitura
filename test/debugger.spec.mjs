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

test('a note written far to the right of an empty bar stays where it was clicked, with a <forward> before it', async ({ page }) => {
  await openDebugger(page);
  await page.keyboard.press('4');
  const p = await pointAt(page, 0.8);
  await page.mouse.move(p.x, p.y);
  const live = page.locator('#debugLive');
  await expect(live).toContainText('at pedido');
  await expect(live.locator('.live-note')).toHaveCount(0); // nada choca: no hay aviso
  await page.mouse.click(p.x, p.y);
  const first = page.locator('.case').first();
  await expect(first.locator('table.values').first().locator('tbody tr')).toHaveCount(1);
  // `at` es el inicio real: la nota se queda donde se hizo clic (no vuelve a 0) y el forward va delante.
  const row = first.locator('table.values').first().locator('tbody tr').first();
  await expect(row).not.toContainText(/\b0\s+0\s+24\b/);
  await expect(first.locator('.graph').first().locator('.sq')).toHaveCount(1);
  await expect(first.locator('.measure-debug').first().locator('.graph').nth(1).locator('.sq.is-forward').first()).toBeVisible();
});

test('a late voice at 72 starts at 72: no dashed twin, and a <forward> before it', async ({ page }) => {
  await openDebugger(page);
  const first = page.locator('.case').first();
  const raw = { meter: '4/4', clef: 'treble', fifths: 0, rows: [[[{ d: 'q', n: 37, at: 0, v: 1 }, { d: 'q', n: 35, at: 72, v: 2 }]]] };
  await first.locator('summary').click();
  await first.locator('textarea.json').fill(JSON.stringify(raw));
  await first.getByRole('button', { name: 'Aplicar' }).click();
  const atGraph = first.locator('.graph').first();
  await expect(atGraph.locator('.sq.is-ghost')).toHaveCount(0);
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
  await expect(first.locator('.measure-debug').first().locator('.graph').nth(1).locator('.sq.is-forward').first()).toBeVisible();
  await expect(first.locator('.measure-debug').first()).toContainText('forward:');
});

const TWO_VOICES = { meter: '4/4', clef: 'treble', fifths: 0, rows: [[[{ d: 'q', n: 37, at: 0, v: 1 }, { d: 'q', n: 35, at: 0, v: 2 }]]] };

async function loadScore(page, score) {
  const first = page.locator('.case').first();
  await first.locator('summary').click();
  await first.locator('textarea.json').fill(JSON.stringify(score));
  await first.getByRole('button', { name: 'Aplicar' }).click();
  return first;
}

test('voices are coloured by default with the editor legend palette, and C turns it off', async ({ page }) => {
  await openDebugger(page);
  const first = await loadScore(page, TWO_VOICES);
  const fill = (voice) => first.locator(`g.note[data-voice="${voice}"] .notehead`).first().evaluate((node) => getComputedStyle(node.querySelector('use, path') || node).fill);
  await expect(first.locator('g.note[data-voice]')).toHaveCount(2);
  expect(await fill(1)).toBe('rgb(181, 71, 47)');
  expect(await fill(2)).toBe('rgb(200, 146, 46)');
  await page.keyboard.press('c');
  await expect(page.locator('#toolColors')).toHaveAttribute('aria-pressed', 'false');
  expect(await fill(1)).not.toBe('rgb(181, 71, 47)');
});

test('the figure bar draws each figure and the table names it in full', async ({ page }) => {
  await openDebugger(page);
  await expect(page.locator('#debugTools button[data-d] svg')).toHaveCount(6);
  await page.keyboard.press('5'); // blanca
  const p = await pointAt(page, 0.5);
  await page.mouse.click(p.x, p.y);
  const row = page.locator('.case').first().locator('table.values').first().locator('tbody tr').first();
  await expect(row).toContainText('blanca');
  await expect(row).not.toContainText(/\bh\b/);
  await page.keyboard.press('r'); // los botones pasan a mostrar silencios
  await page.keyboard.press('p');
  await page.keyboard.press('4');
  await page.mouse.click(p.x + 120, p.y);
  await expect(page.locator('.case').first().locator('table.values').first()).toContainText('silencio de negra con puntillo');
});

test('play runs a playhead over both graphs and stops on edit', async ({ page }) => {
  await openDebugger(page);
  const first = await loadScore(page, TWO_VOICES);
  const play = first.getByRole('button', { name: 'Reproducir el caso' });
  await expect(play).toHaveText('▶ Play');
  await play.click();
  await expect(play).toHaveText('■ Stop');
  await expect(first.locator('.graph .playhead:not([hidden])').first()).toBeVisible();
  await first.getByRole('button', { name: '+ Compás' }).click();
  await expect(first.getByRole('button', { name: 'Reproducir el caso' })).toHaveText('▶ Play');
});

test('an incomplete first bar followed by music is shown as a pickup with no forward', async ({ page }) => {
  await openDebugger(page);
  const full = { meter: '4/4', clef: 'treble', fifths: 0, rows: [[[{ d: 'q', n: 37, at: 0 }], [{ d: 'w', n: 37, at: 0 }]]] };
  const first = await loadScore(page, full);
  const firstBar = first.locator('.measure-debug').first();
  await expect(first.locator('g.measure')).toHaveCount(2);
  await expect(firstBar.locator('.badge')).toHaveText('anacrusa');
  await expect(firstBar).toContainText('dura 24');
  await expect(firstBar.locator('.sq.is-forward')).toHaveCount(0);
  // El compás siguiente es completo: no es anacrusa.
  await expect(first.locator('.measure-debug').nth(1).locator('.badge')).toHaveCount(0);
});
