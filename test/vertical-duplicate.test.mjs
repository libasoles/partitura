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

for (const staff of [0, 1]) {
  test(`duplicating a tied phrase and its last eighth separately continues voice 2 on staff ${staff}`, () => {
    const score = M.emptyScore();
    score.meter = '6/8';
    const melody = [
      { d: 'h', n: 35, v: 1, at: 0, tie: true },
      { d: 'e', n: 35, v: 1, at: 48 },
      { d: 'e', n: 34, v: 1, at: 60 },
    ];
    if (staff) score.lower = { 0: melody };
    else score.rows[0][0] = melody;
    const ref = i => M.refOf(staff, 0, i);
    const firstCopies = M.duplicateVertical(score, [ref(0), ref(1)], -1);
    assert.equal(firstCopies.length, 2);
    // Match the user's workflow: adjust the copied pitches, then duplicate the remaining eighth.
    firstCopies.forEach(r => { get(score, r).n -= 3; });
    const before = structuredClone(M.measures(score, staff)[0]);
    const lastIndex = before.findIndex(ev => ev.v === 1 && ev.at === 60);
    const copies = M.duplicateVertical(score, [ref(lastIndex)], -1);
    const measure = M.measures(score, staff)[0];
    assert.equal(copies.length, 1);
    assert.equal(get(score, copies[0]).v, 2);
    assert.equal(get(score, copies[0]).at, 60);
    assert.deepEqual(measure.filter((_, i) => i !== copies[0].i), before);
    assert.deepEqual(measure.map(ev => ev.v), [1, 2, 1, 2, 1, 2]);
    assert.equal(M.links(score).filter(link => link.type === 'tie').length, 2);
    assert.deepEqual(M.measures(M.sanitize(score), staff)[0], measure);
  });
}

test('duplicating earlier notes into a voice with a later entry does not renumber that entry', () => {
  const score = M.emptyScore();
  score.meter = '6/8';
  score.rows[0][0] = [
    { n: 35, d: 'h', v: 1, at: 0, tie: true },
    { n: 35, d: 'e', v: 1, at: 48 },
    { n: 34, d: 'e', v: 1, at: 60 },
    { n: 30, d: 'e', v: 2, at: 60 },
  ];
  const copies = M.duplicateVertical(score, [0, 1].map(i => ({ mi: 0, i })), -1);
  assert.equal(copies.length, 2);
  assert.deepEqual(score.rows[0][0].map(ev => ev.v), [1, 2, 1, 2, 1, 2]);
});
