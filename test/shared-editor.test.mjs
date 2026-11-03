import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildEditor } from '../scripts/build-editor.mjs';
import M, { createScoreModel } from '../src/client/score-model.js';

const require = createRequire(import.meta.url);

test('hosts choose independent defaults without changing saved explicit clefs', () => {
  const guitar = createScoreModel({ defaultClef: 'guitar' });
  assert.equal(M.emptyScore().clef, 'treble');
  assert.equal(guitar.emptyScore().clef, 'guitar');
  assert.equal(guitar.sanitize({ ...guitar.emptyScore(), clef: 'bass' }).clef, 'bass');
  assert.equal(M.emptyScore().clef, 'treble');
  const nodeModel = require('partitura/model').createScoreModel({ defaultClef: 'guitar' });
  assert.deepEqual(nodeModel.emptyScore(), guitar.emptyScore());
  assert.equal(nodeModel.toMusicXml(nodeModel.emptyScore()), guitar.toMusicXml(guitar.emptyScore()));
});

test('a consuming build publishes local modules, lazy chunks and matching WASM', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'partitura-consumer-'));
  try {
    const entry = join(dir, 'host.js');
    const runtime = fileURLToPath(new URL('../src/client/runtime.js', import.meta.url));
    await writeFile(entry, `import { startEditor } from ${JSON.stringify(runtime)};\nstartEditor({ defaultClef: 'guitar', vendorBase: './vendor/', bindActions: actions => { window.hostActions = actions; } });`);
    const result = await buildEditor({ entryPoint: entry, outdir: join(dir, 'assets') });
    assert.ok(Object.keys(result.metafile.outputs).some((p) => p.includes('score-export-')));
    assert.ok(Object.keys(result.metafile.outputs).some((p) => p.includes('ascii-tabs-')));
    for (const output of Object.keys(result.metafile.outputs)) {
      const js = await readFile(output, 'utf8');
      assert.ok(!js.includes('__VEROVIO_FILE__'));
      assert.ok(!js.includes('raw.githubusercontent.com'));
      assert.ok(!js.includes('cdn.jsdelivr.net'));
    }
    const wasm = await readFile(join(dir, 'assets/vendor/verovio-6.4.0.wasm'));
    assert.deepEqual([...wasm.subarray(0, 4)], [0, 97, 115, 109]);
    const vendor = await readFile(join(dir, 'assets/vendor/verovio-6.4.0.js'), 'utf8');
    assert.match(vendor, /document.currentScript.src/);
    assert.match(vendor, /verovio-6\.4\.0\.wasm/);
    assert.ok(!vendor.includes("return binaryDecode('"));
    assert.ok((await readFile(join(dir, 'assets/vendor/jspdf.umd.min.js'))).length > 1000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
