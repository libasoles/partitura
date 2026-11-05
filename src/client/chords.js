/* chords.js — Acordes escritos sobre el pentagrama: busca el nombre en el diccionario de guitar-chords (JSON que genera el
   build, ver scripts/lib/chords-data.mjs), calcula sus variantes y dibuja la digitacion. Se carga la primera vez que se usa. */

const SVG_NS = 'http://www.w3.org/2000/svg';
const STRING_COUNT = 6;
const FRET_COUNT = 5;
const WIDTH = 108;
const MARGIN_X = 14;
const TOP = 26;
const FRET_HEIGHT = 20;
const DOT_RADIUS = 8;
const LABEL_HEIGHT = 20;

// Afinacion estandar: cuerda 6 (mi grave) a 1 (mi agudo).
const STRING_NAMES = { 6: 'E', 5: 'A', 4: 'D', 3: 'G', 2: 'B', 1: 'E' };
const OPEN_SEMITONE = { 6: 4, 5: 9, 4: 2, 3: 7, 2: 11, 1: 4 };
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTE_INDEX = {
  C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, F: 5, 'E#': 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
};

// Los nombres se comparan sin simbolos tipograficos; las mayusculas importan ("m7" no es "M7").
export function normalize(text) {
  return String(text)
    .replace(/[()]/g, '')
    .replace(/♭/g, 'b')
    .replace(/♯/g, '#')
    .replace(/[△Δ]/g, 'maj')
    .replace(/ø/g, 'm7b5')
    .replace(/°/g, 'dim')
    .replace(/\s+/g, '');
}

// Indice de nombres y alias -> digitacion. "dim" a secas usa la del dim7, como en el diccionario.
export function indexChords(chords) {
  const byName = new Map();
  for (const chord of chords) {
    for (const candidate of [chord.name, ...(chord.aliases || [])]) {
      const key = normalize(candidate);
      byName.set(key, chord);
      if (key.endsWith('dim7')) byName.set(key.slice(0, -1), chord);
    }
  }
  return byName;
}

export function findChord(index, text) {
  const key = normalize(String(text).trim());
  return key ? index.get(key) || null : null;
}

const rootOf = (name) => {
  const match = /^([A-G][#b]?)/.exec(normalize(name));
  return match ? NOTE_INDEX[match[1]] ?? null : null;
};

// Extras sobre la cejilla de cada familia, como [cuerda, traste relativo a la cejilla].
const SHAPES = {
  major: { E: [[3, 1], [4, 2], [5, 2]], A: [[2, 2], [3, 2], [4, 2]] },
  minor: { E: [[4, 2], [5, 2]], A: [[2, 1], [3, 2], [4, 2]] },
  dom7: { E: [[3, 1], [5, 2]], A: [[2, 2], [4, 2]] },
  m7: { E: [[5, 2]], A: [[2, 1], [4, 2]] },
};

function barreShape(chord, family, key, fret) {
  const items = SHAPES[family][key].map(([string, rel]) => ({ string, rel }));
  if (key === 'A') items.push({ string: 6, rel: 0, mute: true });
  const ranked = items.filter((item) => !item.mute).sort((a, b) => (a.rel !== b.rel ? a.rel - b.rel : b.string - a.string));
  const label = new Map(ranked.map((item, index) => [item.string, String(index + 2)]));
  const fingers = items.sort((a, b) => b.string - a.string)
    .map((item) => (item.mute ? [item.string, 'x'] : [item.string, fret + item.rel, label.get(item.string)]));
  return { ...chord, position: fret, barres: [{ fromString: key === 'E' ? 6 : 5, toString: 1, fret }], fingers };
}

// La otra forma de cejilla (la de mi o la de la) que la digitacion por defecto todavia no usa.
function alternate(chord) {
  const family = ['major', 'minor', 'dom7', 'm7'].find((name) => (chord.families || []).includes(name));
  const root = rootOf(chord.name);
  if (!family || root === null) return null;
  const fretE = (root - 4 + 12) % 12;
  const fretA = (root - 9 + 12) % 12;
  if (chord.barres && chord.barres.length) {
    const next = chord.barres[0].fromString === 6 ? 'A' : 'E';
    const fret = next === 'E' ? fretE : fretA;
    return fret ? barreShape(chord, family, next, fret) : null;
  }
  const options = [];
  if (fretE) options.push({ key: 'E', fret: fretE });
  if (fretA) options.push({ key: 'A', fret: fretA });
  if (!options.length) return null;
  options.sort((a, b) => (a.fret !== b.fret ? a.fret - b.fret : a.key === 'E' ? -1 : 1));
  return barreShape(chord, family, options[0].key, options[0].fret);
}

// El dim7 es simetrico: cada forma se desliza a cualquier raiz.
function dim7(chord, root, string) {
  let fret = (root - (string === 6 ? 4 : 9) + 12) % 12;
  if (fret < 2) fret += 12;
  const fingers = string === 6
    ? [[6, fret, '2'], [5, 'x'], [4, fret - 1, '1'], [3, fret, '3'], [2, fret - 1, '1'], [1, 'x']]
    : [[6, 'x'], [5, fret, '2'], [4, 'x'], [3, fret - 1, '1'], [2, fret + 1, '3'], [1, fret - 1, '1']];
  return { ...chord, alternatePositions: undefined, barres: [], position: fret - 1, fingers };
}

// Digitaciones de un acorde: la del diccionario, la de cejilla que se calcula y las alternativas guardadas.
export function positionsOf(chord) {
  const base = { ...chord, alternatePositions: undefined };
  const root = rootOf(chord.name);
  if (/dim7$/.test(chord.name) && root !== null) return [base, dim7(chord, root, 6), dim7(chord, root, 5)];
  const computed = alternate(chord);
  const stored = (chord.alternatePositions || []).map((position) => ({ ...base, barres: undefined, position: undefined, ...position }));
  return [base, ...(computed ? [computed] : []), ...stored];
}

// Nota de cada cuerda segun donde se pisa, para rotular el pie del diagrama.
function soundingNames(shape) {
  const frets = {};
  for (const barre of shape.barres || []) {
    for (let s = Math.min(barre.fromString, barre.toString); s <= Math.max(barre.fromString, barre.toString); s += 1) frets[s] = barre.fret;
  }
  for (const [string, fret] of shape.fingers) frets[string] = fret;
  const names = {};
  for (let string = 1; string <= STRING_COUNT; string += 1) {
    const fret = frets[string];
    names[string] = fret === 'x' ? '' : typeof fret === 'number' ? NOTE_NAMES[(OPEN_SEMITONE[string] + fret) % 12] : STRING_NAMES[string];
  }
  return names;
}

const stringX = (string) => MARGIN_X + (STRING_COUNT - string) * ((WIDTH - 2 * MARGIN_X) / (STRING_COUNT - 1));
const fretY = (row) => TOP + row * FRET_HEIGHT;

function node(name, attributes, text) {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
}

// Un diagrama de diapason: cuerdas 6 a 1 de izquierda a derecha, trastes hacia abajo desde la cejuela (o desde `position`).
export function drawDiagram(shape, label) {
  const offset = (shape.position || 1) - 1;
  const position = shape.position || 1;
  const height = fretY(FRET_COUNT) + 6 + LABEL_HEIGHT;
  const svg = node('svg', { class: 'chord-diagram', viewBox: `0 0 ${WIDTH} ${height}`, width: WIDTH, height, role: 'img', 'aria-label': label });
  for (let string = 1; string <= STRING_COUNT; string += 1) {
    svg.append(node('line', { class: 'chord-diagram__string', x1: stringX(string), y1: fretY(0), x2: stringX(string), y2: fretY(FRET_COUNT) }));
  }
  for (let row = 0; row <= FRET_COUNT; row += 1) {
    svg.append(node('line', { class: row === 0 && position === 1 ? 'chord-diagram__fret chord-diagram__fret--nut' : 'chord-diagram__fret', x1: stringX(STRING_COUNT), y1: fretY(row), x2: stringX(1), y2: fretY(row) }));
  }
  if (position > 1) svg.append(node('text', { class: 'chord-diagram__position', x: stringX(STRING_COUNT) - 8, y: fretY(0.5), 'text-anchor': 'end', 'dominant-baseline': 'middle' }, String(position)));
  for (const barre of shape.barres || []) {
    const low = Math.min(barre.fromString, barre.toString), high = Math.max(barre.fromString, barre.toString);
    svg.append(node('rect', { class: 'chord-diagram__barre', x: stringX(high) - DOT_RADIUS, y: fretY(barre.fret - offset - 0.5) - DOT_RADIUS, width: stringX(low) - stringX(high) + DOT_RADIUS * 2, height: DOT_RADIUS * 2, rx: DOT_RADIUS }));
  }
  for (const [string, fret, finger] of shape.fingers) {
    const x = stringX(string);
    if (fret === 'x') svg.append(node('text', { class: 'chord-diagram__mute', x, y: fretY(0) - 10, 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, '×'));
    else if (fret === 'o') svg.append(node('circle', { class: 'chord-diagram__open', cx: x, cy: fretY(0) - 10, r: 5 }));
    else {
      const y = fretY(fret - offset - 0.5);
      svg.append(node('circle', { class: 'chord-diagram__finger', cx: x, cy: y, r: DOT_RADIUS }));
      if (finger) svg.append(node('text', { class: 'chord-diagram__finger-label', x, y, 'text-anchor': 'middle', 'dominant-baseline': 'central' }, finger));
    }
  }
  const names = soundingNames(shape);
  for (let string = 1; string <= STRING_COUNT; string += 1) {
    svg.append(node('text', { class: 'chord-diagram__string-name', x: stringX(string), y: fretY(FRET_COUNT) + LABEL_HEIGHT, 'text-anchor': 'middle' }, names[string]));
  }
  return svg;
}
