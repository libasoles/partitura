import { test } from 'node:test';
import assert from 'node:assert/strict';
import { highlightTutorialKeys } from '../src/lib/tutorial-keys.js';

test('tutorial keys are highlighted without changing existing keycaps or SVG', () => {
  const svg = '<svg aria-label="Shift+↑"><text>Shift</text></svg>';
  const html = highlightTutorialKeys('<p>Ctrl/Cmd+Z, Mayús+↑/↓. Apretá A. Soltá Mayús.</p><kbd>Tab</kbd>' + svg);
  assert.match(html, /<kbd>Ctrl<\/kbd>\/<kbd>Cmd<\/kbd>\+<kbd>Z<\/kbd>/);
  assert.match(html, /<kbd>Mayús<\/kbd>\+<kbd>↑<\/kbd>\/<kbd>↓<\/kbd>/);
  assert.match(html, /Apretá <kbd>A<\/kbd>/);
  assert.match(html, /Soltá <kbd>Mayús<\/kbd>/);
  assert.ok(html.endsWith('<kbd>Tab</kbd>' + svg));
  assert.doesNotMatch(html, /<kbd><kbd>/);
  assert.equal(highlightTutorialKeys('<h3>Delete a barline</h3>'), '<h3>Delete a barline</h3>');
});

import { highlightTutorialTerms } from '../src/lib/tutorial-keys.js';

test('tuning names and formats are marked, but not inside keycaps or SVG', () => {
  const html = highlightTutorialTerms('<p>Estándar, Drop D, Double Drop D y DADGAD. Exportá MusicXML o MIDI.</p><svg><text>Drop D</text></svg>');
  assert.match(html, /<span class="tutorial-term">Estándar<\/span>, <span class="tutorial-term">Drop D<\/span>, <span class="tutorial-term">Double Drop D<\/span>/);
  assert.match(html, /<span class="tutorial-term">MusicXML<\/span>/);
  assert.ok(html.endsWith('<svg><text>Drop D</text></svg>'));
});
