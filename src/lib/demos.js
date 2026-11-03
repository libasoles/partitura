/* demos.js — One looping, realistic animation per tutorial: a short phrase on a real staff and a pointer doing exactly
   what the text says (see demo.js for the engine). Each function takes the language's strings for the few labels drawn
   inside the stage and returns the figure's HTML. */

import { stage, pitch, S, SP, beamGroup, pillInner, glyph } from './demo.js';

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
  const d = stage({ id: 'place', T: 11 });
  const notes = phrase(d, [
    ['E4', 'E4', 'F4', 'G4'].map((n) => q(n)),
    ['G4', 'F4', 'E4', 'D4'].map((n) => q(n)),
  ]);
  placing(d, notes, 2.2, 0.85);
  d.keycap('4', 26, 0.4, 1.3, 9.2);
  return d.html(aria);
}

export function notesRests(s, aria) {
  const d = stage({ id: 'rests', T: 12 });
  const x = (i) => d.firstX + i * 30;
  const eighths = [{ x: x(0), p: pitch('G4') }, { x: x(0) + 22, p: pitch('A4') }].map((n) => ({ x: n.x, y: d.y(n.p) }));
  const group = beamGroup(eighths);
  d.add(0, 0, group.svg, d.pop(3.0), { cls: 'd-beamed' });
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
    if (i < 2) d.note(n.x, n.p, 'q', S(d.life(0.05), [[1.5, { c: INK }], [1.6, { c: SEL }], [4.9, { c: SEL }], [5.0, { c: INK }]]));
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
  d.keycap('D', 60, 3.0, 3.6, 8.2);
  return d.html(aria);
}

export function tuplets(s, aria) {
  const d = stage({ id: 'trip', T: 13 });
  const t = s.scoreUiStrings;
  const xs = [d.firstX + 20, d.firstX + 44, d.firstX + 68];
  const heads = ['E4', 'F4', 'G4'].map((n, i) => ({ x: xs[i], y: d.y(pitch(n)) }));
  const group = beamGroup(heads);
  d.add(0, 0, group.svg, S(d.life(0.05), [[2.7, { c: INK }], [2.9, { c: SEL }], [5.6, { c: SEL }], [5.8, { c: INK }]]));
  const mid = (xs[0] + xs[2]) / 2 + 5;
  d.add(mid, group.top - 26, pillInner(t.triplet, { size: 8 }), [[0, { o: 0, y: 4 }], [3.1, { o: 0, y: 4 }], [3.35, { o: 1, y: 0 }], [5.4, { o: 1, y: 0 }], [5.6, { o: 0 }]], { keep: false });
  d.add(0, group.top - 7,
    `<path class="d-bracket" d="M${xs[0] + 1} 3V0H${xs[2] + 10}V3"/><text class="d-text" x="${(xs[0] + xs[2]) / 2 + 5}" y="-3" text-anchor="middle" font-size="9" font-style="italic" font-weight="600">3</text>`,
    [[0, { o: 0 }], [5.7, { o: 0 }], [6.0, { o: 1 }], [d.T - 0.7, { o: 1 }], [d.T - 0.2, { o: 0 }]]);
  const from = { x: xs[0] - 8, y: d.y(5) };
  const to = { x: xs[2] + 18, y: d.y(-1.5) };
  d.add(from.x, from.y, `<rect class="d-marquee" width="${to.x - from.x}" height="${to.y - from.y}"/>`,
    [[0, { o: 0, sx: 0.02, sy: 0.02 }], [1.3, { o: 0, sx: 0.02, sy: 0.02 }], [1.4, { o: 1 }], [2.7, { o: 1, sx: 1, sy: 1 }], [3.0, { o: 0 }]], { keep: false });
  d.pointer([[0.6, d.w - 30, d.h - 24], [1.3, from.x, from.y], [2.7, to.x, to.y], ...visit(4.6, mid, group.top - 26), [6.4, d.w - 30, d.h - 24]]);
  d.click(4.6, mid, group.top - 26);
  return d.html(aria);
}

export function ties(s, aria) {
  const d = stage({ id: 'tie', T: 13 });
  const t = s.scoreUiStrings;
  const notes = phrase(d, [[q('G4'), q('G4'), q('A4'), q('B4')]], 40);
  notes.forEach((n, i) => d.note(n.x, n.p, 'q', i < 2 ? S(d.life(0.05), [[2.4, { c: INK }], [2.5, { c: SEL }], [5.8, { c: SEL }], [5.9, { c: INK }]]) : d.life(0.05)));
  const a = notes[0];
  const b = notes[1];
  const y = d.y(a.p) + SP * 0.9;
  d.add(0, 0, `<path class="d-tie" d="M${a.x + 5} ${y}Q${(a.x + b.x) / 2 + 5} ${y + 9} ${b.x + 5} ${y}"/>`,
    [[0, { o: 0 }], [5.5, { o: 0 }], [5.8, { o: 1 }], [d.T - 0.7, { o: 1 }], [d.T - 0.2, { o: 0 }]]);
  const px = (a.x + b.x) / 2 + 5;
  d.add(px, d.y(8) - 12, pillInner(t.link, { size: 8 }), [[0, { o: 0 }], [2.8, { o: 0 }], [3.05, { o: 1 }], [5.6, { o: 1 }], [5.8, { o: 0 }]], { keep: false });
  d.pointer([[0.6, d.w - 30, d.h - 24], ...visit(1.5, a.x + 5, d.y(a.p)), ...visit(2.4, b.x + 5, d.y(b.p)), ...visit(4.9, px, d.y(8) - 12), [6.6, d.w - 30, d.h - 24]]);
  d.click(1.5, a.x + 5, d.y(a.p));
  d.click(2.4, b.x + 5, d.y(b.p));
  d.click(4.9, px, d.y(8) - 12);
  d.keycap('Shift', 30, 1.0, 2.0, 2.9);
  return d.html(aria);
}

// ----- measures and signatures ----------------------------------------------------------------------------------

export function signatures(s, aria) {
  const d = stage({ id: 'sig', T: 14, staff: false });
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
  const targets = [
    [1.5, d.meterX + 5, t.meter, 3.0],
    [4.4, clefX + 8, t.clef, 6.0],
    [7.6, d.keyX + 6, t.keySignature, 9.2],
  ];
  const path = [[0.6, d.w - 30, d.h - 24]];
  targets.forEach(([at, x, text, change]) => {
    path.push(...visit(at, x, d.y(4)));
    d.click(at, x, d.y(4));
    d.add(x, d.y(9) - 14, pillInner(text, { size: 8 }), [[0, { o: 0 }], [at + 0.2, { o: 0 }], [at + 0.45, { o: 1 }], [change + 0.1, { o: 1 }], [change + 0.35, { o: 0 }]], { keep: false });
  });
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

export function repeats(s, aria) {
  const d = stage({ id: 'rep', T: 14 });
  const notes = phrase(d, [
    ['E4', 'G4', 'A4', 'G4'].map((n) => q(n)),
    ['F4', 'E4', 'D4', 'E4'].map((n) => q(n)),
  ], 28);
  notes.forEach((n) => d.note(n.x, n.p, 'q', d.life(0.05)));
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
  const d = stage({ id: 'dyn', T: 13, bottom: 62, h: 120 });
  const notes = phrase(d, [['E4', 'F4', 'G4', 'A4'].map((n) => q(n))], 42);
  notes.forEach((n) => d.note(n.x, n.p, 'q', d.life(0.05)));
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
  const d = stage({ id: 'tab', T: 13, bottom: 62, h: 146 });
  const notes = phrase(d, [[q('G4'), q('A4'), q('B4'), q('C5')]], 40);
  notes.forEach((n) => d.note(n.x, n.p, 'q', d.life(0.05)));
  d.add(0, 0, tabLines(d), [[0, { o: 0 }], [3.0, { o: 0 }], [3.4, { o: 1 }], [d.T - 0.7, { o: 1 }], [d.T - 0.2, { o: 0 }]]);
  [[2, 0], [2, 2], [1, 0], [1, 1]].forEach(([string, fret], i) => {
    d.fret(notes[i].x + 5, TAB_TOP, string, fret, d.pop(3.6 + i * 0.35), {});
  });
  // The button in the palette lights up when it is on.
  const bx = d.w - 30;
  d.add(bx, 10, `<rect class="d-pill" x="-17" y="-9" width="34" height="18" rx="4"/><text class="d-pilltext" text-anchor="middle" dominant-baseline="central" font-size="8.5">TAB</text>`,
    [[0, { o: 1, c: 'var(--ink-soft)' }], [2.4, { c: 'var(--ink-soft)' }], [2.6, { c: 'var(--accent)' }], [d.T - 0.7, { c: 'var(--accent)' }], [d.T - 0.2, { o: 0 }]]);
  d.click(2.4, bx, 10);
  d.pointer([[0.8, d.w - 90, d.h - 30], ...visit(2.4, bx, 10), [4.6, d.w - 90, d.h - 30]]);
  return d.html(aria);
}

export function refinger(s, aria) {
  const d = stage({ id: 'refing', T: 13, bottom: 62, h: 160 });
  const notes = phrase(d, [[q('D4'), q('G4')]], 56);
  notes.forEach((n) => d.note(n.x, n.p, 'q', d.life(0.05)));
  d.base(tabLines(d));
  const x = notes[0].x + 5;
  // D3 can be played on the fifth string (fret 5) or, with the same sound, on the open fourth string.
  d.fret(x, TAB_TOP, 4, 5, S(d.life(0.05, 4.4), [[2.2, { c: INK }], [2.3, { c: SEL }]]), { keep: false });
  d.fret(x, TAB_TOP, 3, 0, S(d.pop(4.4), [[4.3, { c: SEL }]]), {});
  d.fret(notes[1].x + 5, TAB_TOP, 2, 0, d.life(0.05), {});
  d.click(2.2, x, TAB_TOP + 4 * 7);
  d.pointer([[0.8, d.w - 30, d.h - 24], ...visit(2.2, x + 2, TAB_TOP + 4 * 7), [4.0, d.w - 30, d.h - 24]]);
  d.keycap('Shift', d.w - 60, 3.2, 3.9, 8.4);
  d.keycap('↑', d.w - 24, 3.2, 3.9, 8.4);
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

export function scores(s, aria) {
  const d = stage({ id: 'docs', T: 14, bottom: 96, h: 128, staff: false });
  const name = (n) => s.scoreUiStrings.untitledScore.replace('{n}', n);
  const tabX = [8, 98];
  const tab = (x, n, stops) => d.add(x, 14, `<rect class="d-doctab" x="0" y="-10" width="82" height="20" rx="5"/><text class="d-pilltext" x="41" text-anchor="middle" dominant-baseline="central" font-size="8.5">${name(n)}</text>`, stops);
  tab(tabX[0], 1, d.life(0.05));
  // The second score opens at 3.4 and the plus button moves over to make room.
  tab(tabX[1], 2, d.pop(3.4));
  d.add(tabX[0] + 94, 14, '<circle class="d-plus" r="8"/><path class="d-plusmark" d="M-3.5 0H3.5M0 -3.5V3.5"/>', S(d.life(0.05), [[3.2, { x: 0 }], [3.5, { x: 90 }]]));
  // The active tab carries an underline.
  const underline = (x, stops, opts) => d.add(x, 25, '<rect class="d-active" width="82" height="2" rx="1"/>', stops, opts);
  underline(tabX[0], [[0, { o: 0 }], [0.3, { o: 1 }], [3.6, { o: 1 }], [3.9, { o: 0 }], [7.0, { o: 0 }], [7.3, { o: 1 }], [d.T - 0.7, { o: 1 }], [d.T - 0.2, { o: 0 }]]);
  underline(tabX[1], [[0, { o: 0 }], [3.5, { o: 0 }], [3.8, { o: 1 }], [6.8, { o: 1 }], [7.1, { o: 0 }]], { keep: false });
  // Each score has its own staff: the first one has notes, the new one starts empty.
  d.base(d.lines(18, d.x1 - 12, d.bottom - 4 * SP));
  ['E4', 'G4', 'A4', 'G4'].forEach((n, i) => {
    d.note(48 + i * 36, pitch(n), 'q', [[0, { o: 0 }], [0.2, { o: 1 }], [3.4, { o: 1 }], [3.7, { o: 0 }], [7.1, { o: 0 }], [7.4, { o: 1 }], [d.T - 0.7, { o: 1 }], [d.T - 0.2, { o: 0 }]]);
  });
  d.click(3.0, tabX[0] + 94, 14);
  d.click(6.9, tabX[0] + 41, 14);
  d.pointer([[0.6, d.w - 40, d.h - 20], ...visit(3.0, tabX[0] + 94, 14), [4.8, tabX[1] + 41, 50], ...visit(6.9, tabX[0] + 41, 14), [9.0, d.w - 40, d.h - 20]]);
  return d.html(aria);
}
