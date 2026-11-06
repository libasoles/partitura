import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreModel } from '../src/client/score-model.js';

const M = createScoreModel({ grandStaff: true });
const get = (score, ref) => M.measures(score, M.staffOf(ref))[ref.mi][ref.i];

for (const delta of [1, -1]) {
  test(`duplication by a diatonic third (${delta}) keeps a full measure in independent voices`, () => {
    const score = M.emptyScore();
    score.rows[0][0] = [37, 40, 39, 38].map(n => ({ d: 'q', n }));
    const refs = M.duplicateVertical(score, [0, 1, 2, 3].map(i => ({ mi: 0, i })), delta);
    assert.equal(refs.length, 4);
    assert.deepEqual(refs.map(r => get(score, r).n), [37, 40, 39, 38].map(n => n + 2 * delta));
    const measure = score.rows[0][0];
    assert.deepEqual(refs.map(r => M.onsets(measure)[r.i]), [0, 24, 48, 72]);
    assert.equal(M.measureLength(measure), 96);
    assert.equal(M.voices(measure).length, 2);
    assert.deepEqual(M.voices(measure).map(v => v.groups.length), [4, 4]);
    assert.equal((M.toMusicXml(score).match(/<chord\/>/g) || []).length, 0);
    assert.deepEqual(M.sanitize(score).rows[0][0], measure);
  });
}

test('a partial selection keeps its onset and leaves an independent bass intact', () => {
  const score = M.emptyScore();
  score.rows[0][0] = [
    { n: 40, d: 'q', at: 0, v: 1 }, { n: 25, d: 'w', at: 0, v: 2 },
    { n: 41, d: 'q', at: 24, v: 1 }, { n: 39, d: 'h', at: 48, v: 1 },
  ];
  const refs = M.duplicateVertical(score, [{ mi: 0, i: 2 }], -1);
  const measure = score.rows[0][0];
  assert.equal(M.onsets(measure)[refs[0].i], 24);
  assert.deepEqual(measure.filter(ev => !refs.some(r => get(score, r) === ev)).map(ev => [ev.n, ev.at, M.length(ev)]),
    [[40, 0, 24], [25, 0, 96], [41, 24, 24], [39, 48, 48]]);
  assert.equal(M.voices(measure).length, 3);
});

test('copies both staves, rhythms, and internal links across measures', () => {
  const score = M.emptyScore();
  score.lower = {
    0: [{ n: 25, d: 'h', tie: true }, { n: 25, d: 'h', slur: true }],
    1: [{ n: 27, d: 'q', dot: true }, { rest: true, d: 'e' }],
  };
  score.rows[0][0] = [{ n: 40, d: 'w' }];
  const refs = M.duplicateVertical(score, [{ mi: 0, i: 0 }, ...[0, 1].flatMap(mi => [0, 1].map(i => ({ s: 1, mi, i })))], 1);
  assert.equal(refs.length, 5);
  const copies = refs.filter(r => r.s).map(r => get(score, r));
  assert.deepEqual(copies.map(ev => [ev.n, ev.d, ev.dot, ev.rest]),
    [[27, 'h', undefined, undefined], [27, 'h', undefined, undefined], [29, 'q', true, undefined], [undefined, 'e', undefined, true]]);
  assert.equal(copies[0].tie, true);
  assert.equal(copies[1].slur, true);
});

test('rejects collisions, pitch limits and exhausted voices without changing the score', () => {
  for (const measure of [
    [{ n: 40, d: 'q', at: 0 }, { n: 42, d: 'q', at: 0 }],
    [{ n: M.HIGHEST, d: 'q' }],
    Array.from({ length: M.MAX_VOICE }, (_, i) => ({ n: 18 + i * 2, d: 'q', at: 0, v: i + 1 })),
  ]) {
    const score = M.emptyScore();
    score.rows[0][0] = measure;
    const before = structuredClone(score);
    assert.equal(M.duplicateVertical(score, [{ mi: 0, i: 0 }], 1), null);
    assert.deepEqual(score, before);
  }
});

test('copied tuplets have their own group and dangling ties are removed', () => {
  const score = M.emptyScore();
  score.rows[0][0] = [37, 38, 39].map(n => ({ n, d: 'e', tp: 1 }));
  score.rows[0][0][2].tie = true;
  score.rows[0][1] = [{ n: 39, d: 'q' }];
  const refs = M.duplicateVertical(score, [0, 1, 2].map(i => ({ mi: 0, i })), -1);
  const copies = refs.map(ref => get(score, ref));
  assert.deepEqual(copies.map(ev => ev.tp), [2, 2, 2]);
  assert.deepEqual(copies.map(ev => M.length(ev)), [8, 8, 8]);
  assert.equal(copies[2].tie, undefined);
  assert.equal(score.rows[0][0].filter(ev => ev.tp === 1)[2].tie, true);
  assert.deepEqual(refs.map(ref => M.onsets(score.rows[0][0])[ref.i]), [0, 8, 16]);
});
