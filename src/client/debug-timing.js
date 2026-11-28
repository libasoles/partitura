/* debug-timing.js — Datos para la pagina interna /debugger/. Sin DOM: los usa el navegador y los tests.

   Dos vistas del mismo compas:
   - `atTimeline`: lo que dice el modelo. Cada figura con su `at` (pista de orden guardada o deducida), su inicio real
     (`start`, el que calcula `arrange`) y su duracion. Si `at` != `start`, el `at` es una pista que el modelo ignora.
   - `xmlTimeline`: lo que se le entrega a Verovio. Se lee el MusicXML que escribe `toMusicXml` y se recorre igual que
     un lector: cada <note> avanza el cursor, <forward> lo adelanta sin escribir nada y <backup> lo retrocede.
   Todos los tiempos estan en divisiones del modelo (24 por negra). Cada item lleva su pentagrama (`staff`, desde 0). */

const round = (x) => Math.round(x * 1e6) / 1e6;

// Una entrada por figura del compas: `at` guardado o deducido, `start` real, duracion y voz.
export function atTimeline(M, score, mi, staff = 0) {
  const measure = M.measures(score, staff)[mi] || [];
  // El editor siempre dibuja el compas completo; `pickup` solo avisa que al exportar seria una anacrusa (ver `pickupLength`).
  const pickup = M.pickupLength(score, mi);
  const capacity = M.capacity(score, mi);
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
  return { mi, staff, capacity, pickup: pickup !== null, end, span: Math.max(capacity, end), voices: Math.max(1, ...figures.map((f) => f.voice)), figures };
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
      const staff = +(/<staff>(\d+)<\/staff>/.exec(body)?.[1] || 1) - 1;
      if (tag === 'backup') { cursor = round(cursor - dur); continue; }
      if (tag === 'forward') {
        items.push({ kind: 'forward', voice, staff, start: cursor, dur });
        cursor = round(cursor + dur);
        continue;
      }
      const rest = /<rest\b/.test(body);
      const hidden = /print-object="no"/.test(attrs) || /<rest\b[^>]*print-object="no"/.test(body);
      const start = /<chord\s*\/>/.test(body) ? previous : cursor;
      const id = /^[elpq](\d+)-(\d+)$/.exec(attr(attrs, 'id') || '');
      items.push({ kind: rest ? (hidden ? 'hidden' : 'rest') : 'note', voice, staff, start, dur, ...(id ? { index: +id[2] } : {}) });
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
