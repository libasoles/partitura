/* og-demo.js — Social preview (1200x630 PNG) of a published demo, drawn at build time from the same engraving the page
   embeds: the first system of the score on a card with its title and author. Language-independent, so every translation
   of the demo (and the-silbador's link card) can share one image. */

import { createRequire } from 'node:module';
import { renderDemo } from './published-demo.js';

const sharp = createRequire(import.meta.url)('sharp');

const WIDTH = 1200;
const HEIGHT = 630;
const CARD = { x: 64, y: 130, w: 1072, h: 470 };
const SCORE_PAD = 40;
// Verovio's page is 941 units wide (staff.js WIDTH) and its inner viewBox is 100/SCALE times larger.
const PAGE_WIDTH = 941;
const SYSTEM_HEIGHT = 385;
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
  const scale = (CARD.w - 2 * SCORE_PAD) / PAGE_WIDTH;
  return {
    height: Math.round(SYSTEM_HEIGHT * scale),
    markup: svg
      .replace(/^<svg viewBox="0 0 \d+ \d+"/, `<svg viewBox="0 0 ${PAGE_WIDTH} ${SYSTEM_HEIGHT}" width="${CARD.w - 2 * SCORE_PAD}" height="${Math.round(SYSTEM_HEIGHT * scale)}"`)
      .replace(inner[0], inner[0].replace(/viewBox="[^"]*"/, `viewBox="0 ${top} ${inner[1]} ${innerHeight}"`)),
  };
}

export async function renderDemoOg(source, { title, author, siteName = 'Partitura' }) {
  const { svg } = await renderDemo(source);
  const score = pickSystem(svg);
  const frame = `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}">
    <rect width="${WIDTH}" height="${HEIGHT}" fill="#fff"/>
    <text x="64" y="92" font-family="${FONT}" font-weight="700" font-size="52" fill="#111">${escapeXml(siteName)}</text>
    <rect x="${CARD.x}" y="${CARD.y}" width="${CARD.w}" height="${CARD.h}" rx="14" fill="#fff" stroke="#ddd" stroke-width="2"/>
    <text x="${CARD.x + SCORE_PAD}" y="${CARD.y + 56}" font-family="${FONT}" font-size="34" fill="#222">${escapeXml(title)}</text>
    <text x="${CARD.x + CARD.w - SCORE_PAD}" y="${CARD.y + 56}" text-anchor="end" font-family="Georgia, serif" font-size="22" fill="#666">${escapeXml(author)}</text>
  </svg>`;
  return sharp(Buffer.from(frame))
    .composite([{ input: await sharp(Buffer.from(score.markup)).png().toBuffer(), left: CARD.x + SCORE_PAD, top: CARD.y + 72 }])
    .png({ compressionLevel: 9, palette: true })
    .toBuffer();
}
