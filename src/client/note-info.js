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
