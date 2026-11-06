import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
const require = createRequire(import.meta.url);

// El silabeo es de el-silbador (devDependency): se empaqueta en un modulo propio, con el hash en el nombre, que el editor
// importa recien al pegar una letra. Sin esa dependencia no hay archivo (nombre vacio) y el editor no distribuye letras.
function load() {
  try {
    require.resolve('el-silbador');
    const { outputFiles } = buildSync({
      stdin: { contents: "export { hyphenateWord, splitIntoWords } from 'el-silbador';", resolveDir: fileURLToPath(new URL('../../', import.meta.url)) },
      bundle: true, format: 'esm', platform: 'browser', minify: true, write: false,
    });
    const code = outputFiles[0].text;
    return { code, name: `syllabify-${createHash('sha1').update(code).digest('hex').slice(0, 10)}.js` };
  } catch {
    return null;
  }
}

export function syllabifyFileName() {
  return load()?.name ?? '';
}

export function buildSyllabify(outdir) {
  const data = load();
  const out = resolve(outdir) + '/';
  mkdirSync(out, { recursive: true });
  for (const old of readdirSync(out)) if (/^syllabify-.*\.js$/.test(old)) rmSync(out + old);
  if (!data) return '';
  writeFileSync(out + data.name, data.code);
  return data.name;
}
