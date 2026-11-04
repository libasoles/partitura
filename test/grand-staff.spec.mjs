import { test, expect } from '@playwright/test';

async function open(page) {
  await page.goto('/es/');
  await page.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
  await page.waitForFunction(() => window.scoreEditor && document.querySelector('.score-doc-tab-input'));
}

// Pointer position of a line of one staff of the first measure: line 0 is the top one, 4 the bottom.
async function staffLine(page, staff, line, measure = 0) {
  const paths = page.locator(`[id="m${measure}"] > g.staff`).nth(staff).locator(':scope > path');
  const box = await paths.nth(line).boundingBox();
  return { x: box.x + box.width * 0.45, y: box.y + box.height / 2 };
}

// Drags the quarter note from the palette onto a point of the stage.
async function dropQuarter(page, point) {
  const tool = await page.locator('[data-shortcut="3"]').boundingBox();
  await page.mouse.move(tool.x + tool.width / 2, tool.y + tool.height / 2);
  await page.mouse.down();
  await page.mouse.move(point.x, point.y, { steps: 12 });
  await page.mouse.up();
}

const score = (page) => page.evaluate(() => window.scoreEditor.score);

test('a piano score is drawn as a grand staff, a guitar score as one staff', async ({ page }) => {
  await open(page);
  await expect(page.locator('#scoreStage g.system').first().locator('g.grpSym')).toHaveCount(1);
  await expect(page.locator('[id="m0"] > g.staff')).toHaveCount(2);
  await page.locator('#scoreSettingsToggle').click();
  await page.locator('#scoreSettingsPopup').getByRole('button', { name: 'Guitarra' }).click();
  await expect(page.locator('[id="m0"] > g.staff')).toHaveCount(1);
  await expect(page.locator('#scoreStage g.grpSym')).toHaveCount(0);
  await page.locator('#scoreSettingsPopup').getByRole('button', { name: 'Piano' }).click();
  await expect(page.locator('[id="m0"] > g.staff')).toHaveCount(2);
});

test('notes land on the staff under the cursor and each staff keeps its own undo, clef and persistence', async ({ page }, testInfo) => {
  await open(page);
  // Upper staff: the middle line (B); lower staff: the middle line (D), both in measure 0.
  await dropQuarter(page, await staffLine(page, 0, 2));
  await expect(page.locator('[id="e0-0"]')).toHaveCount(1);
  await dropQuarter(page, await staffLine(page, 1, 2));
  await expect(page.locator('[id="l0-0"]')).toHaveCount(1);
  let saved = await score(page);
  expect(saved.rows[0][0]).toHaveLength(1);
  expect(saved.lower[0]).toHaveLength(1);
  expect(saved.rows[0][0][0].n).toBe(41); // treble middle line: B4 sits at 37 + 4
  expect(saved.lower[0][0].n).toBe(29); // bass middle line: D3 sits at 25 + 4

  // The tools act on the staff under the cursor: the same drop one staff below does not touch the first.
  await dropQuarter(page, await staffLine(page, 1, 4, 1));
  saved = await score(page);
  expect(saved.rows[0][1]).toHaveLength(0);
  expect(saved.lower[1]).toHaveLength(1);

  // Clefs change independently: the lower staff goes to treble, the upper one is untouched.
  await page.locator('.score-clef-trigger[data-staff="1"]').first().click();
  await expect(page.locator('#scoreClefPopup')).toContainText('Pentagrama inferior');
  await page.locator('#scoreClefPopup button[data-clef="treble"]').click();
  await page.keyboard.press('Escape');
  saved = await score(page);
  expect(saved.lowerClef).toBe('treble');
  expect(saved.clef).toBe('treble');
  const lowerClef = page.locator('[id="m0"] > g.staff').nth(1).locator('g.clef use');
  await expect(lowerClef).toHaveAttribute('xlink:href', /^#E050-/);
  await expect(page.locator('[id="m0"] > g.staff').nth(0).locator('g.clef use')).toHaveAttribute('xlink:href', /^#E050-/);
  // ... and the upper one can go to bass without moving the lower one.
  await page.locator('.score-clef-trigger[data-staff="0"]').first().click();
  await page.locator('#scoreClefPopup button[data-clef="bass"]').click();
  await page.keyboard.press('Escape');
  saved = await score(page);
  expect([saved.clef, saved.lowerClef]).toEqual(['bass', 'treble']);
  await page.locator('#scoreStage').screenshot({ path: testInfo.outputPath('grand-staff.png') });

  // Undo goes back one edit at a time, across both staves.
  await page.keyboard.press('ControlOrMeta+z');
  await page.keyboard.press('ControlOrMeta+z');
  saved = await score(page);
  expect([saved.clef, saved.lowerClef ?? 'bass']).toEqual(['treble', 'bass']); // no explicit lower clef: the default
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('[id="l1-0"]')).toHaveCount(0);
  saved = await score(page);
  expect(saved.lower[0]).toHaveLength(1);
  expect(saved.lower[1] || []).toHaveLength(0);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.locator('[id="l0-0"]')).toHaveCount(0);

  // Write the lower note again, then reload: the second staff persists with the score.
  await dropQuarter(page, await staffLine(page, 1, 2));
  await expect(page.locator('[id="l0-0"]')).toHaveCount(1);
  await page.locator('.score-clef-trigger[data-staff="1"]').first().click();
  await page.locator('#scoreClefPopup button[data-clef="alto"]').click();
  await page.keyboard.press('Escape');
  await expect.poll(() => page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('partitura', 1);
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const read = db.transaction('workspace').objectStore('workspace').get('tabs');
      read.onsuccess = () => { db.close(); resolve(read.result?.scores?.[0]?.lowerClef); };
      read.onerror = () => { db.close(); reject(read.error); };
    };
  }))).toBe('alto');
  await page.reload();
  await page.locator('#scoreStage:not([aria-busy]) g.measure').first().waitFor();
  await expect(page.locator('[id="l0-0"]')).toHaveCount(1);
  saved = await score(page);
  expect(saved.lower[0][0].n).toBe(29); // the pitch is the same under any clef
  expect(saved.lowerClef).toBe('alto');
});

test('selection, move, duplicate and copy/paste work in the lower staff', async ({ page }) => {
  await open(page);
  await dropQuarter(page, await staffLine(page, 1, 2));
  const note = page.locator('[id="l0-0"] .notehead');
  await note.click();
  await expect(page.locator('[id="l0-0"]')).toHaveClass(/is-selected/);

  // Arrow up moves the selected note one step.
  await page.locator('#scoreStage').focus();
  await page.keyboard.press('ArrowUp');
  expect((await score(page)).lower[0][0].n).toBe(30);

  // Shift+D duplicates it after itself, in the same staff.
  await page.keyboard.press('Shift+D');
  let saved = await score(page);
  expect(saved.lower[0]).toHaveLength(2);
  expect(saved.rows[0][0]).toHaveLength(0);

  // Dragging a lower-staff note onto the upper staff moves it there.
  const from = await page.locator('[id="l0-1"] .notehead').boundingBox();
  const to = await staffLine(page, 0, 2, 0);
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + 30, to.y, { steps: 12 });
  await page.mouse.up();
  saved = await score(page);
  expect(saved.rows[0][0]).toHaveLength(1);
  expect(saved.lower[0]).toHaveLength(1);

  // Delete removes only the selection.
  await page.locator('#scoreStage').focus();
  await page.keyboard.press('Delete');
  saved = await score(page);
  expect(saved.rows[0][0]).toHaveLength(0);
  expect(saved.lower[0]).toHaveLength(1);
});

test('MusicXML and MIDI keep both staves and importing the XML restores them', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const M = window.ScoreModel;
    const score = window.scoreEditor.score;
    score.rows[0][0] = [{ d: 'h', n: 40 }, { d: 'h', n: 42 }];
    score.lower = { 0: [{ d: 'w', n: 25 }], 1: [{ d: 'h', n: 29 }, { d: 'h', n: 27 }] };
    score.lowerClefs = { 1: 'tenor' };
    score.tempo = 100;
    score.title = 'Gran pentagrama';
    window.scoreEditor.render();
    return M.stavesOf(score);
  });
  await page.locator('#scoreTitle').fill('Gran pentagrama');
  const download = async (id) => {
    await page.locator('#siteMenuToggle').click();
    await page.locator('#menuExportLabel').click();
    const pending = page.waitForEvent('download');
    await page.locator(`#${id}`).click();
    const file = await pending;
    const chunks = [];
    for await (const chunk of await file.createReadStream()) chunks.push(chunk);
    return Buffer.concat(chunks);
  };
  const xml = (await download('menuExportXml')).toString();
  expect(xml).toContain('<staves>2</staves>');
  expect((xml.match(/<part id=/g) || []).length).toBe(1);
  expect(xml).toContain('<clef number="2"><sign>F</sign>');
  expect(xml).toContain('<clef number="2"><sign>C</sign><line>4</line></clef>');
  expect(xml).toContain('<staff>2</staff>');
  const midi = await download('menuExportMidi');
  expect(midi.subarray(0, 4).toString()).toBe('MThd');
  // Channel 1 (the lower staff) has note-ons.
  expect(midi.includes(Buffer.from([0x91]))).toBe(true);
  const pdf = await download('menuExportPdf');
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF');

  await page.locator('#menuFile').setInputFiles({ name: 'grand.musicxml', mimeType: 'application/xml', buffer: Buffer.from(xml) });
  await expect(page.locator('.score-doc-tab')).toHaveCount(2);
  const imported = await score(page);
  expect(imported.rows[0][0].map((ev) => ev.n)).toEqual([40, 42]);
  expect(imported.lower[0].map((ev) => ev.n)).toEqual([25]);
  expect(imported.lower[1].map((ev) => ev.n)).toEqual([29, 27]);
  expect(imported.lowerClefs).toEqual({ 1: 'tenor' });
  expect(imported.tempo).toBeUndefined(); // MusicXML tempo is not read back (it never was)
  await expect(page.locator('[id="l1-1"]')).toHaveCount(1);

  // MIDI: the file written above reads back into two staves.
  await page.locator('#menuFile').setInputFiles({ name: 'grand.mid', mimeType: 'audio/midi', buffer: midi });
  await expect(page.locator('.score-doc-tab')).toHaveCount(3);
  const fromMidi = await score(page);
  expect(fromMidi.tempo).toBe(100);
  expect(fromMidi.lower[0].some((ev) => ev.n === 25)).toBe(true);
  expect(fromMidi.rows[0][0].some((ev) => ev.n === 40)).toBe(true);
});
