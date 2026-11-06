import { soundingNotes } from './score-notes.js';

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
      const instrument = { guitar: 'guitar', voices: `choir-${M.soundOf(score)}` }[M.instrumentOf(score)] || 'piano';
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
      return { notes, samples, duration };
    },
    play({ notes, samples, duration }, from) {
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
        source.connect(gain);
        gain.connect(output);
        const start = origin + Math.max(position, note.start);
        const end = origin + note.end;
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(1, start + Math.min(0.005, (end - start) / 2));
        gain.gain.setValueAtTime(1, Math.max(start + 0.005, end - 0.03));
        gain.gain.linearRampToValueAtTime(0, end);
        source.start(start, offset);
        source.stop(end + 0.01);
        sources.add(source);
        source.onended = () => { sources.delete(source); source.disconnect(); gain.disconnect(); };
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
