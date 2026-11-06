import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ARCHIVE_CHOIRS } from '../src/client/choir-sounds.js';
import { readSoundFont } from '../src/client/soundfont.js';
import { createScoreModel } from '../src/client/score-model.js';

const context = {
  createBuffer(channels, length, sampleRate) {
    const pcm = new Float32Array(length);
    return { duration: length / sampleRate, getChannelData: () => pcm };
  },
};

test('the complete 28-font archive has distinct persistent IDs', () => {
  assert.equal(ARCHIVE_CHOIRS.length, 28);
  assert.equal(new Set(ARCHIVE_CHOIRS.map(({ id }) => id)).size, 28);
  const M = createScoreModel({ choir: true, grandStaff: true });
  for (const { id } of ARCHIVE_CHOIRS) {
    const score = M.emptyScore();
    M.setInstrument(score, 'voices');
    assert.equal(M.setSound(score, id), true);
    assert.equal(M.soundOf(M.sanitize(score)), id);
  }
});

for (const { file, name, preset } of ARCHIVE_CHOIRS) test(`${name}: real PCM, playable range, tuning and valid sustain loops`, () => {
  const bytes = readFileSync(new URL(`../public/vendor/audio/zanderjaz-v1/${file}`, import.meta.url));
  const font = readSoundFont(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), context, preset);
  for (const key of [21, 36, 48, 60, 72, 84, 108]) {
    const layers = font.sample(key);
    assert.ok(layers.length);
    assert.ok(layers.some((layer) => layer.buffer.getChannelData(0).some((value) => Math.abs(value) > 0.001)));
    for (const layer of layers) {
      assert.ok(layer.rate > 0 && Number.isFinite(layer.rate));
      assert.ok(layer.volume > 0 && Number.isFinite(layer.volume));
      if (layer.loop) assert.ok(layer.loopStart >= 0 && layer.loopEnd > layer.loopStart && layer.loopEnd <= layer.buffer.duration);
    }
  }
  // The same zone transposes one semitone without changing sample length or its loop.
  const a = font.sample(60)[0], b = font.sample(61)[0];
  if (a.buffer === b.buffer) assert.ok(Math.abs(b.rate / a.rate - 2 ** (1 / 12)) < 0.001);
});

test('rejects a non-SF2 download', () => {
  assert.throws(() => readSoundFont(new TextEncoder().encode('<html>error</html>').buffer, context), /Invalid SoundFont/);
});
