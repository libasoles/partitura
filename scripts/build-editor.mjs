import { build } from 'esbuild';
import { resolve, join } from 'node:path';
import { buildEditorVendor } from './lib/editor-vendor.mjs';

// The consumer provides its browser adapter and publishes every generated file
// locally. Imports and lazy chunks are bundled; browsers never fetch GitHub.
export async function buildEditor({ entryPoint, outdir }) {
  outdir = resolve(outdir);
  const verovioFile = await buildEditorVendor(join(outdir, 'vendor'));
  return build({
    entryPoints: { 'score-editor': resolve(entryPoint) }, outdir,
    bundle: true, format: 'esm', splitting: true, platform: 'browser',
    chunkNames: 'score-chunks/[name]-[hash]',
    define: { __VEROVIO_FILE__: JSON.stringify(verovioFile), 'process.env.NODE_ENV': '"production"' },
    minify: true, metafile: true,
  });
}
