import { test } from 'node:test';
import assert from 'node:assert/strict';
import M from '../src/client/score-model.js';

// do-sol-mi-re en corcheas, escrito desde el do central (n = BOTTOM_LINE de sol + ...): lo que importa es la distancia.
function scoreWith(notes, mi = 0) {
  const score = M.emptyScore();
  notes.forEach((ev, i) => M.insertAt(M.measures(score)[mi], { d: 'e', ...ev }, i * 12));
  return score;
}
const base = 30;
const source = () => scoreWith([{ n: base }, { n: base + 4 }, { n: base + 2 }, { n: base + 1 }]);
const all = (score) => M.measures(score)[0].map((_, i) => M.refOf(0, 0, i));

test('a pattern keeps rhythm and scale degrees, not the pitch or the key', () => {
  const pattern = M.patternFrom(source(), all(source()));
  assert.deepEqual(pattern.events.map((ev) => ev.dn), [0, 4, 2, 1]);
  assert.equal(M.patternDegrees(pattern), 'I V III II');
  assert.ok(pattern.events.every((ev) => !('n' in ev) && ev.d === 'e'));
});

test('a measure can be saved whole, rests included', () => {
  const score = source();
  M.insertAt(M.measures(score)[0], { d: 'q', rest: true }, 48);
  const pattern = M.patternFromMeasure(score, 0);
  assert.equal(pattern.events.length, 5);
  assert.equal(pattern.events[4].rest, true);
  assert.equal(M.patternFromMeasure(M.emptyScore(), 0), null);
});

test('applying a pattern transposes it to the target pitch', () => {
  const pattern = M.patternFrom(source(), all(source()));
  const target = M.emptyScore();
  const refs = M.applyPattern(target, pattern, { mi: 2, n: base + 3 });
  assert.equal(refs.length, 4);
  assert.deepEqual(M.measures(target)[2].map((ev) => ev.n), [base + 3, base + 7, base + 5, base + 4]);
  assert.deepEqual(M.measures(target)[2].map((ev) => M.onsets(M.measures(target)[2])[M.measures(target)[2].indexOf(ev)]), [0, 12, 24, 36]);
});

test('the rhythm-only mode puts every note at the same pitch', () => {
  const pattern = M.patternFrom(source(), all(source()));
  const target = M.emptyScore();
  M.applyPattern(target, pattern, { mi: 0, n: base, flat: true });
  assert.deepEqual(M.measures(target)[0].map((ev) => ev.n), [base, base, base, base]);
});

test('a pattern that does not fit leaves the caller to discard the trial', () => {
  const pattern = M.patternFrom(source(), all(source()));
  const target = M.emptyScore();
  const short = Object.assign(M.emptyScore(), { meter: '2/4' });
  const eight = scoreWith(Array.from({ length: 8 }, (_, i) => ({ n: base + i })));
  assert.equal(M.applyPattern(short, M.patternFrom(eight, all(eight)), { mi: 0, n: base }), null);
  assert.equal(M.applyPattern(target, pattern, { mi: 0, n: M.HIGHEST }), null);
});

test('a pattern spanning measures is rebuilt across them, and saved data is validated', () => {
  const score = scoreWith([{ n: base }, { n: base + 2 }]);
  M.insertAt(M.measures(score)[1], { d: 'q', n: base + 1 }, 0);
  const pattern = M.patternFrom(score, [M.refOf(0, 0, 0), M.refOf(0, 0, 1), M.refOf(0, 1, 0)]);
  const target = M.emptyScore();
  assert.equal(M.applyPattern(target, pattern, { mi: 1, n: base }).length, 3);
  assert.equal(M.measures(target)[2][0].n, base + 1);
  assert.equal(M.cleanPattern({ events: [{ d: 'zz', mi: 0, at: 0, dn: 0 }] }), null);
  assert.deepEqual(M.cleanPattern(JSON.parse(JSON.stringify(pattern))), pattern);
  assert.equal(M.patternFrom(score, [M.refOf(0, 0, 0), M.refOf(1, 0, 0)]), null);
});
