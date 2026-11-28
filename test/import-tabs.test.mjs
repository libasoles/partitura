import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { createScoreModel } from '../src/client/score-model.js';
import IO from '../src/client/score-io.js';

const M = createScoreModel();
const tech = (string, fret) => `<notations><technical><string>${string}</string><fret>${fret}</fret></technical></notations>`;
const pitched = (step, oct, extra = '', staff = 1, chord = false) => `<note>${chord ? '<chord/>' : ''}<pitch><step>${step}</step><octave>${oct}</octave></pitch><duration>4</duration><voice>${staff}</voice><type>quarter</type><staff>${staff}</staff>${extra}</note>`;
const build = (staff1, staff2, details = '', tabClef = '<clef number="2"><sign>TAB</sign><line>5</line></clef>') => `<score-partwise><part-list><score-part id="P1"><part-name>x</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>4</divisions><time><beats>4</beats><beat-type>4</beat-type></time><staves>2</staves><clef number="1"><sign>G</sign><line>2</line></clef>${tabClef}${details}</attributes>${staff1}<backup><duration>${(staff1.match(/<note>(?!<chord)/g) || []).length * 4}</duration></backup>${staff2}</measure></part></score-partwise>`;
const parse = (xml) => IO.parseMusicXml(xml, M, new DOMParser());
const NAMES = ['C', 'C', 'D', 'D', 'E', 'F', 'F', 'G', 'G', 'A', 'A', 'B'];
const tuning = (opens) => `<staff-details number="2">${opens.map((m, i) => `<staff-tuning line="${6 - i}"><tuning-step>${NAMES[m % 12]}</tuning-step>${[1, 3, 6, 8, 10].includes(m % 12) ? '<tuning-alter>1</tuning-alter>' : ''}<tuning-octave>${Math.floor(m / 12) - 1}</tuning-octave></staff-tuning>`).join('')}</staff-details>`;

test('la tablatura no duplica notas y llena score.tabs', () => {
  const score = parse(build(pitched('D', 4) + pitched('E', 4), pitched('D', 4, tech(2, 3), 2) + pitched('E', 4, tech(1, 0), 2)));
  assert.equal(score.rows[0][0].length, 2);
  assert.deepEqual(score.tabs['0:0'], [null, 3, null, null, null, null]);
  assert.deepEqual(score.tabs['0:' + M.DIVISIONS], [0, null, null, null, null, null]);
  assert.equal(score.showTabs, true);
  assert.deepEqual(M.attacks(score).map((a) => a.key), ['0:0', '0:' + M.DIVISIONS]);
});

test('los acordes producen columnas con varias cuerdas', () => {
  const score = parse(build(pitched('C', 4) + pitched('E', 4, '', 1, true), pitched('C', 4, tech(2, 1), 2) + pitched('E', 4, tech(3, 1), 2, true)));
  assert.equal(score.rows[0][0].length, 2);
  assert.deepEqual(score.tabs['0:0'], [null, 1, 1, null, null, null]);
});

test('sin pentagrama TAB no cambia nada', () => {
  const score = parse(build(pitched('D', 4), '', '', ''));
  assert.equal(score.tabs, undefined);
  assert.equal(score.showTabs, undefined);
  assert.equal(score.rows[0][0].length, 1);
});

test('una afinacion conocida se guarda; una desconocida descarta la tablatura', () => {
  const staff1 = pitched('D', 4);
  const staff2 = pitched('D', 4, tech(2, 3), 2);
  const dropD = parse(build(staff1, staff2, tuning([64, 59, 55, 50, 45, 38])));
  assert.equal(dropD.tuning, 'drop-d');
  assert.ok(dropD.tabs);
  const standard = parse(build(staff1, staff2, tuning([64, 59, 55, 50, 45, 40])));
  assert.equal(standard.tuning, undefined);
  assert.ok(standard.tabs);
  const odd = parse(build(staff1, staff2, tuning([65, 59, 55, 50, 45, 40])));
  assert.equal(odd.tabs, undefined);
  assert.equal(odd.showTabs, undefined);
});
