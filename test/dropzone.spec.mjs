import { test, expect } from '@playwright/test';
import { createScoreModel } from '../src/client/score-model.js';
import IO from '../src/client/score-io.js';

async function drag(page, files) {
  return page.evaluateHandle((files) => {
    const transfer = new DataTransfer();
    for (const file of files) transfer.items.add(new File([new Uint8Array(file.bytes)], file.name, { type: file.type }));
    return transfer;
  }, files);
}

for (const locale of ['es', 'en', 'pt']) {
  test(`${locale}: file drop feedback and imports preserve documents and metadata`, async ({ page }) => {
    await page.goto(`/${locale}/`);
    await page.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
    await page.waitForFunction(() => window.scoreEditor);
    await page.locator('#scoreTitle').fill('Original');
    const zone = page.locator('#scoreDropzone');
    // Internal editor drags must not open the file overlay.
    await page.locator('#scoreTitle').dispatchEvent('dragenter', { dataTransfer: await page.evaluateHandle(() => new DataTransfer()) });
    await expect(zone).toBeHidden();
    // Native OS drags expose MIME types but keep filenames protected until drop.
    await page.evaluate(() => {
      const event = new Event('dragenter', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', {
        value: { types: ['Files'], files: [], items: [{ kind: 'file', type: 'audio/midi' }] },
      });
      document.body.dispatchEvent(event);
    });
    await expect(zone).toHaveClass(/is-accepted/);
    // .musicxml usually has no registered MIME type: an OS drag reports it empty and must not look rejected.
    await page.evaluate(() => {
      const event = new Event('dragenter', { bubbles: true, cancelable: true });
      Object.defineProperty(event, 'dataTransfer', {
        value: { types: ['Files'], files: [], items: [{ kind: 'file', type: '' }] },
      });
      document.body.dispatchEvent(event);
    });
    await expect(zone).toHaveClass(/is-accepted/);
    const rejected =await drag(page, [{ name: 'photo.png', type: 'image/png', bytes: [1] }]);
    await page.locator('body').dispatchEvent('dragenter', { dataTransfer: rejected });
    await expect(zone).toBeVisible();
    await expect(zone).not.toHaveClass(/is-accepted/);
    await expect(zone).toHaveCSS('border-top-style', 'dashed');
    await expect(zone).toHaveCSS('background-color', 'rgba(255, 174, 80, 0.22)');
    await page.locator('body').dispatchEvent('drop', { dataTransfer: rejected });
    await expect(zone).toBeHidden();
    await expect(page.locator('.score-doc-tab')).toHaveCount(1);

    const xml = await page.evaluate(() => {
      const score = window.ScoreModel.emptyScore();
      score.title = 'Canción del río';
      score.author = 'María Pérez';
      score.rows[0][0] = [{ d: 'w', n: 37 }];
      return window.ScoreModel.toMusicXml(score);
    });
    const M = createScoreModel({ grandStaff: true });
    const midiScore = M.emptyScore();
    midiScore.title = 'Música MIDI';
    midiScore.rows[0][0] = [{ d: 'w', n: 37 }];
    const files = [
      { name: 'score.MUSICXML', type: 'application/vnd.recordare.musicxml+xml', bytes: [...Buffer.from(xml)] },
      { name: 'score.xml', type: '', bytes: [...Buffer.from(xml)] },
      { name: 'score.mid', type: 'audio/midi', bytes: [...IO.toMidi(midiScore, M)] },
      { name: 'score.midi', type: 'audio/x-midi', bytes: [...IO.toMidi(midiScore, M)] },
    ];
    const accepted = await drag(page, files);
    await page.locator('body').dispatchEvent('dragenter', { dataTransfer: accepted });
    await expect(zone).toHaveClass(/is-accepted/);
    await expect(zone).toHaveCSS('background-color', 'rgba(68, 195, 112, 0.2)');
    await page.screenshot({ path: test.info().outputPath('dropzone.png') });
    await page.locator('body').dispatchEvent('dragleave', { dataTransfer: accepted, relatedTarget: null });
    await expect(zone).toBeHidden();
    await page.locator('body').dispatchEvent('drop', { dataTransfer: accepted });
    await expect(page.locator('.score-doc-tab')).toHaveCount(5);
    await expect(page.locator('#scoreTitle')).toHaveValue('Música MIDI');
    await page.locator('.score-doc-tab').nth(1).click();
    await expect(page.locator('#scoreTitle')).toHaveValue('Canción del río');
    await expect(page.locator('#scoreAuthor')).toHaveValue('María Pérez');
    await page.locator('.score-doc-tab').first().click();
    await expect(page.locator('#scoreTitle')).toHaveValue('Original');
    // A corrupt file must not create an empty document or replace the current one.
    const corrupt = await drag(page, [{ name: 'bad.mid', type: 'audio/midi', bytes: [1] }]);
    await page.locator('body').dispatchEvent('drop', { dataTransfer: corrupt });
    const importFailed = await page.locator('#scoreStrings').evaluate((node) => JSON.parse(node.textContent).importFailed);
    await expect(page.locator('.toast-description')).toHaveText(importFailed);
    await expect(page.locator('.score-doc-tab')).toHaveCount(5);
    await expect(page.locator('#scoreTitle')).toHaveValue('Original');
    await page.evaluate(() => window.ScoreStore.flush());
    await page.reload();
    await page.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
    await expect(page.locator('.score-doc-tab')).toHaveCount(5);
  });
}
