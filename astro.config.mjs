import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { locales, pathFor, rootPath, tutorialsPath } from './src/i18n/index.ts';
import { slugs } from './src/lib/tutorials.ts';

// The public origin. Canonical URLs, hreflang, Open Graph and the sitemap are built from it, so set it for production:
//   SITE_URL=https://your-domain.com npm run build
const site = (process.env.SITE_URL || 'https://partitura.example').replace(/\/+$/, '');

// Every page with its translations, keyed by path. The sitemap repeats the hreflang annotations of each page's <head>:
// one entry per language plus x-default, which points to the language-negotiating root.
const groups = [
  Object.fromEntries(locales.map((l) => [l, pathFor(l)])),
  Object.fromEntries(locales.map((l) => [l, tutorialsPath(l)])),
  ...slugs.map((slug) => Object.fromEntries(locales.map((l) => [l, tutorialsPath(l, slug)]))),
];
const alternates = new Map();
for (const group of groups) for (const path of Object.values(group)) alternates.set(path, group);

export default defineConfig({
  site,
  // Every page is rendered to HTML at build time and served as static files: the fastest response and the full
  // content in the markup crawlers read. Only the editor itself runs in the browser.
  output: 'static',
  trailingSlash: 'always',
  compressHTML: true,
  build: { inlineStylesheets: 'auto' },
  integrations: [
    sitemap({
      serialize(item) {
        const path = new URL(item.url).pathname;
        const group = path === rootPath ? Object.fromEntries(locales.map((l) => [l, pathFor(l)])) : alternates.get(path);
        if (group) {
          item.links = [
            ...Object.entries(group).map(([lang, p]) => ({ url: new URL(p, site).toString(), lang })),
            { url: new URL(rootPath, site).toString(), lang: 'x-default' },
          ];
        }
        return item;
      },
    }),
  ],
});
