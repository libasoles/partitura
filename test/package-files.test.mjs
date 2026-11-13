import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const published = (file) => pkg.files.some((entry) => file === entry || file.startsWith(`${entry}/`));

// Los consumidores corren `scripts/build-editor.mjs` desde node_modules: todo lo que importa tiene que viajar en `files`.
function relativeImports(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  const source = readFileSync(resolve(root, file), 'utf8');
  for (const [, spec] of source.matchAll(/from '(\.[^']+)'/g)) {
    const next = resolve(dirname(resolve(root, file)), spec).slice(root.length + 1);
    if (existsSync(resolve(root, next))) relativeImports(next, seen);
  }
  return seen;
}

test('every module imported by the build entry points is published with the package', () => {
  for (const entry of ['scripts/build-editor.mjs', 'scripts/build-package.mjs']) {
    for (const file of relativeImports(entry)) assert.ok(published(file), `${file} falta en "files" de package.json`);
  }
});
