import { test, expect } from '@playwright/test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildEditor } from '../scripts/build-editor.mjs';

// A host that does not mount Ajustes (like guitar-chords) still chooses its tools: the editor is built the way a
// consumer builds it and replaces the site's own script on the same page markup.
let dir;
const TYPES = { '.js': 'text/javascript', '.json': 'application/json', '.wasm': 'application/wasm', '.map': 'application/json' };

test.beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'partitura-host-'));
  const runtime = fileURLToPath(new URL('../src/client/runtime.js', import.meta.url));
  const entry = join(dir, 'host.js');
  await writeFile(entry, `import { startEditor } from ${JSON.stringify(runtime)};\nstartEditor({ vendorBase: '/host/vendor/', ...window.hostOptions });`);
  await buildEditor({ entryPoint: entry, outdir: join(dir, 'host') });
});
test.afterAll(() => rm(dir, { recursive: true, force: true }));

async function openHost(page, options) {
  await page.addInitScript((value) => {
    window.hostOptions = value;
    localStorage.setItem('scoreEditor.tabs.v1', JSON.stringify({ active: 0, scores: [{ instrument: 'guitar', meter: '4/4', clef: 'guitar', fifths: 0, tempo: 120, rows: [[[{ d: 'w', n: 35 }]]] }] }));
  }, options);
  await page.route('**/host/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/host\//, '');
    try {
      await route.fulfill({ body: await readFile(join(dir, 'host', path)), contentType: TYPES[extname(path)] || 'application/octet-stream' });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });
  await page.route('**/_astro/EditorPage.astro_astro_type_script_index*', (route) => route.fulfill({ body: "import '/host/score-editor.js';", contentType: 'text/javascript' }));
  await page.goto('/es/');
  await expect(page.locator('#scoreStage[aria-busy="true"]')).toHaveCount(0);
  await page.locator('#scoreStage g.measure').first().waitFor();
}

test('tools: { playback: true } shows play without mounting Ajustes', async ({ page }) => {
  await openHost(page, { tools: { playback: true } });
  await expect(page.locator('#scoreSettingsToggle')).toHaveCount(0);
  const play = page.locator('#scorePlayback');
  await expect(play).toBeVisible();
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  await play.click();
  await expect(play).toHaveAttribute('aria-pressed', 'true');
  await play.click();
  await expect(play).toHaveAttribute('aria-pressed', 'false');
});

test('a tool the host does not enable stays hidden', async ({ page }) => {
  await openHost(page, {});
  await expect(page.locator('#scoreSettingsToggle')).toHaveCount(0);
  await expect(page.locator('#scorePlayback')).toBeHidden();
  await expect(page.locator('#scoreIntervals')).toHaveCount(0);
});
