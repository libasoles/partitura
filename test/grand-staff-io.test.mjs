import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreModel } from '../src/client/score-model.js';
import IO from '../src/client/score-io.js';

const G = createScoreModel({ grandStaff: true });
const guitar = createScoreModel({ defaultClef: 'guitar' });

function piano() {
  const score = G.emptyScore();
  score.rows[0][0] = [{ d: 'q', n: 37 }, { d: 'q', n: 39 }, { d: 'h', n: 35 }];
  score.lower = { 0: [{ d: 'h', n: 25 }, { d: 'h', n: 27 }] };
  score.tempo = 90;
  return G.sanitize(score);
}

// Events of a Standard MIDI file: [{ tick, type, channel, a, b }], plus the program changes.
function events(bytes) {
  const out = [];
  let i = 14 + 8;
  let tick = 0, status = 0;
  const end = bytes.length;
  const varLen = () => { let v = 0, b; do { b = bytes[i++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80); return v; };
  while (i < end) {
    tick += varLen();
    if (bytes[i] & 0x80) status = bytes[i++];
    if (status === 0xff) { const type = bytes[i++]; const size = varLen(); out.push({ tick, meta: type, data: [...bytes.slice(i, i + size)] }); i += size; }
    else {
      const kind = status & 0xf0;
      const a = bytes[i++], b = kind === 0xc0 ? 0 : bytes[i++];
      out.push({ tick, kind, channel: status & 0x0f, a, b });
    }
  }
  return out;
}

test('MIDI export plays both staves on their own channel, at the score tempo, with the piano program', () => {
  const list = events(IO.toMidi(piano(), G));
  const on = list.filter((e) => e.kind === 0x90);
  assert.deepEqual([...new Set(on.map((e) => e.channel))].sort(), [0, 1]);
  assert.deepEqual(on.filter((e) => e.channel === 1).map((e) => e.a), [43, 47]);
  assert.equal(on.filter((e) => e.channel === 0).length, 3);
  const tempo = list.find((e) => e.meta === 0x51).data;
  assert.equal(Math.round(60000000 / ((tempo[0] << 16) | (tempo[1] << 8) | tempo[2])), 90);
  assert.deepEqual(list.filter((e) => e.kind === 0xc0).map((e) => [e.channel, e.a]), [[0, 0], [1, 0]]);
});

test('MIDI export of a guitar keeps one channel and the guitar program', () => {
  const score = guitar.emptyScore();
  score.rows[0][0] = [{ d: 'q', n: 30 }];
  const list = events(IO.toMidi(score, guitar));
  assert.deepEqual(list.filter((e) => e.kind === 0xc0).map((e) => [e.channel, e.a]), [[0, 24]]);
  assert.deepEqual([...new Set(list.filter((e) => e.kind === 0x90).map((e) => e.channel))], [0]);
});

test('MIDI import of two parts puts the higher on top; a single part splits at middle C; the tempo is read', () => {
  const back = IO.parseMidi(IO.toMidi(piano(), G).buffer, G);
  assert.equal(back.tempo, 90);
  assert.deepEqual(back.rows[0][0].filter((ev) => !ev.rest).map((ev) => ev.n), [37, 39, 35]);
  assert.deepEqual(back.lower[0].filter((ev) => !ev.rest).map((ev) => ev.n), [25, 27]);

  // One channel only: the split is by pitch.
  const single = G.emptyScore();
  single.rows[0][0] = [{ d: 'q', n: 37 }, { d: 'q', n: 37, at: 24 }];
  single.lower = { 0: [{ d: 'q', n: 25 }, { d: 'q', n: 25, at: 24 }] };
  const flat = new Uint8Array(IO.toMidi(single, G));
  // Rewrite channel 1 as channel 0 so there is one source part.
  for (let i = 22; i < flat.length; i += 1) if ((flat[i] === 0x91 || flat[i] === 0x81)) flat[i] &= 0xf0;
  const merged = IO.parseMidi(flat.buffer, G);
  assert.ok(merged.rows[0][0].some((ev) => ev.n === 37));
  assert.ok(merged.lower[0].some((ev) => ev.n === 25));
});

test('MIDI import into a one-staff host keeps everything in the one staff', () => {
  const midi = IO.toMidi(piano(), G);
  const score = IO.parseMidi(midi.buffer, guitar);
  assert.ok(!score.lower);
  assert.ok(score.rows[0][0].some((ev) => !ev.rest));
});
