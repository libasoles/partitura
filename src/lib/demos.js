/* demos.js — One looping, realistic animation per tutorial: a short phrase on a real staff and a pointer doing exactly
   what the text says (see demo.js for the engine). Each function takes the language's strings for the few labels drawn
   inside the stage and returns the figure's HTML. */

import { stage, pitch, S, SP, beamGroup, pillInner, glyph, noteInner } from './demo.js';

import { tutorialIcon, tutorialIconPaths } from './tutorial-icons.js';

const SEL = 'var(--note-selected)';
const INK = 'var(--ink)';

/** Pointer waypoints that reach (x, y) a moment before `t` and stay until just after it. */
const visit = (t, x, y) => [[t - 0.35, x, y], [t + 0.15, x, y]];

/** A phrase laid out on the staff: where each note goes, measure by measure. */
function phrase(d, measures, gap = 30) {
  const slots = [];
  let x = d.firstX;
  measures.forEach((notes, m) => {
    notes.forEach((n) => {
      slots.push({ x, ...n, p: pitch(n.name) });
      x += gap;
    });
    if (m < measures.length - 1) {
      x += 2;
      d.base(d.barline(x - 10));
      x += 8;
    }
  });
  return slots;
}

const q = (name, extra) => ({ name, d: 'q', ...extra });

/** Places notes one after another with the pointer, as a hand would. */
function placing(d, slots, start, every, pitchY = (n) => d.y(n.p)) {
  const path = [[start - 0.9, d.w - 30, d.h - 24]];
  slots.forEach((n, i) => {
    const t = start + i * every;
    path.push(...visit(t, n.x + 5, pitchY(n)));
    d.note(n.x, n.p, n.d, d.pop(t), n);
    d.click(t, n.x + 5, pitchY(n));
  });
  d.pointer(path);
}

// ----- first steps -----------------------------------------------------------------------------------------------------

export function place(s, aria) {
  const d = stage({ id: 'place', T: 13 });
  const notes = phrase(d, [
    ['E4', 'E4', 'F4', 'G4'].map((n) => q(n)),
    [q('G4'), q('F4'), ...['E4', 'F4', 'E4', 'D4'].map((name) => ({ name, d: 'e' }))],
  ], 22);
  placing(d, notes, 2.2, 0.85);
  d.keycap('4', 26, 0.4, 1.3, 6.2);
  d.keycap('3', 26, 6.2, 6.8, 11.2);
  return d.html(aria);
}

export function notesRests(s, aria) {
  const d = stage({ id: 'rests', T: 12 });
  const x = (i) => d.firstX + i * 30;
  const eighths = [{ x: x(0), p: pitch('G4') }, { x: x(0) + 22, p: pitch('A4') }].map((n) => ({ x: n.x, y: d.y(n.p) }));
  const group = beamGroup(eighths);
  // The first click creates one flagged eighth; the second replaces it with the beamed pair.
  d.note(x(0), pitch('G4'), 'e', [[0, { o: 0 }], [2.6, { o: 0 }], [2.61, { o: 1 }], [3.2, { o: 1 }], [3.21, { o: 0 }]], { keep: false, cls: 'd-first-eighth' });
  d.add(0, 0, group.svg, [[0, { o: 0 }], [3.2, { o: 0 }], [3.21, { o: 1 }], [11.3, { o: 1 }], [11.8, { o: 0 }]], { cls: 'd-beamed' });
  d.click(2.6, eighths[0].x + 5, eighths[0].y);
  d.click(3.2, eighths[1].x + 5, eighths[1].y);
  d.rest(x(2) + 16, 'q', d.pop(5.6));
  d.click(5.6, x(2) + 21, d.y(4));
  const half = { x: x(3) + 22, p: pitch('B4') };
  d.note(half.x, half.p, 'h', d.pop(8.2), {});
  d.click(8.2, half.x + 5, d.y(half.p));
  d.pointer([[1.2, d.w - 30, d.h - 24], ...visit(2.6, eighths[0].x + 5, eighths[0].y), ...visit(3.2, eighths[1].x + 5, eighths[1].y), ...visit(5.6, x(2) + 21, d.y(4)), ...visit(8.2, half.x + 5, d.y(half.p))]);
  d.keycap('3', 26, 0.4, 1.3, 4.4);
  d.keycap('R', 26, 4.2, 4.9, 7.0);
  d.keycap('5', 26, 6.8, 7.5, 9.4);
  return d.html(aria);
}

export function accidentals(s, aria) {
  const d = stage({ id: 'acc', T: 12 });
  const notes = phrase(d, [[q('F4'), q('B4'), q('F4'), q('A4')]], 36);
  notes.forEach((n) => d.note(n.x, n.p, 'q', d.life(0.05)));
  const marks = [['#', 'S', 0], ['b', 'B', 1], ['n', 'C', 2]];
  const path = [[0.6, d.w - 30, d.h - 24]];
  marks.forEach(([acc, key, i], k) => {
    const n = notes[i];
    const t = 2.4 + k * 3;
    d.keycap(key, 26, t - 1.9, t - 1.2, t + 0.9);
    path.push(...visit(t, n.x + 5, d.y(n.p)));
    d.click(t, n.x + 5, d.y(n.p));
    d.add(n.x, d.y(n.p), glyph({ '#': 'E262', b: 'E260', n: 'E261' }[acc], -SP * 1.25, 0), d.pop(t), {});
  });
  d.pointer(path);
  return d.html(aria);
}


// ----- varied rhythms (6/8, one flat), taken from the author's example measures ----------------------------------------

const WIDTH = { e: 16, q: 22, h: 36 };

/**
 * Lays out a measure of mixed figures from `x`: eighths (beamed together when they share `b`), dotted quarters, halves
 * and rests, each spaced by its length. Returns the slots and the x where the next measure starts.
 */
function rhythm(d, x, items, stops = d.life(0.05), scale = 1, { down = false } = {}) {
  const slots = items.map((it) => {
    const slot = { ...it, x, p: it.p ?? (it.name ? pitch(it.name) : null) };
    x += (WIDTH[it.d] + (it.dot ? 8 : 0)) * scale;
    return slot;
  });
  const beamed = new Map();
  slots.forEach((n) => { if (n.b !== undefined) beamed.set(n.b, [...(beamed.get(n.b) ?? []), n]); });
  slots.forEach((n) => {
    if (n.skip) return;
    if (n.rest) d.rest(n.x + 4, n.d, stops);
    else if (n.b === undefined) d.note(n.x, n.p, n.d, stops, { dot: n.dot, stemDown: down });
  });
  beamed.forEach((group) => d.add(0, 0, beamGroup(group.map((n) => ({ x: n.x, y: d.y(n.p) })), { down }).svg, stops));
  return { slots, end: x };
}

/** Two measures in 6/8: mixed figures first, then two beamed groups of three eighths. */
const MEASURE_A = [{ d: 'e', name: 'G4' }, { d: 'q', dot: true, name: 'G4' }, { d: 'e', rest: true }, { d: 'e', name: 'F4' }];
const MEASURE_B = [{ d: 'e', name: 'G4', b: 0 }, { d: 'e', name: 'A4', b: 0 }, { d: 'e', name: 'F4', b: 0 }, { d: 'e', name: 'G4', b: 1 }, { d: 'e', name: 'G4', b: 1 }, { d: 'e', name: 'F4', b: 1 }];
const MEASURE_C = [{ d: 'h', name: 'A4' }, { d: 'e', name: 'G4' }, { d: 'e', name: 'F4' }];

const stage68 = (o) => stage({ key: -1, meter: [6, 8], ...o });

function twoMeasures(d, first, second) {
  const a = rhythm(d, d.firstX, first);
  d.base(d.barline(a.end - 1));
  return [...a.slots, ...rhythm(d, a.end + 10, second).slots];
}

/** Written pitch (guitar sounds an octave lower) to a [string, fret] pair, string 0 being the high E. */
const OPEN = [64, 59, 55, 50, 45, 40];
const SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function tabOf(name) {
  const midi = (+name.slice(-1) + 1) * 12 + SEMITONE[name[0]] - 12;
  const string = OPEN.findIndex((open) => midi >= open && midi - open <= 5);
  return [string, midi - OPEN[string]];
}

// ----- editing --------------------------------------------------------------------------------------------------------

export function selectMove(s, aria) {
  const d = stage({ id: 'sel', T: 13 });
  const notes = phrase(d, [['E4', 'G4', 'B4', 'G4'].map((n) => q(n))], 40);
  const marqueeFrom = { x: notes[0].x - 10, y: d.y(7) };
  const marqueeTo = { x: notes[2].x + 22, y: d.y(-2) };
  notes.forEach((n, i) => {
    const picked = i < 3;
    d.note(n.x, n.p, 'q', picked
      ? S(d.life(0.05, 9.4), [[3.2, { c: INK }], [3.4, { c: SEL }], [5.2, { y: 0 }], [5.5, { y: -SP / 2 }]])
      : d.life(0.05));
  });
  d.add(marqueeFrom.x, marqueeFrom.y,
    `<rect class="d-marquee" width="${marqueeTo.x - marqueeFrom.x}" height="${marqueeTo.y - marqueeFrom.y}"/>`,
    [[0, { o: 0, sx: 0.02, sy: 0.02 }], [1.4, { o: 0, sx: 0.02, sy: 0.02 }], [1.5, { o: 1 }], [3.2, { o: 1, sx: 1, sy: 1 }], [3.6, { o: 0 }]], { keep: false });
  d.pointer([[0.6, d.w - 30, d.h - 24], [1.4, marqueeFrom.x, marqueeFrom.y], [3.2, marqueeTo.x, marqueeTo.y], [3.7, d.w - 30, d.h - 24]]);
  d.keycap('↑', 26, 4.6, 5.2, 7.0);
  d.keycap('Delete', 30, 8.0, 8.7, 10.6);
  return d.html(aria);
}

export function copy(s, aria) {
  const d = stage({ id: 'copy', T: 13 });
  const notes = phrase(d, [['E4', 'G4', 'A4', 'G4'].map((n) => q(n))], 36);
  notes.forEach((n, i) => {
    const clicked = i === 0 ? 1.5 : 2.4;
    if (i < 2) d.note(n.x, n.p, 'q', S(d.life(0.05), [[clicked, { c: INK }], [clicked + 0.1, { c: SEL }], [4.9, { c: SEL }], [5.0, { c: INK }]]));
    else d.note(n.x, n.p, 'q', d.life(0.05));
  });
  // The copies land right after the last selected note and become the selection.
  [2, 3].forEach((slot, k) => {
    const n = notes[slot];
    const src = notes[k];
    d.note(n.x, src.p, 'q', S(d.pop(5.0), [[4.9, { c: SEL }], [7.8, { c: SEL }], [7.9, { c: INK }]]), {});
  });
  d.pointer([[0.6, d.w - 30, d.h - 24], ...visit(1.5, notes[0].x + 5, d.y(notes[0].p)), ...visit(2.4, notes[1].x + 5, d.y(notes[1].p)), [3.4, d.w - 30, d.h - 24]]);
  d.click(1.5, notes[0].x + 5, d.y(notes[0].p));
  d.click(2.4, notes[1].x + 5, d.y(notes[1].p));
  d.keycap('Shift', 30, 3.0, 3.6, 8.2, { ky: d.h - 14 });
  d.keycap('D', 60, 3.0, 4.9, 8.2);
  return d.html(aria);
}

/** A run of `count` beamed figures that the tuplet menu groups: marquee, menu entry, then the bracket with its number. */
function tupletDemo(s, aria, count) {
  const d = stage({ id: `trip${count}`, T: 13 });
  const t = s.scoreUiStrings;
  const gap = count <= 3 ? 24 : count <= 5 ? 20 : 17;
  const names = ['E4', 'F4', 'G4', 'A4', 'G4', 'F4', 'E4', 'D4', 'C4'].slice(0, count);
  const xs = names.map((_, i) => d.firstX + 20 + i * gap);
  const last = xs[count - 1];
  const heads = names.map((n, i) => ({ x: xs[i], y: d.y(pitch(n)) }));
  const group = beamGroup(heads, { beams: count > 3 ? 2 : 1 });
  d.add(0, 0, group.svg, S(d.life(0.05), [[2.7, { c: INK }], [2.9, { c: SEL }], [5.6, { c: SEL }], [5.8, { c: INK }]]));
  const mid = (xs[0] + last) / 2 + 5;
  d.add(mid, group.top - 26, pillInner(count === 3 ? t.triplet : t[`tuplet${count}`], { size: 8 }), [[0, { o: 0, y: 4 }], [3.1, { o: 0, y: 4 }], [3.35, { o: 1, y: 0 }], [5.4, { o: 1, y: 0 }], [5.6, { o: 0 }]], { keep: false });
  d.add(0, group.top - 7,
    `<path class="d-bracket" d="M${xs[0] + 1} 3V0H${last + 10}V3"/><text class="d-text" x="${mid}" y="-3" text-anchor="middle" font-size="9" font-style="italic" font-weight="600">${count}</text>`,
    [[0, { o: 0 }], [5.7, { o: 0 }], [6.0, { o: 1 }], [d.T - 0.7, { o: 1 }], [d.T - 0.2, { o: 0 }]]);
  const from = { x: xs[0] - 8, y: d.y(5) };
  const to = { x: last + 18, y: d.y(-1.5) };
  d.add(from.x, from.y, `<rect class="d-marquee" width="${to.x - from.x}" height="${to.y - from.y}"/>`,
    [[0, { o: 0, sx: 0.02, sy: 0.02 }], [1.3, { o: 0, sx: 0.02, sy: 0.02 }], [1.4, { o: 1 }], [2.7, { o: 1, sx: 1, sy: 1 }], [3.0, { o: 0 }]], { keep: false });
  d.pointer([[0.6, d.w - 30, d.h - 24], [1.3, from.x, from.y], [2.7, to.x, to.y], ...visit(4.6, mid, group.top - 26), [6.4, d.w - 30, d.h - 24]]);
  d.click(4.6, mid, group.top - 26);
  return d.html(aria);
}

export const tuplets = (s, aria) => tupletDemo(s, aria, 3);
export const quintuplet = (s, aria) => tupletDemo(s, aria, 5);
export const septuplet = (s, aria) => tupletDemo(s, aria, 7);

export function ties(s, aria) {
  const d = stage({ id: 'tie', T: 13 });
  const t = s.scoreUiStrings;
  const notes = phrase(d, [[q('G4'), q('G4'), q('A4'), q('B4')]], 40);
  notes.forEach((n, i) => {
    const clicked = i === 0 ? 1.5 : 2.4;
    d.note(n.x, n.p, 'q', i < 2 ? S(d.life(0.05), [[clicked, { c: INK }], [clicked + 0.1, { c: SEL }], [5.8, { c: SEL }], [5.9, { c: INK }]]) : d.life(0.05));
  });
  const a = notes[0];
  const b = notes[1];
  const y = d.y(a.p) + SP * 0.9;
  d.add(0, 0, `<path class="d-tie" d="M${a.x + 5} ${y}Q${(a.x + b.x) / 2 + 5} ${y + 9} ${b.x + 5} ${y}"/>`,
    [[0, { o: 0 }], [5.5, { o: 0 }], [5.8, { o: 1 }], [d.T - 0.7, { o: 1 }], [d.T - 0.2, { o: 0 }]]);
  const px = (a.x + b.x) / 2 + 5;
  d.add(px, d.y(8) - 12, pillInner(t.link, { size: 8, icon: tutorialIcon('link') }), [[0, { o: 0 }], [2.8, { o: 0 }], [3.05, { o: 1 }], [5.6, { o: 1 }], [5.8, { o: 0 }]], { keep: false });
  d.pointer([[0.6, d.w - 30, d.h - 24], ...visit(1.5, a.x + 5, d.y(a.p)), ...visit(2.4, b.x + 5, d.y(b.p)), ...visit(4.9, px, d.y(8) - 12), [6.6, d.w - 30, d.h - 24]]);
  d.click(1.5, a.x + 5, d.y(a.p));
  d.click(2.4, b.x + 5, d.y(b.p));
  d.click(4.9, px, d.y(8) - 12);
  d.keycap('Shift', 30, 1.0, 2.0, 2.9);
  return d.html(aria);
}

/** Clicking a tie's arc selects it; Delete removes the tie and leaves both notes. */
export function tieDelete(s, aria) {
  const d = stage({ id: 'tie-del', T: 10 });
  const notes = phrase(d, [[q('G4'), q('G4'), q('A4'), q('B4')]], 40);
  notes.forEach((n) => d.note(n.x, n.p, 'q', d.life(0.05)));
  const [a, b] = notes;
  const y = d.y(a.p) + SP * 0.9;
  const px = (a.x + b.x) / 2 + 5;
  const arc = y + 4.5;
  d.add(0, 0, `<path class="d-tie" d="M${a.x + 5} ${y}Q${px} ${y + 9} ${b.x + 5} ${y}"/>`,
    [[0, { o: 0, c: INK }], [0.05, { o: 0 }], [0.3, { o: 1 }], [1.9, { c: INK }], [2.1, { c: SEL }], [4.1, { c: SEL }], [4.3, { o: 0 }]], { keep: false });
  d.click(1.9, px, arc);
  d.pointer([[0.6, d.w - 30, d.h - 24], ...visit(1.9, px, arc), [4.6, d.w - 30, d.h - 24]]);
  d.keycap('Delete', 40, 2.6, 3.6, 6.4);
  return d.html(aria);
}

// ----- measures and signatures ----------------------------------------------------------------------------------

export function signatures(s, aria) {
  const d = stage({ id: 'sig', T: 14, staff: false, h: 152, bottom: 88 });
  const t = s.scoreUiStrings;
  d.base(d.lines(d.x0, d.x1) + d.barline(d.x0) + d.barline(d.x1));
  const clefX = d.x0 + 4;
  // Visible from `from` (0 = from the start) until `to` (default: the end of the loop).
  const shown = (from, to) => [
    [0, { o: from ? 0 : 1 }], ...(from ? [[from, { o: 0 }], [from + 0.3, { o: 1 }]] : []),
    [to ?? d.T - 0.7, { o: 1 }], [(to ?? d.T - 0.7) + 0.3, { o: 0 }],
  ];
  d.add(0, 0, d.clefAt(clefX, 'G'), shown(0, 6.0));
  d.add(0, 0, d.clefAt(clefX, 'F'), shown(6.0), { keep: false });
  // The meter changes from 4/4 to 3/4, then slides right to make room for the key signature.
  const slide = [[9.0, { x: 0 }], [9.5, { x: SP * 2 * 0.95 + SP * 0.5 }]];
  d.add(d.meterX, 0, d.meterAt(0, [4, 4]), S(shown(0, 3.0), slide));
  d.add(d.meterX, 0, d.meterAt(0, [3, 4]), S(shown(3.0), slide), { keep: false });
  d.add(d.keyX, 0, d.keyAt(0, 2, 2), [[0, { o: 0 }], [9.2, { o: 0, s: 0.6 }], [9.45, { o: 1, s: 1 }], [d.T - 0.7, { o: 1 }], [d.T - 0.2, { o: 0 }]], { keep: false });
  // Each click opens the editor's popup under the staff; the pointer picks one of its options and the popup closes.
  const rowH = 14;
  const popupY = d.bottom + 10;
  const targets = [
    [1.5, d.meterX + 5, ['4/4', '3/4', '6/8'], 1, 62, 3.0],
    [4.4, clefX + 8, [t.clefs.treble, t.clefs.bass, t.clefs.alto], 1, 104, 6.0],
    [7.6, d.keyX + 6, [t.keys[7], t.keys[8], t.keys[9]], 2, 138, 9.2],
  ];
  const rest = [d.w - 30, d.h - 32];
  const path = [[0.6, ...rest]];
  targets.forEach(([at, x, options, pick, width, change]) => {
    const left = Math.max(4, x - 20);
    const pickAt = at + 1.1;
    const optionY = popupY + 3 + pick * rowH + rowH / 2;
    path.push(...visit(at, x, d.y(4)), ...visit(pickAt, left + 24, optionY));
    d.click(at, x, d.y(4));
    d.click(pickAt, left + 24, optionY);
    d.add(left, popupY,
      `<rect class="d-panel" width="${width}" height="${options.length * rowH + 6}" rx="5"/>` +
      options.map((o, i) => `<text class="d-menutext" x="8" y="${3 + i * rowH + rowH / 2 + 3}" font-size="8.5">${o}</text>`).join(''),
      [[0, { o: 0 }], [at + 0.2, { o: 0 }], [at + 0.45, { o: 1 }], [change + 0.1, { o: 1 }], [change + 0.35, { o: 0 }]], { keep: false });
    d.add(left, popupY + 3 + pick * rowH, `<rect class="d-rowhot" x="3" width="${width - 6}" height="${rowH}" rx="3"/>`,
      [[0, { o: 0 }], [pickAt, { o: 0 }], [pickAt + 0.15, { o: 1 }], [change + 0.1, { o: 1 }], [change + 0.35, { o: 0 }]], { keep: false });
  });
  path.push([13.0, ...rest]);
  d.pointer(path);
  return d.html(aria);
}

export function measures(s, aria) {
  const d = stage({ id: 'meas', T: 13 });
  const first = d.firstX;
  const barA = first + 76;
  const shift = 62;
  const half = (x, name) => ({ x, p: pitch(name) });
  [half(first, 'E4'), half(first + 38, 'G4')].forEach((n) => d.note(n.x, n.p, 'h', d.life(0.05)));
  d.base(d.barline(barA));
  // The second measure makes room for the new one, which gets its own barline.
  const moved = [[4.6, { x: 0 }], [5.3, { x: shift }]];
  [half(barA + 14, 'B4'), half(barA + 52, 'G4')].forEach((n) => d.note(n.x, n.p, 'h', S(d.life(0.05), moved)));
  d.add(barA + shift, 0, d.barline(0), d.pop(5.0), { keep: false });
  // Selecting a measure tints it and shows the "+" buttons at its edges.
  const tint = (x, w, from, to) => d.add(x, d.y(8) - 4, `<rect class="d-tint" width="${w}" height="${SP * 4 + 8}"/>`,
    [[0, { o: 0 }], [from, { o: 0 }], [from + 0.25, { o: 1 }], [to, { o: 1 }], [to + 0.3, { o: 0 }]], { keep: false });
  tint(first - 12, barA - first + 12, 1.4, 4.4);
  tint(barA, shift, 5.4, 9.2);
  d.add(barA, d.y(8) - 13, '<circle class="d-plus" r="6.5"/><path class="d-plusmark" d="M-3 0H3M0 -3V3"/>',
    [[0, { o: 0 }], [1.9, { o: 0 }], [2.15, { o: 1 }], [4.4, { o: 1 }], [4.7, { o: 0 }]], { keep: false });
  d.click(1.4, first + 20, d.y(2));
  d.click(3.9, barA, d.y(8) - 13);
  d.pointer([[0.6, d.w - 30, d.h - 24], ...visit(1.4, first + 20, d.y(2)), ...visit(3.9, barA, d.y(8) - 13), [6.2, d.w - 30, d.h - 24]]);
  return d.html(aria);
}

/** Selecting a measure and pressing Delete removes it; the next one closes the gap. */
export function measureDelete(s, aria) {
  const d = stage({ id: 'meas-del', T: 11 });
  const first = d.firstX;
  const width = 76;
  const at = (m) => first + m * width;
  const names = [['E4', 'G4'], ['A4', 'F4'], ['G4', 'E4']];
  names.forEach((pair, m) => pair.forEach((name, i) => {
    const x = at(m) + (m ? 14 : 0) + i * 38;
    const stops = m === 1 ? d.life(0.05, 4.2) : m === 2 ? S(d.life(0.05), [[4.3, { x: 0 }], [5.0, { x: -width }]]) : d.life(0.05);
    d.note(x, pitch(name), 'h', stops);
  }));
  d.base(d.barline(at(1)));
  d.add(at(2), 0, d.barline(0), d.life(0.05, 4.2));
  d.add(at(1), d.y(8) - 4, `<rect class="d-tint" width="${width}" height="${SP * 4 + 8}"/>`,
    [[0, { o: 0 }], [1.6, { o: 0 }], [1.85, { o: 1 }], [4.0, { o: 1 }], [4.3, { o: 0 }]], { keep: false });
  d.click(1.6, at(1) + 40, d.y(2));
  d.pointer([[0.6, d.w - 30, d.h - 24], ...visit(1.6, at(1) + 40, d.y(2)), [4.6, d.w - 30, d.h - 24]]);
  d.keycap('Delete', 40, 2.4, 3.4, 6.6);
  return d.html(aria);
}

/** Clicking a barline selects it (yellow); Delete removes it and the two measures become one. */
export function barlineDelete(s, aria) {
  const d = stage({ id: 'bar-del', T: 10 });
  const gap = 26;
  const names = ['E4', 'G4', 'A4', 'G4', 'F4', 'E4', 'D4', 'E4'];
  const xs = names.map((_, i) => d.firstX + i * gap + (i >= 4 ? 10 : 0));
  names.forEach((n, i) => d.note(xs[i], pitch(n), 'q', d.life(0.05)));
  const bx = xs[3] + gap / 2 + 5;
  d.add(bx, 0, d.barline(0), [[0, { o: 0 }], [0.05, { o: 0 }], [0.3, { o: 1 }], [4.1, { o: 1 }], [4.3, { o: 0 }]], { keep: false });
  d.add(bx - 3, d.y(8) - 2, `<rect class="d-tint" width="6" height="${SP * 4 + 4}"/>`,
    [[0, { o: 0 }], [1.9, { o: 0 }], [2.1, { o: 1 }], [4.0, { o: 1 }], [4.3, { o: 0 }]], { keep: false });
  d.click(1.9, bx, d.y(4));
  d.pointer([[0.6, d.w - 30, d.h - 24], ...visit(1.9, bx, d.y(4)), [4.6, d.w - 30, d.h - 24]]);
  d.keycap('Delete', 40, 2.4, 3.4, 6.4);
  return d.html(aria);
}

export function repeats(s, aria) {
  const d = stage68({ id: 'rep', T: 14 });
  twoMeasures(d, MEASURE_A, MEASURE_B);
  const x1 = d.x1;
  const dots = (x) => `<circle class="d-dot" cx="${x}" cy="${d.y(3)}" r="1.3"/><circle class="d-dot" cx="${x}" cy="${d.y(5)}" r="1.3"/>`;
  const startX = d.firstX - 12;
  d.add(0, 0, `<path class="d-bar" stroke-width="3" d="M${startX} ${d.y(8)}V${d.y(0)}"/><path class="d-bar" stroke-width="1" d="M${startX + 4} ${d.y(8)}V${d.y(0)}"/>${dots(startX + 8)}`, d.pop(2.4));
  d.add(0, 0, `<path class="d-bar" stroke-width="3" d="M${x1 - 1} ${d.y(8)}V${d.y(0)}"/><path class="d-bar" stroke-width="1" d="M${x1 - 5} ${d.y(8)}V${d.y(0)}"/>${dots(x1 - 9)}`, d.pop(5.2));
  d.text(x1 - 30, d.y(8) - 8, 'D.C.', d.pop(8.4), { italic: true, font: 'var(--serif)', size: 11 });
  d.click(2.4, startX + 3, d.y(4));
  d.click(5.2, x1 - 3, d.y(4));
  d.click(8.4, x1 - 30, d.y(8) - 10);
  d.pointer([[0.6, d.w - 30, d.h - 24], ...visit(2.4, startX + 3, d.y(4)), ...visit(5.2, x1 - 3, d.y(4)), ...visit(8.4, x1 - 30, d.y(8) - 10), [10.2, d.w - 30, d.h - 24]]);
  return d.html(aria);
}

export function dynamics(s, aria) {
  const d = stage68({ id: 'dyn', T: 13, bottom: 62, h: 120 });
  const { slots: notes } = rhythm(d, d.firstX + 6, [{ d: 'e', name: 'F4' }, { d: 'q', dot: true, name: 'G4' }, { d: 'e', name: 'A4' }, { d: 'q', name: 'A4' }], d.life(0.05), 2.4);
  const y0 = d.bottom + SP * 3.2;
  const xa = notes[0].x + 2;
  const xb = notes[3].x + 14;
  d.add(xa, y0, `<path class="d-hairpin" d="M0 0L${xb - xa} -4.6M0 0L${xb - xa} 4.6"/>`,
    [[0, { o: 0, sx: 0.05 }], [2.2, { o: 0, sx: 0.05 }], [2.3, { o: 1 }], [4.0, { o: 1, sx: 1 }], [d.T - 0.7, { o: 1 }], [d.T - 0.2, { o: 0 }]]);
  d.add(xa - 14, y0 + 3, glyph('E520', 0, 0), d.pop(5.6));
  d.add(xb + 10, y0 + 3, glyph('E522', 0, 0), d.pop(7.2));
  d.click(2.2, xa + 6, y0);
  d.click(5.6, xa - 10, y0);
  d.click(7.2, xb + 14, y0);
  d.pointer([[0.6, d.w - 30, d.h - 24], ...visit(2.2, xa + 6, y0), [4.0, xb, y0], ...visit(5.6, xa - 10, y0 + 3), ...visit(7.2, xb + 14, y0 + 3), [9.0, d.w - 30, d.h - 24]]);
  return d.html(aria);
}

// ----- guitar -------------------------------------------------------------------------------------------------------------

const TAB_TOP = 94;

/** The six tab lines under the staff, with the T A B letters. */
function tabLines(d) {
  return d.lines(d.x0 + 14, d.x1, TAB_TOP, 6, 7) +
    ['T', 'A', 'B'].map((c, i) => `<text class="d-text" x="${d.x0 + 6}" y="${TAB_TOP + 9 + i * 9}" text-anchor="middle" font-size="8" font-weight="700">${c}</text>`).join('');
}

export function tabToggle(s, aria) {
  const d = stage68({ id: 'tab', T: 13, bottom: 62, h: 146 });
  const notes = twoMeasures(d, MEASURE_A, MEASURE_B).filter((n) => !n.rest);
  d.add(0, 0, tabLines(d), [[0, { o: 0 }], [3.0, { o: 0 }], [3.4, { o: 1 }], [d.T - 0.7, { o: 1 }], [d.T - 0.2, { o: 0 }]]);
  notes.forEach((n, i) => {
    const [string, fret] = tabOf(n.name);
    d.fret(n.x + 5, TAB_TOP, string, fret, d.pop(3.6 + i * 0.25), {});
  });
  // The button in the palette lights up when it is on.
  const bx = d.w - 30;
  d.add(bx, 10, `<rect class="d-pill" x="-17" y="-9" width="34" height="18" rx="4"/><text class="d-pilltext" text-anchor="middle" dominant-baseline="central" font-size="8.5">TAB</text>`,
    [[0, { o: 1, c: 'var(--ink-soft)' }], [2.4, { c: 'var(--ink-soft)' }], [2.6, { c: 'var(--accent)' }], [d.T - 0.7, { c: 'var(--accent)' }], [d.T - 0.2, { o: 0 }]]);
  d.click(2.4, bx, 10);
  d.pointer([[0.8, d.w - 90, d.h - 30], ...visit(2.4, bx, 10), [4.6, d.w - 90, d.h - 30]]);
  return d.html(aria);
}

/** Shift+↓ on a selected tab number looks for the next fingering of that pitch on the strings below, one press at a time. */
export function refinger(s, aria) {
  const d = stage({ id: 'refing', T: 13, bottom: 62, h: 160 });
  const notes = phrase(d, [[q('D4'), q('G4')]], 56);
  notes.forEach((n) => d.note(n.x, n.p, 'q', d.life(0.05)));
  d.base(tabLines(d));
  d.fret(notes[0].x + 5, TAB_TOP, 3, 0, d.life(0.05), {});
  const x = notes[1].x + 5;
  // The same G on the open third string, then the fifth fret of the fourth, then the tenth of the fifth.
  d.fret(x, TAB_TOP, 2, 0, S(d.life(0.05, 4.0), [[2.2, { c: INK }], [2.3, { c: SEL }]]), { keep: false });
  d.fret(x, TAB_TOP, 3, 5, S(d.pop(4.0, 5.8), [[0, { c: SEL }]]), { keep: false });
  d.fret(x, TAB_TOP, 4, 10, S(d.pop(5.8), [[0, { c: SEL }]]), {});
  d.click(2.2, x, TAB_TOP + 2 * 7 + 3);
  d.pointer([[0.8, d.w - 30, d.h - 24], ...visit(2.2, x + 2, TAB_TOP + 2 * 7 + 3), [3.6, d.w - 30, d.h - 24]]);
  d.keycap('Shift', d.w - 60, 3.0, [3.9, 5.7], 8.4);
  d.keycap('↓', d.w - 24, 3.0, [3.9, 5.7], 8.4);
  return d.html(aria);
}

export function barre(s, aria) {
  const d = stage({ id: 'barre', T: 14, bottom: 68, h: 120 });
  const t = s.scoreUiStrings;
  const notes = phrase(d, [[q('F4'), q('A4'), q('C5'), q('A4')]], 42);
  notes.forEach((n) => d.note(n.x, n.p, 'q', d.life(0.05)));
  const xa = notes[0].x;
  const xb = notes[3].x + 12;
  const top = d.y(8) - 18;
  d.add(60, 14, pillInner(t.barre, { size: 8 }), [[0, { o: 0 }], [0.6, { o: 0 }], [0.9, { o: 1, c: 'var(--ink-soft)' }], [1.7, { c: 'var(--ink-soft)' }], [1.9, { c: 'var(--accent)' }], [3.6, { c: 'var(--accent)' }], [3.9, { o: 0 }]], { keep: false });
  d.click(1.7, 60, 14);
  d.click(3.4, xa + 5, d.y(1));
  d.add(xa, top, `<text class="d-text" x="-9" y="3" text-anchor="middle" font-size="10" font-style="italic" style="font-family:var(--serif)">C</text><path class="d-bracket" d="M0 0H${xb - xa}V6"/>`,
    [[0, { o: 0 }], [3.4, { o: 0 }], [3.7, { o: 1 }], [d.T - 0.7, { o: 1 }], [d.T - 0.2, { o: 0 }]]);
  // The fret number, typed into its little field.
  d.add(xa + 6, top, `<rect class="d-field" x="-6" y="-7" width="12" height="14" rx="2"/><text class="d-pilltext" text-anchor="middle" dominant-baseline="central" font-size="9">1</text>`,
    [[0, { o: 0 }], [3.4, { o: 0 }], [3.7, { o: 1 }], [7.2, { o: 1 }], [7.3, { o: 0 }]], { keep: false });
  d.add(xa + 6, top, `<rect class="d-field d-field--on" x="-6" y="-7" width="12" height="14" rx="2"/><text class="d-pilltext" text-anchor="middle" dominant-baseline="central" font-size="9">3</text>`,
    [[0, { o: 0 }], [7.2, { o: 0 }], [7.3, { o: 1 }], [d.T - 0.7, { o: 1 }], [d.T - 0.2, { o: 0 }]]);
  d.keycap('3', 26, 6.0, 6.8, 9.8);
  d.pointer([[0.6, d.w - 40, d.h - 24], ...visit(1.7, 60, 14), ...visit(3.4, xa + 5, d.y(1)), [5.2, d.w - 40, d.h - 24]]);
  return d.html(aria);
}

// ----- files -------------------------------------------------------------------------------------------------------------

export function files(s, aria) {
  const d = stage({ id: 'files', T: 13, staff: false, h: 140 });
  const ui = s.ui;
  const menuX = d.w - 150;
  const subX = menuX - 122;
  const text = (x, y, value, cls = '') => `<text class="d-menutext ${cls}" x="${x}" y="${y + 3.5}" font-size="9.5">${value}</text>`;
  // The page header with the menu button, then the menu it opens and its Export list.
  d.base(`<path class="d-line" d="M0 28H${d.w}"/><path class="d-menuicon" d="M${d.w - 24} 10h14M${d.w - 24} 14h14M${d.w - 24} 18h14"/>`);
  d.add(0, 0,
    `<rect class="d-panel" x="${menuX}" y="34" width="140" height="58" rx="6"/>` +
    text(menuX + 12, 49, ui.menuLoad) + text(menuX + 12, 75, ui.menuExport) +
    `<path class="d-menuicon" d="M${menuX + 122} 73l-4 4 4 4"/>`,
    [[0, { o: 0 }], [1.6, { o: 0 }], [1.85, { o: 1 }], [6.0, { o: 1 }], [6.3, { o: 0 }]], { keep: false });
  d.add(0, 0,
    `<rect class="d-panel" x="${subX}" y="58" width="116" height="${3 * 20 + 8}" rx="6"/>` +
    ['menuExportPdf', 'menuExportXml', 'menuExportMidi'].map((k, i) => text(subX + 12, 73 + i * 20, ui[k], i === 0 ? 'd-menutext--hot' : '')).join(''),
    [[0, { o: 0 }], [3.4, { o: 0 }], [3.65, { o: 1 }], [6.0, { o: 1 }], [6.3, { o: 0 }]], { keep: false });
  d.add(70, 120, `<rect class="d-file" x="-56" y="-13" width="112" height="26" rx="6"/><text class="d-pilltext" text-anchor="middle" dominant-baseline="central" font-size="9.5">partitura.pdf</text>`,
    [[0, { o: 0, y: 10 }], [6.6, { o: 0, y: 10 }], [6.95, { o: 1, y: 0 }], [d.T - 0.7, { o: 1, y: 0 }], [d.T - 0.2, { o: 0 }]]);
  d.click(1.5, d.w - 17, 14);
  d.click(3.1, menuX + 30, 76);
  d.click(5.2, subX + 30, 74);
  d.pointer([[0.6, d.w - 40, 120], ...visit(1.5, d.w - 17, 14), ...visit(3.1, menuX + 30, 76), ...visit(5.2, subX + 30, 74), [7.4, d.w - 40, 120]]);
  return d.html(aria);
}

/** "El boyero" (Cocomarola and Miqueli), the example score: two measures of 6/8 in F with two voices. */
const BOYERO = {
  upper: [
    [{ d: 'e', p: 4 }, { d: 'q', dot: true, p: 4 }, { d: 'e', rest: true }, { d: 'e', p: 3 }],
    [4, 4, 3, 4, 4, 3].map((p, i) => ({ d: 'e', p, b: Math.floor(i / 3) })),
  ],
  lower: [
    [{ d: 'e', p: 2 }, { d: 'q', dot: true, p: 2 }, { d: 'e', skip: true }, { d: 'e', p: 1 }],
    [2, 2, 1, 2, 2, 1].map((p, i) => ({ d: 'e', p, b: Math.floor(i / 3) })),
  ],
};

export function loadFile(s, aria) {
  const ui = s.ui;
  const d = stage({ id: 'load', T: 15, h: 170, bottom: 124, key: -1, meter: [6, 8] });
  const menuX = d.w - 150;
  const text = (x, y, value, cls = '') => `<text class="d-menutext ${cls}" x="${x}" y="${y + 3.5}" font-size="9.5">${value}</text>`;
  d.base(`<path class="d-line" d="M0 28H${d.w}"/><path class="d-menuicon" d="M${d.w - 24} 10h14M${d.w - 24} 14h14M${d.w - 24} 18h14"/>`);
  d.add(0, 0, `<rect class="d-panel" x="${menuX}" y="34" width="140" height="58" rx="6"/>${text(menuX + 12, 49, ui.menuLoad, 'd-menutext--hot')}${text(menuX + 12, 75, ui.menuExport)}`,
    [[0, { o: 0 }], [1.6, { o: 0 }], [1.85, { o: 1 }], [3.6, { o: 1 }], [3.9, { o: 0 }]], { keep: false });
  // The file picked in the system dialog.
  d.add(70, 76, `<rect class="d-file" x="-62" y="-13" width="124" height="26" rx="6"/><text class="d-pilltext" text-anchor="middle" dominant-baseline="central" font-size="9.5">el-boyero.musicxml</text>`,
    [[0, { o: 0, y: 8 }], [4.0, { o: 0, y: 8 }], [4.3, { o: 1, y: 0 }], [6.0, { o: 1 }], [6.3, { o: 0 }]], { keep: false });
  // The loaded score: title and authors, then both voices.
  const shown = d.life(6.6, 14.3);
  d.text(d.w / 2, 50, 'El boyero', shown, { size: 12, weight: 700, font: 'var(--serif)' });
  d.text(d.w - 10, 62, 'Cocomarola y Miqueli', shown, { size: 7.5, anchor: 'end', weight: 500 });
  const place = (items, voice) => {
    let x = d.firstX;
    items.forEach((measure, m) => {
      const r = rhythm(d, x, measure, d.pop(6.8 + m * 0.6, 14.3), 1, voice);
      x = r.end + 10;
    });
  };
  place(BOYERO.upper, {});
  place(BOYERO.lower, { down: true });
  d.base(d.barline(d.firstX + 78 + 9));
  d.click(1.5, d.w - 17, 14);
  d.click(3.1, menuX + 30, 49);
  d.click(5.4, 70, 76);
  d.pointer([[0.6, d.w - 40, 150], ...visit(1.5, d.w - 17, 14), ...visit(3.1, menuX + 30, 49), ...visit(5.4, 70, 76), [8, d.w - 40, 150]]);
  return d.html(aria);
}

export function scores(s, aria) {
  const d = stage({ id: 'docs', T: 14, bottom: 96, h: 128, staff: false });
  const name = (n) => `${s.scoreH1} ${n}`;
  const W = 74; // tab width
  const x0 = 8;
  const tabX = [x0, x0 + W + 3];
  const baseline = 30;
  // The real tab strip: a thin rule, plain grey tabs, and the active one drawn as a white page open at the bottom
  // with its top-right corner rounded.
  d.base(`<path d="M${x0} ${baseline}H${d.w - x0}" stroke="var(--rule)" stroke-width="1" fill="none"/>`);
  const label = (n, active) => `<text class="d-text" x="${W / 2}" y="19" text-anchor="middle" font-size="${active ? 9.6 : 9}" font-weight="${active ? 700 : 400}" style="fill:${active ? 'var(--ink)' : 'var(--ink-soft)'}">${name(n)}</text>`;
  const frame = `<path d="M0 ${baseline + 0.5}V8H${W - 9}a9 9 0 0 1 9 9V${baseline + 0.5}" fill="var(--paper)" stroke="var(--rule)" stroke-width="1"/><path d="M1 ${baseline}H${W - 1}" stroke="var(--paper)" stroke-width="2"/>`;
  const state = (x, n, active, stops, opts) => d.add(x, 0, (active ? frame : '') + label(n, active), stops, opts);
  const fade = (...spans) => {
    const stops = [[0, { o: 0 }]];
    spans.forEach(([on, off]) => stops.push([on, { o: 0 }], [on + 0.2, { o: 1 }], [off, { o: 1 }], [off + 0.2, { o: 0 }]));
    return stops;
  };
  const END = d.T - 0.7;
  state(tabX[0], 1, true, fade([0, 3.5], [7.1, END]));
  state(tabX[0], 1, false, fade([3.5, 7.1]), { keep: false });
  // The second score opens at 3.4 and the plus button moves over to make room.
  state(tabX[1], 2, true, fade([3.5, 6.9]), { keep: false });
  state(tabX[1], 2, false, S(d.pop(3.4), [[6.9, { o: 1 }]]));
  d.add(tabX[0] + W + 16, 19, ico('plus', 13), S(d.life(0.05), [[3.2, { x: 0 }], [3.5, { x: W + 3 }]]), { cls: 'd-newtab' });
  // Each score has its own staff: the first one has notes, the new one starts empty.
  d.base(d.lines(18, d.x1 - 12, d.bottom - 4 * SP));
  ['E4', 'G4', 'A4', 'G4'].forEach((n, i) => {
    d.note(48 + i * 36, pitch(n), 'q', [[0, { o: 0 }], [0.2, { o: 1 }], [3.4, { o: 1 }], [3.7, { o: 0 }], [7.1, { o: 0 }], [7.4, { o: 1 }], [d.T - 0.7, { o: 1 }], [d.T - 0.2, { o: 0 }]]);
  });
  const plusX = tabX[0] + W + 16;
  d.click(3.0, plusX, 19);
  d.click(6.9, tabX[0] + W / 2, 19);
  d.pointer([[0.6, d.w - 40, d.h - 20], ...visit(3.0, plusX, 19), [4.8, tabX[1] + W / 2, 60], ...visit(6.9, tabX[0] + W / 2, 19), [9.0, d.w - 40, d.h - 20]]);
  return d.html(aria);
}

// ----- Focused gestures, placed immediately after their instructions -----

export function dragFigure(s, aria) {
  const d = stage({ id: 'drag-note', T: 10, h: 150, bottom: 100 });
  const from = { x: 24, y: 24 };
  const to = { x: d.firstX + 60, y: d.y(pitch('G4')) };
  d.base('<rect class="d-panel" x="8" y="5" width="32" height="38" rx="5"/>');
  d.add(from.x - 5, from.y + 8, noteInner(2, 'q'), d.life(0.05));
  d.add(from.x - 5, from.y + 8, noteInner(2, 'q'), [
    [0, { o: 0 }], [2, { o: 0, x: 0, y: 0 }], [2.1, { o: 0.45 }],
    [4.8, { x: to.x - from.x, y: to.y - from.y - 8, o: 0.45 }], [4.81, { o: 0 }],
  ], { keep: false, cls: 'd-drag-ghost' });
  d.note(to.x - 5, pitch('G4'), 'q', d.pop(4.8));
  d.click(2, from.x, from.y);
  d.pointer([[0.5, 54, 130], [1.8, from.x, from.y], [2.1, from.x, from.y], [4.8, to.x, to.y], [5.3, to.x, to.y], [6.3, 280, 130]]);
  return d.html(aria);
}

export function prepend(s, aria) {
  const d = stage({ id: 'prepend', T: 10 });
  const first = d.firstX + 42;
  const shift = [[3.9, { x: 0 }], [4.3, { x: 40 }]];
  ['G4', 'A4', 'B4'].forEach((n, i) => d.note(first + i * 40, pitch(n), 'q', S(d.life(0.05), shift)));
  d.note(first - 40, pitch('E4'), 'q', d.pop(4), { cls: 'd-prepended' });
  d.keycap('4', 26, 0.5, 1, 6.5);
  d.pointer([[0.5, 280, 95], ...visit(4, first - 35, d.y(0)), [6, 280, 95]]);
  d.click(4, first - 35, d.y(0));
  return d.html(aria);
}

export function fillRests(s, aria) {
  const d = stage({ id: 'fill-rests', T: 10, meter: [3, 4] });
  d.add(d.firstX - 10, d.y(8) - 5, `<rect class="d-tint" width="${d.x1 - d.firstX + 10}" height="46"/>`, d.life(1.5));
  d.click(1.5, d.firstX + 55, d.y(4));
  d.pointer([[0.5, 280, 95], ...visit(1.5, d.firstX + 55, d.y(4)), [2.5, 280, 95]]);
  d.keycap('Tab', 30, 2.5, 3.4, 6);
  d.rest(d.firstX + 48, 'h', d.pop(3.6), { cls: 'd-filled-rest' });
  d.rest(d.firstX + 142, 'q', d.pop(3.6), { cls: 'd-filled-rest' });
  return d.html(aria);
}

export function fullMeasure(s, aria) {
  const d = stage({ id: 'full-measure', T: 11, h: 158 });
  ['E4', 'G4', 'A4', 'G4'].forEach((n, i) => d.note(d.firstX + i * 43, pitch(n), 'q', d.life(0.05)));
  const x = d.firstX + 4 * 43;
  d.note(x, pitch('F4'), 'q', d.life(2.2, 3.4), { keep: false, cls: 'd-rejected-note' });
  d.keycap('4', 26, 0.5, 1, 3.5, { ky: 94 });
  d.pointer([[0.5, 280, 95], ...visit(3.5, x + 5, d.y(1)), [5, 280, 95]]);
  d.click(3.5, x + 5, d.y(1));
  const message = s.scoreUiStrings.full;
  d.add(20, 116, `<rect class="d-toast" width="280" height="30" rx="5"/><text class="d-toast-text" x="12" y="19" font-size="9">${message}</text><path d="M263 11l8 8m0-8-8 8" class="d-toast-close"/>`, d.life(3.6, 9.5), { cls: 'd-toast-example' });
  return d.html(aria);
}

export function selectedAccidental(s, aria) {
  const d = stage({ id: 'selected-accidental', T: 12 });
  const x = d.firstX + 65;
  const p = pitch('F4');
  d.note(x, p, 'q', S(d.life(0.05), [[1.4, { c: INK }], [1.5, { c: SEL }]]));
  d.pointer([[0.5, 280, 95], ...visit(1.5, x + 5, d.y(p)), [2.5, 280, 95]]);
  d.click(1.5, x + 5, d.y(p));
  d.keycap('S', 26, 2.5, 3.4, 5.2);
  d.keycap('B', 26, 5.4, 6.2, 8.1);
  d.keycap('C', 26, 8.3, 9.1, 10.4);
  [['E262', 3.5, 6.2], ['E260', 6.3, 9.1], ['E261', 9.2, 11.3]].forEach(([mark, from, to], i) =>
    d.add(x - SP * 1.25, d.y(p), glyph(mark, 0, 0), S(d.life(from, to, 0.05), [[0, { c: SEL }]]), { keep: i === 2 }));
  return d.html(aria);
}

export function doubleDot(s, aria) {
  const d = stage({ id: 'double-dot', T: 11 });
  const x = d.firstX + 80;
  d.note(x, pitch('G4'), 'q', d.life(0.05));
  d.add(x + 18, d.y(pitch('G4')) - SP / 2, '<circle r="1.8"/>', d.life(3.15, 7.15, 0.03), { keep: false, cls: 'd-toggled-dot' });
  [3, 3.13, 7, 7.13].forEach(t => d.click(t, x + 5, d.y(2)));
  d.pointer([[0.5, 280, 95], [2.6, x + 5, d.y(2)], [3.6, x + 5, d.y(2)], [4.8, 280, 95], [6.6, x + 5, d.y(2)], [7.6, x + 5, d.y(2)], [8.5, 280, 95]]);
  return d.html(aria);
}

export function duplicateVoice(s, aria) {
  return voiceCopy(s, aria, false);
}

export function adjustCopy(s, aria) {
  return voiceCopy(s, aria, true);
}

function voiceCopy(s, aria, adjust) {
  const d = stage({ id: adjust ? 'adjust-copy' : 'duplicate-voice', T: 13 });
  const notes = ['E4', 'G4', 'A4'];
  notes.forEach((name, i) => {
    const x = d.firstX + 30 + i * 55;
    const p = pitch(name);
    d.note(x, p, 'q', S(d.life(0.05), [[0, { c: adjust ? INK : SEL }], [3.6, { c: INK }]]), { stemDown: true, cls: 'd-source-voice' });
    const movement = adjust ? [[4.1, { y: 0 }], [4.4, { y: -SP / 2 }], [7.6, { y: -SP / 2 }], [7.9, { y: 0 }]] : [];
    d.note(x, p + 2, 'q', S(d.life(adjust ? 0.05 : 3.7), [[0, { c: SEL }]], movement), { stemDown: false, cls: 'd-copy-voice' });
  });
  if (adjust) {
    d.keycap('↑', 26, 2.7, 4, 5.7);
    d.keycap('↓', 26, 6.2, 7.5, 9.5);
  } else {
    d.keycap('Shift', 30, 2, 3.5, 6);
    d.keycap('↑', 70, 2, 3.5, 6);
  }
  return d.html(aria);
}

export function keyboardTie(s, aria) {
  const d = stage({ id: 'keyboard-tie', T: 13 });
  const a = d.firstX + 45;
  const b = a + 65;
  [a, b].forEach(x => d.note(x, pitch('G4'), 'q', S(d.life(0.05), [[0, { c: SEL }]])));
  const y = d.y(2) + 9;
  d.add(0, 0, `<path class="d-tie" d="M${a + 5} ${y}Q${(a + b) / 2 + 5} ${y + 15} ${b + 5} ${y}"/>`, d.life(3.7, 8.2, 0.05), { keep: false, cls: 'd-keyboard-tie' });
  d.keycap('(', 26, 2, 3.5, 5.5);
  d.keycap(')', 26, 6.5, 8, 10);
  return d.html(aria);
}

// ----- settings, playback and voices ---------------------------------------------------------------------------------

const VOICE = ['#b5472f', '#c8922e', '#3f7d5a', '#3a5f9e'];
const ACCENT = 'var(--accent)';

/** A Lucide icon drawn inside a stage, centred on its origin. */
const ico = (name, size = 12) =>
  `<g transform="scale(${f2(size / 24)}) translate(-12 -12)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${tutorialIconPaths(name)}</g>`;
const f2 = (n) => +n.toFixed(3);

/** The spoken name of the space bar, as the tutorial text says it. */
const SPACE = { Reproducir: 'Espacio', Play: 'Space', Reproduzir: 'Espaço' };

/** A short ledger line under/over a head at staff position p. */
const ledger = (d, x, p) => d.base(`<path class="d-line" d="M${f2(x - 4)} ${f2(d.y(p))}H${f2(x + 14)}"/>`);

/** A small settings checkbox row; the tick shows from `tick`. */
function checkRow(d, x, y, label, tick, until, stopsLife) {
  d.add(x, y, `<rect class="d-field" x="-5" y="-5" width="10" height="10" rx="2"/><text class="d-menutext" x="10" y="3.5" font-size="9.5">${label}</text>`, stopsLife);
  d.add(x, y, '<path d="M-3 0l2.4 2.6L3.4-2.6" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    [[0, { o: 0 }], [tick, { o: 0 }], [tick + 0.15, { o: 1 }], [until, { o: 1 }], [until + 0.25, { o: 0 }]], { keep: false });
}

export function playbackEnable(s, aria) {
  const u = s.scoreUiStrings;
  const d = stage({ id: 'pb-enable', T: 12 });
  const notes = phrase(d, [['E4', 'G4', 'A4', 'G4'].map((n) => q(n))], 24);
  notes.forEach((n) => d.note(n.x, n.p, 'q', d.life(0.05)));
  d.add(d.w - 18, 16, `<rect class="d-pill" x="-10" y="-10" width="20" height="20" rx="5"/>${ico('settings', 13)}`, d.life(0.05));
  d.add(168, 6, `<rect class="d-panel" width="146" height="64" rx="6"/><text class="d-menutext" x="10" y="16" font-size="9" font-weight="700">${u.settingsTools}</text>`, d.life(1.7, 6.6));
  checkRow(d, 182, 38, u.toolsPlayback, 3.7, 6.6, d.life(1.7, 6.6));
  d.add(284, 38, `<g transform="translate(-10 0)">${ico('play', 10)}</g><g transform="translate(6 0)">${ico('pause', 10)}</g>`, d.life(1.7, 6.6));
  d.add(16, 14, `<circle class="d-pill" r="10"/>${ico('play', 11)}`, d.pop(6.9), { cls: 'd-play-button' });
  d.pointer([[0.5, 150, 100], ...visit(1.4, d.w - 18, 16), ...visit(3.6, 182, 38), [8.2, d.w - 40, d.h - 20]]);
  d.click(1.4, d.w - 18, 16);
  d.click(3.6, 182, 38);
  return d.html(aria);
}

export function playbackSetup(s, aria) {
  const u = s.scoreUiStrings;
  const d = stage({ id: 'pb-setup', T: 12 });
  d.add(8, 8, `<rect class="d-panel" width="304" height="104" rx="6"/><text class="d-menutext" x="12" y="18" font-size="9" font-weight="700">${u.settingsInstrument}</text>
    <text class="d-menutext" x="12" y="68" font-size="9" font-weight="700">${u.settingsTempo}</text>`, d.life(0.05));
  // Instrument: piano is chosen, then guitar.
  const radio = (x, name, label) => d.add(x, 38, `<circle class="d-field" r="5"/><g transform="translate(14 0)">${ico(name, 13)}</g><text class="d-menutext" x="26" y="3.5" font-size="9.5">${label}</text>`, d.life(0.05));
  radio(26, 'piano', u.instrumentPiano);
  radio(150, 'guitar', u.instrumentGuitar);
  d.add(26, 38, '<circle class="d-active" r="2.6"/>', [[0, { o: 0 }], [0.1, { o: 1 }], [3.4, { o: 1 }], [3.5, { o: 0 }]], { keep: false });
  d.add(150, 38, '<circle class="d-active" r="2.6"/>', [[0, { o: 0 }], [3.5, { o: 0 }], [3.6, { o: 1 }], [d.T - 0.7, { o: 1 }], [d.T - 0.2, { o: 0 }]], { keep: false });
  // Tempo: the slider thumb travels and the label follows.
  d.add(26, 86, '<rect x="0" y="-1.5" width="190" height="3" rx="1.5" fill="var(--rule)"/>', d.life(0.05));
  d.add(26, 86, '<circle r="5.5" fill="var(--accent)"/>', [[0, { x: 70 }], [5.5, { x: 70 }], [8.5, { x: 135 }], [d.T - 0.7, { x: 135 }], [d.T - 0.2, { o: 0 }]], { keep: false });
  d.add(246, 86, `<text class="d-menutext" text-anchor="start" font-size="10" font-weight="600">♩ = 80</text>`, [[0, { o: 1 }], [7, { o: 1 }], [7.01, { o: 0 }], [d.T, { o: 0 }]], { keep: false });
  d.add(246, 86, `<text class="d-menutext" text-anchor="start" font-size="10" font-weight="600">♩ = 132</text>`, [[0, { o: 0 }], [7, { o: 0 }], [7.01, { o: 1 }], [d.T - 0.7, { o: 1 }], [d.T - 0.2, { o: 0 }]], { keep: false });
  d.pointer([[0.5, 280, 100], ...visit(3.4, 150, 38), [5.4, 96, 86], [8.5, 161, 86], [10.5, 280, 100]]);
  d.click(3.4, 150, 38);
  return d.html(aria);
}

/** A moving vertical line across the staff, like the playback bar. */
function playhead(d, t0, x0, moves, y0 = d.y(9), y1 = d.y(-1)) {
  const stops = [[0, { o: 0, x: 0 }], [t0, { o: 0, x: 0 }], [t0 + 0.1, { o: 1, x: 0 }]];
  moves.forEach(([t, x]) => stops.push([t, { x }]));
  stops.push([d.T - 0.7, { o: 1 }], [d.T - 0.2, { o: 0 }]);
  d.add(x0, y0, `<path class="d-playhead" d="M0 0V${f2(y1 - y0)}"/>`, stops, { keep: false });
}

export function playbackPlay(s, aria) {
  const u = s.scoreUiStrings;
  const d = stage({ id: 'pb-play', T: 15 });
  const notes = phrase(d, [['E4', 'G4', 'A4', 'G4'].map((n) => q(n)), ['F4', 'E4', 'D4', 'E4'].map((n) => q(n))], 30);
  notes.forEach((n) => d.note(n.x, n.p, 'q', d.life(0.05)));
  const button = (name, stops) => d.add(16, 14, `<circle class="d-pill" r="10"/>${ico(name, 11)}`, stops);
  button('play', [[0, { o: 1 }], [1.6, { o: 1 }], [1.61, { o: 0 }], [7.7, { o: 0 }], [7.71, { o: 1 }], [d.T, { o: 1 }]]);
  button('pause', [[0, { o: 0 }], [1.6, { o: 0 }], [1.61, { o: 1 }], [7.6, { o: 1 }], [7.61, { o: 0 }]]);
  const start = d.firstX - 6;
  const end = notes[notes.length - 1].x - start + 22;
  // It plays, a press on the space bar pauses it, and a click on an empty spot moves it.
  playhead(d, 1.6, start, [[1.6, 0], [7.5, end * 0.62], [10.4, end * 0.62], [10.45, end * 0.28]]);
  d.pointer([[0.5, 160, 104], ...visit(1.5, 16, 14), [3, 160, 104], [9.2, 160, 104], ...visit(10.3, start + end * 0.28, d.y(-2)), [12.5, 160, 104]]);
  d.click(1.5, 16, 14);
  d.click(10.3, start + end * 0.28, d.y(-2));
  d.keycap(SPACE[u.play] ?? 'Space', 160, 5.8, 7.2, 8.7, { cap: true });
  return d.html(aria);
}

export function playbackVoices(s, aria) {
  const d = stage({ id: 'pb-voices', T: 14 });
  const xs = [0, 1, 2, 3].map((i) => d.firstX + 8 + i * 42);
  const top = ['G4', 'A4', 'B4', 'A4'];
  const low = ['E4', 'E4', 'F4', 'E4'];
  xs.forEach((x, i) => {
    const t = 4.4 + i * 1.6;
    d.note(x, pitch(top[i]), 'q', S(d.life(0.05), [[0, { c: VOICE[0] }], [t - 0.05, { c: VOICE[0] }], [t, { c: ACCENT }], [t + 0.7, { c: VOICE[0] }]]), { stemDown: false });
    d.note(x, pitch(low[i]), 'q', S(d.life(0.05), [[0, { c: VOICE[2] }]]), { stemDown: true });
  });
  [1, 3].forEach((n, i) => d.add(d.w - 54 + i * 24, 16, `<circle r="9" fill="${i === 0 ? VOICE[0] : 'none'}" stroke="${VOICE[n === 3 ? 2 : 0]}" stroke-width="1.4"/><text class="d-captext" fill="${i === 0 ? '#fff' : VOICE[2]}" text-anchor="middle" dominant-baseline="central" font-size="9">${n === 3 ? 3 : 1}</text>`, d.life(0.05)));
  playhead(d, 3.6, d.firstX - 4, [[3.6, 0], [10.3, 172]]);
  d.pointer([[0.6, 200, 104], ...visit(1.6, d.w - 54, 16), [3, 200, 104], [11.5, 200, 104]]);
  d.click(1.6, d.w - 54, 16);
  return d.html(aria);
}

export function grandStaff(s, aria) {
  const d = stage({ id: 'grand', T: 8, h: 124, staff: false });
  const upper = 12;
  const lower = 72;
  const x1 = d.x1;
  d.base(d.lines(d.x0 + 10, x1, upper) + d.lines(d.x0 + 10, x1, lower));
  d.base(`<path class="d-bar" d="M${d.x0 + 10} ${upper}V${lower + 4 * SP}M${x1} ${upper}V${lower + 4 * SP}M${d.x0 + 150} ${upper}V${lower + 4 * SP}" stroke-width="1.1"/>`);
  d.base(`<path class="d-bar" fill="none" stroke-width="1.8" d="M${d.x0 + 5} ${upper}Q${d.x0 - 2} ${(upper + lower + 4 * SP) / 2 - 20} ${d.x0 + 1} ${(upper + lower + 4 * SP) / 2}Q${d.x0 + 8} ${(upper + lower + 4 * SP) / 2 + 20} ${d.x0 + 5} ${lower + 4 * SP}"/>`);
  d.base(glyph('E050', d.x0 + 14, upper + 3 * SP) + glyph('E062', d.x0 + 14, lower + SP));
  const numerals = (top) => glyph('E084', d.x0 + 44, top + SP) + glyph('E084', d.x0 + 44, top + 3 * SP);
  d.base(numerals(upper) + numerals(lower));
  [['E4', 0], ['G4', 1], ['B4', 2], ['G4', 3]].forEach(([n, i]) =>
    d.add(d.x0 + 64 + i * 20, upper + 4 * SP - (pitch(n) * SP) / 2, noteInner(pitch(n), 'q'), d.life(0.05 + i * 0.3)));
  [3, 1, 3, 1].forEach((p, i) => d.add(d.x0 + 64 + i * 20, lower + 4 * SP - (p * SP) / 2, noteInner(p, 'q'), d.life(1.4 + i * 0.3)));
  [['A4', 0], ['G4', 1], ['E4', 2], ['G4', 3]].forEach(([n, i]) =>
    d.add(d.x0 + 164 + i * 20, upper + 4 * SP - (pitch(n) * SP) / 2, noteInner(pitch(n), 'q'), d.life(2.6 + i * 0.3)));
  [2, 4, 2, 0].forEach((p, i) => d.add(d.x0 + 164 + i * 20, lower + 4 * SP - (p * SP) / 2, noteInner(p, 'q'), d.life(3.8 + i * 0.3)));
  return d.html(aria);
}

// Voices -----------------------------------------------------------------------------------------------------------

export function voicesSelect(s, aria) {
  const d = stage({ id: 'voices-select', T: 13 });
  const notes = phrase(d, [['E4', 'G4', 'B4', 'G4'].map((n) => q(n))], 40);
  notes.forEach((n, i) => {
    const t = i === 0 ? 1.5 : 3.4;
    d.note(n.x, n.p, 'q', i < 3 ? S(d.life(0.05), [[t, { c: INK }], [t + 0.1, { c: SEL }], [10, { c: SEL }], [10.1, { c: INK }]]) : d.life(0.05));
  });
  d.pointer([[0.6, d.w - 30, d.h - 24], ...visit(1.5, notes[0].x + 5, d.y(notes[0].p)), ...visit(3.4, notes[2].x + 5, d.y(notes[2].p)), [5.2, d.w - 30, d.h - 24]]);
  d.click(1.5, notes[0].x + 5, d.y(notes[0].p));
  d.click(3.4, notes[2].x + 5, d.y(notes[2].p));
  d.keycap('Shift', 30, 2.6, 3.3, 5.2);
  return d.html(aria);
}

/** Shift+↑/↓ writes a third above or below; `notesList` is the melody, `dir` is +2 (above) or -2 (below). */
function thirds(s, aria, id, names, steps) {
  const d = stage({ id, T: 15 });
  names.forEach((name, i) => {
    const x = d.firstX + 30 + i * 55;
    const p = pitch(name);
    if (p <= -2) for (let l = -2; l >= p; l -= 2) ledger(d, x, l);
    d.note(x, p, 'q', S(d.life(0.05), [[0, { c: SEL }], [4.2, { c: INK }]]), { stemDown: steps.some((st) => st.dir > 0) });
    steps.forEach(({ dir, show, hide }) => {
      const cp = p + dir;
      if (cp <= -2) for (let l = -2; l >= cp; l -= 2) d.base(`<path class="d-line" d="M${f2(x - 4)} ${f2(d.y(l))}H${f2(x + 14)}"/>`);
      d.note(x, cp, 'q', S(d.life(show, hide), [[0, { c: SEL }]]), { stemDown: dir < 0, keep: false });
    });
  });
  steps.forEach(({ dir, show, hide }) => {
    d.keycap('Shift', 30, show - 1.6, show - 0.4, show + 1.4);
    d.keycap(dir > 0 ? '↑' : '↓', 70, show - 1.6, show - 0.4, show + 1.4);
  });
  return d.html(aria);
}

export function thirdAbove(s, aria) {
  return thirds(s, aria, 'third-above', ['C4', 'D4', 'E4'], [{ dir: 2, show: 3.6, hide: 13.5 }]);
}

export function thirdBelow(s, aria) {
  return thirds(s, aria, 'third-below', ['C4', 'D4', 'E4'], [{ dir: -2, show: 3.6, hide: 13.5 }]);
}

export function undoDuplicate(s, aria) {
  const d = stage({ id: 'undo-duplicate', T: 13 });
  ['E4', 'G4', 'A4'].forEach((name, i) => {
    const x = d.firstX + 30 + i * 55;
    const p = pitch(name);
    d.note(x, p, 'q', d.life(0.05), { stemDown: true });
    d.note(x, p + 2, 'q', S(d.life(2.2, 7.2, 0.05), [[0, { c: SEL }]]), { stemDown: false, keep: false });
  });
  d.keycap('Ctrl', 40, 5.2, 6.4, 8.8);
  d.keycap('Z', 76, 5.2, 6.4, 8.8);
  return d.html(aria);
}

export function voicesLegend(s, aria) {
  const u = s.scoreUiStrings;
  const d = stage({ id: 'voices-legend', T: 15, clef: 'G' });
  const xs = [0, 1, 2, 3].map((i) => d.firstX + 14 + i * 40);
  const top = ['G4', 'A4', 'B4', 'A4'];
  const low = ['E4', 'E4', 'F4', 'E4'];
  xs.forEach((x, i) => {
    d.note(x, pitch(top[i]), 'q', S(d.life(0.05), [[0, { c: INK }], [3.4, { c: INK }], [3.5, { c: VOICE[0] }]]), { stemDown: false });
    d.note(x, pitch(low[i]), 'q', S(d.life(0.05), [[0, { c: INK }], [3.4, { c: INK }], [3.5, { c: VOICE[2] }]]), { stemDown: true });
  });
  // The settings checkbox ticks, then the legend appears next to the clef.
  d.add(176, 6, `<rect class="d-panel" width="140" height="30" rx="6"/>`, d.life(0.9, 4.2));
  checkRow(d, 190, 21, u.toolsVoices, 2.4, 4.2, d.life(0.9, 4.2));
  [[1, 0], [2, 2]].forEach(([n, ci], i) => {
    d.add(d.w - 22, 40 + i * 20, `<circle r="7.5" fill="none" stroke="${VOICE[ci]}" stroke-width="1.3"/><text class="d-captext" fill="${VOICE[ci]}" text-anchor="middle" dominant-baseline="central" font-size="8">${n}</text>`, d.life(3.6), { keep: true });
  });
  d.pointer([[0.5, 200, 104], ...visit(2.3, 190, 21), [5, 200, 104]]);
  d.click(2.3, 190, 21);
  return d.html(aria);
}

export function reassignVoice(s, aria) {
  const u = s.scoreUiStrings;
  const d = stage({ id: 'reassign', T: 14, h: 130 });
  const xs = [0, 1, 2, 3].map((i) => d.firstX + 14 + i * 40);
  const melody = ['G4', 'A4', 'E4', 'A4'];
  const bass = ['E4', 'E4', 'E4', 'E4'];
  xs.forEach((x, i) => {
    const wrong = i === 2;
    d.note(x, pitch(melody[i]), 'q', S(d.life(0.05), [[0, { c: wrong ? VOICE[1] : VOICE[0] }], [6.4, { c: wrong ? VOICE[1] : VOICE[0] }], [6.5, { c: VOICE[0] }]]), { stemDown: false });
    if (!wrong) d.note(x, pitch(bass[i]), 'q', d.life(0.05), { stemDown: true });
  });
  const wx = xs[2];
  const wy = d.y(pitch('E4'));
  d.add(wx, wy, noteInner(pitch('E4'), 'q', { stemDown: false }), S(d.life(1.3, 6.4), [[0, { c: SEL }]]), { keep: false });
  const label = (u.assignVoice || '').replace('{n}', '1');
  d.add(wx - 40, wy + 8, `<rect class="d-panel" width="${Math.max(100, label.length * 5.4 + 24)}" height="26" rx="6"/><circle cx="14" cy="13" r="7" fill="${VOICE[0]}"/><text class="d-captext" x="14" y="13" fill="#fff" text-anchor="middle" dominant-baseline="central" font-size="8">1</text><text class="d-menutext d-menutext--hot" x="27" y="16.5" font-size="9">${label}</text>`, d.life(3.2, 6.4));
  d.pointer([[0.5, 280, 112], ...visit(1.3, wx + 5, wy), ...visit(4.3, wx + 10, wy + 21), [7.5, 280, 112]]);
  d.click(1.3, wx + 5, wy);
  d.click(4.3, wx + 10, wy + 21);
  return d.html(aria);
}

// ----- chords ------------------------------------------------------------------------------------------------------------

/** A staff with four quarter notes, the places where chord names go. Names sit above the staff, on a note's column. */
function chordStage(id, T, extra = {}) {
  const d = stage({ id, T, bottom: 72, h: 120, ...extra });
  const notes = phrase(d, [[q('E4'), q('G4'), q('C5'), q('G4')]], 52);
  notes.forEach((n) => d.note(n.x, n.p, 'q', d.life(0.05)));
  return { d, notes, ny: d.y(8) - 13 };
}

const chordName = (d, x, y, text, stops, opts = {}) => d.text(x, y, text, stops, { size: 11, weight: 700, ...opts });
const CHORD_FIELD = (w) => `<rect class="d-field d-field--on" x="${-w / 2}" y="-8" width="${w}" height="15" rx="2.5"/>`;

/** The chord tool in the palette: pressing it and placing it over a note opens the empty field for the name. */
export function chordTool(s, aria) {
  const { d, notes, ny } = chordStage('chord-tool', 10);
  const px = d.w - 40;
  d.add(px, 14, pillInner('Am', { size: 8 }), [[0, { o: 1, c: 'var(--ink-soft)' }], [1.7, { c: 'var(--ink-soft)' }], [1.9, { c: 'var(--accent)' }], [d.T - 0.7, { c: 'var(--accent)' }], [d.T - 0.2, { o: 0 }]], { keep: false });
  const x = notes[0].x + 5;
  d.add(x, ny, CHORD_FIELD(34), [[0, { o: 0 }], [3.4, { o: 0 }], [3.65, { o: 1 }], [d.T - 0.7, { o: 1 }], [d.T - 0.2, { o: 0 }]], { keep: false });
  d.click(1.7, px, 14);
  d.click(3.3, x, d.y(pitch('E4')));
  d.pointer([[0.6, d.w - 30, d.h - 24], ...visit(1.7, px, 14), ...visit(3.3, x, d.y(pitch('E4'))), [6.4, d.w - 30, d.h - 24]]);
  return d.html(aria);
}

/** Typing the name and pressing Enter leaves it written in bold over the note. */
export function chordType(s, aria) {
  const { d, notes, ny } = chordStage('chord-type', 11);
  const x = notes[0].x + 5;
  d.add(x, ny, CHORD_FIELD(34), [[0, { o: 0 }], [0.5, { o: 0 }], [0.75, { o: 1 }], [4.0, { o: 1 }], [4.2, { o: 0 }]], { keep: false });
  chordName(d, x, ny + 4, 'A', [[0, { o: 0 }], [1.2, { o: 0 }], [1.3, { o: 1 }], [2.2, { o: 1 }], [2.3, { o: 0 }]], { keep: false });
  chordName(d, x, ny + 4, 'Am', [[0, { o: 0 }], [2.2, { o: 0 }], [2.3, { o: 1 }], [4.0, { o: 1 }], [4.2, { o: 0 }]], { keep: false });
  chordName(d, x, ny + 4, 'Am', d.pop(4.1));
  d.keycap('Enter', 40, 2.6, 3.7, 7.4);
  return d.html(aria);
}

/** A small fretboard diagram: strings low to high, `dots` as [string, fret] and open strings as circles above. */
function chordDiagram(dots, open) {
  const gap = 8;
  const row = 9;
  let svg = '';
  for (let i = 0; i < 6; i += 1) svg += `<path class="d-line" d="M${i * gap} 0V${row * 4}"/>`;
  for (let i = 0; i <= 4; i += 1) svg += `<path class="d-line" d="M0 ${i * row}H${5 * gap}"${i === 0 ? ' style="stroke-width:2"' : ''}/>`;
  open.forEach((i) => { svg += `<circle class="d-ring-open" cx="${i * gap}" cy="-5" r="2.3"/>`; });
  dots.forEach(([i, fret]) => { svg += `<circle cx="${i * gap}" cy="${(fret - 0.5) * row}" r="3"/>`; });
  return svg;
}

/** Clicking a written name opens its panel: the name, the fingering diagram and the variants. */
export function chordPopup(s, aria) {
  const { d, notes, ny } = chordStage('chord-pop', 11, { h: 196 });
  const x = notes[0].x + 5;
  chordName(d, x, ny + 4, 'Am', d.life(0.05));
  const left = x - 18;
  const top = d.bottom + 30;
  d.add(left, top,
    `<rect class="d-panel" width="150" height="82" rx="6"/>` +
    `<text class="d-menutext" x="10" y="17" font-size="11" font-weight="700">Am</text>` +
    `<g transform="translate(14 40)">${chordDiagram([[2, 2], [3, 2], [4, 1]], [1, 5])}</g>` +
    `<rect class="d-field" x="76" y="30" width="62" height="14" rx="3"/><text class="d-menutext" x="84" y="40" font-size="8">1 / 3</text>` +
    `<rect class="d-field" x="76" y="50" width="62" height="14" rx="3"/><text class="d-menutext" x="84" y="60" font-size="8">Am7</text>`,
    [[0, { o: 0 }], [2.0, { o: 0, y: 4 }], [2.3, { o: 1, y: 0 }], [d.T - 0.7, { o: 1 }], [d.T - 0.2, { o: 0 }]], { keep: false });
  d.click(1.6, x, ny);
  d.pointer([[0.6, d.w - 30, d.h - 24], ...visit(1.6, x, ny), [5.0, d.w - 30, d.h - 40]]);
  return d.html(aria);
}

/** Dragging a name to another beat: the underlined column marks where it will land. */
export function chordMove(s, aria) {
  const { d, notes, ny } = chordStage('chord-move', 11);
  const from = notes[0].x + 5;
  const to = notes[2].x + 5;
  chordName(d, from, ny + 4, 'Am', d.life(0.05, 3.4), { keep: false });
  d.add(to, ny + 8, '<path d="M-14 0H14" stroke="var(--accent)" stroke-width="2" stroke-linecap="round"/>',
    [[0, { o: 0 }], [3.0, { o: 0 }], [3.2, { o: 1 }], [4.1, { o: 1 }], [4.2, { o: 0 }]], { keep: false });
  chordName(d, from, ny + 4, 'Am', [[0, { o: 0 }], [2.0, { o: 0, x: 0 }], [2.1, { o: 0.5 }], [3.9, { o: 0.5, x: to - from }], [4.0, { o: 0 }]], { keep: false });
  chordName(d, to, ny + 4, 'Am', d.pop(4.0));
  d.click(2.0, from, ny);
  d.pointer([[0.6, d.w - 30, d.h - 24], ...visit(2.0, from, ny), [3.9, to, ny], [4.4, to, ny], [6.0, d.w - 30, d.h - 24]]);
  return d.html(aria);
}

/** A marquee around several names and Delete: they all go, the notes stay. */
export function chordDelete(s, aria) {
  const { d, notes, ny } = chordStage('chord-del', 11);
  const names = ['Am', 'F', 'C'];
  const idx = [0, 1, 3];
  idx.forEach((n, i) => chordName(d, notes[n].x + 5, ny + 4, names[i], d.life(0.05, 4.4), { keep: false }));
  const from = { x: notes[0].x - 12, y: ny - 12 };
  const to = { x: notes[3].x + 22, y: ny + 12 };
  d.add(from.x, from.y, `<rect class="d-marquee" width="${to.x - from.x}" height="${to.y - from.y}"/>`,
    [[0, { o: 0, sx: 0.02, sy: 0.02 }], [1.2, { o: 0, sx: 0.02, sy: 0.02 }], [1.3, { o: 1 }], [2.6, { o: 1, sx: 1, sy: 1 }], [4.2, { o: 1 }], [4.5, { o: 0 }]], { keep: false });
  d.pointer([[0.6, d.w - 30, d.h - 24], [1.2, from.x, from.y], [2.6, to.x, to.y], [4.0, d.w - 30, d.h - 24]]);
  d.keycap('Delete', 40, 2.8, 3.8, 7.4);
  return d.html(aria);
}
