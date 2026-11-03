import { test, expect } from '@playwright/test';

for (const locale of ['es', 'en', 'pt']) {
  test(`${locale}: the site menu binds shared import and all three exports`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(`/${locale}/`);
    await page.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
    await page.waitForFunction(() => window.scoreEditor && document.querySelector('.score-doc-tab-input'));
    await page.locator('#scoreTitle').fill('Editor compartido');
    await expect.poll(() => page.evaluate(() => window.scoreEditor.score.title)).toBe('Editor compartido');
    let xml;
    for (const [id, extension, signature] of [
      ['menuExportXml', 'musicxml', '<?xml'],
      ['menuExportMidi', 'mid', 'MThd'],
      ['menuExportPdf', 'pdf', '%PDF'],
    ]) {
      await page.locator('#siteMenuToggle').click();
      await page.locator('#menuExportLabel').click();
      const pending = page.waitForEvent('download');
      await page.locator(`#${id}`).click();
      const download = await pending;
      expect(download.suggestedFilename()).toBe(`Editor compartido.${extension}`);
      const chunks = [];
      for await (const chunk of await download.createReadStream()) chunks.push(chunk);
      const bytes = Buffer.concat(chunks);
      expect(bytes.subarray(0, signature.length).toString()).toBe(signature);
      if (extension === 'musicxml') xml = bytes;
    }
    await page.locator('#menuFile').setInputFiles({ name: 'shared.musicxml', mimeType: 'application/xml', buffer: xml });
    await expect(page.locator('.score-doc-tab')).toHaveCount(2);
    await expect(page.locator('#scoreTitle')).toHaveValue('Editor compartido');
    expect(errors).toEqual([]);
  });
}
