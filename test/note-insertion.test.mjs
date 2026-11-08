import { test } from 'node:test';
import assert from 'node:assert/strict';
import M, { createScoreModel } from '../src/client/score-model.js';

test('a half note before two eighths continues their voice, including repeated pitches', () => {
  for (const n of [34, 35, 36]) {
    const measure = [{ d: 'e', n: 35, at: 0 }, { d: 'e', n: 35, at: 12 }];
    const original = structuredClone(measure);
    const ev = { d: 'h', n };
    const placed = M.placeBefore(measure, ev, 0, n, { meter: '3/4' }, 0);
    assert.ok(placed.measure);
    assert.deepEqual(measure, original, 'planning leaves the score intact');
    const { measure: result, index } = placed;
    assert.equal(index, 0);
    assert.deepEqual(M.onsets(result), [0, 48, 60]);
    assert.equal(M.voices(result).length, 1);
    assert.equal(M.measureLength(result), 72);
  }
});

test('prepending allows overflow without opening an overlapping voice, and reports it as a problem', () => {
  const score = Object.assign(M.emptyScore(), { meter: '3/4' });
  const measure = [{ d: 'q', n: 35, at: 0 }, { d: 'q', n: 36, at: 24 }];
  const original = structuredClone(measure);
  const placed = M.placeBefore(measure, { d: 'h', n: 37 }, 0, 37, score, 0);
  assert.ok(placed.measure);
  assert.deepEqual(measure, original);
  assert.equal(M.voices(placed.measure).length, 1);
  M.measures(score)[0].splice(0, 0, ...placed.measure);
  assert.deepEqual(M.problems(score), [{ mi: 0, staff: 0, extra: 24 }]);
});

test('reordering an eighth after a quarter in a full measure is allowed', () => {
  const score = Object.assign(M.emptyScore(), { meter: '3/4' });
  const measure = M.measures(score)[0];
  [{ d: 'e', n: 35 }, { d: 'e', n: 34 }, { d: 'e', n: 33 }, { d: 'e', n: 32 }, { d: 'q', n: 31 }].forEach((ev, i) => M.insertAt(measure, ev, i < 4 ? i * 12 : 48));
  const others = measure.slice(0, 3).concat(measure.slice(4));
  const spot = M.placement(others, Object.assign({}, measure[3]), 60, score, 0, true);
  assert.ok(spot);
  assert.deepEqual(M.problems(score), []);
});

test('prepending keeps the other voice and explicit chords intact', () => {
  const measure = [
    { d: 'e', n: 40, v: 1, at: 0 },
    { d: 'e', n: 42, v: 1, at: 0 },
    { d: 'h', n: 28, v: 2, at: 0 },
    { d: 'e', n: 41, v: 1, at: 12 },
  ];
  const placed = M.placeBefore(measure, { d: 'h', n: 40 }, 0, 40, { meter: '4/4' }, 0);
  assert.deepEqual(placed.measure.filter(ev => ev.v === 1).map(ev => ev.at), [0, 48, 48, 60]);
  assert.deepEqual(placed.measure.filter(ev => ev.v === 2), [{ d: 'h', n: 28, v: 2, at: 0 }]);
});

test('dropping on the first column still creates an independent voice', () => {
  const measure = [{ d: 'e', n: 35, at: 0 }, { d: 'e', n: 35, at: 12 }];
  const index = M.insertNote(measure, { d: 'h', n: 36 }, 0);
  assert.equal(M.onsets(measure)[index], 0);
  assert.equal(M.voices(measure).length, 2);
});

for (const rest of [true, false]) {
  test(`interleaving an eighth between a half rest and an eighth (rest=${rest})`, () => {
    const measure = [{ d: 'h', rest: true, at: 0 }, { d: 'e', n: 35, at: 48 }];
    const original = structuredClone(measure);
    const added = rest ? { d: 'e', rest: true } : { d: 'e', n: 35 };
    const placed = M.placeBefore(measure, added, 48, 35, { clef: 'guitar', meter: '6/8' }, 0);
    assert.deepEqual(measure, original);
    assert.equal(placed.index, 1);
    assert.deepEqual(placed.measure.map(ev => ev.at), [0, 48, 60]);
    assert.equal(M.voices(placed.measure).length, 1);
    assert.deepEqual(M.sanitize({ ...M.emptyScore(), meter: '6/8', rows: [[placed.measure]] }).rows[0][0], placed.measure);
  });
}

test('simultaneous rests in separate voices have distinct pitches on either staff', () => {
  for (const [staff, bottom] of [[0, 37], [1, 25]]) {
    const model = createScoreModel({ grandStaff: true });
    const score = { ...model.emptyScore(), instrument: 'piano' };
    const placed = model.placeRest([{ d: 'h', rest: true, at: 0 }], { d: 'e', rest: true }, 0, bottom + 4, score, 0, false, staff);
    assert.equal(model.voices(placed.measure).length, 2);
    assert.ok(Math.abs(placed.measure[placed.index].n - (bottom + 4)) >= 6);
    assert.deepEqual(model.onsets(placed.measure), [0, 0]);
  }
});
