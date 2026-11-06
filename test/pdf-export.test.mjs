import { test } from 'node:test';
import assert from 'node:assert/strict';
import createExporter from '../src/client/score-export.js';

for (const totalPages of [1, 3]) test(`PDF export numbers ${totalPages} pages only when needed`, async (t) => {
  const calls = [];
  let currentPage = 1;
  let font;
  let size;
  class Pdf {
    addPage() { currentPage += 1; }
    addImage() {}
    setPage(page) { currentPage = page; }
    setFont(name, style) { font = [name, style]; }
    setFontSize(value) { size = value; }
    setTextColor() {}
    text(value, x, y, options) { calls.push({ page: currentPage, value, x, y, options, font, size }); }
    save() { calls.push('saved'); }
  }
  t.mock.method(globalThis, 'setTimeout', (fn) => { fn(); return 0; });
  const globals = {
    window: { jspdf: { jsPDF: Pdf }, ScoreFingering: { assign: () => [] } },
    DOMParser: class { parseFromString() { return { querySelectorAll: () => [] }; } },
    XMLSerializer: class { serializeToString() { return '<svg/>'; } },
    Image: class { set src(value) { this.onload(); } },
    document: { createElement: () => ({ getContext: () => ({ fillRect() {}, drawImage() {} }), toDataURL: () => 'image' }) },
  };
  for (const [key, value] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    t.after(() => descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]);
  }
  const button = { disabled: false };
  const exporter = createExporter({
    M: { attacks: () => [], tuningOf: () => ({ opens: [] }), toMusicXml: () => '', refineTempo: svg => svg },
    t: {}, say: () => assert.fail('PDF export failed'), score: () => ({ title: '', author: '' }),
    newToolkit: () => ({ setOptions() {}, loadData() {}, getPageCount: () => totalPages, renderToSVG: () => '<svg/>' }),
  });
  await exporter.exportPdf(button);
  assert.equal(button.disabled, false);
  assert.equal(calls.pop(), 'saved');
  assert.deepEqual(calls, totalPages === 1 ? [] : [1, 2, 3].map(page => ({
    page, value: `${page}-3`, x: 105, y: 277, options: { align: 'center' }, font: ['helvetica', 'normal'], size: 8,
  })));
});
