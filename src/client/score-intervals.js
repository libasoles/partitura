// Diatonic intervals between neighbouring sounding pitches. Piano: independently on each staff. Voices (choir):
// each staff is one line, so the intervals are taken between the staves.
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

// Roman numerals show the distance between notes (I = unison, III = third, VIII = octave).
const roman = (value) => {
  let label = '';
  for (const [number, numeral] of [[50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']]) {
    while (value >= number) {
      label += numeral;
      value -= number;
    }
  }
  return label;
};

// Whether the score has any simultaneous notes for the toggle to label.
export function hasIntervals(score, M) {
  if (M.instrumentOf(score) === 'voices') return M.measures(score).some((_, mi) => choirColumns(score, mi, M).length);
  return M.measures(score).some((measure, mi) => [measure, ...(M.stavesOf(score) > 1 ? [score.lower?.[mi] || []] : [])].some((lane) => intervalColumns(lane, M).length));
}

// Choir columns: every sounding note of every visible staff at each onset, highest first. `n` is already the
// sounding diatonic pitch, so staves with different clefs compare directly. The mark hangs from the first staff
// that starts a note at that time.
export function choirColumns(score, mi, M) {
  const lanes = Array.from({ length: M.stavesOf(score) }, (_, staff) => {
    const measure = M.measures(score, staff)[mi] || [];
    return { staff, measure, starts: M.onsets(measure) };
  });
  const times = [...new Set(lanes.flatMap(({ measure, starts }) => starts.filter((_, i) => !measure[i].rest)))].sort((a, b) => a - b);
  return times.flatMap((at) => {
    const sounding = lanes.flatMap(({ staff, measure, starts }) => measure
      .map((note, i) => ({ note, i, staff }))
      .filter(({ note, i }) => !note.rest && starts[i] <= at && starts[i] + M.length(note) > at))
      .sort((a, b) => b.note.n - a.note.n || a.staff - b.staff || a.i - b.i);
    if (sounding.length < 2) return [];
    const owner = lanes.find(({ measure, starts }) => measure.some((note, i) => !note.rest && starts[i] === at));
    if (!owner) return [];
    const intervals = sounding.slice(1).map(({ note }, k) => roman(sounding[k].note.n - note.n + 1));
    return [{ at, staff: owner.staff, indices: owner.measure.flatMap((_, i) => owner.starts[i] === at ? [i] : []), intervals }];
  });
}

// Editor-only directions let the engraver reserve room above beams and high notes.
// The stored score and the exported MusicXML keep their original notation.
export function withIntervals(xml, score, M) {
  const marks = new Map();
  const upper = M.measures(score);
  if (M.instrumentOf(score) === 'voices') {
    upper.forEach((_, mi) => choirColumns(score, mi, M).forEach((column) => {
      const mark = { staff: column.staff, intervals: column.intervals, done: false };
      column.indices.forEach((i) => marks.set(`${M.ID_PREFIX[column.staff]}${mi}-${i}`, mark));
    }));
  } else {
    for (let staff = 0; staff < M.stavesOf(score); staff++) {
      upper.forEach((measure, mi) => {
        intervalColumns(staff ? score.lower?.[mi] || [] : measure, M).forEach((column) => {
          const mark = { staff, intervals: column.intervals, done: false };
          column.indices.forEach((i) => marks.set(`${staff ? 'l' : 'e'}${mi}-${i}`, mark));
        });
      });
    }
  }
  return xml.replace(/<note id="([elpq]\d+-\d+)">/g, (note, id) => {
    const mark = marks.get(id);
    if (!mark || mark.done) return note;
    mark.done = true;
    return `<direction placement="above"><direction-type><words font-family="PartituraIntervals" font-style="normal" justify="center">${mark.intervals.join('\n')}</words></direction-type>${M.stavesOf(score) > 1 ? `<staff>${mark.staff + 1}</staff>` : ''}</direction>` + note;
  });
}
