import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import { readFile } from 'node:fs/promises';

const bundle = buildSync({
  stdin: {
    contents: `export { default as createExporter } from './src/client/score-export.js';
      export { default as IO } from './src/client/score-io.js';`,
    resolveDir: process.cwd(),
  },
  bundle: true, write: false, format: 'iife', globalName: 'PdfTest',
}).outputFiles[0].text;

// Exercise the actual exporter, Verovio layout and rasterization with the reported score.
for (const instrument of ['voices', 'piano', 'guitar']) test(`${instrument} PDF paginates complete systems inside printable margins`, async ({ page }, testInfo) => {
  await page.goto('/es/#pro');
  await page.waitForFunction(() => window.scoreEditor);
  await page.addScriptTag({ content: bundle });
  const source = await readFile('public/demos/Canto en la rama - 3 voces.musicxml', 'utf8');
  const downloadPromise = page.waitForEvent('download');
  const result = await page.evaluate(async ({ source, instrument }) => {
    const M = window.ScoreModel;
    const score = window.PdfTest.IO.parseMusicXml(source, M);
    M.setInstrument(score, instrument);
    score.showTabs = instrument === 'guitar';
    const pages = [];
    const originalCreateObjectURL = URL.createObjectURL;
    URL.createObjectURL = function (blob) {
      if (blob.type === 'image/svg+xml') pages.push(blob.text());
      return originalCreateObjectURL.call(this, blob);
    };
    const exporter = window.PdfTest.createExporter({
      M, SCALE: 60, t: {}, say: () => { throw new Error('PDF export failed'); }, score: () => score,
      vendorUrl: name => '/vendor/' + name,
      loadScript: src => new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.onload = resolve; script.onerror = reject; script.src = src; document.head.appendChild(script);
      }),
      newToolkit: () => {
        const toolkit = new window.verovio.toolkit();
        return {
          setOptions: options => toolkit.setOptions(options),
          loadData: xml => toolkit.loadData(xml),
          getPageCount: () => toolkit.getPageCount(),
          renderToSVG: number => toolkit.renderToSVG(number),
        };
      },
    });
    try {
      await exporter.exportPdf({ disabled: false });
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
    }
    const measures = new Set();
    const bounds = (await Promise.all(pages)).map(markup => {
      const host = document.createElement('div');
      host.innerHTML = markup; document.body.appendChild(host);
      const svg = host.querySelector('svg');
      const paper = svg.getBoundingClientRect();
      host.querySelectorAll('g.measure').forEach(node => measures.add(node.id));
      const systems = [...host.querySelectorAll('g.system')].map(node => {
        const box = node.getBoundingClientRect();
        return {
          left: (box.left - paper.left) / paper.width * 210,
          right: (paper.right - box.right) / paper.width * 210,
          top: (box.top - paper.top) / paper.height * 297,
          bottom: (paper.bottom - box.bottom) / paper.height * 297,
        };
      });
      host.remove();
      return systems;
    });
    return { bounds, measures: measures.size, expected: M.measures(score).length };
  }, { source, instrument });
  const download = await downloadPromise;
  await download.saveAs(testInfo.outputPath(`${instrument}.pdf`));
  expect(result.bounds.length).toBeGreaterThan(1);
  expect(result.measures).toBe(result.expected);
  for (const systems of result.bounds) {
    expect(systems.length).toBeGreaterThan(0);
    for (const [index, box] of systems.entries()) {
      if (index) expect(box.top).toBeGreaterThan(297 - systems[index - 1].bottom);
      expect(box.left).toBeGreaterThanOrEqual(14);
      expect(box.right).toBeGreaterThanOrEqual(14);
      expect(box.top).toBeGreaterThanOrEqual(14);
      expect(box.bottom).toBeGreaterThanOrEqual(14);
    }
  }
});
