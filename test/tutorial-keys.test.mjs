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
