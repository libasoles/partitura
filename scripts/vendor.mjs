// Copies the browser build of Verovio next to the other vendored files. The editor loads it lazily from /vendor,
// and it is the same package src/lib/staff.js uses to render the staff on the server, so both draw the same score.
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const out = new URL('public/vendor/', root);
mkdirSync(fileURLToPath(out), { recursive: true });
copyFileSync(
  fileURLToPath(new URL('node_modules/verovio/dist/verovio-toolkit-wasm.js', root)),
  fileURLToPath(new URL('verovio-toolkit-wasm.js', out)),
);
