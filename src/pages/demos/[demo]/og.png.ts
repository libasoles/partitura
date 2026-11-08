import type { APIRoute } from 'astro';
import { DEMOS } from '../../../client/demos.js';
import { renderDemoOg } from '../../../lib/og-demo.js';

const sources = import.meta.glob<string>('/public/demos/*.musicxml', { query: '?raw', import: 'default' });

export function getStaticPaths() {
  return DEMOS.map((demo) => ({ params: { demo: demo.id }, props: { demo } }));
}

export const GET: APIRoute = async ({ props }) => {
  const { demo } = props as { demo: (typeof DEMOS)[number] };
  const source = await sources[`/public${decodeURIComponent(demo.url)}`]();
  const png = await renderDemoOg(source, { title: demo.title, author: demo.author });
  return new Response(png, { headers: { 'Content-Type': 'image/png' } });
};
