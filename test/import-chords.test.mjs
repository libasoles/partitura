import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from 'linkedom';
import { createScoreModel } from '../src/client/score-model.js';
import IO from '../src/client/score-io.js';

const M = createScoreModel();
const harmony = (step, alter, kind, text, bass = '') => `<harmony><root><root-step>${step}</root-step>${alter ? `<root-alter>${alter}</root-alter>` : ''}</root><kind${text !== undefined ? ` text="${text}"` : ''}>${kind}</kind>${bass}</harmony>`;
const note = (step, type = 'half') => `<note><pitch><step>${step}</step><octave>4</octave></pitch><duration>2</duration><type>${type}</type></note>`;
const wrap = (inner) => `<score-partwise><part-list><score-part id="P1"><part-name>x</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${inner}</measure></part></score-partwise>`;

test('importa <harmony> como nombres de acorde en su tiempo', () => {
  const xml = wrap(harmony('C', 1, 'minor-seventh', 'm7') + note('C') + harmony('B', 0, 'dominant', '7(b9)') + note('D'));
  const score = IO.parseMusicXml(xml, M, new DOMParser());
  assert.equal(M.chordAt(score, 0, 0)?.name, 'C#m7');
  assert.equal(M.chordAt(score, 0, M.DIVISIONS * 2)?.name, 'B7(b9)');
});

test('sin texto usa el tipo y acepta bajo', () => {
  const bass = '<bass><bass-step>G</bass-step><bass-alter>1</bass-alter></bass>';
  const score = IO.parseMusicXml(wrap(harmony('C', 1, 'dominant', undefined, bass) + note('C', 'whole')), M, new DOMParser());
  assert.equal(M.chordAt(score, 0, 0).name, 'C#7/G#');
});

test('importa los nombres en negrita que exporta el editor', () => {
  const words = '<direction><direction-type><words font-weight="bold">Am7</words></direction-type></direction><direction><direction-type><words>rit.</words></direction-type></direction>';
  const score = IO.parseMusicXml(wrap(words + note('A', 'whole')), M, new DOMParser());
  assert.equal(M.chordAt(score, 0, 0).name, 'Am7');
  assert.equal(score.chords[0].length, 1);
});
