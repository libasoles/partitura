// Informacion de un grupo de notas elegidas: nombres con octava y acordes posibles. Solo cuentan las alturas (clases de
// altura), no la alineacion: un arpegio (acorde roto) da el mismo nombre que el acorde escrito en columna.
import { chordNames } from './chord-names.js';

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

// Nombres para buscar en el diccionario: el exacto ("C/E") o, si no esta, el acorde sin bajo ("C").
export function lookupNames(name) {
  return name.includes('/') ? [name, name.split('/')[0]] : [name];
}
