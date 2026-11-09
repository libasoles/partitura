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

test('demos: each has its own 1200x630 social image, built from its score', () => {
  const html = readFileSync(new URL('../dist/es/demos/canto-en-la-rama/index.html', import.meta.url), 'utf8');
  assert.match(html, /<meta property="og:image" content="https:\/\/[^"]+\/demos\/canto-en-la-rama\/og\.png"/);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/[^"]+\/demos\/canto-en-la-rama\/og\.png"/);
  const png = readFileSync(new URL('../dist/demos/canto-en-la-rama/og.png', import.meta.url));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), 1200);
  assert.equal(png.readUInt32BE(20), 630);
});

test('social preview and icons are declared', () => {
  const html = readFileSync(new URL('../dist/es/index.html', import.meta.url), 'utf8');
  assert.match(html, /<meta property="og:image" content="https:\/\/[^"]+\/og-es\.png"/);
  assert.match(html, /<meta name="twitter:card" content="summary_large_image"/);
  assert.match(html, /<meta name="twitter:image" content="https:\/\/[^"]+\/og-es\.png"/);
  assert.match(html, /rel="apple-touch-icon" href="\/apple-touch-icon\.png"/);
  assert.doesNotMatch(html, /rel="manifest"/, 'the site is not a PWA');
  assert.match(readFileSync(new URL('../dist/llms.txt', import.meta.url), 'utf8'), /^# Partitura/);
});

test('first paint does not wait on CSS, fonts or heavy scripts', () => {
  const html = readFileSync(new URL('../dist/es/index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(html, /rel="stylesheet"/, 'CSS is inlined');
  assert.match(html, /<link rel="preload" href="\/_astro\/montserrat-latin-wght-normal[^"]+\.woff2" as="font" type="font\/woff2" crossorigin/);
  assert.doesNotMatch(html, /(src|href)="[^"]*(ascii-tabs|jspdf|score-export)/, 'tabs and PDF export load on demand');
  assert.doesNotMatch(html, /<script[^>]*verovio/, 'Verovio is never a blocking script');
  // Verovio is only hinted: low priority, and only where the editor runs (phones get the "desktop only" screen).
  const hints = html.match(/<link[^>]*verovio[^>]*>/g) ?? [];
  assert.equal(hints.length, 2, 'the script and the WebAssembly are preloaded');
  for (const hint of hints) assert.match(hint, /fetchpriority="low"[^>]*media="\(min-width: 900px\)"|media="\(min-width: 900px\)"[^>]*fetchpriority="low"/, hint);
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

const tutorialDirs = { es: 'tutoriales', en: 'tutorials', pt: 'tutoriais' };
const graphOf = (html) => {
  const m = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
  return JSON.parse(m[1])['@graph'];
};

for (const [locale, dir] of Object.entries(tutorialDirs)) {
  test(`${locale}: tutorials have their own JSON-LD, titles, related links and one h1`, () => {
    const read = (p) => readFileSync(new URL(`../dist/${locale}/${dir}/${p}`, import.meta.url), 'utf8');
    const types = (html) => graphOf(html).map((n) => n['@type']);

    const index = read('index.html');
    assert.deepEqual(types(index), ['WebSite', 'BreadcrumbList', 'CollectionPage']);
    assert.equal(graphOf(index)[1].itemListElement.length, 2);
    assert.equal(index.match(/<h1[ >]/g)?.length, 1);
    assert.ok((index.match(new RegExp(`href="/${locale}/${dir}/[a-z-]+/"`, 'g')) ?? []).length >= 22, 'index links every tutorial');

    const start = read('start/index.html');
    const g = graphOf(start);
    assert.deepEqual(types(start), ['WebSite', 'BreadcrumbList', 'HowTo']);
    assert.equal(g[1].itemListElement.length, 3);
    const howTo = g[2];
    assert.ok(howTo.name && howTo.description && howTo.step.length > 0);
    assert.equal(howTo.inLanguage, locale);
    assert.deepEqual(howTo.isPartOf, { '@id': g[0]['@id'] });
    assert.equal(howTo.about['@type'], 'WebApplication');
    assert.doesNotMatch(JSON.stringify(g), /"applicationCategory"/, 'the app is described on the editor page only');
    assert.match(start, /class="tutorial-related"/);
    assert.match(start, new RegExp(`<a href="/${locale}/">`), 'links to the editor');
    assert.equal(start.match(/<h1[ >]/g)?.length, 1);
    assert.ok(start.indexOf('<h1') < start.indexOf('<h2'), 'h1 comes before any h2');
    assert.doesNotMatch(start.match(/<title>(.*?)<\/title>/)[1], /^[^·]{0,20} ·/, 'title is descriptive');

    const features = read('features/index.html');
    assert.deepEqual(types(features), ['WebSite', 'BreadcrumbList', 'Article']);

    const faq = read('faq/index.html');
    const faqGraph = graphOf(faq);
    assert.equal(faqGraph[2].mainEntity['@type'], 'FAQPage');
    assert.ok(faqGraph[2].mainEntity.mainEntity.length > 0);
  });
}

const proDirs = { es: 'pro', en: 'pro', pt: 'pro' };
for (const [locale, dir] of Object.entries(proDirs)) {
  test(`${locale}: the Pro page lists the plans, tracks the funnel and is linked from the menu`, () => {
    const html = readFileSync(new URL(`../dist/${locale}/${dir}/index.html`, import.meta.url), 'utf8');
    assert.equal(html.match(/<h1[ >]/g)?.length, 1);
    assert.equal(html.match(/data-plan="(monthly|yearly)"/g)?.length, 2);
    assert.match(html, /2000/);
    assert.match(html, /16000/);
    assert.match(html, /pro_plan_click/);
    assert.match(html, /data-pro-thanks/);
    const menuLink = new RegExp(`href="/${locale}/pro/" data-pro-menu`);
    if (locale === 'es') assert.doesNotMatch(html, menuLink, 'the Spanish menu does not link to it');
    else assert.match(html, menuLink, 'the menu links to it');
  });
}
