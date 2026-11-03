// Shared browser entry. The host owns markup, styling, controls and defaults.
import './globals.js';
import { createScoreModel } from './score-model.js';
import { initStorage } from './storage.js';
import start from './score-editor.js';

export async function startEditor({ defaultClef = 'treble', saveDelay = 300, ...options } = {}) {
  window.ScoreModel = createScoreModel({ defaultClef });
  await initStorage({ saveDelay });
  if (window.ScoreStore.stored) document.getElementById('scoreStage')?.classList.add('is-loading');
  start(options);
}
