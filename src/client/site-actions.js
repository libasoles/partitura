// Partitura's controls live in the site menu. Other hosts bind different controls.
import { acceptsScoreFile } from './score-file-types.js';
import { DEMOS, demoLink } from './demos.js';

export function bindSiteActions(actions) {
  const openDemo = async (demo, options) => {
    const loaded = await actions.loadUrl(demo, options);
    if (loaded) history.replaceState(history.state, '', demoLink(demo, location.href));
  };
  document.querySelectorAll('[data-demo-url]').forEach((button) => {
    button.addEventListener('click', async () => {
      button.disabled = true;
      try {
        const demo = DEMOS.find((one) => one.url === button.dataset.demoUrl);
        if (demo) await openDemo(demo);
      } finally {
        button.disabled = false;
      }
    });
  });
  const sharedId = document.getElementById('editor')?.dataset.demoId || new URLSearchParams(location.search).get('demo');
  const sharedDemo = DEMOS.find((demo) => demo.id === sharedId);
  if (sharedDemo) actions.ready.then(async () => {
    if (!actions.restoreDemo(sharedDemo.id)) await openDemo(sharedDemo, { silent: true });
  });
  const menuToggle = document.getElementById('siteMenuToggle');
  if (menuToggle) {
    ['pointerenter', 'focus', 'click'].forEach((type) => menuToggle.addEventListener(type, actions.warm, { once: true }));
  }
  const fileInput = document.getElementById('menuFile');
  document.getElementById('menuLoad')?.addEventListener('click', () => fileInput.click());
  fileInput?.addEventListener('change', () => {
    const [file] = fileInput.files;
    fileInput.value = '';
    actions.loadFile(file);
  });
  const dropzone = document.getElementById('scoreDropzone');
  if (dropzone) {
    let depth = 0;
    const hasFiles = (transfer) => Array.from(transfer?.types || []).includes('Files');
    const reset = () => { depth = 0; dropzone.hidden = true; };
    const show = (transfer) => {
      const files = Array.from(transfer.files || []);
      const items = files.length ? files : Array.from(transfer.items || []).filter((item) => item.kind === 'file');
      const accepted = items.length > 0 && items.every(acceptsScoreFile);
      dropzone.classList.toggle('is-accepted', accepted);
      dropzone.hidden = false;
      // OS drags may hide the filename or report a generic MIME type. Allow drop
      // so the extension can be checked before importing anything.
      transfer.dropEffect = 'copy';
    };
    document.addEventListener('dragenter', (event) => {
      if (!hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      depth += 1;
      show(event.dataTransfer);
    });
    document.addEventListener('dragover', (event) => {
      if (!hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      show(event.dataTransfer);
    });
    document.addEventListener('dragleave', (event) => {
      if (dropzone.hidden) return;
      if (--depth <= 0 || !event.relatedTarget) reset();
    });
    document.addEventListener('drop', async (event) => {
      if (!hasFiles(event.dataTransfer)) return;
      event.preventDefault();
      reset();
      const files = Array.from(event.dataTransfer.files);
      if (!files.length || !files.every(acceptsScoreFile)) return;
      for (const file of files) await actions.loadFile(file);
    });
    window.addEventListener('blur', reset);
    document.addEventListener('dragend', reset);
  }
  document.getElementById('menuExportXml')?.addEventListener('click', () => actions.exportMusicXml());
  document.getElementById('menuExportMidi')?.addEventListener('click', () => actions.exportMidi());
  document.getElementById('menuExportPdf')?.addEventListener('click', (event) => actions.exportPdf(event.currentTarget));
}
