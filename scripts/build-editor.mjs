import { build } from 'esbuild';
import { resolve, join } from 'node:path';
import { cp } from 'node:fs/promises';
import { buildEditorVendor } from './lib/editor-vendor.mjs';
import { chordsFileName, chordSearchFileName } from './lib/chords-data.mjs';
import { syllabifyFileName } from './lib/syllabify-data.mjs';

// The consumer provides its browser adapter and publishes every generated file
// locally. Imports and lazy chunks are bundled; browsers never fetch GitHub.
export async function buildEditor({ entryPoint, outdir }) {
  outdir = resolve(outdir);
  const verovioFile = await buildEditorVendor(join(outdir, 'vendor'));
  await cp(new URL('../public/vendor/audio', import.meta.url), join(outdir, 'vendor/audio'), { recursive: true });
  return build({
    entryPoints: { 'score-editor': resolve(entryPoint) }, outdir,
    bundle: true, format: 'esm', splitting: true, platform: 'browser',
    chunkNames: 'score-chunks/[name]-[hash]',
    define: { __VEROVIO_FILE__: JSON.stringify(verovioFile), __CHORDS_FILE__: JSON.stringify(chordsFileName()), __CHORD_SEARCH_FILE__: JSON.stringify(chordSearchFileName()), __SYLLABIFY_FILE__: JSON.stringify(syllabifyFileName()), 'process.env.NODE_ENV': '"production"' },
    minify: true, metafile: true,
  });
}
