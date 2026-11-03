import es from './es.json';
import en from './en.json';
import pt from './pt.json';

export const locales = ['es', 'en', 'pt'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'es';

const catalogs = { es, en, pt };
export type Strings = typeof es;

export function strings(locale: Locale): Strings {
  return catalogs[locale] as Strings;
}

/**
 * Every language has its own prefixed URL (/es/, /en/, /pt/). The bare root is the x-default entry that sends
 * visitors to the language of their browser (see pages/index.astro); it never holds a language's content.
 */
export function pathFor(locale: Locale): string {
  return `/${locale}/`;
}

export const rootPath = '/';

export function urlFor(locale: Locale, site: URL | string): string {
  return new URL(pathFor(locale), site).toString();
}

export const ogLocales: Record<Locale, string> = { es: 'es_ES', en: 'en_US', pt: 'pt_BR' };

/** The tutorials section: /tutoriales/, /en/tutorials/, /pt/tutoriais/ (plus a slug for one tutorial). */
export function tutorialsPath(locale: Locale, slug?: string): string {
  const base = `${pathFor(locale)}${strings(locale).tutorialsPath}/`;
  return slug ? `${base}${slug}/` : base;
}
