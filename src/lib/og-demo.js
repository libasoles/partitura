/* og-demo.js — Social preview (1200x630 PNG) of a published demo, drawn at build time from the same engraving the page
   embeds: one system of the score under its own title and author, with no frame or site name. Language-independent, so
   every translation of the demo (and el-silbador's link card) can share one image. */

import { createRequire } from 'node:module';
import { renderDemo } from './published-demo.js';

const sharp = createRequire(import.meta.url)('sharp');

const WIDTH = 1200;
const HEIGHT = 630;
const MARGIN = 48;
const SCORE_TOP = 128;
// Verovio's page is 941 units wide (staff.js WIDTH) and its inner viewBox is 100/SCALE times larger.
const PAGE_WIDTH = 941;
const SYSTEM_HEIGHT = 405;
const FONT = 'Helvetica, Arial, sans-serif';

const escapeXml = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// One system only: crop the outer viewBox, and the inner one (which has no size of its own) shifted down to that system.
// The first system of a score is often rests and a pickup, so the preview shows the second when there is one.
function pickSystem(svg) {
  const inner = svg.match(/<svg class="definition-scale"[^>]*viewBox="0 0 (\d+) (\d+)"/);
  if (!inner) throw new Error('og-demo: unexpected Verovio SVG');
  const systems = (svg.match(/class="system"/g) ?? []).length;
  const pitch = Number(inner[2]) / Math.max(systems, 1);
  const top = systems > 1 ? Math.round(pitch) : 0;
  const innerHeight = Math.round((SYSTEM_HEIGHT * Number(inner[1])) / PAGE_WIDTH);
  const scale = (WIDTH - 2 * MARGIN) / PAGE_WIDTH;
  return {
    markup: svg
      .replace(/^<svg viewBox="0 0 \d+ \d+"/, `<svg viewBox="0 0 ${PAGE_WIDTH} ${SYSTEM_HEIGHT}" width="${WIDTH - 2 * MARGIN}" height="${Math.round(SYSTEM_HEIGHT * scale)}"`)
      .replace(inner[0], inner[0].replace(/viewBox="[^"]*"/, `viewBox="0 ${top} ${inner[1]} ${innerHeight}"`)),
  };
}

export async function renderDemoOg(source, { title, author }) {
  const { svg } = await renderDemo(source);
  const score = pickSystem(svg);
  const frame = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#fff"/>
    <text x="${MARGIN}" y="72" font-family="${FONT}" font-size="40" fill="#222">${escapeXml(title)}</text>
    <text x="${WIDTH - MARGIN}" y="72" text-anchor="end" font-family="Georgia, serif" font-size="24" fill="#666">${escapeXml(author)}</text>
  </svg>`;
  return sharp(Buffer.from(frame))
    .composite([{ input: await sharp(Buffer.from(score.markup)).png().toBuffer(), left: MARGIN, top: SCORE_TOP }])
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
}
