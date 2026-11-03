// Generates public/og-{es,en,pt}.png (1200x630) from scripts/og-base.png
// (the original OG image with the tagline and score title blanked out),
// drawing the localized texts on top. Needs ImageMagick (`magick`) on PATH.
// Usage: npm run og
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const exercise = { es: 'Ejercicio 5', en: 'Exercise 5', pt: 'Exercício 5' };
const tagline = {
  es: 'Editor de partituras online y gratis',
  en: 'Free online sheet music editor',
  pt: 'Editor de partituras online e grátis',
};
const font = process.env.OG_FONT || '/System/Library/Fonts/Supplemental/Arial.ttf';

for (const lang of ['es', 'en', 'pt']) {
  const out = `${root}public/og-${lang}.png`;
  execFileSync('magick', [
    `${root}scripts/og-base.png`,
    '-font', font, '-fill', '#555555', '-pointsize', '24',
    '-annotate', '+371+85', tagline[lang],
    '-fill', '#222222', '-pointsize', '26',
    '-annotate', '+103+180', exercise[lang],
    '-strip', '-colors', '64', '-define', 'png:compression-level=9',
    out,
  ]);
  console.log('wrote', out);
}
