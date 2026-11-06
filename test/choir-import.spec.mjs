import { test, expect } from '@playwright/test';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Tres voces en un solo pentagrama; la 1 y la 2 coinciden en sol (unisono) en el primer tiempo.
const note = (step, octave, duration, type, voice, extra = '') => `<note><pitch><step>${step}</step><octave>${octave}</octave></pitch><duration>${duration}</duration><voice>${voice}</voice><type>${type}</type>${extra}</note>`;
const restNote = (voice) => `<note><rest measure="yes"/><duration>3</duration><voice>${voice}</voice></note>`;
const xml = (body, extra = '') => `<?xml version="1.0"?><score-partwise version="3.1"><work><work-title>Coro</work-title></work><part-list><score-part id="P1"><part-name>x</part-name></score-part></part-list><part id="P1"><measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>3</beats><beat-type>4</beat-type></time><clef><sign>G</sign><line>2</line><clef-octave-change>-1</clef-octave-change></clef></attributes>${body}</measure>${extra}</part></score-partwise>`;
const back = '<backup><duration>3</duration></backup>';
const threeVoices = xml(
  note('G', 4, 2, 'half', 1) + note('B', 4, 1, 'quarter', 1) + back
  + note('G', 4, 3, 'half', 2, '<dot/>') + back
  + note('D', 4, 2, 'half', 3) + note('F', 4, 1, 'quarter', 3),
);
const withSilentVoice = xml(note('G', 4, 3, 'half', 1, '<dot/>') + back + note('C', 4, 3, 'half', 2, '<dot/>') + back + restNote(3));
const oneVoice = xml(note('G', 4, 3, 'half', 1, '<dot/>'));

async function parse(page, url, sources) {
  await page.goto(url);
  await page.waitForFunction(() => window.scoreEditor);
  const parser = buildSync({
    entryPoints: [fileURLToPath(new URL('../src/client/score-io.js', import.meta.url))],
    bundle: true, write: false, format: 'iife', globalName: 'TestScoreIO',
  });
  await page.addScriptTag({ content: parser.outputFiles[0].text });
  return page.evaluate((sources) => {
    const M = window.ScoreModel;
    const IO = window.TestScoreIO.default;
    return sources.map((source) => {
      const score = IO.parseMusicXml(source, M);
      const pitches = (measure) => (measure || []).filter((ev) => !ev.rest).map((ev) => `${ev.n}:${ev.d}${ev.dot ? '.' : ''}`);
      return {
        lyrics: score.lyrics,
        instrument: M.instrumentOf(score),
        staves: M.stavesOf(score),
        registers: [0, 1, 2].map((k) => M.registerOf(score, k)),
        clefs: [0, 1, 2].map((k) => M.clefOf(score, k)),
        lanes: [score.rows[0][0], score.lower?.[0], score.lower2?.[0], score.lower3?.[0]].map(pitches),
      };
    });
  }, sources);
}

test('with Voces (#pro), independent voices of one staff go to one staff each, unison included', async ({ page }) => {
  const [three, silent, one] = await parse(page, '/es/#pro', [threeVoices, withSilentVoice, oneVoice]);
  expect(three.instrument).toBe('voices');
  expect(three.staves).toBe(3);
  // sol4 = 39, si4 = 41, re4 = 36, fa4 = 38
  expect(three.lanes).toEqual([['39:h', '41:q'], ['39:h.'], ['36:h', '38:q'], []]);
  // The file's clef (treble 8) goes to every staff through the tenor register.
  expect(three.registers).toEqual(['tenor', 'tenor', 'tenor']);
  expect(three.clefs).toEqual(['guitar', 'guitar', 'guitar']);
  // A voice that only has rests does not get a staff.
  expect(silent.staves).toBe(2);
  expect(silent.lanes.slice(0, 2)).toEqual([['39:h.'], ['35:h.']]);
  // A single voice keeps the usual import.
  expect(one.instrument).not.toBe('voices');
});

test('lyrics in the file become syllables on the staff of their voice', async ({ page }) => {
  const lyric = (text) => `<lyric number="1"><syllabic>single</syllabic><text>${text}</text></lyric>`;
  const sung = xml(
    note('G', 4, 2, 'half', 1, lyric('Quien')) + note('B', 4, 1, 'quarter', 1) + back
    + note('G', 4, 3, 'half', 2, `<dot/>${lyric('su')}`) + back
    + note('D', 4, 2, 'half', 3) + note('F', 4, 1, 'quarter', 3, lyric('frey')),
  );
  const [result] = await parse(page, '/es/#pro', [sung]);
  expect(result.lyrics).toEqual({ 0: [{ at: 0, text: 'Quien' }, { at: 0, text: 'su', s: 1 }, { at: 48, text: 'frey', s: 2 }] });
});

test('without Voces the import is unchanged', async ({ page }) => {
  const [three] = await parse(page, '/es/', [threeVoices]);
  expect(three.instrument).not.toBe('voices');
  expect(three.staves).toBeLessThanOrEqual(2);
});
