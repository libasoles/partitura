import type { APIRoute } from 'astro';
import { defaultLocale, strings } from '../i18n';

const s = strings(defaultLocale);

export const GET: APIRoute = () =>
  new Response(
    JSON.stringify({
      name: s.ui.siteName,
      short_name: s.ui.siteName,
      description: s.scoreMetaDescription,
      lang: defaultLocale,
      start_url: '/',
      scope: '/',
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#ffffff',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
      ],
    }),
    { headers: { 'Content-Type': 'application/manifest+json; charset=utf-8' } },
  );
