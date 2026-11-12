import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { createScoreModel } from '../src/client/score-model.js';
import IO from '../src/client/score-io.js';

const M = createScoreModel();
const note = (step, duration, type) => `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>${duration}</duration><type>${type}</type></note>`;
const measure = (n, body, attrs = '') => `<measure number="${n}"${attrs}>${n === 1 ? '<attributes><divisions>2</divisions><time><beats>6</beats><beat-type>8</beat-type></time></attributes>' : ''}${body}</measure>`;
const wrap = (inner) => `<score-partwise><part-list><score-part id="P1"><part-name>x</part-name></score-part></part-list><part id="P1">${inner}</part></score-partwise>`;

test('una anacrusa conserva su duración en vez de completar el compás', () => {
  const xml = wrap(measure(1, note('G', 1, 'eighth') + note('A', 1, 'eighth')) + measure(2, note('B', 6, 'half')));
  const score = IO.parseMusicXml(xml, M, new DOMParser());
  assert.equal(M.capacity(score, 0), M.DIVISIONS);
  assert.equal(M.capacity(score, 1), M.capacity({ meter: '6/8' }));
});

test('un primer compás completo no se acorta', () => {
  const xml = wrap(measure(1, note('G', 6, 'half')));
  const score = IO.parseMusicXml(xml, M, new DOMParser());
  assert.equal(M.capacity(score, 0), M.capacity({ meter: '6/8' }));
});
