import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { createScoreModel } from '../src/client/score-model.js';
import IO from '../src/client/score-io.js';

const M = createScoreModel();
const bar = (inner) => `<barline location="right">${inner}</barline>`;
const measure = (n, extra = '', before = '') => `<measure number="${n}">${before}<attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes><note><rest/><duration>4</duration><type>whole</type></note>${extra}</measure>`;

test('importa las casillas 1 y 2 y la barra final', () => {
  const xml = `<score-partwise><part-list><score-part id="P1"><part-name>x</part-name></score-part></part-list><part id="P1">` +
    measure(1) +
    measure(2, bar('<ending number="1" type="stop"/><repeat direction="backward"/>'), '<barline location="left"><ending number="1" type="start">1.</ending></barline>') +
    measure(3, bar('<ending number="2" type="discontinue"/>'), '<barline location="left"><ending number="2" type="start">2.</ending></barline>') +
    measure(4, bar('<bar-style>light-heavy</bar-style>')) +
    `</part></score-partwise>`;
  const score = IO.parseMusicXml(xml, M, new DOMParser());
  assert.deepEqual(score.navigation, { 1: { first: true }, 2: { second: true } });
  assert.equal(score.barlines[1].end, true);
  assert.equal(score.barlines[3].double, true);
  assert.deepEqual(M.navigationEndings(score).map((e) => e.number), ['1', '2']);
});
