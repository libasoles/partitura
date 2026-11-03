import type { APIRoute } from 'astro';
import { defaultLocale, locales, pathFor, strings, tutorialsPath } from '../i18n';
import { slugs } from '../lib/tutorials';

// llms.txt (https://llmstxt.org): a short Markdown map of the site for language models, built from the same strings
// as the pages so it never drifts from them.
export const GET: APIRoute = ({ site }) => {
  const abs = (path: string) => new URL(path, site).toString();
  const main = strings(defaultLocale);
  const sections = locales.map((locale) => {
    const s = strings(locale);
    const links = [
      `- [${s.scorePageTitle}](${abs(pathFor(locale))}): ${s.scoreMetaDescription}`,
      ...slugs.map((slug) => `- [${s.tutorials.items[slug][0]}](${abs(tutorialsPath(locale, slug))}): ${s.tutorials.items[slug][1]}`),
    ];
    return `## ${locale.toUpperCase()}\n\n${links.join('\n')}`;
  });
  const body = `# ${main.ui.siteName}\n\n> ${main.scoreMetaDescription}\n\nFree, no-signup online music score editor with guitar tablature. Scores stay in the browser; export to PDF, MusicXML and MIDI. Available in Spanish, English and Portuguese.\n\n${sections.join('\n\n')}\n`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
