/* staff.js — Renders the empty score once, at build time, with the same Verovio and ScoreModel the editor uses
   in the browser, so the HTML already contains a real staff (crawlers, no-JS visitors and the first paint) and the
   editor only swaps it for the live one. */

import { createRequire } from 'node:module';
import ScoreModel, { createScoreModel } from '../client/score-model.js';

const verovio = createRequire(import.meta.url)('verovio');

const SCALE = 60;
const WIDTH = 940;

const cache = new Map();

// Verovio 6 no longer sets `calledRun`, and onRuntimeInitialized never fires if the wasm finished starting before it
// is assigned (the dev server imports this file well ahead of the first render), so probe by building a toolkit.
function createToolkit(ready) {
  return new Promise((resolve) => {
    const attempt = () => {
      try {
        resolve(new verovio.toolkit());
        return true;
      } catch {
        return false;
      }
    };
    if (!attempt()) ready.onRuntimeInitialized = attempt;
  });
}

// `grandStaff` is the host's choice, the same one it gives the editor: a piano score is drawn with both staves so the
// editor does not change the page height when it takes over.
export async function renderEmptyStaff(ready = verovio.module, score, { grandStaff = false } = {}) {
  const model = grandStaff ? createScoreModel({ grandStaff }) : ScoreModel;
  score ??= model.emptyScore();
  const key = grandStaff + JSON.stringify(score);
  if (cache.has(key)) return cache.get(key);
  const toolkit = await createToolkit(ready);
  toolkit.setOptions({
    scale: SCALE,
    pageWidth: Math.round((WIDTH * 100) / SCALE),
    adjustPageHeight: true,
    breaks: 'encoded',
    header: 'none',
    footer: 'none',
    svgViewBox: true,
    pageMarginLeft: 60,
    pageMarginRight: 60,
    pageMarginTop: 60,
    pageMarginBottom: 60,
    minLastJustification: 0,
    justifyVertically: false,
    spacingSystem: 12,
    mnumInterval: 0,
  });
  toolkit.loadData(model.toMusicXml(score));
  const svg = model.refineTempo(toolkit.renderToSVG(1));
  toolkit.destroy();
  cache.set(key, svg);
  return svg;
}
