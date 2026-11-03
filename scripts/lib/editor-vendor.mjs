import { mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { transform } from 'esbuild';
const require = createRequire(import.meta.url);

// Used by Astro and consuming builds; no network access at build time.
export async function buildEditorVendor(outdir) {
  const root = new URL('../../', import.meta.url);
  const out = resolve(outdir) + '/';
  mkdirSync(out, { recursive: true });

  const verovio = JSON.parse(readFileSync(resolve(dirname(require.resolve('verovio')), '../package.json'), 'utf8')).version;
  const name = `verovio-${verovio}.js`;
  const wasmName = `verovio-${verovio}.wasm`;
  let source = readFileSync(require.resolve('verovio'), 'utf8');

  // The npm build carries the 5 MB WebAssembly module as a JS string literal (`binaryDecode('\0asm...')`), so the browser
  // parses ~7 MB of script on the main thread before anything runs. Here the module is cut out into its own file and
  // compiled while it downloads (instantiateStreaming), which leaves a small script and no long task.
  const open = "function findWasmBinary(){return binaryDecode('";
  const start = source.indexOf(open);
  if (start < 0) throw new Error('verovio: the embedded WebAssembly was not found; update scripts/vendor.mjs');
  let end = start + open.length;
  while (source[end] !== "'") end += source[end] === '\\' ? 2 : 1;
  const literal = source.slice(start + open.length - 1, end + 1);
  // Same decoding as the package's own binaryDecode: one byte per character.
  const wasm = Uint8Array.from(Function(`return ${literal}`)(), (ch) => (~ch.charCodeAt(0) >> 8) & ch.charCodeAt(0));
  source = source.slice(0, start) + `function findWasmBinary(){return ''` + source.slice(end + 2);
  const streaming = 'async function instantiateAsync(binary,binaryFile,imports){return instantiateArrayBuffer(binaryFile,imports)}';
  if (!source.includes(streaming)) throw new Error('verovio: instantiateAsync changed; update scripts/vendor.mjs');
  source = source.replace(
    streaming,
    'async function instantiateAsync(binary,binaryFile,imports){var url=verovioWasmUrl;' +
      'try{return await WebAssembly.instantiateStreaming(fetch(url),imports)}' +
      'catch(e){var bytes=await(await fetch(url)).arrayBuffer();return WebAssembly.instantiate(bytes,imports)}}',
  );

  source = `var verovioWasmUrl=new URL(${JSON.stringify(wasmName)},document.currentScript.src).href;\n` + source;
  const { code, map } = await transform(source, {
    minify: true,
    sourcemap: 'external',
    sourcesContent: true,
    sourcefile: 'verovio-toolkit-wasm.js',
    legalComments: 'none',
  });
  for (const old of readdirSync(out)) if (/^verovio.*\.(js|js\.map|wasm)$/.test(old)) rmSync(out + old);
  writeFileSync(out + name, `${code}//# sourceMappingURL=${name}.map\n`);
  writeFileSync(out + name + '.map', map);
  writeFileSync(out + wasmName, wasm);

  const jspdfPath = out + 'jspdf.umd.min.js';
  const jspdf = readFileSync(new URL('public/vendor/jspdf.umd.min.js', root), 'utf8');
  writeFileSync(jspdfPath, jspdf.replace(/\n?\/\/# sourceMappingURL=.*\n?$/, '\n'));
  return name;
}
