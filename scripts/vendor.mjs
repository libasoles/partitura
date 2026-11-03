// Prepares the browser builds the editor loads lazily from /vendor. Verovio is the same package src/lib/staff.js uses to
// render the staff on the server, so both draw the same score.
//  - Verovio is minified with a source map (the npm build ships neither; Lighthouse flags a large script without one)
//    and named after its version, so /vendor can be cached as immutable: a new version is a new URL.
//  - jsPDF's file points to a .map that is not shipped, which breaks DevTools and Lighthouse, so that comment is dropped.
import { mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const root = new URL('../', import.meta.url);
const out = fileURLToPath(new URL('public/vendor/', root));
mkdirSync(out, { recursive: true });

const verovio = JSON.parse(readFileSync(new URL('node_modules/verovio/package.json', root), 'utf8')).version;
const name = `verovio-${verovio}.js`;
const source = readFileSync(new URL('node_modules/verovio/dist/verovio-toolkit-wasm.js', root), 'utf8');
const { code, map } = await transform(source, {
  minify: true,
  sourcemap: 'external',
  sourcesContent: false,
  sourcefile: 'verovio-toolkit-wasm.js',
  legalComments: 'none',
});
for (const old of readdirSync(out)) if (/^verovio.*\.js(\.map)?$/.test(old)) rmSync(out + old);
writeFileSync(out + name, `${code}//# sourceMappingURL=${name}.map\n`);
writeFileSync(out + name + '.map', map);

const jspdfPath = out + 'jspdf.umd.min.js';
const jspdf = readFileSync(jspdfPath, 'utf8');
if (jspdf.includes('sourceMappingURL')) writeFileSync(jspdfPath, jspdf.replace(/\n?\/\/# sourceMappingURL=.*\n?$/, '\n'));
