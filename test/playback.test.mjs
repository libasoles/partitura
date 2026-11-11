import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreModel } from '../src/client/score-model.js';
import { soundingNotes } from '../src/client/score-notes.js';

const M = createScoreModel({ grandStaff: true });

test('voice filtering uses the legend on both staves and preserves timing, ties and accidentals', () => {
  const score = M.emptyScore();
  score.rows = [[[
    { d: 'q', n: 35, acc: '#', v: 1, at: 0 },
    { d: 'q', rest: true, v: 2, at: 0 },
    { d: 'h', n: 35, v: 2, at: M.DIVISIONS, tie: true },
    { d: 'q', n: 35, v: 2, at: 3 * M.DIVISIONS },
  ]]];
  score.lower = { 0: [
    { d: 'w', n: 28, v: 1, at: 0 },
    { d: 'q', rest: true, v: 2, at: 0 },
    { d: 'h', n: 30, v: 2, at: M.DIVISIONS },
  ] };
  assert.deepEqual(soundingNotes(score, M, new Set([2])), [
    { midi: 61, start: M.DIVISIONS, end: 4 * M.DIVISIONS, channel: 0 },
    { midi: 52, start: M.DIVISIONS, end: 3 * M.DIVISIONS, channel: 1 },
  ]);
  assert.deepEqual(soundingNotes(score, M, new Set()), soundingNotes(score, M));
  assert.deepEqual(soundingNotes(score, M, new Set([1, 2])), soundingNotes(score, M));
  assert.deepEqual(soundingNotes(score, M, new Set([4])), []);
});

test('choir legend filters one staff per voice, regardless of its local notation voices', () => {
  const C = createScoreModel({ grandStaff: true, choir: true });
  const score = C.emptyScore();
  C.setInstrument(score, 'voices');
  score.rows = [[[{ d: 'w', n: 35 }]]];
  score.lower = { 0: [{ d: 'w', n: 28 }] };
  score.lower2 = { 0: [{ d: 'w', n: 21 }] };
  const all = soundingNotes(score, C);
  for (let voice = 1; voice <= 3; voice++) {
    assert.deepEqual(soundingNotes(score, C, new Set([voice])), all.filter((note) => note.channel === voice - 1));
  }
  assert.deepEqual(soundingNotes(score, C, new Set()), all);
  assert.deepEqual(soundingNotes(score, C, new Set([1, 3])), all.filter((note) => note.channel !== 1));
  assert.deepEqual(soundingNotes(score, C, new Set([4])), []);
});

test('playback timing respects rests, accidentals, simultaneous staves and tied notes', () => {
  const score = M.emptyScore();
  score.rows = [[
    [{ d: 'q', rest: true }, { d: 'q', n: 35, acc: '#' }, { d: 'h', n: 35, tie: true }],
    [{ d: 'h', n: 35 }, { d: 'h', n: 36 }],
  ]];
  score.lower = { 0: [{ d: 'w', n: 28 }] };
  const notes = soundingNotes(score, M);
  assert.deepEqual(notes.map(({ midi, start, end, channel }) => [midi, start / M.DIVISIONS, end / M.DIVISIONS, channel]), [
    [61, 1, 2, 0], [61, 2, 4, 0], [60, 4, 6, 0], [62, 6, 8, 0], [48, 0, 4, 1],
  ]);
  // Explicitly tie the same pitch across the barline.
  score.rows[0][1][0].acc = '#';
  assert.equal(soundingNotes(score, M)[1].end / M.DIVISIONS, 6);
});

test('playback tool is kept when saving/sanitizing a score', () => {
  const score = M.emptyScore();
  M.setTool(score, 'playback', true);
  assert.equal(M.sanitize(score).tools.playback, true);
});

test('choir and plucked sounds have twice the gain in Voices and as direct instruments', async () => {
  const { createPlayer } = await import('../src/client/score-playback.js');
  const C = createScoreModel({ grandStaff: true, choir: true });
  const score = C.emptyScore();
  C.setInstrument(score, 'voices');
  score.rows = [[[{ d: 'w', n: 35 }]]];
  const peaks = [], files = [];
  const context = {
    currentTime: 0, destination: {},
    createGain: () => ({ gain: { value: 0, setValueAtTime() {}, linearRampToValueAtTime(value) { if (value) peaks.push(value); } }, connect() {}, disconnect() {} }),
    createBufferSource: () => ({ playbackRate: {}, connect() {}, disconnect() {}, start() {}, stop() {} }),
    createBiquadFilter: () => ({ frequency: { setValueAtTime() {} }, connect() {}, disconnect() {} }),
    decodeAudioData: async () => ({ duration: 30 }),
  };
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    files.push(url);
    return { ok: true, json: async () => ({ C4: 'data:audio/mp3;base64,AA==' }) };
  };
  try {
    const player = createPlayer(context, (path) => path, () => {});
    for (const id of ['ah', 'oh', 'mm', 'guitar', 'piano']) {
      C.setSound(score, id);
      const track = await player.prepare(score, C);
      peaks.length = 0;
      player.play(track);
      player.stop();
      assert.deepEqual(peaks, [2]);
      assert.equal(Boolean(track.shape.within), id === 'guitar' || id === 'piano');
    }
    for (const id of ['guitar', 'piano']) {
      C.setInstrument(score, id);
      const track = await player.prepare(score, C);
      peaks.length = 0;
      player.play(track);
      player.stop();
      assert.deepEqual(peaks, [2]);
      assert.equal(track.shape.within, true);
    }
    assert.ok(files.some((url) => url.endsWith('/guitar.json')));
    assert.ok(files.some((url) => url.endsWith('/piano.json')));
  } finally { globalThis.fetch = previousFetch; }
});

test('a tie into the next bar keeps sounding as one note when the bar is not full', () => {
  const s = M.emptyScore();
  s.meter = '6/8';
  s.rows[0][0] = [{ d: 'e', rest: true }, { d: 'e', n: 35, tie: true }];
  s.rows[0][1] = [{ d: 'h', n: 35 }];
  assert.equal(soundingNotes(M.sanitize(s), M).length, 1);
});
