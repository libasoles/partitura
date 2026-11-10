// Shared sounding pitches and timing for MIDI export and playback. Times are model divisions.
const SEMITONES = [0, 2, 4, 5, 7, 9, 11];

// Sounding midi pitch and alteration of every event of one measure (null for rests), in event order.
// Accidentals carry through the measure by start time, like in the engraved score.
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
        if (note && note.end === start) note.end = start + size;
        else sounding.push(note = { midi, start, end: start + size, channel: staff });
        if (ev.tie) tied.set(midi, note);
        else tied.delete(midi);
      });
      origin += M.capacity(score, mi);
    });
  }
  return sounding;
}
