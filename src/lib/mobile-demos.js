// Mobile previews use the tutorial glyphs and the published song's actual notes and syllables.
import source from '../../public/demos/Canto en la rama - 3 voces.musicxml?raw';
import { DOMParser } from 'linkedom';
import { createScoreModel } from '../client/score-model.js';
import IO from '../client/score-io.js';
import { choirColumns } from '../client/score-intervals.js';
import { stage, noteInner, pillInner, beamGroup } from './demo.js';

const M = createScoreModel({ choir: true, grandStaff: true });
const song = IO.parseMusicXml(source, M, new DOMParser());
const colors = ['#b57682', '#749982', '#768fb5'];
const lanes = [M.measures(song), song.lower, song.lower2];
const x = (at) => 120 + at * 2.6;

export function songDemo(kind, label) {
  const choir = kind === 'choir';
  const lyrics = kind === 'lyrics';
  const intervals = kind === 'intervals';
  const mi = choir ? 29 : intervals ? 42 : 10;
  const d = stage({ id: `mobile-${kind}`, T: 12, h: choir ? 300 : lyrics ? 150 : 130, bottom: intervals ? 92 : 76, meter: [3, 4], key: 5 });
  const count = choir ? 3 : lyrics ? 1 : 2;
  for (let staff = 0; staff < count; staff++) {
    const offset = choir ? staff * 96 : 0;
    if (staff && choir) {
      d.base(`<g transform="translate(0 ${offset})">${d.lines(6, 314)}${d.clefAt(10)}${d.keyAt(d.keyX, 5)}${d.meterAt(d.meterX, [3, 4])}</g>`);
    }
    lanes[staff][mi].forEach((n, i) => {
      const p = n.n - 30;
      // Adjacent heads on a shared staff sit beside each other, as in the editor.
      const adjacent = !choir && staff === 1 && lanes[0][mi].some((other) =>
        other.at === n.at && !other.rest && Math.abs(other.n - n.n) === 1);
      const px = x(n.at) + (adjacent ? 11 : 0);
      const py = d.y(p) + offset;
      const note = `<g style="color:${colors[staff]};fill:currentColor">${noteInner(p, n.d, { dot: n.dot, acc: n.acc, stemDown: !choir && staff === 1 })}</g>`;
      if (lyrics || intervals) d.base(`<g transform="translate(${px} ${py})">${note}</g>`);
      else d.add(px, py, note, d.pop(0.6 + staff * 1.5 + i * 0.4));
      if (lyrics) {
        const text = song.lyrics[mi].find((l) => !l.s && l.at === n.at)?.text;
        const t = 3 + i * 2;
        d.add(px + 5, 106, '<path d="M-20 8H20" stroke="var(--accent)" stroke-width="1.2" fill="none"/>', d.life(t, t + 1.4), { keep: false });
        d.text(px + 5, 108, text, d.pop(t + 0.5), { size: 12, font: 'Georgia, serif' });
        d.keycap(i === 2 ? 'Enter' : 'Space', 30, 0, t + 1.4, 0);
      }
    });
  }
  if (intervals) {
    choirColumns(song, mi, M, new Set([1, 2])).forEach((col, i) => {
      d.text(x(col.at) + 5, 24, col.intervals.join(' '), d.pop(3 + i * 0.6), { size: 13 });
    });
  }
  return d.html(label);
}

// One sequence: make a triplet in bar 1, then slur its last note to bar 2.
export function contextDemo(s, label) {
  const d = stage({ id: 'mobile-context', T: 13, h: 160, bottom: 100 });
  const xs = [92, 118, 144, 174, 246];
  const ps = [2, 3, 4, 4, 4];
  const heads = xs.slice(0, 3).map((px, i) => ({ x: px, y: d.y(ps[i]) }));
  const group = beamGroup(heads);
  d.base(d.barline(198));
  d.add(0, 0, group.svg, d.life(0.05));
  d.note(xs[3], ps[3], 'h', d.life(0.05), { dot: true });
  d.note(xs[4], ps[4], 'w', d.life(0.05));
  const selection = (left, width, from, to) => d.add(left, 62, `<rect class="d-marquee" width="${width}" height="48" rx="3"/>`, d.life(from, to), { keep: false });
  selection(84, 86, 0.7, 3.2);
  d.add(128, 26, pillInner(s.scoreUiStrings.triplet), d.life(1.4, 3.2), { keep: false });
  d.click(2.5, 128, 26);
  d.text(128, 47, '3', d.pop(3.2), { size: 12, italic: true });
  selection(166, 100, 5, 8);
  d.add(210, 32, pillInner(s.scoreUiStrings.link), d.life(6.1, 8), { keep: false });
  d.click(7.2, 210, 32);
  d.add(0, 0, '<path class="d-tie" d="M180 91Q216 119 252 91"/>', d.pop(8));
  d.pointer([[0.3, 84, 62], [0.7, 84, 62], [1.3, 170, 110], [2.3, 128, 26], [2.9, 128, 26], [4.6, 166, 62], [5, 166, 62], [5.8, 266, 110], [7, 210, 32], [7.6, 210, 32], [8.7, 294, 140]]);
  return d.html(label);
}


export function guitarDemo(s, label) {
  const d = stage({ id: 'mobile-guitar', T: 16, h: 202, bottom: 78, meter: [3, 4] });
  const xs = [100, 170, 240];
  [2, 4, 6].forEach((p, i) => d.note(xs[i], p, 'q', d.life(0.05)));
  d.base(d.lines(28, 314, 112, 6, 7));
  ['T', 'A', 'B'].forEach((t, i) => d.text(14, 121 + i * 10, t, d.life(0.05), { size: 9 }));
  d.fret(105, 112, 2, 0, d.pop(2));
  d.fret(245, 112, 1, 3, d.pop(2.6));
  d.fret(175, 112, 1, 0, d.life(2.3, 6.2), { keep: false });
  d.fret(175, 112, 2, 4, d.pop(6.3));
  d.add(175, 129, '<circle r="8" fill="none" stroke="var(--note-selected)" stroke-dasharray="2 2"/>', d.life(4.8, 6.2), { keep: false });
  d.keycap('Shift', 30, 0, 6, 0);
  d.keycap('↓', 70, 0, 6, 0);
  d.click(4, 175, 122);
  d.pointer([[3, 280, 180], [3.8, 175, 122], [4.3, 175, 122], [5, 280, 180]]);
  d.add(90, 18, `<text class="d-text" font-size="15" font-weight="600">${s.scoreUiStrings.barre.charAt(0)}3</text><path class="d-bracket" d="M30 -3H164V3"/>`, d.pop(9));
  return d.html(label);
}
