import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
const require = createRequire(import.meta.url);

// El diccionario de acordes es de guitar-chords (devDependency): se lee en el build y se publica como un JSON propio,
// con el hash en el nombre, que el editor pide recien al escribir o abrir un acorde. Sin esa dependencia no hay archivo
// (nombre vacio) y el editor no ofrece acordes.
function load() {
  try {
    const { CHORDS } = require('guitar-chords');
    // `notes` solo sirve al buscador de guitar-chords; el editor dibuja la digitacion.
    const rows = CHORDS.map(({ notes, ...chord }) => chord);
    const json = JSON.stringify(rows);
    return { json, name: `chords-${createHash('sha1').update(json).digest('hex').slice(0, 10)}.json` };
  } catch {
    return null;
  }
}

// El buscador de guitar-chords (chord-search.js y fuzzysort) se empaqueta en un modulo propio que el editor importa al
// buscar un acorde. Si la version instalada no lo trae, el editor sigue sin buscador.
function loadSearch() {
  try {
    const shared = dirname(require.resolve('guitar-chords'));
    const { outputFiles } = buildSync({
      stdin: { contents: "import search from './chord-search.js'; export const matchChords = search.matchChords; export const normalize = search.normalize;", resolveDir: shared },
      bundle: true, format: 'esm', platform: 'browser', minify: true, write: false,
    });
    const code = outputFiles[0].text;
    return { code, name: `chord-search-${createHash('sha1').update(code).digest('hex').slice(0, 10)}.js` };
  } catch {
    return null;
  }
}

export function chordSearchFileName() {
  return loadSearch()?.name ?? '';
}

export function chordsFileName() {
  return load()?.name ?? '';
}

export function buildChordsData(outdir) {
  const data = load();
  const out = resolve(outdir) + '/';
  mkdirSync(out, { recursive: true });
  for (const old of readdirSync(out)) if (/^(chords-.*\.json|chord-search-.*\.js)$/.test(old)) rmSync(out + old);
  if (!data) return '';
  writeFileSync(out + data.name, data.json);
  const search = loadSearch();
  if (search) writeFileSync(out + search.name, search.code);
  return data.name;
}
