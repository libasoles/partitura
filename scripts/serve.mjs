// Serves dist/ the way production should: precompressed .br/.gz (scripts/compress.mjs) and long-lived caching for
// hashed files. Used to measure with Lighthouse (`npm run lighthouse`), since `astro preview` sends everything raw.
//   node scripts/serve.mjs [port]
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const root = new URL('../dist/', import.meta.url).pathname;
const port = Number(process.argv[2] || 4323);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.woff2': 'font/woff2', '.wasm': 'application/wasm', '.map': 'application/json',
};
// /_astro/* is content-hashed and /vendor/* is named after the version: neither changes under the same URL.
const immutable = /^\/(_astro|vendor)\//;

createServer((req, res) => {
  let path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (path.endsWith('/')) path += 'index.html';
  let file = join(root, path);
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    return;
  }
  const headers = {
    'Content-Type': types[extname(file)] || 'application/octet-stream',
    'Cache-Control': immutable.test(path) ? 'public, max-age=31536000, immutable' : 'public, max-age=0, must-revalidate',
    'Vary': 'Accept-Encoding',
  };
  const accept = req.headers['accept-encoding'] || '';
  for (const [token, ext] of [['br', '.br'], ['gzip', '.gz']]) {
    if (accept.includes(token) && existsSync(file + ext)) {
      file += ext;
      headers['Content-Encoding'] = token;
      break;
    }
  }
  headers['Content-Length'] = statSync(file).size;
  res.writeHead(200, headers);
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`http://localhost:${port}`));
