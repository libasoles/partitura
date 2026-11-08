import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEMOS, demoPath } from '../src/client/demos.js';
import { DOMParser } from 'linkedom';
import { createScoreModel } from '../src/client/score-model.js';

for (const demo of DEMOS) {
  for (const locale of ['es', 'en', 'pt']) {
    test(`${locale}: ${demo.id} has its own share metadata in the static HTML`, () => {
      const path = demoPath(locale, demo);
      const html = readFileSync(new URL(`../dist${path}index.html`, import.meta.url), 'utf8');
      for (const attribute of ['property="og:title"', 'name="twitter:title"']) {
        const content = html.match(new RegExp(`<meta ${attribute} content="([^"]+)"`))?.[1];
        assert.ok(content?.includes(demo.title), attribute);
        assert.ok(content?.includes(demo.author), attribute);
      }
      // The description is about the site and the PDF; the title already says which score it is.
      for (const attribute of ['name="description"', 'property="og:description"', 'name="twitter:description"']) {
        const content = html.match(new RegExp(`<meta ${attribute} content="([^"]+)"`))?.[1];
        assert.match(content ?? '', /PDF/, attribute);
        assert.ok(!content.includes(demo.title) && !content.includes(demo.author), attribute);
      }
      assert.ok(html.includes(`<meta name="author" content="${demo.author}"`));
      assert.ok(html.includes(`<link rel="canonical" href="https://partitura.com.ar${path}"`));
      assert.ok(html.includes(`<meta property="og:url" content="https://partitura.com.ar${path}"`));
      for (const language of ['es', 'en', 'pt']) assert.ok(html.includes(`hreflang="${language}" href="https://partitura.com.ar${demoPath(language, demo)}"`));
      assert.ok(html.includes(`data-demo-id="${demo.id}"`));
      assert.ok(html.includes('class="banner-closed"'));
      assert.match(html, /<meta name="robots" content="index, follow/);
      assert.ok(html.includes(`<h1>${demo.title} — ${demo.author}</h1>`));
      const index = readFileSync(new URL(`../dist/${locale}/index.html`, import.meta.url), 'utf8');
      assert.match(index, new RegExp(`<a [^>]*href="${path}"[^>]*data-demo-url=`));
      const sitemap = readFileSync(new URL('../dist/sitemap-0.xml', import.meta.url), 'utf8');
      assert.ok(sitemap.includes(`<loc>https://partitura.com.ar${path}</loc>`));
      const robots = readFileSync(new URL('../dist/robots.txt', import.meta.url), 'utf8');
      assert.match(robots, /User-agent: \*\nAllow: \//);
    });

    test(`${locale}: ${demo.id} includes the complete score and lyrics before JavaScript`, () => {
      const html = readFileSync(new URL(`../dist${demoPath(locale, demo)}index.html`, import.meta.url), 'utf8');
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const initial = JSON.parse(doc.getElementById('demoScore').textContent);
      assert.equal(initial.id, demo.id);
      assert.equal(initial.score.title, demo.title);
      const model = createScoreModel({ grandStaff: true, choir: true });
      const stage = doc.getElementById('scoreStage');
      const measures = model.measures(initial.score);
      assert.equal(stage.querySelectorAll('g.measure').length, measures.length);
      let notes = 0;
      for (let s = 0; s < model.stavesOf(initial.score); s++) {
        model.measures(initial.score, s).forEach((measure, mi) => measure.forEach((note, i) => {
          if (note.rest) return;
          notes++;
          assert.ok(stage.querySelector(`g.note[id="${model.ID_PREFIX[s]}${mi}-${i}"]`), `staff ${s}, measure ${mi}, note ${i}`);
        }));
      }
      assert.equal(stage.querySelectorAll('g.note').length, notes);
      assert.ok(stage.querySelectorAll('g.verse').length > 0);
      assert.ok([...stage.querySelectorAll('g.dir')].some((node) => /^[IVXL\s]+$/.test(node.textContent)));
      assert.equal(model.stavesOf(initial.score), 3);
    });
  }
}
