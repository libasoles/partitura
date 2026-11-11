// Shared sounding pitches and timing for MIDI export and playback. Times are model divisions.
const SEMITONES = [0, 2, 4, 5, 7, 9, 11];

// Sounding midi pitch and alteration of every event of one measure (null for rests), in event order.
// Accidentals carry through the measure by start time, like in the engraved score.
// Midi pitch of scale step `n` with a written accidental (or the key's) in measure `mi`.
export function pitchMidi(score, M, n, acc, mi) {
  const alter = acc ? M.ACCIDENTALS[acc].alter : M.keyAlter(n, score, mi);
  return 12 * Math.floor(n / 7) + SEMITONES[n % 7] + alter;
}

export function measurePitches(score, M, measure, mi) {
  const starts = M.onsets(measure);
  const accidentals = new Map();
  const pitches = measure.map(() => null);
  measure.map((_, i) => i).sort((a, b) => starts[a] - starts[b]).forEach((i) => {
    const ev = measure[i];
    if (ev.rest) return;
    if (ev.acc) accidentals.set(ev.n, M.ACCIDENTALS[ev.acc].alter);
    const alter = accidentals.has(ev.n) ? accidentals.get(ev.n) : M.keyAlter(ev.n, score, mi);
    // `n` ya es la altura que escribe el MusicXML (la que suena), con cualquier clave: el 8 de la clave de guitarra solo cambia el dibujo.
    pitches[i] = { midi: 12 * Math.floor(ev.n / 7) + SEMITONES[ev.n % 7] + alter, alter };
  });
  return pitches;
}

export function soundingNotes(score, M, selectedVoices, voiceCount = 4) {
  const sounding = [];
  const barEnds = new Map(); // nota ligada -> fin del compas donde esta su ligadura
  const shift = M.transposeOf(score);
  // Cada pentagrama suena en su canal, para que dos notas iguales de los dos no se corten entre si.
  const staves = M.stavesOf(score);
  for (let staff = 0; staff < staves; staff += 1) {
    const tied = new Map(); // altura -> nota que sigue sonando por una ligadura
    let origin = 0;
    M.measures(score, staff).forEach((measure, mi) => {
      const starts = M.onsets(measure);
      const pitches = measurePitches(score, M, measure, mi);
      // Each notation voice has a legend number (a whole staff in Voces, or the voice itself in a staff with several).
      const included = M.selectedEvents(score, staff, measure, selectedVoices?.size ? selectedVoices : null);
      measure.map((_, i) => i).sort((a, b) => starts[a] - starts[b]).forEach((i) => {
        const ev = measure[i];
        if (ev.rest || (included && !included.has(i))) return;
        const midi = pitches[i].midi + shift;
        const start = origin + starts[i];
        const size = M.length(ev);
        let note = tied.get(midi);
        // Una ligadura sigue en el compas siguiente aunque este no estuviera lleno: ese resto vacio no la corta.
        if (note && (note.end === start || (note.end <= start && start === barEnds.get(note)))) note.end = start + size;
        else sounding.push(note = { midi, start, end: start + size, channel: staff });
        if (ev.tie) {
          barEnds.set(note, origin + M.capacity(score, mi));
          tied.set(midi, note);
        } else tied.delete(midi);
      });
      origin += M.capacity(score, mi);
    });
  }
  return sounding;
}

// Repite las notas segun el orden de los compases (repeticiones, casas, saltos); sin saltos las deja como estan.
export function expandRepeats(score, M, notes, slots) {
  if (slots.every((slot, k) => slot.mi === k)) return notes;
  const origin = [];
  let at = 0;
  slots.length && M.measures(score).forEach((_, mi) => { origin[mi] = at; at += M.capacity(score, mi); });
  const expanded = [];
  for (const note of notes) {
    let piece = null, previous = -2;
    slots.forEach((slot, k) => {
      const from = origin[slot.mi], to = from + (slot.end - slot.start);
      if (note.start >= to || note.end <= from) return;
      const start = slot.start + Math.max(note.start, from) - from, end = slot.start + Math.min(note.end, to) - from;
      // Una nota que sigue en el compas siguiente de la partitura (ligadura) sigue sonando sin volver a atacar.
      if (piece && previous === k - 1 && slots[k - 1].mi + 1 === slot.mi && piece.end === start) piece.end = end;
      else expanded.push(piece = { ...note, start, end });
      previous = k;
    });
  }
  return expanded;
}
