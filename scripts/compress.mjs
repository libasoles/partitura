// Runs after `astro build`: writes a .br and a .gz next to every text file in dist/, so the web server can send them
// as they are (nginx `gzip_static on` / `brotli_static on`, or scripts/serve.mjs) without compressing on each request.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

const dist = new URL('../dist/', import.meta.url).pathname;
const compressible = /\.(html|js|mjs|css|svg|json|xml|txt|wasm)$/;
const MIN_SIZE = 1024; // below this the headers cost more than the bytes saved

let files = 0;
let before = 0;
let after = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (compressible.test(name)) pack(path);
  }
}

function pack(path) {
  const data = readFileSync(path);
  if (data.length < MIN_SIZE) return;
  const br = brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: data.length } });
  const gz = gzipSync(data, { level: 9 });
  writeFileSync(path + '.br', br);
  writeFileSync(path + '.gz', gz);
  files++;
  before += data.length;
  after += br.length;
}

walk(dist);
console.log(`compress: ${files} files, ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB brotli`);
