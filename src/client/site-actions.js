// Partitura's controls live in the site menu. Other hosts bind different controls.
export function bindSiteActions(actions) {
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
  document.getElementById('menuExportXml')?.addEventListener('click', () => actions.exportMusicXml());
  document.getElementById('menuExportMidi')?.addEventListener('click', () => actions.exportMidi());
  document.getElementById('menuExportPdf')?.addEventListener('click', (event) => actions.exportPdf(event.currentTarget));
}
