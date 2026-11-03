import './globals.js';
import { initStorage } from './storage.js';

// Below this width the page shows the "desktop only" screen (see mobile-gate.css) and there is no editor, so none of
// its code, IndexedDB read or Verovio is fetched. If the window is later widened past it, the editor starts then.
const desktop = window.matchMedia('(min-width: 900px)');

async function start() {
  await initStorage();
  // With saved scores, the default staff is not what the visitor will end up seeing: a spinner covers it until the
  // saved ones are drawn (score-editor.js removes it). With nothing saved, the default staff is already the right one.
  if (window.ScoreStore.stored) document.getElementById('scoreStage')?.classList.add('is-loading');
  await import('./score-editor.js');
}

if (desktop.matches) start();
else desktop.addEventListener('change', (event) => event.matches && start(), { once: true });
