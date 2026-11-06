// Picks one chord name per column from the candidates of `chordNames`, using the whole sequence: one global key
// (Temperley-style profiles plus first/last bass and the key signature) and a Viterbi path over diatonic fit,
// root motion and harmonic function. Weights are hand-tuned; the method and its limits are in docs/armonia-contexto.md.
const SHAPES = {
  '': [0, 4, 7], m: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10],
  m7b5: [0, 3, 6, 10], dim7: [0, 3, 6, 9], 'm(maj7)': [0, 3, 7, 11], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9], sus4: [0, 5, 7], sus2: [0, 2, 7],
};
const SHAPE_PRIOR = { '': 0, m: 0, 7: -0.1, m7: -0.1, maj7: -0.2, m7b5: -0.3, dim: -0.3, 6: -0.6, m6: -0.8, dim7: -0.8, aug: -1, 'm(maj7)': -1.2, sus4: -1.2, sus2: -1.2 };
const PROFILE = { maj: [5, 2, 3.5, 2, 4.5, 4, 2, 4.5, 2, 3.5, 1.5, 4], min: [5, 2, 3.5, 4.5, 2, 4, 2, 4.5, 3.5, 2, 1.5, 4] };
const SCALE = { maj: [0, 2, 4, 5, 7, 9, 11], min: [0, 2, 3, 5, 7, 8, 10, 11] };
const DEGREE = { maj: { 0: 1, 2: 0.6, 4: 0.3, 5: 0.7, 7: 0.9, 9: 0.6, 11: 0.2 }, min: { 0: 1, 2: 0.2, 3: 0.3, 5: 0.6, 7: 0.8, 8: 0.4, 10: 0.3, 11: 0.2 } };
// 0 tonic, 1 subdominant, 2 dominant
const FUNCTION = { maj: { 0: 0, 2: 1, 4: 0, 5: 1, 7: 2, 9: 0, 11: 2 }, min: { 0: 0, 2: 1, 3: 0, 5: 1, 7: 2, 8: 1, 10: 2, 11: 2 } };
const FUNCTION_MOVE = { '01': 0.3, 12: 0.6, 20: 0.8, 21: -0.5 };
const ROOT_MOVE = { 5: 1, 7: 0.5, 0: 0.5, 2: 0.3, 3: 0.3, 4: 0.3, 8: 0.3, 9: 0.3, 10: 0.2, 1: -0.5, 6: -0.5, 11: -0.5 };
const W = { sixth: 1.5, tonic: 1.5, signature: 0.8, outside: 2, inversion: 1.2, second: 0.3, secondary: 1, held: 0.8 };
const LETTER = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ACCIDENTAL = { '#': 1, b: -1, bb: -2, '##': 2 };
const mod = (n) => ((n % 12) + 12) % 12;

function parse(name) {
  const [, letter, accidental, suffix, bassLetter, bassAccidental] = /^([A-G])(#|b|bb|##)?(.*?)(?:\/([A-G])(#|b|bb|##)?)?$/.exec(name);
  const root = mod(LETTER[letter] + (ACCIDENTAL[accidental] || 0));
  const bass = bassLetter ? mod(LETTER[bassLetter] + (ACCIDENTAL[bassAccidental] || 0)) : root;
  return { name, root, suffix, bass, pcs: SHAPES[suffix].map((step) => mod(root + step)) };
}

// `columns`: consecutive [{ names, pcs }] of one line (names as ordered by chordNames, pcs the sounding pitch classes);
// `fifths`: key signature. Returns the names in the same order with the chosen one first.
export function pickChords(columns, fifths = 0) {
  if (!columns.length) return [];
  const parsed = columns.map((column) => column.names.map(parse));
  const histogram = Array(12).fill(0);
  columns.forEach((column) => column.pcs.forEach((pc) => { histogram[pc] += 1; }));
  const first = parsed[0][0];
  const last = parsed[parsed.length - 1][0];
  let key = null;
  for (let tonic = 0; tonic < 12; tonic++) {
    for (const mode of ['maj', 'min']) {
      let score = histogram.reduce((sum, count, pc) => sum + count * PROFILE[mode][mod(pc - tonic)], 0) / columns.length;
      score += W.tonic * ((last.bass === tonic ? 1 : 0) + (first.bass === tonic ? 0.5 : 0));
      if (tonic === mod(fifths * 7 + (mode === 'maj' ? 0 : 9))) score += W.signature;
      if (!key || score > key.score) key = { tonic, mode, score };
    }
  }
  const degree = (chord) => mod(chord.root - key.tonic);
  const outside = (chord) => chord.pcs.filter((pc) => !SCALE[key.mode].includes(mod(pc - key.tonic))).length;
  const unary = (chord) => {
    const out = outside(chord);
    let score = (chord.suffix === 'dim7' ? 0 : DEGREE[key.mode][degree(chord)] ?? 0) - W.outside * out + SHAPE_PRIOR[chord.suffix];
    const secondary = out === 1 && chord.suffix === '7' && degree(chord) !== 0 && SCALE[key.mode].includes(mod(chord.root + 7 - key.tonic));
    if (secondary) score += W.secondary * 2;
    // A seventh chord on the sixth degree (Am7/C in C major) is preferred to the sixth chord with the same notes (C6).
    if (key.mode === 'maj' && chord.suffix === 'm7' && degree(chord) === 9) score += W.sixth;
    if (chord.bass !== chord.root) score -= W.inversion + (chord.pcs.length === 3 && chord.bass === chord.pcs[2] ? W.second : 0);
    return score;
  };
  const role = (chord) => FUNCTION[key.mode][degree(chord)];
  const move = (from, to) => {
    if (from.name === to.name) return W.held;
    let score = ROOT_MOVE[mod(to.root - from.root)];
    const a = role(from);
    const b = role(to);
    if (a !== undefined && b !== undefined) score += FUNCTION_MOVE[`${a}${b}`] ?? 0;
    if (from.suffix === 'dim7' && mod(from.root + 1) === to.root) score += 1.2;
    return score + 0.15 * Math.min(3, from.pcs.filter((pc) => to.pcs.includes(pc)).length);
  };
  const paths = [parsed[0].map((chord) => ({ score: unary(chord), from: -1 }))];
  for (let i = 1; i < parsed.length; i++) {
    paths.push(parsed[i].map((chord) => {
      let best = { score: -Infinity, from: 0 };
      parsed[i - 1].forEach((previous, k) => {
        const score = paths[i - 1][k].score + move(previous, chord);
        if (score > best.score) best = { score, from: k };
      });
      return { score: best.score + unary(chord), from: best.from };
    }));
  }
  const final = paths[paths.length - 1];
  let j = final.reduce((best, path, k) => (path.score > final[best].score ? k : best), 0);
  const result = [];
  for (let i = parsed.length - 1; i >= 0; i--) {
    const names = columns[i].names;
    result[i] = [names[j], ...names.filter((_, k) => k !== j)];
    j = paths[i][j].from;
  }
  return result;
}
