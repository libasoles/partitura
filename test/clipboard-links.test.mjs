import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScoreModel } from '../src/client/score-model.js';

const M = createScoreModel({ grandStaff: true });

for (const type of ['tie', 'slur']) for (const staff of [0, 1]) {
  for (const placement of ['within measure', 'across measures', 'across rows']) {
    test(`copy/paste preserves ${type} on staff ${staff} ${placement}`, () => {
      const score = { ...M.emptyScore(), instrument: 'piano' };
      const from = placement === 'across rows' ? 3 : 0;
      const to = placement === 'within measure' ? from : from + 1;
      const lane = M.measures(score, staff);
      lane[from].push({ d: to === from ? 'h' : 'w', n: staff ? 25 : 37, [type]: true, v: 2 });
      lane[to].push({ d: 'h', n: (staff ? 25 : 37) + (type === 'slur' ? 2 : 0), v: 2 });
      const refs = [M.refOf(staff, from, 0), M.refOf(staff, to, to === from ? 1 : 0)];
      const fragment = JSON.parse(JSON.stringify(M.copySelection(score, refs)));
      assert.equal(fragment.measures[0][0][type], true);
      const target = { ...M.emptyScore(), instrument: 'piano' };
      const pasted = M.pasteSelection(target, fragment, 2, { staff: 1 - staff });
      assert.equal(pasted.length, 2);
      assert.deepEqual(M.links(target), [{ type, from: pasted[0], to: pasted[1] }]);
      const restored = M.sanitize(JSON.parse(JSON.stringify(target)));
      assert.deepEqual(M.links(restored), M.links(target));
      assert.equal(M.measures(score, staff)[from][0][type], true);
    });
  }

  test(`copy/paste excludes an incomplete ${type} on staff ${staff}`, () => {
    const score = { ...M.emptyScore(), instrument: 'piano' };
    const lane = M.measures(score, staff);
    lane[0].push({ d: 'w', n: 37, [type]: true });
    lane[1].push({ d: 'w', n: type === 'tie' ? 37 : 38 });
    for (const mi of [0, 1]) {
      const fragment = M.copySelection(score, [M.refOf(staff, mi, 0)]);
      assert.ok(!fragment.measures[0][0].tie && !fragment.measures[0][0].slur);
      const target = { ...M.emptyScore(), instrument: 'piano' };
      M.measures(target, staff)[3].push({ d: 'w', n: type === 'tie' ? 37 : 38 });
      assert.ok(M.pasteSelection(target, fragment, 2));
      assert.deepEqual(M.links(target), []);
    }
  });
}

test('a two-staff clipboard fragment preserves each staff’s links independently', () => {
  const score = { ...M.emptyScore(), instrument: 'piano' };
  for (const staff of [0, 1]) {
    const lane = M.measures(score, staff);
    lane[0].push({ d: 'h', n: staff ? 25 : 37, [staff ? 'slur' : 'tie']: true });
    lane[0].push({ d: 'h', n: staff ? 27 : 37 });
  }
  const fragment = M.copySelection(score, [0, 1].flatMap(staff => [0, 1].map(i => M.refOf(staff, 0, i))));
  const target = { ...M.emptyScore(), instrument: 'piano' };
  assert.equal(M.pasteSelection(target, fragment, 2).length, 4);
  assert.deepEqual(M.links(target).map(link => link.type), ['tie', 'slur']);
});
