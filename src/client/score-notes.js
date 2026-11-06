// Shared sounding pitches and timing for MIDI export and playback. Times are model divisions.
const SEMITONES = [0, 2, 4, 5, 7, 9, 11];

export function soundingNotes(score, M, selectedVoices, voiceCount = 4) {
  const sounding = [];
  // Cada pentagrama suena en su canal, para que dos notas iguales de los dos no se corten entre si.
  const staves = M.stavesOf(score);
  for (let staff = 0; staff < staves; staff += 1) {
    const tied = new Map(); // altura -> nota que sigue sonando por una ligadura
    let origin = 0;
    M.measures(score, staff).forEach((measure, mi) => {
      const starts = M.onsets(measure);
      const accidentals = new Map();
      // Match the legend's numbering independently on each staff, before filtering notes.
      const included = selectedVoices?.size ? new Set(M.voices(measure).flatMap((voice, k) =>
        selectedVoices.has(k % voiceCount + 1) ? voice.groups.flatMap((group) => group.indices) : [])) : null;
      const order = measure.map((ev, i) => i).sort((a, b) => starts[a] - starts[b]);
      order.forEach((i) => {
        const ev = measure[i];
        if (ev.rest) return;
        if (ev.acc) accidentals.set(ev.n, M.ACCIDENTALS[ev.acc].alter);
        const alter = accidentals.has(ev.n) ? accidentals.get(ev.n) : M.keyAlter(ev.n, score, mi);
        if (included && !included.has(i)) return;
        // `n` ya es la altura que escribe el MusicXML (la que suena), con cualquier clave: el 8 de la clave de guitarra solo cambia el dibujo.
        const midi = 12 * Math.floor(ev.n / 7) + SEMITONES[ev.n % 7] + alter;
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
