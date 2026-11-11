import { ARCHIVE_CHOIRS } from './choir-sounds.js';

/* score-model.js — Modelo de la pagina /partitura: una partitura es una lista de
   renglones, un renglon una lista de compases y un compas una lista de figuras.
   Sin DOM: el navegador lo carga como script clasico y los tests lo requieren.

   Duraciones en divisiones de negra = 24 (el tresillo de corchea, 8, y la corchea
   con puntillo, 18, entran exactos). El MusicXML aplica la transposicion de octava
   de la clave elegida para conservar la altura sonora (sol por defecto, configurable por sitio).

   Campos de una figura:
   - `d`: valor base: w redonda (96), h blanca (48), q negra (24), e corchea (12), s semicorchea (6), f fusa (3).
     Con `dot` dura 1,5 veces; con `tp` (numero de tresillo dentro del compas) dura 2/3.
   - `n`: altura como numero diatonico, la misma que escribe el MusicXML (C4 = 35, E4 = 37, la linea inferior de la
     clave de sol; con la clave de guitarra la linea inferior es 30, una octava mas grave). En un silencio es
     opcional y solo indica a que altura se dibuja.
   - `at`: pista de orden, en divisiones de negra (24 por negra). Opcional: sin `at` la figura sigue a la anterior.
     NO es el inicio real ni ocupa tiempo: solo ordena las figuras de una misma voz y alinea las de voces distintas
     (las que comparten `at` empiezan juntas). `settle` lo reescribe con el inicio musical, sin huecos; el editor y
     `sanitize` asientan cada compas, asi que en una partitura guardada `at` coincide con el tiempo que se ve.
   - `v`: identidad de voz guardada. La numeracion inicial va de agudo a grave; un cruce no cambia la identidad.
     Opcional: sin `v` se infiere por continuidad melodica (ver docs/voice-leading.md).
   - `acc` (# b n), `tie`, `slur`, `beam` ('join' | 'break'): alteracion, ligaduras y barrado manual.
   - `dead`: nota muerta (cabeza en X); solo en notas, no en silencios.

   Gran pentagrama (piano, si el sitio lo activa con `grandStaff`): las figuras del pentagrama de abajo estan en
   `score.lower` (compas plano -> figuras), con su clave en `lowerClef` / `lowerClefs`. Compases, armadura, metrica,
   barras, repeticiones y reguladores son del renglon y se comparten. Una referencia a una figura es `{ mi, i }` arriba
   y `{ s: 1, mi, i }` abajo. Cada pentagrama infiere y asienta sus voces por separado. Ver AGENTS.md.

   Tiempo y voces (`arrange`): lo que importa es el ORDEN de las figuras, no donde se dibujan.
   - Voces: una figura con `v` conserva su linea, incluidos cruces de registro. Sin `v`, las notas simultaneas
     son lineas distintas aunque tengan el mismo valor. Se asignan conjuntamente por proximidad a las notas
     anteriores y a las siguientes voces declaradas; la altura inicial solo inicia/desempata las identidades.
     La coincidencia de ritmo no prueba identidad de voz. Un acorde de notacion requiere una decision explicita
     (misma `v`, inicio y duracion); se conserva esa decision en partituras guardadas e importadas.
   - Tiempo: cada voz suena en orden, cada figura pegada a la anterior de su voz; la primera empieza en 0. Un hueco en
     `at` (antes de la primera figura o entre dos) no dura nada. Solo se espera para alinear: las figuras de voces
     distintas con el mismo `at` empiezan juntas, cuando termina la ultima de las que vienen antes. Un compas con una
     negra sola dura 24, caiga donde caiga.
   - El largo del compas es el de su voz mas larga; eso es lo que se compara con la capacidad del compas. Al exportar,
     los silencios ocultos (print-object="no") solo rellenan esas esperas de alineacion y el final del compas.
   - Partituras guardadas antes de contar en orden: si un compas con figuras sin `v` superpuestas por su `at` ya no
     entra contado en orden, `sanitize` le fija las voces de entonces (`legacyVoices`) en vez de perder figuras. */
export function createScoreModel({ defaultClef = 'treble', grandStaff = false, choir = false } = {}) {

  const DIVISIONS = 24;
  const MEASURE = 96; // valor por defecto: 4/4
  const METERS = ['2/4', '3/4', '4/4', '2/2', '3/8', '6/8', '9/8', '12/8'];
  const CLEFS = {
    guitar: { sign: 'G', line: 2, octave: -1, bottom: 30 },
    treble: { sign: 'G', line: 2, bottom: 37 },
    bass: { sign: 'F', line: 4, bottom: 25 },
    alto: { sign: 'C', line: 3, bottom: 31 },
    tenor: { sign: 'C', line: 4, bottom: 29 },
  };
  const LOWER_CLEF = 'bass'; // clave del segundo pentagrama del piano
  // Pentagramas 1..3 (el de abajo del piano y las voces 2..4 del coro): sus figuras y claves viven en tablas propias.
  const LANE_KEYS = ['lower', 'lower2', 'lower3']; // figuras del pentagrama 1, 2 y 3
  const CLEF_KEYS = [['clef', 'clefs'], ['lowerClef', 'lowerClefs'], ['clef2', 'clefs2'], ['clef3', 'clefs3']]; // [inicial, cambios] por pentagrama
  const laneKey = (staff) => LANE_KEYS[staff - 1];
  const LOWER_CLEFS = CLEF_KEYS.slice(1).map(([, map]) => map);
  // Tablas por compas que se desplazan juntas al insertar, quitar o dividir compases.
  const BY_MEASURE = ['navigation', 'barlines', 'keys', 'clefs', ...LOWER_CLEFS, 'meters', 'barres', 'hairpins', 'dynamics', 'chords', 'lyrics', 'measureDurations', 'measureWidths', ...LANE_KEYS];
  // Coro (Voces): registro de cada pentagrama; el registro decide la clave.
  const REGISTERS = { soprano: 'treble', mezzo: 'treble', alto: 'treble', tenor: 'guitar', baritone: 'bass', bass: 'bass' };
  const DEFAULT_REGISTERS = ['soprano', 'alto', 'tenor', 'bass'];
  // "Sin": el pentagrama no muestra nombre de registro; la clave queda como esta.
  const NO_REGISTER = 'none';
  const validRegister = (register) => register === NO_REGISTER || Object.hasOwn(REGISTERS, register);
  const MIN_PARTS = 2;
  const MAX_PARTS = 4;
  const DEFAULT_PARTS = 3;
  const PER_ROW = 4;
  const MIN_ROWS = 3;
  const MAX_FRET = 24;
  const MAX_CHORD_NAME = 16;
  const MAX_LYRIC = 24; // letras de una silaba: tope de caracteres
  const MAX_CHORD_VARIANTS = 12; // tope de variantes de digitacion guardadas por acorde
  const GRID = 6; // semicorchea: la posicion se redondea a esta cuadricula (2 dentro de un tresillo, 3 con fusas)
  const BOTTOM_LINE = 30; // E4: linea inferior de la clave de sol
  const LOWEST = 15;
  const HIGHEST = 51;
  const VALUES = { w: 96, h: 48, q: 24, e: 12, s: 6, f: 3 };
  const TYPES = { 96: 'whole', 48: 'half', 24: 'quarter', 12: 'eighth', 6: '16th', 3: '32nd' };
  const DOUBLE_DOTTABLE = ['h', 'q']; // el doble puntillo de una corchea (21) no cae en la cuadricula
  const TRIPLETABLE = ['q', 'e', 's'];
  const STEPS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const ACCIDENTALS = {
    '#': { alter: 1, name: 'sharp' }, b: { alter: -1, name: 'flat' }, n: { alter: 0, name: 'natural' },
    '##': { alter: 2, name: 'double-sharp' }, bb: { alter: -2, name: 'flat-flat' },
  };

  const MAX_VOICE = 16;
  const REST_CLEARANCE = 6; // pasos diatonicos entre una nota y un silencio que suenan a la vez

  // Grupos de valoracion especial: n figuras (clave) ocupan el tiempo de TUPLETS[n] del mismo valor. `tp` identifica el
  // grupo dentro del compas y `tn` guarda cuantas figuras tiene (sin `tn` son 3: el tresillo). No admiten puntillo.
  const TUPLETS = { 2: 3, 3: 2, 4: 3, 5: 4, 6: 4, 7: 4, 8: 6, 9: 8 };
  const TUPLET_NAMES = { 2: 'dosillo', 3: 'tresillo', 4: 'cuatrillo', 5: 'quintillo', 6: 'sextillo', 7: 'septillo', 8: 'octillo', 9: 'nonillo' };
  const MULTIPLIER = 630; // divisiones extra al exportar: hace enteras las duraciones de todos los grupos (5, 7 y 9 figuras)

  // Los grupos dan duraciones fraccionarias (5 corcheas en 4: 9,6); se redondea para que las sumas sean exactas.
  // Un grupo completo vuelve a un entero (7 figuras de 24/7 suman 24 y no 23,999997).
  const tidy = (x) => (Math.abs(x - Math.round(x)) < 1e-4 ? Math.round(x) : Math.round(x * 1e6) / 1e6);

  function tupletSize(ev) {
    return TUPLETS[ev.tn] ? ev.tn : 3;
  }

  function length(ev) {
    return ev.tp ? tidy(VALUES[ev.d] * TUPLETS[tupletSize(ev)] / tupletSize(ev)) : ev.dot === 2 ? VALUES[ev.d] * 1.75 : ev.dot ? VALUES[ev.d] * 1.5 : VALUES[ev.d];
  }

  // Cuadricula de posicion para estas figuras: la mas fina que necesiten (un tresillo y una fusa juntos, 1).
  function gridOf(events) {
    const odd = events.some((ev) => ev.tp && tupletSize(ev) !== 3);
    const triplet = events.some((ev) => ev.tp);
    const thirtySecond = events.some((ev) => ev.d === 'f');
    return odd ? 0.1 : triplet ? (thirtySecond ? 1 : 2) : thirtySecond ? 3 : GRID;
  }

  function savedVoice(ev) {
    return Number.isInteger(ev.v) && ev.v >= 1 && ev.v <= MAX_VOICE ? ev.v : 0;
  }

  // `at` de cada figura como pista de orden: una figura sin `at` sigue a la anterior.
  function hints(measure) {
    let cursor = 0;
    return measure.map((ev) => {
      const at = Number.isInteger(ev.at) ? ev.at : cursor;
      cursor = tidy(Math.max(cursor, at + length(ev)));
      return at;
    });
  }

  // Inferencia horizontal, no analisis armonico: una coincidencia vertical no prueba que dos notas sean una voz.
  // Las voces guardadas son decisiones de escritura; solo se infieren las figuras sin `v`.
  function inferVoiceLanes(measure, hint) {
    if (measure.every(savedVoice)) return measure.map((ev) => ev.v - 1);
    const frames = new Map();
    measure.forEach((ev, i) => {
      if (!frames.has(hint[i])) frames.set(hint[i], []);
      frames.get(hint[i]).push(i);
    });
    const batches = [...frames].sort((a, b) => a[0] - b[0]).map(([at, indices]) => {
      const units = [];
      indices.forEach((i) => {
        const ev = measure[i];
        // Solo una voz ya declarada permite compartir plica (acorde de notacion).
        const chord = !ev.rest && savedVoice(ev) && units.find((u) =>
          !measure[u[0]].rest && savedVoice(measure[u[0]]) === ev.v && length(measure[u[0]]) === length(ev));
        if (chord) chord.push(i);
        else units.push([i]);
      });
      return { at, units };
    });
    const count = Math.max(1, ...measure.map(savedVoice), ...batches.map((b) => b.units.length));
    const pitches = (unit) => unit.filter((i) => !measure[i].rest).map((i) => measure[i].n);
    const distance = (a, b) => a.length && b.length ? Math.min(...a.flatMap((x) => b.map((y) => Math.abs(x - y)))) : 0;
    const lane = [];
    const previous = Array.from({ length: count }, () => null);
    // Registro solo para iniciar o desempatar, nunca como frontera fija entre voces.
    const seed = batches.reduce((best, b) => b.units.length > best.units.length ? b : best, batches[0]);
    const ranked = seed.units.slice().sort((a, b) => Math.max(-Infinity, ...pitches(b)) - Math.max(-Infinity, ...pitches(a)));
    const register = [...new Set(measure.filter(ev => !ev.rest).map(ev => ev.n))].sort((a, b) => b - a);
    const seedPitches = Array.from({ length: count }, (_, k) => {
      const unit = seed.units.find(u => savedVoice(measure[u[0]]) === k + 1) || ranked[k] || [];
      const own = pitches(unit);
      if (own.length) return own;
      // Un silencio no aporta altura: iniciar esa parte con una referencia de registro,
      // sin darle coste cero frente a cualquier nota ni imponer un corte permanente.
      const pitch = register[Math.round(k * (register.length - 1) / Math.max(1, count - 1))];
      return pitch === undefined ? [] : [pitch];
    });
    batches.forEach(({ at, units }) => {
      const taken = new Set();
      const unknown = [];
      units.forEach((unit) => {
        const voice = savedVoice(measure[unit[0]]);
        if (voice) { unit.forEach((i) => { lane[i] = voice - 1; }); taken.add(voice - 1); }
        else unknown.push(unit);
      });
      const free = Array.from({ length: count }, (_, k) => k).filter((k) => !taken.has(k));
      const cost = (unit, k) => {
        const own = pitches(unit);
        const before = previous[k];
        // La siguiente decision explicita tambien informa la continuidad (entrada tardia, cruces).
        const after = batches.find((b) => b.at > at && b.units.some((u) => savedVoice(measure[u[0]]) === k + 1 && pitches(u).length));
        const next = after?.units.find((u) => savedVoice(measure[u[0]]) === k + 1 && pitches(u).length);
        if (before || next) return (before ? distance(own, before) : 0) + (next ? distance(own, pitches(next)) : 0);
        return distance(own, seedPitches[k]);
      };
      // Asignacion conjunta: dos notas simultaneas no compiten codiciosamente por la misma linea.
      const assigned = minimumAssignment(unknown.map((unit) => free.map((k) => cost(unit, k))));
      unknown.forEach((unit, j) => unit.forEach((i) => { lane[i] = free[assigned[j]]; }));
      units.forEach((unit) => {
        const own = pitches(unit);
        if (own.length) previous[lane[unit[0]]] = own;
      });
    });
    return lane;
  }

  // Emparejamiento de coste minimo (Hungarian), O(n^3), sin enumerar permutaciones de acordes grandes.
  function minimumAssignment(costs) {
    if (!costs.length) return [];
    const n = costs.length, m = costs[0].length;
    const u = Array(n + 1).fill(0), v = Array(m + 1).fill(0), p = Array(m + 1).fill(0), way = Array(m + 1).fill(0);
    for (let i = 1; i <= n; i += 1) {
      p[0] = i;
      let j0 = 0;
      const min = Array(m + 1).fill(Infinity), used = Array(m + 1).fill(false);
      do {
        used[j0] = true;
        const i0 = p[j0];
        let delta = Infinity, j1 = 0;
        for (let j = 1; j <= m; j += 1) {
          if (used[j]) continue;
          const cur = costs[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < min[j]) { min[j] = cur; way[j] = j0; }
          if (min[j] < delta) { delta = min[j]; j1 = j; }
        }
        for (let j = 0; j <= m; j += 1) {
          if (used[j]) { u[p[j]] += delta; v[j] -= delta; }
          else min[j] -= delta;
        }
        j0 = j1;
      } while (p[j0]);
      do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
    }
    const result = [];
    for (let j = 1; j <= m; j += 1) if (p[j]) result[p[j] - 1] = j - 1;
    return result;
  }

  // Reparte las figuras en voces y calcula cuando empieza cada una (ver el encabezado).
  function arrange(measure) {
    if (!measure.length) return { lanes: [{ end: 0, groups: [] }], starts: [] };
    const hint = hints(measure);
    return layout(measure, hint, inferVoiceLanes(measure, hint));
  }

  // Voces y tiempos de `arrange` para una asignacion de lineas melodicas.
  function layout(measure, hint, lane) {
    // Dentro de una voz no empiezan juntas dos figuras que no forman acorde: queda la mas aguda y las demas bajan una voz.
    const top = (list) => (measure[list[0]].rest ? -Infinity : Math.max(...list.map((i) => measure[i].n)));
    for (let k = 0; k <= Math.max(...lane); k += 1) {
      const at = new Map();
      measure.forEach((ev, i) => {
        if (lane[i] !== k) return;
        const key = ev.rest ? 'r' + i : 'n' + length(ev);
        if (!at.has(hint[i])) at.set(hint[i], new Map());
        const keys = at.get(hint[i]);
        if (!keys.has(key)) keys.set(key, []);
        keys.get(key).push(i);
      });
      at.forEach((keys) => {
        if (keys.size < 2) return;
        const lists = [...keys.values()];
        const keep = lists.reduce((best, list) => (top(list) > top(best) ? list : best));
        lists.forEach((list) => { if (list !== keep) list.forEach((i) => { lane[i] = k + 1; }); });
      });
    }
    // Conservar la identidad explicita aunque una voz intermedia no tenga figuras.
    const used = Array.from({ length: Math.max(...lane) + 1 }, (_, k) => k);
    const lanes = used.map(() => ({ end: 0, groups: [] }));
    measure.map((ev, i) => i).sort((a, b) => hint[a] - hint[b] || a - b).forEach((i) => {
      const voice = lanes[used.indexOf(lane[i])];
      const last = voice.groups[voice.groups.length - 1];
      const ev = measure[i];
      if (last && !ev.rest && !last.rest && last.hint === hint[i] && last.size === length(ev)) last.indices.push(i);
      else voice.groups.push({ hint: hint[i], at: 0, size: length(ev), rest: !!ev.rest, v: ev.v, indices: [i] });
    });
    // Tiempo: cada voz suena en orden y sin huecos; solo las figuras con la misma pista `at` se esperan para empezar juntas.
    const starts = [];
    const pending = lanes.flatMap((voice) => voice.groups.map((g) => ({ g, voice }))).sort((a, b) => a.g.hint - b.g.hint);
    for (let p = 0; p < pending.length;) {
      let q = p;
      while (q < pending.length && pending[q].g.hint === pending[p].g.hint) q += 1;
      const batch = pending.slice(p, q);
      const start = Math.max(...batch.map((item) => item.voice.end));
      batch.forEach(({ g, voice }) => {
        g.at = start;
        voice.end = tidy(start + g.size);
        g.indices.forEach((i) => { starts[i] = start; });
      });
      p = q;
    }
    return { lanes, starts };
  }

  // Solo para cargar partituras guardadas antes de contar en orden, cuyas figuras sin `v` se superponian en `at` y
  // sumadas en orden no entran en el compas: fija `v` como se repartian entonces (cada figura en la primera voz donde no
  // pisaba a otra segun su `at`). Cada voz asi suma a lo sumo el compas, de modo que no se pierde ninguna figura.
  function legacyVoices(measure) {
    const hint = hints(measure);
    const lanes = [];
    const order = measure.map((ev, i) => i).sort((a, b) => hint[a] - hint[b] ||
      (measure[b].rest ? -Infinity : measure[b].n) - (measure[a].rest ? -Infinity : measure[a].n) || a - b);
    order.forEach((i) => {
      const ev = measure[i];
      const span = [hint[i], hint[i] + length(ev)];
      const fits = (lane) => lane.every((j) => (hint[j] === span[0] && !ev.rest && !measure[j].rest && length(measure[j]) === length(ev)) ||
        hint[j] + length(measure[j]) <= span[0] || span[1] <= hint[j]);
      let k = savedVoice(ev) && fits(lanes[ev.v - 1] || []) ? ev.v - 1 : lanes.findIndex(fits);
      if (k < 0) k = lanes.length;
      while (lanes.length <= k) lanes.push([]);
      lanes[k].push(i);
    });
    lanes.filter((lane) => lane.length).forEach((lane, k) => lane.forEach((i) => { measure[i].v = k + 1; }));
    return measure;
  }

  // Inicio musical de cada figura dentro del compas, ya sin huecos.
  function onsets(measure) {
    return arrange(measure).starts;
  }

  // Lo que dura el compas: su voz mas larga, sumando las figuras en orden (un hueco antes o entre figuras no cuenta).
  function measureLength(measure) {
    return Math.max(0, ...arrange(measure).lanes.map((voice) => voice.end));
  }

  // Reescribe `at` con el inicio musical (sin huecos) y, si hay varias voces, fija `v` en todas, para que agregar,
  // quitar o alargar otra figura no las mueva ni las reparta distinto.
  function settle(measure) {
    const { lanes, starts } = arrange(measure);
    measure.forEach((ev, i) => { ev.at = starts[i]; });
    if (lanes.length > 1) lanes.forEach((voice, k) => voice.groups.forEach((g) => g.indices.forEach((i) => { measure[i].v = k + 1; })));
    return measure;
  }

  // Lugar `at` (pista de orden, en la cuadricula) para soltar `ev` en el tiempo `t`; null si repite una nota que ya
  // suena ahi o si el compas, contado en orden, ya no la admite.
  function placement(others, ev, t, score, mi, preserveVoice = false) {
    const limit = capacity(score, mi);
    const size = length(ev);
    const grid = gridOf([ev]);
    const starts = hints(others);
    // En un compás ya excedido no hay "ultimo lugar que entra": anclar al final de la capacidad mandaba la figura
    // al medio del compas y desordenaba las voces; puede quedar hasta donde empieza la ultima figura.
    const ceiling = measureLength(others) > limit ? Math.max(limit - size, ...starts) : limit - size;
    const at = Math.max(0, Math.min(Math.max(0, ceiling), tidy(Math.round(t / grid) * grid)));
    // Al mover no se bloquea: la nota puede quedar sobre otra igual (el editor no restringe lo que se escribe).
    if (!preserveVoice && !ev.rest && others.some((o, i) => !o.rest && starts[i] === at && o.n === ev.n && o.acc === ev.acc)) return null;
    if (!ev.rest) {
      const trial = clone(others);
      // Al mover se conserva la voz; al agregar se busca una linea independiente.
      (preserveVoice ? insertAt : insertNote)(trial, Object.assign({}, ev), at);
      if (voices(trial).length > MAX_VOICE) return null;
    }
    return { at, d: ev.d, dot: ev.dot };
  }

  // Inserta varias figuras ([[ev, at], ...]) cada una antes de la primera que tiene un `at` mayor, y recien entonces
  // asienta el compas (`settle`: `at` pasa a ser el inicio real, sin huecos). Las figuras que quedan conservan su `at`
  // hasta el final: si se acaba de sacar una figura (mover), su lugar en el orden sigue disponible. Devuelve los indices.
  function insertMany(measure, list) {
    const h = hints(measure);
    measure.forEach((o, i) => { o.at = h[i]; });
    list.forEach(([ev, at]) => {
      ev.at = at;
      let index = measure.findIndex((o) => o.at > at);
      if (index < 0) index = measure.length;
      measure.splice(index, 0, ev);
    });
    settle(measure);
    return list.map(([ev]) => measure.indexOf(ev));
  }

  // Inserta `ev` en el tiempo `at` (el de la partitura tal como se ve), antes de la primera figura que empieza despues.
  function insertAt(measure, ev, at) {
    return insertMany(measure, [[ev, at]])[0];
  }

  function linksInSelection(score, refs) {
    return links(score).filter((link) => refs.some((ref) => sameRef(ref, link.from)) && refs.some((ref) => sameRef(ref, link.to)));
  }

  // Un fragmento conserva los compases intermedios y solo las figuras elegidas. `measures` son las del pentagrama de
  // arriba, o las del de abajo si solo se eligieron esas (`staff: 1`); si se eligieron de ambos, las de abajo van en `lower`.
  function copySelection(score, refs, columns = score.tabs || {}) {
    const chosen = refs.filter((r) => measures(score, staffOf(r))[r.mi]?.[r.i]);
    if (!chosen.length) return null;
    const included = linksInSelection(score, chosen);
    const first = Math.min(...chosen.map((r) => r.mi));
    const last = Math.max(...chosen.map((r) => r.mi));
    const positions = new Map();
    const lanes = Array.from({ length: MAX_PARTS }, (_, staff) => staff).filter((staff) => chosen.some((r) => staffOf(r) === staff)).map((staff) => {
      const all = measures(score, staff);
      const fragment = Array.from({ length: last - first + 1 }, () => []);
      const pitches = fragment.map(() => []);
      const contexts = all.map((measure, mi) => pitchContexts(score, mi, staff));
      all.forEach((measure, mi) => measure.forEach((ev, i) => {
        if (!chosen.some((r) => staffOf(r) === staff && r.mi === mi && r.i === i)) return;
        if (!staff) positions.set(ev, { mi: mi - first, i: fragment[mi - first].length });
        const copied = clone(ev);
        delete copied.tie;
        delete copied.slur;
        const link = included.find((link) => sameRef(link.from, refOf(staff, mi, i)));
        if (link) copied[link.type] = true;
        fragment[mi - first].push(copied);
        pitches[mi - first].push(contexts[mi][i]);
      }));
      return { staff, fragment, pitches };
    });
    const tabs = attacks(score, true).filter((attack) => columns[attack.key]).map((attack) => {
      const notes = attack.events.flatMap((ev, i) => positions.has(ev) ? [{ ...positions.get(ev), midi: attack.midis[i] }] : []);
      const column = columns[attack.key].map((fret, string) =>
        notes.length === attack.events.length || notes.some((note) => tuningOf(score).opens[string] + fret === note.midi) ? fret : null);
      return { notes, column };
    }).filter((entry) => entry.notes.length);
    const signatures = lanes[0].fragment.map((_, offset) => ({ meter: meterAt(score, first + offset), fifths: keyAt(score, first + offset) }));
    const [main, extra] = lanes;
    return {
      pitches: main.pitches, tabs, tuning: tuningOf(score).id, type: 'guitar-score-selection', version: 1, ...signatures[0], signatures, measures: main.fragment,
      ...(main.staff ? { staff: main.staff } : {}),
      ...(extra && main.staff === 0 && extra.staff === 1 ? { lower: extra.fragment, lowerPitches: extra.pitches } : {}),
    };
  }

  // Duplica a una tercera diatonica en una voz independiente, continuando la vecina si esta libre.
  function duplicateVertical(score, refs, delta, stack = false, steps = 2) {
    if (delta !== 1 && delta !== -1) return null;
    const trial = clone(score);
    const chosen = refs.filter((r, i) => measures(trial, staffOf(r))[r.mi]?.[r.i] &&
      refs.findIndex((other) => sameRef(r, other)) === i);
    if (!chosen.some((r) => !measures(trial, staffOf(r))[r.mi][r.i].rest)) return null;
    const included = linksInSelection(trial, chosen);
    const created = [];
    const groups = new Map();
    chosen.forEach((ref) => {
      const key = staffOf(ref) + ':' + ref.mi;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(ref);
    });
    for (const group of groups.values()) {
      const { mi } = group[0], staff = staffOf(group[0]);
      const measure = measures(trial, staff)[mi];
      const original = measure.slice();
      const starts = onsets(measure);
      settleVoices(measure);
      const sourceVoices = [...new Set(group.map((r) => measure[r.i].v))].sort((a, b) => a - b);
      // Continuar la voz vecina si esta libre durante todas las figuras copiadas.
      // Duplicar una frase por partes no debe insertar una voz nueva cada vez.
      const stacked = stack && sourceVoices.length > 1; // Las copias van juntas bajo la voz mas grave elegida.
      const lowest = sourceVoices[sourceVoices.length - 1];
      const reuse = new Map();
      for (const source of stacked ? [] : sourceVoices) {
        const target = source - delta;
        if (target < 1 || target > MAX_VOICE || sourceVoices.includes(target)) continue;
        const selected = group.filter(ref => measure[ref.i].v === source);
        const overlaps = selected.some(ref => original.some((ev, i) => ev.v === target &&
          starts[i] < starts[ref.i] + length(measure[ref.i]) && starts[ref.i] < starts[i] + length(ev)));
        if (!overlaps) reuse.set(source, target);
      }
      const inserted = sourceVoices.filter(source => !reuse.has(source));
      const oldVoice = (v) => v + (stacked ? (v > lowest ? inserted.length : 0) : inserted.filter((s) => delta > 0 ? s <= v : s < v).length);
      const newVoice = (v) => stacked ? lowest + 1 + sourceVoices.indexOf(v) : reuse.has(v) ? oldVoice(reuse.get(v)) : oldVoice(v) - delta;
      if (Math.max(...measure.map(ev => oldVoice(ev.v)), ...sourceVoices.map(newVoice)) > MAX_VOICE) return null;
      let nextTuplet = Math.max(0, ...measure.map((ev) => ev.tp || 0));
      const tuplets = new Map();
      const inserts = group.map((ref) => {
        const source = measure[ref.i];
        const ev = { ...source }; // Figura nueva, con identidad propia para las digitaciones.
        ev.v = newVoice(source.v);
        if (ev.tp) {
          if (!tuplets.has(ev.tp)) tuplets.set(ev.tp, ++nextTuplet);
          ev.tp = tuplets.get(ev.tp);
        }
        if (Number.isInteger(ev.n)) ev.n += steps * delta;
        delete ev.tie;
        delete ev.slur;
        const link = included.find((l) => sameRef(l.from, ref));
        if (link) ev[link.type] = true;
        return [ev, starts[ref.i]];
      });
      if (inserts.some(([ev, at]) => !ev.rest && (ev.n < LOWEST || ev.n > HIGHEST ||
        original.some((o, i) => !o.rest && starts[i] === at && o.n === ev.n && o.acc === ev.acc)))) return null;
      measure.forEach((ev, i) => { ev.at = starts[i]; ev.v = oldVoice(ev.v); });
      insertMany(measure, inserts);
      const after = onsets(measure);
      if (measureLength(measure) > Infinity ||
        original.some((ev, i) => after[measure.indexOf(ev)] !== starts[i]) ||
        inserts.some(([ev, at]) => after[measure.indexOf(ev)] !== at)) return null;
      inserts.forEach(([ev]) => created.push(refOf(staff, mi, measure.indexOf(ev))));
    }
    Object.assign(score, trial);
    return created;
  }

  // Numeros de voz que hay en la partitura (los de cualquier compas de los pentagramas visibles), de menor a mayor.
  function voiceNumbers(score) {
    const trial = clone(score), found = new Set();
    for (let staff = 0; staff < stavesOf(trial); staff += 1) {
      measures(trial, staff).forEach((measure) => {
        if (!measure?.length) return;
        settleVoices(measure);
        measure.forEach((ev) => found.add(ev.v));
      });
    }
    return [...found].sort((x, y) => x - y);
  }

  // Duplica las voces `voices` (por defecto la superior) de toda la partitura `steps` pasos diatonicos abajo (2: una tercera; 5: una sexta). Con varias,
  // las copias quedan juntas bajo la mas grave de las elegidas en cada compas. Devuelve las figuras creadas, o null
  // (sin tocar la partitura) si alguna no entra.
  // Con `only` (figuras elegidas) el alcance es esa seleccion y no la partitura entera.
  function duplicateVoice(score, voices = null, steps = 2, only = null) {
    const trial = clone(score);
    const refs = only ? only.slice() : [];
    for (let staff = 0; staff < stavesOf(trial) && !only; staff += 1) {
      measures(trial, staff).forEach((measure, mi) => {
        if (!measure?.length) return;
        settleVoices(measure);
        const chosen = voices ? new Set(voices) : new Set([Math.min(...measure.map((ev) => ev.v))]);
        measure.forEach((ev, i) => { if (chosen.has(ev.v)) refs.push(refOf(staff, mi, i)); });
      });
    }
    const created = refs.length ? duplicateVertical(trial, refs, -1, true, steps) : null;
    if (!created?.length) return null;
    if (voicePerStaff(trial)) legendForCopies(trial, created);
    Object.assign(score, trial);
    return created;
  }

  // En coro y guitarra con varios pentagramas la leyenda numera las voces: la copia no debe heredar la de su original
  // (se veria como la misma voz), sino tomar un numero de leyenda libre. Si no queda ninguno, hereda como antes.
  function legendForCopies(score, created) {
    const staves = [...new Set(created.map(staffOf))];
    const taken = new Set();
    for (let staff = 0; staff < stavesOf(score); staff += 1) legendsOf(score, staff).forEach((n) => taken.add(n));
    const ks = (staff) => [...new Set(created.filter((r) => staffOf(r) === staff).map((r) => measures(score, staff)[r.mi][r.i].v - 1))].sort((a, b) => a - b);
    const maps = new Map(staves.map((staff) => [staff, Array.from({ length: MAX_VOICE }, (_, k) => legendOf(score, staff, k))]));
    staves.forEach((staff) => ks(staff).forEach((k) => {
      const free = [1, 2, 3, 4].find((n) => !taken.has(n));
      if (!free) return;
      taken.add(free);
      maps.get(staff)[k] = free;
    }));
    withMaps(score, (all) => maps.forEach((map, staff) => { all[staff] = map; }));
  }

  // Duplica las figuras elegidas justo despues de la ultima de ellas, conservando su ritmo relativo. Lo que no entra
  // en el compas sigue en los siguientes (se agregan los que falten; una figura partida queda ligada) y convive con
  // lo que ya hay: misma altura y duracion se ignora, misma altura y otra duracion actualiza la duracion.
  // Devuelve las figuras resultantes, o null (sin tocar la partitura) si algo no se puede colocar.
  function duplicateSelection(score, refs) {
    const trial = clone(score);
    const laneOf = (staff) => measures(trial, staff);
    // Duplicar continua las partes originales; no debe reinterpretar las copias
    // como voces nuevas cuando coinciden con notas que ya estaban en el destino.
    Array.from({ length: stavesOf(trial) }, (_, staff) => staff).forEach((staff) => laneOf(staff).forEach(settleVoices));
    const chosen = refs.filter((r, k) => laneOf(staffOf(r))[r.mi]?.[r.i] && refs.findIndex((o) => sameRef(o, r)) === k);
    if (!chosen.length) return null;
    const savedTabs = captureTabReferences(trial);
    const sourceAttacks = attacks(trial, true);
    const starts = () => {
      let total = 0;
      const list = measures(trial).map((_, mi) => { const at = total; total += capacity(trial, mi); return at; });
      return { list, total };
    };
    const origin = starts().list;
    const sources = chosen.map((ref) => {
      const { mi, i } = ref, staff = staffOf(ref);
      const ev = laneOf(staff)[mi][i];
      return { ev, staff, abs: origin[mi] + onsets(laneOf(staff)[mi])[i], pitch: pitchContexts(trial, mi, staff)[i], clef: CLEFS[clefAt(trial, mi, staff)].octave || 0 };
    }).sort((a, b) => a.abs - b.abs);
    const offset = Math.max(...sources.map((s) => s.abs + length(s.ev))) - sources[0].abs;
    const needed = Math.max(...sources.map((s) => s.abs + offset + length(s.ev)));
    while (starts().total < needed) trial.rows.push(emptyRow());
    const { list: first } = starts();
    const values = Object.keys(VALUES).flatMap((d) => [{ d }, ...(!['w', 's', 'f'].includes(d) ? [{ d, dot: true }] : [])])
      .sort((a, b) => length(b) - length(a));
    const decompose = (size) => {
      const pieces = [];
      while (size > 0) {
        const value = values.find((v) => length(v) <= size);
        if (!value) return null;
        pieces.push(value);
        size -= length(value);
      }
      return pieces;
    };
    // Cada figura elegida pasa a una o mas partes, cada una en el compas que le toca.
    const byMeasure = new Map(); // 'pentagrama:compas' -> { staff, mi, entries }
    const partsOf = new Map();
    const partStaff = new Map();
    for (const source of sources) {
      const { ev } = source;
      let pos = source.abs + offset, remaining = length(ev);
      partsOf.set(ev, []);
      while (remaining > 0) {
        const mi = first.findLastIndex((at) => at <= pos);
        const room = first[mi] + capacity(trial, mi) - pos;
        const size = Math.min(room, remaining);
        let made;
        if (size === length(ev)) made = [clone(ev)];
        else {
          if (ev.tp) return null;
          const pieces = decompose(size);
          if (!pieces) return null;
          made = pieces.map((value, k) => {
            const part = Object.assign(clone(ev), value, { at: 0 });
            delete part.tp; delete part.tn; delete part.dot;
            if (value.dot) part.dot = true;
            if (k < pieces.length - 1 || remaining > size) { if (!ev.rest) part.tie = true; delete part.slur; }
            return part;
          });
        }
        made.forEach((part) => {
          part.at = pos - first[mi];
          const key = source.staff + ':' + mi;
          if (!byMeasure.has(key)) byMeasure.set(key, { staff: source.staff, mi, entries: [] });
          byMeasure.get(key).entries.push({ part, source });
          partsOf.get(ev).push(part);
          partStaff.set(part, source.staff);
          pos += length(part);
        });
        remaining -= size;
      }
    }
    const fresh = new Set();
    const landed = new Map();
    for (const { staff, mi, entries } of [...byMeasure.values()].sort((a, b) => a.staff - b.staff || a.mi - b.mi)) {
      const dest = measures(trial, staff)[mi];
      const times = onsets(dest);
      const existing = pitchContexts(trial, mi, staff);
      const desired = new Map(dest.map((ev, i) => [ev, existing[i]]));
      const octave = CLEFS[clefAt(trial, mi, staff)].octave || 0;
      let nextId = Math.max(0, ...dest.map((ev) => ev.tp || 0));
      const ids = new Map();
      const inserts = [];
      for (const { part, source } of entries) {
        if (!part.rest) {
          part.n += 7 * (source.clef - octave);
          if (part.n < LOWEST || part.n > HIGHEST) return null;
        }
        const at = part.at;
        const twin = dest.findIndex((o, j) => times[j] === at && (part.rest
          ? o.rest
          : !o.rest && o.n === part.n && existing[j]?.alter === source.pitch?.alter));
        const blocked = part.rest && dest.some((o, j) => times[j] === at && !o.rest);
        if (blocked) continue;
        if (twin >= 0) {
          const other = dest[twin];
          if (length(other) !== length(part) && !other.tp && !part.tp) {
            delete other.dot;
            Object.assign(other, { d: part.d }, part.dot ? { dot: true } : {});
          }
          landed.set(part, other);
          continue;
        }
        if (part.tp) {
          if (!ids.has(part.tp)) ids.set(part.tp, ++nextId);
          part.tp = ids.get(part.tp);
        }
        if (!part.rest && source.pitch) desired.set(part, source.pitch);
        inserts.push([part, at]);
        fresh.add(part);
        landed.set(part, part);
      }
      insertMany(dest, inserts);
      if (measureLength(dest) > Infinity) return null;
      // Una alteracion copiada no debe cambiar la altura de lo que ya estaba en el compas.
      const actual = new Map();
      const order = onsets(dest);
      dest.map((ev, i) => i).sort((a, b) => order[a] - order[b]).forEach((i) => {
        const ev = dest[i];
        if (ev.rest) return;
        const pitch = desired.get(ev);
        const alter = ev.acc ? ACCIDENTALS[ev.acc].alter : actual.has(ev.n) ? actual.get(ev.n) : keyAlter(ev.n, trial, mi);
        if (pitch && alter !== pitch.alter) ev.acc = accidentalFor(pitch.alter);
        if (ev.acc) actual.set(ev.n, ACCIDENTALS[ev.acc].alter);
      });
    }
    // La digitacion de la TAB viaja con la nota, igual que al copiar y pegar.
    const columns = score.tabs || {};
    sourceAttacks.filter((attack) => columns[attack.key]).forEach((attack) => {
      const notes = attack.events.flatMap((ev, k) => {
        const target = partsOf.get(ev)?.[0];
        return target && fresh.has(target) ? [{ target, midi: attack.midis[k] }] : [];
      });
      if (!notes.length) return;
      const column = columns[attack.key].map((fret, string) =>
        notes.length === attack.events.length || notes.some((note) => tuningOf(score).opens[string] + fret === note.midi) ? fret : null);
      savedTabs.push({ refs: notes.map((note) => tabReference(note.target)), midis: notes.map((note) => note.midi), column });
    });
    restoreTabReferences(trial, savedTabs);
    const created = [];
    for (const { ev } of sources) {
      for (const part of partsOf.get(ev)) {
        const target = landed.get(part);
        const staff = partStaff.get(part);
        const mi = target && measures(trial, staff).findIndex((m) => m.includes(target));
        if (target && mi >= 0) created.push(refOf(staff, mi, measures(trial, staff)[mi].indexOf(target)));
      }
    }
    score.rows = trial.rows;
    LANE_KEYS.forEach((name) => { if (trial[name]) score[name] = trial[name]; else delete score[name]; });
    pruneLower(score);
    if (trial.tabs) score.tabs = trial.tabs;
    else delete score.tabs;
    return created.length ? created : null;
  }

  // Prepara todo antes de escribir: un pegado que no entra no cambia la partitura.
  function pasteSelection(score, fragment, mi, { preserveSignatures = true, staff: target, at: start = 0 } = {}) {
    if (fragment?.type !== 'guitar-score-selection' || fragment.version !== 1 ||
      !Number.isInteger(mi) || mi < 0 || mi >= measures(score).length ||
      !Array.isArray(fragment.measures) || !fragment.measures.length ||
      !fragment.measures.every(Array.isArray)) return null;
    const meterContext = { meter: fragment.meter, meters: Object.fromEntries((Array.isArray(fragment.signatures) ? fragment.signatures : []).map((signature, i) => [i, signature?.meter])) };
    const cleanOf = (list) => sanitize({ ...meterContext, rows: [list] }).rows[0];
    const clean = cleanOf(fragment.measures);
    if (clean.some((m, i) => m.length !== fragment.measures[i].length) || !clean.some((m) => m.length)) return null;
    // El fragmento de un solo pentagrama va al pentagrama pedido (o al de donde salio); el de dos, a cada uno. Sin
    // segundo pentagrama, todo va al primero.
    const staves = stavesOf(score);
    const mainStaff = Math.min(Number.isInteger(target) && !Array.isArray(fragment.lower) ? target : fragment.staff || 0, staves - 1);
    const lowerList = Array.isArray(fragment.lower) && fragment.lower.length === clean.length && fragment.lower.every(Array.isArray) && staves > 1 && mainStaff === 0
      ? cleanOf(fragment.lower) : null;
    if (lowerList && lowerList.some((m, i) => m.length !== fragment.lower[i].length)) return null;
    const lanes = [{ staff: mainStaff, clean, pitches: fragment.pitches }].concat(lowerList ? [{ staff: 1, clean: lowerList, pitches: fragment.lowerPitches }] : []);
    const savedTabs = captureTabReferences(score);
    // El portapapeles usa indices serializables; al pegar se les da una identidad nueva.
    if (mainStaff === 0 && tuningOf(fragment).id === tuningOf(score).id && Array.isArray(fragment.tabs)) fragment.tabs.forEach((entry) => {
      if (!entry || !Array.isArray(entry.notes) || !entry.notes.length || !Array.isArray(entry.column)) return;
      const notes = entry.notes.map((note) => note && Number.isInteger(note.mi) && Number.isInteger(note.i) &&
        Number.isInteger(note.midi) && clean[note.mi]?.[note.i] && !clean[note.mi][note.i].rest ? note : null);
      if (notes.some((note) => !note)) return;
      savedTabs.push({ refs: notes.map((note) => tabReference(clean[note.mi][note.i])), midis: notes.map((note) => note.midi),
        column: sanitizeTabs({ '0:0': entry.column }, 1)['0:0'] });
    });
    const trial = clone(score);
    while (measures(trial).length < mi + clean.length) trial.rows.push(emptyRow());
    const all = measures(trial);
    if (preserveSignatures) {
      const end = mi + clean.length;
      const after = { meter: meterAt(trial, end), fifths: keyAt(trial, end) };
      for (let offset = 0; offset < clean.length; offset += 1) {
        const signature = fragment.signatures?.[offset] || (offset === 0 ? fragment : null);
        if (!signature) continue;
        if (METERS.includes(signature.meter)) {
          const changedMeter = meterAt(trial, mi + offset) !== signature.meter;
          if (mi + offset === 0) trial.meter = signature.meter;
          else (trial.meters ||= {})[mi + offset] = signature.meter;
          if (changedMeter && trial.measureDurations) delete trial.measureDurations[mi + offset];
        }
        if (Number.isInteger(signature.fifths) && Math.abs(signature.fifths) <= 7) {
          if (mi + offset === 0) trial.fifths = signature.fifths;
          else (trial.keys ||= {})[mi + offset] = signature.fifths;
        }
      }
      if (end < all.length) {
        (trial.meters ||= {})[end] = after.meter;
        (trial.keys ||= {})[end] = after.fifths;
      }
      pruneKeys(trial);
    }
    const refs = [];
    for (const { staff, clean, pitches } of lanes) for (let offset = 0; offset < clean.length; offset += 1) {
      const destination = measures(trial, staff)[mi + offset];
      const destinationPitches = pitchContexts(trial, mi + offset, staff);
      const desired = new Map(destination.map((ev, i) => [ev, destinationPitches[i]]));
      const octave = CLEFS[clefAt(trial, mi + offset, staff)].octave || 0;
      for (let i = 0; i < clean[offset].length; i += 1) {
        const ev = clean[offset][i];
        const pitch = pitches?.[offset]?.[i];
        if (ev.rest || !pitch || ![-1, 0, 1].includes(pitch.alter) || ![-1, 0].includes(pitch.octave)) continue;
        ev.n += 7 * (pitch.octave - octave);
        if (ev.n < LOWEST || ev.n > HIGHEST) return null;
        desired.set(ev, pitch);
        if (pitch.alter !== keyAlter(ev.n, trial, mi + offset)) ev.acc = accidentalFor(pitch.alter);
        else if (ev.acc === 'n') delete ev.acc; // el becuadro que el destino no necesita se descarta
      }
      // Con un punto de inicio (el cursor), el primer compas del fragmento empieza ahi y no al comienzo del compas.
      if (offset === 0 && start > 0) {
        const grid = gridOf(clean[0]);
        const shift = Math.round(start / grid) * grid;
        clean[0].forEach((ev) => { ev.at += shift; });
      }
      const starts = onsets(destination);
      const clashes = () => clean[offset].some((ev) => !ev.rest && destination.some((other, i) =>
        !other.rest && starts[i] === ev.at && other.n === ev.n &&
        (desired.has(ev) ? desired.get(other)?.alter === desired.get(ev).alter : other.acc === ev.acc)));
      // Si repite notas que ya suenan ahi (pegar sobre el mismo compas), sigue a lo que ya hay en el compas.
      if (clashes()) {
        const shift = measureLength(destination);
        clean[offset].forEach((ev) => { ev.at += shift; });
        if (clashes()) return null;
      }
      const ids = new Map();
      let nextId = Math.max(0, ...destination.map((ev) => ev.tp || 0));
      const list = clean[offset].map((ev) => {
        if (ev.tp) {
          if (!ids.has(ev.tp)) ids.set(ev.tp, ++nextId);
          ev.tp = ids.get(ev.tp);
        }
        return [ev, ev.at];
      });
      const indices = insertMany(destination, list);
      // Una alteracion pegada no debe cambiar las notas que ya estaban en el destino.
      const actual = new Map();
      const times = onsets(destination);
      destination.map((ev, i) => i).sort((a, b) => times[a] - times[b]).forEach((i) => {
        const ev = destination[i];
        if (ev.rest) return;
        const pitch = desired.get(ev);
        const alter = ev.acc ? ACCIDENTALS[ev.acc].alter : actual.has(ev.n) ? actual.get(ev.n) : keyAlter(ev.n, trial, mi + offset);
        if (pitch && alter !== pitch.alter) ev.acc = accidentalFor(pitch.alter);
        if (ev.acc) actual.set(ev.n, ACCIDENTALS[ev.acc].alter);
      });
      indices.forEach((i) => refs.push(refOf(staff, mi + offset, i)));
    }
    restoreTabReferences(trial, savedTabs);
    score.rows = trial.rows;
    LANE_KEYS.forEach((name) => { if (trial[name]) score[name] = trial[name]; else delete score[name]; });
    pruneLower(score);
    CLEF_KEYS.slice(1).flat().forEach((name) => { if (trial[name] !== undefined) score[name] = trial[name]; else delete score[name]; });
    for (const name of ['meter', 'meters', 'fifths', 'keys', 'measureDurations']) {
      if (trial[name] !== undefined) score[name] = trial[name];
      else delete score[name];
    }
    if (trial.tabs) score.tabs = trial.tabs;
    else delete score.tabs;
    return refs;
  }

  // Un patron guarda el ritmo y la relacion entre las alturas (grados diatonicos desde la primera nota), no la tonalidad
  // ni las alteraciones: `dn` es la distancia en pasos de escala a la primera nota con altura. Cada figura lleva su
  // compas (`mi`, desde el primero del patron) y su inicio (`at`) dentro de el.
  const PATTERN_KEYS = ['dot', 'rest', 'dead', 'tp', 'tn', 'beam', 'tie', 'slur'];
  const MAX_PATTERN_EVENTS = 128;

  function patternOf(items) {
    if (!items.length) return null;
    items.sort((a, b) => a.mi - b.mi || a.at - b.at || (a.ev.n ?? 0) - (b.ev.n ?? 0));
    const base = items.find((item) => !item.ev.rest)?.ev.n ?? 0;
    const events = items.map(({ ev, mi, at }) => {
      const out = { d: ev.d };
      PATTERN_KEYS.forEach((key) => { if (ev[key] !== undefined) out[key] = ev[key]; });
      if (!ev.rest) out.dn = ev.n - base;
      out.mi = mi - items[0].mi;
      out.at = at;
      return out;
    });
    return { events, first: items[0].at };
  }

  // De las figuras elegidas, que tienen que ser de un solo pentagrama.
  function patternFrom(score, refs) {
    if (!refs.length || refs.some((ref) => staffOf(ref) !== staffOf(refs[0]))) return null;
    const lane = measures(score, staffOf(refs[0]));
    const chosen = refs.filter((ref, k) => lane[ref.mi]?.[ref.i] && refs.findIndex((o) => sameRef(o, ref)) === k);
    // Una ligadura pertenece al patron solo cuando se guardan ambos extremos.
    const included = linksInSelection(score, chosen);
    return patternOf(chosen.map((ref) => {
      const ev = { ...lane[ref.mi][ref.i] };
      delete ev.tie;
      delete ev.slur;
      const link = included.find((link) => sameRef(ref, link.from));
      if (link) ev[link.type] = true;
      return { ev, mi: ref.mi, at: onsets(lane[ref.mi])[ref.i] };
    }));
  }

  function patternFromMeasure(score, mi, staff = 0) {
    const measure = measures(score, staff)[mi];
    if (!measure) return null;
    return patternFrom(score, measure.map((_, i) => refOf(staff, mi, i)));
  }

  // Lo que viene de guardado: solo figuras validas y con los campos que el modelo conoce.
  const patternsOf = (data) => (Array.isArray(data.patterns) ? data.patterns.map(cleanPattern).filter(Boolean).slice(0, 60) : []);

  function cleanPattern(data) {
    if (!data || !Array.isArray(data.events) || !data.events.length || data.events.length > MAX_PATTERN_EVENTS) return null;
    const events = [];
    for (const raw of data.events) {
      if (!raw || !VALUES[raw.d] || !Number.isInteger(raw.mi) || raw.mi < 0 || !Number.isInteger(raw.at) || raw.at < 0) return null;
      const ev = { d: raw.d };
      if (raw.rest === true) ev.rest = true;
      else if (Number.isInteger(raw.dn) && Math.abs(raw.dn) <= HIGHEST - LOWEST) ev.dn = raw.dn;
      else return null;
      if (raw.dot === true || raw.dot === 2) ev.dot = raw.dot;
      if (!ev.rest && raw.dead === true) ev.dead = true;
      if (!ev.rest && raw.tie === true) ev.tie = true;
      else if (!ev.rest && raw.slur === true) ev.slur = true;
      if (Number.isInteger(raw.tp) && raw.tp > 0) { ev.tp = raw.tp; if (TUPLETS[raw.tn] && raw.tn !== 3) ev.tn = raw.tn; }
      if (raw.beam === 'join' || raw.beam === 'break') ev.beam = raw.beam;
      ev.mi = raw.mi;
      ev.at = raw.at;
      events.push(ev);
    }
    return { events, first: Number.isInteger(data.first) && data.first >= 0 ? data.first : events[0].at };
  }

  const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII'];
  // "I V III II": el grado de cada nota respecto de la primera; una octava mas arriba o abajo se marca con + o -.
  function patternDegrees(pattern) {
    const out = [];
    pattern.events.forEach((ev, i) => {
      if (ev.rest) return;
      const prior = pattern.events[i - 1];
      if (prior && !prior.rest && prior.mi === ev.mi && prior.at === ev.at && prior.dn !== undefined) { out[out.length - 1] += '/' + degree(ev.dn); return; }
      out.push(degree(ev.dn));
    });
    return out.join(' ');
  }
  function degree(dn) {
    const octave = Math.floor(dn / 7);
    return ROMAN[((dn % 7) + 7) % 7] + (octave > 0 ? '+'.repeat(octave) : '-'.repeat(-octave));
  }

  // Escribe el patron desde (`mi`, `at`) en el pentagrama `staff`; la primera nota con altura queda en `n`. Con `flat`
  // todas las notas van a `n` (solo se usa el ritmo). Modifica `score`: quien llama le pasa una copia de prueba.
  // Devuelve las figuras nuevas, o null si no entra (compas de menos, fuera de rango, nota repetida o sin lugar).
  function applyPattern(score, pattern, { mi, staff = 0, at = pattern.first, n, flat = false }) {
    const clean = cleanPattern(pattern);
    if (!clean || !Number.isInteger(mi) || mi < 0 || !Number.isInteger(n)) return null;
    const shift = at - clean.first;
    const span = Math.max(...clean.events.map((ev) => ev.mi)) + 1;
    while (measures(score).length < mi + span) score.rows.push(emptyRow());
    const refs = [];
    for (let offset = 0; offset < span; offset += 1) {
      const destination = measures(score, staff)[mi + offset];
      const starts = onsets(destination);
      const ids = new Map();
      let nextId = Math.max(0, ...destination.map((ev) => ev.tp || 0));
      const list = [];
      for (const raw of clean.events.filter((ev) => ev.mi === offset)) {
        const { dn, mi: _mi, at: start, ...ev } = raw;
        const when = start + (offset === 0 ? shift : 0);
        if (when < 0) return null;
        if (!ev.rest) {
          ev.n = flat ? n : n + dn;
          if (ev.n < LOWEST || ev.n > HIGHEST) return null;
          if (destination.some((o, i) => !o.rest && starts[i] === when && o.n === ev.n && !o.acc)) return null;
        }
        if (ev.tp) {
          if (!ids.has(ev.tp)) ids.set(ev.tp, ++nextId);
          ev.tp = ids.get(ev.tp);
        }
        list.push([ev, when]);
      }
      const indices = insertMany(destination, list);
      if (measureLength(destination) > Infinity || voices(destination).length > MAX_VOICE) return null;
      indices.forEach((i) => refs.push(refOf(staff, mi + offset, i)));
    }
    pruneLower(score);
    return refs;
  }

  function clampPitch(n) {
    return Math.max(LOWEST, Math.min(HIGHEST, n));
  }

  function emptyRow() {
    return Array.from({ length: PER_ROW }, () => []);
  }

  function emptyScore() {
    return { meter: '4/4', clef: defaultClef, fifths: 0, rows: Array.from({ length: MIN_ROWS }, emptyRow) };
  }

  // Identidad interna de las figuras: no se serializa ni depende de compas, tiempo o indice.
  const tabReferences = new WeakMap();
  function tabReference(ev) {
    if (!tabReferences.has(ev)) tabReferences.set(ev, {});
    return tabReferences.get(ev);
  }

  function clone(score) {
    const result = JSON.parse(JSON.stringify(score));
    const remember = (from, to) => {
      if (!from || typeof from !== 'object' || !to || typeof to !== 'object') return;
      tabReferences.set(to, tabReference(from));
      Object.keys(to).forEach((key) => remember(from[key], to[key]));
    };
    remember(score, result);
    return result;
  }

  // Compases en orden de lectura; el indice plano es el que usan los ids del SVG.
  // El segundo pentagrama (`staff` 1) guarda sus compases en `score.lower` (indice plano -> figuras); un compas sin
  // figuras no tiene entrada. Aca se crean al pedirlos, para poder editarlos; `sanitize` quita los vacios.
  function measures(score, staff = 0) {
    const all = score.rows.flat();
    if (!staff) return all;
    const lower = (score[laneKey(staff)] ||= {});
    return all.map((_, mi) => (lower[mi] ||= []));
  }

  // Cantidad de pentagramas por renglon: el gran pentagrama es del piano, si el sitio lo activa.
  // Voces (coro, solo si el sitio lo activa con `choir`): 2 a 4 pentagramas visibles; los demas se conservan ocultos.
  function stavesOf(score) {
    if (!grandStaff) return 1;
    const instrument = instrumentOf(score);
    if (instrument === 'piano') return 2;
    if (!choir) return 1;
    return instrument === 'voices' ? partsOf(score) : instrument === 'guitar' ? guitarPartsOf(score) : 1;
  }

  // Guitarra (Pro, `choir`): 1 a 4 pentagramas que comparten una sola tablatura. Con uno no se guarda `parts`.
  const guitarPartsOf = (score) => (score && partsValid(score.parts) ? score.parts : 1);
  function setGuitarParts(score, parts) {
    if (!Number.isInteger(parts) || parts < 1 || parts > MAX_PARTS) return false;
    if (parts === 1) delete score.parts; else score.parts = parts;
    return true;
  }

  // Cada pentagrama es una voz de la leyenda: en coro y en guitarra con varias voces (en piano, cada mano infiere las suyas).
  const voicePerStaff = (score) => {
    const instrument = instrumentOf(score);
    return instrument === 'voices' || (instrument === 'guitar' && stavesOf(score) > 1);
  };

  // Numero de la leyenda (1-4) de la voz de notacion `k` del pentagrama `staff`. Unir y separar pentagramas lo fijan en
  // `score.voiceMap[staff][k]`; sin eso, cada pentagrama es una voz (`staff + 1`) o, con uno solo, la voz `k` (en piano, igual).
  const legendMapOf = (score, staff) => {
    const map = score && Array.isArray(score.voiceMap) ? score.voiceMap[staff] : null;
    return validLegendMap(map) ? map : null;
  };
  const validLegendMap = (map) => Array.isArray(map) && map.length > 0 && map.length <= MAX_VOICE && map.every((n) => Number.isInteger(n) && n >= 1 && n <= 4);
  function legendOf(score, staff, k) {
    const map = legendMapOf(score, staff);
    if (map) return map[k] ?? map[0];
    return voicePerStaff(score) ? staff + 1 : k % 4 + 1;
  }

  // Compas `mi` del pentagrama `staff` sin crearlo si no existe.
  const laneAt = (score, staff, mi) => (staff ? (score[laneKey(staff)] && score[laneKey(staff)][mi]) || [] : measures(score)[mi] || []);

  // Indices de las figuras de `measure` cuya voz esta en `selected`; null si no se filtra.
  function selectedEvents(score, staff, measure, selected) {
    if (!selected) return null;
    return new Set(voices(measure).flatMap((voice, k) => (selected.has(legendOf(score, staff, k)) ? voice.groups.flatMap((group) => group.indices) : [])));
  }

  // Unir y separar pentagramas (Pro): solo guitarra y coro, que tienen una cantidad variable de pentagramas.
  const restructurable = (score) => choir && grandStaff && ['guitar', 'voices'].includes(instrumentOf(score));
  const minStaves = (score) => (instrumentOf(score) === 'voices' ? MIN_PARTS : 1);
  const canJoinStaves = (score) => restructurable(score) && stavesOf(score) >= 2 && stavesOf(score) - 1 >= minStaves(score);
  function setStaffCount(score, count) {
    if (instrumentOf(score) === 'voices') return setParts(score, count);
    return setGuitarParts(score, count);
  }

  // Voces (numeros de la leyenda) con figuras en el pentagrama, de menor a mayor.
  function legendsOf(score, staff) {
    const used = new Set();
    measures(score).forEach((_, mi) => voices(laneAt(score, staff, mi)).forEach((voice, k) => { if (voice.groups.length) used.add(legendOf(score, staff, k)); }));
    return [...used].sort((a, b) => a - b);
  }

  // Aplica `change` a una copia y solo si sale bien reemplaza la partitura: unir o separar no deja nada a medias.
  function rebuild(score, change) {
    const trial = clone(score);
    if (!change(trial)) return false;
    Object.keys(score).forEach((key) => { delete score[key]; });
    Object.assign(score, trial);
    return true;
  }

  const moveKey = (score, from, to) => { if (score[from] === undefined) delete score[to]; else score[to] = score[from]; };
  // Lleva el contenido (figuras, claves, registro, voces de leyenda) del pentagrama `from` al `to`, ambos de 1 a 3.
  function moveStaffData(score, from, to) {
    moveKey(score, LANE_KEYS[from - 1], LANE_KEYS[to - 1]);
    CLEF_KEYS[from].forEach((key, k) => moveKey(score, key, CLEF_KEYS[to][k]));
  }
  const clearStaffData = (score, staff) => {
    delete score[LANE_KEYS[staff - 1]];
    CLEF_KEYS[staff].forEach((key) => { delete score[key]; });
  };
  const withMaps = (score, edit) => {
    const maps = Array.from({ length: MAX_PARTS }, (_, t) => (validLegendMap(score.voiceMap?.[t]) ? score.voiceMap[t] : null));
    edit(maps);
    if (maps.some(Boolean)) score.voiceMap = maps; else delete score.voiceMap;
  };
  const withRegisters = (score, edit) => {
    if (!Array.isArray(score.registers) && instrumentOf(score) !== 'voices') return;
    const registers = Array.from({ length: MAX_PARTS }, (_, k) => registerOf(score, k));
    edit(registers);
    score.registers = registers;
  };
  const shiftLyrics = (score, from, by) => {
    Object.values(score.lyrics || {}).forEach((list) => list.forEach((lyric) => {
      if ((lyric.s || 0) < from) return;
      const staff = (lyric.s || 0) + by;
      if (staff) lyric.s = staff; else delete lyric.s;
    }));
  };

  // Quita el pentagrama `staff` (1 a 3) y sube los de abajo.
  function dropStaff(score, staff) {
    for (let t = staff; t < MAX_PARTS - 1; t += 1) moveStaffData(score, t + 1, t);
    clearStaffData(score, MAX_PARTS - 1);
    withMaps(score, (maps) => { maps.splice(staff, 1); maps.push(null); });
    withRegisters(score, (registers) => { registers.splice(staff, 1); registers.push(DEFAULT_REGISTERS[MAX_PARTS - 1]); });
  }

  // Abre un pentagrama vacio en `staff` (1 a 3) con la clave y el registro del anterior; los de abajo bajan un lugar.
  function openStaff(score, staff) {
    for (let t = MAX_PARTS - 1; t > staff; t -= 1) moveStaffData(score, t - 1, t);
    clearStaffData(score, staff);
    CLEF_KEYS[staff - 1].forEach((key, k) => { if (score[key] !== undefined) score[CLEF_KEYS[staff][k]] = JSON.parse(JSON.stringify(score[key])); });
    withMaps(score, (maps) => { maps.splice(staff, 0, null); maps.pop(); });
    withRegisters(score, (registers) => { registers.splice(staff, 0, registers[staff - 1]); registers.pop(); });
  }

  // Une pentagramas en el primero de `staves`: sus voces pasan a ser voces del mismo pentagrama, cada una con su numero.
  // Rechaza (false) si quedaria un pentagrama de menos de la cantidad minima, pasaria de 16 voces, dos voces tocarian la
  // misma nota a la vez o algun inicio cambiaria.
  function joinStaves(score, staves) {
    const list = [...new Set(staves)].sort((a, b) => a - b);
    const count = stavesOf(score);
    if (!restructurable(score) || list.length < 2 || list.some((s) => !Number.isInteger(s) || s < 0 || s >= count) || count - (list.length - 1) < minStaves(score)) return false;
    return rebuild(score, (trial) => {
      const total = measures(trial).length;
      const counts = list.map((s) => Math.max(1, ...Array.from({ length: total }, (_, mi) => voices(laneAt(trial, s, mi)).length)));
      if (counts.reduce((a, b) => a + b, 0) > MAX_VOICE) return false;
      const joined = list.flatMap((s, j) => Array.from({ length: counts[j] }, (_, k) => legendOf(trial, s, k)));
      const first = list[0];
      for (let mi = 0; mi < total; mi += 1) {
        const expected = new Map();
        const merged = [];
        let offset = 0;
        list.forEach((s, j) => {
          const measure = laneAt(trial, s, mi);
          const { lanes, starts } = arrange(measure);
          lanes.forEach((voice, k) => voice.groups.forEach((g) => g.indices.forEach((i) => {
            measure[i].v = offset + k + 1;
            measure[i].at = starts[i];
            expected.set(measure[i], starts[i]);
          })));
          merged.push(...measure);
          offset += counts[j];
        });
        if (!merged.length) continue;
        const target = first ? ((trial[laneKey(first)] ||= {})[mi] ||= []) : measures(trial)[mi];
        target.splice(0, target.length, ...merged);
        const starts = onsets(target);
        if (target.some((ev, i) => starts[i] !== expected.get(ev) || (!ev.rest && target.some((o, j) => j > i && !o.rest && starts[j] === starts[i] && o.n === ev.n)))) return false;
      }
      // Las silabas del pentagrama que se va pasan al primero si el lugar esta libre; el resto se descarta.
      list.slice(1).reverse().forEach((s) => {
        Object.entries(trial.lyrics || {}).forEach(([mi, items]) => {
          trial.lyrics[mi] = items.filter((lyric) => (lyric.s || 0) !== s || !items.some((o) => o !== lyric && o.at === lyric.at && (o.s || 0) === first));
          trial.lyrics[mi].forEach((lyric) => { if ((lyric.s || 0) === s) { if (first) lyric.s = first; else delete lyric.s; } });
        });
        shiftLyrics(trial, s + 1, -1);
        dropStaff(trial, s);
      });
      withMaps(trial, (maps) => { maps[first] = joined; });
      return setStaffCount(trial, count - (list.length - 1));
    });
  }

  // Separa del pentagrama `staff` las voces `legends` (numeros de la leyenda) en un pentagrama nuevo justo debajo.
  // Rechaza (false) si no deja voces en alguno de los dos, no hay lugar (4 pentagramas) o se perderia un pentagrama oculto.
  function splitStaff(score, staff, legends) {
    const count = stavesOf(score);
    const chosen = new Set(legends);
    if (!restructurable(score) || !Number.isInteger(staff) || staff < 0 || staff >= count || count + 1 > MAX_PARTS || !chosen.size) return false;
    if (Object.values(score[LANE_KEYS[MAX_PARTS - 2]] || {}).some((measure) => measure.length)) return false;
    return rebuild(score, (trial) => {
      const total = measures(trial).length;
      let size = 1;
      for (let mi = 0; mi < total; mi += 1) {
        const measure = laneAt(trial, staff, mi);
        const { lanes, starts } = arrange(measure);
        size = Math.max(size, lanes.length);
        lanes.forEach((voice, k) => voice.groups.forEach((g) => g.indices.forEach((i) => { measure[i].v = k + 1; measure[i].at = starts[i]; })));
      }
      const map = Array.from({ length: size }, (_, k) => legendOf(trial, staff, k));
      const used = new Set();
      for (let mi = 0; mi < total; mi += 1) laneAt(trial, staff, mi).forEach((ev) => used.add(ev.v - 1));
      const moved = [...used].filter((k) => chosen.has(map[k])).sort((a, b) => a - b);
      const kept = [...used].filter((k) => !chosen.has(map[k])).sort((a, b) => a - b);
      if (!moved.length || !kept.length) return false;
      openStaff(trial, staff + 1);
      for (let mi = 0; mi < total; mi += 1) {
        const measure = laneAt(trial, staff, mi);
        const stay = [], go = [];
        measure.forEach((ev) => {
          const k = ev.v - 1;
          if (moved.includes(k)) { ev.v = moved.indexOf(k) + 1; go.push(ev); } else { ev.v = kept.indexOf(k) + 1; stay.push(ev); }
        });
        // Un silencio compartido pertenece a una sola voz: el otro pentagrama tambien lo necesita donde no suena nada.
        const covers = (list, ev) => list.some((o) => o.at < ev.at + length(ev) && ev.at < o.at + length(o));
        const shared = (from, into) => from.filter((ev) => ev.rest && !covers(into, ev)).map((ev) => ({ ...ev, v: 1 }));
        const stayRests = shared(go, stay), goRests = shared(stay, go);
        stay.push(...stayRests);
        go.push(...goRests);
        measure.splice(0, measure.length, ...stay);
        if (go.length) (trial[laneKey(staff + 1)] ||= {})[mi] = go;
      }
      shiftLyrics(trial, staff + 1, 1);
      withMaps(trial, (maps) => { maps[staff] = kept.map((k) => map[k]); maps[staff + 1] = moved.map((k) => map[k]); });
      return setStaffCount(trial, count + 1);
    });
  }

  const partsValid = (parts) => Number.isInteger(parts) && parts >= MIN_PARTS && parts <= MAX_PARTS;
  const partsOf = (score) => (score && partsValid(score.parts) ? score.parts : DEFAULT_PARTS);

  // Registro del pentagrama `staff` del coro: el guardado, o el que le toca por orden (S, A, T, B).
  function registerOf(score, staff) {
    const saved = score && Array.isArray(score.registers) ? score.registers[staff] : undefined;
    return validRegister(saved) ? saved : DEFAULT_REGISTERS[staff] || 'bass';
  }

  // Clave que corresponde al registro del pentagrama; sin registro, la del que le tocaba por orden.
  function registerClef(score, staff) {
    const register = registerOf(score, staff);
    return REGISTERS[register === NO_REGISTER ? DEFAULT_REGISTERS[staff] || 'bass' : register];
  }

  // Timbre del coro (por partitura): Ah por defecto, que no se guarda.
  const CHOIR_SOUNDS = ['chorale', 'ah', 'oh', 'mm', ...ARCHIVE_CHOIRS.map(({ id }) => id), 'guitar', 'piano'];
  const soundOf = (score) => (score && CHOIR_SOUNDS.includes(score.sound) ? score.sound : CHOIR_SOUNDS[0]);
  function setSound(score, sound) {
    if (!CHOIR_SOUNDS.includes(sound)) return false;
    if (sound === CHOIR_SOUNDS[0]) delete score.sound; else score.sound = sound;
    return true;
  }

  // Cambiar la cantidad de voces solo cambia lo que se ve: las figuras de los pentagramas ocultos se conservan.
  function setParts(score, parts) {
    if (!partsValid(parts)) return false;
    score.parts = parts;
    return true;
  }

  // El registro fija la clave inicial del pentagrama (los cambios de clave posteriores no se tocan).
  function setRegister(score, staff, register) {
    if (!Number.isInteger(staff) || staff < 0 || staff >= MAX_PARTS || !validRegister(register)) return false;
    score.registers = Array.from({ length: MAX_PARTS }, (_, k) => (k === staff ? register : registerOf(score, k)));
    if (register === NO_REGISTER) return true;
    return setClef(score, 0, REGISTERS[register], staff);
  }

  // Los compases guardados de todos los pentagramas, tambien los del segundo si hoy no se ve.
  function everyMeasure(score) {
    return measures(score).concat(LANE_KEYS.flatMap((key) => Object.values(score[key] || {})));
  }

  // `measures(score, 1)` crea compases vacios para poder editarlos; estos no se guardan.
  function pruneLower(score) {
    LANE_KEYS.forEach((name) => {
      if (!score[name]) return;
      Object.keys(score[name]).forEach((key) => { if (!score[name][key].length) delete score[name][key]; });
      if (!Object.keys(score[name]).length) delete score[name];
    });
  }

  const staffOf = (ref) => (ref && ref.s) || 0;

  // Indice plano del primer compas de cada renglon; dividir compases puede superar PER_ROW.
  function rowStarts(score) {
    let start = 0;
    return score.rows.map((row) => { const first = start; start += row.length; return first; });
  }

  // Renglon que contiene el compas `mi`: { row, first, last } con indices planos.
  function rowOf(score, mi) {
    const starts = rowStarts(score);
    let row = starts.length - 1;
    while (row > 0 && starts[row] > mi) row -= 1;
    return { row, first: starts[row], last: starts[row] + score.rows[row].length - 1 };
  }

  // Mueve las claves numericas (compases) de un mapa: las >= `from` se corren `by`; las que caen en [from, from - by) al achicar se pierden.
  function shiftKeys(map, from, by) {
    if (!map) return undefined;
    const moved = {};
    Object.keys(map).forEach((key) => {
      const mi = +key;
      if (mi < from) moved[key] = map[key];
      else if (mi + by >= from) moved[mi + by] = map[key];
    });
    return moved;
  }

  // Agrega un compas vacio al final del renglon `row`. Si el renglon esta lleno, queda al inicio del siguiente
  // (o en un renglon nuevo) y empuja el resto.
  function addMeasure(score, row) {
    if (!Number.isInteger(row) || row < 0 || row >= score.rows.length) return false;
    if (score.rows[row].length >= PER_ROW) return insertMeasure(score, rowStarts(score)[row] + score.rows[row].length);
    const at = rowStarts(score)[row] + score.rows[row].length;
    BY_MEASURE.forEach((name) => { if (score[name]) score[name] = shiftKeys(score[name], at, 1); });
    score.rows[row].push([]);
    return true;
  }

  // Inserta un compas vacio en la posicion plana `at` (0..total): el que estaba ahi y todos los siguientes se corren.
  // Queda en el renglon de `at` (o en el ultimo si `at` es el final). Si el renglon pasa de PER_ROW, su ultimo compas
  // baja al renglon siguiente, y asi hasta que todo entra; un renglon que ya pasaba de PER_ROW no se vuelve a partir.
  function insertMeasure(score, at) {
    const total = measures(score).length;
    if (!Number.isInteger(at) || at < 0 || at > total) return false;
    const target = at === total ? score.rows.length - 1 : rowOf(score, at).row;
    const limits = score.rows.map((row) => Math.max(PER_ROW, row.length));
    // Una cejilla que cruza el punto de insercion termina antes del compas nuevo.
    Object.entries(score.barres || {}).forEach(([key, barre]) => {
      const m = +key;
      if (m < at && barreLast(barre, m) >= at) {
        barre.span = at - 1 - m;
        delete barre.to;
        if (!barre.span) delete barre.span;
      }
    });
    hairpinList(score).forEach(({ mi: m, h }) => {
      if (m < at && hairpinLast(h, m) >= at) {
        h.span = at - 1 - m;
        delete h.to;
        if (!h.span) delete h.span;
      }
    });
    BY_MEASURE.forEach((name) => {
      if (score[name]) score[name] = shiftKeys(score[name], at, 1);
    });
    if (score.tabs) score.tabs = Object.fromEntries(Object.entries(score.tabs).map(([key, value]) => {
      const [mi, time] = key.split(':');
      return [(+mi >= at ? +mi + 1 : +mi) + ':' + time, value];
    }));
    score.rows[target].splice(at - rowStarts(score)[target], 0, []);
    for (let row = target; row < score.rows.length && score.rows[row].length > limits[row]; row += 1) {
      if (row === score.rows.length - 1) score.rows.push([]);
      score.rows[row + 1].unshift(score.rows[row].pop());
    }
    pruneKeys(score);
    return true;
  }

  // Quita el ultimo compas del renglon `row` (con sus figuras); si era el unico del renglon, este desaparece (salvo que sea el ultimo compas de la partitura).
  function removeMeasure(score, row) {
    if (!Number.isInteger(row) || row < 0 || row >= score.rows.length || !score.rows[row].length) return false;
    return removeMeasureAt(score, rowStarts(score)[row] + score.rows[row].length - 1);
  }

  // Quita el compas plano `at` con sus figuras; los siguientes se corren. Un renglon que queda vacio desaparece.
  function removeMeasureAt(score, at) {
    if (!Number.isInteger(at) || at < 0 || at >= measures(score).length || measures(score).length <= 1) return false;
    const { row } = rowOf(score, at);
    if (score.barres) Object.keys(score.barres).forEach((key) => {
      const barre = score.barres[key];
      if (+key === at) delete score.barres[key];
      else if (+key < at && barreLast(barre, +key) >= at) {
        barre.span -= 1;
        delete barre.to;
        if (!barre.span) delete barre.span;
      }
    });
    hairpinList(score).forEach(({ mi: m, h }) => {
      if (m === at) removeHairpin(score, m, h);
      else if (m < at && hairpinLast(h, m) >= at) {
        h.span -= 1;
        if (hairpinLast(h, m) === at - 1) delete h.to;
        if (!h.span) delete h.span;
      }
    });
    BY_MEASURE.forEach((name) => {
      if (!score[name]) return;
      delete score[name][at];
      score[name] = shiftKeys(score[name], at, -1);
      if (!Object.keys(score[name]).length) delete score[name];
    });
    if (score.tabs) score.tabs = Object.fromEntries(Object.entries(score.tabs)
      .filter(([key]) => +key.split(':')[0] !== at)
      .map(([key, value]) => {
        const [mi, time] = key.split(':');
        return [(+mi > at ? +mi - 1 : +mi) + ':' + time, value];
      }));
    score.rows[row].splice(at - rowStarts(score)[row], 1);
    if (!score.rows[row].length) score.rows.splice(row, 1);
    pruneKeys(score);
    return true;
  }

  // `before` is an insertion boundary in the original order. Interior drops keep
  // row sizes; an append that fits transfers one slot from the source row.
  function moveMeasure(score, from, before, appendRow) {
    const all = measures(score);
    if (!Number.isInteger(from) || from < 0 || from >= all.length ||
        !Number.isInteger(before) || before < 0 || before > all.length) return false;
    const source = rowOf(score, from).row;
    const append = Number.isInteger(appendRow) && appendRow >= 0 && appendRow < score.rows.length;
    const counts = score.rows.map((row) => row.length);
    if (append && before !== rowStarts(score)[appendRow] + counts[appendRow]) return false;
    const target = before - (from < before ? 1 : 0);
    if (target === from && (!append || source === appendRow)) return false;
    if (append && source !== appendRow) {
      // A row always has at least one measure, including otherwise empty rows.
      if (counts[source] === 1) return false;
      counts[source] -= 1;
      counts[appendRow] += 1;
    }
    const signatures = all.map((_, mi) => ({ meter: meterAt(score, mi), fifths: keyAt(score, mi), clef: clefAt(score, mi), lowerClef: clefAt(score, mi, 1), clef2: clefAt(score, mi, 2), clef3: clefAt(score, mi, 3) }));
    const order = all.map((_, mi) => mi);
    order.splice(target, 0, order.splice(from, 1)[0]);
    const positions = new Map(order.map((old, mi) => [old, mi]));
    // Una ligadura entre compases del segundo pentagrama tampoco sobrevive si dejan de ser vecinos.
    LANE_KEYS.forEach((name) => Object.entries(score[name] || {}).forEach(([mi, measure]) => {
      if (positions.get(+mi + 1) !== positions.get(+mi) + 1) edge(measure, 'last').forEach((i) => { delete measure[i].tie; delete measure[i].slur; });
    }));
    ['navigation', 'barlines', 'barres', 'hairpins', 'dynamics', 'chords', 'lyrics', 'measureDurations', 'measureWidths', ...LANE_KEYS].forEach((name) => {
      if (!score[name]) return;
      const moved = {};
      // Una cejilla o un regulador que cruza compases solo sigue unido si esos compases se mueven juntos.
      const intact = (value, old, mi) => Array.from({ length: (value.span || 0) + 1 }, (_, i) => positions.get(+old + i) === mi + i).every(Boolean);
      const detach = (value) => { value = { ...value }; delete value.span; delete value.to; return value; };
      Object.entries(score[name]).forEach(([old, value]) => {
        const mi = positions.get(+old);
        if (name === 'barres' && value.span && !intact(value, old, mi)) value = detach(value);
        if (name === 'hairpins') value = value.map((h) => (h.span && !intact(h, old, mi) ? detach(h) : h));
        moved[mi] = value;
      });
      score[name] = moved;
    });
    if (score.tabs) score.tabs = Object.fromEntries(Object.entries(score.tabs).map(([key, value]) => {
      const [mi, at] = key.split(':');
      return [positions.get(+mi) + ':' + at, value];
    }));
    all.forEach((measure, mi) => {
      if (positions.get(mi + 1) !== positions.get(mi) + 1) edge(measure, 'last').forEach((i) => { delete measure[i].tie; delete measure[i].slur; });
    });
    let offset = 0;
    score.rows = counts.map((count) => { const row = order.slice(offset, offset + count).map((mi) => all[mi]); offset += count; return row; });
    [['meter', 'meters'], ['fifths', 'keys'], ['clef', 'clefs'], ['lowerClef', 'lowerClefs'], ['clef2', 'clefs2'], ['clef3', 'clefs3']].forEach(([base, map]) => {
      // Un pentagrama de abajo sin claves propias sigue en su clave por defecto.
      if (/^(lowerClef|clef[23])$/.test(base) && !score[base] && !score[map]) return;
      score[base] = signatures[order[0]][base];
      const changes = {};
      order.forEach((old, mi) => { if (mi && signatures[old][base] !== signatures[order[mi - 1]][base]) changes[mi] = signatures[old][base]; });
      if (Object.keys(changes).length) score[map] = changes;
      else delete score[map];
    });
    return true;
  }

  // Las barras se guardan aparte: JSON no conserva propiedades de los arrays de figuras.
  function setBarline(score, mi, type, at) {
    if (!Number.isInteger(mi) || mi < 0 || mi >= measures(score).length || !['double', 'start', 'end'].includes(type)) return false;
    if (type === 'double' && Number.isFinite(at)) {
      at = Math.round(at / GRID) * GRID;
      if (at > 0 && at < capacity(score, mi)) return splitMeasure(score, mi, at);
    }
    if (!score.barlines) score.barlines = {};
    if (type === 'double') score.barlines[mi] = { double: true };
    else {
      const bar = score.barlines[mi] || {};
      delete bar.double;
      if (type === 'end') delete bar.hidden;
      bar[type] = true;
      score.barlines[mi] = bar;
    }
    return true;
  }

  // Hidden internal bars join stored measures into one visible measure.
  function visibleMeasureRange(score, mi, count) {
    const hidden = (index) => score.barlines?.[index]?.hidden && !score.barlines[index].end &&
      !score.barlines[index].double && !score.barlines?.[index + 1]?.start;
    let first = mi, last = mi;
    while (first > 0 && hidden(first - 1)) first -= 1;
    while (last + 1 < count && hidden(last)) last += 1;
    return { first, last };
  }

  // Navigation marks belong to measures and survive row edits and saved scores.
  const NAVIGATION = ['dc', 'ds', 'segno', 'first', 'second'];
  function setNavigation(score, mi, mark) {
    if (!Number.isInteger(mi) || mi < 0 || mi >= measures(score).length || !NAVIGATION.includes(mark)) return false;
    if (mark === 'first' || mark === 'second') {
      const { first, last } = visibleMeasureRange(score, mi, measures(score).length);
      const active = Array.from({ length: last - first + 1 }, (_, i) => score.navigation?.[first + i]?.[mark]).some(Boolean);
      for (let i = first; i <= last; i += 1) {
        removeNavigation(score, i, 'first');
        removeNavigation(score, i, 'second');
      }
      if (!active) {
        if (!score.navigation) score.navigation = {};
        score.navigation[first] = { ...score.navigation[first], [mark]: true };
      }
      return true;
    }
    const marks = Object.assign({}, score.navigation?.[mi]);
    if (marks[mark]) delete marks[mark];
    else {
      if (mark === 'dc' || mark === 'ds') { delete marks.dc; delete marks.ds; }
      marks[mark] = true;
    }
    if (!score.navigation) score.navigation = {};
    if (Object.keys(marks).length) score.navigation[mi] = marks;
    else delete score.navigation[mi];
    return true;
  }

  function removeNavigation(score, mi, mark) {
    if (!NAVIGATION.includes(mark) || score.navigation?.[mi]?.[mark] !== true) return false;
    delete score.navigation[mi][mark];
    if (!Object.keys(score.navigation[mi]).length) delete score.navigation[mi];
    if (!Object.keys(score.navigation).length) delete score.navigation;
    return true;
  }

  // A bracket covers visible measures; closing bars break consecutive endings.
  function navigationEndings(score) {
    const all = measures(score), endings = [];
    for (let mi = 0; mi < all.length;) {
      const { first, last } = visibleMeasureRange(score, mi, all.length);
      let mark = null;
      for (let i = first; i <= last && !mark; i += 1) {
        const nav = score.navigation?.[i];
        mark = nav?.first ? 'first' : nav?.second ? 'second' : null;
      }
      mi = last + 1;
      if (!mark) continue;
      const bar = score.barlines?.[last];
      const previous = endings.at(-1);
      const closing = score.barlines?.[first - 1];
      const closed = mark === 'first' || !!(bar?.end || bar?.double || (last === all.length - 1 && !bar?.hidden));
      if (previous?.mark === mark && previous.last === first - 1 && !closing?.end && !closing?.double) {
        previous.last = last;
        previous.closed = closed;
      } else endings.push({ first, last, mark, number: mark === 'first' ? '1' : '2', closed });
    }
    return endings;
  }

  // Orden en que suenan los compases: repeticiones (|: :|), casas 1./2. y saltos D.C./D.S. Los saltos no vuelven a tomar repeticiones.
  function playOrder(score, count = measures(score).length) {
    const endings = navigationEndings(score);
    const segno = Array.from({ length: count }, (_, mi) => mi).find((mi) => score.navigation?.[mi]?.segno);
    const order = [], taken = new Set();
    let mi = 0, loopStart = 0, pass = 1, jumped = false;
    for (let steps = 0; mi < count && steps < count * 8 + 16; steps += 1) {
      const bar = score.barlines?.[mi];
      if (bar?.start) loopStart = mi;
      const ending = endings.find((e) => e.first <= mi && mi <= e.last);
      if (ending?.mark === 'first' && pass > 1) { mi = ending.last + 1; loopStart = mi; pass = 1; continue; }
      order.push(mi);
      if (bar?.end && !jumped && !taken.has(mi)) {
        taken.add(mi);
        mi = loopStart;
        pass = 2;
        continue;
      }
      if (bar?.end) { loopStart = mi + 1; pass = 1; }
      const nav = score.navigation?.[mi];
      if (!jumped && (nav?.dc || (nav?.ds && segno !== undefined))) {
        jumped = true;
        pass = 2;
        mi = nav.dc ? 0 : segno;
        continue;
      }
      mi += 1;
    }
    return order;
  }

  // Compases tocados en orden, con su tiempo de inicio y fin en divisiones; termina en el ultimo compas escrito.
  function playSlots(score) {
    let last = -1;
    for (let staff = 0; staff < stavesOf(score); staff += 1) measures(score, staff).forEach((measure, mi) => { if (measure.length) last = Math.max(last, mi); });
    let start = 0;
    return playOrder(score, last + 1).map((mi) => {
      const slot = { mi, start, end: start + capacity(score, mi) };
      start = slot.end;
      return slot;
    });
  }

  // Una barra interior crea dos compases incompletos sin cambiar la indicacion de compas.
  function splitMeasure(score, mi, at) {
    const all = measures(score);
    const end = capacity(score, mi);
    // Corta las figuras de un compas en `at`; null si alguna no se puede partir. Sirve a ambos pentagramas.
    const cut = (events) => {
      const left = [], right = [];
      const starts = onsets(events);
      const carried = new Map(), accidentals = [];
      events.map((ev, i) => i).sort((a, b) => starts[a] - starts[b]).forEach((i) => {
        const ev = events[i];
        if (!ev.rest && ev.acc) carried.set(ev.n, ev.acc);
        accidentals[i] = !ev.rest ? carried.get(ev.n) : undefined;
      });
      const fragment = (ev, from, size, continues, into) => {
        let cursor = from;
        // Tambien permite cortar una figura con puntillo; las partes de una nota quedan ligadas.
        const values = Object.keys(VALUES).flatMap((d) => [
          { d }, ...(!['w', 's', 'f'].includes(d) ? [{ d, dot: true }] : []),
        ]).sort((a, b) => length(b) - length(a));
        while (size > 0) {
          const value = values.find((v) => length(v) <= size);
          if (!value) return false;
          const part = Object.assign(clone(ev), value, { at: cursor });
          delete part.tp;
          delete part.tn;
          delete part.dot;
          if (value.dot) part.dot = true;
          size -= length(value);
          if (!ev.rest && (size > 0 || continues)) { part.tie = true; delete part.slur; }
          into.push(part);
          cursor += length(value);
        }
        return true;
      };
      for (let i = 0; i < events.length; i += 1) {
        const ev = events[i], start = starts[i], stop = start + length(ev);
        const continuation = Object.assign(clone(ev), accidentals[i] ? { acc: accidentals[i] } : {});
        if (start >= at) right.push(Object.assign(continuation, { at: start - at }));
        else if (stop <= at) left.push(Object.assign(clone(ev), { at: start }));
        else if (!fragment(ev, start, at - start, true, left) || !fragment(continuation, 0, stop - at, false, right)) return null;
      }
      return { left, right };
    };
    const upper = cut(all[mi]);
    const lowerCuts = LANE_KEYS.map((name) => (score[name] && score[name][mi] ? cut(score[name][mi]) : undefined));
    if (!upper || LANE_KEYS.some((name, k) => score[name] && score[name][mi] && !lowerCuts[k])) return false;
    const { left, right } = upper;
    const oldBar = score.barlines && score.barlines[mi];
    const oldWidth = score.measureWidths && score.measureWidths[mi];
    const tabs = {};
    Object.entries(score.tabs || {}).forEach(([key, column]) => {
      let [m, t] = key.split(':').map(Number);
      if (m === mi && t >= at) { m += 1; t -= at; }
      else if (m > mi) m += 1;
      tabs[m + ':' + t] = column;
    });
    // Las cejillas conservan ambos extremos al insertar el nuevo compas.
    let movedBarre;
    Object.entries(score.barres || {}).forEach(([key, barre]) => {
      const m = +key, last = barreLast(barre, m);
      if (m <= mi && last >= mi) {
        if (m === mi && barre.at >= at) {
          delete score.barres[key];
          movedBarre = Object.assign({}, barre, { at: barre.at - at });
          if (Number.isInteger(movedBarre.to) && last === mi) movedBarre.to -= at;
        } else if (last > mi || (last === mi && (barre.to || end) > at)) {
          barre.span = (barre.span || 0) + 1;
          if (last === mi && Number.isInteger(barre.to)) barre.to -= at;
        }
      }
    });
    // Lo mismo para los reguladores: los que empiezan despues del corte pasan al compas nuevo.
    const movedHairpins = [];
    hairpinList(score).forEach(({ mi: m, h }) => {
      const last = hairpinLast(h, m);
      if (m > mi || last < mi) return;
      if (m === mi && h.at >= at) {
        removeHairpin(score, m, h);
        if (Number.isInteger(h.to) && last === mi) h.to -= at;
        h.at -= at;
        movedHairpins.push(h);
      } else if (last > mi || (last === mi && (h.to || end) > at)) {
        h.span = (h.span || 0) + 1;
        if (last === mi && Number.isInteger(h.to)) h.to -= at;
      }
    });
    // Los acordes escritos despues del corte pasan al compas nuevo.
    const movedChords = (score.chords?.[mi] || []).filter((chord) => chord.at >= at).map((chord) => Object.assign({}, chord, { at: chord.at - at }));
    if (score.chords?.[mi]) score.chords[mi] = score.chords[mi].filter((chord) => chord.at < at);
    const movedDynamics = (score.dynamics?.[mi] || []).filter((mark) => mark.at >= at).map((mark) => ({ ...mark, at: mark.at - at }));
    if (score.dynamics?.[mi]) score.dynamics[mi] = score.dynamics[mi].filter((mark) => mark.at < at);
    const movedLyrics = (score.lyrics?.[mi] || []).filter((lyric) => lyric.at >= at).map((lyric) => Object.assign({}, lyric, { at: lyric.at - at }));
    if (score.lyrics?.[mi]) score.lyrics[mi] = score.lyrics[mi].filter((lyric) => lyric.at < at);
    BY_MEASURE.forEach((name) => {
      if (score[name]) score[name] = shiftKeys(score[name], mi + 1, 1);
    });
    if (movedDynamics.length) {
      score.dynamics ||= {};
      score.dynamics[mi + 1] = movedDynamics;
    }
    if (score.dynamics?.[mi] && !score.dynamics[mi].length) delete score.dynamics[mi];
    if (score.dynamics && !Object.keys(score.dynamics).length) delete score.dynamics;
    if (movedLyrics.length) {
      if (!score.lyrics) score.lyrics = {};
      score.lyrics[mi + 1] = movedLyrics;
    }
    if (score.lyrics?.[mi] && !score.lyrics[mi].length) delete score.lyrics[mi];
    if (score.lyrics && !Object.keys(score.lyrics).length) delete score.lyrics;
    if (movedChords.length) {
      if (!score.chords) score.chords = {};
      score.chords[mi + 1] = movedChords;
    }
    if (score.chords?.[mi] && !score.chords[mi].length) delete score.chords[mi];
    if (score.chords && !Object.keys(score.chords).length) delete score.chords;
    LANE_KEYS.forEach((name, k) => {
      if (!lowerCuts[k]) return;
      score[name][mi] = lowerCuts[k].left;
      score[name][mi + 1] = lowerCuts[k].right;
    });
    if (movedHairpins.length) {
      if (!score.hairpins) score.hairpins = {};
      score.hairpins[mi + 1] = movedHairpins;
    }
    const nav = score.navigation?.[mi];
    if (nav) {
      const rightNav = Object.assign({}, nav);
      delete rightNav.segno;
      delete nav.dc;
      delete nav.ds;
      if (Object.keys(rightNav).length) score.navigation[mi + 1] = rightNav;
      if (!Object.keys(nav).length) delete score.navigation[mi];
    }
    if (movedBarre) score.barres[mi + 1] = movedBarre;
    if (oldWidth) {
      score.measureWidths[mi] = oldWidth * at / end;
      score.measureWidths[mi + 1] = oldWidth * (end - at) / end;
    }
    score.measureDurations = Object.assign(score.measureDurations || {}, { [mi]: at, [mi + 1]: end - at });
    score.barlines = score.barlines || {};
    score.barlines[mi] = Object.assign({ double: true }, oldBar && oldBar.start ? { start: true, end: false } : {});
    if (oldBar) {
      const closing = Object.assign({}, oldBar);
      delete closing.start;
      if (Object.keys(closing).length) score.barlines[mi + 1] = closing;
    }
    if (score.tabs) score.tabs = tabs;
    const row = rowOf(score, mi);
    score.rows[row.row].splice(mi - row.first, 1, left, right);
    return true;
  }

  // Compases de la misma fila cubiertos por la cejilla que empieza en `mi`, y compas donde termina.
  function barreLast(barre, mi) {
    return mi + (barre.span || 0);
  }

  // Cejilla: va de `at` a `to` (por defecto el final del compas, que no se guarda). Una por compas.
  // Con `span` > 0 sigue por `span` compases mas de la misma fila y `to` es el final en el ultimo.
  function setBarre(score, mi, at, fret, to, span) {
    const end = capacity(score, mi);
    span = span || 0;
    const stop = capacity(score, mi + span);
    if (to === undefined) to = stop;
    if (!Number.isInteger(mi) || mi < 0 || mi >= measures(score).length || !Number.isInteger(at) || at < 0 || at >= end) return false;
    if (!Number.isInteger(span) || span < 0 || mi + span > rowOf(score, mi).last) return false;
    if (!Number.isInteger(to) || to > stop || (span === 0 ? to <= at : to <= 0)) return false;
    if (!Number.isInteger(fret) || fret < 1 || fret > MAX_FRET) return false;
    const taken = Object.keys(score.barres || {}).some((key) => {
      const other = +key;
      return other !== mi && other <= mi + span && barreLast(score.barres[key], other) >= mi;
    });
    if (taken) return false;
    if (!score.barres) score.barres = {};
    const barre = { at, fret };
    if (span) barre.span = span;
    if (to < stop) barre.to = to;
    score.barres[mi] = barre;
    return true;
  }

  function removeBarre(score, mi) {
    if (!score.barres || !score.barres[mi]) return false;
    delete score.barres[mi];
    if (!Object.keys(score.barres).length) delete score.barres;
    return true;
  }

  // Acordes: nombres escritos sobre el pentagrama (`score.chords[mi]`, ordenados por `at`). Uno por tiempo de cada compas.
  // `variant` es la digitacion elegida entre las del diccionario; 0 (la primera) no se guarda.
  function chordAt(score, mi, at) {
    return ((score.chords && score.chords[mi]) || []).find((chord) => chord.at === at);
  }

  function setChord(score, mi, at, name, variant) {
    name = typeof name === 'string' ? name.trim() : '';
    if (!Number.isInteger(mi) || mi < 0 || mi >= measures(score).length || !Number.isInteger(at) || at < 0 || at >= capacity(score, mi)) return false;
    if (!name || name.length > MAX_CHORD_NAME) return false;
    const list = ((score.chords && score.chords[mi]) || []).filter((chord) => chord.at !== at);
    const old = chordAt(score, mi, at);
    // Renombrar un acorde conserva la variante solo si no se pide otra: cada nombre tiene sus propias digitaciones.
    const keep = variant === undefined ? (old && old.name === name ? old.variant : 0) : variant;
    list.push(Object.assign({ at, name }, Number.isInteger(keep) && keep > 0 && keep < MAX_CHORD_VARIANTS ? { variant: keep } : {}));
    if (!score.chords) score.chords = {};
    score.chords[mi] = list.sort((a, b) => a.at - b.at);
    return true;
  }

  function removeChord(score, mi, at) {
    const list = score.chords && score.chords[mi];
    if (!list || !list.some((chord) => chord.at === at)) return false;
    score.chords[mi] = list.filter((chord) => chord.at !== at);
    if (!score.chords[mi].length) delete score.chords[mi];
    if (!Object.keys(score.chords).length) delete score.chords;
    return true;
  }

  // Lleva un acorde a otro tiempo (o compas) con su variante; falla si el destino ya tiene uno.
  function moveChord(score, mi, at, toMi, toAt) {
    const chord = chordAt(score, mi, at);
    if (!chord || (mi === toMi && at === toAt) || chordAt(score, toMi, toAt)) return false;
    const copy = JSON.parse(JSON.stringify(score));
    removeChord(copy, mi, at);
    if (!setChord(copy, toMi, toAt, chord.name, chord.variant || 0)) return false;
    if (copy.chords) score.chords = copy.chords; else delete score.chords;
    return true;
  }

  // Letras: una silaba escrita bajo una nota (`score.lyrics[mi]`, lista ordenada por pentagrama y `at`). Una por nota y pentagrama.
  // `s` es el pentagrama (0 no se guarda). Un guion escrito es parte del texto ("en-a" en una nota); entre notas no se dibujan guiones.
  // Cada instrumento escribe letra en el pentagrama de arriba; Voces, en cada uno de los que muestra.
  function lyricStaves(score) {
    return instrumentOf(score) === 'voices' ? stavesOf(score) : 1;
  }

  const lyricOrder = (a, b) => (a.s || 0) - (b.s || 0) || a.at - b.at;

  function lyricAt(score, mi, at, staff = 0) {
    return ((score.lyrics && score.lyrics[mi]) || []).find((lyric) => lyric.at === at && (lyric.s || 0) === staff);
  }

  function parseLyric(text) {
    // Un guion o un espacio dentro de la silaba son lo mismo: dos sonidos en una nota, unidos por una ligadura al dibujarla.
    text = typeof text === 'string' ? text.replace(/-/g, ' ').replace(/\s+/g, ' ').trim() : '';
    return text && text.length <= MAX_LYRIC ? { text } : null;
  }

  // Tiempos ("mi:at") de un pentagrama que continuan una ligadura de prolongacion: el sonido se sostiene, no se vuelve a atacar,
  // asi que no llevan silaba. Una columna cuenta si todas sus notas son el final de una ligadura.
  function tiedLyricSpots(score, staff) {
    const targets = new Set();
    links(score).forEach((link) => { if (link.type === 'tie' && staffOf(link.to) === staff) targets.add(link.to.mi + ':' + link.to.i); });
    const blocked = new Set();
    if (!targets.size) return blocked;
    measures(score, staff).forEach((measure, mi) => {
      const starts = onsets(measure);
      const columns = new Map();
      measure.forEach((ev, i) => {
        if (ev.rest) return;
        const column = columns.get(starts[i]) || { tied: true };
        column.tied = column.tied && targets.has(mi + ':' + i);
        columns.set(starts[i], column);
      });
      columns.forEach((column, at) => { if (column.tied) blocked.add(mi + ':' + at); });
    });
    return blocked;
  }

  function setLyric(score, mi, at, text, staff = 0) {
    const parsed = parseLyric(text);
    if (!parsed || !Number.isInteger(mi) || mi < 0 || mi >= measures(score).length || staff < 0 || staff >= lyricStaves(score)) return false;
    if (tiedLyricSpots(score, staff).has(mi + ':' + at)) return false;
    const measure = staff ? (score[laneKey(staff)] && score[laneKey(staff)][mi]) || [] : measures(score)[mi];
    const starts = onsets(measure);
    if (!measure.some((ev, i) => starts[i] === at && !ev.rest)) return false;
    const list = ((score.lyrics && score.lyrics[mi]) || []).filter((lyric) => lyric.at !== at || (lyric.s || 0) !== staff);
    list.push(Object.assign({ at, text: parsed.text }, staff ? { s: staff } : {}));
    if (!score.lyrics) score.lyrics = {};
    score.lyrics[mi] = list.sort(lyricOrder);
    return true;
  }

  function removeLyric(score, mi, at, staff = 0) {
    if (!lyricAt(score, mi, at, staff)) return false;
    score.lyrics[mi] = score.lyrics[mi].filter((lyric) => lyric.at !== at || (lyric.s || 0) !== staff);
    if (!score.lyrics[mi].length) delete score.lyrics[mi];
    if (!Object.keys(score.lyrics).length) delete score.lyrics;
    return true;
  }

  // Las notas (en orden de lectura) de un pentagrama que pueden llevar letra: [{ mi, at }].
  function lyricSpots(score, staff = 0) {
    const all = measures(score);
    const spots = [];
    const tied = tiedLyricSpots(score, staff);
    all.forEach((measure, k) => {
      const lane = staff ? (score[laneKey(staff)] && score[laneKey(staff)][k]) || [] : measure;
      const starts = onsets(lane);
      [...new Set(lane.map((ev, i) => (ev.rest ? null : starts[i])).filter((start) => start !== null))].sort((a, b) => a - b).forEach((start) => { if (!tied.has(k + ':' + start)) spots.push({ mi: k, at: start }); });
    });
    return spots;
  }

  // Reubica silabas de un pentagrama: [{ mi, at, to: { mi, at } | null, text }] (null la quita). Lo demas queda donde estaba.
  function relocateLyrics(score, staff, moves) {
    const lyrics = score.lyrics || {};
    moves.forEach(({ mi, at }) => {
      lyrics[mi] = (lyrics[mi] || []).filter((lyric) => lyric.at !== at || (lyric.s || 0) !== staff);
    });
    moves.forEach(({ to, text }) => {
      if (!to) return;
      (lyrics[to.mi] = lyrics[to.mi] || []).push(Object.assign({ at: to.at, text }, staff ? { s: staff } : {}));
    });
    Object.keys(lyrics).forEach((mi) => { if (lyrics[mi].length) lyrics[mi].sort(lyricOrder); else delete lyrics[mi]; });
    if (Object.keys(lyrics).length) score.lyrics = lyrics; else delete score.lyrics;
  }

  // Lleva una silaba a otra nota del mismo pentagrama; falla si el destino no puede llevar letra (silencio, nota ligada) o ya tiene una.
  function moveLyric(score, mi, at, toMi, toAt, staff = 0) {
    const lyric = lyricAt(score, mi, at, staff);
    if (!lyric || (mi === toMi && at === toAt) || staff >= lyricStaves(score)) return false;
    if (!lyricSpots(score, staff).some((spot) => spot.mi === toMi && spot.at === toAt) || lyricAt(score, toMi, toAt, staff)) return false;
    relocateLyrics(score, staff, [{ mi, at, to: { mi: toMi, at: toAt }, text: lyric.text }]);
    return true;
  }

  // Las silabas (2 o mas) de las notas elegidas, de un solo pentagrama, en orden de lectura; null si no hay para unir.
  function lyricMergeRun(score, sel) {
    if (!score.lyrics || !sel.length) return null;
    const staff = staffOf(sel[0]);
    if (staff >= lyricStaves(score) || sel.some((ref) => staffOf(ref) !== staff)) return null;
    const lane = measures(score, staff);
    const picked = new Set(sel.map((ref) => lane[ref.mi] && ref.mi + ':' + onsets(lane[ref.mi])[ref.i]));
    const spots = lyricSpots(score, staff);
    const entries = [];
    spots.forEach((spot, idx) => {
      const lyric = lyricAt(score, spot.mi, spot.at, staff);
      if (lyric) entries.push({ idx, mi: spot.mi, at: spot.at, text: lyric.text });
    });
    const chosen = entries.filter((entry) => picked.has(entry.mi + ':' + entry.at));
    return chosen.length >= 2 ? { staff, spots, entries, chosen } : null;
  }

  // Une las silabas elegidas en la primera ("Can" + "to" = "Can to") y corre las siguientes a la izquierda para ocupar los lugares
  // que quedaron libres. Falla si el texto resultante es demasiado largo.
  function mergeLyrics(score, sel) {
    const run = lyricMergeRun(score, sel);
    if (!run) return false;
    const [first, ...rest] = run.chosen;
    const text = run.chosen.map((entry) => entry.text).join(' ');
    if (text.length > MAX_LYRIC) return false;
    const removed = new Set(rest.map((entry) => entry.idx));
    const moves = run.entries.map((entry) => {
      if (entry === first) return { mi: entry.mi, at: entry.at, to: { mi: entry.mi, at: entry.at }, text };
      if (removed.has(entry.idx)) return { mi: entry.mi, at: entry.at, to: null };
      const shift = rest.filter((other) => other.idx < entry.idx).length;
      return { mi: entry.mi, at: entry.at, to: run.spots[entry.idx - shift], text: entry.text };
    });
    relocateLyrics(score, run.staff, moves);
    return true;
  }

  // La nota siguiente de un pentagrama que puede llevar letra: { mi, at } o null. `back` va hacia atras.
  function nextLyricSpot(score, mi, at, staff = 0, back = false) {
    const spots = lyricSpots(score, staff);
    const here = spots.findIndex((spot) => spot.mi === mi && spot.at === at);
    return spots[here + (back ? -1 : 1)] || null;
  }

  // Reparte una letra ya dividida en silabas ([{ text }]) desde la nota { mi, at }, una por nota, atravesando compases.
  // Sobrescribe las silabas que pisa. Devuelve cuantas puso y cuantas quedaron sin nota, o null si el origen no es una nota.
  function distributeLyrics(score, mi, at, staff, syllables) {
    const spots = lyricSpots(score, staff);
    const first = spots.findIndex((spot) => spot.mi === mi && spot.at === at);
    if (first < 0 || staff >= lyricStaves(score)) return null;
    let placed = 0;
    for (const syllable of syllables) {
      const spot = spots[first + placed];
      if (!spot) break;
      if (!setLyric(score, spot.mi, spot.at, syllable.text, staff)) break;
      placed += 1;
    }
    return { placed, left: syllables.length - placed };
  }

  // Silabas de un pentagrama por compas y tiempo, para MusicXML. Siempre `single`: Verovio solo dibuja guiones entre silabas encadenadas.
  function lyricMap(score, staff) {
    const map = new Map();
    const tied = tiedLyricSpots(score, staff);
    Object.keys(score.lyrics || {}).map(Number).forEach((mi) => {
      score.lyrics[mi].filter((lyric) => (lyric.s || 0) === staff && !tied.has(mi + ':' + lyric.at)).forEach((lyric) => {
        map.set(mi + ':' + lyric.at, { text: lyric.text.replace(/ /g, '\u203f'), syllabic: 'single' });
      });
    });
    return map;
  }

  // Reguladores: crescendo ('cresc') y diminuendo ('dim'). Como la cejilla, van de `at` a `to` (por defecto el final del compas)
  // y con `span` > 0 siguen por compases de la misma fila. Un compas admite varios mientras no se pisen: `score.hairpins[mi]` es la
  // lista, ordenada por `at`, de los que empiezan en `mi`. `startDyn` y `endDyn` son las dinamicas escritas en cada extremo.
  const HAIRPINS = ['cresc', 'dim'];
  const DYNAMICS = ['ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff'];

  function hairpinList(score) {
    return Object.keys(score.hairpins || {}).flatMap((key) => score.hairpins[key].map((h) => ({ mi: +key, h })));
  }

  function hairpinLast(h, mi) {
    return mi + (h.span || 0);
  }

  function measureStart(score, mi) {
    let time = 0;
    for (let k = 0; k < mi; k += 1) time += capacity(score, k);
    return time;
  }

  // Tiempo, contado desde el primer compas, donde empieza y donde termina el regulador que arranca en `mi`.
  function hairpinBegin(score, mi, h) {
    return measureStart(score, mi) + h.at;
  }

  function hairpinStop(score, mi, h) {
    const last = hairpinLast(h, mi);
    return measureStart(score, last) + (Number.isInteger(h.to) ? h.to : capacity(score, last));
  }

  // `skip` es el regulador que se esta reemplazando: no cuenta como obstaculo.
  function hairpinFits(score, mi, h, skip) {
    if (!HAIRPINS.includes(h.kind) || !Number.isInteger(mi) || mi < 0 || mi >= measures(score).length) return false;
    const span = h.span || 0;
    if (!Number.isInteger(span) || span < 0 || mi + span > rowOf(score, mi).last) return false;
    if (!Number.isInteger(h.at) || h.at < 0 || h.at >= capacity(score, mi)) return false;
    const stop = capacity(score, mi + span);
    const to = h.to === undefined ? stop : h.to;
    if (!Number.isInteger(to) || to > stop || (span === 0 ? to <= h.at : to <= 0)) return false;
    if ([h.startDyn, h.endDyn].some((dyn) => dyn !== undefined && !DYNAMICS.includes(dyn))) return false;
    const begin = hairpinBegin(score, mi, h), end = measureStart(score, mi + span) + to;
    return !hairpinList(score).some((other) => other.h !== skip && hairpinBegin(score, other.mi, other.h) < end && begin < hairpinStop(score, other.mi, other.h));
  }

  function findHairpin(score, mi, at) {
    return ((score.hairpins && score.hairpins[mi]) || []).find((h) => h.at === at);
  }

  // Agrega `h` o, con `replace`, lo cambia por el regulador que ya estaba. Devuelve el regulador guardado.
  function setHairpin(score, mi, h, replace) {
    if (!hairpinFits(score, mi, h, replace)) return false;
    const span = h.span || 0;
    const saved = { kind: h.kind, at: h.at };
    if (span) saved.span = span;
    if (Number.isInteger(h.to) && h.to < capacity(score, mi + span)) saved.to = h.to;
    if (h.startDyn) saved.startDyn = h.startDyn;
    if (h.endDyn) saved.endDyn = h.endDyn;
    const list = ((score.hairpins && score.hairpins[mi]) || []).filter((other) => other !== replace);
    list.push(saved);
    list.sort((a, b) => a.at - b.at);
    if (!score.hairpins) score.hairpins = {};
    score.hairpins[mi] = list;
    return saved;
  }

  function removeHairpin(score, mi, h) {
    const list = score.hairpins && score.hairpins[mi];
    const index = list ? list.indexOf(h) : -1;
    if (index < 0) return false;
    list.splice(index, 1);
    if (!list.length) delete score.hairpins[mi];
    if (!Object.keys(score.hairpins).length) delete score.hairpins;
    return true;
  }

  // Dinamica de un extremo (`side`: 'start' | 'end'); sin `value` se quita. Donde un regulador termina justo donde empieza
  // otro comparten la dinamica, asi que se escribe en los dos.
  function setHairpinDynamic(score, mi, h, side, value) {
    if (value && !DYNAMICS.includes(value)) return false;
    const write = (target, field) => { if (value) target[field] = value; else delete target[field]; };
    write(h, side === 'start' ? 'startDyn' : 'endDyn');
    const edge = side === 'start' ? hairpinBegin(score, mi, h) : hairpinStop(score, mi, h);
    hairpinList(score).forEach((other) => {
      if (other.h === h) return;
      if (side === 'start' && hairpinStop(score, other.mi, other.h) === edge) write(other.h, 'endDyn');
      else if (side === 'end' && hairpinBegin(score, other.mi, other.h) === edge) write(other.h, 'startDyn');
    });
    return true;
  }

  // Intensidades independientes, una por tiempo y compartidas por todos los pentagramas.
  function setDynamic(score, mi, at, value) {
    if (!Number.isInteger(mi) || mi < 0 || mi >= measures(score).length || !Number.isInteger(at) || at < 0 || at >= capacity(score, mi)) return false;
    if (value != null && !DYNAMICS.includes(value)) return false;
    const list = (score.dynamics?.[mi] || []).filter((mark) => mark.at !== at);
    if (value) list.push({ at, value });
    if (list.length) {
      score.dynamics ||= {};
      score.dynamics[mi] = list.sort((a, b) => a.at - b.at);
    } else if (score.dynamics) {
      delete score.dynamics[mi];
      if (!Object.keys(score.dynamics).length) delete score.dynamics;
    }
    return true;
  }

  function removeBarline(score, mi, side) {
    if (!Number.isInteger(mi) || mi < 0 || mi >= measures(score).length || !['start', 'end'].includes(side)) return false;
    if (!score.barlines) score.barlines = {};
    const bar = score.barlines[mi] || {};
    delete bar[side];
    Object.keys(bar).forEach((key) => { if (!bar[key]) delete bar[key]; });
    if (side === 'end') {
      delete bar.double;
      bar.hidden = true;
    }
    if (Object.values(bar).some(Boolean)) score.barlines[mi] = bar;
    else delete score.barlines[mi];
    return true;
  }

  function meterOf(score) {
    return score && METERS.includes(score.meter) ? score.meter : '4/4';
  }

  // Indicacion de compas vigente desde el ultimo cambio.
  function meterAt(score, mi) {
    let meter = meterOf(score), last = -1;
    Object.entries(score?.meters || {}).forEach(([index, value]) => {
      if (/^(0|[1-9]\d*)$/.test(index) && +index <= mi && +index > last && METERS.includes(value)) { meter = value; last = +index; }
    });
    return meter;
  }

  function pruneMeters(score) {
    let previous = meterOf(score);
    for (const mi of Object.keys(score.meters || {}).map(Number).sort((a, b) => a - b)) {
      if (mi < 1 || mi >= measures(score).length || !METERS.includes(score.meters[mi]) || score.meters[mi] === previous) delete score.meters[mi];
      else previous = score.meters[mi];
    }
    if (score.meters && !Object.keys(score.meters).length) delete score.meters;
  }

  // Clave inicial del pentagrama `staff` (0 arriba, 1 abajo). La del segundo es independiente: `lowerClef`, o fa.
  function clefOf(score, staff = 0) {
    const saved = score && score[CLEF_KEYS[staff][0]];
    if (Object.hasOwn(CLEFS, saved)) return saved;
    if (!staff) return defaultClef;
    if (score && score.instrument === 'voices') return registerClef(score, staff);
    return instrumentOf(score) === 'guitar' ? 'guitar' : LOWER_CLEF;
  }

  const INSTRUMENTS = ['piano', 'guitar', 'voices'];
  const MIN_TEMPO = 20;
  const MAX_TEMPO = 300;
  const tempoValid = (tempo) => Number.isInteger(tempo) && tempo >= MIN_TEMPO && tempo <= MAX_TEMPO;
  // Transposicion (Pro): semitonos que suenan distinto de lo escrito; no cambia la notacion. 0 no se guarda.
  const MAX_TRANSPOSE = 12;
  const transposeValid = (n) => Number.isInteger(n) && n !== 0 && Math.abs(n) <= MAX_TRANSPOSE;
  const transposeOf = (score) => (score && transposeValid(score.transpose) ? score.transpose : 0);

  // Sin instrumento elegido, lo dice la partitura: clave de guitarra, TAB o cejillas son de guitarra.
  function instrumentOf(score) {
    if (score && INSTRUMENTS.includes(score.instrument)) return score.instrument;
    return defaultClef === 'guitar' || clefOf(score) === 'guitar' || (score && (score.showTabs || (score.barres && Object.keys(score.barres).length) || (score.chords && Object.keys(score.chords).length))) ? 'guitar' : 'piano';
  }

  // La guitarra se escribe en clave de sol con 8 y admite TAB; el piano no tiene TAB y deja la clave de guitarra.
  function setInstrument(score, instrument) {
    if (!INSTRUMENTS.includes(instrument) || (instrument === 'voices' && !choir)) return false;
    const before = instrumentOf(score);
    // En piano cada voz de notacion tiene su numero de leyenda (k + 1); en coro y guitarra con varios pentagramas, cada
    // pentagrama es una voz. Al pasar de uno a otro se fija lo que se veia, para que las voces no se vuelvan una sola.
    if (before === 'piano' && instrument !== 'piano') {
      const frozen = [];
      for (let staff = 0; staff < MAX_PARTS; staff += 1) {
        const count = Math.max(0, ...measures(score, staff).map((m) => (m?.length ? voices(m).length : 0)));
        if (count > 1) frozen[staff] = Array.from({ length: Math.min(count, MAX_VOICE) }, (_, k) => legendOf(score, staff, k));
      }
      if (frozen.length) withMaps(score, (maps) => frozen.forEach((map, staff) => { if (map && !maps[staff]) maps[staff] = map; }));
    }
    score.instrument = instrument;
    if (instrument === 'voices') {
      delete score.showTabs;
      for (let staff = 0; staff < MAX_PARTS; staff += 1) setClef(score, 0, registerClef(score, staff), staff);
    } else if (instrument === 'guitar') {
      for (let staff = 0; staff < MAX_PARTS; staff += 1) setClef(score, 0, 'guitar', staff);
    } else {
      if (before !== 'piano') setClef(score, 0, 'treble'), setClef(score, 0, LOWER_CLEF, 1);
      delete score.showTabs;
      if (clefOf(score) === 'guitar') setClef(score, 0, 'treble');
    }
    return true;
  }

  // Verovio dibuja la indicacion metronomica enorme y pegada al pentagrama: se reduce y se sube dentro del propio SVG
  // (asi tambien vale para el PDF y para el HTML del servidor).
  function refineTempo(svg) {
    return svg.replace(/<g id="[^"]*" class="tempo">[\s\S]*?<\/text>/g, (group) => group
      .replace(/ y="(\d+)"/, (_, y) => ` y="${Number(y) - 260}"`)
      .replace(/font-size="720px"/g, 'font-size="430px"')
      .replace(/font-size="405px"/g, 'font-size="240px"'));
  }

  // Negras por minuto; sin valor no se escribe indicacion y suena a 120.
  // Que grupos de herramientas muestra cada partitura: solo se guardan los que el usuario fijo.
  const TOOL_GROUPS = ['repeats', 'dynamics', 'voices', 'playback', 'intervals', 'lyrics'];
  function toolsOf(data) {
    const tools = {};
    if (data && data.tools && typeof data.tools === 'object') TOOL_GROUPS.forEach((name) => { if (typeof data.tools[name] === 'boolean') tools[name] = data.tools[name]; });
    return tools;
  }

  // Intervalos: respecto del bajo (por defecto, no se guarda), entre voces vecinas o respecto de la tonica.
  const INTERVAL_MODES = ['bass', 'voices', 'tonic'];
  const intervalModeOf = (score) => (score && (score.intervalMode === 'voices' || score.intervalMode === 'tonic') ? score.intervalMode : 'bass');
  function setIntervalMode(score, mode) {
    if (!INTERVAL_MODES.includes(mode)) return false;
    if (mode === 'bass') delete score.intervalMode; else score.intervalMode = mode;
    return true;
  }

  // Tonica fijada por el usuario: nombre de la nota ("C", "Bb", "F#") y una "m" si es menor. Sin ella se estima.
  const TONIC = /^([A-G])(#|b)?(m?)$/;
  const tonicOf = (score) => (score && typeof score.tonic === 'string' && TONIC.test(score.tonic) ? score.tonic : null);
  function setTonic(score, name) {
    if (name == null) { delete score.tonic; return true; }
    if (typeof name !== 'string' || !TONIC.test(name)) return false;
    score.tonic = name;
    return true;
  }

  function setTool(score, name, on) {
    if (!TOOL_GROUPS.includes(name)) return false;
    score.tools = { ...score.tools, [name]: !!on };
    return true;
  }

  function setTempo(score, tempo) {
    if (tempo == null) { delete score.tempo; return true; }
    if (!tempoValid(tempo)) return false;
    score.tempo = tempo;
    return true;
  }

  function setTranspose(score, semitones) {
    if (semitones === 0) { delete score.transpose; return true; }
    if (!transposeValid(semitones)) return false;
    score.transpose = semitones;
    return true;
  }

  function fifthsOf(score) {
    return score && Number.isInteger(score.fifths) && Math.abs(score.fifths) <= 7 ? score.fifths : 0;
  }

  function bottomLine(score, mi, staff = 0) {
    return CLEFS[mi === undefined ? clefOf(score, staff) : clefAt(score, mi, staff)].bottom;
  }

  // Clave vigente en el compas `mi`: la inicial, cambiada por `score.clefs` (compas -> clave) hasta el siguiente cambio.
  function clefAt(score, mi, staff = 0) {
    let clef = clefOf(score, staff);
    let last = 0;
    Object.entries((score && score[CLEF_KEYS[staff][1]]) || {}).forEach(([index, value]) => {
      if (+index <= mi && +index > last && Object.hasOwn(CLEFS, value)) { clef = value; last = +index; }
    });
    return clef;
  }

  // La clave nueva rige desde el compas `mi` hasta el siguiente cambio; los compases anteriores no se tocan.
  function setClef(score, mi, clef, staff = 0) {
    if (!Number.isInteger(mi) || mi < 0 || mi >= measures(score).length || !Object.hasOwn(CLEFS, clef)) return false;
    // Cambiar la clave no cambia de instrumento: una partitura sin instrumento elegido lo conserva tal como se infiere hoy.
    if (!INSTRUMENTS.includes(score.instrument)) score.instrument = instrumentOf(score);
    if (mi === 0) score[CLEF_KEYS[staff][0]] = clef;
    else (score[CLEF_KEYS[staff][1]] ||= {})[mi] = clef;
    pruneKeys(score);
    return true;
  }

  // Armadura vigente en el compas `mi`: la inicial, cambiada por `score.keys` (compas -> quintas) hasta el siguiente cambio.
  function keyAt(score, mi) {
    let fifths = fifthsOf(score);
    let last = 0;
    Object.entries((score && score.keys) || {}).forEach(([index, value]) => {
      if (+index <= mi && +index > last && Number.isInteger(value) && Math.abs(value) <= 7) { fifths = value; last = +index; }
    });
    return fifths;
  }

  // La armadura nueva rige desde el compas `mi` hasta el siguiente cambio; los compases anteriores no se tocan.
  function setKey(score, mi, fifths) {
    if (!Number.isInteger(mi) || mi < 0 || mi >= measures(score).length || !Number.isInteger(fifths) || Math.abs(fifths) > 7) return false;
    if (mi === 0) score.fifths = fifths;
    else (score.keys = score.keys || {})[mi] = fifths;
    pruneKeys(score);
    return true;
  }

  // Quita los cambios fuera de la partitura y los que repiten la armadura anterior.
  function pruneKeys(score) {
    pruneClefs(score);
    pruneMeters(score);
    if (!score.keys) return;
    let previous = fifthsOf(score);
    Object.keys(score.keys).map(Number).sort((a, b) => a - b).forEach((mi) => {
      if (mi < 1 || mi >= measures(score).length || score.keys[mi] === previous) delete score.keys[mi];
      else previous = score.keys[mi];
    });
    if (!Object.keys(score.keys).length) delete score.keys;
  }

  function pruneClefs(score) {
    CLEF_KEYS.forEach(([, name], staff) => {
      if (!score[name]) return;
      let previous = clefOf(score, staff);
      Object.keys(score[name]).map(Number).sort((a, b) => a - b).forEach((mi) => {
        if (mi < 1 || mi >= measures(score).length || score[name][mi] === previous) delete score[name][mi];
        else previous = score[name][mi];
      });
      if (!Object.keys(score[name]).length) delete score[name];
    });
  }

  function keyAlter(n, score, mi) {
    const fifths = mi === undefined ? fifthsOf(score) : keyAt(score, mi);
    const order = fifths > 0 ? ['F', 'C', 'G', 'D', 'A', 'E', 'B'] : ['B', 'E', 'A', 'D', 'G', 'C', 'F'];
    return order.slice(0, Math.abs(fifths)).includes(STEPS[n % 7]) ? Math.sign(fifths) : 0;
  }

  // Llena de silencios un compas vacio o completa sus voces, con los mas grandes que entren. Ninguno pasa de una blanca con puntillo (la
  // negra con puntillo marca el pulso de los compases compuestos), salvo que sea el compas entero y quepa una redonda.
  function restPieces(from, to, voice) {
    const sizes = [['h', 1], ['h', 0], ['q', 1], ['q', 0], ['e', 1], ['e', 0], ['s', 1], ['s', 0], ['f', 1], ['f', 0]]
      .map(([d, dot]) => ({ d, dot, size: length({ d, dot }) }));
    const pieces = [];
    let at = from, left = to - from;
    while (left > 0) {
      const piece = at === 0 && left === VALUES.w ? { d: 'w', size: VALUES.w } : sizes.find((p) => p.size <= left);
      if (!piece) return null;
      const ev = { d: piece.d, rest: true, at };
      if (piece.dot) ev.dot = true;
      if (voice) ev.v = voice;
      pieces.push(ev);
      at += piece.size;
      left -= piece.size;
    }
    return pieces;
  }

  // Escribe como silencios los huecos de cada voz (al inicio o entre figuras) que hoy solo se deducen del orden: asi
  // mover una figura de otra voz no los colapsa. Devuelve true si agrego alguno.
  function fillGaps(measure) {
    const { lanes, starts } = arrange(measure);
    const additions = [];
    lanes.forEach((lane, k) => {
      let cursor = 0;
      lane.groups.forEach((group) => {
        const at = starts[group.indices[0]];
        if (at > cursor) additions.push(...(restPieces(cursor, at, lanes.length > 1 ? k + 1 : 0) || []));
        cursor = Math.max(cursor, at + group.size);
      });
    });
    if (!additions.length) return false;
    settle(measure);
    measure.push(...additions);
    return true;
  }

  function fillWithRests(score, mi, staff = 0, complete = false) {
    const measure = measures(score, staff)[mi];
    if (!measure || (measure.length && !complete)) return false;
    const { lanes } = arrange(measure);
    const additions = [];
    for (const [k, lane] of lanes.entries()) {
      if (measure.length && !lane.groups.length) continue;
      if (lane.end > capacity(score, mi)) return false;
      const pieces = restPieces(lane.end, capacity(score, mi), lanes.length > 1 ? k + 1 : 0);
      if (!pieces) return false;
      additions.push(...pieces);
    }
    if (!additions.length) return false;
    settle(measure);
    measure.push(...additions);
    return true;
  }

  // Un compas que abre la partitura o una seccion (tras doble barra, final o repeticion, o con inicio de repeticion)
  // no continua nada: una nota que no cae en su inicio (sincopa) supone silencios antes, no despues.
  function opensSection(score, mi) {
    const bar = score.barlines || {};
    return mi === 0 || !!bar[mi]?.start || !!(bar[mi - 1] && (bar[mi - 1].double || bar[mi - 1].end));
  }

  // Silencios que llenan [0, at) de un compas vacio que abre una seccion; [] si no corresponde.
  function leadingRests(score, mi, staff, at) {
    const measure = measures(score, staff)[mi];
    if (!measure || measure.length || !(at > 0) || !opensSection(score, mi)) return [];
    return restPieces(0, at, 0) || [];
  }

  function capacity(score, mi) {
    if (score && score.measureDurations && Number.isInteger(mi) && Number.isInteger(score.measureDurations[mi])) return score.measureDurations[mi];
    const [beats, unit] = meterAt(score, mi).split('/').map(Number);
    return beats * DIVISIONS * 4 / unit;
  }

  // No borrar ni recortar figuras al cambiar a un compas mas corto: si lo que suena en algun compas, contado en orden,
  // no entra, el compas no cambia. Las figuras no se tocan: sus inicios musicales no dependen del compas.
  function setMeter(score, meter) {
    if (!METERS.includes(meter)) return false;
    score.meter = meter;
    delete score.meters;
    Object.keys(score.measureDurations || {}).forEach((mi) => {
      if (score.measureDurations[mi] >= capacity({ meter })) delete score.measureDurations[mi];
    });
    Object.keys(score.barres || {}).forEach((mi) => {
      const barre = score.barres[mi];
      if (barre.at >= capacity(score)) removeBarre(score, mi);
      else if (barre.to >= capacity(score)) delete barre.to;
    });
    hairpinList(score).forEach(({ mi, h }) => {
      if (h.at >= capacity(score)) removeHairpin(score, mi, h);
      else if (h.to >= capacity(score)) delete h.to;
    });
    Object.keys(score.dynamics || {}).forEach((mi) => {
      score.dynamics[mi] = score.dynamics[mi].filter((mark) => mark.at < capacity(score));
      if (!score.dynamics[mi].length) delete score.dynamics[mi];
    });
    if (score.dynamics && !Object.keys(score.dynamics).length) delete score.dynamics;
    Object.keys(score.chords || {}).forEach((mi) => {
      score.chords[mi] = score.chords[mi].filter((chord) => chord.at < capacity(score));
      if (!score.chords[mi].length) delete score.chords[mi];
    });
    if (score.chords && !Object.keys(score.chords).length) delete score.chords;
    Object.keys(score.lyrics || {}).forEach((mi) => {
      score.lyrics[mi] = score.lyrics[mi].filter((lyric) => lyric.at < capacity(score));
      if (!score.lyrics[mi].length) delete score.lyrics[mi];
    });
    if (score.lyrics && !Object.keys(score.lyrics).length) delete score.lyrics;
    return true;
  }

  // Por ahora un compas puede pasarse de su duracion: se valida (ver `problems`) pero no se impide escribir.
  function fits() {
    return true;
  }

  // Compases cuyo contenido, contado en orden, supera su duracion: [{ mi, staff, extra }] con `extra` en divisiones.
  // Todavia no se muestra: queda para un listado de problemas («en el compas 1 sobre una corchea»).
  function problems(score) {
    const found = [];
    for (let staff = 0; staff < stavesOf(score); staff += 1) {
      measures(score, staff).forEach((measure, mi) => {
        const extra = measureLength(measure) - capacity(score, mi);
        if (extra > 0) found.push({ mi, staff, extra });
      });
    }
    return found;
  }

  // Un tresillo (o grupo irregular) al que le falta una figura ya no es valido: las que quedan vuelven a figuras comunes.
  function dropBrokenTuplets(measure, ids) {
    ids.forEach((id) => {
      const rest = measure.filter((ev) => ev.tp === id);
      if (rest.length && rest.length < tupletSize(rest[0])) rest.forEach((ev) => { delete ev.tp; delete ev.tn; });
    });
    return measure;
  }

  function canDot(measure, index, score) {
    return dotPlan(measure, index, score) !== null;
  }

  // Plan para ponerle puntillo a la figura `index`: { start, moves: [] } o null si no se puede o el compas, contado
  // en orden, ya no la admite. Con el puntillo la figura sigue donde empieza y lo que viene despues en su voz se corre;
  // `moves` queda vacio porque ninguna otra figura cambia de lugar en el orden.
  function dotPlan(measure, index, score) {
    const ev = measure[index];
    if (ev.dot === 2 || ev.tp || ev.d === 'w' || ev.d === 's' || ev.d === 'f') return null;
    if (ev.dot && !DOUBLE_DOTTABLE.includes(ev.d)) return null;
    const dot = ev.dot ? 2 : true;
    return { start: onsets(measure)[index], moves: [], dot };
  }

  function dotStart(measure, index, score) {
    const plan = dotPlan(measure, index, score);
    return plan ? plan.start : null;
  }

  // La tablatura sale de las notas; `tabs` guarda las correcciones y las posiciones conservadas al editar: { 'compas:inicio': [6 trastes] },
  // con la cuerda 1 primero y null donde no suena nada. Corregirla no cambia las notas del pentagrama.
  const TAB_STRINGS = 6;
  function sanitizeTabs(tabs, measureCount) {
    const result = {};
    if (!tabs || typeof tabs !== 'object' || Array.isArray(tabs)) return result;
    Object.keys(tabs).forEach((key) => {
      const column = tabs[key];
      if (!/^\d+:\d+$/.test(key) || +key.split(':')[0] >= measureCount || !Array.isArray(column)) return;
      result[key] = Array.from({ length: TAB_STRINGS }, (_, s) => (
        Number.isInteger(column[s]) && column[s] >= 0 && column[s] <= MAX_FRET ? column[s] : null));
    });
    return result;
  }

  const SEMITONES = [0, 2, 4, 5, 7, 9, 11];
  // Copia para dibujar con la transposicion aplicada (mismos indices de compas y figura): cada nota se vuelve a escribir
  // `transposeOf` semitonos mas arriba/abajo, con la ortografia que pida menos alteraciones segun la armadura.
  function transposedForDisplay(score) {
    const shift = transposeOf(score);
    if (!shift) return score;
    const copy = JSON.parse(JSON.stringify(score));
    // La armadura sube 7 quintas por semitono; entre las equivalentes (±12) gana la de menos alteraciones.
    const shiftKey = (fifths) => {
      const base = fifths + 7 * shift;
      let best = null;
      for (let k = -4; k <= 4; k += 1) {
        const f = base + 12 * k;
        if (Math.abs(f) <= 7 && (best === null || Math.abs(f) < Math.abs(best) || (Math.abs(f) === Math.abs(best) && f > 0 === shift > 0))) best = f;
      }
      return best;
    };
    copy.fifths = shiftKey(fifthsOf(copy));
    if (copy.keys) Object.keys(copy.keys).forEach((mi) => { copy.keys[mi] = shiftKey(copy.keys[mi]); });
    for (let staff = 0; staff < stavesOf(copy); staff += 1) {
      measures(copy, staff).forEach((measure, mi) => {
        const starts = onsets(measure);
        const accidentals = new Map();
        measure.map((_, i) => i).sort((a, b) => starts[a] - starts[b]).forEach((i) => {
          const ev = measure[i];
          if (ev.rest) return;
          const from = ev.acc ? ACCIDENTALS[ev.acc].alter : accidentals.has(ev.n) ? accidentals.get(ev.n) : keyAlter(ev.n, copy, mi);
          if (ev.acc) accidentals.set(ev.n, from);
          const midi = 12 * Math.floor(ev.n / 7) + SEMITONES[ev.n % 7] + from + shift;
          let best = null;
          for (let n = Math.floor(midi / 12) * 7 - 7; n < Math.floor(midi / 12) * 7 + 14; n += 1) {
            const alter = midi - (12 * Math.floor(n / 7) + SEMITONES[((n % 7) + 7) % 7]);
            if (Math.abs(alter) > 1) continue;
            const current = accidentals.has(n) ? accidentals.get(n) : keyAlter(n, copy, mi);
            const cost = (alter === current ? 0 : 2) + Math.abs(alter) + (alter === (shift > 0 ? -1 : 1) ? 0.5 : 0);
            if (!best || cost < best.cost) best = { n, alter, cost, current };
          }
          if (!best) return;
          ev.n = best.n;
          delete ev.acc;
          if (best.alter !== best.current) ev.acc = accidentalFor(best.alter);
          accidentals.set(best.n, best.alter);
        });
      });
    }
    return copy;
  }

  const accidentalFor = (alter) => alter === 2 ? '##' : alter === -2 ? 'bb' : alter === 1 ? '#' : alter === -1 ? 'b' : 'n';

  // Altura efectiva de cada figura, incluso si su alteracion viene de una nota no seleccionada.
  function pitchContexts(score, mi, staff = 0) {
    const measure = measures(score, staff)[mi];
    const starts = onsets(measure);
    const accidentals = new Map();
    const result = measure.map(() => null);
    const octave = CLEFS[clefAt(score, mi, staff)].octave || 0;
    measure.map((ev, i) => i).sort((a, b) => starts[a] - starts[b]).forEach((i) => {
      const ev = measure[i];
      if (ev.rest) return;
      if (ev.acc) accidentals.set(ev.n, ACCIDENTALS[ev.acc].alter);
      result[i] = { alter: accidentals.has(ev.n) ? accidentals.get(ev.n) : keyAlter(ev.n, score, mi), octave };
    });
    return result;
  }

  // Cada momento en que suena algo, en orden de lectura: { mi, at, key, midis } con el tono real (la clave de guitarra
  // suena una octava mas grave que la escrita). Las notas ligadas a la anterior no se vuelven a tocar.
  function attacks(score, withEvents = false) {
    const result = [];
    // Una sola tablatura para todos los pentagramas: las notas que empiezan juntas forman una columna.
    const tied = Array.from({ length: instrumentOf(score) === 'guitar' ? stavesOf(score) : 1 }, () => new Set());
    measures(score).forEach((_, mi) => {
      const moments = new Map();
      tied.forEach((tiedNotes, staff) => {
        const measure = measures(score, staff)[mi] || [];
        const clef = CLEFS[clefAt(score, mi, staff)];
        const starts = onsets(measure);
        const accidentals = new Map();
        const staffMoments = new Map();
        measure.map((ev, i) => i).sort((a, b) => starts[a] - starts[b]).forEach((i) => {
          const ev = measure[i];
          if (ev.rest) return;
          if (ev.acc) accidentals.set(ev.n, ACCIDENTALS[ev.acc].alter);
          const alter = accidentals.has(ev.n) ? accidentals.get(ev.n) : keyAlter(ev.n, score, mi);
          const midi = 12 * (Math.floor(ev.n / 7) + 1) + SEMITONES[ev.n % 7] + alter + 12 * (clef.octave || 0);
          if (!staffMoments.has(starts[i])) staffMoments.set(starts[i], []);
          staffMoments.get(starts[i]).push({ n: ev.n, midi, tie: !!ev.tie, ev });
        });
        [...staffMoments.keys()].sort((a, b) => a - b).forEach((at) => {
          const all = staffMoments.get(at);
          const notes = all.filter((note) => !tiedNotes.has(note.n));
          all.forEach((note) => { if (note.tie) tiedNotes.add(note.n); else tiedNotes.delete(note.n); });
          if (!notes.length) return;
          if (!moments.has(at)) moments.set(at, []);
          moments.get(at).push(...notes);
        });
      });
      [...moments.keys()].sort((a, b) => a - b).forEach((at) => {
        const notes = moments.get(at);
        result.push(Object.assign({ mi, at, key: mi + ':' + at, midis: notes.map((note) => note.midi) }, withEvents ? { events: notes.map((note) => note.ev) } : {}));
      });
    });
    return result;
  }

  // Open strings, highest first. IDs are persisted with the score.
  const TUNINGS = [
    { id: 'standard', name: 'Standard', opens: [64, 59, 55, 50, 45, 40] },
    { id: 'drop-d', name: 'Drop D', opens: [64, 59, 55, 50, 45, 38] },
    { id: 'double-drop-d', name: 'Double Drop D', opens: [62, 59, 55, 50, 45, 38] },
    { id: 'dadgad', name: 'DADGAD', opens: [62, 57, 55, 50, 45, 38] },
    { id: 'open-d', name: 'Open D', opens: [62, 57, 54, 50, 45, 38] },
    { id: 'open-g', name: 'Open G', opens: [62, 59, 55, 50, 43, 38] },
  ];
  const tuningOf = (score) => TUNINGS.find(tuning => tuning.id === score.tuning) || TUNINGS[0];
  const tuningLabels = (score) => tuningOf(score).opens.map(midi => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][midi % 12]);

  // Captura lo que se ve antes de editar, asociado a las figuras y su altura real.
  function captureTabReferences(score, columns = score.tabs || {}) {
    return attacks(score, true).filter((attack) => columns[attack.key]).map((attack) => ({
      refs: attack.events.map(tabReference), midis: attack.midis, column: columns[attack.key].slice(),
    }));
  }

  // Reconstruye las claves compas:inicio despues de asentar las figuras. Si cambia
  // la altura, se deja que la digitacion automatica calcule una posicion nueva.
  // `complete(opens, pinned, midis)` coloca las notas nuevas de un acorde alrededor de las cuerdas ya elegidas.
  function restoreTabReferences(score, saved, complete) {
    const byRef = new Map();
    saved.forEach((entry) => entry.refs.forEach((ref, i) => byRef.set(ref, { entry, midi: entry.midis[i] })));
    const tabs = {};
    attacks(score, true).forEach((attack) => {
      const refs = attack.events.map(tabReference);
      const entries = refs.map((ref) => byRef.get(ref));
      const known = entries.map((entry, i) => entry && entry.midi === attack.midis[i]);
      if (!known.every(Boolean)) {
        // Una nota nueva (o cambiada) se suma a un acorde: las demas conservan su cuerda y solo la nueva se calcula.
        if (!complete || !known.some(Boolean)) return;
        const opens = tuningOf(score).opens;
        const pinned = [];
        entries.forEach((entry, i) => {
          if (!known[i]) return;
          const string = entry.entry.column.findIndex((fret, s) => fret !== null && opens[s] + fret === entry.midi && !pinned.some((cell) => cell[0] === s));
          if (string >= 0) pinned.push([string, entry.entry.column[string]]);
        });
        const column = pinned.length === known.filter(Boolean).length ? complete(opens, pinned, attack.midis) : null;
        if (column) tabs[attack.key] = column;
        return;
      }
      const first = entries[0].entry;
      if (first.refs.length === refs.length && refs.every((ref) => first.refs.includes(ref))) {
        tabs[attack.key] = first.column.slice();
        return;
      }
      // Al partir o reunir un acorde, cada nota conserva su cuerda si siguen siendo compatibles.
      const column = new Array(TAB_STRINGS).fill(null);
      for (const { entry, midi } of entries) {
        const string = entry.column.findIndex((fret, s) => fret !== null && tuningOf(score).opens[s] + fret === midi && column[s] === null);
        if (string < 0) return;
        column[string] = entry.column[string];
      }
      tabs[attack.key] = column;
    });
    if (Object.keys(tabs).length) score.tabs = tabs;
    else delete score.tabs;
  }

  // Descarta lo que no sea una partitura valida (por ejemplo, datos viejos o editados a mano).
  // `scale` son las divisiones de negra con que se guardaron los datos (8 antes de los tresillos).
  function sanitize(data, scale) {
    if (!data || !Array.isArray(data.rows)) return emptyScore();
    const meter = meterOf(data);
    const factor = DIVISIONS / (scale || DIVISIONS);
    const cleanMeasure = (measure, meterName) => {
      const events = [];
      const limit = capacity({ meter: meterName });
      (Array.isArray(measure) ? measure : []).forEach((raw) => {
        if (!raw || !VALUES[raw.d]) return;
        const ev = { d: raw.d };
        if (raw.rest) { ev.rest = true; if (Number.isInteger(raw.n)) ev.n = clampPitch(raw.n); }
        else if (Number.isInteger(raw.n)) ev.n = clampPitch(raw.n);
        else return;
        if (Number.isInteger(raw.tp) && raw.tp > 0 && TRIPLETABLE.includes(raw.d)) { ev.tp = raw.tp; if (TUPLETS[raw.tn] && raw.tn !== 3) ev.tn = raw.tn; }
        else if (raw.dot && raw.d !== 'w' && raw.d !== 's' && raw.d !== 'f') ev.dot = raw.dot === 2 && DOUBLE_DOTTABLE.includes(raw.d) ? 2 : true;
        if (!ev.rest && ACCIDENTALS[raw.acc]) ev.acc = raw.acc;
        if (!ev.rest && raw.dead === true) ev.dead = true;
        if (!ev.rest && raw.tie === true) ev.tie = true;
        else if (!ev.rest && raw.slur === true) ev.slur = true;
        if (Number.isInteger(raw.v) && raw.v >= 1 && raw.v <= MAX_VOICE) ev.v = raw.v;
        if (raw.beam === 'join' || raw.beam === 'break') ev.beam = raw.beam;
        if (Number.isInteger(raw.at) && raw.at >= 0) ev.at = raw.at * factor;
        // `at` sigue siendo la pista guardada (sin `at`, la figura sigue a la anterior); los huecos se quitan al final.
        ev.at = hints(events.concat(ev))[events.length];
        if (!ev.rest && events.some((o) => !o.rest && o.at === ev.at && o.n === ev.n && o.acc === ev.acc)) return;
        events.push(ev);
      });
      if (measureLength(events) > limit) legacyVoices(events);
      // En el orden de la pista, como se guardaban; despues `at` pasa a ser el inicio musical, sin huecos.
      events.sort((a, b) => a.at - b.at);
      return settle(events);
    };
    let measureIndex = 0;
    const rows = data.rows.map((row) => {
      const count = Array.isArray(row) && row.length ? row.length : PER_ROW;
      const result = Array.from({ length: count }, () => []);
      (Array.isArray(row) ? row : []).forEach((measure, m) => { result[m] = cleanMeasure(measure, meterAt(data, measureIndex + m)); });
      measureIndex += count;
      return result;
    });
    while (rows.length < MIN_ROWS) rows.push(emptyRow());
    const total = rows.flat().length;
    // Segundo pentagrama: solo los compases con figuras, con las mismas reglas que el primero.
    // Los pentagramas de abajo se conservan aunque hoy no se vean (Voces con menos partes que antes).
    const lowers = LANE_KEYS.map((name) => {
      const lane = {};
      Object.entries(data[name] && typeof data[name] === 'object' && !Array.isArray(data[name]) ? data[name] : {}).forEach(([index, measure]) => {
        if (!/^(0|[1-9]\d*)$/.test(index) || +index >= total || !Array.isArray(measure)) return;
        const events = cleanMeasure(measure, meterAt(data, +index));
        if (events.length) lane[index] = events;
      });
      return lane;
    });
    const lower = lowers[0];
    const lastOf = (index) => rowOf({ rows }, index).last;
    const navigation = {};
    Object.entries(data.navigation || {}).forEach(([index, marks]) => {
      if (!/^(0|[1-9]\d*)$/.test(index) || +index >= total || !marks) return;
      NAVIGATION.forEach((mark) => { if (marks[mark] === true) setNavigation({ rows, navigation }, +index, mark); });
    });
    const barlines = {};
    Object.entries(data.barlines || {}).forEach(([index, bar]) => {
      if (!/^(0|[1-9]\d*)$/.test(index) || +index >= total || !bar) return;
      if (bar.start === true || bar.end === true) {
        barlines[index] = { start: bar.start === true, end: bar.end === true };
        if (bar.double === true && bar.end !== true) barlines[index].double = true;
      }
      else if (bar.double === true || bar.single === true) barlines[index] = { double: true };
      if (bar.hidden === true && bar.end !== true) barlines[index] = Object.assign(barlines[index] || {}, { hidden: true });
    });
    const meterContext = { meter, meters: clone(data.meters || {}), rows };
    pruneMeters(meterContext);
    const meters = meterContext.meters || {};
    const keys = {};
    let previousKey = fifthsOf(data);
    Object.entries(data.keys || {}).filter(([index]) => /^[1-9]\d*$/.test(index) && +index < total).sort((a, b) => a[0] - b[0]).forEach(([index, value]) => {
      if (!Number.isInteger(value) || Math.abs(value) > 7 || value === previousKey) return;
      keys[index] = previousKey = value;
    });
    const clefs = {};
    let previousClef = clefOf(data);
    Object.entries(data.clefs || {}).filter(([index]) => /^[1-9]\d*$/.test(index) && +index < total).sort((a, b) => a[0] - b[0]).forEach(([index, value]) => {
      if (!Object.hasOwn(CLEFS, value) || value === previousClef) return;
      clefs[index] = previousClef = value;
    });
    const lowerClefMaps = [1, 2, 3].map((staff) => {
      const changes = {};
      let previous = clefOf(data, staff);
      Object.entries(data[CLEF_KEYS[staff][1]] || {}).filter(([index]) => /^[1-9]\d*$/.test(index) && +index < total).sort((a, b) => a[0] - b[0]).forEach(([index, value]) => {
        if (!Object.hasOwn(CLEFS, value) || value === previous) return;
        changes[index] = previous = value;
      });
      return changes;
    });
    const barres = {};
    Object.entries(data.barres || {}).forEach(([index, barre]) => {
      if (!/^(0|[1-9]\d*)$/.test(index) || +index >= total || !barre) return;
      const at = barre.at * factor;
      const to = barre.to * factor;
      const span = barre.span || 0;
      if (!Number.isInteger(at) || at < 0 || at >= capacity(meterContext, +index)) return;
      if (!Number.isInteger(barre.fret) || barre.fret < 1 || barre.fret > MAX_FRET) return;
      if (!Number.isInteger(span) || span < 0 || +index + span > lastOf(+index)) return;
      if (Object.keys(barres).some((key) => barreLast(barres[key], +key) >= +index)) return;
      const result = { at, fret: barre.fret };
      if (span) result.span = span;
      if (Number.isInteger(to) && (span ? to > 0 : to > at) && to < capacity(meterContext, +index + span)) result.to = to;
      barres[index] = result;
    });
    const dynamics = {};
    Object.entries(data.dynamics || {}).forEach(([index, list]) => {
      if (!/^(0|[1-9]\d*)$/.test(index) || +index >= total || !Array.isArray(list)) return;
      const kept = [];
      list.forEach((mark) => {
        const at = mark?.at * factor;
        if (!Number.isInteger(at) || at < 0 || at >= capacity(meterContext, +index) || !DYNAMICS.includes(mark?.value) || kept.some((other) => other.at === at)) return;
        kept.push({ at, value: mark.value });
      });
      if (kept.length) dynamics[index] = kept.sort((a, b) => a.at - b.at);
    });
    const chords = {};
    Object.entries(data.chords || {}).forEach(([index, list]) => {
      if (!/^(0|[1-9]\d*)$/.test(index) || +index >= total || !Array.isArray(list)) return;
      const kept = [];
      list.forEach((chord) => {
        const at = chord && chord.at * factor;
        const name = chord && typeof chord.name === 'string' ? chord.name.trim() : '';
        if (!Number.isInteger(at) || at < 0 || at >= capacity(meterContext, +index) || !name || name.length > MAX_CHORD_NAME || kept.some((other) => other.at === at)) return;
        kept.push(Object.assign({ at, name }, Number.isInteger(chord.variant) && chord.variant > 0 && chord.variant < MAX_CHORD_VARIANTS ? { variant: chord.variant } : {}));
      });
      if (kept.length) chords[index] = kept.sort((a, b) => a.at - b.at);
    });
    const lyrics = {};
    Object.entries(data.lyrics || {}).forEach(([index, list]) => {
      if (!/^(0|[1-9]\d*)$/.test(index) || +index >= total || !Array.isArray(list)) return;
      const kept = [];
      list.forEach((lyric) => {
        const at = lyric && lyric.at * factor;
        const staff = lyric && lyric.s ? lyric.s : 0;
        const parsed = lyric && parseLyric(lyric.text);
        if (!Number.isInteger(at) || at < 0 || at >= capacity(meterContext, +index) || !parsed || !Number.isInteger(staff) || staff < 0 || staff >= MAX_PARTS || kept.some((other) => other.at === at && (other.s || 0) === staff)) return;
        kept.push(Object.assign({ at, text: parsed.text }, staff ? { s: staff } : {}));
      });
      if (kept.length) lyrics[index] = kept.sort(lyricOrder);
    });
    const measureDurations = {};
    Object.entries(data.measureDurations || {}).forEach(([index, duration]) => {
      const size = duration * factor;
      if (/^(0|[1-9]\d*)$/.test(index) && +index < total && Number.isInteger(size) && size > 0 && size < capacity(meterContext, +index) ) measureDurations[index] = size;
    });
    const hairpinContext = Object.assign({}, meterContext, { measureDurations, hairpins: {} });
    Object.entries(data.hairpins || {}).forEach(([index, list]) => {
      if (!/^(0|[1-9]\d*)$/.test(index) || +index >= total || !Array.isArray(list)) return;
      list.forEach((h) => {
        if (!h || typeof h !== 'object') return;
        const candidate = { kind: h.kind, at: h.at * factor };
        if (h.span) candidate.span = h.span;
        if (h.to !== undefined) candidate.to = h.to * factor;
        ['startDyn', 'endDyn'].forEach((field) => { if (DYNAMICS.includes(h[field])) candidate[field] = h[field]; });
        setHairpin(hairpinContext, +index, candidate);
      });
    });
    const hairpins = hairpinContext.hairpins;
    const measureWidths = {};
    Object.entries(data.measureWidths || {}).forEach(([index, width]) => {
      if (/^(0|[1-9]\d*)$/.test(index) && +index < total && Number.isFinite(width) && width > 0 && width <= 1) measureWidths[index] = width;
    });
    const tabs = sanitizeTabs(data.tabs, rows.reduce((sum, row) => sum + row.length, 0));
    return Object.assign(Object.keys(navigation).length ? { navigation } : {}, Object.keys(meters).length ? { meters } : {}, Object.keys(measureWidths).length ? { measureWidths } : {}, Object.keys(measureDurations).length ? { measureDurations } : {}, Object.keys(barlines).length ? { barlines } : {}, Object.keys(keys).length ? { keys } : {}, Object.keys(clefs).length ? { clefs } : {}, ...[1, 2, 3].map((staff) => (Object.hasOwn(CLEFS, data[CLEF_KEYS[staff][0]]) ? { [CLEF_KEYS[staff][0]]: data[CLEF_KEYS[staff][0]] } : {})), ...lowerClefMaps.map((changes, k) => (Object.keys(changes).length ? { [CLEF_KEYS[k + 1][1]]: changes } : {})), ...lowers.map((lane, k) => (Object.keys(lane).length ? { [LANE_KEYS[k]]: lane } : {})), partsValid(data.parts) ? { parts: data.parts } : {}, Array.isArray(data.voiceMap) && data.voiceMap.some(validLegendMap) ? { voiceMap: Array.from({ length: MAX_PARTS }, (_, t) => (validLegendMap(data.voiceMap[t]) ? data.voiceMap[t] : null)) } : {}, CHOIR_SOUNDS.includes(data.sound) && data.sound !== CHOIR_SOUNDS[0] ? { sound: data.sound } : {}, data.intervalMode === 'voices' || data.intervalMode === 'tonic' ? { intervalMode: data.intervalMode } : {}, tonicOf(data) ? { tonic: data.tonic } : {}, Array.isArray(data.registers) && data.registers.some(validRegister) ? { registers: Array.from({ length: MAX_PARTS }, (_, k) => (validRegister(data.registers[k]) ? data.registers[k] : DEFAULT_REGISTERS[k])) } : {}, Object.keys(barres).length ? { barres } : {}, Object.keys(hairpins).length ? { hairpins } : {}, Object.keys(dynamics).length ? { dynamics } : {}, Object.keys(chords).length ? { chords } : {}, Object.keys(lyrics).length ? { lyrics } : {}, TUNINGS.some(tuning => tuning.id === data.tuning) ? { tuning: data.tuning } : {}, data.showTabs === true ? { showTabs: true } : {}, INSTRUMENTS.includes(data.instrument) ? { instrument: data.instrument } : {}, tempoValid(data.tempo) ? { tempo: data.tempo } : {}, transposeValid(data.transpose) ? { transpose: data.transpose } : {}, patternsOf(data).length ? { patterns: patternsOf(data) } : {}, Object.keys(toolsOf(data)).length ? { tools: toolsOf(data) } : {}, Object.keys(tabs).length ? { tabs } : {}, { meter, clef: clefOf(data), fifths: fifthsOf(data), rows }, typeof data.title === 'string' ? { title: data.title } : {}, typeof data.author === 'string' && data.author ? { author: data.author } : {});
  }

  // Rellena huecos con silencios ocultos: el final del compas y el espacio entre figuras sueltas.
  function padding(left) {
    const parts = [];
    [96, 48, 24, 16, 12, 8, 6, 4, 3, 2, 1].forEach((size) => {
      while (left >= size) {
        parts.push(size);
        left -= size;
      }
    });
    return parts;
  }

  function beatLength(score) {
    const [beats, unit] = meterOf(score).split('/').map(Number);
    return unit === 8 && beats % 3 === 0 && beats > 3 ? DIVISIONS * 1.5 : DIVISIONS * 4 / unit;
  }

  // Sin indicacion manual, dos figuras se barran si caen en el mismo pulso o en el mismo tresillo.
  function autoBeam(left, leftAt, right, rightAt, score) {
    const size = beatLength(score);
    return Math.floor(leftAt / size) === Math.floor(rightAt / size) || !!(left.tp && left.tp === right.tp);
  }

  function isBeamable(ev) {
    return !ev.rest && (ev.d === 'e' || ev.d === 's' || ev.d === 'f');
  }

  // Columnas de una voz (acordes) en orden, con el inicio de cada una.
  function columnsOf(measure, starts) {
    const columns = [];
    measure.forEach((ev, i) => {
      const last = columns[columns.length - 1];
      if (last && starts[last[0]] === starts[i]) last.push(i);
      else columns.push([i]);
    });
    return columns;
  }

  // Barras de corchea y semicorchea: por pulso, salvo que `beam` en una figura una ('join') o separe ('break')
  // su columna de la siguiente; el acorde comparte las de su columna. `measure` son las figuras de una sola voz,
  // en orden y con `at` = su inicio musical.
  function beamStates(measure, score) {
    const states = measure.map(() => null);
    const starts = measure.map((ev) => ev.at);
    const runs = [];
    let run = null;
    let end = 0;
    let prev = null;
    columnsOf(measure, starts).forEach((col) => {
      const ev = measure[col[0]];
      const at = starts[col[0]];
      if (isBeamable(ev)) {
        const flag = prev && prev.col.map((i) => measure[i].beam).find(Boolean);
        const joined = run && end === at && (flag === 'join' || (flag !== 'break' && autoBeam(prev.ev, prev.at, ev, at, score)));
        if (joined) run.items.push(col);
        else runs.push((run = { items: [col] }));
      } else {
        run = null;
      }
      end = at + length(ev);
      prev = { col, ev, at };
    });
    runs.filter((r) => r.items.length > 1).forEach((r) => {
      r.items.forEach((col, k) => {
        const first = k === 0;
        const last = k === r.items.length - 1;
        const state = { 1: first ? 'begin' : last ? 'end' : 'continue' };
        // Nivel 2 para semicorcheas y fusas, nivel 3 solo para fusas.
        [['s', 'f'], ['f']].forEach((ds, level) => {
          if (!ds.includes(measure[col[0]].d)) return;
          const prevShort = k > 0 && ds.includes(measure[r.items[k - 1][0]].d);
          const nextShort = !last && ds.includes(measure[r.items[k + 1][0]].d);
          if (prevShort && nextShort) state[level + 2] = 'continue';
          else if (prevShort) state[level + 2] = 'end';
          else if (nextShort) state[level + 2] = 'begin';
          else state[level + 2] = first ? 'forward hook' : 'backward hook';
        });
        col.forEach((i) => { states[i] = state; });
      });
    });
    return states;
  }

  // Voces del compas, de la aguda (1) a la grave: [{ end, groups: [{ at, size, rest, v, hint, indices }] }].
  // Cada grupo es una figura o un acorde; `at` es su inicio musical, `hint` el `at` guardado y `indices` las figuras
  // originales, para seleccionar las notas en el SVG. Ver el encabezado para como se reparten y se cuentan.
  function voices(measure) {
    return arrange(measure).lanes;
  }

  // Recalcula las lineas sin fusionar voces ni cambiar su ritmo para hacerlas caber.
  // Nombre conservado para los consumidores anteriores del modelo.
  function mergeVoices(measure, limit) {
    const saved = measure.map((ev) => Object.assign({}, ev));
    const starts = onsets(measure);
    const previous = [];
    const before = measureLength(measure);
    voices(measure).forEach((voice, k) => voice.groups.forEach(g => g.indices.forEach(i => { previous[i] = k + 1; })));
    measure.forEach((ev) => { delete ev.v; });
    if (voices(measure).length > MAX_VOICE || measureLength(measure) > Math.max(limit, before) || onsets(measure).some((at, i) => at !== starts[i])) {
      measure.forEach((ev, i) => { Object.keys(ev).forEach((key) => delete ev[key]); Object.assign(ev, saved[i]); });
      return false;
    }
    settle(measure);
    settleVoices(measure);
    return measure.some((ev, i) => ev.v !== previous[i]);
  }

  // Fija `v` en todas las figuras segun la voz en la que hoy suenan, para que agregar otra no las reparta distinto.
  function settleVoices(measure) {
    voices(measure).forEach((voice, k) => voice.groups.forEach((g) => g.indices.forEach((i) => { measure[i].v = k + 1; })));
    return measure;
  }

  // Altura del silencio: separado de las notas y los silencios que suenan ahi.
  function restPitch(measure, ev, at, n, defaultN = n) {
    const starts = onsets(measure);
    const end = at + length(ev);
    let result = n;
    measure.forEach((o, i) => {
      const pitch = o.n ?? defaultN;
      if (starts[i] >= end || at >= starts[i] + length(o) || Math.abs(pitch - result) >= REST_CLEARANCE) return;
      result = result >= pitch ? pitch + REST_CLEARANCE : pitch - REST_CLEARANCE;
    });
    return clampPitch(result);
  }

  // Pone el silencio `ev` en `at`, clickeado a la altura `n`, sin tocar `measure`.
  // Las voces se ordenan de arriba (1) a abajo: sobre una nota el silencio queda en una voz mas aguda, bajo ella en una mas grave.
  // Usa la voz libre mas cercana en ese sentido; si no hay, abre una nueva y las voces desde ahi bajan un lugar.
  // Antes de la primera columna, antepone el silencio en la voz mas cercana y corre las figuras existentes.
  // Devuelve { measure, index }, { voice } (la voz del click) si las MAX_VOICE voces estan ocupadas en ese tiempo, o
  // { full: true } si su voz, contada en orden, ya no entra en el compas.
  function placeRest(measure, ev, at, n, score, mi, beforeFirst = false, staff = 0) {
    // `at` explicito sin asentar: si el silencio se esta moviendo, las demas conservan el lugar en que se ven.
    const others = measure.map((o) => clone(o));
    const h = hints(others);
    others.forEach((o, i) => { o.at = h[i]; });
    settleVoices(others);
    const rest = clone(ev);
    delete rest.v;
    delete rest.n;
    const first = Math.min(...h);
    const leading = others.filter((o) => o.at === first);
    const pitch = (o) => o.n ?? bottomLine(score, mi, staff) + 4;
    const ref = leading.reduce((a, b) => !a || Math.abs(pitch(b) - n) < Math.abs(pitch(a) - n) ? b : a, null);
    // Bajo un silencio inicial, anteponer a la voz grave tambien al soltar en esa columna.
    const underRest = at === first && ref && !ref.rest && leading.some((o) => o.rest && pitch(o) > n);
    if (others.length && (beforeFirst || underRest)) {
      rest.v = ref.v;
      // Solo separar del silencio la primera columna de esa voz. Correr todas las voces
      // desplaza tambien la melodia y puede desbordar un compas que si admite el silencio.
      // Duplicar las pistas de orden deja un entero entre columnas, aun con fusas o tresillos.
      others.forEach((o) => { o.at *= 2; });
      leading.filter((o) => o.v === ref.v).forEach((o) => { o.at += 1; });
      rest.at = first * 2;
      others.unshift(rest);
      settle(others);
      if (measureLength(others) > Infinity) return { full: true };
      return { measure: others, index: 0 };
    }
    const end = at + length(ev);
    const overlaps = (o) => o.at < end && at < o.at + length(o);
    const clash = others.filter(overlaps);
    if (clash.length) {
      const pitched = clash.filter((o) => !o.rest);
      const ref = pitched.length ? pitched.reduce((a, b) => Math.abs(a.n - n) <= Math.abs(b.n - n) ? a : b) : clash[0];
      const above = pitched.length ? n > ref.n : n >= pitch(ref);
      const lanes = Math.max(...others.map((o) => o.v));
      const free = (k) => others.every((o) => o.v - 1 !== k || !overlaps(o));
      let target = -1;
      for (let k = ref.v - 1 + (above ? -1 : 1); k >= 0 && k < lanes; k += above ? -1 : 1) {
        if (free(k)) { target = k; break; }
      }
      if (target < 0) {
        if (lanes >= MAX_VOICE) return { voice: ref.v };
        target = above ? ref.v - 1 : ref.v;
        others.forEach((o) => { if (o.v - 1 >= target) o.v += 1; });
      }
      rest.v = target + 1;
      rest.n = restPitch(others, rest, at, n, bottomLine(score, mi, staff) + 4);
    }
    const index = insertAt(others, rest, at);
    if (!clash.length) settleVoices(others);
    if (measureLength(others) > Infinity) return { full: true };
    return { measure: others, index };
  }

  // Una nota nueva continua una linea libre o abre otra; compartir duracion no la convierte en acorde.
  // La union en acorde se pide explicitamente con la seleccion.
  function insertNote(measure, ev, at) {
    if (measure.length && !savedVoice(ev)) {
      settleVoices(measure);
      const h = hints(measure);
      const lanes = voices(measure);
      const together = measure.filter((o, i) => h[i] === at);
      if (new Set(together.map((o) => o.v)).size === lanes.length) {
        const closest = together.reduce((a, b) => Math.abs((b.n ?? ev.n) - ev.n) < Math.abs((a.n ?? ev.n) - ev.n) ? b : a);
        const voice = closest.v + (ev.n > (closest.n ?? ev.n) ? 0 : 1);
        measure.forEach((o) => { if (o.v >= voice) o.v += 1; });
        ev.v = voice;
      }
    }
    return insertAt(measure, ev, at);
  }

  // Intercalar en una linea: separar la columna de destino sin perder los acordes
  // ni las alineaciones posteriores con otras voces.
  function insertBefore(measure, ev, at, n, defaultN) {
    settleVoices(measure);
    const h = hints(measure);
    const column = measure.filter((o, i) => h[i] === at);
    if (!column.length) return null;
    const distance = (o) => Math.abs((o.n ?? defaultN) - n);
    const closest = column.reduce((a, b) => distance(b) < distance(a) ? b : a);
    ev.v = closest.v;
    measure.forEach((o, i) => { o.at = h[i] * 2 + (h[i] === at && o.v === ev.v ? 1 : 0); });
    return insertAt(measure, ev, at * 2);
  }

  function placeBefore(measure, ev, at, n, score, mi, staff = 0) {
    const trial = clone(measure);
    const added = clone(ev);
    const index = insertBefore(trial, added, at, n, bottomLine(score, mi, staff) + 4);
    if (index === null || measureLength(trial) > Infinity) return { full: true };
    return { measure: trial, index };
  }

  // ---- seleccion: tresillos, ligaduras y barrado -------------------------

  // Indices de las figuras con el primer (o ultimo) inicio del compas, sin silencios.
  function edge(measure, side) {
    if (!measure.length) return [];
    const starts = onsets(measure);
    const at = side === 'first' ? Math.min(...starts) : Math.max(...starts);
    return measure.map((ev, i) => i).filter((i) => starts[i] === at && !measure[i].rest);
  }

  // Ligaduras entre notas consecutivas de una voz o entre las columnas de dos compases vecinos.
  // Con la misma altura es una ligadura de prolongacion (`tie`); con otra, de expresion (`slur`).
  // Prefijo del id en el SVG de las figuras de cada pentagrama: e<mi>-<i> arriba, l (abajo), p y q (voces 3 y 4).
  const ID_PREFIX = 'elpq';
  const refOf = (staff, mi, i) => (staff ? { s: staff, mi, i } : { mi, i });
  const sameRef = (a, b) => staffOf(a) === staffOf(b) && a.mi === b.mi && a.i === b.i;

  // Misma altura que suena (diatonica y alteracion efectiva, tambien la arrastrada por el compas): solo asi hay prolongacion.
  function samePitch(score, staff, a, b) {
    const all = measures(score, staff);
    if (all[a.mi][a.i].n !== all[b.mi][b.i].n) return false;
    return pitchContexts(score, a.mi, staff)[a.i].alter === pitchContexts(score, b.mi, staff)[b.i].alter;
  }

  function links(score) {
    const result = [];
    for (let staff = 0; staff < stavesOf(score); staff += 1) {
      const all = measures(score, staff);
      all.forEach((measure, mi) => {
        const last = edge(measure, 'last');
        const next = edge(all[mi + 1] || [], 'first');
        const following = new Map();
        voices(measure).forEach((voice) => voice.groups.slice(0, -1).forEach((group, k) => {
          const right = voice.groups[k + 1];
          if (tidy(group.at + group.size) === tidy(right.at)) group.indices.forEach((i) => following.set(i, right.indices));
        }));
        measure.forEach((ev, i) => {
          if (ev.rest || !(ev.tie || ev.slur)) return;
          const targetMi = following.has(i) ? mi : mi + 1;
          const candidates = following.get(i) || (last.includes(i) ? next : []);
          const j = candidates.find((k) => !all[targetMi][k].rest && (!ev.tie || samePitch(score, staff, { mi, i }, { mi: targetMi, i: k })));
          if (j !== undefined) result.push({ type: ev.tie ? 'tie' : 'slur', from: refOf(staff, mi, i), to: refOf(staff, targetMi, j) });
        });
      });
    }
    return result;
  }

  // Columnas seleccionadas, seguidas y de una sola voz de un solo compas; null si no lo son.
  function run(score, sel) {
    if (!sel.length) return null;
    const all = measures(score, staffOf(sel[0]));
    if (sel.some((s) => staffOf(s) !== staffOf(sel[0]) || s.mi !== sel[0].mi || !all[s.mi] || !all[s.mi][s.i])) return null;
    const measure = all[sel[0].mi];
    const lane = voices(measure).find((v) => v.groups.some((g) => g.indices.includes(sel[0].i)));
    const picked = lane.groups.filter((g) => g.indices.some((i) => sel.some((s) => s.i === i)));
    if (!sel.every((s) => picked.some((g) => g.indices.includes(s.i)))) return null;
    const first = lane.groups.indexOf(picked[0]);
    const joined = picked.every((g, k) => lane.groups[first + k] === g && (k === 0 || tidy(picked[k - 1].at + picked[k - 1].size) === tidy(g.at)));
    return joined ? { measure, lane, groups: picked, mi: sel[0].mi, staff: staffOf(sel[0]) } : null;
  }

  // Seleccion de 2 a 9 figuras seguidas del mismo valor: ofrece el grupo que corresponde a su cantidad.
  function tripletRun(score, sel) {
    const r = run(score, sel);
    if (!r || !TUPLETS[r.groups.length]) return null;
    const d = r.measure[r.groups[0].indices[0]].d;
    const plain = r.groups.every((g) => g.indices.every((i) => {
      const ev = r.measure[i];
      return ev.d === d && !ev.dot && !ev.tp;
    }));
    return plain && TRIPLETABLE.includes(d) ? r : null;
  }

  function untripletRun(score, sel) {
    const r = run(score, sel);
    if (!r || !r.groups.every((g) => g.indices.every((i) => r.measure[i].tp))) return null;
    const size = tupletSize(r.measure[r.groups[0].indices[0]]);
    return r.groups.every((g) => g.indices.every((i) => tupletSize(r.measure[i]) === size)) ? Object.assign(r, { size }) : null;
  }

  // Dos notas consecutivas de una voz, o en los extremos de compases vecinos.
  function linkPair(score, sel) {
    if (!sel.length) return null;
    const staff = staffOf(sel[0]);
    const all = measures(score, staff);
    const notes = sel.filter((s, k) => staffOf(s) === staff && all[s.mi] && all[s.mi][s.i] && sel.findIndex((o) => sameRef(o, s)) === k);
    if (notes.length !== 2 || sel.some((s) => staffOf(s) !== staff)) return null;
    const [from, to] = notes.sort((a, b) => a.mi - b.mi || onsets(all[a.mi])[a.i] - onsets(all[b.mi])[b.i]);
    if (all[from.mi][from.i].rest || all[to.mi][to.i].rest) return null;
    if (to.mi === from.mi) {
      const r = run(score, notes);
      if (!r || r.groups.length !== 2) return null;
      const ev = all[from.mi][from.i];
      const target = r.groups[1].indices.find((i) => !r.measure[i].rest && (ev.n !== r.measure[to.i].n || r.measure[i].n === ev.n));
      if (target !== to.i) return null;
    } else {
      if (to.mi !== from.mi + 1) return null;
      if (!edge(all[from.mi], 'last').includes(from.i) || !edge(all[to.mi], 'first').includes(to.i)) return null;
    }
    const existing = links(score).some((l) => sameRef(l.from, from));
    return { from, to, existing, staff };
  }

  // Dos acordes (grupos apilados) consecutivos de una voz, o en los extremos de compases vecinos, cuyas notas mantienen la altura:
  // cada nota del primero se liga con la de igual altura del segundo.
  function chordLinkPair(score, sel) {
    if (!sel.length) return null;
    const staff = staffOf(sel[0]);
    const all = measures(score, staff);
    if (sel.some((s) => staffOf(s) !== staff || !all[s.mi]?.[s.i])) return null;
    const notes = sel.filter((s, k) => sel.findIndex((o) => sameRef(o, s)) === k);
    if (notes.length < 3 || notes.some((s) => all[s.mi][s.i].rest)) return null;
    const column = new Map();
    notes.forEach((s) => {
      const key = s.mi + ':' + onsets(all[s.mi])[s.i];
      column.set(key, (column.get(key) || []).concat(s));
    });
    if (column.size !== 2) return null;
    const [left, right] = [...column.values()].sort((a, b) => a[0].mi - b[0].mi || onsets(all[a[0].mi])[a[0].i] - onsets(all[b[0].mi])[b[0].i]);
    const covers = (indices, refs) => indices.length === refs.length && indices.every((i) => refs.some((r) => r.i === i));
    if (left[0].mi === right[0].mi) {
      const r = run(score, notes);
      if (!r || r.groups.length !== 2 || !covers(r.groups[0].indices, left) || !covers(r.groups[1].indices, right)) return null;
    } else {
      if (right[0].mi !== left[0].mi + 1) return null;
      if (!covers(edge(all[left[0].mi], 'last'), left) || !covers(edge(all[right[0].mi], 'first'), right)) return null;
    }
    if (!left.every((from) => right.some((to) => samePitch(score, staff, from, to)))) return null;
    return { refs: left, staff, existing: links(score).some((l) => left.some((from) => sameRef(l.from, from))) };
  }

  function beamRun(score, sel) {
    const r = run(score, sel);
    if (!r || r.groups.length < 2 || !r.groups.every((g) => g.indices.every((i) => isBeamable(r.measure[i])))) return null;
    const starts = onsets(r.measure);
    const order = r.lane.groups.flatMap((g) => g.indices);
    const states = beamStates(order.map((i) => Object.assign({}, r.measure[i], { at: starts[i] })), { meter: meterAt(score, r.mi) });
    const joins = r.groups.slice(0, -1).map((g) => {
      const state = states[order.indexOf(g.indices[0])];
      return !!state && (state[1] === 'begin' || state[1] === 'continue');
    });
    return Object.assign(r, { joins });
  }

  // 'triplet' para 3 figuras (el nombre de siempre) y 'tupletN' para las demas.
  const tupletAction = (size) => (size === 3 ? 'triplet' : 'tuplet' + size);

  function voiceSelection(score, sel) {
    if (sel.length < 2) return null;
    const all = measures(score, staffOf(sel[0]));
    if (sel.some((s) => staffOf(s) !== staffOf(sel[0]) || s.mi !== sel[0].mi || !all[s.mi]?.[s.i])) return null;
    const indices = [...new Set(sel.map((s) => s.i))];
    return indices.length > 1 ? { measure: all[sel[0].mi], mi: sel[0].mi, staff: staffOf(sel[0]), indices } : null;
  }

  function chordSelection(score, sel) {
    const r = voiceSelection(score, sel);
    if (!r) return null;
    const first = r.measure[r.indices[0]];
    const starts = onsets(r.measure);
    if (r.indices.some((i) => {
      const ev = r.measure[i];
      return ev.rest || starts[i] !== starts[r.indices[0]] || ev.d !== first.d || ev.dot !== first.dot || ev.tp !== first.tp || ev.tn !== first.tn;
    })) return null;
    const groups = voices(r.measure).flatMap((v) => v.groups).filter((g) => g.indices.some((i) => r.indices.includes(i)));
    if (groups.length < 2 || !groups.every((g) => g.indices.every((i) => r.indices.includes(i)))) return null;
    const trial = clone(r.measure);
    settleVoices(trial);
    const voice = Math.min(...r.indices.map((i) => trial[i].v));
    r.indices.forEach((i) => { trial[i].v = voice; });
    return onsets(trial).every((at, i) => at === starts[i]) ? r : null;
  }

  // Asignacion explicita: probar toda la seleccion antes de tocar el documento.
  function voiceAssignment(score, sel, target) {
    if (!Number.isInteger(target) || target < 1 || target > MAX_VOICE || !sel.length) return null;
    const groups = new Map();
    for (const ref of sel) {
      const staff = staffOf(ref), measure = measures(score, staff)[ref.mi];
      if (!measure?.[ref.i]) return null;
      const key = staff + ':' + ref.mi;
      if (!groups.has(key)) groups.set(key, { measure, trial: clone(measure), indices: new Set(), mi: ref.mi });
      groups.get(key).indices.add(ref.i);
    }
    let changed = false;
    for (const item of groups.values()) {
      const { measure, trial, indices, mi } = item;
      const starts = onsets(measure);
      settleVoices(trial);
      const originalVoices = trial.map(ev => ev.v);
      trial.forEach((ev, i) => { ev.at = starts[i]; });
      indices.forEach((i) => { changed ||= trial[i].v !== target; trial[i].v = target; });
      // No superponer figuras de duracion distinta ni silencios en la misma voz.
      for (let i = 0; i < trial.length; i++) for (let j = i + 1; j < trial.length; j++) {
        if (trial[i].v !== target || trial[j].v !== target) continue;
        if (starts[i] >= starts[j] + length(trial[j]) || starts[j] >= starts[i] + length(trial[i])) continue;
        if (starts[i] !== starts[j] || length(trial[i]) !== length(trial[j]) || trial[i].rest || trial[j].rest) return null;
      }
      settle(trial);
      if (measureLength(trial) > Infinity || trial.some((ev, i) =>
        ev.v !== (indices.has(i) ? target : originalVoices[i]) || ev.at !== starts[i])) return null;
    }
    return changed ? [...groups.values()] : null;
  }

  // Acciones disponibles para una seleccion de figuras [{ mi, i }], en el orden en que se ofrecen.
  function selectionActions(score, sel, activeVoices = []) {
    const actions = [];
    const group = tripletRun(score, sel);
    if (group) actions.push(tupletAction(group.groups.length));
    const loose = untripletRun(score, sel);
    if (loose) actions.push('un' + tupletAction(loose.size));
    const pair = linkPair(score, sel) || chordLinkPair(score, sel);
    if (pair) actions.push(pair.existing ? 'unlink' : 'link');
    const beams = beamRun(score, sel);
    if (beams && beams.joins.some((j) => !j)) actions.push('beam');
    if (beams && beams.joins.some((j) => j)) actions.push('unbeam');
    if (chordSelection(score, sel)) actions.push('joinChord');
    if (lyricMergeRun(score, sel)) actions.push('mergeLyrics');
    [...new Set(activeVoices)].sort((a, b) => a - b).forEach((voice) => {
      if (voiceAssignment(score, sel, voice)) actions.push('assignVoice' + voice);
    });
    return actions;
  }

  function eachEvent(r, group, fn) {
    group.indices.forEach((i) => fn(r.measure[i]));
  }

  // Aplica una de las acciones de `selectionActions`; false si no corresponde o no entra.
  function applySelection(score, sel, action) {
    if (/^assignVoice\d+$/.test(action)) {
      const plan = voiceAssignment(score, sel, Number(action.slice(11)));
      if (!plan) return false;
      plan.forEach(({ measure, trial }) => trial.forEach((ev, i) => { measure[i].v = ev.v; measure[i].at = ev.at; }));
      return true;
    }
    if (action === 'mergeLyrics') return mergeLyrics(score, sel);
    if (!selectionActions(score, sel).includes(action)) return false;
    if (action === 'joinChord') {
      const r = chordSelection(score, sel);
      settleVoices(r.measure);
      const voice = Math.min(...r.indices.map((i) => r.measure[i].v));
      r.indices.forEach((i) => { r.measure[i].v = voice; });
      return true;
    }
    if (/^(triplet|tuplet\d)$/.test(action)) {
      // El orden no cambia: las figuras se acortan y lo que sigue en su voz se adelanta.
      const r = tripletRun(score, sel);
      const size = r.groups.length;
      const id = Math.max(0, ...r.measure.map((ev) => ev.tp || 0)) + 1;
      settle(r.measure);
      r.groups.forEach((g) => {
        eachEvent(r, g, (ev) => { ev.tp = id; if (size === 3) delete ev.tn; else ev.tn = size; });
      });
      settle(r.measure);
      return true;
    }
    if (/^(untriplet|untuplet\d)$/.test(action)) {
      // Las figuras se alargan y lo que sigue en su voz se corre; no se hace si la voz deja de entrar en el compas.
      const r = untripletRun(score, sel);
      settle(r.measure);
      const saved = clone(r.measure);
      r.groups.forEach((g) => eachEvent(r, g, (ev) => { delete ev.tp; delete ev.tn; }));
      if (measureLength(r.measure) > Infinity) {
        r.measure.splice(0, r.measure.length, ...saved);
        return false;
      }
      settle(r.measure);
      return true;
    }
    if (action === 'link' || action === 'unlink') {
      const chord = linkPair(score, sel) ? null : chordLinkPair(score, sel);
      if (chord) {
        const lane = measures(score, chord.staff);
        chord.refs.forEach((ref) => {
          const ev = lane[ref.mi][ref.i];
          delete ev.tie;
          delete ev.slur;
          if (action === 'link') ev.tie = true;
        });
        return true;
      }
      const { from, to, staff } = linkPair(score, sel);
      const lane = measures(score, staff);
      const ev = lane[from.mi][from.i];
      delete ev.tie;
      delete ev.slur;
      if (action === 'link') ev[samePitch(score, staff, from, to) ? 'tie' : 'slur'] = true;
      return true;
    }
    const r = beamRun(score, sel);
    const starts = onsets(r.measure);
    r.groups.slice(0, -1).forEach((g, k) => {
      const right = r.groups[k + 1];
      const auto = autoBeam(r.measure[g.indices[0]], starts[g.indices[0]], r.measure[right.indices[0]], starts[right.indices[0]], { meter: meterAt(score, r.mi) });
      const want = action === 'beam';
      eachEvent(r, g, (ev) => {
        if (want === auto) delete ev.beam;
        else ev.beam = want ? 'join' : 'break';
      });
    });
    return true;
  }

  // Figuras en orden de lectura, para extender la seleccion con el teclado.
  // Compas a compas; dentro de cada uno, el pentagrama de arriba antes que el de abajo.
  function sequence(score) {
    const staves = stavesOf(score);
    return measures(score).flatMap((_, mi) => Array.from({ length: staves }, (__, staff) => {
      const measure = measures(score, staff)[mi];
      const starts = onsets(measure);
      return measure.map((ev, i) => ({ mi, i, staff, at: starts[i] })).sort((a, b) => a.at - b.at || a.i - b.i);
    }).flat()).map(({ mi, i, staff }) => refOf(staff, mi, i));
  }

  // `roles`: { tie: ['start'|'stop'], slur: [...], tuplet: 'start'|'stop'|'both' } de los extremos de esta nota.
  function noteXml(ev, id, beams, chord, voice, alter, roles, stem, mult, staff = 0, lyric = null) {
    const dur = length(ev);
    const base = VALUES[ev.d];
    const ties = (roles && roles.tie) || [];
    const slurs = (roles && roles.slur) || [];
    const tuplet = roles && roles.tuplet;
    let xml = `<note id="${id}">`;
    if (chord) xml += '<chord/>';
    if (ev.rest) {
      xml += Number.isInteger(ev.n) ? `<rest><display-step>${STEPS[ev.n % 7]}</display-step><display-octave>${Math.floor(ev.n / 7) - 1}</display-octave></rest>` : '<rest/>';
    } else {
      xml += `<pitch><step>${STEPS[ev.n % 7]}</step>${alter ? `<alter>${alter}</alter>` : ''}` +
        `<octave>${Math.floor(ev.n / 7) - 1}</octave></pitch>`;
    }
    xml += `<duration>${dur * mult}</duration>${ties.map((type) => `<tie type="${type}"/>`).join('')}` +
      `<voice>${voice}</voice><type>${TYPES[base]}</type>${ev.dot === 2 ? '<dot/><dot/>' : ev.dot ? '<dot/>' : ''}`;
    if (!ev.rest && ev.acc) xml += `<accidental>${ACCIDENTALS[ev.acc].name}</accidental>`;
    if (ev.tp) xml += `<time-modification><actual-notes>${tupletSize(ev)}</actual-notes><normal-notes>${TUPLETS[tupletSize(ev)]}</normal-notes></time-modification>`;
    if (!ev.rest && stem) xml += `<stem>${stem}</stem>`;
    if (!ev.rest && ev.dead) xml += '<notehead>x</notehead>';
    if (staff) xml += `<staff>${staff + 1}</staff>`;
    // La barra pertenece al acorde entero: repetirla en sus notas adicionales hace
    // que Verovio abra/cierre el mismo grupo varias veces y pierda figuras.
    if (beams && !chord) Object.keys(beams).forEach((level) => { xml += `<beam number="${level}">${beams[level]}</beam>`; });
    const marks = ties.map((type) => `<tied type="${type}"/>`).concat(slurs.map((type) => `<slur type="${type}" number="1"/>`));
    if (tuplet) (tuplet === 'both' ? ['start', 'stop'] : [tuplet]).forEach((type) => { marks.push(`<tuplet type="${type}"/>`); });
    if (marks.length) xml += `<notations>${marks.join('')}</notations>`;
    if (lyric) xml += `<lyric number="1"><syllabic>${lyric.syllabic}</syllabic><text>${lyric.text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</text></lyric>`;
    return xml + '</note>';
  }

  // Con varias voces las plicas se separan por convencion: las agudas hacia arriba y la mas grave hacia abajo.
  const stemOf = (voice, count) => (count < 2 ? null : voice < count - 1 ? 'up' : 'down');

  // Reguladores en el compas `mi`: su inicio (con la dinamica de partida) y su fin (con la dinamica de llegada), por tiempo.
  // Si otro empieza justo donde este termina, la dinamica del empalme se escribe una vez, al empezar el siguiente.
  function hairpinMarks(score, mi) {
    const dynamic = (value, at) => (value && !score.dynamics?.[mi]?.some((mark) => mark.at === at) ? `<direction placement="below"><direction-type><dynamics><${value}/></dynamics></direction-type></direction>` : '');
    const wedge = (type) => `<direction placement="below"><direction-type><wedge type="${type}" number="1"/></direction-type></direction>`;
    const all = hairpinList(score);
    const marks = [];
    all.forEach(({ mi: first, h }) => {
      const begin = hairpinBegin(score, first, h), end = hairpinStop(score, first, h);
      const last = hairpinLast(h, first);
      const next = all.find((other) => other.h !== h && hairpinBegin(score, other.mi, other.h) === end);
      const previous = all.find((other) => other.h !== h && hairpinStop(score, other.mi, other.h) === begin);
      let opening;
      if (first === mi) {
        opening = { wedge: true, t: h.at, xml: dynamic(h.startDyn || (previous && previous.h.endDyn), h.at) + wedge(h.kind === 'cresc' ? 'crescendo' : 'diminuendo') };
        marks.push(opening);
      }
      if (last === mi) marks.push({ wedge: true, stop: true, begin: opening, t: Number.isInteger(h.to) ? h.to : capacity(score, mi), xml: wedge('stop') + (next ? '' : dynamic(h.endDyn, Number.isInteger(h.to) ? h.to : capacity(score, mi))) });
    });
    return marks;
  }

  function toMusicXml(score) {
    const all = measures(score);
    const staves = stavesOf(score);
    const clefXml = (name, staff) => {
      const clef = CLEFS[name];
      return `<clef${staves > 1 ? ` number="${staff + 1}"` : ''}><sign>${clef.sign}</sign><line>${clef.line}</line>${clef.octave ? `<clef-octave-change>${clef.octave}</clef-octave-change>` : ''}</clef>`;
    };
    const mult = all.some((measure) => measure.some((ev) => ev.tp && tupletSize(ev) !== 3)) ? MULTIPLIER : 1;
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<score-partwise version="3.1">' +
      (score.title ? '<work><work-title>' + score.title.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</work-title></work>' : '') +
      (score.author ? '<identification><creator type="composer">' + score.author.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</creator></identification>' : '') +
      '<part-list><score-part id="P1"><part-name print-object="no">Guitar</part-name></score-part></part-list><part id="P1">';
    const roles = new Map();
    const roleOf = (ref) => {
      const key = staffOf(ref) + ':' + ref.mi + '-' + ref.i;
      if (!roles.has(key)) roles.set(key, { tie: [], slur: [] });
      return roles.get(key);
    };
    links(score).forEach((link) => {
      roleOf(link.from)[link.type].push('start');
      roleOf(link.to)[link.type].push('stop');
    });
    const rowFirsts = new Set(rowStarts(score));
    const endings = navigationEndings(score);
    const lyricMaps = Array.from({ length: lyricStaves(score) }, (_, staff) => lyricMap(score, staff));
    all.forEach((measure, mi) => {
      const [beats, unit] = meterAt(score, mi).split('/');
      xml += `<measure number="${mi + 1}" id="m${mi}"${capacity(score, mi) < capacity({ meter: meterAt(score, mi) }) ? ' implicit="yes"' : ''}>`;
      if (rowFirsts.has(mi)) xml += '<print new-system="yes"/>';
      if (mi === 0) {
        xml += `<attributes><divisions>${DIVISIONS * mult}</divisions><key><fifths>${fifthsOf(score)}</fifths></key>` +
          `<time><beats>${beats}</beats><beat-type>${unit}</beat-type></time>` +
          (staves > 1 ? `<staves>${staves}</staves>` : '') + Array.from({ length: staves }, (_, staff) => clefXml(clefOf(score, staff), staff)).join('') + '</attributes>';
      }
      if (mi === 0 && tempoValid(score.tempo)) xml += `<direction placement="above"><direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>${score.tempo}</per-minute></metronome></direction-type><sound tempo="${score.tempo}"/></direction>`;
      const clefChanges = Array.from({ length: staves }, (_, staff) => staff).filter((staff) => mi > 0 && clefAt(score, mi, staff) !== clefAt(score, mi - 1, staff));
      if (mi > 0 && (meterAt(score, mi) !== meterAt(score, mi - 1) || keyAt(score, mi) !== keyAt(score, mi - 1) || clefChanges.length)) {
        xml += '<attributes>' + (keyAt(score, mi) !== keyAt(score, mi - 1) ? `<key><fifths>${keyAt(score, mi)}</fifths></key>` : '') +
          (meterAt(score, mi) !== meterAt(score, mi - 1) ? `<time><beats>${beats}</beats><beat-type>${unit}</beat-type></time>` : '') +
          clefChanges.map((staff) => clefXml(clefAt(score, mi, staff), staff)).join('') + '</attributes>';
      }
      const bar = score.barlines && score.barlines[mi];
      const nav = score.navigation?.[mi] || {};
      const endingStart = endings.find((ending) => ending.first === mi);
      const endingStop = endings.find((ending) => ending.last === mi);
      if (bar?.start || endingStart) xml += '<barline location="left">' +
        (endingStart ? `<ending number="${endingStart.number}" type="start"/>` : '') +
        (bar?.start ? '<repeat direction="forward"/>' : '') + '</barline>';
      if (nav.segno) xml += `<direction id="nav-segno-${mi}" placement="above"><direction-type><segno/></direction-type><sound segno="segno"/></direction>`;

      // El segundo pentagrama se escribe despues del primero, rebobinando el compas; sus voces siguen a las del primero.
      let written = 0; // duracion de la ultima voz escrita, para volver al inicio del compas
      const writeStaff = (staff) => {
        const lane = staff ? all.map((_, k) => (score[laneKey(staff)] && score[laneKey(staff)][k]) || []) : all;
        const voiceBase = staff * MAX_VOICE;
        const measure = lane[mi];
        const starts = onsets(measure);
        // Las voces se exportan por separado, pero las alteraciones siguen el orden temporal del compas.
        const accidentals = new Map();
        const alters = [];
        measure.map((ev, i) => i).sort((a, b) => starts[a] - starts[b]).forEach((i) => {
          const ev = measure[i];
          if (!ev.rest && ev.acc) accidentals.set(ev.n, ACCIDENTALS[ev.acc].alter);
          alters[i] = accidentals.has(ev.n) ? accidentals.get(ev.n) : keyAlter(ev.n, score, mi);
        });
        // Reguladores y cejillas son del renglon: se escriben una vez, en el pentagrama de arriba.
        const wedges = staff ? [] : hairpinMarks(score, mi);
        const barre = !staff && score.barres && score.barres[mi];
        // Una cejilla que viene de compases anteriores solo cierra aqui.
        const origin = staff ? undefined : Object.keys(score.barres || {}).map(Number).find((key) => key < mi && barreLast(score.barres[key], key) === mi);
        const closing = origin === undefined ? null : score.barres[origin];
        const stop = (time) => ({ t: time, xml: '<direction placement="above"><direction-type><bracket type="stop" number="1" line-end="none"/></direction-type></direction>' });
        const barreMarks = barre ? [
          { t: barre.at, start: true, xml: `<direction placement="above"><direction-type><words>C ${barre.fret}</words></direction-type></direction>` +
            '<direction placement="above"><direction-type><bracket type="start" number="1" line-end="none" line-type="dashed"/></direction-type></direction>' },
          ...(barre.span ? [] : [stop(Number.isInteger(barre.to) ? barre.to : capacity(score, mi))]),
        ] : closing ? [stop(Number.isInteger(closing.to) ? closing.to : capacity(score, mi))] : [];
        const stopXml = !barre && closing ? barreMarks[0].xml : barreMarks.length > 1 ? barreMarks[1].xml : '';
        // Los acordes tambien son del renglon: se escriben en negrita sobre el pentagrama de arriba, antes de la figura de su tiempo.
        const chordMarks = staff ? [] : ((score.chords && score.chords[mi]) || []).filter((chord) => chord.at < capacity(score, mi)).map((chord) => ({
          // Si no hay figura en su tiempo, el nombre se escribe en un hueco oculto justo ahi, asi que no se amontona con los demas.
          // Solo si cae dentro de una figura (no en su inicio) se apoya en el inicio de esa figura.
          chord: true, t: measure.some((ev, i) => starts[i] < chord.at && chord.at < starts[i] + length(ev)) ? Math.max(0, ...starts.filter((start) => start <= chord.at)) : chord.at, xml: `<direction placement="above"><direction-type><words font-weight="bold" font-style="normal">${chord.name.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</words></direction-type></direction>`,
        }));
        if (!staff) (score.dynamics?.[mi] || []).forEach((mark) => {
          xml += `<direction placement="below"><direction-type><dynamics><${mark.value}/></dynamics></direction-type><offset>${mark.at * mult}</offset></direction>`;
        });
        const marks = barreMarks.concat(wedges, chordMarks).sort((a, b) => a.t - b.t);
        let barreOpen = !barre && Boolean(closing);
        let barreClosed = false;
        const lanes = voices(measure);
        lanes.forEach((voice, vi, all) => {
          // Una voz mas larga que el compas (no entra) no debe correr a las siguientes: se retrocede lo que se escribio.
          if (vi > 0) xml += `<backup><duration>${Math.max(capacity(score, mi), all[vi - 1].end) * mult}</duration></backup>`;
          written = Math.max(capacity(score, mi), voice.end);
          const indices = voice.groups.flatMap((g) => g.indices);
          const events = indices.map((i) => Object.assign({}, measure[i], { at: starts[i] }));
          const beams = beamStates(events, { meter: meterAt(score, mi) });
          const pad = (from, to) => {
            padding(to - from).forEach((size) => {
              xml += `<note print-object="no"><rest/><duration>${size * mult}</duration><voice>${voiceBase + vi + 1}</voice>${TYPES[size] ? `<type>${TYPES[size]}</type>` : ''}${staff ? `<staff>${staff + 1}</staff>` : ''}</note>`;
            });
          };
          // Inicio y fin de la cejilla se escriben en la primera voz con un hueco (o un limite) justo en ese tiempo.
          const hidden = (from, to) => {
            let at = from;
            marks.forEach((mark) => {
              if (mark.done || mark.t < at || mark.t > to || (mark.chord ? false : mark.wedge ? mark.begin && !mark.begin.done : !mark.start && !barreOpen)) return;
              pad(at, mark.t);
              xml += mark.xml;
              at = mark.t;
              mark.done = true;
              if (mark.wedge || mark.chord) return;
              if (mark.start) barreOpen = true;
              else barreClosed = true;
            });
            pad(at, to);
          };
          const tuplets = new Map();
          voice.groups.forEach((group, gi) => {
            const id = measure[group.indices[0]].tp;
            if (id) tuplets.set(id, Object.assign(tuplets.get(id) || { first: gi }, { last: gi }));
          });
          let cursor = 0;
          let index = 0;
          voice.groups.forEach((group, gi) => {
            hidden(cursor, group.at);
            const span = tuplets.get(measure[group.indices[0]].tp);
            group.indices.forEach((i, ci) => {
              const own = roles.get(staff + ':' + mi + '-' + i) || {};
              const tuplet = ci === 0 && span && (span.first === span.last ? 'both' : gi === span.first ? 'start' : gi === span.last ? 'stop' : undefined);
              // La silaba va en la primera voz que tenga una nota en ese tiempo.
              const key = mi + ':' + group.at;
              const lyric = ci === 0 && !measure[i].rest && lyricMaps[staff] && lyricMaps[staff].get(key);
              if (lyric) lyricMaps[staff].delete(key);
              xml += noteXml(measure[i], `${ID_PREFIX[staff]}${mi}-${i}`, beams[index++], ci > 0, voiceBase + vi + 1, alters[i], Object.assign({}, own, { tuplet }), stemOf(vi, all.length), mult, staff, lyric);
            });
            cursor = group.at + group.size;
          });
          hidden(cursor, capacity(score, mi));
          if (barreOpen && !barreClosed && vi === all.length - 1) xml += stopXml;
          // Un regulador abierto se cierra al final aunque su fin no caiga en un hueco de ninguna voz.
          if (vi === all.length - 1) wedges.filter((mark) => mark.stop && !mark.done && (!mark.begin || mark.begin.done)).forEach((mark) => { xml += mark.xml; });
        });
        return lanes.length;
      };
      let wrote = writeStaff(0);
      for (let staff = 1; staff < staves; staff += 1) {
        if (wrote) xml += `<backup><duration>${written * mult}</duration></backup>`;
        wrote = writeStaff(staff);
      }
      if (nav.dc || nav.ds) xml += `<direction id="nav-jump-${mi}" placement="above"><direction-type><words justify="right">${nav.dc ? 'D.C.' : 'D.S.'}</words></direction-type><sound ${nav.dc ? 'dacapo="yes"' : 'dalsegno="segno"'}/></direction>`;
      if (bar?.end || bar?.hidden || bar?.double || endingStop) xml += '<barline location="right">' +
        (bar?.end ? '' : bar?.hidden ? '<bar-style>none</bar-style>' : bar?.double ? '<bar-style>light-light</bar-style>' : '') +
        (endingStop ? `<ending number="${endingStop.number}" type="${endingStop.closed ? 'stop' : 'discontinue'}"/>` : '') +
        (bar?.end ? '<repeat direction="backward"/>' : '') + '</barline>';
      xml += '</measure>';
    });
    return xml + '</part></score-partwise>\n';
  }

  // Nombre de cada figura para el comando `voces` de la consola del navegador.
  const FIGURES = {
    w: ['redonda', 'redondas'], h: ['blanca', 'blancas'], q: ['negra', 'negras'], e: ['corchea', 'corcheas'],
    s: ['semicorchea', 'semicorcheas'], f: ['fusa', 'fusas'],
  };
  const MULTIPLES = { 2: 'doble ', 3: 'triple ' };

  function figureName(ev) {
    const name = FIGURES[ev.d][0] + (ev.dot === 2 ? ' con doble puntillo' : ev.dot ? ' con puntillo' : '');
    return ev.rest ? 'silencio de ' + name : name;
  }

  // Figuras unidas por una barra: "doble corchea" (dos), "triple corchea" (tres), "4 corcheas unidas"; si no son
  // todas iguales, cada una por su nombre.
  function beamedName(evs) {
    const first = evs[0];
    if (!evs.every((ev) => ev.d === first.d && (ev.dot || 0) === (first.dot || 0))) return evs.map(figureName).join(' + ');
    const [one, many] = FIGURES[first.d];
    const dotted = first.dot === 2 ? ' con doble puntillo' : first.dot ? ' con puntillo' : '';
    return MULTIPLES[evs.length] ? MULTIPLES[evs.length] + one + dotted : evs.length + ' ' + many + dotted + ' unidas';
  }

  // Figuras de una voz en orden: un tresillo o una barra cuentan como una sola.
  function voiceFigures(measure, voice, score) {
    const starts = onsets(measure);
    const indices = voice.groups.flatMap((g) => g.indices);
    const beams = beamStates(indices.map((i) => Object.assign({}, measure[i], { at: starts[i] })), { meter: meterAt(score, measures(score).indexOf(measure)) });
    const items = voice.groups.map((g) => ({ ev: measure[g.indices[0]], beam: beams[indices.indexOf(g.indices[0])] }));
    const names = [];
    for (let k = 0; k < items.length; k += 1) {
      const { ev, beam } = items[k];
      let end = k;
      if (ev.tp) {
        while (end + 1 < items.length && items[end + 1].ev.tp === ev.tp) end += 1;
        names.push(TUPLET_NAMES[tupletSize(ev)] + ' de ' + FIGURES[ev.d][1]);
      } else if (beam && beam[1] === 'begin') {
        while (end + 1 < items.length && items[end].beam[1] !== 'end') end += 1;
        names.push(beamedName(items.slice(k, end + 1).map((item) => item.ev)));
      } else {
        names.push(figureName(ev));
      }
      k = end;
    }
    return names;
  }

  // Una linea por voz con las figuras de cada compas separadas por comas y los compases por " | ".
  function voicesText(score) {
    const bars = measures(score).map((measure) => ({ measure, lanes: voices(measure) }));
    while (bars.length && !bars[bars.length - 1].measure.length) bars.pop(); // sin los compases vacios del final
    const count = Math.max(0, ...bars.map((bar) => bar.lanes.length));
    return Array.from({ length: count }, (_, k) => 'voz ' + (k + 1) + ': ' + bars.map(({ measure, lanes }) => (
      lanes[k] ? voiceFigures(measure, lanes[k], score).join(', ') : '-'
    )).join(' | ')).join('\n');
  }

  return {
    voicesText, TUPLETS, tupletSize, DIVISIONS, MEASURE, METERS, CLEFS, GRID, PER_ROW, MIN_ROWS, MAX_VOICE, BOTTOM_LINE, LOWEST, HIGHEST, VALUES, ACCIDENTALS,
    captureTabReferences, restoreTabReferences, copySelection, pasteSelection, patternFrom, patternFromMeasure, applyPattern, cleanPattern, patternDegrees, duplicateVertical, duplicateVoice, fillGaps, voiceNumbers, duplicateSelection, length, dropBrokenTuplets, gridOf, hints, onsets, settle, placement, fillWithRests, leadingRests, opensSection, insertAt, insertMany, placeRest, placeBefore, insertNote, restPitch, settleVoices, mergeVoices, voices, measureLength, clampPitch, emptyRow, emptyScore, clone, measures, rowStarts, rowOf, moveMeasure, addMeasure, insertMeasure, removeMeasure, removeMeasureAt, fits, problems, canDot, dotStart, dotPlan,
    CLEF_KEYS, LANE_KEYS, stavesOf, partsOf, guitarPartsOf, setGuitarParts, voicePerStaff, legendOf, legendsOf, selectedEvents, restructurable, canJoinStaves, joinStaves, splitStaff, registerOf, soundOf, setSound, CHOIR_SOUNDS, intervalModeOf, setIntervalMode, tonicOf, setTonic, setParts, setRegister, REGISTERS, NO_REGISTER, DEFAULT_REGISTERS, MIN_PARTS, MAX_PARTS, ID_PREFIX, get choir() { return choir; }, enableChoir() { choir = true; }, everyMeasure, pruneLower, staffOf, refOf, sameRef, LOWER_CLEF,
    TUNINGS, INSTRUMENTS, refineTempo, MIN_TEMPO, MAX_TEMPO, instrumentOf, setInstrument, setTool, setTempo, setTranspose, transposeOf, transposedForDisplay, MAX_TRANSPOSE, tuningOf, tuningLabels, meterOf, meterAt, clefOf, clefAt, setClef, fifthsOf, bottomLine, keyAt, setKey, pruneKeys, keyAlter, capacity, setMeter, setNavigation, removeNavigation, navigationEndings, playOrder, playSlots, setBarline, removeBarline, setBarre, removeBarre, chordAt, setChord, removeChord, moveChord, MAX_CHORD_NAME, lyricAt, setLyric, moveLyric, mergeLyrics, tiedLyricSpots, removeLyric, nextLyricSpot, lyricSpots, distributeLyrics, lyricStaves, parseLyric, MAX_LYRIC, MAX_CHORD_VARIANTS, HAIRPINS, DYNAMICS, setDynamic, hairpinFits, findHairpin, setHairpin, removeHairpin, setHairpinDynamic, MAX_FRET, sanitize, sanitizeTabs, attacks, toMusicXml,
    links, selectionActions, applySelection, sequence,
  };
}

export default createScoreModel();
