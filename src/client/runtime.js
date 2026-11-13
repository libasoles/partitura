// Shared browser entry. The host owns markup, styling, controls and defaults.
import './globals.js';
import { createScoreModel } from './score-model.js';
import { initStorage } from './storage.js';
import start from './score-editor.js';
import { isPro } from './pro.js';

// Options: `settings` mounts Ajustes; `tools` ({ playback: true, intervals: false, ... }) chooses which optional tools the
// host offers, with or without Ajustes (see tool-state.js and docs/shared-editor.md).
export async function startEditor({ defaultClef = 'treble', saveDelay = 300, ...options } = {}) {
  // The grand staff comes with the settings (instrument choice): a host that leaves them off keeps one staff.
  // Explicit choir options in shared URLs work without requiring the Pro fragment.
  const urlChoir = options.urlDefaults?.tools?.voices || Boolean(options.urlDefaults?.sound);
  window.ScoreModel = createScoreModel({ defaultClef, grandStaff: Boolean(options.settings), choir: Boolean(options.settings) && (isPro() || urlChoir) });
  await initStorage({ saveDelay });
  if (window.ScoreStore.stored && !options.initialDemo) document.getElementById('scoreStage')?.classList.add('is-loading');
  // Letra y biblioteca de patrones son Pro: solo con #pro en la URL.
  start({ ...options, lyrics: Boolean(options.lyrics) && isPro(), patterns: Boolean(options.patterns) && isPro() });
}
