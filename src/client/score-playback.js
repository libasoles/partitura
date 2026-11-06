import { soundingNotes } from './score-notes.js';

// Per-sound envelope: `attack` fades in, `release` rings past the note's end so consecutive notes overlap (legato).
// Na and La reuse the Ah samples and open a low-pass filter from `open` = [cutoff Hz, seconds] to imitate the consonant.
const PLUCKED = { attack: 0.005, release: 0.03, within: true };
const CHOIR = {
  ah: { file: 'choir-ah', attack: 0.09, release: 0.14 },
  oh: { file: 'choir-oh', attack: 0.09, release: 0.14 },
  na: { file: 'choir-ah', attack: 0.04, release: 0.12, open: [380, 0.14] },
  la: { file: 'choir-ah', attack: 0.03, release: 0.12, open: [1100, 0.08] },
  // `tone` is a fixed low-pass cutoff: a neutral, darker vowel (Uh) and a closed-mouth hum (Mm, from the Oh samples).
  uh: { file: 'choir-ah', attack: 0.07, release: 0.14, tone: 1500 },
  mm: { file: 'choir-oh', attack: 0.1, release: 0.16, tone: 550 },
};

// This module and the instrument samples are requested only by the play gesture.
export function createPlayer(context, vendorUrl, onEnded) {
  const instruments = new Map();
  const buffers = new Map();
  const sources = new Set();
  const output = context.createGain();
  output.gain.value = 0.35;
  output.connect(context.destination);
  let timer, position = 0, origin = 0, playing = false;

  async function load(instrument, midi) {
    if (!instruments.has(instrument)) {
      const request = fetch(vendorUrl(`audio/fluid-r3-v1/${instrument}.json`))
        .then((response) => {
          if (!response.ok) throw new Error('Sound download failed');
          return response.json();
        }).catch((error) => { instruments.delete(instrument); throw error; });
      instruments.set(instrument, request);
    }
    const key = `${instrument}:${midi}`;
    if (!buffers.has(key)) {
      const request = (async () => {
        const samples = await instruments.get(instrument);
        const name = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'][midi % 12] + (Math.floor(midi / 12) - 1);
        const data = samples[name];
        if (!data) throw new Error(`Missing sample: ${name}`);
        const bytes = Uint8Array.from(atob(data.split(',')[1]), (c) => c.charCodeAt(0));
        return context.decodeAudioData(bytes.buffer);
      })().catch((error) => { buffers.delete(key); throw error; });
      buffers.set(key, request);
    }
    return buffers.get(key);
  }

  function silence() {
    clearTimeout(timer);
    for (const source of sources) source.stop();
    sources.clear();
    playing = false;
  }

  return {
    get position() { return playing ? Math.max(position, context.currentTime - origin) : position; },
    async prepare(score, M, selectedVoices, voiceCount = 4) {
      const seconds = 60 / (score.tempo || 120) / M.DIVISIONS;
      const notes = soundingNotes(score, M, selectedVoices, voiceCount).map((note) => ({ ...note, start: note.start * seconds, end: note.end * seconds }));
      const kind = M.instrumentOf(score);
      const shape = kind === 'voices' ? CHOIR[M.soundOf(score)] : PLUCKED;
      const instrument = { guitar: 'guitar', voices: shape.file }[kind] || 'piano';
      const samples = new Map(await Promise.all([...new Set(notes.map((note) => note.midi))].map(async (midi) => {
        // The soundfont covers A0–C8. Transpose the nearest boundary sample for other pitches.
        const sample = Math.max(21, Math.min(108, midi));
        return [midi, { buffer: await load(instrument, sample), rate: 2 ** ((midi - sample) / 12) }];
      })));
      // The editor reserves blank rows for writing; finish at the last written measure.
      const measures = M.measures(score);
      let last = -1;
      for (let staff = 0; staff < M.stavesOf(score); staff += 1) {
        M.measures(score, staff).forEach((measure, mi) => { if (measure.length) last = Math.max(last, mi); });
      }
      const duration = measures.slice(0, last + 1).reduce((sum, _, mi) => sum + M.capacity(score, mi) * seconds, 0);
      return { notes, samples, duration, shape };
    },
    play({ notes, samples, duration, shape }, from) {
      silence();
      if (from !== undefined) position = Math.max(0, Math.min(duration, from));
      if (!notes.length) { position = 0; onEnded(); return; }
      origin = context.currentTime + 0.03 - position;
      playing = true;
      for (const note of notes) {
        if (note.end <= position) continue;
        const sample = samples.get(note.midi);
        const offset = Math.max(0, position - note.start) * sample.rate;
        if (offset >= sample.buffer.duration) continue;
        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = sample.buffer;
        source.playbackRate.value = sample.rate;
        const start = origin + Math.max(position, note.start);
        const end = origin + note.end;
        const attack = Math.min(shape.attack, (end - start) / 2);
        // Plucked sounds fade inside the note; the choir holds it and lets the release ring into the next.
        const fadeStart = shape.within ? Math.max(start + attack, end - shape.release) : end;
        const fadeEnd = shape.within ? end : end + shape.release;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(1, start + attack);
        gain.gain.setValueAtTime(1, fadeStart);
        gain.gain.linearRampToValueAtTime(0, fadeEnd);
        let filter;
        if (shape.open || shape.tone) {
          filter = context.createBiquadFilter();
          filter.type = 'lowpass';
          const cutoff = shape.tone || 12000;
          filter.frequency.setValueAtTime(shape.open ? shape.open[0] : cutoff, start);
          if (shape.open) filter.frequency.exponentialRampToValueAtTime(cutoff, start + shape.open[1]);
          source.connect(filter);
          filter.connect(gain);
        } else source.connect(gain);
        gain.connect(output);
        source.start(start, offset);
        source.stop(fadeEnd + 0.01);
        sources.add(source);
        source.onended = () => { sources.delete(source); source.disconnect(); filter?.disconnect(); gain.disconnect(); };
      }
      timer = setTimeout(() => { silence(); position = 0; onEnded(); }, Math.max(0, origin + duration - context.currentTime) * 1000);
    },
    pause() {
      if (playing) position = Math.max(position, context.currentTime - origin);
      silence();
    },
    stop() { silence(); position = 0; },
  };
}
