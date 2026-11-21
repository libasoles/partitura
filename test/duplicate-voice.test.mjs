import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreModel } from '../src/client/score-model.js';

const M = createScoreModel({ grandStaff: true });

test('duplicates the top voice a third below across every measure', () => {
  const score = M.emptyScore();
  score.rows[0][0] = [37, 40, 39, 38].map((n) => ({ d: 'q', n }));
  score.rows[0][1] = [{ d: 'h', n: 41 }, { d: 'h', n: 40 }];
  const created = M.duplicateVoice(score);
  assert.equal(created.length, 6);
  assert.deepEqual(score.rows[0][0].filter((ev) => ev.v === 2).map((ev) => ev.n), [35, 38, 37, 36]);
  assert.deepEqual(score.rows[0][1].filter((ev) => ev.v === 2).map((ev) => ev.n), [39, 38]);
  assert.equal(M.voices(score.rows[0][1]).length, 2);
});

test('lists the voice numbers present in the score', () => {
  const score = M.emptyScore();
  score.rows[0][0] = [{ n: 40, d: 'w', at: 0, v: 1 }, { n: 30, d: 'w', at: 0, v: 2 }];
  assert.deepEqual(M.voiceNumbers(score), [1, 2]);
});

test('several voices get fresh destinations below the existing voices', () => {
  const score = M.emptyScore();
  score.rows[0][0] = [
    { n: 40, d: 'w', at: 0, v: 1 }, { n: 34, d: 'w', at: 0, v: 2 }, { n: 25, d: 'w', at: 0, v: 3 },
  ];
  const created = M.duplicateVoice(score, [1, 2]);
  assert.equal(created.length, 2);
  const byVoice = (v) => score.rows[0][0].filter((ev) => ev.v === v).map((ev) => ev.n);
  assert.deepEqual([1, 2, 3, 4, 5].map(byVoice), [[40], [34], [25], [38], [32]]);
});

test('a single chosen voice is copied into a new independent voice', () => {
  const score = M.emptyScore();
  score.rows[0][0] = [{ n: 40, d: 'w', at: 0, v: 1 }, { n: 30, d: 'w', at: 0, v: 2 }];
  M.duplicateVoice(score, [1]);
  const byVoice = (v) => score.rows[0][0].filter((ev) => ev.v === v).map((ev) => ev.n);
  assert.deepEqual([1, 2, 3].map(byVoice), [[40], [30], [38]]);
});

test('duplicates the top voice a sixth below (five diatonic steps)', () => {
  const score = M.emptyScore();
  score.rows[0][0] = [37, 40, 39, 38].map((n) => ({ d: 'q', n }));
  M.duplicateVoice(score, null, 5);
  assert.deepEqual(score.rows[0][0].filter((ev) => ev.v === 2).map((ev) => ev.n), [32, 35, 34, 33]);
});

test('with a selection, only the chosen figures are duplicated', () => {
  const score = M.emptyScore();
  score.rows[0][0] = [37, 40, 39, 38].map((n) => ({ d: 'q', n }));
  score.rows[0][1] = [{ d: 'h', n: 41 }, { d: 'h', n: 40 }];
  const created = M.duplicateVoice(score, null, 5, [M.refOf(0, 0, 1), M.refOf(0, 0, 2)]);
  assert.equal(created.length, 2);
  assert.deepEqual(score.rows[0][0].filter((ev) => ev.v === 2).map((ev) => ev.n), [35, 34]);
  assert.equal(M.voices(score.rows[0][1]).length, 1);
});

test('leaves the score untouched when nothing can be duplicated', () => {
  const score = M.emptyScore();
  const before = JSON.stringify(score);
  assert.equal(M.duplicateVoice(score), null);
  assert.equal(JSON.stringify(score), before);
});

test("in a choir the copy gets its own legend number instead of the original one", () => {
  const C = createScoreModel({ grandStaff: true, choir: true });
  const score = C.emptyScore();
  C.setInstrument(score, "voices");
  score.rows[0][0] = [37, 40, 39, 38].map((n) => ({ d: "q", n }));
  C.duplicateVoice(score, null, 5);
  const legends = C.voices(score.rows[0][0]).map((_, k) => C.legendOf(score, 0, k));
  assert.deepEqual(legends, [1, 2]);
});

test("switching from piano to voices keeps each notation voice on its own legend number", () => {
  const C = createScoreModel({ grandStaff: true, choir: true });
  const score = C.emptyScore();
  score.rows[0][0] = [37, 40, 39, 38].map((n) => ({ d: "q", n }));
  C.duplicateVoice(score, null, 5);
  assert.deepEqual(C.voices(score.rows[0][0]).map((_, k) => C.legendOf(score, 0, k)), [1, 2]);
  C.setInstrument(score, "voices");
  assert.deepEqual(C.voices(score.rows[0][0]).map((_, k) => C.legendOf(score, 0, k)), [1, 2]);
});

for (const steps of [3, 4, 5]) {
  test(`choir: duplicating an upper voice by ${steps} steps preserves existing legend identities`, () => {
    const C = createScoreModel({ grandStaff: true, choir: true });
    const score = C.emptyScore();
    C.setInstrument(score, 'voices');
    C.setParts(score, 2);
    score.rows[0][0] = [37, 40].map(n => ({ d: 'q', n }));
    C.duplicateVoice(score, null, 2);
    const originalCopyLegend = C.legendOf(score, 0, 1);
    const measure = score.rows[0][0];
    const only = measure.flatMap((ev, i) => ev.v === 1 ? [C.refOf(0, 0, i)] : []);
    const created = C.duplicateVoice(score, null, steps, only);
    assert.ok(created);
    assert.equal(C.legendOf(score, 0, 1), originalCopyLegend, 'the existing third must keep its own voice');
    assert.equal(new Set([0, 1, 2].map(k => C.legendOf(score, 0, k))).size, 3);
    assert.deepEqual(C.sanitize(score).voiceMap, score.voiceMap);
  });
}

test('a sixth uses a fresh choir voice across measures, preserving occupied voice 3', () => {
  const C = createScoreModel({ grandStaff: true, choir: true });
  const score = C.emptyScore();
  C.setInstrument(score, 'voices');
  C.setParts(score, 2);
  score.voiceMap = [[1, 3], null, null, null];
  score.rows[0][0] = [{ d: 'q', n: 40, v: 1, at: 0 }];
  score.rows[0][1] = [{ d: 'q', n: 40, v: 1, at: 0 }, { d: 'q', n: 38, v: 2, at: 0 }];
  const originals = structuredClone(score.rows);
  const refs = [C.refOf(0, 0, 0), C.refOf(0, 1, 0)];
  const created = C.duplicateVoice(score, null, 5, refs);
  assert.ok(created);
  for (const ref of created) {
    const ev = score.rows[0][ref.mi][ref.i];
    assert.equal(C.legendOf(score, 0, ev.v - 1), 4);
    assert.equal(ev.n, 35);
  }
  assert.equal(C.legendOf(score, 0, 1), 3);
  originals[0].forEach((measure, mi) => measure.forEach(ev => {
    assert.ok(score.rows[0][mi].some(after => JSON.stringify(after) === JSON.stringify(ev)));
  }));
});

test('recalculation compacts legend 1 and 3 to 1 and 2 despite a silent lower staff', () => {
  const C = createScoreModel({ grandStaff: true, choir: true });
  const score = C.emptyScore();
  C.setInstrument(score, 'voices');
  C.setParts(score, 2);
  score.voiceMap = [[1, 3], null, null, null];
  score.rows[0][0] = [{ d: 'e', n: 33, v: 1, at: 0 }, { d: 'e', n: 31, v: 2, at: 0 }];
  score.lower = { 0: [{ d: 'e', rest: true, v: 1, at: 0 }, { d: 'e', rest: true, v: 2, at: 0 }] };
  const before = structuredClone(score.rows);
  assert.equal(C.recalculateVoices(score), true);
  assert.deepEqual(C.voices(score.rows[0][0]).map((_, k) => C.legendOf(score, 0, k)), [1, 2]);
  assert.deepEqual(score.rows, before);
  assert.deepEqual(C.sanitize(score).voiceMap, score.voiceMap);
});


test('single-staff duplication reserves voice 4 when voice 3 already has notes', () => {
  const score = M.emptyScore();
  score.rows[0][0] = [{ d: 'e', n: 33, v: 1, at: 0 }, { d: 'e', n: 31, v: 3, at: 0 }];
  score.rows[0][1] = [{ d: 'e', n: 34, v: 1, at: 0 }];
  const refs = [M.refOf(0, 0, 0), M.refOf(0, 1, 0)];
  const copies = M.duplicateVoice(score, null, 5, refs);
  assert.ok(copies);
  assert.deepEqual(copies.map(r => score.rows[0][r.mi][r.i].v), [4, 4]);
  assert.equal(score.rows[0][0].find(ev => ev.n === 31).v, 3);
});
