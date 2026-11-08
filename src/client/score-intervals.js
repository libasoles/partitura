import { chordNames } from './chord-names.js';
import { estimateKey, pickChords } from './chord-context.js';
import { measurePitches } from './score-notes.js';

// Diatonic intervals between neighbouring sounding pitches. Piano: independently on each staff. Voices (choir):
// each staff is one line, so the intervals are taken between the staves.
export function intervalColumns(measure, M, selectedVoices, bass = false) {
  const starts = M.onsets(measure);
  const included = selectedVoices ? new Set(M.voices(measure).flatMap((voice, k) =>
    selectedVoices.has(k % 4 + 1) ? voice.groups.flatMap((group) => group.indices) : [])) : null;
  const selected = (i) => !included || included.has(i);
  const times = [...new Set(starts.filter((_, i) => selected(i) && !measure[i].rest))].sort((a, b) => a - b);
  return times.flatMap((at) => {
    const sounding = measure.map((note, i) => ({ note, i }))
      .filter(({ note, i }) => selected(i) && !note.rest && starts[i] <= at && starts[i] + M.length(note) > at)
      .sort((a, b) => b.note.n - a.note.n || a.i - b.i);
    if (sounding.length < 2) return [];
    const intervals = labels(sounding, bass);
    return [withSounding({ at, indices: measure.flatMap((_, i) => selected(i) && starts[i] === at ? [i] : []), intervals }, sounding.map(({ note, i }) => ({ note, i, staff: 0 })))];
  });
}

// The notes behind a column (for chord names) travel with it without being part of its shape.
const withSounding = (column, sounding) => Object.defineProperty(column, 'sounding', { value: sounding });

// `sounding` goes from the highest note down. `reference` picks what each label measures:
//   false  neighbouring voices: each note against the one below it (one label per note except the lowest)
//   true   the bass: each note against the lowest (same)
//   number the tonic (letter index, C = 0): every note, the lowest included, as a scale degree I-VII
const labels = (sounding, reference) => {
  if (typeof reference === 'number') return sounding.map(({ note }) => roman((((note.n - reference) % 7) + 7) % 7 + 1));
  const low = sounding[sounding.length - 1].note.n;
  return sounding.slice(0, -1).map(({ note }, i) => roman(reference ? note.n - low + 1 : note.n - sounding[i + 1].note.n + 1));
};

const LETTERS = 'CDEFGAB';
const FIFTHS_LETTERS = 'FCGDAEB';
const PITCH = [0, 2, 4, 5, 7, 9, 11];
const mod12 = (n) => ((n % 12) + 12) % 12;

// A tonic as the editor stores it ("Bb", "F#m"): its letter (C = 0), pitch class and mode.
export function parseTonic(name) {
  const [, letter, accidental, minor] = /^([A-G])(#|b)?(m?)$/.exec(name);
  return { name, letter: LETTERS.indexOf(letter), tonic: mod12(PITCH[LETTERS.indexOf(letter)] + (accidental === '#' ? 1 : accidental === 'b' ? -1 : 0)), mode: minor ? 'min' : 'maj' };
}

// Spells a tonic (pitch class and mode) the way the key signature would: the spelling whose signature is closest to `fifths`.
export function spellTonic(tonic, mode, fifths = 0) {
  const home = mod12(tonic * 7);
  const position = [home - 12, home, home + 12].reduce((best, p) => {
    const distance = Math.abs((mode === 'min' ? p - 3 : p) - fifths);
    const bestDistance = Math.abs((mode === 'min' ? best - 3 : best) - fifths);
    return distance < bestDistance || (distance === bestDistance && Math.abs(p) < Math.abs(best)) ? p : best;
  });
  const accidental = Math.floor((position + 1) / 7);
  return FIFTHS_LETTERS[(((position + 1) % 7) + 7) % 7] + (accidental > 0 ? '#'.repeat(accidental) : 'b'.repeat(-accidental)) + (mode === 'min' ? 'm' : '');
}

// The tonic the user fixed or, failing that, the estimate over the whole score (same profiles as the chord names).
// `detected` tells which one it is, and `detectedName` is the estimate even when the user overrode it.
export function scoreKey(score, M) {
  const fifths = M.fifthsOf(score);
  const histogram = Array(12).fill(0);
  let count = 0;
  let first = null;
  let last = null;
  let origin = 0;
  M.measures(score).forEach((_, mi) => {
    const columns = new Map();
    for (let staff = 0; staff < M.stavesOf(score); staff++) {
      const measure = M.measures(score, staff)[mi] || [];
      const starts = M.onsets(measure);
      const pitches = measurePitches(score, M, measure, mi);
      measure.forEach((note, i) => { if (!note.rest) columns.set(`${staff}:${starts[i]}`, [...(columns.get(`${staff}:${starts[i]}`) || []), { midi: pitches[i].midi, at: origin + starts[i] }]); });
    }
    columns.forEach((notes) => {
      count += 1;
      new Set(notes.map(({ midi }) => mod12(midi))).forEach((pc) => { histogram[pc] += 1; });
      const bass = notes.reduce((a, b) => (b.midi < a.midi ? b : a));
      if (!first || bass.at < first.at) first = bass;
      if (!last || bass.at >= last.at) last = bass;
    });
    origin += M.capacity(score, mi);
  });
  const estimate = count ? estimateKey({ histogram, count, first: mod12(first.midi), last: mod12(last.midi) }, fifths) : { tonic: mod12(fifths * 7), mode: 'maj' };
  const detectedName = spellTonic(estimate.tonic, estimate.mode, fifths);
  const fixed = M.tonicOf(score);
  const name = fixed || detectedName;
  return { ...parseTonic(name), detected: !fixed, detectedName };
}

// What the interval labels of this score measure: see `labels`.
export const intervalReference = (score, M) => {
  const mode = M.intervalModeOf(score);
  return mode === 'tonic' ? scoreKey(score, M).letter : mode === 'bass';
};

// Roman numerals show the distance between notes (I = unison, III = third, VIII = octave).
const roman = (value) => {
  let label = '';
  for (const [number, numeral] of [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) {
    while (value >= number) {
      label += numeral;
      value -= number;
    }
  }
  return label;
};

// Whether the score has any simultaneous notes for the toggle to label.
export function hasIntervals(score, M, selectedVoices) {
  if (M.instrumentOf(score) === 'voices') return M.measures(score).some((_, mi) => choirColumns(score, mi, M, selectedVoices).length);
  return M.measures(score).some((measure, mi) => [measure, ...(M.stavesOf(score) > 1 ? [score.lower?.[mi] || []] : [])].some((lane) => intervalColumns(lane, M, selectedVoices).length));
}

// Choir columns: every sounding note of every visible staff at each onset, highest first. `n` is already the
// sounding diatonic pitch, so staves with different clefs compare directly. The mark hangs from the first staff
// that starts a note at that time.
export function choirColumns(score, mi, M, selectedVoices, bass = false) {
  const lanes = Array.from({ length: M.stavesOf(score) }, (_, staff) => {
    const measure = M.measures(score, staff)[mi] || [];
    return { staff, measure, starts: M.onsets(measure) };
  }).filter(({ staff }) => !selectedVoices || selectedVoices.has(staff + 1));
  const times = [...new Set(lanes.flatMap(({ measure, starts }) => starts.filter((_, i) => !measure[i].rest)))].sort((a, b) => a - b);
  return times.flatMap((at) => {
    const sounding = lanes.flatMap(({ staff, measure, starts }) => measure
      .map((note, i) => ({ note, i, staff }))
      .filter(({ note, i }) => !note.rest && starts[i] <= at && starts[i] + M.length(note) > at))
      .sort((a, b) => b.note.n - a.note.n || a.staff - b.staff || a.i - b.i);
    if (sounding.length < 2) return [];
    const owner = lanes.find(({ measure, starts }) => measure.some((note, i) => !note.rest && starts[i] === at));
    if (!owner) return [];
    const intervals = labels(sounding, bass);
    return [withSounding({ at, staff: owner.staff, indices: owner.measure.flatMap((_, i) => owner.starts[i] === at ? [i] : []), intervals }, sounding)];
  });
}

// Possible chord names of a column, from the pitches that sound in it (any staff).
function columnChords(score, mi, M, column) {
  const cache = new Map();
  const pitches = (staff) => {
    if (!cache.has(staff)) cache.set(staff, measurePitches(score, M, M.measures(score, staff)[mi] || [], mi));
    return cache.get(staff);
  };
  const notes = column.sounding.map(({ note, i, staff }) => ({ midi: pitches(staff)[i].midi, alter: pitches(staff)[i].alter, n: note.n }));
  return { names: chordNames(notes), pcs: [...new Set(notes.map(({ midi }) => ((midi % 12) + 12) % 12))] };
}

// Chord names to show above each column with at least three sounding voices. `names[0]` is the one shown, picked from the
// candidates by the harmony of the whole line (docs/armonia-contexto.md); the rest are the alternatives.
export function chordMarks(score, M, selectedVoices) {
  const bass = intervalReference(score, M);
  const marks = [];
  M.measures(score).forEach((measure, mi) => {
    const columns = M.instrumentOf(score) === 'voices'
      ? choirColumns(score, mi, M, selectedVoices, bass)
      : Array.from({ length: M.stavesOf(score) }, (_, staff) => intervalColumns(staff ? score.lower?.[mi] || [] : measure, M, selectedVoices, bass)
        .map((column) => ({ staff, indices: column.indices, at: column.at, sounding: column.sounding.map((entry) => ({ ...entry, staff })) }))).flat();
    columns.forEach((column) => {
      const { names, pcs } = columnChords(score, mi, M, column);
      if (names.length) marks.push({ mi, at: column.at, staff: M.instrumentOf(score) === 'voices' ? 0 : column.staff ?? 0, id: `${M.ID_PREFIX[column.staff ?? 0]}${mi}-${column.indices[0]}`, names, pcs });
    });
  });
  // One harmonic line per staff (piano); in Voces the staves are the voices of one texture.
  const lines = new Map();
  marks.forEach((mark) => {
    const key = M.instrumentOf(score) === 'voices' ? 0 : mark.staff;
    lines.set(key, [...(lines.get(key) || []), mark]);
  });
  const fixed = M.tonicOf(score) ? scoreKey(score, M) : null;
  lines.forEach((line) => pickChords(line, M.fifthsOf(score), fixed).forEach((names, k) => { line[k].names = names; }));
  return marks;
}

// Editor-only directions let the engraver reserve room above beams and high notes.
// The stored score and the exported MusicXML keep their original notation.
export function withIntervals(xml, score, M, selectedVoices, { intervals = true, chords = false } = {}) {
  const marks = new Map();
  const bass = intervalReference(score, M);
  const upper = M.measures(score);
  if (M.instrumentOf(score) === 'voices') {
    upper.forEach((_, mi) => choirColumns(score, mi, M, selectedVoices, bass).forEach((column) => {
      // Keep the onset anchor in its own voice, but reserve space above the first staff.
      const mark = { staff: 0, intervals: column.intervals, done: false };
      column.indices.forEach((i) => marks.set(`${M.ID_PREFIX[column.staff]}${mi}-${i}`, mark));
    }));
  } else {
    for (let staff = 0; staff < M.stavesOf(score); staff++) {
      upper.forEach((measure, mi) => {
        intervalColumns(staff ? score.lower?.[mi] || [] : measure, M, selectedVoices, bass).forEach((column) => {
          const mark = { staff, intervals: column.intervals, done: false };
          column.indices.forEach((i) => marks.set(`${staff ? 'l' : 'e'}${mi}-${i}`, mark));
        });
      });
    }
  }
  const names = new Map(chords ? chordMarks(score, M, selectedVoices).map((mark) => [mark.id, mark]) : []);
  const direction = (mark, text, family) => `<direction placement="above"><direction-type><words font-family="${family}" font-style="normal" justify="center">${text}</words></direction-type>${M.stavesOf(score) > 1 ? `<staff>${mark.staff + 1}</staff>` : ''}</direction>`;
  return xml.replace(/<note id="([elpq]\d+-\d+)">/g, (note, id) => {
    const mark = intervals ? marks.get(id) : null;
    const chord = names.get(id);
    let out = '';
    if (mark && !mark.done) {
      mark.done = true;
      out += direction(mark, mark.intervals.join('\n'), 'PartituraIntervals');
    }
    if (chord) out += direction(chord, chord.names[0], 'PartituraChordNames');
    return out + note;
  });
}
