import type { Locale } from '../i18n';

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

/** WebSite + WebApplication + FAQPage, with the same text the page shows. */
export function pageJsonLd(o: Options) {
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
      ...(o.faq
        ? [{
            '@type': 'FAQPage',
            mainEntity: o.faq.map((item) => ({
              '@type': 'Question',
              name: stripTags(item.q),
              acceptedAnswer: { '@type': 'Answer', text: stripTags(item.a) },
            })),
          }]
        : []),
    ],
  };
}
