/* demo.js — A tiny engine for the looping tutorial animations: a real staff drawn with the same glyphs Verovio uses in
   the editor, plus actors (notes, a pointer, key caps…) that appear, move and recolour on one timeline. Everything is
   CSS keyframes generated here at build time, so the pages stay static and need no script. Reduced motion shows the
   finished score (actors marked `keep: false` — pointer, key caps, "before" states — are hidden).
   Styles for .demo live in src/styles/tutorials.css. Stages are decorative (role="img" with a label); the text of each
   tutorial carries the instructions. */

import { GLYPHS } from './glyphs.js';
import { tutorialIconPaths } from './tutorial-icons.js';

export const SP = 9; // a staff space, in px
const G = SP / 250; // glyph units (1000 per em, so a space is 250) to px
const STEM = 30; // stem thickness, glyph units
const STEM_LEN = 875; // 3.5 spaces
const HEAD_W = 314;

const LETTER = { C: 0, D: 1, E: 2, F: 3, G: 4, A: 5, B: 6 };
/** Staff position of a pitch name in the treble clef: E4 is the bottom line (0), each step is a line or a space. */
export const pitch = (name) => (+name.slice(-1) - 4) * 7 + LETTER[name[0]] - 2;

const f = (n) => +n.toFixed(2);
const FLAGS = { e: 'E240', s: 'E242', f: 'E244' };
const FLAGS_DOWN = { e: 'E241', s: 'E243' };
const HEADS = { w: 'E0A2', h: 'E0A3' };
const RESTS = { w: 'E4E3', h: 'E4E4', q: 'E4E5', e: 'E4E6', s: 'E4E7', f: 'E4E8' };
const ACCIDENTALS = { '#': 'E262', b: 'E260', n: 'E261' };
const SHARPS = [8, 5, 9, 6, 3, 7, 4]; // F C G D A E B, as staff positions in the treble clef
const FLATS = [4, 7, 3, 6, 2, 5, 1];
const CLEF_LINE = { G: ['E050', 2], F: ['E062', 6], C: ['E05C', 4] };

/** A glyph with its origin at (x, y), in px. */
export function glyph(code, x, y, scale = 1, attrs = '') {
  return `<path d="${GLYPHS[code]}" transform="translate(${f(x)} ${f(y)}) scale(${f(G * scale)} ${f(-G * scale)})"${attrs}/>`;
}

/** One note around its head centre (0, 0): head, stem (down from the middle line up), flags, dot, accidental. */
export function noteInner(p, d, { acc, dot, bare, stemDown } = {}) {
  const down = stemDown ?? p >= 4;
  const head = glyph(HEADS[d] || 'E0A4', 0, 0);
  let svg = head;
  if (d !== 'w') {
    const x = down ? 0 : HEAD_W - STEM;
    const end = down ? STEM_LEN : -STEM_LEN;
    svg += `<rect x="${f(x * G)}" y="${f(Math.min(0, end) * G)}" width="${f(STEM * G)}" height="${f(STEM_LEN * G)}"/>`;
    if (!bare && (down ? FLAGS_DOWN : FLAGS)[d]) svg += glyph((down ? FLAGS_DOWN : FLAGS)[d], x * G, end * G);
  }
  if (dot) svg += `<circle cx="${f(HEAD_W * G + SP * 0.6)}" cy="${f(p % 2 === 0 ? -SP / 2 : 0)}" r="${f(SP * 0.22)}"/>`;
  if (acc) svg += glyph(ACCIDENTALS[acc], -SP * 1.25, 0);
  return svg;
}

/** Where a note's stem ends, relative to its head centre. */
export const stemTip = (p) => (p >= 4 ? STEM_LEN * G : -STEM_LEN * G);
/** The x of a note's stem centre, relative to its head's left edge. */
export const stemX = (p) => (p >= 4 ? (STEM * G) / 2 : HEAD_W * G - (STEM * G) / 2);

/** A rest around the staff position it hangs on. */
export function restInner(d) {
  const line = d === 'w' ? 6 : 4; // the whole rest hangs from the fourth line, the others sit around the middle one
  return glyph(RESTS[d], 0, (4 - line) * (SP / 2));
}

/**
 * Heads joined by one beam, in absolute px: `items` are { x, y } of each head (x = left edge, y = centre) and the
 * stems go up. The beam leans half as much as the heads do.
 */
export function beamGroup(items, { slope = 0.5, beams = 1, down = false } = {}) {
  const sign = down ? 1 : -1; // the stems go up, or down from the heads
  const tip = (it) => it.y + sign * STEM_LEN * G;
  const first = items[0];
  const last = items[items.length - 1];
  const sx = (it) => (down ? it.x + (STEM * G) / 2 : it.x + HEAD_W * G - (STEM * G) / 2);
  const ya = tip(first);
  const yb = ya + (tip(last) - ya) * slope;
  const at = (x) => ya + ((yb - ya) * (x - sx(first))) / (sx(last) - sx(first) || 1);
  let svg = '';
  items.forEach((it) => {
    svg += glyph('E0A4', it.x, it.y);
    const end = at(sx(it));
    svg += `<rect x="${f(sx(it) - (STEM * G) / 2)}" y="${f(Math.min(it.y, end))}" width="${f(STEM * G)}" height="${f(Math.abs(end - it.y))}"/>`;
  });
  const bt = SP * 0.5;
  for (let b = 0; b < beams; b += 1) {
    const dy = -sign * b * SP * 0.75 - (down ? bt : 0);
    svg += `<path d="M${f(sx(first) - (STEM * G) / 2)} ${f(ya + dy)}L${f(sx(last) + (STEM * G) / 2)} ${f(yb + dy)}v${f(bt)}L${f(sx(first) - (STEM * G) / 2)} ${f(ya + dy + bt)}z"/>`;
  }
  return { svg, top: Math.min(ya, yb), left: first.x, right: sx(last) };
}

/** A rounded label centred on its origin, sized to its text. */
export function pillInner(text, { size = 9, cls = '', icon = '' } = {}) {
  const w = Math.max(24, text.length * size * 0.62 + 14) + (icon ? 16 : 0);
  const iconPaths = icon.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '');
  return (
    `<rect class="d-pill ${cls}" x="${f(-w / 2)}" y="${-size - 1}" width="${f(w)}" height="${size * 2 + 2}" rx="${size + 1}"/>` +
    (icon ? `<g transform="translate(${f(-w / 2 + 5)} -6) scale(0.5)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconPaths}</g>` : '') +
    `<text x="${icon ? 8 : 0}" class="d-pilltext" text-anchor="middle" dominant-baseline="central" font-size="${size}">${text}</text>`
  );
}

// ----- keyframes ------------------------------------------------------------------------------------------------

const pct = (t, T) => `${f((t / T) * 100)}%`;

function frames(name, T, stops) {
  const sorted = stops.map((s, i) => [s, i]).sort((a, b) => a[0][0] - b[0][0] || a[1] - b[1]).map(([s]) => s);
  const colored = sorted.some(([, p]) => p.c);
  const state = { o: 1, x: 0, y: 0, s: 1, sx: 1, sy: 1, c: 'var(--ink)' };
  const out = [];
  const emit = (t) => {
    const transform = `translate(${f(state.x)}px,${f(state.y)}px) scale(${f(state.s * state.sx)},${f(state.s * state.sy)})`;
    out.push(`${pct(t, T)}{opacity:${f(state.o)};transform:${transform};${colored ? `color:${state.c};` : ''}}`);
  };
  if (sorted[0][0] > 0) Object.assign(state, sorted[0][1]);
  if (sorted[0][0] > 0) emit(0);
  sorted.forEach(([t, props]) => {
    Object.assign(state, props);
    emit(Math.min(t, T));
  });
  if (sorted[sorted.length - 1][0] < T) emit(T);
  return `@keyframes ${name}{${out.join('')}}`;
}

/** The usual life of an actor: invisible, fades in at `t0`, fades out at `t1` (default: just before the loop restarts). */
const life = (t0, t1, T, fade = 0.25) => [
  [0, { o: 0 }], [t0, { o: 0 }], [t0 + fade, { o: 1 }], [t1 ?? T - 0.7, { o: 1 }], [(t1 ?? T - 0.7) + fade, { o: 0 }],
];

/** Pops in (grows from a little smaller) instead of fading. */
const pop = (t0, t1, T) => [
  [0, { o: 0, s: 0.6 }], [t0, { o: 0, s: 0.6 }], [t0 + 0.18, { o: 1, s: 1.08 }], [t0 + 0.32, { o: 1, s: 1 }],
  [(t1 ?? T - 0.7), { o: 1, s: 1 }], [(t1 ?? T - 0.7) + 0.25, { o: 0, s: 1 }],
];

// ----- the stage ---------------------------------------------------------------------------------------------------

const CURSOR = '<path d="M0 0l11 7-5 1.2L3.5 13z" fill="#222" stroke="#fff" stroke-width="1.2" stroke-linejoin="round"/>';

/**
 * A staff to animate on. `clef`, `meter` and `key` (a count of sharps, or negative for flats) draw the start of the
 * line; `staff: false` leaves the lines to the caller. Returns the drawing helpers; `html(label)` finishes it.
 */
export function stage(o) {
  const { id, w = 320, h = 120, T = 8, bottom = 72, x0 = 6, clef = 'G', meter = [4, 4], key = 0, staff = true } = o;
  const base = [];
  const actors = [];
  const css = [];
  const y = (p) => bottom - (p * SP) / 2;
  const d = { id, w, h, T, bottom, x0, y, x1: o.x1 ?? w - 6 };
  d.life = (t0, t1, fade) => life(t0, t1, T, fade);
  d.pop = (t0, t1) => pop(t0, t1, T);

  d.lines = (xa, xb, top = bottom - 4 * SP, n = 5, gap = SP) => {
    let svg = '';
    for (let i = 0; i < n; i += 1) svg += `M${f(xa)} ${f(top + i * gap)}H${f(xb)}`;
    return `<path class="d-line" d="${svg}"/>`;
  };
  d.clefAt = (x, c = clef) => glyph(CLEF_LINE[c][0], x, y(CLEF_LINE[c][1]));
  d.meterAt = (x, [a, b]) => glyph(`E08${a}`, x, y(6)) + glyph(`E08${b}`, x, y(2));
  /** The key signature at x; `lower` moves it down that many staff steps (2 for the bass clef). */
  d.keyAt = (x, count, lower = 0) => {
    const list = count >= 0 ? SHARPS : FLATS;
    return list.slice(0, Math.abs(count)).map((p, i) => glyph(count >= 0 ? 'E262' : 'E260', x + i * SP * 0.95, y(p - lower))).join('');
  };
  d.barline = (x, thick = 1.1) => `<path d="M${f(x)} ${f(y(8))}V${f(y(0))}" class="d-bar" stroke-width="${thick}"/>`;

  // The head of the line: the clef, then the key and the meter, with the first note slot after them.
  const clefX = x0 + 4;
  d.keyX = clefX + 876 * G;
  d.meterX = d.keyX + (key ? Math.abs(key) * SP * 0.95 + SP * 0.5 : 0);
  d.firstX = (meter ? d.meterX + 36 : d.keyX + Math.abs(key) * SP * 0.95 + 14);
  if (staff) {
    base.push(d.lines(x0, d.x1));
    base.push(d.clefAt(clefX));
    if (key) base.push(d.keyAt(d.keyX, key));
    if (meter) base.push(d.meterAt(d.meterX, meter));
    base.push(d.barline(x0, 1.1), d.barline(d.x1, 1.1));
  }
  d.base = (svg) => { base.push(svg); };

  /** An actor drawn around its own origin placed at (x, y); its stops animate opacity, scale, offset and colour. */
  d.add = (x, py, inner, stops, { keep = true, cls = '' } = {}) => {
    const name = `${id}-${actors.length}`;
    css.push(frames(name, T, stops));
    actors.push(
      `<g transform="translate(${f(x)} ${f(py)})"><g class="d-a${keep ? '' : ' d-gone'}${cls ? ` ${cls}` : ''}" style="animation-name:${name};animation-duration:${T}s">${inner}</g></g>`,
    );
  };

  d.note = (x, p, dur, stops, opts = {}) => d.add(x, y(p), noteInner(p, dur, opts), stops, opts);
  d.rest = (x, dur, stops, opts = {}) => d.add(x, bottom - 2 * SP, restInner(dur), stops, opts);

  d.text = (x, py, text, stops, { size = 9, anchor = 'middle', weight = 600, italic = false, font, ...opts } = {}) =>
    d.add(x, py, `<text class="d-text" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}"${italic ? ' font-style="italic"' : ''}${font ? ` style="font-family:${font}"` : ''}>${text}</text>`, stops, opts);

  /** A fret number on a tab line, with the paper behind it hiding the string. */
  d.fret = (x, top, string, n, stops, opts = {}) => d.text(x, top + string * 7 + 3, n, stops, { size: 8.5, cls: 'd-fret', ...opts });

  /** A click ripple at (x, y) at time t. */
  d.click = (t, x, py) =>
    d.add(x, py, '<circle class="d-ring" r="8"/>', [
      [0, { o: 0, s: 0.3 }], [t - 0.01, { o: 0, s: 0.3 }], [t, { o: 0.95, s: 0.3 }], [t + 0.45, { o: 0, s: 1.4 }], [t + 0.46, { o: 0, s: 0.3 }],
    ], { keep: false });

  /** The mouse pointer travelling through [t, x, y] waypoints. */
  d.pointer = (path) => {
    const [t0, x0p, y0p] = path[0];
    const last = path[path.length - 1];
    const stops = [[0, { o: 0, x: x0p, y: y0p }], [t0, { o: 0, x: x0p, y: y0p }], [t0 + 0.25, { o: 1 }]];
    path.forEach(([t, px, py]) => stops.push([t, { x: px, y: py }]));
    stops.push([last[0] + 0.3, { o: 0 }], [last[0] + 0.31, { o: 0, x: x0p, y: y0p }]);
    d.add(0, 0, CURSOR, stops, { keep: false, cls: 'd-pointer' });
  };

  /**
   * A key cap, visible for the whole loop so the viewer knows up front which keys the demo uses; it lights up (pressed)
   * at `press` (one time or a list of them). Caps are laid out in a row when the demo is rendered, one per label, so a
   * key pressed several times is a single cap. `show`, `hide` and `kx` are kept for call sites but no longer position it.
   */
  const caps = [];
  d.keycap = (label, kx, show, press, hide, { ky = h - 14, cap = false } = {}) => {
    const found = caps.find((c) => c.label === label && c.ky === ky);
    const presses = [].concat(press);
    if (found) found.presses.push(...presses);
    else caps.push({ label, kx, ky, cap, presses });
  };

  const drawCaps = () => {
    const widthOf = (label) => Math.max(16, label.length * 6.4 + 10);
    // Caps keep to the side where the call site put them, in the order they were declared.
    [true, false].forEach((right) => {
      const group = caps.filter((c) => (c.kx > w / 2) === right);
      const total = group.reduce((sum, c) => sum + widthOf(c.label) + 4, -4);
      let x = right ? w - 14 - total : 14;
      group.forEach((c) => {
        const width = widthOf(c.label);
        const inner =
          `<rect class="d-cap" x="${f(-width / 2)}" y="-8" width="${f(width)}" height="16" rx="3.5"/>` +
          `<text class="d-captext" text-anchor="middle" dominant-baseline="central" font-size="${c.cap ? 8 : 9}">${c.label}</text>`;
        const cx = x + width / 2;
        x += width + 4;
        const presses = [...c.presses].sort((a, b) => a - b);
        const stops = [[0, { o: 1, c: 'var(--ink-soft)', y: 0 }]];
        presses.forEach((at) => stops.push(
          [at, { c: 'var(--ink-soft)', y: 0 }], [at + 0.08, { c: 'var(--accent)', y: 1.2 }], [at + 0.5, { c: 'var(--accent)', y: 1.2 }], [at + 0.62, { c: 'var(--ink-soft)', y: 0 }],
        ));
        d.add(cx, c.ky, inner, stops, { keep: false });
        // A fingertip taps the cap at the moment it lights up: the Lucide pointer, its tip on the key.
        const tap = [[0, { o: 0, y: 5 }]];
        presses.forEach((at) => tap.push(
          [at - 0.25, { o: 0, y: 5 }], [at - 0.05, { o: 1, y: 0 }], [at + 0.1, { o: 1, y: 1.5 }], [at + 0.5, { o: 1, y: 0 }], [at + 0.75, { o: 0, y: 5 }],
        ));
        d.add(cx + 1, c.ky + 1, `<g transform="scale(0.6) translate(-9 -3)" class="d-finger-icon"><g class="d-finger" fill="var(--paper)">${tutorialIconPaths('pointer')}</g></g>`, tap, { keep: false, cls: 'd-finger-actor' });
      });
    });
  };

  d.html = (label) => {
    drawCaps();
    caps.length = 0;
    return (
      `<figure class="demo">` +
      `<svg class="demo__stage" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label.replace(/"/g, '&quot;')}" fill="currentColor">` +
      `<style>${css.join('')}</style>` +
      `${base.join('')}${actors.join('')}</svg></figure>`
    );
  };
  return d;
}

/** Concatenates stop lists. */
export const S = (...parts) => parts.flat();
