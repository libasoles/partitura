// Shared browser entry. The host owns markup, styling, controls and defaults.
import './globals.js';
import { createScoreModel } from './score-model.js';
import { initStorage } from './storage.js';
import start from './score-editor.js';
import { isPro } from './pro.js';

export async function startEditor({ defaultClef = 'treble', saveDelay = 300, ...options } = {}) {
  // The grand staff comes with the settings (instrument choice): a host that leaves them off keeps one staff.
  // Voices (choir) is a Pro feature: it needs the settings and #pro in the URL.
  window.ScoreModel = createScoreModel({ defaultClef, grandStaff: Boolean(options.settings), choir: Boolean(options.settings) && isPro() });
  await initStorage({ saveDelay });
  if (window.ScoreStore.stored) document.getElementById('scoreStage')?.classList.add('is-loading');
  start(options);
}
