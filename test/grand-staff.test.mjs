import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreModel } from '../src/client/score-model.js';

const G = createScoreModel({ grandStaff: true });
const plain = createScoreModel();

function piano() {
  const score = G.emptyScore();
  score.rows[0][0] = [{ d: 'q', n: 37 }, { d: 'q', n: 39 }];
  score.rows[0][1] = [{ d: 'w', n: 35 }];
  score.lower = { 0: [{ d: 'h', n: 25 }, { d: 'h', n: 27 }], 1: [{ d: 'w', n: 23 }] };
  return G.sanitize(score);
}

test('the grand staff is a piano feature, enabled by the host', () => {
  assert.equal(G.stavesOf(G.emptyScore()), 2);
  assert.equal(plain.stavesOf(plain.emptyScore()), 1);
  assert.equal(G.stavesOf({ ...G.emptyScore(), instrument: 'guitar' }), 1);
  assert.equal(createScoreModel({ grandStaff: true, defaultClef: 'guitar' }).stavesOf(G.emptyScore()), 1);
});

test('saved scores without a second staff load unchanged, and an explicit lower clef is kept', () => {
  const old = plain.emptyScore();
  old.rows[0][0] = [{ d: 'q', n: 37, at: 0 }];
  const once = G.sanitize(old);
  assert.deepEqual(once, plain.sanitize(old));
  assert.ok(!('lower' in once) && !('lowerClef' in once) && !('lowerClefs' in once));
  assert.equal(G.clefOf(once, 1), 'bass');
  const explicit = G.sanitize({ ...old, lowerClef: 'treble', lowerClefs: { 2: 'alto', 1: 'treble' } });
  assert.equal(explicit.lowerClef, 'treble');
  assert.deepEqual(explicit.lowerClefs, { 2: 'alto' });
  assert.equal(G.clefAt(explicit, 3, 1), 'alto');
});

test('sanitize cleans the second staff like the first and drops what does not fit', () => {
  const score = piano();
  assert.deepEqual(Object.keys(score.lower), ['0', '1']);
  const dirty = G.sanitize({ ...score, lower: { 0: [{ d: 'zz', n: 1 }, { d: 'q', n: 25 }], 1: [], 99: [{ d: 'q', n: 25 }], 2: 'x' } });
  assert.deepEqual(dirty.lower, { 0: [{ d: 'q', n: 25, at: 0 }] });
  const tooLong = G.sanitize({ ...score, lower: { 0: [{ d: 'w', n: 25 }, { d: 'w', n: 27 }] } });
  assert.equal(G.measureLength(tooLong.lower[0]), 96);
  assert.deepEqual(G.sanitize(JSON.parse(JSON.stringify(score))), score);
});

test('each staff has its own clefs; keys, meters and measure shape are shared', () => {
  const score = piano();
  assert.equal(G.clefAt(score, 0), 'treble');
  assert.equal(G.clefAt(score, 0, 1), 'bass');
  assert.ok(G.setClef(score, 2, 'tenor', 1));
  assert.equal(G.clefAt(score, 3, 1), 'tenor');
  assert.equal(G.clefAt(score, 3), 'treble');
  assert.ok(G.setClef(score, 0, 'alto'));
  assert.equal(G.clefOf(score, 1), 'bass');
  G.setClef(score, 2, 'bass', 1);
  assert.ok(!score.lowerClefs, 'a change that repeats the previous clef is pruned');
  assert.equal(G.bottomLine(score, 1, 1), G.CLEFS.bass.bottom);
});

test('inserting, removing, moving and splitting measures carry the second staff along', () => {
  const insert = piano();
  assert.ok(G.insertMeasure(insert, 1));
  assert.deepEqual(Object.keys(insert.lower), ['0', '2']);
  assert.ok(G.removeMeasureAt(insert, 0));
  assert.deepEqual(Object.keys(insert.lower), ['1']);

  const move = piano();
  assert.ok(G.moveMeasure(move, 0, 2));
  assert.equal(move.lower[1][0].n, 25, 'the measure and its lower staff land together');
  assert.equal(move.lower[0].length, 1);

  const split = piano();
  assert.ok(G.setBarline(split, 0, 'double', 48));
  assert.equal(split.lower[0].length, 1);
  assert.equal(split.lower[1].length, 1);
  assert.equal(split.lower[1][0].n, 27);
  assert.equal(split.lower[2][0].n, 23, 'the next measure shifts');
  assert.equal(G.measureLength(split.lower[0]), 48);

  const tied = piano();
  tied.lower[0][1].tie = true;
  G.moveMeasure(tied, 1, 0);
  assert.ok(!tied.lower[1][1].tie, 'a tie does not survive losing its neighbour');
});

test('a clef change on the lower staff follows its measure when measures move', () => {
  const score = piano();
  G.setClef(score, 1, 'treble', 1);
  G.moveMeasure(score, 1, 0);
  assert.equal(score.lowerClef, 'treble');
  assert.equal(G.clefAt(score, 1, 1), 'bass');
});

test('selection actions act on one staff at a time', () => {
  const score = piano();
  score.lower[0] = [{ d: 'e', n: 25 }, { d: 'e', n: 27 }, { d: 'e', n: 29 }];
  const lowerRefs = [0, 1, 2].map((i) => G.refOf(1, 0, i));
  assert.deepEqual(G.selectionActions(score, lowerRefs), ['triplet', 'beam', 'unbeam']);
  assert.ok(G.applySelection(score, lowerRefs, 'triplet'));
  assert.ok(score.lower[0].every((ev) => ev.tp));
  assert.ok(!score.rows[0][0].some((ev) => ev.tp));
  assert.deepEqual(G.selectionActions(score, [G.refOf(0, 0, 0), G.refOf(1, 0, 0)]), []);
  const tie = piano();
  tie.lower[0] = [{ d: 'h', n: 25 }, { d: 'h', n: 27 }];
  tie.lower[1] = [{ d: 'w', n: 27 }];
  assert.ok(G.applySelection(tie, [G.refOf(1, 0, 1), G.refOf(1, 1, 0)], 'link'));
  assert.ok(tie.lower[0][1].tie);
  assert.deepEqual(G.links(tie), [{ type: 'tie', from: { s: 1, mi: 0, i: 1 }, to: { s: 1, mi: 1, i: 0 } }]);
});

test('copy and paste keep each selection in its staff and can retarget it', () => {
  const score = piano();
  const lower = G.copySelection(score, [G.refOf(1, 0, 0)]);
  assert.equal(lower.staff, 1);
  assert.equal(lower.measures[0][0].n, 25);
  const both = G.copySelection(score, [G.refOf(0, 0, 0), G.refOf(1, 0, 0)]);
  assert.equal(both.lower[0][0].n, 25);
  assert.ok(!('staff' in both));

  const target = piano();
  const refs = G.pasteSelection(target, lower, 2);
  assert.deepEqual(refs, [{ s: 1, mi: 2, i: 0 }]);
  assert.equal(target.lower[2][0].n, 25);
  assert.ok(!target.rows[0][2].length);

  const retarget = piano();
  assert.deepEqual(G.pasteSelection(retarget, lower, 2, { staff: 0 }), [{ mi: 2, i: 0 }]);
  assert.equal(retarget.rows[0][2][0].n, 25);

  const pair = piano();
  assert.equal(G.pasteSelection(pair, both, 3).length, 2);
  assert.equal(pair.lower[3][0].n, 25);
  assert.equal(pair.rows[0][3][0].n, 37);

  const single = createScoreModel();
  const guitar = single.emptyScore();
  assert.deepEqual(single.pasteSelection(guitar, lower, 0), [{ mi: 0, i: 0 }], 'without a second staff it goes to the first');
});

test('the written octave of a pasted note follows the clef of its staff', () => {
  const score = piano();
  G.setClef(score, 0, 'guitar');
  const fragment = G.copySelection(score, [G.refOf(1, 0, 0)]);
  G.pasteSelection(score, fragment, 2, { staff: 0 });
  assert.equal(score.rows[0][2][0].n, 25 + 7, 'a bass note keeps its sound under the guitar clef');
});

test('duplicate continues the staff it started in', () => {
  const score = piano();
  const refs = G.duplicateSelection(score, [G.refOf(1, 0, 0)]);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].s, 1);
  assert.equal(score.lower[0].filter((ev) => ev.n === 25).length, 2, 'the copy lands after the original, in the lower staff');
  assert.equal(score.rows[0][0].length, 2, 'the upper staff is untouched');
});

test('voices are inferred per staff, never merged across staves', () => {
  const score = piano();
  score.rows[0][0] = [{ d: 'q', n: 37 }];
  score.lower[0] = [{ d: 'q', n: 25 }];
  assert.equal(G.voices(score.rows[0][0]).length, 1);
  score.lower[0] = [{ d: 'q', n: 25, at: 0 }, { d: 'q', n: 27, at: 0 }];
  G.settleVoices(score.lower[0]);
  assert.deepEqual(score.lower[0].map((ev) => ev.v), [2, 1], 'two simultaneous notes stay two voices in the lower staff');
  assert.equal(G.voices(score.rows[0][0]).length, 1, 'the upper staff does not borrow them');
  assert.equal(G.measureLength(score.rows[0][0]), 24);
});

test('MusicXML writes one part with two staves, a brace and a staff per note', () => {
  const score = piano();
  G.setClef(score, 1, 'treble', 1);
  const xml = G.toMusicXml(score);
  assert.equal(xml.match(/<part id=/g).length, 1);
  assert.ok(xml.includes('<staves>2</staves>'));
  assert.ok(xml.includes('<clef number="1"><sign>G</sign>'));
  assert.ok(xml.includes('<clef number="2"><sign>F</sign>'));
  assert.ok(xml.includes('<clef number="2"><sign>G</sign><line>2</line></clef></attributes>'), 'the second staff changes clef on its own');
  const staffTwo = xml.match(/<staff>2<\/staff>/g).length;
  assert.ok(staffTwo >= 3);
  assert.ok(xml.includes('id="l0-0"') && xml.includes('id="e0-0"'));
  assert.ok(/<backup><duration>96<\/duration><\/backup>/.test(xml));
  const voices = [...xml.matchAll(/<voice>(\d+)<\/voice>/g)].map((m) => +m[1]);
  assert.ok(voices.some((v) => v > G.MAX_VOICE), 'the lower staff has its own voice numbers');
});

test('MusicXML of one staff is unchanged when the grand staff is off or the instrument is a guitar', () => {
  const score = piano();
  const off = plain.toMusicXml(score);
  assert.ok(!off.includes('<staves>') && !off.includes('<staff>'));
  const guitar = G.toMusicXml({ ...score, instrument: 'guitar' });
  assert.equal(guitar, off);
});

test('every measure of the MusicXML adds up: the cursor never goes before the bar and ends on its length', () => {
  const score = piano();
  score.lower[2] = [{ d: 'q', n: 25 }];
  score.lower[0][0].v = 1;
  score.lower[0].push({ d: 'h', n: 20, at: 0, v: 2 });
  for (const xml of [G.toMusicXml(score), G.toMusicXml(G.sanitize({ ...G.emptyScore(), lower: { 0: [{ d: 'w', n: 25 }] } }))]) {
    for (const [, body] of xml.matchAll(/<measure [^>]*>(.*?)<\/measure>/g)) {
      let cursor = 0;
      for (const [, tag, rest] of body.matchAll(/<(note|backup)[ >](.*?)<\/\1>/g)) {
        const duration = +rest.match(/<duration>(\d+)<\/duration>/)[1];
        if (tag === 'backup') cursor -= duration;
        else if (!rest.includes('<chord/>')) cursor += duration;
        assert.ok(cursor >= 0);
      }
      assert.equal(cursor, 96);
    }
  }
});

test('switching instrument keeps the hidden staff and the shared signatures', () => {
  const score = piano();
  G.setInstrument(score, 'guitar');
  assert.equal(G.stavesOf(score), 1);
  assert.equal(score.lower[0].length, 2);
  G.setInstrument(score, 'piano');
  assert.equal(G.stavesOf(score), 2);
  assert.equal(G.clefAt(score, 0, 1), 'bass');
});

test('a meter that does not fit the lower staff is refused', () => {
  const score = piano();
  assert.equal(G.setMeter(score, '2/4'), false);
  assert.equal(score.meter, '4/4');
});

test('changing a clef pins the inferred instrument so the number of staves does not change', () => {
  const guitarClef = G.sanitize({ ...G.emptyScore(), clef: 'guitar' });
  assert.equal(G.instrumentOf(guitarClef), 'guitar');
  G.setClef(guitarClef, 0, 'treble');
  assert.equal(G.instrumentOf(guitarClef), 'guitar');
  assert.equal(G.stavesOf(guitarClef), 1);
  const pianoScore = G.emptyScore();
  G.setClef(pianoScore, 0, 'guitar');
  assert.equal(G.stavesOf(pianoScore), 2, 'an explicit instrument is not overridden');
  assert.equal(pianoScore.instrument, 'piano');
});

test('a two-staff fragment pastes into both staves whatever staff was asked for', () => {
  const score = piano();
  const both = G.copySelection(score, [G.refOf(0, 0, 0), G.refOf(1, 0, 0)]);
  const target = piano();
  assert.equal(G.pasteSelection(target, both, 3, { staff: 1 }).length, 2);
  assert.equal(target.rows[0][3][0].n, 37);
  assert.equal(target.lower[3][0].n, 25);
});
