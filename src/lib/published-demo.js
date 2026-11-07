import { DOMParser } from 'linkedom';
import { createScoreModel } from '../client/score-model.js';
import ScoreIO from '../client/score-io.js';
import { renderScoreStaff } from './staff.js';

const cache = new Map();

// Only the published catalogue calls this. Keep parsing and engraving shared with the editor,
// and reuse the result across translations without changing the process's DOM globals.
export function renderDemo(source) {
  if (!cache.has(source)) cache.set(source, (async () => {
    const model = createScoreModel({ grandStaff: true, choir: true });
    const score = ScoreIO.parseMusicXml(source, model, new DOMParser());
    score.tools = { repeats: false, dynamics: false, voices: true, playback: true, intervals: true };
    model.setSound(score, 'mm');
    const svg = await renderScoreStaff(score, { model, intervals: true });
    return { score, svg };
  })());
  return cache.get(source);
}
