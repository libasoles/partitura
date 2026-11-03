// Runs Lighthouse against a running server (npm run build && npm run preview) and prints the scores.
//   node scripts/lighthouse.mjs [baseUrl] [outDir]
// Needs Chrome; set CHROME_PATH if it is not found automatically.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';

const base = (process.argv[2] || 'http://localhost:4321').replace(/\/+$/, '');
const out = process.argv[3] || 'lighthouse-reports';
mkdirSync(out, { recursive: true });

const pages = [
  ['home-es', '/es/'],
  ['home-en', '/en/'],
  ['tutorials-es', '/es/tutoriales/'],
  ['tutorial-es', '/es/tutoriales/start/'],
];
const modes = [
  ['mobile', []],
  ['desktop', ['--preset=desktop']],
];

for (const [name, path] of pages) {
  for (const [mode, flags] of modes) {
    const file = `${out}/${name}-${mode}.json`;
    execFileSync(
      'npx',
      ['lighthouse', base + path, '--chrome-flags=--headless=new --no-sandbox', '--output=json', `--output-path=${file}`, '--quiet', ...flags],
      { stdio: 'ignore' },
    );
    const r = JSON.parse(readFileSync(file, 'utf8'));
    const scores = Object.entries(r.categories).map(([k, v]) => `${k}:${Math.round(v.score * 100)}`).join(' ');
    const a = r.audits;
    console.log(
      `${name}-${mode}`.padEnd(22),
      scores,
      `| LCP ${a['largest-contentful-paint'].displayValue} CLS ${a['cumulative-layout-shift'].displayValue} TBT ${a['total-blocking-time'].displayValue}`,
    );
  }
}
