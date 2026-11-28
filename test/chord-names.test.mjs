import { test } from 'node:test';
import assert from 'node:assert/strict';
import M from '../src/client/score-model.js';
import { chordNames } from '../src/client/chord-names.js';
import { chordMarks } from '../src/client/score-intervals.js';

const note = (n, alter = 0) => ({ n, alter, midi: 12 * Math.floor(n / 7) + [0, 2, 4, 5, 7, 9, 11][n % 7] + alter });

test('chord names list every fit, root position first, with inversions as slash chords', () => {
  assert.deepEqual(chordNames([note(28), note(30), note(32)]), ['C']);
  assert.deepEqual(chordNames([note(30), note(32), note(35)]), ['C/E']);
  assert.deepEqual(chordNames([note(28), note(30), note(32), note(33)]), ['C6', 'Am7/C']);
  assert.deepEqual(chordNames([note(28), note(30, -1), note(32)]), ['Cm']);
  assert.deepEqual(chordNames([note(28), note(30)]), []);
  assert.deepEqual(chordNames([note(28), note(30), note(30)]), []);
});

test('a seventh chord without its fifth is still named', () => {
  assert.equal(chordNames([note(28), note(30), note(34, -1)])[0], 'C7');
});

test('chord marks need three simultaneous voices', () => {
  const measure = [
    { d: 'w', n: 32, at: 0, v: 1 },
    { d: 'w', n: 30, at: 0, v: 2 },
    { d: 'w', n: 28, at: 0, v: 3 },
  ];
  const score = M.emptyScore();
  score.rows[0][0] = measure;
  assert.deepEqual(chordMarks(M.sanitize(score), M).map((mark) => mark.names), [['C']]);
  const dyad = M.emptyScore();
  dyad.rows[0][0] = measure.slice(0, 2);
  assert.deepEqual(chordMarks(M.sanitize(dyad), M), []);
});

test('the chord of a column is picked from the harmony of the whole line', async () => {
  const { pickChords } = await import('../src/client/chord-context.js');
  const column = (names, pcs) => ({ names, pcs });
  const dm7 = column(['Dm7', 'F6/D'], [2, 5, 9, 0]);
  const g7 = column(['G7'], [7, 11, 2, 5]);
  const ambiguous = column(['C6', 'Am7/C'], [0, 4, 7, 9]);
  assert.equal(pickChords([dm7, g7, ambiguous])[2][0], 'C6'); // ii-V-I: the context beats the sixth-degree bonus
  const am = column(['Am'], [9, 0, 4]);
  const e7 = column(['E7'], [4, 8, 11, 2]);
  assert.equal(pickChords([am, ambiguous, column(['Dm'], [2, 5, 9]), e7, am])[1][0], 'Am7/C');
  assert.deepEqual(pickChords([dm7, g7, ambiguous])[2], ['C6', 'Am7/C']);
  // Dm | E7 | C6/Am7: the sharp seventh of E7 points to A minor.
  assert.equal(pickChords([column(['Dm'], [2, 5, 9]), e7, ambiguous])[2][0], 'Am7/C');
});

test('note info names an arpeggio like the stacked chord, whatever the order or octave', async () => {
  const { noteInfo, lookupNames } = await import('../src/client/note-info.js');
  const stacked = noteInfo([note(28), note(30), note(32)]);
  const arpeggio = noteInfo([note(32), note(37), note(30), note(28), note(35)]);
  assert.deepEqual(stacked.chords, ['C']);
  assert.deepEqual(arpeggio.chords, ['C']);
  assert.deepEqual(stacked.notes.map((n) => n.label), ['C3', 'E3', 'G3']);
  assert.equal(noteInfo([note(28), note(35), note(30)]).classes, 2);
  assert.equal(noteInfo([note(28), note(35), note(30)]).chords.length, 0);
  assert.deepEqual(lookupNames('C/E'), ['C/E', 'C']);
});

test('interval names come from the written steps and the semitones', async () => {
  const { allIntervals, intervalOf } = await import('../src/client/note-info.js');
  const name = (a, b) => { const i = intervalOf(note(...[].concat(a)), note(...[].concat(b))); return [i.number, i.quality, i.semitones]; };
  assert.deepEqual(name(28, 30), [3, 'major', 4]);
  assert.deepEqual(name(28, [30, -1]), [3, 'minor', 3]);
  assert.deepEqual(name(28, 32), [5, 'perfect', 7]);
  assert.deepEqual(name(28, [31, 1]), [4, 'augmented', 6]); // do - fa#
  assert.deepEqual(name(28, [32, -1]), [5, 'diminished', 6]); // do - solb
  assert.deepEqual(name(28, 35), [8, 'perfect', 12]);
  assert.deepEqual(name(28, 37), [10, 'major', 16]); // decima
  assert.deepEqual(name(28, [28, 1]), [1, 'augmented', 1]);
  assert.deepEqual(name(32, 28), [5, 'perfect', 7]); // the order of the arguments does not matter
  assert.equal(allIntervals([note(28), note(30), note(32)]).length, 3);
  assert.equal(allIntervals([note(28), note(30), note(32), note(35)]).length, 6);
});

test('intervals are grouped in blocks: neighbours first, then each low note against the rest', async () => {
  const { intervalBlocks } = await import('../src/client/note-info.js');
  const show = (notes) => intervalBlocks(notes).map((block) => block.map((i) => [i.low.n, i.high.n]));
  assert.deepEqual(show([note(28), note(30), note(32)]), [[[30, 32], [28, 30]], [[28, 32]]]);
  assert.deepEqual(show([note(28), note(30), note(32), note(34)]), [
    [[32, 34], [30, 32], [28, 30]],
    [[28, 34], [28, 32]],
    [[30, 34]],
  ]);
});

test('the chord before and after the selection breaks the tie between candidates', async () => {
  const { noteInfo, rankByContext } = await import('../src/client/note-info.js');
  const info = noteInfo([note(28), note(30), note(32), note(33)]); // C E G A
  assert.deepEqual(info.chords, ['C6', 'Am7/C']);
  const column = (...steps) => { const notes = steps.map((n) => note(n)); return { names: chordNames(notes), pcs: notes.map((x) => x.midi % 12) }; };
  const key = { tonic: 0, mode: 'maj' };
  const dm = column(29, 31, 33), g7 = column(32, 34, 36, 38), g = column(32, 34, 36), c = column(28, 30, 32);
  // Dm -> ? -> G7 reads as the sixth degree; G -> ? -> C reads as a tonic sixth chord.
  assert.deepEqual(rankByContext(info, dm, g7, 0, key).chords, ['Am7/C', 'C6']);
  assert.deepEqual(rankByContext(info, g, c, 0, key).chords, ['C6', 'Am7/C']);
  assert.deepEqual([rankByContext(info, dm, g7, 0, key).before, rankByContext(info, dm, g7, 0, key).after], ['Dm', 'G7']);
  // One neighbour is enough, and none leaves the list as it was.
  assert.equal(rankByContext(info, dm, null, 0, key).after, null);
  assert.deepEqual(rankByContext(info, null, null, 0, key).chords, info.chords);
});
