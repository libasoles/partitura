// Diatonic intervals between neighbouring sounding pitches, independently on each staff.
export function intervalColumns(measure, M) {
  const starts = M.onsets(measure);
  const times = [...new Set(starts.filter((_, i) => !measure[i].rest))].sort((a, b) => a - b);
  return times.flatMap((at) => {
    const sounding = measure.map((note, i) => ({ note, i }))
      .filter(({ note, i }) => !note.rest && starts[i] <= at && starts[i] + M.length(note) > at)
      .sort((a, b) => b.note.n - a.note.n || a.i - b.i);
    if (sounding.length < 2) return [];
    const intervals = sounding.slice(1).map(({ note }, i) => roman(sounding[i].note.n - note.n + 1));
    return [{ at, indices: measure.flatMap((_, i) => starts[i] === at ? [i] : []), intervals }];
  });
}

function roman(value) {
  let result = '';
  for (const [number, symbol] of [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) {
    while (value >= number) { result += symbol; value -= number; }
  }
  return result;
}

// Editor-only directions let the engraver reserve room above beams and high notes.
// The stored score and the exported MusicXML keep their original notation.
export function withIntervals(xml, score, M) {
  const marks = new Map();
  const upper = M.measures(score);
  for (let staff = 0; staff < M.stavesOf(score); staff++) {
    upper.forEach((measure, mi) => {
      intervalColumns(staff ? score.lower?.[mi] || [] : measure, M).forEach((column) => {
        const mark = { staff, intervals: column.intervals, done: false };
        column.indices.forEach((i) => marks.set(`${staff ? 'l' : 'e'}${mi}-${i}`, mark));
      });
    });
  }
  return xml.replace(/<note id="([el]\d+-\d+)">/g, (note, id) => {
    const mark = marks.get(id);
    if (!mark || mark.done) return note;
    mark.done = true;
    return `<direction placement="above"><direction-type><words font-family="PartituraIntervals" font-style="normal" justify="center">${mark.intervals.join('\n')}</words></direction-type>${M.stavesOf(score) > 1 ? `<staff>${mark.staff + 1}</staff>` : ''}</direction>` + note;
  });
}
