/* debugger.js — Pagina interna /debugger/ (no indexada). Casos de un compas para ver, con los mismos metodos del modelo
   que usa el editor, donde queda cada figura: segun `at` (pista de orden) y segun el MusicXML (<note> y <forward>).
   No usa score-editor.js: dibuja con Verovio, mide el SVG como el editor (`locate`) y escribe con `planPlacement`
   (debug-timing.js), que sigue el mismo camino de colocacion. */
import M from './score-model.js';
import { atTimeline, xmlTimelines, planPlacement } from './debug-timing.js';

const STORAGE = 'partitura.debugger.v1';
const SCALE = 60;
const NAMES = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const TOOLS = [
  { d: 'f', label: 'Fusa', key: '1' },
  { d: 's', label: 'Semicorchea', key: '2' },
  { d: 'e', label: 'Corchea', key: '3' },
  { d: 'q', label: 'Negra', key: '4' },
  { d: 'h', label: 'Blanca', key: '5' },
  { d: 'w', label: 'Redonda', key: '6' },
];

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
const fresh = () => ({ meter: '4/4', clef: 'treble', fifths: 0, rows: [[[]]] });

// ---- estado -----------------------------------------------------------------------------------------------------

let cases = [];
let tool = null; // { d, rest, dot } o null
let toolkit = null;
let serial = 0;

function save() {
  try {
    localStorage.setItem(STORAGE, JSON.stringify({ cases: cases.map(({ id, title, score }) => ({ id, title, score })), tool }));
  } catch { /* sin almacenamiento: no pasa nada */ }
}

function load() {
  try {
    const data = JSON.parse(localStorage.getItem(STORAGE) || 'null');
    if (data && Array.isArray(data.cases) && data.cases.length) {
      tool = data.tool && TOOLS.some((t) => t.d === data.tool.d) ? data.tool : null;
      return data.cases.map((c) => ({ id: ++serial, title: String(c.title || 'Caso'), score: c.score && c.score.rows ? c.score : fresh() }));
    }
  } catch { /* se arranca de cero */ }
  return [1, 2, 3, 4].map((k) => ({ id: ++serial, title: 'Caso ' + k, score: fresh() }));
}

// ---- Verovio ----------------------------------------------------------------------------------------------------

function createToolkit() {
  return new Promise((resolve, reject) => {
    const script = h('script', { src: '/vendor/' + __VEROVIO_FILE__ });
    script.onerror = () => reject(new Error('No se pudo cargar Verovio'));
    script.onload = () => {
      const attempt = () => {
        try { resolve(new window.verovio.toolkit()); return true; } catch { return false; }
      };
      if (!attempt()) window.verovio.module.onRuntimeInitialized = attempt;
    };
    document.head.appendChild(script);
  });
}

function engrave(score, width) {
  toolkit.setOptions({
    scale: SCALE, pageWidth: Math.round(width * 100 / SCALE), adjustPageHeight: true, breaks: 'encoded', header: 'none', footer: 'none',
    svgViewBox: true, pageMarginLeft: 60, pageMarginRight: 60, pageMarginTop: 60, pageMarginBottom: 60,
    minLastJustification: 0, justifyVertically: false, spacingSystem: 12, mnumInterval: 0,
  });
  const xml = M.toMusicXml(score);
  toolkit.loadData(xml);
  const svg = Array.from({ length: toolkit.getPageCount() }, (_, i) => M.refineTempo(toolkit.renderToSVG(i + 1))).join('');
  return { svg, xml };
}

// ---- medidas del SVG (igual que measureLayout / locate del editor, con un solo pentagrama) ---------------------------

function measureLayout(c) {
  const origin = c.stage.getBoundingClientRect();
  c.layout = [...c.stage.querySelectorAll('g.measure')].map((node) => {
    const lines = [...node.querySelectorAll(':scope > g.staff > path')].slice(0, 5).map((p) => {
      const r = p.getBoundingClientRect();
      return (r.top + r.bottom) / 2 - origin.top;
    });
    const box = node.querySelector(':scope > g.staff > path').getBoundingClientRect();
    const start = Math.max(box.left, ...[...node.querySelectorAll('g.clef, g.keySig, g.meterSig')].map((g) => g.getBoundingClientRect().right));
    return { left: box.left - origin.left, start: start - origin.left + (lines[4] - lines[0]) / 4, right: box.right - origin.left, lines };
  });
}

function centersOf(c, mi) {
  const origin = c.stage.getBoundingClientRect();
  const centers = [];
  for (let i = 0; ; i += 1) {
    const node = c.stage.querySelector('[id="e' + mi + '-' + i + '"]');
    if (!node) break;
    const r = (node.querySelector('.notehead') || node).getBoundingClientRect();
    centers.push((r.left + r.right) / 2 - origin.left);
  }
  return centers;
}

function timeAt(c, x, m, mi, starts, centers) {
  const capacity = M.capacity(c.score, mi);
  const anchors = [{ x: m.start, t: 0 }, { x: m.right, t: capacity }];
  centers.forEach((cx, i) => anchors.push({ x: cx, t: starts[i] }));
  anchors.sort((p, q) => p.x - q.x || p.t - q.t);
  for (let k = 1; k < anchors.length; k += 1) {
    const a = anchors[k - 1];
    const b = anchors[k];
    if (x <= a.x && a.t === 0) return 0;
    if (x <= b.x && b.x > a.x) return a.t + ((x - a.x) / (b.x - a.x)) * (b.t - a.t);
  }
  return capacity;
}

function locate(c, clientX, clientY) {
  if (!c.layout || !c.layout.length) return null;
  const origin = c.stage.getBoundingClientRect();
  const x = clientX - origin.left;
  const y = clientY - origin.top;
  let best = null;
  c.layout.forEach((m, mi) => {
    const space = (m.lines[4] - m.lines[0]) / 4;
    const dx = Math.max(m.left - x, 0, x - m.right);
    const dy = Math.abs(y - m.lines[2]);
    if (dy > space * 7 || dx > space * 3) return;
    const cost = dy + dx * 2;
    if (best && cost >= best.cost) return;
    best = { mi, m, space, cost };
  });
  if (!best) return null;
  const { mi, m, space } = best;
  const half = space / 2;
  const n = M.clampPitch(M.bottomLine(c.score, mi, 0) + Math.round((m.lines[4] - y) / half));
  const measure = M.measures(c.score)[mi];
  const starts = M.onsets(measure);
  const centers = centersOf(c, mi);
  let at = timeAt(c, Math.max(m.left, Math.min(m.right, x)), m, mi, starts, centers);
  let markX = Math.max(m.left, Math.min(m.right, x));
  const rawT = at;
  // A la derecha de la ultima columna la nueva empieza donde termina la ultima figura.
  if (measure.length && x > Math.max(...centers)) {
    const last = Math.max(...starts);
    at = Math.max(at, ...measure.map((ev, i) => (starts[i] === last ? last + M.length(ev) : 0)));
  }
  // Sobre una figura se alinea con su columna; entre columnas se puede intercalar.
  let near = null;
  centers.forEach((cx, i) => {
    if (Math.abs(cx - x) > space * 0.8) return;
    if (!near || Math.abs(cx - x) < Math.abs(near.cx - x)) near = { cx, i };
  });
  if (near) { at = starts[near.i]; markX = near.cx; }
  const next = near ? null : measure.map((ev, i) => i).filter((i) => centers[i] > x).sort((a, b) => centers[a] - centers[b])[0];
  return {
    mi, n, rawT, t: at, x: markX, space,
    y: m.lines[4] - (n - M.bottomLine(c.score, mi, 0)) * half,
    top: m.lines[0], bottom: m.lines[4],
    beforeAt: next == null ? null : starts[next],
    beforeFirst: measure.length > 0 && x < Math.min(...centers) - space * 0.8,
  };
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
export function atGraph(data, highlight) {
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
  return h('div', { class: 'graph' }, h('div', { class: 'graph-title' }, 'Con at (donde dice el modelo)'), rows, axis(data.span, data.capacity));
}

// "forward": lo que lee Verovio. Notas y silencios en su inicio, y los <forward> como esperas rayadas.
export function forwardGraph(timeline, capacity, highlight) {
  const items = timeline.items;
  const span = Math.max(capacity, ...items.map((item) => item.start + item.dur));
  const voices = [...new Set(items.map((item) => item.voice))].sort((a, b) => a - b);
  const rows = voices.map((v) => lane(v, span, items.filter((item) => item.voice === v).map((item) => {
    if (item.kind === 'forward') return box('is-forward', item.start, item.dur, span, 'forward: ' + item.dur, `<forward> de ${item.dur} desde ${item.start}`);
    const label = item.kind === 'hidden' ? 'oculto ' + item.start : item.kind === 'rest' ? 'silencio ' + item.start : 'inicio ' + item.start;
    const cls = (item.kind === 'note' ? '' : item.kind === 'hidden' ? 'is-hidden' : 'is-rest') + (item.index === highlight && item.kind !== 'hidden' ? ' is-new' : '');
    return box(cls, item.start, item.dur, span, label, `${label} · dura ${item.dur}`);
  })));
  return h('div', { class: 'graph' }, h('div', { class: 'graph-title' }, 'Con forward (lo que lee Verovio)'), rows, axis(span, capacity));
}

function table(head, rows) {
  return h('table', { class: 'values' },
    h('thead', {}, h('tr', {}, head.map((text) => h('th', {}, text)))),
    h('tbody', {}, rows.map((cells) => h('tr', {}, cells.map((cell) => h('td', {}, cell))))));
}

// ---- casos ------------------------------------------------------------------------------------------------------

const measureCount = (score) => M.measures(score).length;

function snapshot(c) {
  (c.history ||= []).push(JSON.stringify(c.score));
  if (c.history.length > 60) c.history.shift();
}

function commit(c, score, { record = true } = {}) {
  if (record) snapshot(c);
  c.score = score;
  save();
  renderCase(c);
}

function figureLabel(f) {
  return (f.rest ? 'silencio ' : '') + (f.d || '?') + (f.dot ? '.' : '') + (f.rest ? '' : ' ' + pitchName(f.n));
}

function renderDebug(c, xml) {
  const total = measureCount(c.score);
  const timelines = xmlTimelines(xml);
  c.debug.replaceChildren(...Array.from({ length: total }, (_, mi) => {
    const data = atTimeline(M, c.score, mi);
    const forward = timelines[mi] || { items: [] };
    const removable = (f) => h('button', {
      type: 'button', class: 'mini', title: 'Quitar esta figura',
      onclick: () => {
        const score = M.clone(c.score);
        const measure = M.measures(score)[mi];
        measure.splice(f.i, 1);
        M.settle(measure);
        commit(c, score);
      },
    }, '×');
    return h('div', { class: 'measure-debug' },
      h('h3', {}, 'Compás ' + (mi + 1), h('small', {}, ` · capacidad ${data.capacity} · contenido ${data.end}`)),
      h('div', { class: 'graphs' }, atGraph(data), forwardGraph(forward, data.capacity)),
      h('div', { class: 'tables' },
        table(['#', 'voz', 'figura', 'at', 'inicio real', 'dura', ''], data.figures.map((f) => [
          f.i, f.voice, figureLabel(f), f.at + (f.saved ? '' : '*'), h('span', { class: f.start !== f.at ? 'differs' : '' }, f.start), f.dur, removable(f),
        ])),
        table(['voz', 'qué', 'desde', 'dura'], forward.items.map((item) => [
          item.voice, item.kind === 'forward' ? 'forward' : item.kind === 'hidden' ? 'silencio oculto' : item.kind === 'rest' ? 'silencio' : 'nota', item.start, item.dur,
        ]))));
  }));
}

function renderCase(c) {
  let drawn;
  try {
    drawn = engrave(c.score, Math.min(c.stage.clientWidth || 940, 940));
  } catch (error) {
    c.stage.textContent = 'Error al dibujar: ' + error.message;
    return;
  }
  c.stage.innerHTML = drawn.svg;
  c.stage.appendChild(c.marker);
  c.marker.hidden = true;
  measureLayout(c);
  renderDebug(c, drawn.xml);
  c.undo.disabled = !(c.history && c.history.length);
  c.json.value = JSON.stringify(c.score, null, 1);
}

function buildCase(c) {
  const stage = h('div', { class: 'case-stage' });
  c.stage = stage;
  c.marker = h('div', { class: 'marker', hidden: true }, h('span', { class: 'marker-line' }), h('span', { class: 'marker-dot' }));
  c.debug = h('div', { class: 'case-debug' });
  c.undo = h('button', { type: 'button', onclick: () => {
    const previous = c.history && c.history.pop();
    if (previous) commit(c, JSON.parse(previous), { record: false });
  } }, 'Deshacer');
  c.json = h('textarea', { class: 'json', rows: '8', spellcheck: 'false' });
  const error = h('p', { class: 'json-error', hidden: true });
  const edit = (change) => () => { const score = M.clone(c.score); if (change(score) !== false) commit(c, score); };
  const root = h('section', { class: 'case', 'data-case': c.id },
    h('header', { class: 'case-head' },
      h('input', { class: 'case-title', value: c.title, 'aria-label': 'Título del caso', oninput: (e) => { c.title = e.target.value; save(); } }),
      h('div', { class: 'case-actions' },
        h('button', { type: 'button', onclick: edit((s) => M.addMeasure(s, s.rows.length - 1)) }, '+ Compás'),
        h('button', { type: 'button', onclick: edit((s) => { const n = measureCount(s); return n > 1 ? M.removeMeasureAt(s, n - 1) : false; }) }, '− Compás'),
        h('button', { type: 'button', onclick: () => commit(c, fresh()) }, 'Limpiar'),
        c.undo,
        h('button', { type: 'button', onclick: () => { cases.splice(cases.indexOf(c) + 1, 0, newCase(c.title + ' (copia)', M.clone(c.score))); renderAll(); save(); } }, 'Duplicar'),
        h('button', { type: 'button', class: 'danger', onclick: () => { if (cases.length > 1) { cases.splice(cases.indexOf(c), 1); renderAll(); save(); } } }, 'Quitar'))),
    stage,
    c.debug,
    h('details', { class: 'case-json' },
      h('summary', {}, 'JSON del compás (editable: sirve para probar un `at` que el editor no genera)'),
      c.json, error,
      h('button', { type: 'button', onclick: () => {
        try {
          const score = JSON.parse(c.json.value);
          if (!score || !Array.isArray(score.rows)) throw new Error('Falta "rows"');
          error.hidden = true;
          commit(c, score);
        } catch (e) {
          error.hidden = false;
          error.textContent = 'JSON inválido: ' + e.message;
        }
      } }, 'Aplicar')));
  c.root = root;
  wireStage(c);
  return root;
}

function newCase(title, score = fresh()) {
  return { id: ++serial, title, score };
}

// ---- interaccion sobre el pentagrama ----------------------------------------------------------------------------

const live = { root: null };
let hover = null; // { c, target }

function wireStage(c) {
  let frame = 0;
  c.stage.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => update(c, event.clientX, event.clientY));
  });
  c.stage.addEventListener('pointerleave', () => { cancelAnimationFrame(frame); clearHover(c); });
  c.stage.addEventListener('click', (event) => {
    if (!tool) return;
    const target = locate(c, event.clientX, event.clientY);
    if (!target) return;
    const plan = planPlacement(M, c.score, tool, target);
    if (plan.ok) commit(c, plan.trial);
  });
}

function clearHover(c) {
  c.marker.hidden = true;
  hover = null;
  showLive(null);
}

function update(c, clientX, clientY) {
  if (!tool) { c.marker.hidden = true; showLive({ idle: 'Elegí una figura en la barra de arriba (o con las teclas 1–6).' }); return; }
  const target = locate(c, clientX, clientY);
  if (!target) { clearHover(c); return; }
  const plan = planPlacement(M, c.score, tool, target);
  hover = { c, target, plan };
  c.marker.hidden = false;
  c.marker.classList.toggle('is-bad', !plan.ok);
  c.marker.style.left = target.x + 'px';
  c.marker.querySelector('.marker-line').style.cssText = `top:${target.top - target.space}px;height:${target.bottom - target.top + target.space * 2}px`;
  const dot = c.marker.querySelector('.marker-dot');
  dot.style.cssText = `top:${target.y - target.space * 0.55}px;width:${target.space * 1.4}px;height:${target.space * 1.1}px;margin-left:${-target.space * 0.7}px`;
  showLive({ c, target, plan });
}

// ---- caja de debug en vivo --------------------------------------------------------------------------------------

function row(label, value, cls) {
  return h('div', { class: 'live-row' + (cls ? ' ' + cls : '') }, h('span', { class: 'live-k' }, label), h('span', { class: 'live-v' }, value));
}

function showLive(info) {
  const body = live.root.querySelector('.live-body');
  if (!info || info.idle) {
    body.replaceChildren(h('p', { class: 'live-empty' }, info ? info.idle : 'Pasá el cursor sobre un pentagrama con una figura elegida.'));
    return;
  }
  const { c, target, plan } = info;
  const rows = [
    row('Caso', `${c.title} · compás ${target.mi + 1}`),
    row('Figura', `${tool.rest ? 'silencio ' : ''}${tool.d}${tool.dot ? '.' : ''} (dura ${M.length({ d: tool.d, dot: tool.dot ? 1 : 0 })}) · n ${target.n} ${pitchName(target.n)}`),
    row('x → tiempo', `${Math.round(target.rawT * 100) / 100}`),
    row('tiempo ajustado', `${Math.round(target.t * 100) / 100}${target.beforeAt != null ? ` · intercala antes de at ${target.beforeAt}` : ''}`),
  ];
  if (!plan.ok) {
    rows.push(row('Resultado', plan.reason, 'bad'), row('Camino', plan.path));
    live.root.querySelector('.live-body').replaceChildren(...rows);
    return;
  }
  const data = atTimeline(M, plan.trial, plan.mi);
  const timeline = xmlTimelines(M.toMusicXml(plan.trial))[plan.mi] || { items: [] };
  const figure = data.figures[plan.index];
  const moved = figure && figure.start !== plan.requested;
  rows.push(
    row('Camino', plan.path),
    row('at pedido', String(plan.requested)),
    row('at resultante', figure ? String(figure.at) : '—'),
    row('inicio real', figure ? `${figure.start} · voz ${figure.voice}` : '—', moved ? 'warn' : ''),
  );
  if (moved) rows.push(h('p', { class: 'live-note' }, `⚠ Se pidió at ${plan.requested} y el modelo la empieza en ${figure.start}: un hueco en at no dura nada.`));
  const waits = timeline.items.filter((item) => item.kind === 'forward');
  rows.push(row('forward', waits.length ? waits.map((w) => `voz ${w.voice}: ${w.dur} desde ${w.start}`).join(' · ') : 'ninguno'));
  rows.push(h('div', { class: 'live-graphs' }, atGraph(data, plan.index), forwardGraph(timeline, data.capacity, plan.index)));
  body.replaceChildren(...rows);
}

// ---- barra de figuras -------------------------------------------------------------------------------------------

function renderToolbar() {
  const bar = $('#debugTools');
  bar.replaceChildren(
    ...TOOLS.map((t) => h('button', {
      type: 'button', class: 'tool', 'data-d': t.d, 'aria-pressed': String(Boolean(tool) && tool.d === t.d), title: `${t.label} · tecla ${t.key}`,
      onclick: () => chooseTool(tool && tool.d === t.d ? null : { d: t.d, rest: Boolean(tool && tool.rest), dot: Boolean(tool && tool.dot) }, t.d),
    }, h('span', { class: 'tool-name' }, t.label), h('span', { class: 'tool-value' }, String(M.VALUES[t.d])))),
    h('span', { class: 'sep' }),
    h('button', { type: 'button', class: 'tool', id: 'toolRest', 'aria-pressed': String(Boolean(tool && tool.rest)), title: 'Silencio · tecla R', onclick: () => modifier('rest') }, h('span', { class: 'tool-name' }, 'Silencio'), h('span', { class: 'tool-value' }, 'R')),
    h('button', { type: 'button', class: 'tool', id: 'toolDot', 'aria-pressed': String(Boolean(tool && tool.dot)), title: 'Puntillo · tecla P', onclick: () => modifier('dot') }, h('span', { class: 'tool-name' }, 'Puntillo'), h('span', { class: 'tool-value' }, 'P')),
    h('button', { type: 'button', class: 'tool', 'aria-pressed': String(!tool), title: 'Sin herramienta · Esc', onclick: () => chooseTool(null) }, h('span', { class: 'tool-name' }, 'Ninguna'), h('span', { class: 'tool-value' }, 'Esc')),
  );
}

function chooseTool(next) {
  tool = next;
  save();
  renderToolbar();
  document.body.classList.toggle('has-tool', Boolean(tool));
  cases.forEach((c) => { c.marker.hidden = true; });
  showLive(tool ? null : { idle: 'Sin herramienta: elegí una figura arriba.' });
}

function modifier(name) {
  if (!tool) tool = { d: 'q', rest: false, dot: false };
  chooseTool({ ...tool, [name]: !tool[name] });
}

document.addEventListener('keydown', (event) => {
  if (event.target.closest && event.target.closest('input, textarea') || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === 'Escape') { chooseTool(null); return; }
  const picked = TOOLS.find((t) => t.key === event.key);
  if (picked) { chooseTool({ d: picked.d, rest: Boolean(tool && tool.rest), dot: Boolean(tool && tool.dot) }); return; }
  if (event.key.toLowerCase() === 'r') modifier('rest');
  if (event.key.toLowerCase() === 'p') modifier('dot');
});

// ---- arranque ---------------------------------------------------------------------------------------------------

function renderAll() {
  const list = $('#debugCases');
  list.replaceChildren(...cases.map((c) => buildCase(c)));
  cases.forEach((c) => renderCase(c));
}

async function main() {
  live.root = $('#debugLive');
  cases = load();
  renderToolbar();
  document.body.classList.toggle('has-tool', Boolean(tool));
  $('#debugAdd').addEventListener('click', () => { cases.push(newCase('Caso ' + (cases.length + 1))); renderAll(); save(); });
  $('#debugReset').addEventListener('click', () => { cases = [1, 2, 3, 4].map((k) => newCase('Caso ' + k)); renderAll(); save(); });
  showLive(null);
  try {
    toolkit = await createToolkit();
  } catch (error) {
    $('#debugCases').textContent = error.message;
    return;
  }
  renderAll();
  let timer = 0;
  window.addEventListener('resize', () => { clearTimeout(timer); timer = setTimeout(() => cases.forEach((c) => renderCase(c)), 200); });
}

main();
