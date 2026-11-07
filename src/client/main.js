// Below this width the page shows the "desktop only" screen (see mobile-gate.css) and there is no editor, so none of
// its code, IndexedDB read or Verovio is fetched: this file is all a phone downloads. If the window is later widened
// past it, the editor starts then.
const desktop = window.matchMedia('(min-width: 900px)');

async function start() {
  const { startEditor } = await import('./runtime.js');
  const { bindSiteActions } = await import('./site-actions.js');
  const { readUrlDefaults } = await import('./url-defaults.js');
  const demo = document.getElementById('editor')?.dataset.demoId;
  const urlDefaults = readUrlDefaults(demo ? '?tools=voices,play,intervals&sound=uh' : location.search);
  const initialDemo = document.getElementById('demoScore');
  await startEditor({ bindActions: bindSiteActions, settings: true, chords: true, lyrics: true, patterns: true, urlDefaults, initialDemo: initialDemo ? JSON.parse(initialDemo.textContent) : undefined });
}

if (desktop.matches) start();
else desktop.addEventListener('change', (event) => event.matches && start(), { once: true });
