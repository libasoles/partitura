// Run after `npm run build`: the SEO-relevant content must already be in the server-rendered HTML.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const htmlLang = { es: 'es', en: 'en', pt: 'pt-BR' };
const pages = { es: 'dist/es/index.html', en: 'dist/en/index.html', pt: 'dist/pt/index.html' };

for (const [locale, file] of Object.entries(pages)) {
  test(`${locale}: content is rendered in the HTML`, () => {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(html, new RegExp(`<html lang="${htmlLang[locale]}"`));
    assert.equal(html.match(/<h1[ >]/g)?.length, 1);
    assert.match(html, /<link rel="canonical" href="[^"]+"/);
    for (const l of ['es', 'en', 'pt', 'x-default']) assert.match(html, new RegExp(`hreflang="${l}"`));
    assert.match(html, /application\/ld\+json/);
    assert.match(html, /id="scoreStage"[^>]*><svg/, 'the empty staff is drawn on the server');
    assert.match(html, /class="staff"/);
  });
}

test('root: x-default entry picks the language from the browser, without a manual selector', () => {
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  assert.match(html, /<link rel="canonical" href="https:\/\/[^"]+\/"/);
  for (const l of ['es', 'en', 'pt', 'x-default']) assert.match(html, new RegExp(`hreflang="${l}"`));
  assert.match(html, /navigator\.languages/);
  assert.match(html, /location\.replace/);
  for (const l of ['es', 'en', 'pt']) assert.match(html, new RegExp(`<a href="/${l}/"`), `crawlable link to /${l}/`);
});

for (const file of ['dist/es/index.html', 'dist/en/index.html', 'dist/pt/index.html']) {
  test(`${file}: no manual language selector, no redirect, x-default points to the root`, () => {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(html, /lang-switch|location\.replace/);
    assert.match(html, /hreflang="x-default" href="https:\/\/[^"]+\/"/);
  });
}

test('social preview, icons and manifest are declared', () => {
  const html = readFileSync(new URL('../dist/es/index.html', import.meta.url), 'utf8');
  assert.match(html, /<meta property="og:image" content="https:\/\/[^"]+\/og\.png"/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image"/);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/[^"]+\/og\.png"/);
  assert.match(html, /rel="apple-touch-icon" href="\/apple-touch-icon\.png"/);
  assert.match(html, /rel="manifest" href="\/manifest\.webmanifest"/);
  const manifest = JSON.parse(readFileSync(new URL('../dist/manifest.webmanifest', import.meta.url), 'utf8'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'));
  assert.match(readFileSync(new URL('../dist/llms.txt', import.meta.url), 'utf8'), /^# Partitura/);
});

test('first paint does not wait on CSS, fonts or heavy scripts', () => {
  const html = readFileSync(new URL('../dist/es/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /rel="stylesheet"/, 'CSS is inlined');
  assert.match(html, /<link rel="preload" href="\/_astro\/montserrat-latin-wght-normal[^"]+\.woff2" as="font" type="font\/woff2" crossorigin/);
  assert.doesNotMatch(html, /(src|href)="[^"]*(ascii-tabs|jspdf|verovio)/, 'tabs, PDF export and Verovio load on demand');
});

for (const [locale, file] of Object.entries(pages)) {
  test(`${locale}: the welcome banner keeps the single h1, the description and the dismissal cookie`, () => {
    const html = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.match(html, /<section class="welcome-banner"[^>]*>\s*<h1 [^>]*class="welcome-banner__title"/);
    assert.match(html, /<p class="welcome-banner__lead">/);
    assert.match(html, /id="welcomeBannerClose"/);
    assert.match(html, /<head>[\s\S]*banner-closed=1[\s\S]*<\/head>/, 'the cookie is read in <head>, before the first paint');
  });
}
