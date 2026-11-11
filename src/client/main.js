// Below this width the page shows the "desktop only" screen (see mobile-gate.css) and there is no editor, so none of
// its code, IndexedDB read or Verovio is fetched: this file is all a phone downloads. If the window is later widened
// past it, the editor starts then.
const desktop = window.matchMedia('(min-width: 900px)');

let siteActions;
let starting;

async function start() {
  import('./tooltip-bounds.js');
  const { startEditor } = await import('./runtime.js');
  const { bindSiteActions } = await import('./site-actions.js');
  const { readUrlDefaults } = await import('./url-defaults.js');
  const demo = document.getElementById('editor')?.dataset.demoId;
  const urlDefaults = readUrlDefaults(demo ? '?tools=voices,play,intervals&sound=uh' : new URLSearchParams(location.search).has('score') ? '' : location.search);
  const initialDemo = document.getElementById('demoScore');
  await startEditor({ bindActions: (actions) => { bindSiteActions(actions); siteActions = actions; }, settings: true, chords: true, lyrics: true, patterns: true, urlDefaults, initialDemo: initialDemo ? JSON.parse(initialDemo.textContent) : undefined });
}

if (desktop.matches) start();
else desktop.addEventListener('change', (event) => event.matches && start(), { once: true });

// A phone shows the prerendered demo without the editor; its PDF button starts the editor (once) just to export.
const mobilePdf = document.getElementById('mobilePdf');
mobilePdf?.addEventListener('click', async () => {
  mobilePdf.disabled = true;
  try {
    starting = starting || start();
    await starting;
    await siteActions.ready;
    await siteActions.exportPdf(mobilePdf);
  } finally {
    mobilePdf.disabled = false;
  }
});

// Phone demos: a play/pause button under the score. It starts the editor (once) and drives its own play button.
const mobilePlay = document.getElementById('mobilePlay');
mobilePlay?.addEventListener('click', async () => {
  const label = mobilePlay.querySelector('span');
  const sync = (button) => {
    mobilePlay.setAttribute('aria-pressed', button.getAttribute('aria-pressed'));
    mobilePlay.disabled = button.disabled;
    label.textContent = button.getAttribute('aria-label');
  };
  const first = !mobilePlay.dataset.bound;
  if (first) {
    mobilePlay.dataset.bound = '1';
    mobilePlay.disabled = true;
    starting = starting || start();
    await starting;
    await siteActions.ready;
    const button = document.getElementById('scorePlayback');
    if (!button) return;
    new MutationObserver(() => sync(button)).observe(button, { attributes: true });
  }
  document.getElementById('scorePlayback')?.click();
});
