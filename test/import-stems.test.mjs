import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { createScoreModel } from '../src/client/score-model.js';
import IO from '../src/client/score-io.js';

const M = createScoreModel();
const note = (step, voice, stem, extra = '') => `<note>${extra}<pitch><step>${step}</step><octave>4</octave></pitch><duration>4</duration><voice>${voice}</voice><type>whole</type>${stem ? `<stem>${stem}</stem>` : ''}</note>`;
const wrap = (inner) => `<score-partwise><part-list><score-part id="P1"><part-name>x</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${inner}</measure></part></score-partwise>`;
const back = '<backup><duration>4</duration></backup>';
const stems = (xml) => Array.from(xml.matchAll(/<voice>(\d+)<\/voice>.*?<stem>(\w+)<\/stem>/g), (m) => `${m[1]}:${m[2]}`);

test('las plicas del archivo mandan sobre la convencion de voces', () => {
  // Tres voces: la convencion pondria la 2 hacia arriba; el archivo la pone hacia abajo.
  const xml = wrap(note('B', 1, 'up') + back + note('A', 2, 'down') + back + note('D', 3, 'down'));
  const score = IO.parseMusicXml(xml, M, new DOMParser());
  assert.deepEqual(M.sanitize(score).stems, ['up', 'down', 'down']);
  assert.deepEqual(stems(M.toMusicXml(M.sanitize(score))), ['1:up', '2:down', '3:down']);
});

test('sin plicas en el archivo se mantiene la convencion', () => {
  const xml = wrap(note('B', 1) + back + note('A', 2) + back + note('D', 3));
  const score = IO.parseMusicXml(xml, M, new DOMParser());
  assert.equal(M.sanitize(score).stems, undefined);
  assert.deepEqual(stems(M.toMusicXml(M.sanitize(score))), ['1:up', '2:up', '3:down']);
});
