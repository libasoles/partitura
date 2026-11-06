// Possible chord names for the notes sounding together. Pitch classes only: doublings and octaves do not matter.
// Each shape lists its intervals above the root; sevenths with a perfect fifth may omit it.
const SHAPES = [
  ['', [0, 4, 7]], ['m', [0, 3, 7]], ['dim', [0, 3, 6]], ['aug', [0, 4, 8]],
  ['7', [0, 4, 7, 10]], ['maj7', [0, 4, 7, 11]], ['m7', [0, 3, 7, 10]], ['m7b5', [0, 3, 6, 10]],
  ['dim7', [0, 3, 6, 9]], ['m(maj7)', [0, 3, 7, 11]], ['6', [0, 4, 7, 9]], ['m6', [0, 3, 7, 9]],
  ['sus4', [0, 5, 7]], ['sus2', [0, 2, 7]],
];
const LETTERS = 'CDEFGAB';
const SHARPS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const pitchClass = (midi) => ((midi % 12) + 12) % 12;

// `notes`: [{ midi, n, alter }] with `n` the diatonic step. Spelling follows the written notes.
// Returns every name that fits, root position first.
export function chordNames(notes) {
  const spelled = new Map(); // pitch class -> name as written
  [...notes].sort((a, b) => a.midi - b.midi).forEach((note) => {
    const pc = pitchClass(note.midi);
    if (spelled.has(pc)) return;
    const accidental = ['bb', 'b', '', '#', '##'][note.alter + 2];
    spelled.set(pc, accidental === undefined ? SHARPS[pc] : LETTERS[note.n % 7] + accidental);
  });
  if (spelled.size < 3) return [];
  const bass = pitchClass(Math.min(...notes.map((note) => note.midi)));
  const matches = (pcs) => pcs.size === spelled.size && [...spelled.keys()].every((pc) => pcs.has(pc));
  const found = [];
  SHAPES.forEach(([suffix, shape], order) => {
    spelled.forEach((rootName, root) => {
      const pcs = shape.map((step) => (root + step) % 12);
      const seventh = shape.includes(7) && (shape.includes(10) || shape.includes(11));
      const withoutFifth = new Set(pcs.filter((_, k) => !seventh || shape[k] !== 7));
      if (!matches(new Set(pcs)) && !(seventh && matches(withoutFifth))) return;
      found.push({ name: rootName + suffix + (root === bass ? '' : '/' + spelled.get(bass)), inverted: root !== bass, order });
    });
  });
  found.sort((a, b) => a.inverted - b.inverted || a.order - b.order);
  return [...new Set(found.map((chord) => chord.name))];
}
