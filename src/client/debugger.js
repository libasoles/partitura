/* debugger.js — Pagina interna /debugger/ (no indexada). Corre el editor REAL (score-editor.js, el mismo del sitio, con su
   modelo, herramientas, seleccion, arrastre, voces, reproduccion y deshacer). Cada pestana del editor es un caso. Lo unico
   propio es el panel de abajo: para la partitura abierta muestra, compas por compas y pentagrama por pentagrama, donde queda
   cada figura segun `at` y segun el MusicXML (<note> y <forward>), con los mismos metodos del modelo.
   El editor guarda con `window.ScoreStore.save` en cada cambio: aqui esa funcion escribe en el localStorage del debugger
   (nunca en el IndexedDB de las partituras del usuario) y vuelve a dibujar el panel. */
import './globals.js';
import './tooltip-bounds.js';
import { createScoreModel } from './score-model.js';
import start from './score-editor.js';
import { isPro } from './pro.js';
import { atTimeline, xmlTimelines } from './debug-timing.js';

const STORAGE = 'partitura.debugger.v2';
const LEGACY = 'partitura.debugger.v1'; // casos de antes: { cases: [{ title, score }] }
const NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

const $ = (selector, root = document) => root.querySelector(selector);

function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (value === false || value == null) return;
    if (key === 'class') node.className = value;
    else if (key === 'style') node.style.cssText = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else node.setAttribute(key, value === true ? '' : value);
  });
  node.append(...children.flat().filter((child) => child != null && child !== false));
  return node;
}

const pitchName = (n) => (Number.isFinite(n) ? NAMES[((n % 7) + 7) % 7] + (Math.floor(n / 7) - 1) : '—');

// ---- almacenamiento propio del debugger -----------------------------------------------------------------------------

function readStored() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    if (data && Array.isArray(data.scores) && data.scores.length) return data;
    const old = JSON.parse(localStorage.getItem(LEGACY) || 'null');
    if (old && Array.isArray(old.cases) && old.cases.length) {
      const scores = old.cases.filter((c) => c && c.score && Array.isArray(c.score.rows)).map((c) => ({ ...c.score, title: String(c.title || 'Caso') }));
      if (scores.length) return { active: 0, scores };
    }
  } catch { /* se arranca de cero */ }
  return null;
}

// ---- graficos ---------------------------------------------------------------------------------------------------

const voiceClass = (v) => 'v' + Math.min(Math.max(v, 1), 5);
const pct = (t, span) => (t / span * 100) + '%';

function axis(span, capacity) {
  const ticks = [];
  for (let t = 0; t <= span; t += 24) ticks.push(h('span', { class: 'tick', style: `left:${pct(t, span)}` }, String(t)));
  return h('div', { class: 'axis' }, ticks, span > capacity ? h('span', { class: 'cap', style: `left:${pct(capacity, span)}`, title: 'capacidad del compás' }, 'cap ' + capacity) : null);
}

function lane(voice, span, boxes) {
  return h('div', { class: 'lane ' + voiceClass(voice) },
    h('span', { class: 'lane-name' }, 'voz ' + voice),
    h('div', { class: 'track' }, boxes));
}

function box(cls, start, dur, span, label, title) {
  return h('div', { class: 'sq ' + cls, style: `left:${pct(start, span)};width:max(${pct(dur, span)},6px)`, title: title || label },
    h('span', { class: 'sq-label' }, label));
}

// "at": cada figura donde dice su `at`; si el modelo la pone en otro lugar (`start`), se marca con un cuadro punteado.
function atGraph(data, highlight) {
  const rows = [];
  for (let v = 1; v <= data.voices; v += 1) {
    const boxes = [];
    data.figures.filter((f) => f.voice === v).forEach((f) => {
      const cls = (f.rest ? 'is-rest ' : '') + (f.i === highlight ? 'is-new' : '');
      boxes.push(box(cls, f.at, f.dur, data.span, 'at: ' + f.at, `figura ${f.i}: at ${f.at}${f.saved ? '' : ' (deducido)'} · dura ${f.dur}`));
      if (f.start !== f.at) boxes.push(box('is-ghost', f.start, f.dur, data.span, '→ ' + f.start, `El modelo la empieza en ${f.start}, no en ${f.at}`));
    });
    rows.push(lane(v, data.span, boxes));
  }
  return h('div', { class: 'graph', 'data-span': data.span }, h('div', { class: 'graph-title' }, 'Con at (donde dice el modelo)'), rows, axis(data.span, data.capacity));
}

// "forward": lo que lee Verovio. Notas y silencios en su inicio, y los <forward> como esperas rayadas.
function forwardGraph(timeline, capacity, highlight) {
  const items = timeline.items;
  const span = Math.max(capacity, ...items.map((item) => item.start + item.dur));
  const voices = [...new Set(items.map((item) => item.voice))].sort((a, b) => a - b);
  const rows = voices.map((v) => lane(v, span, items.filter((item) => item.voice === v).map((item) => {
    if (item.kind === 'forward') return box('is-forward', item.start, item.dur, span, 'forward: ' + item.dur, `<forward> de ${item.dur} desde ${item.start}`);
    const label = item.kind === 'hidden' ? 'oculto ' + item.start : item.kind === 'rest' ? 'silencio ' + item.start : 'inicio ' + item.start;
    const cls = (item.kind === 'note' ? '' : item.kind === 'hidden' ? 'is-hidden' : 'is-rest') + (item.index === highlight && item.kind !== 'hidden' ? ' is-new' : '');
    return box(cls, item.start, item.dur, span, label, `${label} · dura ${item.dur}`);
  })));
  return h('div', { class: 'graph', 'data-span': span }, h('div', { class: 'graph-title' }, 'Con forward (lo que lee Verovio)'), rows, axis(span, capacity));
}

function table(head, rows) {
  return h('table', { class: 'values' },
    h('thead', {}, h('tr', {}, head.map((text) => h('th', {}, text)))),
    h('tbody', {}, rows.map((cells) => h('tr', {}, cells.map((cell) => h('td', {}, cell))))));
}

// ---- panel -------------------------------------------------------------------------------------------------------

const measureCount = (M, score) => M.measures(score).length;
const FIGURE_NAMES = { w: 'redonda', h: 'blanca', q: 'negra', e: 'corchea', s: 'semicorchea', f: 'fusa' };

// "blanca con puntillo C5", "silencio de negra": el nombre de la figura, no la letra del modelo.
function figureName({ d, dot, rest, n }) {
  const name = FIGURE_NAMES[d] || '?';
  const dots = dot === 2 ? ' con doble puntillo' : dot ? ' con puntillo' : '';
  return rest ? `silencio de ${name}${dots}` : `${name}${dots} ${pitchName(n)}`;
}

function renderPanel(M, source) {
  const panel = $('#debugMeasures');
  // `measures(score, 1)` abre los compases vacios del otro pentagrama: se mira una copia, no la partitura del editor.
  const score = M.clone(source);
  const staves = M.stavesOf(score);
  $('#debugTitle').textContent = source.title || '';
  $('#debugJson').value = JSON.stringify(source, null, 1);
  let xml;
  try {
    xml = M.toMusicXml(score);
  } catch (error) {
    panel.replaceChildren(h('p', { class: 'json-error' }, 'toMusicXml falló: ' + error.message));
    return;
  }
  const timelines = xmlTimelines(xml);
  panel.replaceChildren(...Array.from({ length: measureCount(M, score) }, (_, mi) => {
    const parts = Array.from({ length: staves }, (__, staff) => {
      const data = atTimeline(M, score, mi, staff);
      const forward = { items: (timelines[mi]?.items || []).filter((item) => (item.staff || 0) === staff) };
      const graphs = [atGraph(data), forwardGraph(forward, data.capacity)];
      return h('div', { class: 'staff-debug' },
        staves > 1 ? h('h4', {}, 'Pentagrama ' + (staff + 1)) : null,
        h('div', { class: 'graphs' }, graphs),
        h('div', { class: 'tables' },
          table(['#', 'voz', 'figura', 'at', 'inicio real', 'dura'], data.figures.map((f) => [
            f.i, f.voice, figureName(f), f.at + (f.saved ? '' : '*'), h('span', { class: f.start !== f.at ? 'differs' : '' }, f.start), f.dur,
          ])),
          table(['voz', 'qué', 'desde', 'dura'], forward.items.map((item) => [
            item.voice, item.kind === 'forward' ? 'forward' : item.kind === 'hidden' ? 'silencio oculto' : item.kind === 'rest' ? 'silencio' : 'nota', item.start, item.dur,
          ])))
      );
    });
    const first = atTimeline(M, score, mi, 0);
    return h('div', { class: 'measure-debug' },
      h('h3', {}, 'Compás ' + (mi + 1), first.pickup ? h('span', { class: 'badge', title: 'Primer compás (o tras una doble barra) incompleto y seguido de música: dura lo escrito, sin forward' }, 'anacrusa') : null,
        h('small', {}, ` · ${first.pickup ? 'dura' : 'capacidad'} ${first.capacity} · contenido ${first.end}`)),
      parts);
  }));
}

// ---- arranque ---------------------------------------------------------------------------------------------------

function main() {
  // Pro por URL: el debugger es interno y quiere todo (voces, pestañas, duplicar, letra, patrones...).
  if (!isPro()) history.replaceState(history.state, '', location.pathname + location.search + '#pro');
  // El mismo modelo que `runtime.js` le da al sitio principal.
  const M = createScoreModel({ defaultClef: 'treble', grandStaff: true, choir: true });
  window.ScoreModel = M;
  let frame = 0;
  const draw = (value) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      const score = value && value.scores && value.scores[Math.min(Math.max(value.active | 0, 0), value.scores.length - 1)];
      if (score) renderPanel(M, score);
    });
  };
  window.ScoreStore = {
    stored: readStored(),
    flush: () => Promise.resolve(),
    save(value) {
      try { localStorage.setItem(STORAGE, JSON.stringify(value)); } catch { /* sin almacenamiento: no pasa nada */ }
      const status = document.getElementById('saveStatus');
      if (status) { status.dataset.state = 'saved'; status.textContent = status.dataset.saved || ''; }
      draw(value);
    },
  };
  start({ settings: true, chords: true, lyrics: true, patterns: true, urlDefaults: {} });
  draw({ active: 0, scores: [window.scoreEditor.score] });
  // Aplicar JSON: lo escrito reemplaza la partitura abierta por el camino de edicion del editor (se deshace).
  $('#debugApply').addEventListener('click', () => {
    const error = $('#debugJsonError');
    try {
      const data = JSON.parse($('#debugJson').value);
      if (!data || !Array.isArray(data.rows)) throw new Error('Falta "rows"');
      error.hidden = true;
      window.scoreEditor.apply(data);
    } catch (e) {
      error.hidden = false;
      error.textContent = 'JSON inválido: ' + e.message;
    }
  });
}

main();
