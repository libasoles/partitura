// Lists the audits that scored below 1 in the reports written by scripts/lighthouse.mjs.
//   node scripts/lighthouse-failures.mjs [reportsDir]
import { readdirSync, readFileSync } from 'node:fs';

const dir = process.argv[2] || 'lighthouse-reports';
for (const f of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
  const r = JSON.parse(readFileSync(`${dir}/${f}`, 'utf8'));
  console.log(`\n== ${f}`);
  for (const cat of Object.values(r.categories)) {
    for (const ref of cat.auditRefs) {
      const a = r.audits[ref.id];
      if (a.score === null || a.score >= 1 || a.scoreDisplayMode === 'informative') continue;
      console.log(`[${cat.id}] ${ref.id} (${a.score}) ${a.displayValue || ''} ${(a.explanation || a.errorMessage || '').slice(0, 160)}`);
    }
  }
}
