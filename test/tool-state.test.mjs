import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createToolState } from '../src/client/tool-state.js';

test('on() resolves the user, then the host, then the tool default', () => {
  let own;
  const state = createToolState({ settings: true, tools: { playback: true, intervals: false }, scoreTools: () => own });
  assert.equal(state.on('playback', false), true, 'host default beats the tool default');
  assert.equal(state.on('voices', false), false, 'tool default when nobody said anything');
  assert.equal(state.on('repeats'), true);
  own = { playback: false, voices: true };
  assert.equal(state.on('playback', false), false, 'the user beats the host');
  assert.equal(state.on('voices', false), true);
});

test('a host without Ajustes offers only what it enables, plus the always-offered tools', () => {
  const state = createToolState({ tools: { playback: true } });
  assert.equal(state.available('playback'), true);
  assert.equal(state.on('playback', false), true);
  for (const name of ['voices', 'intervals', 'tabs', 'chordNames']) {
    assert.equal(state.available(name), false, name);
    assert.equal(state.on(name, false), false, name);
  }
  for (const name of ['repeats', 'dynamics', 'lyrics']) assert.equal(state.on(name), true, name);
});

test('a score cannot switch on a tool the host does not offer', () => {
  const state = createToolState({ scoreTools: () => ({ playback: true, repeats: false }) });
  assert.equal(state.on('playback', false), false);
  assert.equal(state.on('repeats'), false, 'but it can switch off one that is offered');
});

test('tools: false hides a tool even with Ajustes', () => {
  const state = createToolState({ settings: true, tools: { intervals: false }, scoreTools: () => ({ intervals: true }) });
  assert.equal(state.available('intervals'), false);
  assert.equal(state.on('intervals', false), false);
  assert.equal(state.available('playback'), true);
});
