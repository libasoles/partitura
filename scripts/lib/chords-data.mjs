import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
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

export function chordsFileName() {
  return load()?.name ?? '';
}

export function buildChordsData(outdir) {
  const data = load();
  const out = resolve(outdir) + '/';
  mkdirSync(out, { recursive: true });
  for (const old of readdirSync(out)) if (/^chords-.*\.json$/.test(old)) rmSync(out + old);
  if (!data) return '';
  writeFileSync(out + data.name, data.json);
  return data.name;
}
