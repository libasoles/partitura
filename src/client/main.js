// Below this width the page shows the "desktop only" screen (see mobile-gate.css) and there is no editor, so none of
// its code, IndexedDB read or Verovio is fetched: this file is all a phone downloads. If the window is later widened
// past it, the editor starts then.
const desktop = window.matchMedia('(min-width: 900px)');

async function start() {
  // The three files download side by side; globals.js installs window.ScoreModel and friends, which the editor reads when it starts.
  const editor = import('./score-editor.js');
  const [, { initStorage }] = await Promise.all([import('./globals.js'), import('./storage.js')]);
  await initStorage();
  // With saved scores, the default staff is not what the visitor will end up seeing: a spinner covers it until the
  // saved ones are drawn (score-editor.js removes it). With nothing saved, the default staff is already the right one.
  if (window.ScoreStore.stored) document.getElementById('scoreStage')?.classList.add('is-loading');
  (await editor).default();
}

if (desktop.matches) start();
else desktop.addEventListener('change', (event) => event.matches && start(), { once: true });
