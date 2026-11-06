// SF2 PCM zones, selected preset. Generator numbers follow the SoundFont 2.04 specification.
// https://www.synthfont.com/sfspec24.pdf
export function readSoundFont(bytes, context, presetIndex = 0) {
  const view = new DataView(bytes);
  const text = (at, size) => String.fromCharCode(...new Uint8Array(bytes, at, size));
  const u16 = (at) => view.getUint16(at, true);
  const u32 = (at) => view.getUint32(at, true);
  if (text(0, 4) !== 'RIFF' || text(8, 4) !== 'sfbk') throw new Error('Invalid SoundFont');
  const chunks = {};
  function walk(start, end) {
    for (let at = start; at + 8 <= end;) {
      const id = text(at, 4), size = u32(at + 4), data = at + 8;
      if (data + size > end) throw new Error('Truncated SoundFont');
      if (id === 'LIST') walk(data + 4, data + size);
      else chunks[id] = { at: data, size };
      at = data + size + (size & 1);
    }
  }
  walk(12, bytes.byteLength);
  for (const key of ['smpl', 'phdr', 'pbag', 'pgen', 'inst', 'ibag', 'igen', 'shdr']) {
    if (!chunks[key]) throw new Error(`Missing SoundFont chunk: ${key}`);
  }
  function zones(header, stride, index, bags, generators, terminal) {
    const start = u16(chunks[header].at + index * stride + (header === 'phdr' ? 24 : 20));
    const end = u16(chunks[header].at + (index + 1) * stride + (header === 'phdr' ? 24 : 20));
    const result = [];
    let global = {};
    for (let bag = start; bag < end; bag++) {
      const zone = {};
      for (let g = u16(chunks[bags].at + bag * 4); g < u16(chunks[bags].at + (bag + 1) * 4); g++) {
        const at = chunks[generators].at + g * 4;
        zone[u16(at)] = view.getInt16(at + 2, true);
      }
      if (zone[terminal] === undefined) global = zone;
      else result.push({ ...global, ...zone });
    }
    return result;
  }
  const regions = [];
  const decoded = new Map();
  const inRange = (range, key) => range === undefined || (key >= (range & 255) && key <= ((range >>> 8) & 255));
  // Alex choir contains instruments but no presets. Use its first instrument.
  const presets = chunks.phdr.size === 38 ? [{ 41: 0 }] : zones('phdr', 38, presetIndex, 'pbag', 'pgen', 41);
  for (const preset of presets) {
    for (const zone of zones('inst', 22, preset[41], 'ibag', 'igen', 53)) {
      const at = chunks.shdr.at + zone[53] * 46;
      const value = (op, fallback = 0) => (zone[op] ?? fallback) + (preset[op] ?? 0);
      const start = u32(at + 20) + value(0) + value(4) * 32768;
      const end = u32(at + 24) + value(1) + value(12) * 32768;
      const rate = u32(at + 36);
      if (start < 0 || end <= start || end * 2 > chunks.smpl.size || !rate) throw new Error('Invalid SoundFont sample');
      const loopStart = (u32(at + 28) + value(2) + value(45) * 32768 - start) / rate;
      const loopEnd = (u32(at + 32) + value(3) + value(50) * 32768 - start) / rate;
      const bufferKey = `${start}:${end}:${rate}`;
      let buffer;
      regions.push({
        matches: (key) => inRange(zone[43], key) && inRange(preset[43], key) && inRange(zone[44], 100) && inRange(preset[44], 100),
        sample(key) {
          if (!buffer) {
            buffer = decoded.get(bufferKey);
            if (!buffer) {
              buffer = context.createBuffer(1, end - start, rate);
              const pcm = buffer.getChannelData(0);
              for (let i = 0; i < pcm.length; i++) pcm[i] = view.getInt16(chunks.smpl.at + (start + i) * 2, true) / 32768;
              decoded.set(bufferKey, buffer);
            }
          }
          const root = zone[58] ?? view.getUint8(at + 40);
          return { buffer, rate: 2 ** (((key - root) * value(56, 100) + value(51) * 100 + value(52) + view.getInt8(at + 41)) / 1200),
            loop: Boolean((zone[54] ?? 0) & 1) && loopStart >= 0 && loopEnd > loopStart && loopEnd <= buffer.duration,
            loopStart, loopEnd, tone: Math.min(20000, 8.176 * 2 ** (value(8, 13500) / 1200)), volume: 10 ** (-value(48) / 200),
            pan: Math.max(-1, Math.min(1, value(17) / 500)),
          };
        },
      });
    }
  }
  return {
    sample(key) {
      const found = regions.filter((region) => region.matches(key));
      // Older choir patches sometimes restrict their keyboard range. Extend the nearest playable key.
      if (!found.length) {
        for (let distance = 1; distance < 128; distance++) {
          for (const nearest of [key - distance, key + distance]) {
            const matches = regions.filter((region) => nearest >= 0 && nearest <= 127 && region.matches(nearest));
            if (matches.length) return matches.map((region) => region.sample(key));
          }
        }
        throw new Error('SoundFont has no playable regions');
      }
      return found.map((region) => region.sample(key));
    },
  };
}
