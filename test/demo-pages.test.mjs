import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEMOS, demoPath } from '../src/client/demos.js';

for (const demo of DEMOS) {
  for (const locale of ['es', 'en', 'pt']) {
    test(`${locale}: ${demo.id} has its own share metadata in the static HTML`, () => {
      const path = demoPath(locale, demo);
      const html = readFileSync(new URL(`../dist${path}index.html`, import.meta.url), 'utf8');
      for (const attribute of ['property="og:title"', 'property="og:description"', 'name="twitter:title"', 'name="twitter:description"']) {
        const content = html.match(new RegExp(`<meta ${attribute} content="([^"]+)"`))?.[1];
        assert.ok(content?.includes(demo.title), attribute);
        assert.ok(content?.includes(demo.author), attribute);
      }
      assert.ok(html.includes(`<meta name="author" content="${demo.author}"`));
      assert.ok(html.includes(`<link rel="canonical" href="https://partitura.com.ar${path}"`));
      assert.ok(html.includes(`<meta property="og:url" content="https://partitura.com.ar${path}"`));
      for (const language of ['es', 'en', 'pt']) assert.ok(html.includes(`hreflang="${language}" href="https://partitura.com.ar${demoPath(language, demo)}"`));
      assert.ok(html.includes(`data-demo-id="${demo.id}"`));
      assert.ok(html.includes('class="banner-closed"'));
    });
  }
}
