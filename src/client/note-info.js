// Informacion de un grupo de notas elegidas: nombres con octava y acordes posibles. Solo cuentan las alturas (clases de
// altura), no la alineacion: un arpegio (acorde roto) da el mismo nombre que el acorde escrito en columna.
import { chordNames } from './chord-names.js';
import { pickChords } from './chord-context.js';

const LETTERS = 'CDEFGAB';
const ACCIDENTAL = { '-2': '𝄫', '-1': '♭', 0: '', 1: '♯', 2: '𝄪' };

// `notes`: [{ n, midi, alter }] (n: paso diatonico, como en el modelo). Devuelve las notas de grave a agudo, sin repetir
// la misma altura escrita, y los nombres de acorde si hay tres o mas clases de altura distintas.
export function noteInfo(notes) {
  const seen = new Set();
  const list = notes
    .map(({ n, midi, alter }) => ({ n, midi, alter, label: LETTERS[n % 7] + (ACCIDENTAL[alter] ?? '') + (Math.floor(n / 7) - 1) }))
    .sort((a, b) => a.midi - b.midi || a.n - b.n)
    .filter((note) => !seen.has(note.label) && seen.add(note.label));
  const classes = new Set(notes.map(({ midi }) => ((midi % 12) + 12) % 12));
  return { notes: list, classes: classes.size, chords: classes.size >= 3 ? chordNames(notes) : [] };
}

const SIMPLE_SEMITONES = [0, 2, 4, 5, 7, 9, 11];
const PERFECT = new Set([0, 3, 4]); // unisono, cuarta y quinta (por paso de escala dentro de la octava)

// Intervalo entre dos notas ({ n, midi }): `number` (1 unisono, 2 segunda, ... 8 octava, 9 novena...), `quality`
// ('perfect' | 'major' | 'minor' | 'augmented' | 'diminished' o null si no tiene nombre habitual) y los semitonos.
// El numero sale de los pasos de escala escritos y la calidad de los semitonos, asi que do-fa# es una cuarta aumentada.
export function intervalOf(a, b) {
  const [low, high] = a.n <= b.n ? [a, b] : [b, a];
  const steps = high.n - low.n;
  const semitones = high.midi - low.midi;
  const simple = steps % 7;
  const octaves = Math.floor(steps / 7);
  const diff = semitones - 12 * octaves - SIMPLE_SEMITONES[simple];
  let quality = null;
  if (PERFECT.has(simple)) quality = { 0: 'perfect', 1: 'augmented', '-1': 'diminished' }[diff] ?? null;
  else quality = { 0: 'major', '-1': 'minor', 1: 'augmented', '-2': 'diminished' }[diff] ?? null;
  return { low, high, number: steps + 1, quality, semitones };
}

// Todos los intervalos entre las notas (cada par una vez), de la nota mas grave a la mas aguda.
export function allIntervals(notes) {
  const sorted = [...notes].sort((a, b) => a.n - b.n || a.midi - b.midi);
  return sorted.flatMap((low, i) => sorted.slice(i + 1).map((high) => intervalOf(low, high)));
}

// Los mismos intervalos en bloques, cada uno de arriba hacia abajo (el mas grave queda abajo, como en el pentagrama):
// primero las notas contiguas (do-mi, mi-sol, sol-si) y despues, por cada nota grave, su distancia con las que no son
// su vecina (do-sol, do-si; luego mi-si).
export function intervalBlocks(notes) {
  const sorted = [...notes].sort((a, b) => a.n - b.n || a.midi - b.midi);
  const blocks = [sorted.slice(1).map((high, i) => intervalOf(sorted[i], high))];
  sorted.forEach((low, i) => blocks.push(sorted.slice(i + 2).map((high) => intervalOf(low, high))));
  return blocks.filter((block) => block.length).map((block) => block.reverse());
}

// Reordena los nombres posibles de `info` segun el acorde de antes y el de despues (`before`/`after`: { names, pcs } o null).
// Usa la misma eleccion por contexto que los nombres de acorde de la partitura, con la tonalidad `key` ({ tonic, mode }) de
// toda ella. Devuelve los nombres, el elegido primero, y el acorde vecino usado de cada lado.
export function rankByContext(info, before, after, fifths, key) {
  const used = { before: before ? before.names[0] : null, after: after ? after.names[0] : null };
  if (info.chords.length < 2 || (!before && !after)) return { chords: info.chords, ...used };
  const own = { names: info.chords, pcs: [...new Set(info.notes.map(({ midi }) => ((midi % 12) + 12) % 12))] };
  const columns = [before, own, after].filter(Boolean);
  return { chords: pickChords(columns, fifths, key)[columns.indexOf(own)], ...used };
}

// Nombres para buscar en el diccionario: el exacto ("C/E") o, si no esta, el acorde sin bajo ("C").
export function lookupNames(name) {
  return name.includes('/') ? [name, name.split('/')[0]] : [name];
}
