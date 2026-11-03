import { pathFor, strings, tutorialsPath, type Locale } from '../i18n';

interface Options {
  locale: Locale;
  siteName: string;
  name: string;
  description: string;
  url: string;
  homeUrl: string;
  faq?: { q: string; a: string }[];
}

const stripTags = (html: string) => html.replace(/<[^>]+>/g, '');

const faqPage = (faq: NonNullable<Options['faq']>) => ({
  '@type': 'FAQPage',
  mainEntity: faq.map((item) => ({
    '@type': 'Question',
    name: stripTags(item.q),
    acceptedAnswer: { '@type': 'Answer', text: stripTags(item.a) },
  })),
});

/** The tutorials section is recognised by its URL, so the page that renders it needs no extra prop. */
function tutorialSlug(o: Options): string | null | undefined {
  const path = new URL(o.url).pathname;
  const index = tutorialsPath(o.locale);
  if (path === index) return null;
  if (path.startsWith(index)) return path.slice(index.length).replace(/\/$/, '');
  return undefined;
}

/** BreadcrumbList + HowTo/Article (or FAQPage) for the tutorials index and each tutorial. */
function tutorialGraph(o: Options, slug: string | null) {
  const s = strings(o.locale);
  const t = s.tutorials;
  const site = new URL(o.url);
  const abs = (path: string) => new URL(path, site).toString();
  const editorUrl = abs(pathFor(o.locale));
  const indexUrl = abs(tutorialsPath(o.locale));
  const crumbs = [
    { name: s.ui.home, url: editorUrl },
    { name: t.h1, url: indexUrl },
    ...(slug ? [{ name: (t.items as Record<string, string[]>)[slug][0], url: o.url }] : []),
  ];
  const breadcrumb = {
    '@type': 'BreadcrumbList',
    '@id': `${o.url}#breadcrumb`,
    itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.url })),
  };
  const app = { '@type': 'WebApplication', '@id': `${editorUrl}#app`, name: s.ui.siteName, url: editorUrl };
  const website = { '@id': `${o.homeUrl}#website` };
  const webPage = (type: string) => ({
    '@type': type,
    '@id': `${o.url}#page`,
    url: o.url,
    name: o.name,
    description: o.description,
    inLanguage: o.locale,
    isPartOf: website,
    breadcrumb: { '@id': `${o.url}#breadcrumb` },
    about: app,
  });

  let main: object;
  if (!slug) {
    main = webPage('CollectionPage');
  } else if (slug === 'faq' && o.faq) {
    main = { ...webPage('WebPage'), mainEntity: faqPage(o.faq) };
  } else {
    const steps = slug === 'start' ? s.scoreHow : (t.bodies as Record<string, { steps?: string[] }>)[slug]?.steps;
    const headline = (t.items as Record<string, string[]>)[slug][0];
    const base = {
      '@id': `${o.url}#page`,
      mainEntityOfPage: o.url,
      url: o.url,
      inLanguage: o.locale,
      description: o.description,
      isPartOf: website,
      about: app,
      publisher: { '@type': 'Organization', name: s.ui.siteName, url: o.homeUrl },
    };
    main = steps
      ? {
          '@type': 'HowTo',
          name: headline,
          ...base,
          step: steps.map((text, i) => ({ '@type': 'HowToStep', position: i + 1, text: stripTags(text) })),
        }
      : { '@type': 'Article', headline, ...base };
  }

  return [{ '@type': 'WebSite', '@id': `${o.homeUrl}#website`, name: o.siteName, url: o.homeUrl, inLanguage: o.locale }, breadcrumb, main];
}

/** WebSite + WebApplication on the editor pages; BreadcrumbList + HowTo/Article/FAQPage on the tutorials. */
export function pageJsonLd(o: Options) {
  const slug = tutorialSlug(o);
  if (slug !== undefined) return { '@context': 'https://schema.org', '@graph': tutorialGraph(o, slug) };
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${o.homeUrl}#website`, name: o.siteName, url: o.homeUrl, inLanguage: o.locale },
      {
        '@type': 'WebApplication',
        '@id': `${o.url}#app`,
        name: o.name,
        description: o.description,
        url: o.url,
        inLanguage: o.locale,
        applicationCategory: 'MusicApplication',
        operatingSystem: 'Any',
        browserRequirements: 'Requires JavaScript',
        isAccessibleForFree: true,
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        isPartOf: { '@id': `${o.homeUrl}#website` },
      },
      ...(o.faq ? [faqPage(o.faq)] : []),
    ],
  };
}
