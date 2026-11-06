import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreModel } from '../src/client/score-model.js';

const M = createScoreModel({ grandStaff: true });
const reported = [
  { d: 'e', n: 33, v: 1, at: 0 }, { d: 'e', n: 31, v: 3, at: 0 },
  { d: 'q', n: 33, dot: true, v: 1, at: 12 }, { d: 'q', n: 31, dot: true, v: 3, at: 12 },
  { d: 'e', rest: true, v: 1, at: 48 }, { d: 'e', rest: true, v: 3, at: 48, n: 28 },
  { d: 'e', n: 32, v: 1, at: 60 }, { d: 'e', n: 30, v: 2, at: 60 },
];
const scoreWith = (measure) => {
  const score = M.emptyScore();
  score.meter = '6/8';
  score.rows[0][0] = structuredClone(measure);
  return score;
};
const assignments = (score, refs, active = []) => M.selectionActions(score, refs, active).filter(a => a.startsWith('assignVoice'));

test('the reported bass can be assigned to active voice 2 without rewriting the melody or rhythm', () => {
  const score = scoreWith(reported);
  const refs = [1, 3, 5].map(i => ({ mi: 0, i }));
  assert.deepEqual(assignments(score, refs), []);
  assert.deepEqual(assignments(score, refs, [2]), ['assignVoice2']);
  const identities = score.rows[0][0].slice();
  assert.equal(M.applySelection(score, refs, 'assignVoice2'), true);
  assert.ok(score.rows[0][0].every((ev, i) => ev === identities[i]), 'keep note identities for tablature references');
  const expected = reported.map((ev, i) => ({ ...ev, v: i % 2 ? 2 : 1 }));
  assert.deepEqual(score.rows[0][0], expected);
  assert.deepEqual(assignments(score, refs, [2]), []);
  assert.deepEqual(M.sanitize(score).rows[0][0], expected);
  assert.ok(!M.selectionActions(score, refs).includes('revoice'));
});

test('a single note can move to an active voice with no figures yet and keeps its number', () => {
  const score = scoreWith([{ n: 33, d: 'q', v: 1, at: 0 }]);
  const refs = [{ mi: 0, i: 0 }];
  assert.deepEqual(assignments(score, refs, [4, 2]), ['assignVoice2', 'assignVoice4']);
  assert.equal(M.applySelection(score, refs, 'assignVoice4'), true);
  M.settle(score.rows[0][0]);
  assert.equal(score.rows[0][0][0].v, 4);
  assert.equal(M.sanitize(score).rows[0][0][0].v, 4);
  assert.ok(M.toMusicXml(score).includes('<voice>4</voice>'));
});

test('assigning across measures and staves is atomic when a destination overlaps', () => {
  const score = scoreWith([{ n: 33, d: 'q', v: 1, at: 0 }]);
  score.lower = { 1: [{ n: 25, d: 'h', v: 2, at: 0 }, { n: 28, d: 'q', v: 1, at: 0 }] };
  const refs = [{ mi: 0, i: 0 }, { s: 1, mi: 1, i: 1 }];
  const before = structuredClone(score);
  assert.deepEqual(assignments(score, refs, [2]), []);
  assert.equal(M.applySelection(score, refs, 'assignVoice2'), false);
  M.pruneLower(score);
  assert.deepEqual(score, before);
  assert.equal(M.applySelection(score, refs, 'assignVoice3'), true);
  assert.equal(score.rows[0][0][0].v, 3);
  assert.equal(score.lower[1][1].v, 3);
  assert.equal(score.lower[1][0].v, 2);
});


test('the tied bass stays tied when moved into the voice of the duplicated last eighth', () => {
  const score = scoreWith([
    { d: 'h', n: 35, v: 1, at: 0, tie: true }, { d: 'h', n: 30, v: 3, at: 0, tie: true },
    { d: 'e', n: 35, v: 1, at: 48, beam: 'break' }, { d: 'e', n: 30, v: 3, at: 48, beam: 'break' },
    { d: 'e', n: 34, v: 1, at: 60 }, { d: 'e', n: 32, v: 2, at: 60 },
  ]);
  assert.equal(M.applySelection(score, [{ mi: 0, i: 1 }, { mi: 0, i: 3 }], 'assignVoice2'), true);
  assert.deepEqual(score.rows[0][0].map(ev => ev.v), [1, 2, 1, 2, 1, 2]);
  assert.equal(M.links(score).filter(link => link.type === 'tie').length, 2);
});
