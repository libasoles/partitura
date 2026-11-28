/* debug-timing.js — Datos para la pagina interna /debugger/. Sin DOM: los usa el navegador y los tests.

   Dos vistas del mismo compas:
   - `atTimeline`: lo que dice el modelo. Cada figura con su `at` (pista de orden guardada o deducida), su inicio real
     (`start`, el que calcula `arrange`) y su duracion. Si `at` != `start`, el `at` es una pista que el modelo ignora.
   - `xmlTimeline`: lo que se le entrega a Verovio. Se lee el MusicXML que escribe `toMusicXml` y se recorre igual que
     un lector: cada <note> avanza el cursor, <forward> lo adelanta sin escribir nada y <backup> lo retrocede.
   Todos los tiempos estan en divisiones del modelo (24 por negra). */

const round = (x) => Math.round(x * 1e6) / 1e6;

// Una entrada por figura del compas: `at` guardado o deducido, `start` real, duracion y voz.
export function atTimeline(M, score, mi) {
  const measure = M.measures(score)[mi] || [];
  // Lo que dura el compas al escribirlo: una anacrusa deducida del contexto dura solo lo escrito (ver `pickupLength`).
  const pickup = M.pickupLength(score, mi);
  const capacity = pickup === null ? M.capacity(score, mi) : pickup;
  const hints = M.hints(measure);
  const starts = M.onsets(measure);
  const voiceOf = [];
  M.voices(measure).forEach((lane, k) => lane.groups.forEach((g) => g.indices.forEach((i) => { voiceOf[i] = k + 1; })));
  const figures = measure.map((ev, i) => ({
    i,
    voice: voiceOf[i] || 1,
    at: hints[i],
    saved: Number.isInteger(ev.at),
    start: starts[i],
    dur: M.length(ev),
    rest: Boolean(ev.rest),
    d: ev.d,
    dot: ev.dot || 0,
    n: ev.n,
  }));
  const end = Math.max(0, ...figures.map((f) => f.start + f.dur));
  return { mi, capacity, pickup: pickup !== null, end, span: Math.max(capacity, end), voices: Math.max(1, ...figures.map((f) => f.voice)), figures };
}

const attr = (text, name) => new RegExp(`${name}="([^"]*)"`).exec(text)?.[1];

// Recorre el MusicXML de `toMusicXml(score)` compas por compas. Cada item: { kind, voice, start, dur, index? }.
// kind: 'note' | 'rest' (visibles), 'hidden' (silencio oculto) o 'forward' (espera sin figura).
export function xmlTimelines(xml) {
  const divisions = +(/<divisions>(\d+)<\/divisions>/.exec(xml)?.[1] || 24);
  const unit = 24 / divisions;
  return [...xml.matchAll(/<measure\b[^>]*>([\s\S]*?)<\/measure>/g)].map((measure, mi) => {
    let cursor = 0;
    let previous = 0;
    const items = [];
    for (const match of measure[1].matchAll(/<(note|forward|backup)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
      const [, tag, attrs, body] = match;
      const dur = round(+(/<duration>([\d.]+)<\/duration>/.exec(body)?.[1] || 0) * unit);
      const voice = +(/<voice>(\d+)<\/voice>/.exec(body)?.[1] || 1);
      if (tag === 'backup') { cursor = round(cursor - dur); continue; }
      if (tag === 'forward') {
        items.push({ kind: 'forward', voice, start: cursor, dur });
        cursor = round(cursor + dur);
        continue;
      }
      const rest = /<rest\b/.test(body);
      const hidden = /print-object="no"/.test(attrs) || /<rest\b[^>]*print-object="no"/.test(body);
      const start = /<chord\s*\/>/.test(body) ? previous : cursor;
      const id = /^e(\d+)-(\d+)$/.exec(attr(attrs, 'id') || '');
      items.push({ kind: rest ? (hidden ? 'hidden' : 'rest') : 'note', voice, start, dur, ...(id ? { index: +id[2] } : {}) });
      previous = start;
      if (!/<chord\s*\/>/.test(body)) cursor = round(cursor + dur);
    }
    return { mi, items };
  });
}

export function xmlTimeline(M, score, mi) {
  return xmlTimelines(M.toMusicXml(score))[mi] || { mi, items: [] };
}

// Resumen que se muestra con los dos graficos: cuanto espera cada voz antes de cada figura.
export function forwardsOf(timeline) {
  return timeline.items.filter((item) => item.kind === 'forward');
}

// Donde cae lo que se escribe con una figura en (t, n) del compas `mi`, sin tocar la partitura. Es el mismo camino que
// el editor (score-editor.js, al hacer clic con una herramienta): `placement` pide un `at`, y `insertNote` /
// `placeRest` / `placeBefore` lo asientan. `trial` es una copia de la partitura con la figura ya puesta.
export function planPlacement(M, score, tool, target) {
  const { mi, t, n } = target;
  const ev = { d: tool.d, ...(tool.rest ? { rest: true } : { n }), ...(tool.dot ? { dot: true } : {}) };
  const trial = M.clone(score);
  const measure = M.measures(trial)[mi];
  let index;
  let requested = t;
  if (Number.isFinite(target.beforeAt)) {
    const placed = M.placeBefore(measure, ev, target.beforeAt, n, trial, mi, 0);
    if (!placed.measure) return { ok: false, reason: 'No entra (compás lleno)', path: 'placeBefore' };
    measure.splice(0, measure.length, ...placed.measure);
    index = placed.index;
    requested = target.beforeAt;
    return { ok: true, trial, index, mi, ev, requested, path: 'placeBefore (intercala antes de at ' + target.beforeAt + ')' };
  }
  const spot = M.placement(measure, ev, t, trial, mi);
  if (!spot) return { ok: false, reason: 'placement devuelve null: repite una nota igual en ese at, o se pasa de 4 voces', path: 'placement' };
  requested = spot.at;
  if (tool.rest) {
    const placed = M.placeRest(measure, Object.assign({}, ev, { d: spot.d, ...(spot.dot ? { dot: true } : {}) }), spot.at, n, trial, mi, Boolean(target.beforeFirst), 0);
    if (!placed.measure) return { ok: false, reason: placed.full ? 'No entra (compás lleno)' : 'Esa voz ya está llena', path: 'placeRest' };
    measure.splice(0, measure.length, ...placed.measure);
    index = placed.index;
    return { ok: true, trial, index, mi, ev, requested, path: 'placement → placeRest' };
  }
  index = M.insertNote(measure, Object.assign({}, ev, { d: spot.d, ...(spot.dot ? { dot: true } : {}) }), spot.at);
  return { ok: true, trial, index, mi, ev, requested, path: 'placement → insertNote → settle' };
}
