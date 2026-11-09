import { ARCHIVE_CHOIRS } from './choir-sounds.js';
/* score-editor.js — Pagina /partitura: una partitura donde se arrastran notas desde la paleta.
   Verovio dibuja el MusicXML que sale de ScoreModel; aca solo viven la paleta, el arrastre y las descargas. */

// Nothing runs until main.js calls this, once the globals and the saved scores are ready: the file itself can be fetched
// in parallel with them instead of after them.
import { getSetting, setSetting } from './settings.js';
import { chordMarks, hasIntervals, parseTonic, scoreKey, spellTonic, withIntervals } from './score-intervals.js';
import { isPro } from './pro.js';
import { lyricSyllables } from './lyrics-text.js';
import { applyUrlDefaults } from './url-defaults.js';

export default function start({ vendorBase = '/vendor/', bindActions = () => {}, settings = false, chords = false, lyrics = false, patterns = false, urlDefaults = {}, initialDemo } = {}) {

  const M = window.ScoreModel;
  const STORAGE_KEY = 'scoreEditor.v2';
  const LEGACY_KEY = 'scoreEditor.v1'; // guardada con 8 divisiones por negra
  const SCALE = 60;
  // From here the page has side margins (see editor.css) wide enough for the voices legend; the pattern library needs more.
  const WIDE_PAGE = window.matchMedia('(min-width: 900px)');
  const LIBRARY_PAGE = window.matchMedia('(min-width: 1560px)');
  const HISTORY_LIMIT = 100;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const t = JSON.parse(document.getElementById('scoreStrings').textContent);

  const stage = document.getElementById('scoreStage');
  const palette = document.getElementById('scorePalette');
  const barlines = document.getElementById('scoreBarlines');
  const toolbars = document.querySelector('.score-page');
  const addRow = document.getElementById('scoreAddRow');
  const removeRow = document.getElementById('scoreRemoveRow');

  const tabsBar = document.getElementById('scoreTabs');
  const stored = loadAll();
  const docs = stored.scores; // una partitura por pestana
  if (initialDemo) {
    docs.push(Object.assign(M.sanitize(initialDemo.score), { demo: true, demoId: initialDemo.id }));
    stored.active = docs.length - 1;
  }
  // `?score=<uid>` names one stored score; its settings travel in the same URL, so they must not overwrite the others.
  const sharedUid = new URLSearchParams(location.search).get('score');
  if (!sharedUid) docs.forEach((one) => applyUrlDefaults(one, urlDefaults, M));
  const histories = docs.map(() => []);
  let active = stored.active;
  const sharedIndex = sharedUid ? docs.findIndex((one) => one.uid === sharedUid) : -1;
  if (sharedIndex >= 0) {
    active = sharedIndex;
    delete docs[sharedIndex].closed;
  }
  let score = docs[active];
  const defaultTitle = tabsBar.dataset.defaultTitle;
  if (typeof score.title !== 'string') score.title = defaultTitle;
  const title = document.getElementById('scoreTitle'); // el titulo completo, sobre la partitura
  let tabTitle = null; // el input de la pestana activa: el mismo titulo, abreviado por el ancho de la pestana
  title.value = score.title;
  const author = document.getElementById('scoreAuthor');
  author.value = score.author || '';
  author.addEventListener('input', () => {
    if (author.value) score.author = author.value;
    else delete score.author;
    save();
  });
  author.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      author.blur();
    }
  });
  let toolkit = null;
  let selectedMeasure = null; // destino de pegar, independiente de las figuras
  let selectedMeasureStaff = 0; // pentagrama donde se eligio ese compas
  let selectedNavigation = []; // { first, last, mark }: selected return signs or ending spans
  let selectedHairpin = null; // { mi, at }: el regulador elegido (empieza en el compas `mi`, en el tiempo `at`)
  let selected = null; // { mi, i }: la figura principal
  let group = []; // con dos o mas figuras elegidas, todas (incluida la principal)
  let selectedLink = null; // { node, refs }: ligadura elegida sin seleccionar sus notas
  const linkRefs = new WeakMap();
  let selectedBeam = null; // { node, refs }: barrado elegido sin seleccionar sus notas
  let drag = null;
  let activeItem = null;
  let layout = []; // por compas: { left, right, lines: [y1..y5] } relativo al escenario
  let history = [];
  let renderedWidth = 0;
  let tabColumns = {}; // digitacion visible, incluidas las correcciones, antes de editar
  let tabSpace = 0; // unidades de Verovio que se reservan bajo cada renglon para su tablatura
  let focusBarre = null; // compas cuya cejilla recien se coloco: su numero queda en foco

  function loadOne() {
    try {
      const current = localStorage.getItem(STORAGE_KEY);
      if (current) return M.sanitize(JSON.parse(current));
      return M.sanitize(JSON.parse(localStorage.getItem(LEGACY_KEY)), 8);
    } catch (e) {
      return M.emptyScore();
    }
  }

  function loadAll() {
    try {
      const data = window.ScoreStore.stored; // cargado desde IndexedDB antes de arrancar (storage.js)
      // Demos are volatile: any copy persisted by an older version is dropped.
      if (data && Array.isArray(data.scores)) data.scores = data.scores.filter((one) => !(one && one.demo === true));
      if (data && Array.isArray(data.scores) && data.scores.length) {
        // `closed` marks a score taken off the tab strip (Pro); it stays stored and listed in the site menu.
        const scores = data.scores.map((one) => Object.assign(M.sanitize(one), one && one.closed === true ? { closed: true } : {}, one && typeof one.uid === 'string' && /^[\w-]{4,32}$/.test(one.uid) ? { uid: one.uid } : {}, one && one.demo === true ? { demo: true, demoId: one.demoId } : {}));
        const active = Math.min(Math.max(data.active | 0, 0), scores.length - 1);
        delete scores[active].closed;
        return { scores, active };
      }
    } catch (e) {
      // Sin datos validos se parte de la partitura de antes, o de una vacia.
    }
    return { scores: [loadOne()], active: 0 };
  }

  // The address of the open score: its own id plus the settings it shows now. Demos keep their path.
  function syncUrl() {
    if (score.demo) {
      const url = new URL(location.href);
      if (url.searchParams.has('score')) { url.searchParams.delete('score'); window.history.replaceState(window.history.state, '', url); }
      return;
    }
    if (!score.uid) score.uid = Math.random().toString(36).slice(2, 10).padEnd(8, '0');
    const url = new URL(location.href);
    url.searchParams.set('score', score.uid);
    const tools = ['repeats', 'dynamics', 'voices', 'playback', 'intervals'].filter((name) => score.tools && score.tools[name]);
    if (tools.length) url.searchParams.set('tools', tools.join(',').replace('playback', 'play')); else url.searchParams.delete('tools');
    const sound = M.soundOf(score);
    if (sound !== M.CHOIR_SOUNDS[0]) url.searchParams.set('sound', sound === 'mm' ? 'uh' : sound); else url.searchParams.delete('sound');
    if (url.href !== location.href) window.history.replaceState(window.history.state, '', url);
  }

  function save() {
    M.pruneLower(score);
    docs[active] = score;
    syncUrl();
    // Demos live only in this session; they are never written to storage.
    const kept = docs.filter((one) => !one.demo);
    if (!kept.length) return;
    const saved = kept.indexOf(docs[active]);
    const before = docs.slice(0, active).filter((one) => !one.demo).length;
    window.ScoreStore.save({ active: saved >= 0 ? saved : Math.min(before, kept.length - 1), scores: kept });
  }

  // Messages are Radix alert toasts; an empty text leaves any toast to expire on its own.
  function say(text, options = {}) {
    if (text && window.SiteToast) window.SiteToast.show(text, { variant: 'alert', ...options });
  }

  function vendorUrl(file) {
    return new URL(file, new URL(vendorBase, document.baseURI)).href;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = src;
      el.onload = resolve;
      el.onerror = () => reject(new Error(src + ' failed to load'));
      document.head.appendChild(el);
    });
  }

  function newToolkit() {
    return new window.verovio.toolkit();
  }

  // <ascii-tabs> is a separate chunk: it is fetched once the first staff is ready to get its tab, not with the page.
  let tabsReady = null;
  function loadAsciiTabs() {
    return (tabsReady = tabsReady || import('../vendor/ascii-tabs.js'));
  }

  async function loadVerovio() {
    await loadScript(vendorUrl(__VEROVIO_FILE__));
    await new Promise((resolve) => {
      if (window.verovio.module.calledRun) resolve();
      else window.verovio.module.onRuntimeInitialized = resolve;
    });
    toolkit = newToolkit();
  }

  // ---- pestanas -----------------------------------------------------------

  title.addEventListener('input', () => {
    score.title = title.value;
    if (tabTitle) tabTitle.value = score.title;
    renderScoresMenu();
    save();
  });
  title.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      title.blur();
    }
  });

  function tabLabel(one, index) {
    return one.title || t.untitledScore.replace('{n}', index + 1);
  }

  // Pro: a tab can be closed without deleting its score, which the site menu keeps listing so it can be reopened.
  const proTabs = settings && isPro();
  const isOpen = (index) => !proTabs || !docs[index].closed;
  const openCount = () => docs.filter((_, index) => isOpen(index)).length;
  const scoresMenu = document.getElementById('menuScores');
  document.getElementById('menuScoresSection')?.toggleAttribute('hidden', !proTabs);

  function closeButton(index) {
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'score-doc-tab-close';
    close.setAttribute('aria-label', t.closeTab);
    close.innerHTML = lucide('x');
    close.addEventListener('click', (event) => {
      event.stopPropagation();
      closeTab(index);
    });
    return close;
  }

  function renderScoresMenu() {
    if (!proTabs || !scoresMenu) return;
    scoresMenu.replaceChildren(...docs.flatMap((one, index) => {
      if (one.demo) return [];
      const item = document.createElement('li');
      item.setAttribute('role', 'none');
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      button.dataset.index = index;
      if (index === active) button.setAttribute('aria-current', 'true');
      const label = document.createElement('span');
      label.className = 'menu-score-name';
      label.textContent = tabLabel(one, index);
      button.appendChild(label);
      if (index === active) button.insertAdjacentHTML('beforeend', lucide('check'));
      item.appendChild(button);
      return item;
    }));
  }
  scoresMenu?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-index]');
    if (button) openFromMenu(Number(button.dataset.index));
  });

  let enteringTab = -1; // index of the tab just added, animated in by renderTabs
  function renderTabs() {
    document.getElementById('scoreClear').hidden = Boolean(score.demo);
    document.getElementById('scoreDuplicate').hidden = !proTabs || Boolean(score.demo);
    tabsBar.querySelectorAll('.score-doc-tab').forEach((node) => node.remove());
    const add = document.getElementById('scoreNewTab');
    const closable = proTabs && openCount() > 1;
    docs.forEach((one, index) => {
      if (!isOpen(index)) return;
      if (index === active) {
        const wrap = document.createElement('div');
        wrap.className = 'score-doc-tab is-active';
        wrap.setAttribute('aria-current', 'true');
        tabTitle = document.createElement('input');
        tabTitle.type = 'text';
        tabTitle.className = 'score-doc-tab-input';
        tabTitle.setAttribute('aria-label', t.titleLabel);
        tabTitle.value = score.title;
        title.value = score.title;
        author.value = score.author || '';
        tabTitle.addEventListener('input', () => {
          score.title = tabTitle.value;
          title.value = score.title;
          renderScoresMenu();
          save();
        });
        tabTitle.addEventListener('keydown', (event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            tabTitle.blur();
          }
        });
        wrap.appendChild(tabTitle);
        if (closable) {
          wrap.classList.add('has-close');
          wrap.appendChild(closeButton(index));
        }
        wrap.dataset.index = index;
        if (index === enteringTab) wrap.classList.add('is-entering');
        tabsBar.insertBefore(wrap, add);
      } else {
        let button;
        if (closable) {
          // The close button cannot nest in a button: the tab becomes a box holding the label button and the close one.
          button = document.createElement('div');
          button.className = 'score-doc-tab has-close';
          const label = document.createElement('button');
          label.type = 'button';
          label.className = 'score-doc-tab-label';
          label.textContent = tabLabel(one, index);
          button.append(label, closeButton(index));
        } else {
          button = document.createElement('button');
          button.type = 'button';
          button.className = 'score-doc-tab';
          button.textContent = tabLabel(one, index);
        }
        button.addEventListener('click', () => switchTo(index));
        button.dataset.index = index;
        if (index === enteringTab) button.classList.add('is-entering');
        tabsBar.insertBefore(button, add);
      }
    });
    enteringTab = -1;
    renderScoresMenu();
  }

  // Keep document order and undo histories together, without changing the open score.
  let tabDrag = null;
  let suppressTabClick = false;
  function finishTabDrag(commit) {
    if (!tabDrag) return;
    const { from, before, moving } = tabDrag;
    tabDrag = null;
    document.body.classList.remove('score-reordering-tabs');
    if (moving) window.getSelection()?.removeAllRanges();
    tabsBar.classList.remove('is-reordering');
    tabsBar.querySelectorAll('.is-dragging, .drop-before, .drop-after').forEach((node) => {
      node.classList.remove('is-dragging', 'drop-before', 'drop-after');
    });
    if (!moving) return;
    suppressTabClick = true;
    setTimeout(() => { suppressTabClick = false; }, 0);
    if (!commit || before === null) return;
    const to = before > from ? before - 1 : before;
    if (to === from) return;
    docs[active] = score;
    histories[active] = history;
    const order = docs.map((_, index) => index);
    order.splice(to, 0, order.splice(from, 1)[0]);
    const reorderedDocs = order.map((index) => docs[index]);
    const reorderedHistories = order.map((index) => histories[index]);
    active = order.indexOf(active);
    docs.splice(0, docs.length, ...reorderedDocs);
    histories.splice(0, histories.length, ...reorderedHistories);
    save();
    renderTabs();
  }

  tabsBar.addEventListener('dragstart', (event) => event.preventDefault());
  tabsBar.addEventListener('click', (event) => {
    if (suppressTabClick) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);
  tabsBar.addEventListener('pointerdown', (event) => {
    const tab = event.target.closest('.score-doc-tab');
    if (!tab || event.button !== 0 || !event.isPrimary || docs.length < 2) return;
    tabDrag = { from: Number(tab.dataset.index), x: event.clientX, y: event.clientY,
      pointerId: event.pointerId, tab, moving: false, before: null };
  });
  window.addEventListener('pointermove', (event) => {
    if (!tabDrag || event.pointerId !== tabDrag.pointerId) return;
    if (!tabDrag.moving && Math.hypot(event.clientX - tabDrag.x, event.clientY - tabDrag.y) < 6) return;
    tabDrag.moving = true;
    event.preventDefault();
    tabsBar.classList.add('is-reordering');
    document.body.classList.add('score-reordering-tabs');
    window.getSelection()?.removeAllRanges();
    tabDrag.tab.classList.add('is-dragging');
    tabsBar.querySelectorAll('.drop-before, .drop-after').forEach((node) => node.classList.remove('drop-before', 'drop-after'));
    tabDrag.before = null;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.score-doc-tab, #scoreNewTab');
    if (!target || !tabsBar.contains(target)) return;
    if (target.id === 'scoreNewTab') {
      tabDrag.before = docs.length;
      target.classList.add('drop-before');
    } else {
      const box = target.getBoundingClientRect();
      const after = event.clientX >= box.left + box.width / 2;
      tabDrag.before = Number(target.dataset.index) + (after ? 1 : 0);
      target.classList.add(after ? 'drop-after' : 'drop-before');
    }
  }, { passive: false });
  window.addEventListener('pointerup', (event) => {
    if (tabDrag && event.pointerId === tabDrag.pointerId) finishTabDrag(true);
  });
  window.addEventListener('pointercancel', () => finishTabDrag(false));
  window.addEventListener('blur', () => finishTabDrag(false));
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') finishTabDrag(false);
  });

  function switchTo(index) {
    if (index === active || !docs[index]) return;
    docs[active] = score;
    histories[active] = history;
    active = index;
    score = docs[active];
    history = histories[active];
    if (typeof score.title !== 'string') score.title = '';
    clearBarSelection();
    selected = null;
    selectedNavigation = [];
    selectedHairpin = null;
    group = [];
    save();
    renderTabs();
    render();
  }

  function newTab() {
    docs[active] = score;
    histories[active] = history;
    docs.push(applyUrlDefaults(Object.assign(M.emptyScore(), { title: defaultTitle }), urlDefaults, M));
    histories.push([]);
    enteringTab = docs.length - 1;
    switchTo(docs.length - 1);
    tabTitle.focus();
    tabTitle.select();
  }

  function duplicateTab() {
    if (!proTabs || score.demo) return;
    docs[active] = score;
    histories[active] = history;
    const copy = JSON.parse(JSON.stringify(score));
    delete copy.closed;
    delete copy.uid;
    copy.title = (score.title || defaultTitle) + ' ' + t.duplicateSuffix;
    docs.push(copy);
    histories.push([]);
    enteringTab = docs.length - 1;
    switchTo(docs.length - 1);
  }

  // Closing only takes the tab off the strip: the score stays stored, and listed in the site menu.
  function closeTab(index) {
    if (!proTabs || !isOpen(index) || openCount() < 2) return;
    // Demo copies have no entry in the scores menu to reopen them from.
    if (docs[index].demo) {
      if (index === active) switchTo(docs.findIndex((_, i) => i !== index && isOpen(i)));
      docs.splice(index, 1);
      histories.splice(index, 1);
      if (active > index) active -= 1;
      save();
      renderTabs();
      return;
    }
    docs[active] = score;
    histories[active] = history;
    if (index === active) {
      let next = index + 1;
      while (next < docs.length && !isOpen(next)) next += 1;
      if (next >= docs.length) {
        next = index - 1;
        while (!isOpen(next)) next -= 1;
      }
      docs[index].closed = true;
      switchTo(next);
    } else {
      docs[index].closed = true;
      save();
      renderTabs();
    }
  }

  function openFromMenu(index) {
    if (!docs[index]) return;
    if (docs[index].closed) {
      delete docs[index].closed;
      enteringTab = index;
    }
    if (index === active) {
      renderTabs();
      return;
    }
    switchTo(index);
  }

  // ---- edicion ------------------------------------------------------------

  function change(mutate, tabRefs = M.captureTabReferences(score, score.showTabs ? tabColumns : score.tabs)) {
    clearBarSelection();
    selectedBeam = null;
    selectedLink = null;
    // `measures(score, 1)` abre compases vacios del segundo pentagrama para poder editarlos; la copia para deshacer no los lleva.
    const before = M.clone(score);
    M.pruneLower(before);
    if (mutate() === false) return false;
    // `at` queda siempre igual al tiempo que se ve (sin huecos): asi los clics y arrastres siguientes se ubican en el orden.
    M.everyMeasure(score).forEach(M.settle);
    M.pruneLower(score);
    M.restoreTabReferences(score, tabRefs, window.ScoreFingering.complete);
    recordChange(before);
    return true;
  }

  function recordChange(before) {
    history.push(before);
    if (history.length > HISTORY_LIMIT) history.shift();
    save();
    render();
  }

  function undo() {
    if (!history.length) return;
    const tabRefs = M.captureTabReferences(score, score.showTabs ? tabColumns : score.tabs);
    const restored = history.pop();
    const previousTabs = restored.tabs;
    if (M.tuningOf(restored).id === M.tuningOf(score).id) M.restoreTabReferences(restored, tabRefs);
    if (previousTabs) restored.tabs = Object.assign({}, previousTabs, restored.tabs);
    // La visibilidad de TAB se conserva; sus referencias vuelven con las figuras.
    if (score.showTabs) restored.showTabs = true;
    else delete restored.showTabs;
    if (intervalDocuments.has(score)) intervalDocuments.add(restored);
    score = Object.assign(restored, { title: score.title }, score.author ? { author: score.author } : {}, score.uid ? { uid: score.uid } : {});
    clearBarSelection();
    selected = null;
    selectedNavigation = [];
    selectedHairpin = null;
    group = [];
    save();
    render();
  }

  // Una figura se nombra { mi, i } en el pentagrama de arriba y { s: 1, mi, i } en el de abajo; en el SVG, e<mi>-<i> y l<mi>-<i>.
  const staffOf = M.staffOf;
  const same = M.sameRef;
  const laneOf = (ref) => M.measures(score, staffOf(ref));
  const nodeOf = (ref) => stage.querySelector('[id="' + M.ID_PREFIX[staffOf(ref)] + ref.mi + '-' + ref.i + '"]');
  function refOfNode(node) {
    const match = /^([elpq])(\d+)-(\d+)$/.exec(node.id);
    return match ? M.refOf(M.ID_PREFIX.indexOf(match[1]), +match[2], +match[3]) : null;
  }

  function eventAt(sel) {
    return sel && laneOf(sel)[sel.mi] && laneOf(sel)[sel.mi][sel.i];
  }

  function picks() {
    return group.length > 1 ? group : selected ? [selected] : [];
  }

  // Nombres de acorde elegidos con el arrastre de seleccion: [{ mi, at }].
  let selectedChords = [];
  let lyricOnly = false; // la seleccion son silabas: se resaltan ellas, no sus notas, y Suprimir quita solo la letra

  function markChords() {
    stage.querySelectorAll('.score-chord-trigger').forEach((button) => {
      const on = selectedChords.some((c) => c.mi === Number(button.dataset.measure) && c.at === Number(button.dataset.at));
      button.classList.toggle('is-selected', on);
    });
  }

  function setPicks(list, onlyLyrics = false) {
    lyricOnly = onlyLyrics && list.length > 0;
    selectedChords = [];
    selectedNavigation = [];
    selectedHairpin = null;
    selectedBeam = null;
    selectedLink = null;
    if (list.length) clearBarSelection();
    selected = list.length ? list[list.length - 1] : null;
    group = list.length > 1 ? list : [];
    markSelected();
  }

  function markLyrics() {
    const on = lyricOnly ? picks() : [];
    stage.querySelectorAll('.score-lyric-trigger').forEach((button) => {
      const ref = lyricRef(Number(button.dataset.measure), Number(button.dataset.at), Number(button.dataset.staff));
      button.classList.toggle('is-selected', Boolean(ref) && on.some((p) => same(p, ref)));
    });
  }

  // Suma (o quita) una silaba a la seleccion de silabas; `anchor` es la que tenia el campo abierto y pasa a estar elegida.
  function toggleLyricPick(anchor, key) {
    const list = lyricOnly ? picks().slice() : [];
    const anchorRef = anchor && lyricRef(anchor.mi, anchor.at, anchor.staff);
    if (anchorRef && !list.some((p) => same(p, anchorRef))) list.push(anchorRef);
    const ref = lyricRef(key.mi, key.at, key.staff);
    if (ref) {
      const k = list.findIndex((p) => same(p, ref));
      if (k >= 0) list.splice(k, 1);
      else list.push(ref);
    }
    setPicks(list, true);
  }

  function togglePick(ref) {
    const list = picks().slice();
    const k = list.findIndex((p) => same(p, ref));
    if (k >= 0) list.splice(k, 1);
    else list.push(ref);
    setPicks(list);
  }

  // Shift + flechas: suma la figura vecina en orden de lectura; sin Shift, la reemplaza.
  function stepSelection(dir, extend) {
    const list = picks();
    if (!list.length) return;
    const order = M.sequence(score);
    const at = list.map((p) => order.findIndex((o) => same(o, p)));
    const next = order[(dir > 0 ? Math.max(...at) : Math.min(...at)) + dir];
    if (!next || list.some((p) => same(p, next))) return;
    setPicks(extend ? list.concat(next) : [next]);
  }

  function dropNew(item, target) {
    if (item.kind === 'navigation') {
      change(() => M.setNavigation(score, target.mi, item.mark));
      return;
    }
    if (item.kind === 'bar') {
      change(() => {
        const widths = currentMeasureWidths();
        const oldCount = M.measures(score).length;
        const bounds = layout[target.mi];
        const fraction = Math.max(0, Math.min(1, ((target.rawX ?? target.x) - bounds.left) / (bounds.right - bounds.left)));
        const previousWidths = score.measureWidths;
        if (item.bar === 'double') score.measureWidths = widths;
        const changed = M.setBarline(score, target.mi, item.bar, target.rawT ?? target.t);
        if (!changed) {
          if (previousWidths) score.measureWidths = previousWidths;
          else delete score.measureWidths;
        }
        if (changed && M.measures(score).length > oldCount) {
          score.measureWidths[target.mi] = widths[target.mi] * fraction;
          score.measureWidths[target.mi + 1] = widths[target.mi] * (1 - fraction);
        }
        if (changed) { selected = null; group = []; }
        return changed;
      });
      say('');
      return;
    }
    if (item.kind === 'dynamic') {
      change(() => M.setDynamic(score, target.mi, target.onNote ? target.t : 0, item.dynamic));
      say('');
      return;
    }
    if (item.kind === 'hairpin') {
      // Como la cejilla: arranca sobre la nota soltada (o al inicio del compas) y llega hasta el final, o hasta el proximo regulador.
      const at = target.onNote ? target.t : 0;
      const stop = Math.min(M.capacity(score, target.mi), ...((score.hairpins && score.hairpins[target.mi]) || []).filter((h) => h.at > at).map((h) => h.at));
      const placed = change(() => {
        const saved = M.setHairpin(score, target.mi, { kind: item.hairpin, at, to: stop });
        // Con una herramienta activa el regulador nuevo no queda elegido: seleccion y herramienta no conviven.
        if (saved && !activeItem) selectedHairpin = { mi: target.mi, at };
        return saved;
      });
      say(placed ? '' : t.hairpinTaken);
      return;
    }
    if (item.kind === 'lyric') {
      // La silaba va bajo la nota soltada; en piano, solo en el pentagrama de arriba.
      deactivateTool();
      if (!target.onNote) return say(t.lyricNeedsNote);
      if (target.staff >= M.lyricStaves(score)) return say(t.lyricPianoTop);
      if (!startLyricDraft(target.mi, target.t, target.staff)) return say(M.tiedLyricSpots(score, target.staff).has(target.mi + ':' + target.t) ? t.lyricTied : t.lyricNeedsNote);
      say('');
      return;
    }
    if (item.kind === 'chord') {
      // Escribe el nombre sobre la nota soltada (o al inicio del compas); si ya hay uno ahi, abre el suyo.
      startChordDraft(target.mi, target.onNote ? target.t : 0);
      deactivateTool();
      say('');
      return;
    }
    if (item.kind === 'barre') {
      // Sobre una nota que no es la primera arranca ahi; si no, cubre desde el inicio del compas.
      const existing = score.barres && score.barres[target.mi];
      const at = target.onNote ? target.t : 0;
      focusBarre = target.mi;
      if (!change(() => M.setBarre(score, target.mi, at, existing ? existing.fret : 1, existing && (existing.span || existing.to > at) ? existing.to : undefined, existing && existing.span))) focusBarre = null;
      say('');
      return;
    }
    const measure = M.measures(score, target.staff)[target.mi];
    if (item.kind === 'note' || item.kind === 'rest') {
      const ev = { d: item.dead ? lastNoteD : item.d };
      if (item.kind === 'rest') ev.rest = true;
      else ev.n = target.n;
      if (item.dead) ev.dead = true;
      if (Number.isFinite(target.beforeAt)) {
        const placed = M.placeBefore(measure, ev, target.beforeAt, target.n, score, target.mi, target.staff);
        if (!placed.measure) return say(t.full);
        change(() => {
          measure.splice(0, measure.length, ...placed.measure);
          selected = activeItem ? null : M.refOf(target.staff, target.mi, placed.index);
          group = [];
        });
        return;
      }
      const spot = M.placement(measure, ev, target.t, score, target.mi);
      if (!spot) return say(noRoom(ev, target.mi));
      ev.d = spot.d;
      if (spot.dot) ev.dot = true;
      if (item.kind === 'rest') {
        const placed = M.placeRest(measure, ev, spot.at, target.n, score, target.mi, target.beforeFirst, target.staff);
        if (!placed.measure) return say(placed.full ? t.full : fullVoice(placed.voice));
        change(() => {
          measure.splice(0, measure.length, ...placed.measure);
          selected = activeItem ? null : M.refOf(target.staff, target.mi, placed.index);
          group = [];
        });
        return;
      }
      change(() => {
        const index = M.insertNote(measure, ev, spot.at);
        // Con una herramienta activa la figura nueva no queda seleccionada: seleccion y herramienta no conviven.
        selected = activeItem ? null : M.refOf(target.staff, target.mi, index);
        group = [];
      });
    }
  }

  // Las voces se cuentan de arriba abajo; `n` es la voz del click.
  function fullVoice(n) {
    return t.fullVoice.replace('{n}', n);
  }

  // Sin lugar para una figura: o es mas larga que el compas, o repite una nota que ya suena en ese tiempo.
  function noRoom(ev, mi) {
    return t.duplicate;
  }

  function isPlacing(item) {
    return item && (item.kind === 'bar' || item.kind === 'barre' || item.kind === 'chord' || item.kind === 'lyric' || item.kind === 'navigation' || item.kind === 'hairpin' || item.kind === 'dynamic');
  }

  function isModifier(item) {
    return item && (item.kind === 'dot' || item.kind === 'acc');
  }

  function deactivateTool() {
    activeItem = null;
    stage.classList.remove('has-tool');
    clearHoverGhost();
    toolbars.querySelectorAll('.score-palette-tool').forEach((button) => button.setAttribute('aria-pressed', 'false'));
  }

  let lastNoteD = 'q'; // duracion con la que se coloca una nota muerta nueva

  function activateTool(item) {
    if (selectedNavigation.length || selectedBeam || selectedLink || selectedHairpin) { selectedNavigation = []; selectedBeam = null; selectedLink = null; selectedHairpin = null; markSelected(); }
    // Con figuras elegidas, alteraciones, puntillo, figuras y silencios les dan formato sin activar ninguna herramienta del menu.
    const onSelection = (isModifier(item) || item.kind === 'note' || item.kind === 'rest') && picks().some((ref) => eventAt(ref));
    if (onSelection) deactivateTool();
    else {
      if (activeItem === item) { deactivateTool(); return; }
      activeItem = item;
      stage.classList.add('has-tool');
      clearHoverGhost();
      updateHoverGhost();
      toolbars.querySelectorAll('.score-palette-tool').forEach((button) => {
        const same = item.kind === 'navigation' ? button.dataset.navigation === item.mark : item.kind === 'hairpin' ? button.dataset.hairpin === item.hairpin : item.kind === 'dynamic' ? button.dataset.dynamic === item.dynamic : item.key ? button.dataset.shortcut === item.key : item.kind === 'bar' ? button.dataset.barline === item.bar : button.dataset.tool === item.kind;
        button.setAttribute('aria-pressed', String(same));
      });
    }
    if (isPlacing(item)) return;
    if (isModifier(item)) {
      if (item.kind === 'acc' && picks().length > 1) applyAccidentals(item, picks());
      else if (eventAt(selected)) applyModifier(item, selected);
      return;
    }
    // La nota muerta no cambia la duracion: marca (o, si todas ya lo son, desmarca) las notas elegidas.
    if (item.dead) {
      const notes = picks().map((ref) => eventAt(ref)).filter((ev) => ev && !ev.rest);
      if (notes.length) change(() => { const on = !notes.every((ev) => ev.dead); notes.forEach((ev) => { if (on) ev.dead = true; else delete ev.dead; }); });
      return;
    }
    if (item.kind === 'note') lastNoteD = item.d;
    // La figura se aplica a todas las seleccionadas; cada compas se valida entero antes de tocar nada.
    const edits = picks().filter((ref) => {
      const ev = eventAt(ref);
      return ev && !(ev.d === item.d && !!ev.rest === (item.kind === 'rest'));
    }).map((ref) => {
      const ev = eventAt(ref);
      const replacement = Object.assign(M.clone(ev), { d: item.d });
      delete replacement.tp;
      delete replacement.tn;
      if (item.kind === 'rest') { replacement.rest = true; delete replacement.n; delete replacement.acc; delete replacement.dead; }
      else { delete replacement.rest; replacement.n = ev.rest ? M.bottomLine(score, ref.mi, staffOf(ref)) : ev.n; }
      if (item.d === 'w' || item.d === 's' || item.d === 'f') delete replacement.dot;
      else if (replacement.dot === 2 && item.d !== 'h' && item.d !== 'q') replacement.dot = true;
      return { ref, replacement };
    });
    if (!edits.length) return;
    const place = (measure, { ref, replacement }) => {
      measure[ref.i] = Object.assign(replacement, { at: measure[ref.i].at }, Number.isInteger(measure[ref.i].v) ? { v: measure[ref.i].v } : {});
    };
    const measureKey = (ref) => staffOf(ref) + ':' + ref.mi;
    const touched = [...new Set(edits.map((e) => measureKey(e.ref)))];
    change(() => {
      touched.forEach((key) => {
        const here = edits.filter((e) => measureKey(e.ref) === key);
        const measure = laneOf(here[0].ref)[here[0].ref.mi];
        M.settle(measure);
        here.forEach((e) => place(measure, e));
      });
    });
    say('');
  }

  // El puntillo afecta solo a la nota tocada; si hay que correrla, lo que empezaba junto con ella la acompana para seguir alineado.
  function applyModifier(item, hit) {
    const measure = laneOf(hit)[hit.mi];
    const ev = measure[hit.i];
    if (item.kind === 'dot') {
      // Puntillo, doble puntillo y nada, en ese orden; si el doble no entra, se vuelve a la figura sin puntillo.
      if (ev.dot === 2) return change(() => { delete ev.dot; });
      const plan = M.dotPlan(measure, hit.i, score);
      if (!plan && ev.dot) return change(() => { delete ev.dot; });
      if (!plan) return say(ev.d === 'w' || ev.d === 's' || ev.d === 'f' || ev.tp ? t.noDot : t.full);
      const moves = plan.moves.map(([i, at]) => [measure[i], at]);
      return change(() => { M.settle(measure); ev.dot = plan.dot; moves.forEach(([o, at]) => { o.at = at; }); });
    }
    if (ev.rest) return;
    change(() => {
      // Una vez: simple; dos: doble (## o bb); tres: sin alteracion. El becuadro solo se quita.
      const double = { '#': '##', b: 'bb' }[item.acc];
      if (ev.acc === item.acc) { if (double) ev.acc = double; else delete ev.acc; }
      else if (ev.acc === double) delete ev.acc;
      else ev.acc = item.acc;
    });
  }

  // Con varias figuras elegidas la alteracion se aplica a todas: el paso del ciclo lo marca la nota principal.
  function applyAccidentals(item, refs) {
    const notes = refs.map((ref) => eventAt(ref)).filter((ev) => ev && !ev.rest);
    if (!notes.length) return;
    const lead = eventAt(selected);
    const base = lead && !lead.rest ? lead : notes[0];
    const double = { '#': '##', b: 'bb' }[item.acc];
    let next;
    if (base.acc === item.acc) next = double;
    else if (base.acc === double) next = undefined;
    else next = item.acc;
    change(() => notes.forEach((ev) => { if (next) ev.acc = next; else delete ev.acc; }));
  }

  function moveEvent(from, target) {
    const source = laneOf(from);
    const ev = source[from.mi][from.i];
    const destination = M.measures(score, target.staff)[target.mi];
    const crossStaff = staffOf(from) !== target.staff;
    const inPlace = from.mi === target.mi && !crossStaff;
    const others = destination.filter((o) => o !== ev);
    const moved = M.clone(ev);
    ['tp', 'tn', 'tie', 'slur', 'beam'].forEach((key) => { delete moved[key]; });
    // Las voces son de cada pentagrama: al cambiar de pentagrama la figura se acomoda entre las del destino.
    if (crossStaff) delete moved.v;
    if (!ev.rest) moved.n = target.n;
    // Al separar la unica nota de una voz, seguir la columna anterior: una voz
    // vacia volveria a empezar en cero y anularia el desplazamiento horizontal.
    // Las voces con mas figuras conservan su frase al reordenar una nota.
    if (!ev.rest && inPlace && !others.some((o) => o.v === ev.v)) {
      const starts = M.hints(others);
      const previous = others.map((o, i) => ({ ev: o, at: starts[i] }))
        .filter((o) => o.at < target.t)
        .sort((a, b) => b.at - a.at || Math.abs((a.ev.n ?? target.n) - target.n) - Math.abs((b.ev.n ?? target.n) - target.n))[0];
      if (previous) moved.v = previous.ev.v;
    }
    let spot = M.placement(others, moved, target.t, score, target.mi, true);
    // La voz se eligio con el tiempo sin ajustar a la rejilla; si en esa voz no cabe, la figura conserva la suya.
    if (!spot && !crossStaff && moved.v !== ev.v) {
      const kept = Object.assign({}, moved, { v: ev.v });
      spot = M.placement(others, kept, target.t, score, target.mi, true);
      if (spot) moved.v = ev.v;
    }
    if (!spot) return say(noRoom(moved, target.mi));
    moved.d = spot.d;
    if (spot.dot) moved.dot = true;
    else delete moved.dot;
    if (ev.rest) {
      // Un silencio se acomoda segun las notas que suenan a la vez: arrastrarlo arriba o abajo cambia su voz y su altura.
      const placed = M.placeRest(others, moved, spot.at, target.n, score, target.mi, target.beforeFirst, target.staff);
      if (!placed.measure) return say(placed.full ? t.full : fullVoice(placed.voice));
      // Solo, el silencio queda a la altura donde se soltó: se puede bajar para escribir una nota en el centro.
      const landed = placed.measure[placed.index];
      if (!Number.isInteger(landed.n)) landed.n = M.clampPitch(target.n);
      change(() => {
        source[from.mi].splice(from.i, 1);
        destination.splice(0, destination.length, ...placed.measure);
        selected = M.refOf(target.staff, target.mi, placed.index);
        group = [];
      });
      return;
    }
    if (inPlace && Number.isInteger(moved.v)) {
      const starts = M.onsets(destination);
      const kept = destination.flatMap((o, i) => o === ev ? [] : [{ ev: M.clone(o), at: starts[i] }]);
      const trial = kept.map(item => item.ev);
      M.insertAt(trial, M.clone(moved), spot.at);
      const planned = M.onsets(trial);
      // Quitar una coincidencia vertical no debe adelantar otra parte para rellenar
      // el hueco. Hasta representar esas esperas explicitamente, conservar la escritura.
      if (kept.some(item => item.ev.v !== moved.v && planned[trial.indexOf(item.ev)] !== item.at)) return say(t.keepVoiceTiming);
    }
    change(() => {
      source[from.mi].splice(from.i, 1);
      // Alinear con otra columna no convierte la nota movida en parte de su acorde.
      selected = M.refOf(target.staff, target.mi, M.insertAt(destination, moved, spot.at));
      group = [];
    });
  }

  // Mueve las figuras elegidas juntas: el mismo desplazamiento en tiempo, compas y altura que la figura agarrada.
  function moveGroup(refs, from, target) {
    const stave = (staff) => M.measures(score, staff);
    const anchor = eventAt(from);
    const items = refs.map((r) => ({ ev: stave(staffOf(r))[r.mi][r.i], staff: staffOf(r), mi: r.mi, at: M.onsets(stave(staffOf(r))[r.mi])[r.i] }));
    const anchorAt = items.find((x) => x.ev === anchor).at;
    const grid = M.gridOf(items.map((x) => x.ev));
    const dmi = target.mi - from.mi;
    const dstaff = target.staff - staffOf(from);
    const staves = M.stavesOf(score);
    // La nota agarrada puede estar en medio del grupo. Ajustar el desplazamiento
    // al espacio disponible para todo el grupo, tambien al soltar cerca de una barra.
    if (items.some((x) => !stave(0)[x.mi + dmi] || x.staff + dstaff < 0 || x.staff + dstaff >= staves)) return say(t.full);
    const minDt = Math.ceil(Math.max(...items.map((x) => -x.at)) / grid) * grid;
    const maxDt = Math.max(minDt, Math.floor(Math.min(...items.map((x) => M.capacity(score, x.mi + dmi) - x.at - M.length(x.ev))) / grid) * grid);
    const dt = Math.max(minDt, Math.min(maxDt, Math.round((target.t - anchorAt) / grid) * grid));
    const pitched = items.filter((x) => !x.ev.rest);
    let dn = anchor.rest ? 0 : target.n - anchor.n;
    if (pitched.length) {
      dn = Math.max(M.LOWEST - Math.min(...pitched.map((x) => x.ev.n)), Math.min(M.HIGHEST - Math.max(...pitched.map((x) => x.ev.n)), dn));
    }
    if (!dt && !dmi && !dn && !dstaff) return;
    const moving = new Set(items.map((x) => x.ev));
    const plan = items.map((x) => Object.assign({}, x, { to: x.mi + dmi, toStaff: x.staff + dstaff, at: x.at + dt }));
    const destinationKey = (p) => p.toStaff + ':' + p.to;
    const clash = (p) => {
      const rest = stave(p.toStaff)[p.to].filter((o) => !moving.has(o));
      const starts = M.hints(rest); // el lugar de cada una antes de sacar las que se mueven
      return p.at < 0 ||
        (!p.ev.rest && rest.some((o, i) => !o.rest && starts[i] === p.at && o.n === p.ev.n + dn && o.acc === p.ev.acc));
    };
    if (plan.some(clash)) return say(t.full);
    // Contado en orden, cada compas de destino tiene que seguir entrando.
    const trial = new Map();
    const trialOf = (p) => {
      if (!trial.has(destinationKey(p))) trial.set(destinationKey(p), stave(p.toStaff)[p.to].filter((o) => !moving.has(o)).map((o) => Object.assign({}, o)));
      return trial.get(destinationKey(p));
    };
    const trialInserts = new Map();
    plan.slice().sort((a, b) => a.at - b.at).forEach((p) => {
      const ev = Object.assign({}, p.ev);
      if (!ev.rest) ev.n += dn;
      if (p.toStaff !== p.staff) delete ev.v;
      trialOf(p);
      if (!trialInserts.has(destinationKey(p))) trialInserts.set(destinationKey(p), []);
      trialInserts.get(destinationKey(p)).push([ev, p.at]);
    });
    trialInserts.forEach((list, key) => { M.insertMany(trial.get(key), list); });
    change(() => {
      Array.from({ length: staves }, (_, staff) => staff).forEach((staff) => stave(staff).forEach((measure) => {
        for (let i = measure.length - 1; i >= 0; i -= 1) if (moving.has(measure[i])) measure.splice(i, 1);
      }));
      const ids = new Map();
      const inserts = new Map();
      plan.sort((a, b) => a.at - b.at).forEach((p) => {
        const destination = stave(p.toStaff)[p.to];
        if (!p.ev.rest) p.ev.n += dn;
        delete p.ev.tie;
        delete p.ev.slur;
        if (p.toStaff !== p.staff) delete p.ev.v;
        if (p.ev.tp) {
          const key = p.staff + ':' + p.mi + '-' + p.ev.tp;
          if (!ids.has(key)) ids.set(key, Math.max(0, ...destination.map((o) => o.tp || 0)) + 1);
          p.ev.tp = ids.get(key);
        }
        if (!inserts.has(destinationKey(p))) inserts.set(destinationKey(p), { destination, list: [] });
        inserts.get(destinationKey(p)).list.push([p.ev, p.at]);
      });
      // Todas juntas por compas: las que quedan conservan su lugar en el orden hasta que entran las movidas.
      inserts.forEach(({ destination, list }) => { M.insertMany(destination, list); });
      const refsAfter = plan.map((p) => M.refOf(p.toStaff, p.to, stave(p.toStaff)[p.to].indexOf(p.ev)));
      selected = refsAfter[refsAfter.length - 1];
      group = refsAfter.length > 1 ? refsAfter : [];
    });
  }

  function removeSelected() {
    if (lyricOnly && picks().length) {
      const refs = picks();
      setPicks([]);
      change(() => refs.map((ref) => {
        const staff = M.staffOf(ref);
        return M.removeLyric(score, ref.mi, M.onsets(M.measures(score, staff)[ref.mi])[ref.i], staff);
      }).some(Boolean));
      return;
    }
    if (selectedChords.length) {
      const chords = selectedChords;
      selectedChords = [];
      if (chordPopup) chordPopup.hidePopover();
      change(() => chords.map(({ mi, at }) => M.removeChord(score, mi, at)).some(Boolean));
      return;
    }
    if (selectedHairpin) {
      const { mi, at } = selectedHairpin;
      change(() => {
        const h = M.findHairpin(score, mi, at);
        selectedHairpin = null;
        return h ? M.removeHairpin(score, mi, h) : false;
      });
      return;
    }
    if (selectedNavigation.length) {
      change(() => {
        selectedNavigation.forEach(({ first, last, mark }) => {
          for (let mi = first; mi <= last; mi += 1) M.removeNavigation(score, mi, mark);
        });
        selectedNavigation = [];
      });
      return;
    }
    if (selectedLink) {
      const refs = selectedLink.refs;
      change(() => M.applySelection(score, refs, 'unlink'));
      return;
    }
    if (selectedBeam) {
      const refs = selectedBeam.refs;
      change(() => M.applySelection(score, refs, 'unbeam'));
      return;
    }
    const list = picks().filter(eventAt);
    if (!list.length) return;
    change(() => {
      list.sort((a, b) => staffOf(b) - staffOf(a) || b.mi - a.mi || b.i - a.i).forEach((p) => laneOf(p)[p.mi].splice(p.i, 1));
      selected = null;
      group = [];
    });
  }

  function shiftSelected(delta, duplicate = false) {
    const list = picks().filter((p) => eventAt(p));
    if (!list.length) return;
    if (duplicate) {
      const trial = M.clone(score);
      const created = M.duplicateVertical(trial, list, delta);
      if (!created?.length) { say(t.verticalDuplicateUnavailable); return; }
      change(() => {
        Object.assign(score, trial);
        selected = created[created.length - 1];
        group = created.length > 1 ? created : [];
      });
      say('');
      return;
    }
    // Un silencio sin altura propia esta en el centro del pentagrama.
    change(() => { list.forEach((p) => { const ev = eventAt(p); ev.n = M.clampPitch((Number.isInteger(ev.n) ? ev.n : M.bottomLine(score, p.mi, staffOf(p)) + 4) + delta); }); });
  }

  function applyAction(action) {
    const list = picks();
    const result = change(() => M.applySelection(score, list, action));
    if (!result) say(action.startsWith('assignVoice') ? t.voicesUnavailable : action === 'mergeLyrics' ? t.lyricMergeLong : t.full);
    else { say(''); if (action === 'mergeLyrics') setPicks([]); }
    stage.focus({ preventScroll: true });
  }

  // ---- dibujo -------------------------------------------------------------

  function layoutOptions(width, extra) {
    return Object.assign({
      scale: SCALE,
      pageWidth: Math.round(width * 100 / SCALE),
      adjustPageHeight: true,
      breaks: 'encoded',
      header: 'none',
      footer: 'none',
      svgViewBox: true,
      pageMarginLeft: 60,
      pageMarginRight: 60,
      pageMarginTop: 60,
      pageMarginBottom: 60,
      minLastJustification: 0,
      justifyVertically: false,
      spacingSystem: 12,
      mnumInterval: 0,
    }, extra);
  }

  // Both toolbars use the unannotated staff position so interval labels cannot move them.
  let toolbarStaffTop = 0;
  // The barlines sidebar starts level with the top line of the first staff instead of the top of the page.
  function alignBarlinesToFirstStaff() {
    const side = barlines.closest('.score-side');
    const line = stage.querySelector('g.staff > path');
    const glyph = barlines.firstElementChild?.querySelector('svg') || barlines.firstElementChild;
    if (!side || !line || !glyph) return;
    // Measured in its natural position: while sticky, the scroll shifts the glyph and the offset drifts whenever the stage height changes (TAB).
    side.style.position = 'relative';
    side.style.top = 'auto';
    side.style.marginTop = '0';
    side.style.zoom = '';
    const offset = stage.getBoundingClientRect().top + toolbarStaffTop - glyph.getBoundingClientRect().top;
    // The toolbar stays sticky and shrinks to fit the viewport below its sticky offset.
    const room = window.innerHeight - parseFloat(getComputedStyle(document.documentElement).fontSize) * 6 - 16;
    if (side.offsetHeight > room) side.style.zoom = String(Math.max(0.5, room / side.offsetHeight));
    side.style.position = '';
    side.style.top = '';
    side.style.marginTop = Math.max(0, offset) + 'px';
    alignVoiceLegend();
  }

  // Playback and voices sit to the left of the first staff and never take width from the sheet: on wide screens the toolbar
  // goes in the page margin outside the stage; on narrow ones, in the staff's own left margin (left of the clef or brace).
  function alignVoiceLegend() {
    const line = stage.querySelector('g.staff > path');
    if (!line) return;
    const origin = stage.getBoundingClientRect();
    const staffTop = toolbarStaffTop;
    // Left of the brace (grand staff) or of the first staff line, never over it.
    const edge = (stage.querySelector('g.grpSym') || line).getBoundingClientRect().left - origin.left;
    const playbackShown = playButton.isConnected && !playButton.hidden;
    const playbackHeight = playbackShown ? playButton.offsetHeight : 0;
    const legendHeight = voiceLegend.isConnected ? voiceLegend.offsetHeight : 0;
    const intervalsHeight = intervalButton.isConnected ? intervalButton.offsetHeight : 0;
    const chordNamesHeight = chordNamesButton.isConnected ? chordNamesButton.offsetHeight : 0;
    const restructureButtons = [joinButton, splitButton].filter((button) => button.isConnected);
    const restructureHeight = restructureButtons.reduce((sum, button) => sum + button.offsetHeight + (sum ? 8 : 0), 0);
    const duplicateShown = duplicateVoiceButtons.filter((button) => button.isConnected);
    const duplicateHeight = duplicateShown.reduce((sum, button, k) => sum + button.offsetHeight + (k ? 8 : 0), 0);
    const legendEnd = playbackHeight + (playbackShown && legendHeight ? 8 : 0) + legendHeight;
    const restructureEnd = legendEnd + (restructureHeight ? restructureHeight + (legendEnd ? 8 : 0) : 0);
    const above = restructureEnd + (duplicateHeight ? duplicateHeight + (restructureEnd ? 8 : 0) : 0);
    const withChords = above + (chordNamesHeight ? chordNamesHeight + (above ? 8 : 0) : 0);
    const height = withChords + (intervalsHeight ? intervalsHeight + (withChords ? 8 : 0) : 0);
    // Follow the right toolbar's sticky offset, stopping at the end of the sheet.
    // Keep the natural position in short viewports, where the right toolbar also scrolls with the page.
    const side = barlines.closest('.score-side');
    const stickyTop = side ? parseFloat(getComputedStyle(side).top) : NaN;
    const top = Number.isFinite(stickyTop)
      ? Math.max(staffTop, Math.min(stickyTop - origin.top, origin.height - height))
      : staffTop;
    const width = Math.max(playbackShown ? playButton.offsetWidth : 0, voiceLegend.isConnected ? voiceLegend.offsetWidth : 0, ...restructureButtons.map((button) => button.offsetWidth), ...duplicateShown.map((button) => button.offsetWidth), intervalButton.isConnected ? intervalButton.offsetWidth : 0, chordNamesButton.isConnected ? chordNamesButton.offsetWidth : 0);
    const left = WIDE_PAGE.matches ? -(width + 16) : Math.max(0, edge - width - 6);
    if (playbackShown) {
      playButton.style.top = top + 'px';
      playButton.style.left = (left + (width - playButton.offsetWidth) / 2) + 'px';
    }
    voiceLegend.style.top = (top + (playbackShown ? playButton.offsetHeight + 14 : 0)) + 'px';
    voiceLegend.style.left = (left + (width - voiceLegend.offsetWidth) / 2) + 'px';
    let restructureTop = top + (playbackShown ? playButton.offsetHeight + 14 : 0) + legendHeight + (legendHeight ? 8 : 0);
    restructureButtons.forEach((button) => {
      button.style.top = restructureTop + 'px';
      button.style.left = (left + (width - button.offsetWidth) / 2) + 'px';
      restructureTop += button.offsetHeight + 8;
    });
    let duplicateTop = top + restructureEnd + (restructureEnd ? 8 : 0);
    duplicateShown.forEach((button) => {
      button.style.top = duplicateTop + 'px';
      button.style.left = (left + (width - button.offsetWidth) / 2) + 'px';
      duplicateTop += button.offsetHeight + 8;
    });
    intervalButton.style.top = (top + height - intervalsHeight) + 'px';
    intervalButton.style.left = (left + (width - intervalButton.offsetWidth) / 2) + 'px';
    chordNamesButton.style.top = (top + height - intervalsHeight - (intervalsHeight ? 8 : 0) - chordNamesHeight) + 'px';
    chordNamesButton.style.left = (left + (width - chordNamesButton.offsetWidth) / 2) + 'px';
  }

  let leftToolbarFrame = 0;
  function scheduleLeftToolbarAlignment() {
    if (leftToolbarFrame) return;
    leftToolbarFrame = requestAnimationFrame(() => {
      leftToolbarFrame = 0;
      alignVoiceLegend();
    });
  }
  window.addEventListener('scroll', scheduleLeftToolbarAlignment, { passive: true });
  window.addEventListener('resize', scheduleLeftToolbarAlignment);
  window.addEventListener('resize', () => alignBarlinesToFirstStaff());

  function render() {
    // Editing, voices, tempo or sound never stop playback: the schedule is rebuilt and the position kept.
    if (playbackState !== 'idle') {
      if (playbackDocument !== score) resetPlayback();
      else if (playbackSnapshot !== playbackSnapshotOf(score)) {
        const loose = (json) => { const copy = JSON.parse(json); delete copy.sound; delete copy.tempo; return JSON.stringify(copy); };
        const changed = loose(playbackSnapshot) !== loose(playbackSnapshotOf(score));
        playbackSnapshot = playbackSnapshotOf(score);
        // Before the first sound starts there is no position to keep: a content change cancels the pending start.
        if (playbackState === 'loading' && changed) resetPlayback();
        else if (playbackTrack) refreshPlaybackTrack();
      }
    }
    if (!toolkit) return;
    const width = stage.clientWidth;
    if (!width) return;
    renderedWidth = width;
    toolkit.setOptions(layoutOptions(width, score.showTabs && tabSpace ? { spacingSystem: Math.min(48, 12 + tabSpace), pageMarginBottom: 60 + tabSpace } : undefined));
    const xml = M.toMusicXml(score);
    toolkit.loadData(xml);
    tuningPopup.hidePopover();
    meterPopup.hidePopover();
    clefPopup.hidePopover();
    registerPopup.hidePopover();
    dynamicsPopup.hidePopover();
    stage.innerHTML = M.refineTempo(toolkit.renderToSVG(1));
    toolbarStaffTop = Math.max(0, stage.querySelector('g.staff > path').getBoundingClientRect().top - stage.getBoundingClientRect().top);
    const showIntervals = intervalDocuments.has(score);
    const showChords = proChordNames && chordNameDocuments.has(score);
    if (settings && toolOn('voices', false) && toolOn('intervals', false) && (showIntervals || showChords)) {
      toolkit.loadData(withIntervals(xml, score, M, shownVoices.size ? shownVoices : null, { intervals: showIntervals, chords: showChords }));
      // Verovio drops MusicXML words' font-size. Set MEI's supported relative size
      // on the marked interval text before engraving so spacing uses the smaller labels too.
      toolkit.loadData(toolkit.getMEI().replace(/fontfam="PartituraIntervals"/g, 'fontsize="60%"').replace(/fontfam="PartituraChordNames"/g, 'fontsize="75%"'));
      stage.innerHTML = M.refineTempo(toolkit.renderToSVG(1));
    }
    applyMeasureWidths();
    // With TAB the height is set again once the tabs are measured; clearing it here would collapse and re-grow the stage on every pass.
    if (!score.showTabs) stage.style.minHeight = '';
    alignBarlinesToFirstStaff();
    marker = null;
    const svg = stage.querySelector('svg');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', t.scoreLabel);
    mountMeterButton();
    mountClefButtons();
    mountRegisterButtons();
    mountKeyButtons();
    liftBarreMarks(svg);
    placeIntervals(svg);
    placeChordNames(svg);
    measureLayout();
    mountNavigationMarks();
    mountLinks();
    mountBarlineButtons();
    markMeasureBars();
    mountRowTools();
    mountBarreInputs();
    mountChords();
    mountLyrics();
    mountTabs();
    document.getElementById('scoreTabToggle')?.setAttribute('aria-pressed', String(!!score.showTabs));
    applyTools();
    applyVoices();
    if (playbackState === 'playing' || playbackState === 'paused') {
      measurePlayback();
      drawPlaybackCursor();
    }
    markSelected();
    drawPlaybackHint();
    updateHoverGhost();
    removeRow.hidden = score.rows.length <= M.MIN_ROWS;
  }

  // El espaciado se aplica al SVG; las figuras conservan su tamano y las plicas anclan los haces.
  let naturalLayout = [];
  function applyMeasureWidths() {
    const nodes = [...stage.querySelectorAll('g.measure')];
    naturalLayout = nodes.map((node) => {
      const staff = node.querySelector(':scope > g.staff > path');
      const box = staff.getBBox();
      return { left: box.x, width: box.width, pixels: staff.getBoundingClientRect().width };
    });
    M.rowStarts(score).forEach((first, row) => {
      const count = score.rows[row].length;
      const original = naturalLayout.slice(first, first + count);
      const total = original.reduce((sum, m) => sum + m.width, 0);
      const weights = original.map((m, i) => score.measureWidths?.[first + i]);
      const assigned = weights.reduce((sum, w) => sum + (w || 0), 0);
      const free = original.reduce((sum, m, i) => sum + (weights[i] ? 0 : m.width), 0);
      const desired = original.map((m, i) => weights[i] ? weights[i] * total : m.width * Math.max(0.1, 1 - assigned) * total / (free || total));
      const sum = desired.reduce((a, b) => a + b, 0);
      const fit = sum > total ? total / sum : 1;
      let left = original[0].left;
      const positions = desired.map((width) => {
        const position = { left, width: width * fit };
        left += position.width;
        return position;
      });
      const mapX = (x) => {
        let index = original.findIndex((m) => x <= m.left + m.width);
        if (index < 0) index = original.length - 1;
        return positions[index].left + (x - original[index].left) * positions[index].width / original[index].width;
      };
      original.forEach((m, i) => {
        const node = nodes[first + i];
        const width = positions[i].width;
        const left = positions[i].left;
        const scale = width / m.width;
        if (Math.abs(scale - 1) > 0.00001 || Math.abs(left - m.left) > 0.01) {
          node.setAttribute('transform', `translate(${left - scale * m.left} 0) scale(${scale} 1)`);
          node.querySelectorAll('g.chord, g.note, g.rest, g.clef, g.keySig, g.meterSig, g.barLine, g.repeatMark, g.accid, g.dots, g.dynam, text').forEach((glyph) => {
            if (glyph.parentElement.closest('.chord, .note, .rest, .clef, .keySig, .meterSig, .barLine, .repeatMark, .accid, .dots, .dynam, text')) return;
            const stem = glyph.querySelector('.stem path');
            const box = glyph.getBBox();
            const x = stem ? stem.getBBox().x : box.x;
            const transform = glyph.getAttribute('transform') || '';
            glyph.setAttribute('transform', `translate(${x} 0) scale(${1 / scale} 1) translate(${-x} 0) ${transform}`);
          });
        }
        // Las ligaduras, cejillas y reguladores pueden terminar en otro compas, con una escala diferente.
        node.querySelectorAll('g.tie, g.slur, g.bracketSpan, g.hairpin').forEach((span) => {
          span.setAttribute('transform', `translate(${(scale * m.left - left) / scale} 0) scale(${1 / scale} 1)`);
          span.querySelectorAll('path').forEach((path) => {
            const d = path.getAttribute('d');
            if (!d || (d.match(/[a-z]/gi) || []).some((command) => !['M', 'L', 'C', 'Q', 'Z'].includes(command))) return;
            let coordinate = 0;
            path.setAttribute('d', d.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, (number) => coordinate++ % 2 ? number : mapX(Number(number))));
          });
          // Los reguladores son polilineas: "x,y x,y x,y".
          span.querySelectorAll('polyline').forEach((line) => {
            line.setAttribute('points', (line.getAttribute('points') || '').replace(/(-?\d*\.?\d+),/g, (match, x) => mapX(Number(x)) + ','));
          });
        });
      });
      const system = nodes[first].closest('g.system');
      const spans = M.navigationEndings(score).filter((ending) => ending.first < first + count && ending.last >= first);
      system.querySelectorAll('g.ending .voltaBracket').forEach((bracket, index) => {
        const span = spans[index];
        const line = bracket.querySelector('path');
        if (!span || !line) return;
        const start = Math.max(first, span.first) - first;
        const end = Math.min(first + count - 1, span.last) - first;
        const box = line.getBBox();
        // Keep the clef clearance and small barline gaps at their original size.
        const left = positions[start].left + box.x - original[start].left;
        const right = positions[end].left + positions[end].width + box.x + box.width - original[end].left - original[end].width;
        const bracketX = (x) => left + (x - box.x) * (right - left) / box.width;
        bracket.querySelectorAll('path').forEach((path) => {
          let coordinate = 0;
          path.setAttribute('d', path.getAttribute('d').replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi,
            (number) => coordinate++ % 2 ? number : bracketX(Number(number))));
        });
        bracket.querySelectorAll('text[x]').forEach((text) => text.setAttribute('x', left + Number(text.getAttribute('x')) - box.x));
      });
    });
  }

  function currentMeasureWidths() {
    const widths = {};
    M.rowStarts(score).forEach((first, row) => {
      const count = score.rows[row].length;
      const total = naturalLayout.slice(first, first + count).reduce((sum, m) => sum + m.pixels, 0);
      for (let i = first; i < first + count; i += 1) widths[i] = Math.min(1, (layout[i].right - layout[i].left) / total);
    });
    return widths;
  }

  function mountBarResize(button, mi, side) {
    const boundary = side === 'start' ? mi - 1 : mi;
    if (boundary < M.rowOf(score, mi).first) return;
    button.classList.add('is-resizable');
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const start = event.clientX;
      const row = M.rowOf(score, boundary);
      const left = layout[boundary];
      const right = boundary < row.last ? layout[boundary + 1] : null;
      const widths = currentMeasureWidths();
      const total = naturalLayout.slice(row.first, row.last + 1).reduce((sum, m) => sum + m.pixels, 0);
      const minLeft = Math.min(left.right - left.left, boundary === row.first ? 100 : 48);
      const minRight = right ? Math.min(right.right - right.left, 48) : 0;
      const rowRight = layout[row.first].left + total;
      let delta = 0, moved = false, cancelled = false;
      const preview = document.createElement('div');
      preview.className = 'score-width-guide';
      preview.style.top = left.top - 16 + 'px';
      preview.style.height = left.bottom - left.top + 32 + 'px';
      const move = (e) => {
        if (e.pointerId !== event.pointerId) return;
        if (Math.abs(e.clientX - start) < 4 && !moved) return;
        if (!moved) deactivateTool(); // El ajuste usa su guia limitada, no el phantom de insercion.
        moved = true;
        delta = Math.max(left.left + minLeft - left.right, Math.min((right ? right.right - minRight : rowRight) - left.right, e.clientX - start));
        preview.style.left = left.right + delta + 'px';
        if (!preview.isConnected) stage.appendChild(preview);
      };
      const finish = (e) => {
        if (e.pointerId !== event.pointerId) return;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('keydown', escape);
        preview.remove();
        if (moved) {
          button.addEventListener('click', (click) => { click.preventDefault(); click.stopImmediatePropagation(); }, { once: true, capture: true });
          if (!cancelled && Math.abs(delta) > 0.01) change(() => {
            widths[boundary] += delta / total;
            if (right) widths[boundary + 1] -= delta / total;
            score.measureWidths = widths;
          });
        }
      };
      const cancel = (e) => { cancelled = true; finish(e); };
      const escape = (e) => { if (e.key === 'Escape') cancel({ pointerId: event.pointerId }); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('keydown', escape);
    });
  }

  // Verovio pega la cejilla (letra y linea) al pentagrama; se sube un poco para que respire.
  const BARRE_LIFT = 10;
  const DYNAMIC_DROP = 16;
  const DYNAMIC_GAP = 6; // separacion extra entre una dinamica y su regulador
  const DYNAMIC_SCALE = 0.72;
  function liftBarreMarks(svg) {
    svg.querySelectorAll('g.measure g.dir, g.measure g.bracketSpan').forEach((node) => {
      if (isIntervalDir(node)) return;
      const scale = node.getScreenCTM() && node.getScreenCTM().a;
      if (scale) node.setAttribute('transform', 'translate(0 ' + (-BARRE_LIFT / scale) + ') ' + (node.getAttribute('transform') || ''));
    });
    // Reguladores y dinamicas van bajo el pentagrama: se bajan para no quedar pegados a el.
    svg.querySelectorAll('g.measure g.hairpin, g.measure g.dynam').forEach((node) => {
      const scale = node.getScreenCTM() && node.getScreenCTM().a;
      if (scale) node.setAttribute('transform', 'translate(0 ' + (DYNAMIC_DROP / scale) + ') ' + (node.getAttribute('transform') || ''));
    });
    // Las dinamicas se achican (sobre su centro) y se apartan del regulador que acompanan.
    const hairpins = [...svg.querySelectorAll('g.hairpin')].map((node) => node.getBoundingClientRect());
    [...svg.querySelectorAll('g.measure g.dynam')].forEach((node) => {
      const box = node.getBoundingClientRect();
      const parent = node.parentNode.getScreenCTM();
      if (!parent || !box.width) return;
      const reach = box.height;
      const before = hairpins.some((h) => Math.abs(box.right - h.left) < reach && Math.abs(box.top + box.height / 2 - (h.top + h.height / 2)) < reach);
      const after = hairpins.some((h) => Math.abs(box.left - h.right) < reach && Math.abs(box.top + box.height / 2 - (h.top + h.height / 2)) < reach);
      const centre = new DOMPoint(box.left + box.width / 2, box.top + box.height / 2).matrixTransform(parent.inverse());
      const shift = (after && !before ? DYNAMIC_GAP : before && !after ? -DYNAMIC_GAP : 0) / parent.a;
      node.setAttribute('transform', 'translate(' + shift + ' 0) translate(' + centre.x + ' ' + centre.y + ') scale(' + DYNAMIC_SCALE + ') translate(' + -centre.x + ' ' + -centre.y + ') ' + (node.getAttribute('transform') || ''));
    });
  }

  function measureLayout() {
    const origin = stage.getBoundingClientRect();
    layout = [...stage.querySelectorAll('g.measure')].map((node) => {
      // Las cinco lineas de cada pentagrama del compas, de arriba abajo. `lines` es las del primero.
      const staves = [...node.querySelectorAll(':scope > g.staff')].map((staff) => [...staff.querySelectorAll(':scope > path')].slice(0, 5).map((p) => {
        const r = p.getBoundingClientRect();
        return (r.top + r.bottom) / 2 - origin.top;
      }));
      const lines = staves[0];
      const box = node.querySelector(':scope > g.staff > path').getBoundingClientRect();
      // Donde empieza la musica: pasada la clave, la armadura y el compas que preceden a la primera figura.
      const start = Math.max(box.left, ...[...node.querySelectorAll('g.clef, g.keySig, g.meterSig')].map((g) => g.getBoundingClientRect().right));
      // La primera figura se dibuja un espacio mas alla de la barra o de la armadura.
      // `top` y `bottom` abarcan todo el renglon: lo que es de los dos pentagramas (barras, repeticiones) se mide con ellos.
      return { left: box.left - origin.left, start: start - origin.left + (lines[4] - lines[0]) / 4, right: box.right - origin.left, lines, staves, top: lines[0], bottom: staves[staves.length - 1][4] };
    });
  }

  // Pentagrama del renglon que esta a la altura `y` (relativa al escenario): el mas cercano a su centro.
  function staffAtY(m, y) {
    const centers = m.staves.map((lines) => lines[2]);
    return centers.reduce((best, center, staff) => (Math.abs(y - center) < Math.abs(y - centers[best]) ? staff : best), 0);
  }

  function clearBarSelection() {
    selectedMeasure = null;
    stage.querySelectorAll('.is-bar-selected').forEach((node) => node.classList.remove('is-bar-selected'));
    stage.querySelectorAll('.score-insert-measure').forEach((button) => button.remove());
    stage.querySelectorAll('.score-barline-trigger').forEach((button) => button.setAttribute('aria-pressed', 'false'));
  }

  document.addEventListener('pointerdown', (event) => {
    if (!event.target.closest('.score-barline-trigger, .score-insert-measure, .score-library')) clearBarSelection();
  });

  function removeSelectedBars() {
    const bars = [...stage.querySelectorAll('.score-barline-trigger[aria-pressed="true"]')]
      .map((button) => ({ mi: Number(button.dataset.measure), side: button.dataset.side }));
    if (!bars.length) return false;
    // Un compas elegido (sus barras estan resaltadas por eso) se borra entero; una barra elegida sola, no.
    if (selectedMeasure !== null) {
      const mi = selectedMeasure;
      change(() => { selected = null; return M.removeMeasureAt(score, mi); });
      clearBarSelection();
      return true;
    }
    change(() => bars.forEach(({ mi, side }) => M.removeBarline(score, mi, side)));
    return true;
  }

  // Un compas elegido es el destino del pegado; sus barras visibles se resaltan.
  function selectMeasureBars(event) {
    const origin = stage.getBoundingClientRect();
    const mi = layout.findIndex((m) => event.clientX >= origin.left + m.left && event.clientX <= origin.left + m.right &&
      event.clientY >= origin.top + m.top && event.clientY <= origin.top + m.bottom);
    if (mi < 0) return;
    clearBarSelection();
    selectedMeasure = mi;
    selectedMeasureStaff = staffAtY(layout[mi], event.clientY - origin.top);
    rememberPlaybackMeasure(mi);
    markMeasureBars();
  }

  function markMeasureBars() {
    const mi = selectedMeasure;
    if (mi === null || !layout[mi]) return;
    const sides = [];
    if (score.barlines?.[mi]?.start) sides.push([mi, 'start']);
    else if (mi > M.rowOf(score, mi).first) sides.push([mi - 1, 'end']);
    sides.push([mi, 'end']);
    sides.forEach(([m, side]) => {
      const button = stage.querySelector('.score-barline-trigger[data-measure="' + m + '"][data-side="' + side + '"]');
      if (!button) return;
      const nodes = stage.querySelector('[id="m' + m + '"]').querySelectorAll('g.barLine');
      const node = side === 'start' ? nodes[0] : nodes[nodes.length - 1];
      node?.classList.add('is-bar-selected');
      button.setAttribute('aria-pressed', 'true');
    });
    mountInsertButtons(mi);
  }

  // Un + sobre cada barra del compas elegido inserta un compas vacio antes o despues; los demas se corren.
  function mountInsertButtons(mi) {
    stage.querySelectorAll('.score-insert-measure').forEach((button) => button.remove());
    const m = layout[mi];
    [['before', m.left, mi, t.insertMeasureBefore], ['after', m.right, mi + 1, t.insertMeasureAfter]].forEach(([where, x, at, label]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'score-insert-measure tooltip';
      button.dataset.where = where;
      button.dataset.tooltip = label;
      button.setAttribute('aria-label', label);
      button.innerHTML = lucide('plus');
      button.style.left = x + 'px';
      button.style.top = (m.top - 18) + 'px';
      button.addEventListener('click', () => {
        // El compas nuevo queda elegido para poder seguir insertando.
        if (!change(() => { selected = null; return M.insertMeasure(score, at); })) return;
        selectedMeasure = at;
        markMeasureBars();
      });
      stage.appendChild(button);
    });
  }

  function mountBarlineButtons() {
    const origin = stage.getBoundingClientRect();
    stage.querySelectorAll('g.measure').forEach((measure) => {
      const mi = Number(measure.id.slice(1));
      const hasStart = score.barlines && score.barlines[mi]?.start;
      measure.querySelectorAll('g.barLine').forEach((node, index) => {
        const box = node.getBoundingClientRect();
        if (!box.height) return;
        const side = hasStart && index === 0 ? 'start' : 'end';
        const bar = (score.barlines && score.barlines[mi]) || {};
        const simple = side === 'end' && !bar.double && !bar.end;
        const x = box.left + box.width / 2 - origin.left;
        const y = box.top - origin.top;
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'score-barline-trigger';
        button.dataset.measure = mi;
        button.dataset.side = side;
        button.setAttribute('aria-label', t.selectBarline);
        button.setAttribute('aria-pressed', 'false');
        if (!simple && !(side === 'end' && mi === M.rowOf(score, mi).last)) {
          button.setAttribute('aria-haspopup', 'dialog');
          button.setAttribute('aria-expanded', 'false');
        }
        button.style.left = x + 'px';
        button.style.top = y + 'px';
        button.style.width = Math.max(20, box.width + 12) + 'px';
        button.style.height = Math.max(44, box.height) + 'px';
        mountBarResize(button, mi, side);
        button.addEventListener('click', (click) => {
          clearBarSelection();
          deactivateTool();
          setPicks([]);
          node.classList.add('is-bar-selected');
          button.setAttribute('aria-pressed', 'true');
          // La armadura rige desde el compas siguiente si la barra cierra el compas, o desde este si la abre.
          const target = side === 'start' ? mi : mi + 1;
          // Si la barra es la ultima del renglon, no hay a que compas siguiente aplicar clave ni armadura.
          const endsRow = side === 'end' && mi === M.rowOf(score, mi).last;
          if (!simple && !endsRow && target < M.measures(score).length) {
            if (clefPopup.matches(':popover-open')) clefPopup.hidePopover();
            else {
              // Una barra es de todos los pentagramas: cambia la clave del que esta a la altura del clic.
              const box = button.getBoundingClientRect();
              openClefPopup({ kind: 'bar', mi, side, staff: M.stavesOf(score) > 1 ? staffAtY(layout[mi], click.clientY - stage.getBoundingClientRect().top) : 0 }, target);
            }
          }
        });
        stage.appendChild(button);
      });
    });
  }

  // Quitar un renglon elimina todos sus compases, incluidas las divisiones creadas con barras.
  function removeLastRow() {
    if (score.rows.length <= M.MIN_ROWS) return false;
    selected = null;
    score.rows.pop();
    M.pruneKeys(score);
    if (score.barlines) Object.keys(score.barlines).forEach((mi) => {
      if (+mi >= M.measures(score).length) delete score.barlines[mi];
    });
    if (score.navigation) Object.keys(score.navigation).forEach((mi) => {
      if (+mi >= M.measures(score).length) delete score.navigation[mi];
    });
    if (score.barres) Object.keys(score.barres).forEach((mi) => {
      if (+mi >= M.measures(score).length) M.removeBarre(score, +mi);
    });
    if (score.hairpins) {
      Object.keys(score.hairpins).forEach((mi) => { if (+mi >= M.measures(score).length) delete score.hairpins[mi]; });
      if (!Object.keys(score.hairpins).length) delete score.hairpins;
    }
    if (score.dynamics) {
      Object.keys(score.dynamics).forEach((mi) => { if (+mi >= M.measures(score).length) delete score.dynamics[mi]; });
      if (!Object.keys(score.dynamics).length) delete score.dynamics;
    }
  }

  // Una tablatura (<ascii-tabs>) bajo cada renglon. Las digitaciones salen solas de las notas (ScoreFingering) y cada
  // columna queda bajo su nota; score.tabs conserva las posiciones elegidas sin cambiar el pentagrama.
  const TAB_GAP = 8;
  const TAB_CLEF_CLEARANCE = 32; // la clave de guitarra (con su 8) baja por debajo del pentagrama
  const sameColumn = (a, b) => a.length === b.length && a.every((fret, s) => fret === b[s]);

  // Como en el visor de partituras: barra de union con el pentagrama, barras de compas y "TAB" en vertical bajo la clave.
  function decorateTab(tabs, row, start, size, head, font) {
    const origin = stage.getBoundingClientRect();
    const ys = [0, 1, 2, 3, 4, 5].map((s) => {
      const cell = tabs.querySelector('.ascii-tabs-cell[data-s="' + s + '"]');
      if (!cell) return null;
      const r = cell.getBoundingClientRect();
      return (r.top + r.bottom) / 2 - origin.top;
    });
    if (ys.some((y) => y === null)) return;
    const step = (ys[5] - ys[0]) / 5;
    const bar = (x, top, bottom) => {
      const node = document.createElement('span');
      node.className = 'score-tab-bar';
      node.style.left = (x - 0.75) + 'px';
      node.style.top = top + 'px';
      node.style.height = (bottom - top) + 'px';
      stage.appendChild(node);
    };
    bar(head.left, layout[start].lines[0], ys[5]);
    for (let k = 0; k < size; k += 1) bar(layout[start + k].right, ys[0], ys[5]);
    const clef = stage.querySelectorAll('g.system')[row] && stage.querySelectorAll('g.system')[row].querySelector('g.clef');
    const box = clef && clef.getBoundingClientRect();
    const x = box ? box.left + box.width / 2 - origin.left : head.left + 18;
    'TAB'.split('').forEach((letter, i) => {
      const mark = document.createElement('span');
      mark.className = 'score-tab-clef';
      mark.textContent = letter;
      mark.style.fontSize = font * 1.05 + 'px';
      mark.style.left = x + 'px';
      mark.style.top = (ys[0] + step * (1.5 + i)) + 'px';
      stage.appendChild(mark);
    });
    if (row === 0) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'score-tuning-trigger';
      const labels = [...tabs.querySelectorAll('.ascii-tabs-label')];
      const firstLabel = labels[0].getBoundingClientRect();
      const lastLabel = labels[labels.length - 1].getBoundingClientRect();
      button.style.left = (firstLabel.left - origin.left) + 'px';
      button.style.top = (firstLabel.top - origin.top) + 'px';
      button.style.width = firstLabel.width + 'px';
      button.style.height = (lastLabel.bottom - firstLabel.top) + 'px';
      button.setAttribute('aria-label', t.tuning + ': ' + tuningName(M.tuningOf(score)));
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-controls', tuningPopup.id);
      button.setAttribute('aria-expanded', 'false');
      button.addEventListener('pointerdown', event => event.stopPropagation());
      button.addEventListener('click', () => openTuning(button));
      stage.appendChild(button);
    }
  }

  function mountTabs() {
    if (!score.showTabs) { tabSpace = 0; return; }
    const first = layout[0];
    if (!first || first.lines.length < 5) return;
    const unit = (first.lines[1] - first.lines[0]) / 2; // un staff space = 2 unidades de Verovio
    const font = Math.min(28, Math.max(15, Math.round(4 * unit))); // como el visor: dos espacios del pentagrama
    const minStep = Math.round(font * 1.4); // para que no se pisen los trastes de dos cifras
    const origin = stage.getBoundingClientRect();
    const all = M.attacks(score);
    const fingered = window.ScoreFingering.assign(all.map((attack) => attack.midis), M.tuningOf(score).opens);
    const auto = {};
    all.forEach((attack, i) => { auto[attack.key] = window.ScoreFingering.toColumn(fingered[i]); });
    tabColumns = Object.assign({}, auto, score.tabs);
    const mounted = [];
    M.rowStarts(score).forEach((start, row) => {
      const size = score.rows[row].length;
      const head = layout[start];
      const last = layout[start + size - 1];
      if (!head || !last) return;
      const keys = all.filter((attack) => attack.mi >= start && attack.mi < start + size).map((attack) => attack.key);
      let previous = -Infinity;
      const positions = keys.map((key) => {
        const [mi, at] = key.split(':').map(Number);
        const xs = Array.from({ length: M.stavesOf(score) }, (_, staff) => staff).flatMap((staff) => {
          const measure = M.measures(score, staff)[mi] || [];
          const starts = M.onsets(measure);
          return eventNodes(mi, staff).filter((node, i) => !measure[i].rest && starts[i] === at).map((node) => centerX(node, origin));
        });
        const x = xs.length ? xs.reduce((sum, value) => sum + value, 0) / xs.length : layout[mi].left;
        previous = Math.max(x - head.left, previous + minStep);
        return previous;
      });
      const width = Math.max(last.right - head.left, (positions.length ? positions[positions.length - 1] : 0) + 12);
      const tabs = document.createElement('ascii-tabs');
      tabs.className = 'score-tab';
      tabs.setAttribute('labels', row === 0 ? 'notes' : 'none');
      tabs.setAttribute('tuning', M.tuningLabels(score).join(' '));
      tabs.setAttribute('variant', 'flat');
      tabs.setAttribute('theme', 'light');
      tabs.setAttribute('lang', document.documentElement.lang);
      tabs.setAttribute('aria-label', t.tabLabel + ' ' + (row + 1));
      tabs.style.setProperty('--ascii-tabs-font-size', font + 'px');
      tabs.style.left = head.left + 'px';
      // Measure the whole engraved row, including low heads, stems and ledger lines.
      const system = stage.querySelectorAll('g.system')[row];
      const boxes = [...system.querySelectorAll('g.layer, g.fermata, g.slur, g.tie, g.hairpin, g.dynam')]
        .map(node => node.getBoundingClientRect()).filter(box => box.width || box.height);
      const contentBottom = Math.max(last.bottom, ...boxes.map(box => box.bottom - origin.top));
      const offset = Math.max(TAB_CLEF_CLEARANCE, contentBottom - last.bottom + TAB_GAP);
      tabs.style.top = (last.bottom + offset) + 'px';
      tabs.style.width = (last.right - head.left) + 'px';
      tabs.appendChild(document.createElement('ascii-tabs-sheet'));
      // El componente se redibuja al hacer clic, asi que el escenario ya no puede reconocer el destino: no le llega el evento.
      tabs.addEventListener('pointerdown', (event) => event.stopPropagation());
      stage.appendChild(tabs);
      mounted.push({ tabs, keys, positions, width, start, size, head, offset });
    });
    loadAsciiTabs().then(() => customElements.whenDefined('ascii-tabs')).then(() => {
      if (!mounted.length || !mounted[0].tabs.isConnected) return;
      mounted.forEach(({ tabs, keys, positions, width, start, size, head }, row) => {
        const value = keys.map((key) => (score.tabs && score.tabs[key]) || auto[key]);
        // Un renglon sin notas lleva una columna vacia para dibujar las mismas lineas continuas que los demas.
        if (!keys.length) { value.push(new Array(6).fill(null)); positions.push(width / 2); }
        try {
          tabs.setDocument({ value: [value], columnLayout: [{ width, positions }] });
        } catch (error) {
          tabs.setDocument({ value: [value] });
        }
        // Native labels take a gutter before the string coordinates. Move only
        // that gutter outside the system so frets still align with the staff.
        const gutter = tabs.querySelector('.ascii-tabs-label')?.getBoundingClientRect().width || 0;
        tabs.style.left = (head.left - gutter) + 'px';
        tabs.style.width = (layout[start + size - 1].right - head.left + gutter) + 'px';
        decorateTab(tabs, row, start, size, head, font);
        tabs.addEventListener('change', (event) => {
          const columns = event.detail.value[0];
          keys.forEach((key, c) => {
            const column = (columns[c] || []).map((fret) => (Number.isInteger(fret) ? fret : null));
            const edited = M.sanitizeTabs({ [key]: column }, Infinity)[key];
            if (edited) tabColumns[key] = edited;
            if (edited && !sameColumn(edited, auto[key])) { score.tabs = score.tabs || {}; score.tabs[key] = edited; }
            else if (score.tabs) delete score.tabs[key];
          });
          if (score.tabs && !Object.keys(score.tabs).length) delete score.tabs;
          save();
        });
      });
      const want = Math.ceil(Math.max(...mounted.map(({ tabs, offset }) =>
        tabs.getBoundingClientRect().height + offset + TAB_GAP)) / unit);
      // Subpixel SVG rounding can alternate between adjacent unit counts.
      if (Math.abs(want - tabSpace) > 1) { tabSpace = want; render(); return; }
      // Los botones de renglones van bajo el escenario: que no tapen la ultima tablatura.
      const bottom = mounted[mounted.length - 1].tabs.getBoundingClientRect().bottom - stage.getBoundingClientRect().top;
      stage.style.minHeight = Math.ceil(bottom + 24) + 'px';
    });
  }

  // Al pasar el mouse por el ultimo compas de un renglon aparece una barra flotante con + y - para sumar o quitar compases del renglon.
  const ROW_TOOLS_WIDTH = 34;
  function mountRowTools() {
    M.rowStarts(score).forEach((first, row) => {
      const size = score.rows[row].length;
      const last = layout[first + size - 1];
      if (!last) return;
      const tools = document.createElement('div');
      tools.className = 'score-row-tools';
      tools.dataset.row = row;
      tools.style.left = (last.right + 4) + 'px';
      tools.style.top = ((last.top + last.bottom) / 2) + 'px';
      [['add', 'plus', t.addMeasure, size >= M.PER_ROW, t.noRoomForMeasure],
        ['remove', 'minus', t.deleteMeasure, size <= 1, t.deleteMeasure]].forEach(([action, icon, label, disabled, blocked]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'score-row-tool tooltip';
        button.dataset.action = action;
        button.dataset.tooltip = disabled ? blocked : label;
        button.setAttribute('aria-label', label);
        // aria-disabled (no disabled) para que el boton siga mostrando su tooltip al pasar el mouse.
        if (disabled) button.setAttribute('aria-disabled', 'true');
        button.innerHTML = lucide(icon);
        button.addEventListener('click', () => {
          if (disabled) return;
          change(() => {
            selected = null;
            return action === 'add' ? M.addMeasure(score, row) : M.removeMeasure(score, row);
          });
        });
        tools.appendChild(button);
      });
      stage.appendChild(tools);
    });
  }

  stage.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    const box = stage.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    const starts = M.rowStarts(score);
    stage.querySelectorAll('.score-row-tools').forEach((tools) => {
      const row = +tools.dataset.row;
      const last = layout[starts[row] + score.rows[row].length - 1];
      tools.classList.toggle('is-visible', !!last && x >= last.left && x <= last.right + 4 + ROW_TOOLS_WIDTH
        && y >= last.top - 40 && y <= last.bottom + 40);
    });
  });
  stage.addEventListener('pointerleave', () => stage.querySelectorAll('.score-row-tools').forEach((tools) => tools.classList.remove('is-visible')));

  // Tiempo -> x dentro del compas, con las mismas anclas que timeAt.
  function xAtTime(time, m, starts, centers) {
    const anchors = [{ x: m.start, t: 0 }, { x: m.right, t: M.capacity(score, layout.indexOf(m)) }];
    centers.forEach((c, i) => anchors.push({ x: c, t: starts[i] }));
    anchors.sort((p, q) => p.t - q.t || p.x - q.x);
    for (let k = 1; k < anchors.length; k += 1) {
      const a = anchors[k - 1];
      const b = anchors[k];
      if (time <= b.t && b.t > a.t) return a.x + ((time - a.t) / (b.t - a.t)) * (b.x - a.x);
    }
    return m.right;
  }

  // Sobre la linea de la cejilla aparecen dos asas para mover su inicio y su fin, ajustados a las notas.
  function mountBarreSpan(mi, barre, origin) {
    const line = stage.querySelector('[id="m' + mi + '"] g.bracketSpan path');
    if (!line) return;
    const box = line.getBoundingClientRect();
    const zone = document.createElement('span');
    zone.className = 'score-barre-span';
    zone.style.left = (box.left - origin.left) + 'px';
    zone.style.top = (box.top + box.height / 2 - origin.top) + 'px';
    zone.style.width = box.width + 'px';
    [['start', t.barreStart], ['end', t.barreEnd]].forEach(([side, label]) => {
      const grip = document.createElement('button');
      grip.type = 'button';
      grip.className = 'score-barre-grip';
      grip.dataset.side = side;
      grip.setAttribute('aria-label', label);
      grip.innerHTML = lucide(side === 'start' ? 'arrow-left' : 'arrow-right');
      grip.addEventListener('pointerdown', (event) => beginBarreResize(event, mi, side));
      grip.addEventListener('keydown', (event) => {
        const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
        if (!step) return;
        event.preventDefault();
        const times = barreTimes(mi, side);
        const current = side === 'start' ? barre.at : barreEnd(barre, mi);
        const next = times[times.indexOf(current) + step];
        if (next === undefined) return;
        resizeBarre(mi, side, next);
        stage.querySelector('.score-barre-grip[data-side="' + side + '"]')?.focus({ preventScroll: true });
      });
      zone.appendChild(grip);
    });
    stage.appendChild(zone);
  }

  // Final de la cejilla como tiempo absoluto desde el inicio de su compas (puede pasar a compases siguientes).
  function measureOffset(mi, last) {
    let time = 0;
    for (let k = mi; k < last; k += 1) time += M.capacity(score, k);
    return time;
  }

  function barrePoint(mi, time) {
    let k = mi;
    while (time > M.capacity(score, k)) { time -= M.capacity(score, k); k += 1; }
    return { mi: k, at: time };
  }

  function barreEnd(barre, mi) {
    const last = mi + (barre.span || 0);
    return measureOffset(mi, last) + (barre.to || M.capacity(score, last));
  }

  // Tiempos validos para un extremo: inicios de nota (comienzo) o finales de nota (fin), mas los bordes del compas.
  // El fin tambien puede caer en compases siguientes de la misma fila, hasta el proximo con otra cejilla.
  function barreTimes(mi, side) {
    const barre = score.barres[mi];
    const end = M.capacity(score, mi);
    const all = M.measures(score);
    const rowLast = M.rowOf(score, mi).last;
    const times = new Set(side === 'start' ? [0] : []);
    for (let k = mi; k <= Math.min(rowLast, all.length - 1); k += 1) {
      if (k > mi && (score.barres[k] || side === 'start')) break;
      const starts = M.onsets(all[k]);
      if (side === 'end') times.add(measureOffset(mi, k + 1));
      all[k].forEach((ev, i) => {
        if (ev.rest) return;
        times.add(measureOffset(mi, k) + (side === 'start' ? starts[i] : Math.min(M.capacity(score, k), starts[i] + M.length(ev))));
      });
    }
    return [...times].filter((time) => (side === 'start' ? time < Math.min(end, barreEnd(barre, mi)) : time > barre.at)).sort((a, b) => a - b);
  }

  function resizeBarre(mi, side, time) {
    const barre = score.barres[mi];
    const at = side === 'start' ? time : barre.at;
    const last = side === 'end' ? time : barreEnd(barre, mi);
    if (at === barre.at && last === barreEnd(barre, mi)) return;
    const point = barrePoint(mi, last);
    change(() => M.setBarre(score, mi, at, barre.fret, point.at, point.mi - mi));
  }

  let barreResize = null;
  function beginBarreResize(event, mi, side) {
    event.preventDefault();
    event.stopPropagation();
    clearHoverGhost();
    const origin = stage.getBoundingClientRect();
    const anchors = new Map();
    // Tiempo absoluto de la cejilla -> x, usando el compas donde cae.
    const xAt = (time) => {
      const point = barrePoint(mi, time);
      const k = point.mi;
      if (!anchors.has(k)) anchors.set(k, { starts: M.onsets(M.measures(score)[k]), centers: eventNodes(k).map((node) => centerX(node, origin)) });
      const { starts, centers } = anchors.get(k);
      return xAtTime(point.at, layout[k], starts, centers);
    };
    const path = stage.querySelector('[id="m' + mi + '"] g.bracketSpan path');
    const line = path.getBoundingClientRect();
    const zone = stage.querySelector('.score-barre-span');
    const fixed = (side === 'end' ? line.left : line.right) - origin.left;
    const preview = document.createElement('span');
    preview.className = 'score-barre-preview';
    preview.style.top = (line.top + line.height / 2 - origin.top) + 'px';
    stage.appendChild(preview);
    // La linea punteada original se oculta y se redibuja en vivo entre el extremo fijo y el que se arrastra.
    const live = document.createElement('span');
    live.className = 'score-barre-live';
    live.style.top = preview.style.top;
    stage.appendChild(live);
    path.style.visibility = 'hidden';
    const place = (x) => {
      const left = Math.min(fixed, x);
      const width = Math.abs(x - fixed);
      live.style.left = left + 'px';
      live.style.width = width + 'px';
      zone.style.left = left + 'px';
      zone.style.width = width + 'px';
    };
    stage.classList.add('is-resizing-barre');
    barreResize = {
      id: event.pointerId,
      move(e) {
        const x = e.clientX - origin.left;
        let best = null;
        barreTimes(mi, side).forEach((time) => {
          const tx = xAt(time);
          if (!best || Math.abs(tx - x) < Math.abs(best.x - x)) best = { time, x: tx };
        });
        barreResize.pick = best && best.time;
        if (best) {
          preview.style.left = best.x + 'px';
          place(best.x);
        }
      },
      finish(commit) {
        preview.remove();
        live.remove();
        path.style.visibility = '';
        stage.classList.remove('is-resizing-barre');
        barreResize = null;
        if (commit && this.pick !== undefined) resizeBarre(mi, side, this.pick);
        render(); // deja asas y linea en su lugar si no hubo cambio
      },
    };
    barreResize.move(event);
  }

  document.addEventListener('pointermove', (event) => {
    if (barreResize && event.pointerId === barreResize.id) barreResize.move(event);
  });
  document.addEventListener('pointerup', (event) => {
    if (barreResize && event.pointerId === barreResize.id) barreResize.finish(true);
  });
  document.addEventListener('pointercancel', (event) => {
    if (barreResize && event.pointerId === barreResize.id) barreResize.finish(false);
  });

  // El numero de la cejilla se edita sobre su etiqueta: un campo que tapa el texto dibujado por Verovio.
  function mountBarreInputs() {
    const origin = stage.getBoundingClientRect();
    Object.keys(score.barres || {}).forEach((key) => {
      const mi = Number(key);
      const barre = score.barres[mi];
      const label = [...stage.querySelectorAll('[id="m' + mi + '"] g.dir')].find((node) => !isChordDir(node));
      if (!label) return;
      const box = label.getBoundingClientRect();
      const field = document.createElement('span');
      field.className = 'score-barre-field';
      const letter = document.createElement('span');
      letter.textContent = 'C';
      letter.setAttribute('aria-hidden', 'true');
      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'numeric';
      input.maxLength = 2;
      input.className = 'score-barre-number';
      input.value = barre.fret;
      input.setAttribute('aria-label', t.barreFret);
      field.style.left = (box.left - origin.left) + 'px';
      field.style.top = (box.top + box.height / 2 - origin.top) + 'px';
      const commit = () => {
        if (!input.isConnected) return;
        const fret = Number(input.value);
        if (input.value.trim() === '') change(() => M.removeBarre(score, mi));
        else if (Number.isInteger(fret) && fret !== barre.fret) {
          if (!change(() => M.setBarre(score, mi, barre.at, fret, barre.to))) { input.value = barre.fret; say(t.barreFretRange); }
          else say('');
        } else input.value = barre.fret;
      };
      input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, ''); });
      input.addEventListener('keydown', (event) => {
        event.stopPropagation();
        if (event.key === 'Enter') { event.preventDefault(); input.blur(); }
        else if (event.key === 'Escape') { input.value = barre.fret; input.blur(); }
      });
      input.addEventListener('blur', commit);
      field.append(letter, input);
      stage.appendChild(field);
      mountBarreSpan(mi, barre, origin);
      if (focusBarre === mi) {
        input.focus({ preventScroll: true });
        input.select();
      }
    });
    focusBarre = null;
  }

  // ---- acordes (guitarra) ---------------------------------------------------------
  // Nombres escritos sobre el pentagrama. Verovio los dibuja en negrita (ver toMusicXml); aca viven la zona que invita a
  // escribirlos al pasar el mouse, el campo de texto y el popup con la digitacion y sus variantes. El diccionario es el de
  // guitar-chords, que el build publica como JSON (scripts/lib/chords-data.mjs) y se pide la primera vez que se usa.

  const chordsOn = chords && Boolean(__CHORDS_FILE__);
  const guitarOn = () => !settings || M.instrumentOf(score) === 'guitar';
  let chordLib = null;
  let chordLoading = null;
  let chordDraft = null; // { mi, at, text } del acorde que se esta escribiendo, aun sin guardar
  let chordOpen = null; // { mi, at } del acorde cuyo popup esta abierto
  let chordZone = null;
  let chordMove = null; // { mi, at } del acorde que se arrastra a otro tiempo
  let chordPopup = null;

  function loadChords() {
    if (!chordLoading) {
      const searchModule = __CHORD_SEARCH_FILE__ ? import(/* @vite-ignore */ vendorUrl(__CHORD_SEARCH_FILE__)).catch(() => null) : Promise.resolve(null);
      chordLoading = Promise.all([import('./chords.js'), fetch(vendorUrl(__CHORDS_FILE__)).then((response) => response.json()), searchModule])
        .then(([lib, rows, search]) => { chordLib = Object.assign({ rows, search, index: lib.indexChords(rows, search && search.normalize) }, lib); refreshChordPopup(); })
        .catch(() => { chordLoading = null; });
    }
    return chordLoading;
  }

  const isIntervalDir = (node) => /^[IVXL]+$/.test(squash(node.textContent));
  const INTERVAL_GAP = 9; // separacion minima (px) entre las etiquetas de intervalos y lo que tienen debajo
  const CHORD_GAP = 4;
  const CHORD_NAME_GAP = 12; // separacion minima (px) entre un nombre de acorde detectado y lo que tiene debajo

  // Verovio a veces deja la etiqueta pegada al pentagrama o sobre una nota o plica. Cada etiqueta se apoya
  // sobre el contenido de su pentagrama (figuras, barras, silencios) con una separacion minima, y todas las de
  // un mismo pentagrama del renglon comparten la misma linea base.
  function placeIntervals(svg) {
    const dirs = [...svg.querySelectorAll('g.measure g.dir')].filter(isIntervalDir);
    if (!dirs.length) return;
    const groups = new Map();
    dirs.forEach((dir) => {
      const box = dir.getBoundingClientRect();
      const staves = [...dir.closest('g.measure').querySelectorAll(':scope > g.staff')].map((staff) => ({ staff, top: staff.querySelector(':scope > path').getBoundingClientRect().top }));
      const below = staves.filter((s) => s.top >= box.bottom - 4);
      const target = M.voicePerStaff(score) ? staves[0] : below.length ? below.reduce((a, b) => (b.top < a.top ? b : a)) : staves[staves.length - 1];
      if (!target) return;
      let limit = target.top;
      target.staff.querySelectorAll('g.note, g.chord, g.rest, g.beam, g.tuplet').forEach((node) => {
        const r = node.getBoundingClientRect();
        if (r.right > box.left - 2 && r.left < box.right + 2 && r.height) limit = Math.min(limit, r.top);
      });
      const key = Math.round(target.top);
      const goal = limit - INTERVAL_GAP;
      const group = groups.get(key) || { goal: Infinity, items: [] };
      group.goal = Math.min(group.goal, goal);
      group.items.push({ dir, bottom: box.bottom });
      groups.set(key, group);
    });
    groups.forEach((group) => group.items.forEach(({ dir, bottom }) => {
      const scale = dir.getScreenCTM() && dir.getScreenCTM().a;
      if (scale) dir.setAttribute('transform', 'translate(0 ' + (group.goal - bottom) / scale + ') ' + (dir.getAttribute('transform') || ''));
    }));
  }

  // Chord names go above the interval labels (or above the notes without them); the other candidates are the tooltip.
  function placeChordNames(svg) {
    if (!proChordNames || !chordNameDocuments.has(score)) return;
    const origin = svg.getBoundingClientRect();
    const marks = chordMarks(score, M, shownVoices.size ? shownVoices : null);
    const dirs = [...svg.querySelectorAll('g.measure g.dir')].filter((node) => !isIntervalDir(node) && !isChordDir(node));
    const used = new Set();
    const placed = [];
    marks.forEach((mark) => {
      const note = svg.querySelector('[id="' + mark.id + '"]');
      if (!note) return;
      const x = centerX(note, origin);
      const dir = dirs.filter((node) => !used.has(node) && squash(node.textContent) === squash(mark.names[0]))
        .sort((a, b) => Math.abs(centerX(a, origin) - x) - Math.abs(centerX(b, origin) - x))[0];
      if (!dir) return;
      used.add(dir);
      if (mark.names.length > 1) {
        const title = document.createElementNS('http://www.w3.org/2000/svg', 'title');
        title.textContent = t.chordNamesOthers + ' ' + mark.names.slice(1).join(', ');
        dir.prepend(title);
      }
      placed.push({ dir, mark });
    });
    // Same baseline for every name of a staff, clear of the interval labels and the notes below.
    const rows = new Map();
    placed.forEach(({ dir, mark }) => {
      const box = dir.getBoundingClientRect();
      const measure = dir.closest('g.measure');
      const staff = [...measure.querySelectorAll(':scope > g.staff')][mark.staff] || measure.querySelector(':scope > g.staff');
      let limit = staff.querySelector(':scope > path').getBoundingClientRect().top;
      measure.querySelectorAll('g.note, g.chord, g.rest, g.beam, g.tuplet, g.dir').forEach((node) => {
        if (node === dir || !measure.contains(node) || (node.closest('g.dir') && node.closest('g.dir') === dir)) return;
        const r = node.getBoundingClientRect();
        if (r.height && r.right > box.left - 2 && r.left < box.right + 2 && r.top >= box.top - 1 && r.top < limit) limit = r.top;
      });
      const key = Math.round(staff.querySelector(':scope > path').getBoundingClientRect().top);
      const row = rows.get(key) || { goal: Infinity, items: [] };
      row.goal = Math.min(row.goal, limit - CHORD_NAME_GAP);
      row.items.push({ dir, bottom: box.bottom });
      rows.set(key, row);
    });
    rows.forEach((row) => row.items.forEach(({ dir, bottom }) => {
      const scale = dir.getScreenCTM() && dir.getScreenCTM().a;
      if (scale) dir.setAttribute('transform', 'translate(0 ' + (row.goal - bottom) / scale + ') ' + (dir.getAttribute('transform') || ''));
    }));
  }

  const isChordDir = (node) => !!node.querySelector('tspan[font-weight="bold"]');
  const squash = (text) => text.replace(/\s+/g, '');

  // Una columna por tiempo con figuras en el pentagrama de arriba (un compas vacio tiene solo la del inicio de la musica).
  function chordColumns(mi) {
    const origin = stage.getBoundingClientRect();
    const starts = M.onsets(M.measures(score)[mi]);
    const columns = new Map();
    eventNodes(mi, 0).forEach((node, i) => { if (!columns.has(starts[i])) columns.set(starts[i], centerX(node, origin)); });
    if (!columns.size) columns.set(0, layout[mi].start);
    return [...columns].map(([at, x]) => ({ at, x })).sort((a, b) => a.x - b.x);
  }

  // Donde se escribe: sobre el pentagrama, mas arriba que cejillas y nombres ya escritos, y sin pisar el renglon anterior.
  function chordBand(mi) {
    const m = layout[mi];
    const space = (m.lines[4] - m.lines[0]) / 4;
    const above = Math.max(-Infinity, ...layout.filter((other) => other.bottom < m.top - 1).map((other) => other.bottom));
    return { space, top: Math.max(m.top - 7 * space, above + space), bottom: m.top - 3 * space, center: m.top - 4.5 * space };
  }

  // La linea donde se escribe: la zona la subraya, el campo se apoya en ella y el nombre ya escrito queda justo encima.
  const chordLineY = (band) => band.center + band.space * 0.9;

  function chordZoneAt(clientX, clientY) {
    const origin = stage.getBoundingClientRect();
    const x = clientX - origin.left, y = clientY - origin.top;
    for (let mi = 0; mi < layout.length; mi += 1) {
      const m = layout[mi];
      if (x < m.left || x > m.right) continue;
      const band = chordBand(mi);
      if (band.bottom - band.top < band.space * 1.5 || y < band.top || y > band.bottom) continue;
      const columns = chordColumns(mi);
      const column = columns.reduce((best, c) => (Math.abs(c.x - x) < Math.abs(best.x - x) ? c : best));
      // Sin figuras solo existe la columna del inicio: la zona aparece unicamente cerca de ella, no desde cualquier punto del compas.
      const lone = columns.length === 1;
      if (lone && Math.abs(column.x - x) > band.space * 2) continue;
      const gap = Math.min(...columns.filter((c) => c !== column).map((c) => Math.abs(c.x - column.x)), band.space * (lone ? 3 : 6));
      return { mi, at: column.at, x: column.x, y: chordLineY(band) - 3, width: Math.max(band.space * 2.5, Math.min(gap, band.space * 6)), band };
    }
    return null;
  }

  function showChordZone(zone) {
    if (!zone || M.chordAt(score, zone.mi, zone.at) || (chordDraft && chordDraft.mi === zone.mi && chordDraft.at === zone.at)) {
      if (chordZone) chordZone.hidden = true;
      stage.classList.remove('is-chord-zone');
      return;
    }
    if (!chordZone || !chordZone.isConnected) {
      chordZone = document.createElement('div');
      chordZone.className = 'score-chord-zone';
      chordZone.setAttribute('aria-hidden', 'true');
      stage.appendChild(chordZone);
    }
    chordZone.hidden = false;
    chordZone.style.left = zone.x - zone.width / 2 + 'px';
    chordZone.style.top = zone.y + 'px';
    chordZone.style.width = zone.width + 'px';
    stage.classList.add('is-chord-zone');
    if (!chordLib) loadChords();
  }

  function startChordDraft(mi, at, edit) {
    if (M.chordAt(score, mi, at) && edit === undefined) { openChord(mi, at); return; }
    chordDraft = { mi, at, text: edit || '' };
    mountChordDraft();
  }

  function mountChordDraft() {
    if (!chordDraft || !layout[chordDraft.mi]) { chordDraft = null; return; }
    const draft = chordDraft;
    const columns = chordColumns(draft.mi);
    const column = columns.filter((c) => c.at <= draft.at).pop() || columns[0];
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'score-chord-draft';
    input.maxLength = M.MAX_CHORD_NAME;
    input.value = draft.text;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', t.chordName);
    const fit = () => { input.style.width = Math.max(3, input.value.length + 1.5) + 'ch'; };
    fit();
    const band = chordBand(draft.mi);
    input.style.fontSize = band.space * 2.25 + 'px'; // el nombre dibujado mide 2,25 espacios del pentagrama
    input.style.left = column.x + 'px';
    input.style.top = chordLineY(band) + 'px';
    const finish = (save) => {
      // Un redibujado quita el campo sin terminar de escribir: el borrador sigue y se vuelve a montar.
      if (chordDraft !== draft || !input.isConnected) return;
      chordDraft = null;
      const name = input.value.trim();
      input.remove();
      if (save && name) {
        if (!change(() => M.setChord(score, draft.mi, draft.at, name))) say(t.chordName);
      }
    };
    draft.finish = finish;
    input.addEventListener('input', () => { draft.text = input.value; fit(); });
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') { event.preventDefault(); finish(true); }
      else if (event.key === 'Escape') { event.preventDefault(); finish(false); }
    });
    input.addEventListener('blur', () => finish(true));
    stage.appendChild(input);
    input.focus({ preventScroll: true });
  }


  // ---- Letra: una silaba bajo cada nota ------------------------------------------------------------------------------
  // Verovio dibuja `<lyric>` bajo el pentagrama de la nota (g.verse). El campo se apoya en esa linea y cada silaba dibujada
  // tiene un boton transparente encima: clic o doble clic la edita, Suprimir la quita. Espacio, Tab o un guion avanzan a la nota siguiente.
  // La casilla «Letra de canto» de los ajustes (por partitura, activa por defecto) muestra u oculta la herramienta; las sílabas escritas se siguen dibujando.
  const lyricsActive = () => lyrics && toolOn('lyrics');
  let syllabifyLoading = null;

  // El silabeo de el-silbador se pide recien al pegar una letra (el build lo publica en `vendor/`). Sin el, cada palabra es una silaba.
  function loadSyllabify() {
    if (!syllabifyLoading) syllabifyLoading = (__SYLLABIFY_FILE__ ? import(/* @vite-ignore */ vendorUrl(__SYLLABIFY_FILE__)) : Promise.resolve({})).catch(() => ({}));
    return syllabifyLoading;
  }
  let lyricDraft = null; // { mi, at, staff, text } de la silaba que se esta escribiendo, aun sin guardar

  // Nodo de la primera nota (no silencio) de ese pentagrama que empieza en `at`.
  function lyricNote(mi, at, staff) {
    const measure = M.measures(score, staff)[mi] || [];
    const starts = M.onsets(measure);
    const i = measure.findIndex((ev, k) => starts[k] === at && !ev.rest);
    // Una nota que continua una ligadura de prolongacion no lleva silaba: el sonido se sostiene.
    return i < 0 || M.tiedLyricSpots(score, staff).has(mi + ':' + at) ? null : eventNodes(mi, staff)[i] || null;
  }

  // Referencia de la nota (la primera, si hay un acorde) que lleva la silaba de ese tiempo.
  function lyricRef(mi, at, staff) {
    const measure = M.measures(score, staff)[mi] || [];
    const starts = M.onsets(measure);
    const i = measure.findIndex((ev, k) => starts[k] === at && !ev.rest);
    return i < 0 ? null : M.refOf(staff, mi, i);
  }

  // Las notas de un pentagrama que pueden recibir una silaba, con la x de cada una: [{ at, x }] por compas.
  function lyricColumns(mi, staff) {
    const origin = stage.getBoundingClientRect();
    const measure = M.measures(score, staff)[mi] || [];
    const starts = M.onsets(measure);
    const tied = M.tiedLyricSpots(score, staff);
    const columns = new Map();
    eventNodes(mi, staff).forEach((node, i) => {
      if (!measure[i] || measure[i].rest || tied.has(mi + ':' + starts[i]) || columns.has(starts[i])) return;
      columns.set(starts[i], { at: starts[i], x: centerX(node, origin), node });
    });
    return [...columns.values()].sort((a, b) => a.x - b.x);
  }

  // Destino de una silaba que se arrastra: la nota mas cercana en horizontal del compas que esta bajo el cursor, en el mismo pentagrama.
  function lyricZoneAt(clientX, clientY, staff) {
    const origin = stage.getBoundingClientRect();
    const x = clientX - origin.left, y = clientY - origin.top;
    let best = null;
    layout.forEach((m, mi) => {
      const lines = m.staves[staff];
      if (!lines || x < m.left || x > m.right) return;
      const space = (lines[4] - lines[0]) / 4;
      const dy = Math.abs(y - (lines[4] + space * 5));
      if (dy > space * 9 || (best && dy >= best.dy)) return;
      const columns = lyricColumns(mi, staff);
      if (!columns.length) return;
      const column = columns.reduce((a, c) => (Math.abs(c.x - x) < Math.abs(a.x - x) ? c : a));
      const gap = Math.min(...columns.filter((c) => c !== column).map((c) => Math.abs(c.x - column.x)), space * 6);
      best = { dy, mi, at: column.at, x: column.x, y: lyricLine(mi, staff, column.node).y + 2, width: Math.max(space * 2.5, Math.min(gap, space * 6)) };
    });
    return best;
  }

  let lyricZone = null;
  function showLyricZone(zone, staff) {
    if (!zone || M.lyricAt(score, zone.mi, zone.at, staff)) {
      if (lyricZone) lyricZone.hidden = true;
      return;
    }
    if (!lyricZone || !lyricZone.isConnected) {
      lyricZone = document.createElement('div');
      lyricZone.className = 'score-chord-zone score-lyric-zone';
      lyricZone.setAttribute('aria-hidden', 'true');
      stage.appendChild(lyricZone);
    }
    lyricZone.hidden = false;
    lyricZone.style.left = zone.x - zone.width / 2 + 'px';
    lyricZone.style.top = zone.y + 'px';
    lyricZone.style.width = zone.width + 'px';
  }

  // Donde cae la silaba: bajo el pentagrama, y debajo de las notas que lo desbordan.
  function lyricLine(mi, staff, node) {
    const lines = layout[mi].staves[staff];
    const space = (lines[4] - lines[0]) / 4;
    const origin = stage.getBoundingClientRect();
    const verse = node && node.querySelector('g.verse');
    if (verse) return { space, y: verse.getBoundingClientRect().bottom - origin.top };
    const low = node ? node.getBoundingClientRect().bottom - origin.top : 0;
    return { space, y: Math.max(lines[4] + space * 4.2, low + space * 2) };
  }

  function startLyricDraft(mi, at, staff, edit) {
    if (!lyricsActive() || !lyricNote(mi, at, staff)) return false;
    const old = M.lyricAt(score, mi, at, staff);
    lyricDraft = { mi, at, staff, text: edit !== undefined ? edit : old ? old.text : '' };
    mountLyricDraft();
    return true;
  }

  function mountLyricDraft() {
    const draft = lyricDraft;
    const node = draft && layout[draft.mi] && lyricNote(draft.mi, draft.at, draft.staff);
    if (!node) { lyricDraft = null; return; }
    const origin = stage.getBoundingClientRect();
    const line = lyricLine(draft.mi, draft.staff, node);
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'score-lyric-draft';
    input.maxLength = M.MAX_LYRIC + 1;
    input.value = draft.text;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', t.lyricName);
    const fit = () => { input.style.width = Math.max(3, input.value.length + 1.5) + 'ch'; };
    fit();
    // Mismo tamano y misma linea que la silaba dibujada por Verovio (su tspan interno, en unidades del SVG).
    const verse = node.querySelector('g.verse') || stage.querySelector('g.verse');
    const unit = verse && verse.querySelector('tspan[font-size]');
    const size = unit ? parseFloat(unit.getAttribute('font-size')) * verse.getScreenCTM().a : line.space * 2.25;
    const own = node.querySelector('g.verse');
    const box = own && own.getBoundingClientRect();
    input.style.fontSize = size + 'px';
    input.style.left = centerX(node, origin) + 'px';
    input.style.top = (box ? (box.top + box.bottom) / 2 - origin.top : line.y - size * 0.575) + 'px';
    // Guarda y, si se pide, sigue con la nota vecina del mismo pentagrama (`step`: 1 adelante, -1 atras).
    const finish = (save, step = 0) => {
      // Un redibujado quita el campo sin terminar de escribir: el borrador sigue y se vuelve a montar.
      if (lyricDraft !== draft || !input.isConnected) return;
      lyricDraft = null;
      const text = input.value.trim();
      input.remove();
      if (save) {
        const had = M.lyricAt(score, draft.mi, draft.at, draft.staff);
        if (text && M.parseLyric(text)) change(() => M.setLyric(score, draft.mi, draft.at, text, draft.staff));
        else if (!text && had) change(() => M.removeLyric(score, draft.mi, draft.at, draft.staff));
        else if (text) say(t.lyricName);
      }
      const next = step && M.nextLyricSpot(score, draft.mi, draft.at, draft.staff, step < 0);
      if (next) startLyricDraft(next.mi, next.at, draft.staff);
    };
    draft.finish = finish;
    input.addEventListener('input', () => { draft.text = input.value; fit(); });
    input.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.isComposing) return;
      if (event.key === 'Enter') { event.preventDefault(); finish(true); }
      else if (event.key === 'Escape') { event.preventDefault(); finish(false); }
      else if (event.key === 'Tab') { event.preventDefault(); finish(true, event.shiftKey ? -1 : 1); }
      else if (event.key === ' ' && !event.shiftKey && input.value.trim()) { event.preventDefault(); finish(true, 1); }
    });
    // Pegar una letra la reparte en silabas, una por nota, desde esta y a traves de los compases.
    input.addEventListener('paste', (event) => {
      const pasted = event.clipboardData && event.clipboardData.getData('text');
      if (!pasted || !pasted.trim()) return;
      event.preventDefault();
      if (lyricDraft !== draft) return;
      lyricDraft = null;
      input.remove();
      loadSyllabify().then((lib) => {
        const syllables = lyricSyllables(pasted, lib);
        let result = null;
        change(() => { result = M.distributeLyrics(score, draft.mi, draft.at, draft.staff, syllables); return Boolean(result && result.placed); });
        say(result && result.left ? t.lyricLeft.replace('{n}', result.left) : '');
      });
    });
    input.addEventListener('blur', () => finish(true));
    stage.appendChild(input);
    input.focus({ preventScroll: true });
    input.select();
  }

  function mountLyrics() {
    if (!lyricsActive()) return;
    const origin = stage.getBoundingClientRect();
    Object.keys(score.lyrics || {}).forEach((key) => {
      const mi = Number(key);
      score.lyrics[mi].forEach((lyric) => {
        const staff = lyric.s || 0;
        if (staff >= M.lyricStaves(score) || !layout[mi]) return;
        const node = lyricNote(mi, lyric.at, staff);
        const verse = node && node.querySelector('g.verse');
        if (!verse) return;
        const box = verse.getBoundingClientRect();
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'score-lyric-trigger';
        button.dataset.measure = mi;
        button.dataset.at = lyric.at;
        button.dataset.staff = staff;
        button.setAttribute('aria-label', t.lyric + ': ' + lyric.text);
        button.style.left = box.left - origin.left - 4 + 'px';
        // El texto de Verovio llega a rozar las notas bajas: el boton empieza un poco mas abajo para no taparlas.
        button.style.top = box.top - origin.top + 3 + 'px';
        button.style.width = Math.max(box.width, 12) + 8 + 'px';
        button.style.height = Math.max(box.height + 1, 10) + 'px';
        button.dataset.dragged = '';
        // Mayus, Ctrl o Cmd suman la nota de la silaba a la seleccion (para unirlas desde el menu); un click abre el campo.
        button.addEventListener('click', (event) => {
          if (button.dataset.dragged || event.shiftKey || event.ctrlKey || event.metaKey) return;
          setPicks([]);
          startLyricDraft(mi, lyric.at, staff);
        });
        // Arrastrar la silaba la lleva a otra nota libre: la zona subrayada marca el destino.
        button.addEventListener('pointerdown', (event) => {
          if (event.button !== 0) return;
          if (event.shiftKey || event.ctrlKey || event.metaKey) {
            // Si otra silaba tenia el campo abierto, se guarda y pasa a formar parte de la seleccion (sin foco en ninguna).
            event.preventDefault();
            const anchor = lyricDraft && { mi: lyricDraft.mi, at: lyricDraft.at, staff: lyricDraft.staff };
            if (lyricDraft && lyricDraft.finish) lyricDraft.finish(true);
            toggleLyricPick(anchor, { mi, at: lyric.at, staff });
            stage.focus({ preventScroll: true });
            return;
          }
          button.dataset.dragged = '';
          const startX = event.clientX, startY = event.clientY;
          let moving = false;
          const move = (e) => {
            const dx = e.clientX - startX, dy = e.clientY - startY;
            if (!moving && Math.hypot(dx, dy) < 5) return;
            if (!moving) { moving = true; button.dataset.dragged = '1'; button.classList.add('is-dragging'); }
            button.style.translate = dx + 'px ' + dy + 'px';
            const zone = lyricZoneAt(e.clientX, e.clientY, staff);
            showLyricZone(zone && (zone.mi !== mi || zone.at !== lyric.at) ? zone : null, staff);
          };
          const end = (e) => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', end);
            window.removeEventListener('pointercancel', end);
            if (!moving) return;
            const zone = e.type === 'pointerup' ? lyricZoneAt(e.clientX, e.clientY, staff) : null;
            button.classList.remove('is-dragging');
            button.style.translate = '';
            showLyricZone(null, staff);
            setTimeout(() => { button.dataset.dragged = ''; });
            if (zone && !change(() => M.moveLyric(score, mi, lyric.at, zone.mi, zone.at, staff))) say('');
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', end);
          window.addEventListener('pointercancel', end);
        });
        button.addEventListener('keydown', (event) => {
          if (event.key !== 'Delete' && event.key !== 'Backspace') return;
          event.preventDefault();
          change(() => M.removeLyric(score, mi, lyric.at, staff));
        });
        stage.appendChild(button);
      });
    });
    if (lyricDraft) mountLyricDraft();
  }

  // Un boton transparente sobre cada nombre dibujado: abre el popup con su digitacion.
  function mountChords() {
    chordZone = null;
    if (!chordsOn) return;
    const origin = stage.getBoundingClientRect();
    const used = new Set();
    Object.keys(score.chords || {}).forEach((key) => {
      const mi = Number(key);
      const dirs = [...stage.querySelectorAll('[id="m' + mi + '"] g.dir')].filter(isChordDir);
      score.chords[mi].forEach((chord) => {
        const dir = dirs.find((node) => !used.has(node) && squash(node.textContent) === squash(chord.name));
        if (!dir) return;
        used.add(dir);
        // Verovio lo pega al pentagrama: se sube a la linea donde se escribio, sobre el mismo lugar que mostro la zona.
        const scale = dir.getScreenCTM() && dir.getScreenCTM().a;
        let lift = chordLineY(chordBand(mi)) - 5 + origin.top - dir.getBoundingClientRect().bottom;
        // Los nombres de acordes van siempre sobre las etiquetas de intervalos.
        const own = dir.getBoundingClientRect();
        const clear = Math.min(Infinity, ...[...stage.querySelectorAll('[id="m' + mi + '"] g.dir')].filter(isIntervalDir).map((node) => node.getBoundingClientRect()).filter((r) => r.right > own.left - 2 && r.left < own.right + 2).map((r) => r.top));
        if (clear < Infinity) lift = Math.min(lift, clear - CHORD_GAP - own.bottom);
        if (scale) dir.setAttribute('transform', 'translate(0 ' + lift / scale + ') ' + (dir.getAttribute('transform') || ''));
        const box = dir.getBoundingClientRect();
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'score-chord-trigger';
        button.dataset.measure = mi;
        button.dataset.at = chord.at;
        button.setAttribute('aria-label', t.chord + ': ' + chord.name);
        button.setAttribute('aria-haspopup', 'dialog');
        button.style.left = box.left - origin.left - 4 + 'px';
        button.style.top = box.top - origin.top - 2 + 'px';
        button.style.width = box.width + 8 + 'px';
        button.style.height = box.height + 4 + 'px';
        let wasOpen = false;
        // Un click sobre el nombre con su popup abierto lo cierra: el pointerdown ya lo descarto antes de que llegue el click.
        button.addEventListener('pointerdown', () => { wasOpen = !!chordPopup && chordPopup.matches(':popover-open') && !!chordOpen && chordOpen.mi === mi && chordOpen.at === chord.at; });
        button.addEventListener('click', () => { if (!wasOpen && !button.dataset.dragged) openChord(mi, chord.at); });
        // Arrastrar el nombre lo lleva a otro tiempo: la zona subrayada marca el destino y al soltar se mueve.
        button.addEventListener('pointerdown', (event) => {
          if (event.button !== 0) return;
          delete button.dataset.dragged;
          const startX = event.clientX, startY = event.clientY;
          let moving = false;
          const move = (e) => {
            const dx = e.clientX - startX, dy = e.clientY - startY;
            if (!moving && Math.hypot(dx, dy) < 5) return;
            if (!moving) {
              moving = true;
              chordMove = { mi, at: chord.at };
              button.dataset.dragged = '1';
              button.classList.add('is-dragging');
              if (chordPopup) chordPopup.hidePopover();
            }
            button.style.translate = dx + 'px ' + dy + 'px';
            const zone = chordZoneAt(e.clientX, e.clientY);
            showChordZone(zone && (zone.mi !== mi || zone.at !== chord.at) ? zone : null);
          };
          const end = (e) => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', end);
            window.removeEventListener('pointercancel', end);
            if (!moving) return;
            const zone = e.type === 'pointerup' ? chordZoneAt(e.clientX, e.clientY) : null;
            chordMove = null;
            button.classList.remove('is-dragging');
            button.style.translate = '';
            showChordZone(null);
            setTimeout(() => delete button.dataset.dragged);
            if (zone) change(() => M.moveChord(score, mi, chord.at, zone.mi, zone.at));
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', end);
          window.addEventListener('pointercancel', end);
        });
        // Doble clic renombra; Suprimir o Retroceso quitan el acorde.
        button.addEventListener('dblclick', () => { if (chordPopup) chordPopup.hidePopover(); startChordDraft(mi, chord.at, chord.name); });
        button.addEventListener('keydown', (event) => {
          if (event.key !== 'Delete' && event.key !== 'Backspace') return;
          event.preventDefault();
          if (chordPopup) chordPopup.hidePopover();
          change(() => M.removeChord(score, mi, chord.at));
        });
        stage.appendChild(button);
      });
    });
    if (chordDraft) mountChordDraft();
    markChords();
    refreshChordPopup();
  }

  function buildChordPopup() {
    chordPopup = document.createElement('div');
    chordPopup.id = 'scoreChordPopup';
    chordPopup.className = 'score-meter-popup score-chord-popup';
    chordPopup.setAttribute('popover', 'auto');
    chordPopup.setAttribute('role', 'dialog');
    chordPopup.setAttribute('aria-label', t.chord);
    const picture = document.createElement('div');
    picture.className = 'score-chord-picture';
    const unknown = document.createElement('p');
    unknown.className = 'score-chord-unknown';
    unknown.textContent = t.chordUnknown;
    const nav = document.createElement('div');
    nav.className = 'score-chord-variants';
    const previous = document.createElement('button');
    previous.type = 'button';
    previous.setAttribute('aria-label', t.chordPrev);
    previous.title = t.chordPrev;
    previous.innerHTML = lucide('chevronLeft');
    const next = document.createElement('button');
    next.type = 'button';
    next.setAttribute('aria-label', t.chordNext);
    next.title = t.chordNext;
    next.innerHTML = lucide('chevronRight');
    const count = document.createElement('span');
    count.setAttribute('aria-live', 'polite');
    nav.append(previous, count, next);
    const search = document.createElement('div');
    search.className = 'score-chord-search';
    const field = document.createElement('input');
    field.type = 'search';
    field.autocomplete = 'off';
    field.spellcheck = false;
    field.maxLength = M.MAX_CHORD_NAME;
    field.placeholder = t.chordSearch;
    field.setAttribute('aria-label', t.chordSearch);
    const results = document.createElement('ul');
    results.className = 'score-chord-results';
    const box = document.createElement('label');
    box.className = 'score-chord-searchbox';
    box.insertAdjacentHTML('beforeend', lucide('search'));
    box.append(field);
    search.append(box, results, unknown);
    chordPopup.append(picture, search, nav);
    document.querySelector('.score-page').appendChild(chordPopup);
    chordPopup.parts = { picture, unknown, nav, previous, next, count, search, field, results };

    // Elegir un resultado reemplaza el nombre del acorde; la digitacion pasa a ser la de ese nombre.
    const pick = (name) => {
      const open = chordOpen;
      if (open && M.chordAt(score, open.mi, open.at)) change(() => M.setChord(score, open.mi, open.at, name));
    };
    const fill = () => {
      const found = chordLib && chordLib.search ? chordLib.search.matchChords(field.value, chordLib.rows).slice(0, 6) : [];
      results.replaceChildren(...found.map((chord) => {
        const item = document.createElement('li');
        const button = document.createElement('button');
        button.type = 'button';
        const name = document.createElement('span');
        name.textContent = chord.name;
        button.append(name, chordLib.drawDiagram(chordLib.positionsOf(chord)[0], t.chordDiagram.replace('{name}', chord.name)));
        button.addEventListener('click', () => pick(chord.name));
        item.append(button);
        return item;
      }));
      unknown.hidden = !!found.length || !chordLib;
    };
    chordPopup.fillSearch = fill;
    field.addEventListener('input', fill);
    field.addEventListener('keydown', (event) => {
      event.stopPropagation();
      if (event.key === 'Enter') {
        event.preventDefault();
        const first = results.querySelector('button');
        if (first) first.click();
      }
    });

    const step = (delta) => {
      const open = chordOpen;
      const chord = open && M.chordAt(score, open.mi, open.at);
      const found = chord && chordLib && chordLib.findChord(chordLib.index, chord.name);
      if (!found) return;
      const total = Math.min(chordLib.positionsOf(found).length, M.MAX_CHORD_VARIANTS);
      const variant = ((chord.variant || 0) + delta + total) % total;
      change(() => M.setChord(score, open.mi, open.at, chord.name, variant));
    };
    previous.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    chordPopup.addEventListener('toggle', (event) => {
      if (event.newState === 'closed') chordOpen = null;
      stage.querySelectorAll('.score-chord-trigger').forEach((button) => {
        button.setAttribute('aria-expanded', String(event.newState === 'open' && !!chordOpen && Number(button.dataset.measure) === chordOpen.mi && Number(button.dataset.at) === chordOpen.at));
      });
    });
  }

  // Un click fuera termina el campo de escritura y cierra el popup, aunque otro manejador del escenario atienda el click.
  document.addEventListener('pointerdown', (event) => {
    if (chordDraft && chordDraft.finish && !event.target.closest('.score-chord-draft')) chordDraft.finish(true);
    if (chordPopup && chordPopup.matches(':popover-open') && !event.target.closest('.score-chord-popup, .score-chord-trigger')) chordPopup.hidePopover();
  }, true);

  async function openChord(mi, at) {
    if (!chordPopup) buildChordPopup();
    chordOpen = { mi, at };
    await loadChords();
    if (!chordOpen || chordOpen.mi !== mi || chordOpen.at !== at) return;
    refreshChordPopup(true);
  }

  // Dibuja el popup del acorde abierto (nombre, digitacion y variante) junto a su nombre, o lo cierra si ya no existe.
  function refreshChordPopup(show) {
    if (!chordPopup || !chordOpen) return;
    const { mi, at } = chordOpen;
    const chord = M.chordAt(score, mi, at);
    const trigger = chord && stage.querySelector('.score-chord-trigger[data-measure="' + mi + '"][data-at="' + at + '"]');
    if (!trigger) { if (chordPopup.matches(':popover-open')) chordPopup.hidePopover(); chordOpen = null; return; }
    if (!show && !chordPopup.matches(':popover-open')) return;
    const { picture, unknown, nav, previous, next, count, search, field } = chordPopup.parts;
    const found = chordLib && chordLib.findChord(chordLib.index, chord.name);
    const positions = found ? chordLib.positionsOf(found).slice(0, M.MAX_CHORD_VARIANTS) : [];
    const variant = Math.min(chord.variant || 0, Math.max(positions.length - 1, 0));
    picture.replaceChildren();
    if (positions.length) picture.append(chordLib.drawDiagram(positions[variant], t.chordDiagram.replace('{name}', chord.name)));
    picture.hidden = !positions.length;
    const searching = !positions.length && !!chordLib;
    if (searching && search.dataset.for !== mi + ':' + at + ':' + chord.name) {
      search.dataset.for = mi + ':' + at + ':' + chord.name;
      field.value = chord.name;
      chordPopup.fillSearch();
    }
    if (!searching) delete search.dataset.for;
    search.hidden = !searching;
    nav.hidden = positions.length < 2;
    count.textContent = t.chordVariant.replace('{n}', variant + 1).replace('{total}', positions.length);
    previous.disabled = next.disabled = positions.length < 2;
    if (!chordPopup.matches(':popover-open')) chordPopup.showPopover();
    const anchor = trigger.getBoundingClientRect();
    const box = chordPopup.getBoundingClientRect();
    const below = anchor.bottom + 6;
    chordPopup.style.left = Math.max(8, Math.min(anchor.left + anchor.width / 2 - box.width / 2, window.innerWidth - box.width - 8)) + 'px';
    chordPopup.style.top = Math.max(8, below + box.height > window.innerHeight - 8 ? anchor.top - box.height - 6 : below) + 'px';
  }

  // ---- reguladores (crescendo y diminuendo) -------------------------------------
  // Un regulador elegido muestra dos asas (debajo de sus extremos) para ensancharlo y, a cada lado, la dinamica de ese extremo:
  // la escrita o, si falta, un placeholder con la sugerida (p -> f en crescendo, f -> p en diminuendo).
  // Las dinamicas escritas se pueden editar tambien sin elegir antes el regulador.

  const DYNAMIC_SUGGESTED = { cresc: { start: 'p', end: 'f' }, dim: { start: 'f', end: 'p' } };

  const dynamicsPopup = document.createElement('div');
  dynamicsPopup.id = 'scoreDynamicsPopup';
  dynamicsPopup.className = 'score-meter-popup score-dynamics-popup';
  dynamicsPopup.setAttribute('popover', 'auto');
  dynamicsPopup.setAttribute('role', 'dialog');
  dynamicsPopup.setAttribute('aria-label', t.dynamic);
  const dynamicsTitle = document.createElement('p');
  dynamicsPopup.appendChild(dynamicsTitle);
  const dynamicsOptions = document.createElement('div');
  dynamicsOptions.className = 'score-dynamics-options';
  dynamicsPopup.appendChild(dynamicsOptions);
  document.querySelector('.score-page').appendChild(dynamicsPopup);
  let dynamicsTarget = null; // { mi, at, side } del extremo cuya dinamica se esta eligiendo

  function chooseDynamic(value) {
    const target = dynamicsTarget;
    dynamicsPopup.hidePopover();
    if (target && !target.side) {
      change(() => M.setDynamic(score, target.mi, target.at, value));
      stage.focus({ preventScroll: true });
      return;
    }
    const h = target && M.findHairpin(score, target.mi, target.at);
    if (!h || (h[target.side === 'start' ? 'startDyn' : 'endDyn'] || null) === value) return;
    change(() => M.setHairpinDynamic(score, target.mi, h, target.side, value));
    stage.focus({ preventScroll: true });
  }

  M.DYNAMICS.forEach((value) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.dynamic = value;
    button.textContent = value;
    button.setAttribute('aria-label', value);
    button.addEventListener('click', () => chooseDynamic(value));
    dynamicsOptions.appendChild(button);
  });
  const dynamicsNone = document.createElement('button');
  dynamicsNone.type = 'button';
  dynamicsNone.className = 'score-dynamics-none';
  dynamicsNone.innerHTML = '<span></span>';
  dynamicsNone.firstChild.textContent = t.dynamicNone;
  dynamicsNone.addEventListener('click', () => chooseDynamic(null));
  dynamicsOptions.appendChild(dynamicsNone);

  function openDynamicsPopup(anchor, mi, at, side) {
    if (dynamicsPopup.matches(':popover-open')) { dynamicsPopup.hidePopover(); return; }
    const h = M.findHairpin(score, mi, at);
    if (side && !h) return;
    dynamicsTarget = { mi, at, side };
    const current = !side ? score.dynamics?.[mi]?.find((mark) => mark.at === at)?.value : side === 'start' ? h.startDyn : h.endDyn;
    dynamicsTitle.textContent = !side ? t.dynamic : side === 'start' ? t.dynamicStart : t.dynamicEnd;
    [...dynamicsOptions.querySelectorAll('[data-dynamic]')].forEach((option) => option.setAttribute('aria-pressed', String(option.dataset.dynamic === current)));
    dynamicsNone.setAttribute('aria-pressed', String(!current));
    dynamicsPopup.showPopover();
    const box = anchor.getBoundingClientRect();
    const popup = dynamicsPopup.getBoundingClientRect();
    dynamicsPopup.style.left = Math.max(8, Math.min(box.left, window.innerWidth - popup.width - 8)) + 'px';
    dynamicsPopup.style.top = Math.max(8, Math.min(box.bottom + 6, window.innerHeight - popup.height - 8)) + 'px';
    (dynamicsOptions.querySelector('[aria-pressed="true"]') || dynamicsOptions.firstElementChild).focus({ preventScroll: true });
  }

  // Los g.hairpin de un compas, de izquierda a derecha: el orden de su lista, porque no se pisan.
  function hairpinNodes(mi) {
    const measure = stage.querySelector('[id="m' + mi + '"]');
    return measure ? [...measure.querySelectorAll('g.hairpin')].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left) : [];
  }

  // Final del regulador como tiempo desde el inicio de su compas (puede pasar a compases siguientes).
  function hairpinEnd(h, mi) {
    const last = mi + (h.span || 0);
    return measureOffset(mi, last) + (h.to || M.capacity(score, last));
  }

  // El regulador `h` con un extremo movido a `time` (desde el inicio de su compas).
  function hairpinWith(h, mi, side, time) {
    if (side === 'start') return Object.assign({}, h, { at: time });
    const point = barrePoint(mi, time);
    return Object.assign({}, h, { span: point.mi - mi, to: point.at });
  }

  // Tiempos validos de un extremo: inicios (comienzo) o finales (fin) de figura y bordes de compas, sin pisar a otro regulador.
  // El comienzo se queda en su compas; el fin puede pasar a los siguientes de la misma fila.
  function hairpinTimes(mi, h, side) {
    const all = M.measures(score);
    const lastMeasure = side === 'start' ? mi : Math.min(M.rowOf(score, mi).last, all.length - 1);
    const times = new Set(side === 'start' ? [0] : []);
    for (let k = mi; k <= lastMeasure; k += 1) {
      const starts = M.onsets(all[k]);
      if (side === 'end') times.add(measureOffset(mi, k + 1));
      all[k].forEach((ev, i) => times.add(measureOffset(mi, k) + (side === 'start' ? starts[i] : Math.min(M.capacity(score, k), starts[i] + M.length(ev)))));
      // Y cada semicorchea, para ajustarlo con fineza y tambien en compases sin figuras; no dentro de una figura, donde
      // MusicXML no puede anclar el extremo.
      for (let step = M.GRID; step < M.capacity(score, k); step += M.GRID) {
        if (!all[k].some((ev, i) => starts[i] < step && step < starts[i] + M.length(ev))) times.add(measureOffset(mi, k) + step);
      }
    }
    return [...times].filter((time) => M.hairpinFits(score, mi, hairpinWith(h, mi, side, time), h)).sort((a, b) => a - b);
  }

  function resizeHairpin(mi, h, side, time) {
    const candidate = hairpinWith(h, mi, side, time);
    if (candidate.at === h.at && hairpinEnd(candidate, mi) === hairpinEnd(h, mi)) return;
    change(() => {
      const saved = M.setHairpin(score, mi, candidate, h);
      if (saved) selectedHairpin = { mi, at: saved.at };
      return saved;
    });
  }

  let hairpinResize = null;
  function beginHairpinResize(event, mi, h, side, line) {
    event.preventDefault();
    event.stopPropagation();
    clearHoverGhost();
    const origin = stage.getBoundingClientRect();
    const times = hairpinTimes(mi, h, side);
    if (!times.length) return;
    const anchors = new Map();
    // Tiempo desde el inicio del compas del regulador -> x, usando el compas donde cae.
    const xAt = (time) => {
      const point = barrePoint(mi, time);
      if (!anchors.has(point.mi)) anchors.set(point.mi, { starts: M.onsets(M.measures(score)[point.mi]), centers: eventNodes(point.mi).map((node) => centerX(node, origin)) });
      const { starts, centers } = anchors.get(point.mi);
      return xAtTime(point.at, layout[point.mi], starts, centers);
    };
    // El regulador se redibuja en vivo: el original se oculta y una copia cambia de ancho con el puntero.
    const node = hairpinNodes(mi)[score.hairpins[mi].indexOf(h)];
    const poly = node && node.querySelector('polyline');
    const width = poly ? parseFloat(poly.getAttribute('stroke-width')) * (poly.getScreenCTM()?.a || 0.06) : 1.5;
    const top = line.top - origin.top, bottom = line.bottom - origin.top, middle = (top + bottom) / 2;
    const fixed = (side === 'end' ? line.left : line.right) - origin.left;
    const live = document.createElementNS(SVG_NS, 'svg');
    live.setAttribute('class', 'score-hairpin-ui score-hairpin-live');
    live.setAttribute('width', stage.clientWidth);
    live.setAttribute('height', stage.clientHeight);
    const shape = document.createElementNS(SVG_NS, 'polyline');
    shape.setAttribute('fill', 'none');
    shape.setAttribute('stroke-width', width);
    live.appendChild(shape);
    stage.appendChild(live);
    if (node) node.style.visibility = 'hidden';
    const moving = [stage.querySelector('.score-hairpin-grip[data-side="' + side + '"]'), stage.querySelector('.score-hairpin-dyn[data-side="' + side + '"]')]
      .filter(Boolean).map((el) => ({ el, left: parseFloat(el.style.left) }));
    const place = (x) => {
      // El vertice queda del lado que cierra el regulador y la boca del lado que abre.
      const left = Math.min(fixed, x), right = Math.max(fixed, x);
      const tip = h.kind === 'cresc' ? left : right, mouth = h.kind === 'cresc' ? right : left;
      shape.setAttribute('points', mouth + ',' + top + ' ' + tip + ',' + middle + ' ' + mouth + ',' + bottom);
      const edge = (side === 'end' ? line.right : line.left) - origin.left;
      moving.forEach((item) => { item.el.style.left = item.left + x - edge + 'px'; });
    };
    hairpinResize = {
      id: event.pointerId,
      move(e) {
        const x = e.clientX - origin.left;
        let best = null;
        times.forEach((time) => {
          const tx = xAt(time);
          if (!best || Math.abs(tx - x) < Math.abs(best.x - x)) best = { time, x: tx };
        });
        this.pick = best.time;
        place(best.x);
      },
      finish(commit) {
        live.remove();
        if (node) node.style.visibility = '';
        hairpinResize = null;
        if (commit && this.pick !== undefined) resizeHairpin(mi, h, side, this.pick);
      },
    };
    hairpinResize.move(event);
  }

  document.addEventListener('pointermove', (event) => {
    if (hairpinResize && event.pointerId === hairpinResize.id) hairpinResize.move(event);
  });
  document.addEventListener('pointerup', (event) => {
    if (hairpinResize && event.pointerId === hairpinResize.id) hairpinResize.finish(true);
  });
  document.addEventListener('pointercancel', (event) => {
    if (hairpinResize && event.pointerId === hairpinResize.id) hairpinResize.finish(false);
  });

  function selectHairpin(mi, at) {
    deactivateTool();
    setPicks([]);
    clearBarSelection();
    selectedHairpin = { mi, at };
    stage.focus({ preventScroll: true });
    markSelected();
  }

  // Una zona transparente sobre cada regulador lo hace facil de elegir (las lineas son finas); el elegido ademas lleva sus asas.
  function mountHairpinControls() {
    stage.querySelectorAll('.score-hairpin-ui').forEach((node) => node.remove());
    const origin = stage.getBoundingClientRect();
    Object.keys(score.hairpins || {}).forEach((key) => {
      const mi = Number(key);
      const nodes = hairpinNodes(mi);
      score.hairpins[mi].forEach((h, i) => {
        const node = nodes[i];
        if (!node) return;
        const box = node.getBoundingClientRect();
        const picked = !!selectedHairpin && selectedHairpin.mi === mi && selectedHairpin.at === h.at;
        const hit = document.createElement('button');
        hit.type = 'button';
        hit.tabIndex = -1;
        hit.className = 'score-hairpin-ui score-hairpin-hit';
        hit.setAttribute('aria-label', h.kind === 'cresc' ? t.hairpinCresc : t.hairpinDim);
        hit.setAttribute('aria-pressed', String(picked));
        hit.style.left = (box.left - origin.left - 4) + 'px';
        hit.style.top = (box.top - origin.top - 6) + 'px';
        hit.style.width = (box.width + 8) + 'px';
        hit.style.height = (box.height + 12) + 'px';
        hit.addEventListener('pointerdown', (event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          selectHairpin(mi, h.at);
        });
        stage.appendChild(hit);
        if (picked) {
          node.classList.add('is-selected');
          mountHairpinHandles(mi, h, box, origin);
        }
        mountHairpinDynamics(mi, h, box, origin, picked);
      });
    });
  }

  function mountDynamicControls() {
    const origin = stage.getBoundingClientRect();
    const hairpins = Object.entries(score.hairpins || {}).flatMap(([first, list]) => list.map((h) => ({
      first: +first, h, begin: measureOffset(0, +first) + h.at,
      end: measureOffset(0, +first) + hairpinEnd(h, +first),
    })));
    Object.entries(score.dynamics || {}).forEach(([mi, marks]) => {
      // Verovio generates its own ids for dynamics. Pair them by musical time and horizontal order.
      const times = new Set(marks.map((entry) => entry.at));
      hairpins.forEach(({ first, h, begin, end }) => {
        const previous = hairpins.find((other) => other.end === begin);
        if (first === +mi && (h.startDyn || previous?.h.endDyn)) times.add(h.at);
        if (first + (h.span || 0) === +mi && h.endDyn && !hairpins.some((other) => other.begin === end)) times.add(h.to ?? M.capacity(score, +mi));
      });
      const nodes = [...stage.querySelectorAll('[id="m' + mi + '"] g.dynam')].sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left);
      const order = [...times].sort((a, b) => a - b);
      marks.forEach((mark) => {
        const node = nodes[order.indexOf(mark.at)];
        if (!node) return;
        const box = node.getBoundingClientRect();
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'score-hairpin-ui score-hairpin-dyn has-value score-dynamic-trigger';
        button.setAttribute('aria-label', t.dynamic + ': ' + mark.value);
        button.setAttribute('aria-haspopup', 'dialog');
        button.style.left = box.left - origin.left - 3 + 'px';
        button.style.top = box.top - origin.top - 3 + 'px';
        button.style.width = box.width + 6 + 'px';
        button.style.height = box.height + 6 + 'px';
        button.addEventListener('click', () => openDynamicsPopup(button, +mi, mark.at));
        button.addEventListener('keydown', (event) => {
          if (event.key !== 'Delete' && event.key !== 'Backspace') return;
          event.preventDefault();
          event.stopPropagation();
          change(() => M.setDynamic(score, +mi, mark.at, null));
        });
        stage.appendChild(button);
      });
    });
  }

  function mountHairpinHandles(mi, h, box, origin) {
    [['start', box.left], ['end', box.right]].forEach(([side, edge]) => {
      const x = edge - origin.left;
      const grip = document.createElement('button');
      grip.type = 'button';
      grip.className = 'score-hairpin-ui score-hairpin-grip';
      grip.dataset.side = side;
      grip.setAttribute('aria-label', side === 'start' ? t.hairpinStart : t.hairpinEnd);
      grip.innerHTML = lucide('move-horizontal');
      grip.style.left = x + 'px';
      grip.style.top = (box.bottom - origin.top + 8) + 'px';
      grip.addEventListener('pointerdown', (event) => beginHairpinResize(event, mi, h, side, box));
      grip.addEventListener('keydown', (event) => {
        const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
        if (!step) return;
        event.preventDefault();
        event.stopPropagation();
        const times = hairpinTimes(mi, h, side);
        const next = times[times.indexOf(side === 'start' ? h.at : hairpinEnd(h, mi)) + step];
        if (next === undefined) return;
        resizeHairpin(mi, h, side, next);
        stage.querySelector('.score-hairpin-grip[data-side="' + side + '"]')?.focus({ preventScroll: true });
      });
      stage.appendChild(grip);
    });
  }

  function mountHairpinDynamics(mi, h, box, origin, picked) {
    const reach = 3 * (layout[mi].lines[4] - layout[mi].lines[0]) / 4; // hasta donde una dinamica dibujada cuenta como de este extremo
    const middle = (box.top + box.bottom) / 2;
    [['start', box.left], ['end', box.right]].forEach(([side, edge]) => {
      const point = side === 'start' ? { mi, at: h.at } : barrePoint(mi, hairpinEnd(h, mi));
      if (score.dynamics?.[point.mi]?.some((mark) => mark.at === point.at)) return;
      const value = side === 'start' ? h.startDyn : h.endDyn;
      if (!picked && !value) return;
      const x = edge - origin.left;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'score-hairpin-ui score-hairpin-dyn';
      button.dataset.side = side;
      button.setAttribute('aria-label', side === 'start' ? t.dynamicStart : t.dynamicEnd);
      button.setAttribute('aria-haspopup', 'dialog');
      // Con dinamica escrita el boton cubre la que dibujo Verovio, junto a este extremo; sin ella, un placeholder con la sugerida.
      let drawn = null;
      if (value) {
        stage.querySelectorAll('g.dynam').forEach((node) => {
          const r = node.getBoundingClientRect();
          const gap = Math.abs((side === 'start' ? r.right - box.left : r.left - box.right));
          if (gap < reach && Math.abs((r.top + r.bottom) / 2 - middle) < reach && (!drawn || gap < drawn.gap)) drawn = { gap, r };
        });
      }
      if (drawn) {
        button.classList.add('has-value');
        button.style.left = (drawn.r.left - origin.left - 3) + 'px';
        button.style.top = (drawn.r.top - origin.top - 3) + 'px';
        button.style.width = (drawn.r.width + 6) + 'px';
        button.style.height = (drawn.r.height + 6) + 'px';
      } else {
        button.classList.add('is-empty');
        button.textContent = value || DYNAMIC_SUGGESTED[h.kind][side];
        button.style.left = (x + (side === 'start' ? -6 : 6)) + 'px';
        button.style.top = (middle - origin.top) + 'px';
      }
      button.addEventListener('click', () => openDynamicsPopup(button, mi, h.at, side));
      stage.appendChild(button);
    });
  }

  function mountNavigationMarks() {
    const mount = (node, first, last, mark) => {
      if (!node) return;
      node.dataset.navigationMark = mark;
      node.dataset.navigationFirst = first;
      node.dataset.navigationLast = last;
      node.classList.add('score-navigation-mark');
      // Transparent padding makes thin brackets and small glyphs easy to pick.
      const box = node.getBBox();
      const scale = node.getScreenCTM()?.a || 1;
      const pad = 5 / scale;
      const hit = document.createElementNS(SVG_NS, 'rect');
      hit.setAttribute('class', 'score-navigation-hit');
      // Verovio's embedded #svg rect rule overrides stylesheet selectors.
      hit.style.stroke = 'none';
      hit.setAttribute('x', box.x - pad);
      hit.setAttribute('y', box.y - pad);
      hit.setAttribute('width', box.width + pad * 2);
      hit.setAttribute('height', box.height + pad * 2);
      node.prepend(hit);
    };
    stage.querySelectorAll('g.measure').forEach((measure) => {
      const mi = Number(measure.id.slice(1));
      const nav = score.navigation?.[mi];
      if (nav?.segno) mount(measure.querySelector('g.repeatMark'), mi, mi, 'segno');
      if (nav?.dc) mount(measure.querySelector('g.dir.dacapo'), mi, mi, 'dc');
      if (nav?.ds) mount(measure.querySelector('g.dir.dalsegno'), mi, mi, 'ds');
    });
    const endings = M.navigationEndings(score);
    stage.querySelectorAll('g.system').forEach((system) => {
      const measures = [...system.querySelectorAll('g.measure')].map((measure) => Number(measure.id.slice(1)));
      if (!measures.length) return;
      const spans = endings.filter((ending) => ending.first <= measures[measures.length - 1] && ending.last >= measures[0]);
      system.querySelectorAll('g.ending > g.voltaBracket').forEach((bracket, i) => {
        const span = spans[i];
        if (span) mount(bracket, span.first, span.last, span.mark);
      });
    });
  }

  // Verovio conserva startid: se usa para encontrar la ligadura del modelo,
  // incluso cuando su arco se dibuja en varios renglones.
  function mountLinks() {
    const links = M.links(score);
    stage.querySelectorAll('g.tie, g.slur').forEach((node) => {
      let startid = '';
      const id = node.id || [...node.classList].find((name) => name.startsWith('id-'))?.slice(3);
      if (!id) return;
      try { startid = String(toolkit.getElementAttr(id).startid || '').replace(/^#/, ''); } catch { return; }
      const start = stage.querySelector('[id="' + startid + '"]');
      const ref = start && refOfNode(start);
      const link = ref && links.find((link) => same(link.from, ref) && node.classList.contains(link.type));
      if (!link) return;
      linkRefs.set(node, [link.from, link.to]);
      node.querySelectorAll('path').forEach((path) => {
        const hit = path.cloneNode(false);
        hit.removeAttribute('id');
        hit.setAttribute('class', 'score-link-hit');
        node.prepend(hit);
      });
    });
  }

  function selectNavigation(node, event) {
    const pick = { first: Number(node.dataset.navigationFirst), last: Number(node.dataset.navigationLast), mark: node.dataset.navigationMark };
    const previous = event.shiftKey || event.ctrlKey || event.metaKey ? selectedNavigation.slice() : [];
    setPicks([]);
    clearBarSelection();
    deactivateTool();
    const index = previous.findIndex((p) => p.first === pick.first && p.mark === pick.mark);
    if (index >= 0) previous.splice(index, 1); else previous.push(pick);
    selectedNavigation = previous;
    stage.focus({ preventScroll: true });
    markSelected();
  }

  function markSelected() {
    stage.querySelectorAll('.is-selected').forEach((n) => n.classList.remove('is-selected'));
    if (!selected) group = [];
    const nodes = picks().map((p) => nodeOf(p));
    if (nodes.some((node) => !node)) {
      selected = null;
      group = [];
    } else if (!lyricOnly) nodes.forEach((node) => node.classList.add('is-selected'));
    markLyrics();
    selectedNavigation = selectedNavigation.filter((pick) =>
      Array.from({ length: pick.last - pick.first + 1 }, (_, i) => score.navigation?.[pick.first + i]?.[pick.mark]).some(Boolean));
    stage.querySelectorAll('[data-navigation-mark]').forEach((node) => {
      if (selectedNavigation.some((pick) => pick.first === Number(node.dataset.navigationFirst) && pick.mark === node.dataset.navigationMark)) node.classList.add('is-selected');
    });
    if (selectedLink && !selectedLink.node.isConnected) selectedLink = null;
    stage.querySelectorAll('g.tie, g.slur').forEach((node) => {
      const refs = linkRefs.get(node);
      if (selectedLink && refs && same(refs[0], selectedLink.refs[0])) node.classList.add('is-selected');
    });
    if (selectedBeam && !selectedBeam.node.isConnected) selectedBeam = null;
    if (selectedHairpin && !M.findHairpin(score, selectedHairpin.mi, selectedHairpin.at)) selectedHairpin = null;
    mountHairpinControls();
    mountDynamicControls();
    // Highlight a connection only when all its figures are selected, or when
    // the beam itself was picked. This does not change what Delete acts on.
    stage.querySelectorAll('g.beam').forEach((beam) => {
      const figures = [...beam.querySelectorAll('g.note, g.rest')];
      const fullySelected = figures.length > 0 && figures.every((node) => node.classList.contains('is-selected'));
      if (beam === selectedBeam?.node || fullySelected) {
        beam.querySelectorAll(':scope > polygon').forEach((node) => node.classList.add('is-selected'));
      }
    });
    rememberPlaybackSelection();
    updateSelectionMenu();
  }

  // ---- menu contextual de la seleccion --------------------------------------

  function hideSelectionMenu() {
    stage.querySelector('.score-selection-menu')?.remove();
  }

  // Aparece junto a las figuras elegidas con lo que se puede hacer con ellas; se va al cambiar la seleccion.
  function updateSelectionMenu() {
    hideSelectionMenu();
    const list = picks();
    if (!list.length || drag?.active) return;
    const actions = M.selectionActions(score, list, toolOn('voices', false) && !M.voicePerStaff(score) ? shownVoices : []).filter((action) => action !== 'mergeLyrics' || lyricsActive());
    if (!actions.length) return;
    const origin = stage.getBoundingClientRect();
    let boxes = list.map((p) => nodeOf(p).getBoundingClientRect());
    // Con figuras en renglones distintos la caja envolvente queda lejos de todas: el menu se ancla sobre la primera.
    const first = boxes.reduce((a, b) => (b.top < a.top ? b : a));
    if (boxes.some((b) => b.top > first.bottom)) boxes = [first];
    const top = Math.min(...boxes.map((b) => b.top)) - origin.top;
    const bottom = Math.max(...boxes.map((b) => b.bottom)) - origin.top;
    const left = Math.min(...boxes.map((b) => b.left)) - origin.left;
    const menu = document.createElement('div');
    menu.className = 'score-selection-menu';
    menu.setAttribute('role', 'toolbar');
    menu.setAttribute('aria-label', t.selectionActions);
    actions.forEach((action) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'score-selection-action';
      button.dataset.action = action;
      const voice = action.startsWith('assignVoice') ? Number(action.slice(11)) : null;
      if (voice) {
        button.setAttribute('aria-label', t.assignVoice.replace('{n}', voice));
        const [before, after] = t.assignVoice.split('{n}');
        const icon = document.createElement('span');
        icon.className = 'score-voice-swatch';
        icon.dataset.voice = String(voice);
        icon.textContent = String(voice);
        icon.setAttribute('aria-hidden', 'true');
        button.append(document.createTextNode(before), icon, document.createTextNode(after));
      } else {
        button.innerHTML = lucide(ACTION_ICONS[action]) + '<span></span>';
        button.lastChild.textContent = t[action];
      }
      button.addEventListener('click', () => applyAction(action));
      menu.appendChild(button);
    });
    stage.appendChild(menu);
    const width = menu.offsetWidth;
    const height = menu.offsetHeight;
    menu.style.left = Math.max(4, Math.min(stage.clientWidth - width - 4, left)) + 'px';
    menu.style.top = (top - height - 12 >= 4 ? top - height - 12 : bottom + 12) + 'px';
  }

  // ---- hit-testing --------------------------------------------------------

  function eventNodes(mi, staff = 0) {
    const nodes = [];
    for (let i = 0; ; i += 1) {
      const node = stage.querySelector('[id="' + M.ID_PREFIX[staff] + mi + '-' + i + '"]');
      if (!node) break;
      nodes.push(node);
    }
    return nodes;
  }

  function centerX(node, origin) {
    const head = node.querySelector('.notehead') || node;
    const r = head.getBoundingClientRect();
    return (r.left + r.right) / 2 - origin.left;
  }

  // Tiempo (en divisiones) que le corresponde a una x dentro del compas, interpolando entre las figuras ya dibujadas.
  function timeAt(x, m, starts, centers) {
    const anchors = [{ x: m.start, t: 0 }, { x: m.right, t: M.capacity(score, layout.indexOf(m)) }];
    centers.forEach((c, i) => anchors.push({ x: c, t: starts[i] }));
    anchors.sort((p, q) => p.x - q.x || p.t - q.t);
    for (let k = 1; k < anchors.length; k += 1) {
      const a = anchors[k - 1];
      const b = anchors[k];
      if (x <= a.x && a.t === 0) return 0;
      if (x <= b.x && b.x > a.x) return a.t + ((x - a.x) / (b.x - a.x)) * (b.t - a.t);
    }
    return M.capacity(score, layout.indexOf(m));
  }

  // Donde queda lo que se suelta en (clientX, clientY): el compas mas cercano, el tono por la altura y el
  // tiempo por la posicion horizontal. Sobre la columna de una nota cercana se alinea con ella.
  function locate(clientX, clientY, skip) {
    const origin = stage.getBoundingClientRect();
    const x = clientX - origin.left;
    const y = clientY - origin.top;
    let best = null;
    // Cada pentagrama de cada compas es un destino posible: gana el mas cercano, y lo que se suelta actua sobre el.
    layout.forEach((m, mi) => m.staves.forEach((lines, staff) => {
      const space = (lines[4] - lines[0]) / 4;
      const dx = Math.max(m.left - x, 0, x - m.right);
      const dy = Math.abs(y - lines[2]);
      if (dy > space * 7 || dx > space * 3) return;
      const cost = dy + dx * 2;
      if (best && cost >= best.cost) return;
      best = { mi, m, staff, lines, space, cost };
    }));
    if (!best) return null;
    const { mi, m, staff, lines, space } = best;
    const half = space / 2;
    const n = M.clampPitch(M.bottomLine(score, mi, staff) + Math.round((lines[4] - y) / half));
    const measure = M.measures(score, staff)[mi];
    const starts = M.onsets(measure);
    const centers = eventNodes(mi, staff).map((node) => centerX(node, origin));
    let at = timeAt(Math.max(m.left, Math.min(m.right, x)), m, starts, centers);
    let markX = Math.max(m.left, Math.min(m.right, x));
    const rawT = at, rawX = markX;
    const isOwn = (i) => skip && [].concat(skip).some((s) => staffOf(s) === staff && s.mi === mi && s.i === i);
    // A la derecha de la ultima columna el tiempo interpolado cae dentro de esa figura: la nueva empieza donde termina.
    const others = measure.map((o, i) => i).filter((i) => !isOwn(i));
    if (others.length && x > Math.max(...others.map((i) => centers[i]))) {
      const last = Math.max(...others.map((i) => starts[i]));
      at = Math.max(at, ...others.map((i) => starts[i] === last ? last + M.length(measure[i]) : 0));
    }
    // Sobre una nota o un silencio se alinea con su columna; entre columnas se puede intercalar.
    let near = null;
    centers.forEach((c, i) => {
      if (isOwn(i) || Math.abs(c - x) > space * 0.8) return;
      if (!near || Math.abs(c - x) < Math.abs(near.c - x)) near = { c, i };
    });
    if (near) {
      at = starts[near.i];
      markX = near.c;
    }
    const next = near ? null : others.filter(i => centers[i] > x).sort((a, b) => centers[a] - centers[b])[0];
    return {
      mi, staff, n, space, rawT, rawX,
      beforeAt: next == null ? null : starts[next],
      beforeFirst: others.length > 0 && x < Math.min(...others.map((i) => centers[i])) - space * 0.8,
      onNote: !!near && !measure[near.i].rest,
      t: at,
      x: markX,
      y: lines[4] - (n - M.bottomLine(score, mi, staff)) * half,
      top: lines[0],
      bottom: lines[4],
      systemTop: m.top,
      systemBottom: m.bottom,
    };
  }

  // La figura bajo el puntero o, con 8 px de margen, la mas cercana: cabezas y plicas son chicas.
  function eventUnder(clientX, clientY) {
    let best = null;
    stage.querySelectorAll('g.note, g.rest').forEach((node) => {
      const r = (node.querySelector('.notehead') || node).getBoundingClientRect();
      const dx = Math.max(r.left - clientX, 0, clientX - r.right);
      const dy = Math.max(r.top - clientY, 0, clientY - r.bottom);
      const distance = Math.hypot(dx, dy);
      if (distance <= 8 && (!best || distance < best.distance)) best = { node, distance };
    });
    return best ? refOfNode(best.node) : null;
  }

  // ---- arrastre -----------------------------------------------------------

  let marker = null;
  function showMarker(hit) {
    if (!marker) {
      marker = document.createElement('div');
      marker.className = 'score-marker';
      marker.innerHTML = '<span class="score-marker-line"></span>';
      stage.appendChild(marker);
    }
    marker.querySelectorAll('.score-marker-ledger, .score-marker-cell').forEach((node) => node.remove());
    if (!hit) { marker.hidden = true; return; }
    marker.hidden = false;
    const line = marker.firstChild;
    const item = drag ? drag.item : activeItem;
    if (item && item.kind === 'lyric') {
      // Sin guia vertical: se subraya la celda bajo la nota donde cabe la silaba.
      line.style.height = '0';
      const node = hit.onNote && hit.staff < M.lyricStaves(score) && lyricNote(hit.mi, hit.t, hit.staff);
      if (!node) return;
      const place = lyricLine(hit.mi, hit.staff, node);
      const cell = document.createElement('span');
      cell.className = 'score-marker-cell';
      cell.style.left = centerX(node, stage.getBoundingClientRect()) + 'px';
      cell.style.top = place.y + 'px';
      cell.style.width = place.space * 3 + 'px';
      marker.appendChild(cell);
      return;
    }
    const x = item?.kind === 'navigation' ? layout[hit.mi][['dc', 'ds'].includes(item.mark) ? 'right' : 'left']
      : item && item.kind === 'bar' && item.bar !== 'double' ? layout[hit.mi][item.bar === 'start' ? 'left' : 'right']
      : item && item.kind === 'bar' && item.bar === 'double' ? hit.rawX
      : item && (item.kind === 'barre' || item.kind === 'chord' || item.kind === 'lyric' || item.kind === 'hairpin' || item.kind === 'dynamic') && !hit.onNote ? layout[hit.mi].left : hit.x;
    line.style.left = x + 'px';
    // Notas y silencios marcan el pentagrama donde caen; barras, repeticiones y reguladores son de todo el renglon.
    const whole = item && item.kind !== 'note' && item.kind !== 'rest';
    const top = whole ? hit.systemTop : hit.top, bottom = whole ? hit.systemBottom : hit.bottom;
    line.style.top = top - hit.space * 2 + 'px';
    line.style.height = (bottom - top) + hit.space * 4 + 'px';
    // Una nota fuera del pentagrama muestra las lineas adicionales que le tocarian, una por cada espacio hasta su cabeza.
    if ((drag && drag.kind || activeItem && activeItem.kind) !== 'note') return;
    const beyond = (edge, sign) => {
      for (let k = 1; sign * (hit.y - edge) >= k * hit.space - 1; k += 1) {
        const ledger = document.createElement('span');
        ledger.className = 'score-marker-ledger';
        ledger.style.left = hit.x - hit.space * 1.1 + 'px';
        ledger.style.width = hit.space * 2.2 + 'px';
        ledger.style.top = edge + sign * k * hit.space - 1 + 'px';
        marker.appendChild(ledger);
      }
    };
    beyond(hit.top, -1);
    beyond(hit.bottom, 1);
  }

  function startGhost(source, event, kind) {
    const ghost = document.createElement('div');
    ghost.className = 'score-ghost';
    ghost.appendChild(source.cloneNode(true));
    document.body.appendChild(ghost);
    // Anclar la cabeza de la nota al puntero; los demas simbolos se centran.
    const glyph = ghost.firstChild;
    const viewBox = glyph.viewBox.baseVal;
    const box = kind === 'note' ? glyph.firstChild.getBBox() : viewBox;
    // El origen del viewBox puede ser negativo para dar espacio a las plicas.
    glyph.style.transform = 'translate(' + -(box.x - viewBox.x + box.width / 2) + 'px,' + -(box.y - viewBox.y + box.height / 2) + 'px)';
    moveGhost(ghost, event);
    return ghost;
  }

  // Las demas figuras del grupo acompanan a la agarrada con la misma separacion que tienen en pantalla.
  function addGroupToGhost(ghost, refs, from) {
    const centre = (ref) => {
      const node = nodeOf(ref);
      const rect = (node.querySelector('.notehead') || node).getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    };
    const anchor = centre(from);
    refs.filter((ref) => !same(ref, from)).forEach((ref) => {
      const ev = eventAt(ref);
      const kind = ev.rest ? 'rest' : 'note';
      const member = document.createElement('div');
      const at = centre(ref);
      member.style.cssText = 'position:absolute;left:' + (at.x - anchor.x) + 'px;top:' + (at.y - anchor.y) + 'px';
      ghost.appendChild(member);
      const probe = startGhost(glyphFor({ kind, d: ev.d }), { clientX: 0, clientY: 0 }, kind);
      probe.remove();
      member.appendChild(probe.firstChild);
    });
  }

  // La figura va arriba a la izquierda del puntero para que este no la tape;
  // el punto de soltado es el centro de la figura, no la punta del puntero.
  let ghostOffset = 2;

  function aimed(event) {
    return { clientX: event.clientX - ghostOffset, clientY: event.clientY - ghostOffset };
  }

  function moveGhost(ghost, event) {
    const at = aimed(event);
    ghost.style.transform = 'translate(' + at.clientX + 'px,' + at.clientY + 'px)';
  }

  let hoverPoint = null;
  let hoverGhost = null;

  function clearHoverGhost() {
    if (hoverGhost) hoverGhost.remove();
    hoverGhost = null;
    if (!drag) {
      showMarker(null);
      stage.querySelectorAll('.is-target').forEach((node) => node.classList.remove('is-target'));
    }
  }

  function updateHoverGhost() {
    const raw = hoverPoint;
    const point = raw && aimed(raw);
    const over = point && document.elementFromPoint(point.clientX, point.clientY);
    const overStage = over && stage.contains(over) && !over.closest('.score-barline-trigger, .score-insert-measure, .score-barre-field, .score-barre-span, .score-chord-trigger, .score-chord-draft, .score-hairpin-ui, .score-selection-menu');
    const hit = activeItem && !shiftMeasures && !measureDrag && !drag && overStage && locate(point.clientX, point.clientY);
    if (!hit) { clearHoverGhost(); return; }
    if (!hoverGhost) {
      hoverGhost = startGhost(glyphFor(activeItem), raw, activeItem.kind);
      hoverGhost.classList.add('score-hover-ghost');
    } else moveGhost(hoverGhost, raw);
    stage.querySelectorAll('.is-target').forEach((node) => node.classList.remove('is-target'));
    if (isModifier(activeItem)) {
      showMarker(null);
      const target = eventUnder(point.clientX, point.clientY);
      if (target) nodeOf(target).classList.add('is-target');
    } else showMarker(hit);
  }

  stage.addEventListener('pointermove', (event) => {
    if (event.pointerType !== 'mouse') return;
    hoverPoint = { clientX: event.clientX, clientY: event.clientY };
    updateHoverGhost();
  });
  stage.addEventListener('pointerleave', () => {
    hoverPoint = null;
    clearHoverGhost();
  });
  window.addEventListener('blur', () => {
    hoverPoint = null;
    clearHoverGhost();
  });

  function beginDrag(event, info) {
    clearHoverGhost();
    drag = Object.assign({ x: event.clientX, y: event.clientY, id: event.pointerId, active: false }, info);
  }

  document.addEventListener('pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (!drag.active) {
      if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5) return;
      drag.active = true;
      hideSelectionMenu();
      if (drag.insert) return;
      drag.ghost = drag.pattern ? patternGhost(drag.pattern, drag.flat, event) : startGhost(drag.glyph, event, drag.kind);
      if (drag.group) addGroupToGhost(drag.ghost, drag.group, drag.from);
      document.body.classList.add('score-dragging');
    }
    if (drag.insert) return;
    event.preventDefault();
    moveGhost(drag.ghost, event);
    const modifier = isModifier(drag.item);
    if (modifier) {
      showMarker(null);
      stage.querySelectorAll('.is-target').forEach((n) => n.classList.remove('is-target'));
      const at = aimed(event);
      const hit = eventUnder(at.clientX, at.clientY);
      if (hit) nodeOf(hit).classList.add('is-target');
    } else {
      const at = aimed(event);
      showMarker(locate(at.clientX, at.clientY, drag.group || drag.from));
    }
  }, { passive: false });

  function endDrag(event, cancelled) {
    if (!drag || event.pointerId !== drag.id) return;
    const d = drag;
    drag = null;
    document.body.classList.remove('score-dragging');
    stage.querySelectorAll('.is-target').forEach((n) => n.classList.remove('is-target'));
    showMarker(null);
    if (d.ghost) d.ghost.remove();
    if (cancelled) return;
    if (!d.active) {
      if (d.pattern) { applyToChosenMeasure(d.pattern, d.flat); return; }
      if (d.group) setPicks([d.from]);
      if (d.item) activateTool(d.item);
      else if (d.from && isModifier(activeItem)) applyModifier(activeItem, d.from);
      else if (d.insert) {
        const at = aimed(event);
        const target = locate(at.clientX, at.clientY);
        // El lienzo lejos de todo compas es un lugar neutro: suelta la herramienta como un click fuera de la partitura.
        if (!target) deactivateTool();
        else if (activeItem) dropNew(activeItem, target);
      }
      return;
    }
    if (d.insert) return;
    if (d.pattern) {
      const at = aimed(event);
      const target = locate(at.clientX, at.clientY);
      if (target) applyPattern(d.pattern, d.flat, { mi: target.mi, staff: target.staff, at: target.t, n: target.n });
      markSelected();
      return;
    }
    if (isModifier(d.item)) {
      const at = aimed(event);
      const hit = eventUnder(at.clientX, at.clientY);
      if (hit) applyModifier(d.item, hit);
      return;
    }
    const at = aimed(event);
    const target = locate(at.clientX, at.clientY, d.group || d.from);
    if (!target) { markSelected(); return; }
    if (d.group) moveGroup(d.group, d.from, target);
    else if (d.from) moveEvent(d.from, target);
    else dropNew(d.item, target);
    markSelected();
  }

  document.addEventListener('pointerup', (event) => {
    endDrag(event, false);
    updateHoverGhost();
  });
  document.addEventListener('pointercancel', (event) => endDrag(event, true));
  // Un doble click sobre una nota (sin herramienta activa) cicla el puntillo: uno, dos, ninguno.
  stage.addEventListener('dblclick', (event) => {
    if (activeItem || event.target.closest('input, button, textarea, ascii-tabs')) return;
    const hit = eventUnder(event.clientX, event.clientY);
    if (hit && !eventAt(hit).rest) applyModifier({ kind: 'dot' }, hit);
  });
  // Escape durante un arrastre lo cancela sin tocar la seleccion ni la herramienta.
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !drag) return;
    event.stopImmediatePropagation();
    endDrag({ pointerId: drag.id }, true);
  }, true);

  stage.addEventListener('pointerdown', (event) => {
    if (!event.shiftKey || event.button !== 0 || event.target.closest('input, button, textarea, ascii-tabs')) return;
    const origin = stage.getBoundingClientRect();
    const x = event.clientX - origin.left, y = event.clientY - origin.top;
    const from = layout.findIndex((m) => x >= m.left && x <= m.right && y >= m.top - 24 && y <= m.bottom + 24);
    if (from < 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    deactivateTool();
    measureDrag = { from, id: event.pointerId, x: event.clientX, y: event.clientY, fit: new Map(), active: false };
  }, true);

  stage.addEventListener('pointerdown', (event) => {
    const navigation = event.target.closest('[data-navigation-mark]');
    if (navigation) {
      event.preventDefault();
      event.stopPropagation();
      selectNavigation(navigation, event);
      return;
    }
    if (event.target.closest('.score-meter-trigger, .score-clef-trigger, .score-key-trigger, .score-barline-trigger, .score-insert-measure, .score-barre-field, .score-barre-span, .score-chord-trigger, .score-chord-draft, .score-lyric-trigger, .score-lyric-draft, .score-hairpin-ui, .score-selection-menu, .score-playback, .score-interval-toggle, .score-chord-names-toggle, .score-voice-legend')) return;
    const link = event.target.closest('g.tie, g.slur');
    if (link && !activeItem && linkRefs.has(link)) {
      event.preventDefault();
      event.stopPropagation();
      setPicks([]);
      clearBarSelection();
      selectedLink = { node: link, refs: linkRefs.get(link) };
      markSelected();
      stage.focus({ preventScroll: true });
      return;
    }
    // Las cabezas graves pueden quedar dentro de TAB: la partitura recibe
    // el gesto antes de que el componente enfoque y redibuje su celda.
    const overTab = event.target.closest('.score-tab');
    if (overTab) {
      if (!eventUnder(event.clientX, event.clientY)) return;
      event.stopPropagation();
    }
    if (isPlacing(activeItem)) {
      event.preventDefault();
      stage.focus({ preventScroll: true });
      // Con la herramienta de letra, arrastrar desde un espacio vacio hace el marco de seleccion (para unir silabas).
      if (activeItem.kind === 'lyric' && event.pointerType !== 'touch' && !eventUnder(event.clientX, event.clientY)) {
        beginMarquee(event, event.shiftKey || event.ctrlKey || event.metaKey);
        return;
      }
      beginDrag(event, { insert: true });
      return;
    }
    // Verovio groups the notes and beam polygons together. Only the polygons
    // select the connection; a notehead inside the group still selects its note.
    const beam = event.target.closest('g.beam');
    if (beam && event.target.matches('polygon') && event.target.parentElement === beam && !activeItem) {
      const refs = [...beam.querySelectorAll('g.note, g.rest')].map(refOfNode).filter(Boolean);
      if (M.selectionActions(score, refs).includes('unbeam')) {
        event.preventDefault();
        setPicks([]);
        clearBarSelection();
        selectedBeam = { node: beam, refs };
        markSelected();
        stage.focus({ preventScroll: true });
        return;
      }
    }
    let match = eventUnder(event.clientX, event.clientY);
    // Con una nota o un silencio en mano, un click sobre un silencio coloca la figura nueva en vez de seleccionarlo.
    if (match && activeItem && !isModifier(activeItem) && eventAt(match).rest) match = null;
    const additive = event.shiftKey || event.ctrlKey || event.metaKey;
    if (!match) {
      if (!additive) setPicks([]);
      stage.focus({ preventScroll: true });
      if (activeItem) beginDrag(event, { insert: true });
      else {
        if (!additive) pureClick = { id: event.pointerId, x: event.clientX, y: event.clientY };
        if (event.pointerType !== 'touch') beginMarquee(event, additive);
      }
      return;
    }
    event.preventDefault();
    stage.focus({ preventScroll: true });
    if (additive) { togglePick(match); return; }
    const inGroup = group.length > 1 && group.some((p) => same(p, match));
    if (inGroup) selected = match;
    else setPicks([match]);
    const ev = eventAt(match);
    beginDrag(event, {
      from: match,
      group: inGroup ? group.slice() : null,
      kind: ev.rest ? 'rest' : 'note',
      glyph: glyphFor({ kind: ev.rest ? 'rest' : 'note', d: ev.d }),
    });
  }, true);

  // Shift reserves the measure gesture before note selection, tools and TAB.
  let measureDrag = null;
  const measureGuide = document.createElement('div');
  measureGuide.className = 'score-measure-guide';
  let shiftMeasures = false;

  function measureCursor(on) {
    if (shiftMeasures === on) return;
    shiftMeasures = on;
    stage.classList.toggle('can-move-measures', on);
    if (on) clearHoverGhost();
    else updateHoverGhost();
  }

  function measureDrop(event, d) {
    const origin = stage.getBoundingClientRect();
    const x = event.clientX - origin.left, y = event.clientY - origin.top;
    if (x < 0 || x > origin.width || y < 0 || y > origin.height) return null;
    const starts = M.rowStarts(score);
    let row = 0;
    starts.forEach((first, r) => {
      if (Math.abs(y - (layout[first].top + layout[first].bottom) / 2) < Math.abs(y - (layout[starts[row]].top + layout[starts[row]].bottom) / 2)) row = r;
    });
    const first = starts[row], last = first + score.rows[row].length - 1;
    const end = x >= (layout[last].left + layout[last].right) / 2;
    let before = last + 1, appendRow;
    if (end && row !== M.rowOf(score, d.from).row && score.rows[M.rowOf(score, d.from).row].length > 1) {
      if (!d.fit.has(row)) {
        const trial = M.clone(score);
        M.moveMeasure(trial, d.from, before, row);
        const probe = newToolkit();
        try {
          probe.setOptions(layoutOptions(stage.clientWidth, { noJustification: true }));
          probe.loadData(M.toMusicXml(trial));
          const svg = new DOMParser().parseFromString(probe.renderToSVG(1), 'image/svg+xml');
          const paths = [...svg.querySelectorAll('g.system')][row]?.querySelectorAll('g.measure > g.staff > path');
          // Unjustified staff endpoints are in Verovio drawing units (10 per page unit).
          const ends = paths ? [...paths].map((p) => [...p.getAttribute('d').matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => +m[0])).flatMap((coords) => coords.filter((_, i) => i % 2 === 0)) : [];
          const available = (Math.round(stage.clientWidth * 100 / SCALE) - 120) * 10;
          d.fit.set(row, ends.length > 0 && Math.max(...ends) - Math.min(...ends) <= available);
        } finally { probe.destroy(); }
      }
      if (d.fit.get(row)) appendRow = row;
      else if (row + 1 < starts.length) row += 1;
      // At the final row, create a following row instead of squeezing it.
      else return { before, newRow: true, left: layout[last].right, lines: layout[last].lines };
    } else if (!end) {
      before = first;
      for (let mi = first; mi <= last; mi += 1) {
        if (x > (layout[mi].left + layout[mi].right) / 2) before = mi + 1;
      }
    }
    const nextRow = row > M.rowOf(score, last).row;
    const guide = nextRow ? layout[starts[row]] : before > last ? layout[last] : layout[before];
    return { before, appendRow, left: before > last && !nextRow ? guide.right : guide.left, lines: guide.lines };
  }

  function finishMeasureDrag(event, cancel) {
    const d = measureDrag;
    if (!d || (event.pointerId !== undefined && event.pointerId !== d.id)) return;
    if (d.active && !cancel) d.target = measureDrop(event, d);
    measureDrag = null;
    measureGuide.remove();
    document.body.classList.remove('score-moving-measure');
    stage.querySelectorAll('.is-moving-measure').forEach((node) => node.classList.remove('is-moving-measure'));
    if (!d.active && !cancel) {
      const hit = eventUnder(event.clientX, event.clientY);
      if (hit) togglePick(hit); // Shift+click still extends the figure selection.
    }
    if (d.active && !cancel && d.target) {
      change(() => {
        const target = d.target;
        if (target.newRow) {
          // Make the final insertion a row of its own without adding a measure.
          if (!M.moveMeasure(score, d.from, target.before)) return false;
          const last = score.rows[score.rows.length - 1];
          if (last.length > 1) score.rows.push([last.pop()]);
        } else if (!M.moveMeasure(score, d.from, target.before, target.appendRow)) return false;
        selected = null;
        group = [];
        selectedNavigation = [];
      });
    }
    stage.focus({ preventScroll: true });
  }

  document.addEventListener('pointermove', (event) => {
    measureCursor(event.shiftKey);
    const d = measureDrag;
    if (!d || event.pointerId !== d.id) return;
    if (!d.active && Math.hypot(event.clientX - d.x, event.clientY - d.y) < 5) return;
    d.active = true;
    document.body.classList.add('score-moving-measure');
    stage.querySelector('#m' + d.from)?.classList.add('is-moving-measure');
    d.target = measureDrop(event, d);
    if (!d.target) { measureGuide.remove(); return; }
    measureGuide.style.left = d.target.left + 'px';
    measureGuide.style.top = d.target.top - 20 + 'px';
    measureGuide.style.height = d.target.bottom - d.target.top + 40 + 'px';
    if (!measureGuide.isConnected) stage.appendChild(measureGuide);
  });
  document.addEventListener('pointerup', (event) => finishMeasureDrag(event, false));
  document.addEventListener('pointercancel', (event) => finishMeasureDrag(event, true));
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Shift') measureCursor(true);
    if (event.key === 'Escape') finishMeasureDrag(event, true);
  });
  document.addEventListener('keyup', (event) => { if (event.key === 'Shift') measureCursor(false); });
  window.addEventListener('blur', () => { measureCursor(false); finishMeasureDrag({}, true); });

  // ---- marco de seleccion ---------------------------------------------------

  let marquee = null;
  // Solo un click limpio (sin arrastre) selecciona el compas; arrastrar es hacer un marco de seleccion.
  let pureClick = null;

  function endPureClick(event, cancelled) {
    const c = pureClick;
    if (!c || event.pointerId !== c.id) return;
    pureClick = null;
    if (cancelled || Math.hypot(event.clientX - c.x, event.clientY - c.y) >= 5) return;
    selectMeasureBars(event);
    showPlaybackHint(event);
  }

  document.addEventListener('pointerup', (event) => endPureClick(event, false));
  document.addEventListener('pointercancel', (event) => endPureClick(event, true));

  function beginMarquee(event, additive) {
    marquee = { x: event.clientX, y: event.clientY, id: event.pointerId, active: false, additive, base: additive ? picks().slice() : [], el: null };
    showChordZone(null);
  }

  function marqueeRect(m, event) {
    return {
      left: Math.min(m.x, event.clientX),
      top: Math.min(m.y, event.clientY),
      right: Math.max(m.x, event.clientX),
      bottom: Math.max(m.y, event.clientY),
    };
  }

  document.addEventListener('pointermove', (event) => {
    if (!marquee || event.pointerId !== marquee.id) return;
    if (!marquee.active) {
      if (Math.hypot(event.clientX - marquee.x, event.clientY - marquee.y) < 5) return;
      marquee.active = true;
      marquee.el = document.createElement('div');
      marquee.el.className = 'score-marquee';
      stage.appendChild(marquee.el);
    }
    const origin = stage.getBoundingClientRect();
    const r = marqueeRect(marquee, event);
    Object.assign(marquee.el.style, {
      left: r.left - origin.left + 'px',
      top: r.top - origin.top + 'px',
      width: r.right - r.left + 'px',
      height: r.bottom - r.top + 'px',
    });
  });

  function endMarquee(event, cancelled) {
    if (!marquee || event.pointerId !== marquee.id) return;
    const m = marquee;
    marquee = null;
    if (m.el) m.el.remove();
    if (!m.active || cancelled) return;
    const r = marqueeRect(m, event);
    if (activeItem && activeItem.kind === 'lyric') {
      // Con la herramienta de letra el marco elige silabas (sus triggers), no notas.
      const refs = [...stage.querySelectorAll('.score-lyric-trigger')].filter((node) => {
        const b = node.getBoundingClientRect();
        return b.left <= r.right && b.right >= r.left && b.top <= r.bottom && b.bottom >= r.top;
      }).map((node) => lyricRef(Number(node.dataset.measure), Number(node.dataset.at), Number(node.dataset.staff))).filter(Boolean);
      const base = lyricOnly ? m.base : [];
      setPicks(base.concat(refs.filter((f) => !base.some((b) => same(b, f)))), true);
      return;
    }
    const found = [...stage.querySelectorAll('g.note, g.rest')].filter((node) => {
      const b = (node.querySelector('.notehead') || node).getBoundingClientRect();
      return b.left <= r.right && b.right >= r.left && b.top <= r.bottom && b.bottom >= r.top;
    }).map(refOfNode).filter(Boolean);
    setPicks(m.base.concat(found.filter((f) => !m.base.some((b) => same(b, f)))));
    const chords = [...stage.querySelectorAll('.score-chord-trigger')].filter((node) => {
      const b = node.getBoundingClientRect();
      return b.left <= r.right && b.right >= r.left && b.top <= r.bottom && b.bottom >= r.top;
    }).map((node) => ({ mi: Number(node.dataset.measure), at: Number(node.dataset.at) }));
    if (chords.length) {
      selectedChords = chords;
      markChords();
    }
  }

  document.addEventListener('pointerup', (event) => endMarquee(event, false));
  document.addEventListener('pointercancel', (event) => endMarquee(event, true));

  stage.addEventListener('keydown', (event) => {
    if (event.target !== stage) return;
    if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); removeSelected(); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); if (!event.shiftKey || !event.repeat) shiftSelected(1, event.shiftKey); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); if (!event.shiftKey || !event.repeat) shiftSelected(-1, event.shiftKey); }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      stepSelection(event.key === 'ArrowRight' ? 1 : -1, event.shiftKey);
    } else if (event.key === 'Escape') setPicks([]);
  });

  // Un click en un lugar neutro (fuera de la partitura, las paletas y los menus) suelta la herramienta.
  document.addEventListener('pointerdown', (event) => {
    // Un elemento que un redibujado ya quito (la silaba pulsada mientras otra tenia el campo) no cuenta como un click fuera.
    if (!(event.target instanceof Element) || !event.target.isConnected) return;
    // Los campos del titulo y el autor tambien quedan fuera de la seleccion musical.
    if ((picks().length || selectedNavigation.length || selectedBeam || selectedLink || selectedHairpin) && !event.target.closest('.score-stage, .score-palette, .score-toolbar, .score-doc-tab, .score-library, [popover]')) setPicks([]);
    if (!activeItem) return;
    if (event.target.closest('.score-stage, .score-palette, .score-toolbar, .score-doc-tab, [popover], button, a, input, select, textarea')) return;
    deactivateTool();
  });

  document.addEventListener('keydown', (event) => {
    if (event.target.closest('input, textarea, select, [contenteditable], ascii-tabs, .score-settings-popup')) return;
    if (!event.metaKey && !event.ctrlKey && !event.altKey && (event.key === 'Delete' || event.key === 'Backspace')) {
      if (removeSelectedBars()) { event.preventDefault(); return; }
    }
    if (event.key === 'Escape') {
      clearBarSelection();
      deactivateTool();
    }
    // Tab llena un compas vacio; Shift+Tab tambien completa con silencios las voces de uno empezado.
    if (event.key === 'Tab' && !event.metaKey && !event.ctrlKey && !event.altKey && selectedMeasure !== null &&
        (event.shiftKey || !M.measures(score, selectedMeasureStaff)[selectedMeasure]?.length)) {
      event.preventDefault();
      const mi = selectedMeasure, staff = selectedMeasureStaff;
      change(() => M.fillWithRests(score, mi, staff, event.shiftKey));
      selectedMeasure = mi;
      markMeasureBars();
      return;
    }
    // Shift+D: sin Ctrl/Cmd/Alt no choca con ningun atajo del navegador (Cmd+D es marcador).
    if (event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && event.code === 'KeyD') {
      event.preventDefault();
      if (!event.repeat) duplicateSelected();
      return;
    }
    // Shift+S: con la biblioteca activa guarda como patron lo elegido (la tecla S sola sigue siendo el sostenido).
    if (event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey && event.code === 'KeyS' && patternsOn()) {
      event.preventDefault();
      if (!event.repeat) savePattern();
      return;
    }
    if (!event.metaKey && !event.ctrlKey && !event.altKey && !meterPopup.matches(':popover-open') && !clefPopup.matches(':popover-open') && !dynamicsPopup.matches(':popover-open') && !tuningPopup.matches(':popover-open')) {
      // El caracter, no la tecla fisica: los parentesis cambian de lugar segun el teclado.
      if (event.key === '(' || event.key === ')') {
        const action = M.selectionActions(score, picks()).find((action) => action === 'link' || action === 'unlink');
        if (action) {
          event.preventDefault();
          if (!event.repeat) applyAction(action);
        }
        return;
      }
      if (event.key.toLowerCase() === 'a') {
        event.preventDefault();
        deactivateTool();
        return;
      }
      const item = ITEMS.find((item) => item && (item.code ? item.code === event.code : item.key === event.key.toLowerCase()));
      if (item) { event.preventDefault(); if (!event.repeat) activateTool(item); return; }
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      undo();
    }
  });

  // Copia las figuras elegidas justo despues de la ultima, siguiendo en los compases que vengan.
  function duplicateSelected() {
    const refs = picks().filter((ref) => eventAt(ref));
    if (!refs.length) return;
    const trial = M.clone(score);
    M.restoreTabReferences(trial, M.captureTabReferences(score, score.showTabs ? tabColumns : score.tabs));
    const created = M.duplicateSelection(trial, refs);
    if (!created) return say(t.full);
    change(() => {
      Object.assign(score, trial);
      selected = created[created.length - 1];
      group = created.length > 1 ? created : [];
    }, M.captureTabReferences(trial));
    stage.focus({ preventScroll: true });
  }

  let pasteWithoutSignatures = false;
  document.addEventListener('keydown', (event) => { pasteWithoutSignatures = event.shiftKey; });
  document.addEventListener('keyup', (event) => { pasteWithoutSignatures = event.shiftKey; });
  window.addEventListener('blur', () => { pasteWithoutSignatures = false; });
  const clipboardType = 'application/x-guitar-score-selection';
  const editingText = (event) => event.target.closest('input, textarea, select, [contenteditable], ascii-tabs');
  document.addEventListener('copy', (event) => {
    if (editingText(event) || !event.clipboardData) return;
    const fragment = M.copySelection(score, picks(), score.showTabs ? tabColumns : score.tabs);
    if (!fragment) return;
    event.preventDefault();
    const text = JSON.stringify(fragment);
    event.clipboardData.setData(clipboardType, text);
    event.clipboardData.setData('text/plain', text);
  });
  document.addEventListener('paste', (event) => {
    // Destino: el compas elegido o, si no hay, el del cursor (la linea roja de un clic en una zona neutra), desde su tiempo.
    const atCursor = playbackHint && playbackHintPosition?.document === score && playbackActivityDocument === score && playbackActivityMeasure !== null;
    if (editingText(event) || (selectedMeasure === null && !atCursor) || !event.clipboardData) return;
    const destinationMeasure = selectedMeasure ?? playbackActivityMeasure;
    const destinationStaff = selectedMeasure !== null ? selectedMeasureStaff : 0;
    const cursorAt = atCursor && (selectedMeasure === null || selectedMeasure === playbackActivityMeasure) ? playbackActivityAt : 0;
    let fragment;
    try {
      fragment = JSON.parse(event.clipboardData.getData(clipboardType) || event.clipboardData.getData('text/plain'));
    } catch (error) { return; }
    if (fragment?.type !== 'guitar-score-selection' || fragment.version !== 1) return;
    event.preventDefault();
    const trial = M.clone(score);
    M.restoreTabReferences(trial, M.captureTabReferences(score, score.showTabs ? tabColumns : score.tabs));
    const refs = M.pasteSelection(trial, fragment, destinationMeasure, { preserveSignatures: !pasteWithoutSignatures, staff: destinationStaff, at: cursorAt });
    if (!refs) return say(t.full);
    change(() => {
      Object.assign(score, trial);
      selected = refs[refs.length - 1];
      group = refs.length > 1 ? refs : [];
    }, M.captureTabReferences(trial));
    stage.focus({ preventScroll: true });
  });

  const tuningName = tuning => tuning.id === 'standard' ? t.standardTuning : tuning.name;
  const tuningPopup = document.createElement('div');
  tuningPopup.id = 'scoreTuningPopup';
  tuningPopup.className = 'score-meter-popup score-tuning-popup';
  tuningPopup.setAttribute('popover', 'auto');
  tuningPopup.setAttribute('role', 'dialog');
  tuningPopup.setAttribute('aria-label', t.tuning);
  const tuningTitle = document.createElement('p');
  tuningTitle.textContent = t.tuning;
  tuningPopup.appendChild(tuningTitle);
  M.TUNINGS.forEach(tuning => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.tuning = tuning.id;
    const name = document.createElement('strong');
    name.textContent = tuningName(tuning);
    const strings = document.createElement('span');
    strings.textContent = M.tuningLabels({ tuning: tuning.id }).slice().reverse().join(' ');
    button.append(name, strings);
    button.addEventListener('click', () => {
      tuningPopup.hidePopover();
      if (M.tuningOf(score).id !== tuning.id) {
        change(() => { score.tuning = tuning.id; delete score.tabs; }, []);
      }
      requestAnimationFrame(() => stage.querySelector('.score-tuning-trigger')?.focus({ preventScroll: true }));
    });
    tuningPopup.appendChild(button);
  });
  document.querySelector('.score-page').appendChild(tuningPopup);
  tuningPopup.addEventListener('toggle', event => {
    stage.querySelector('.score-tuning-trigger')?.setAttribute('aria-expanded', String(event.newState === 'open'));
  });
  function openTuning(trigger) {
    if (tuningPopup.matches(':popover-open')) { tuningPopup.hidePopover(); return; }
    tuningPopup.querySelectorAll('button').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.tuning === M.tuningOf(score).id));
    });
    tuningPopup.showPopover();
    const anchor = trigger.getBoundingClientRect();
    const box = tuningPopup.getBoundingClientRect();
    tuningPopup.style.left = Math.max(8, Math.min(anchor.left, innerWidth - box.width - 8)) + 'px';
    tuningPopup.style.top = Math.max(8, Math.min(anchor.bottom + 6, innerHeight - box.height - 8)) + 'px';
    tuningPopup.querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
  }

  // ---- selector de compas -------------------------------------------------

  const meterPopup = document.createElement('div');
  meterPopup.id = 'scoreMeterPopup';
  meterPopup.className = 'score-meter-popup';
  meterPopup.setAttribute('popover', 'auto');
  meterPopup.setAttribute('role', 'group');
  meterPopup.setAttribute('aria-label', t.meter);
  const meterTitle = document.createElement('p');
  meterTitle.textContent = t.meter;
  meterPopup.appendChild(meterTitle);
  const meterOptions = document.createElement('div');
  meterOptions.className = 'score-meter-options';
  meterPopup.appendChild(meterOptions);
  document.querySelector('.score-page').appendChild(meterPopup);

  M.METERS.forEach((meter) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.meter = meter;
    button.setAttribute('aria-label', meter);
    button.addEventListener('click', () => {
      if (meter === M.meterOf(score)) {
        meterPopup.hidePopover();
      } else {
        const changed = change(() => M.setMeter(score, meter));
        if (!changed) { say(t.meterFull); return; }
        say('');
      }
      stage.querySelector('.score-meter-trigger')?.focus({ preventScroll: true });
    });
    meterOptions.appendChild(button);
  });

  meterPopup.addEventListener('toggle', (event) => {
    stage.querySelector('.score-meter-trigger')?.setAttribute('aria-expanded', String(event.newState === 'open'));
  });

  function mountMeterButton() {
    const meter = stage.querySelector('g.meterSig');
    if (!meter) return;
    const box = meter.getBoundingClientRect();
    const origin = stage.getBoundingClientRect();
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'score-meter-trigger';
    button.setAttribute('aria-label', t.meter + ': ' + M.meterOf(score));
    button.setAttribute('aria-controls', meterPopup.id);
    button.setAttribute('aria-expanded', 'false');
    button.style.left = (box.left + box.width / 2 - origin.left - stage.clientLeft) + 'px';
    button.style.top = (box.top + box.height / 2 - origin.top - stage.clientTop) + 'px';
    button.style.height = Math.max(44, box.height + 12) + 'px';
    button.addEventListener('click', () => {
      if (meterPopup.matches(':popover-open')) { meterPopup.hidePopover(); return; }
      [...meterOptions.children].forEach((option) => {
        option.setAttribute('aria-pressed', String(option.dataset.meter === M.meterOf(score)));
      });
      meterPopup.showPopover();
      [...meterOptions.children].forEach((option) => {
        if (!option.querySelector('svg')) signaturePreview(option, M.clefOf(score), 0, 'meter', option.dataset.meter);
      });
      const anchor = button.getBoundingClientRect();
      const popup = meterPopup.getBoundingClientRect();
      meterPopup.style.left = Math.max(8, Math.min(anchor.left, window.innerWidth - popup.width - 8)) + 'px';
      meterPopup.style.top = Math.max(8, Math.min(anchor.bottom + 6, window.innerHeight - popup.height - 8)) + 'px';
      meterOptions.querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
    });
    hoverGlyph(button, meter);
    stage.appendChild(button);
  }

  // ---- clave y armadura ---------------------------------------------------

  const clefPopup = document.createElement('div');
  clefPopup.id = 'scoreClefPopup';
  clefPopup.className = 'score-meter-popup score-clef-popup';
  clefPopup.setAttribute('popover', 'auto');
  clefPopup.setAttribute('role', 'dialog');
  clefPopup.setAttribute('aria-label', t.clefAndKey);
  document.querySelector('.score-page').appendChild(clefPopup);
  // Donde se abrio el popup (clave de un renglon o barra) y compas desde el que rige la armadura que se elija.
  let clefAnchor = { kind: 'clef', index: 0 };
  let keyMeasure = 0;
  let clefStaff = 0; // pentagrama cuya clave cambia el popup; la armadura es de ambos
  let previewToolkit = null;
  let galleryClef = null;

  function signatureGroup(title, className) {
    const heading = document.createElement('p');
    heading.textContent = title;
    const group = document.createElement('div');
    group.className = className;
    group.setAttribute('role', 'group');
    group.setAttribute('aria-label', title);
    clefPopup.append(heading, group);
    return group;
  }

  function signatureButton(group, field, value, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'score-signature-option tooltip';
    button.dataset[field] = value;
    button.dataset.tooltip = label;
    button.setAttribute('aria-label', label);
    button.addEventListener('click', () => {
      if (field === 'clef') {
        if (M.clefAt(score, keyMeasure, clefStaff) !== value) change(() => M.setClef(score, keyMeasure, value, clefStaff));
      } else if (M.keyAt(score, keyMeasure) !== value) change(() => M.setKey(score, keyMeasure, value));
      openClefPopup(clefAnchor, keyMeasure, button);
    });
    group.appendChild(button);
    return button;
  }

  const clefOptions = signatureGroup(t.clef, 'score-clef-options');
  Object.keys(M.CLEFS).forEach((clef) => signatureButton(clefOptions, 'clef', clef, t.clefs[clef]));
  const keyOptions = signatureGroup(t.keySignature, 'score-key-options');
  // Tres renglones, de menos a más alteraciones: sin armadura, bemoles (1 a 7), sostenidos (1 a 7).
  const keyOrder = [0, ...[1, 2, 3, 4, 5, 6, 7].map((n) => -n), ...[1, 2, 3, 4, 5, 6, 7]];
  keyOrder.forEach((fifths, i) => {
    const button = signatureButton(keyOptions, 'fifths', fifths, t.keys[fifths + 7]);
    const column = fifths === 0 ? 1 : Math.abs(fifths);
    button.style.gridRow = fifths === 0 ? 1 : fifths < 0 ? 2 : 3;
    button.style.gridColumn = column;
    if (column === 1) button.classList.add('first-column');
    if (column === 7) button.classList.add('last-column');
    if (fifths === 0) {
      const none = document.createElement('span');
      none.className = 'score-key-none';
      none.textContent = t.keyNone;
      button.appendChild(none);
    }
  });

  // Nombre del pentagrama `staff` para etiquetas accesibles: el registro en Voces; arriba o abajo en el piano.
  function staffName(staff) {
    if (M.instrumentOf(score) === 'voices') return registerLabel(staff);
    if (M.voicePerStaff(score)) return t.voiceStaff.replace('{n}', staff + 1);
    return staff ? t.lowerStaff : t.upperStaff;
  }

  // El mismo grabador de la partitura dibuja las muestras: posiciones de clave y armadura reales.
  function signaturePreview(button, clef, fifths, kind, meter) {
    if (!previewToolkit) previewToolkit = newToolkit();
    // `instrument` fija un solo pentagrama: la muestra es de una clave.
    const sample = { clef, fifths, meter, instrument: 'guitar', rows: [[[]]] };
    previewToolkit.setOptions(layoutOptions(300));
    previewToolkit.loadData(M.toMusicXml(sample));
    const doc = new DOMParser().parseFromString(previewToolkit.renderToSVG(1), 'image/svg+xml');
    const staff = doc.querySelector('g.staff');
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.classList.add('score-signature-preview');
    svg.setAttribute('aria-hidden', 'true');
    svg.appendChild(document.importNode(doc.querySelector('defs'), true));
    const lines = [...staff.querySelectorAll(':scope > path')].slice(0, 5).map((path) => {
      const line = document.importNode(path, true);
      svg.appendChild(line);
      return line;
    });
    const symbol = staff.querySelector(kind === 'clef' ? 'g.clef' : kind === 'meter' ? 'g.meterSig' : 'g.keySig');
    const glyph = symbol && document.importNode(symbol, true);
    if (glyph) svg.appendChild(glyph);
    button.prepend(svg);
    const staffBox = lines[0].getBBox();
    const bottom = lines[4].getBBox().y;
    const box = glyph && glyph.getBBox();
    const width = kind === 'clef' ? 1000 : Math.max(800, (box?.width || 0) + 100);
    const height = kind === 'clef' ? 1700 : Math.max(800, (box?.height || 0) + 100);
    const center = box && box.width ? box.x + box.width / 2 : 1350;
    const left = center - width / 2;
    const middle = kind !== 'clef' && box?.height ? box.y + box.height / 2 : (staffBox.y + bottom) / 2 + (kind === 'clef' ? 130 : 0); // deja sitio al 8 bajo la clave de guitarra
    const top = middle - height / 2;
    lines.forEach((line) => {
      const y = line.getBBox().y;
      line.setAttribute('d', `M${left} ${y} L${left + width} ${y}`);
      line.setAttribute('stroke', 'currentColor');
    });
    if (kind !== 'clef') {
      lines.forEach((line) => line.remove());
    }
    svg.setAttribute('viewBox', `${left} ${top} ${width} ${height}`);
  }

  function anchorButtonOf(anchor) {
    if (anchor.kind === 'key') return stage.querySelector('.score-key-trigger[data-measure="' + anchor.mi + '"]');
    return anchor.kind === 'clef'
      ? stage.querySelectorAll('.score-clef-trigger')[anchor.index]
      : stage.querySelector('.score-barline-trigger[data-measure="' + anchor.mi + '"][data-side="' + anchor.side + '"]');
  }

  // Que secciones muestra el popup: clave y armadura juntas solo si se abre desde la clave y no hay armadura.
  // Se fija al abrir, para que elegir una armadura no cambie el popup que ya esta abierto.
  let popupSections = 'both';

  function showSections(sections) {
    popupSections = sections;
    [[clefOptions, 'clef'], [keyOptions, 'key']].forEach(([group, name]) => {
      const display = sections === 'both' || sections === name ? '' : 'none';
      group.style.display = display;
      group.previousElementSibling.style.display = display;
    });
  }

  function openClefPopup(origin, measure, focusButton) {
    clefAnchor = origin;
    keyMeasure = measure;
    clefStaff = M.stavesOf(score) > 1 ? origin.staff || 0 : 0;
    clefOptions.previousElementSibling.textContent = M.stavesOf(score) > 1 ? t.clef + ' · ' + staffName(clefStaff) : t.clef;
    if (!clefPopup.matches(':popover-open')) {
      showSections(origin.kind === 'key' ? 'key' : origin.kind === 'clef' && M.keyAt(score, measure) !== 0 ? 'clef' : 'both');
    }
    const anchorButton = anchorButtonOf(origin);
    clefOptions.querySelectorAll('button').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.clef === M.clefAt(score, keyMeasure, clefStaff)));
    });
    keyOptions.querySelectorAll('button').forEach((button) => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.fifths) === M.keyAt(score, keyMeasure)));
    });
    if (!clefPopup.matches(':popover-open')) clefPopup.showPopover();
    // getBBox() devuelve cajas vacias dentro de una seccion con display:none.
    // Generar y guardar las muestras solo cuando su seccion ya esta visible.
    if (popupSections !== 'key') {
      clefOptions.querySelectorAll('button').forEach((button) => {
        if (!button.querySelector('svg')) signaturePreview(button, button.dataset.clef, 0, 'clef');
      });
    }
    if (popupSections !== 'clef' && galleryClef !== M.clefAt(score, keyMeasure, clefStaff)) {
      keyOptions.querySelectorAll('button').forEach((button) => {
        if (!Number(button.dataset.fifths)) return;
        button.querySelector('svg')?.remove();
        signaturePreview(button, M.clefAt(score, keyMeasure, clefStaff), Number(button.dataset.fifths), 'key');
      });
      galleryClef = M.clefAt(score, keyMeasure, clefStaff);
    }
    const anchor = anchorButton.getBoundingClientRect();
    const popup = clefPopup.getBoundingClientRect();
    clefPopup.style.left = Math.max(8, Math.min(anchor.left, window.innerWidth - popup.width - 8)) + 'px';
    clefPopup.style.top = Math.max(8, Math.min(anchor.bottom + 6, window.innerHeight - popup.height - 8)) + 'px';
    const focusGroup = popupSections === 'key' ? keyOptions : clefOptions;
    (focusButton || focusGroup.querySelector('[aria-pressed="true"]')).focus({ preventScroll: true });
  }

  clefPopup.addEventListener('toggle', (event) => {
    stage.querySelectorAll('.score-clef-trigger').forEach((button, i) => {
      button.setAttribute('aria-expanded', String(event.newState === 'open' && clefAnchor.kind === 'clef' && i === clefAnchor.index));
    });
    stage.querySelectorAll('.score-key-trigger').forEach((button) => {
      button.setAttribute('aria-expanded', String(event.newState === 'open' && clefAnchor.kind === 'key' && Number(button.dataset.measure) === clefAnchor.mi));
    });
    stage.querySelectorAll('.score-barline-trigger').forEach((button) => {
      button.setAttribute('aria-expanded', String(event.newState === 'open' && clefAnchor.kind === 'bar' && Number(button.dataset.measure) === clefAnchor.mi && button.dataset.side === clefAnchor.side));
    });
  });

  // La armadura abre el mismo popup que la clave, para el compas donde se dibuja.
  // El simbolo grabado se tiñe de azul mientras el cursor o el foco estan sobre su boton.
  function hoverGlyph(button, glyph) {
    const on = () => glyph.classList.add('is-hovered');
    const off = () => glyph.classList.remove('is-hovered');
    button.addEventListener('mouseenter', on);
    button.addEventListener('mouseleave', off);
    button.addEventListener('focus', on);
    button.addEventListener('blur', off);
  }

  function mountKeyButtons() {
    const origin = stage.getBoundingClientRect();
    // La armadura es de ambos pentagramas: un solo control por compas, sobre el de arriba.
    stage.querySelectorAll('g.measure > g.staff:first-of-type g.keySig').forEach((key) => {
      const box = key.getBoundingClientRect();
      if (!box.width) return;
      const mi = Number(key.closest('g.measure').id.slice(1));
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'score-key-trigger';
      button.dataset.measure = mi;
      button.setAttribute('aria-label', t.keySignature + ': ' + t.keys[M.keyAt(score, mi) + 7]);
      button.setAttribute('aria-controls', clefPopup.id);
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-expanded', 'false');
      button.style.left = (box.left + box.width / 2 - origin.left - stage.clientLeft) + 'px';
      button.style.top = (box.top + box.height / 2 - origin.top - stage.clientTop) + 'px';
      button.style.width = Math.max(20, box.width + 8) + 'px';
      button.style.height = Math.max(44, box.height + 8) + 'px';
      button.addEventListener('click', () => {
        if (clefPopup.matches(':popover-open')) { clefPopup.hidePopover(); return; }
        openClefPopup({ kind: 'key', mi }, mi);
      });
      hoverGlyph(button, key);
      stage.appendChild(button);
    });
  }

  // ---- registros del coro (Voces) ----

  const registerPopup = document.createElement('div');
  registerPopup.id = 'scoreRegisterPopup';
  registerPopup.className = 'score-meter-popup score-register-popup';
  registerPopup.setAttribute('popover', 'auto');
  registerPopup.setAttribute('role', 'dialog');
  registerPopup.setAttribute('aria-label', t.registerTitle);
  document.querySelector('.score-page').appendChild(registerPopup);
  let registerStaff = 0;
  const registerHeading = document.createElement('p');
  registerHeading.textContent = t.registerTitle;
  const registerList = document.createElement('div');
  registerList.className = 'score-register-options';
  registerList.setAttribute('role', 'group');
  registerList.setAttribute('aria-label', t.registerTitle);
  [...Object.keys(M.REGISTERS), M.NO_REGISTER].forEach((id) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.register = id;
    button.textContent = t.registers[id];
    button.addEventListener('click', () => {
      registerPopup.hidePopover();
      change(() => M.setRegister(score, registerStaff, id));
    });
    registerList.appendChild(button);
  });
  registerPopup.append(registerHeading, registerList);

  // Nombre del registro; con "Sin" el pentagrama solo se identifica por su numero de voz.
  function registerLabel(staff) {
    const register = M.registerOf(score, staff);
    return register === M.NO_REGISTER ? t.voiceStaff.replace('{n}', staff + 1) : t.registers[register];
  }

  // El popup sigue a su boton: se reposiciona al hacer scroll o cambiar el tamano.
  let registerAnchor = null;
  function placeRegisterPopup() {
    if (!registerAnchor || !registerAnchor.isConnected || !registerPopup.matches(':popover-open')) return;
    const anchor = registerAnchor.getBoundingClientRect();
    const box = registerPopup.getBoundingClientRect();
    registerPopup.style.left = Math.max(8, Math.min(anchor.left + anchor.width / 2 - box.width / 2, window.innerWidth - box.width - 8)) + 'px';
    registerPopup.style.top = Math.max(8, Math.min(anchor.bottom + 6, window.innerHeight - box.height - 8)) + 'px';
  }
  window.addEventListener('scroll', placeRegisterPopup, { passive: true, capture: true });
  window.addEventListener('resize', placeRegisterPopup);

  // Cada registro se escribe sobre su propio pentagrama, a la distancia que Verovio deja a la indicacion de tempo (si la hay, el primero va tras ella).
  function mountRegisterButtons() {
    if (!M.choir || M.instrumentOf(score) !== 'voices') return;
    const first = stage.querySelector('g.measure');
    const staves = first ? [...first.querySelectorAll(':scope > g.staff')] : [];
    if (!staves.length) return;
    const origin = stage.getBoundingClientRect();
    const tempo = stage.querySelector('g.tempo');
    const tempoBox = tempo && tempo.getBoundingClientRect();
    const lines = staves.map((node) => node.querySelectorAll(':scope > path'));
    if (!lines[0].length) return;
    const firstLine = lines[0][0].getBoundingClientRect();
    const space = lines[0].length > 1 ? lines[0][1].getBoundingClientRect().top - firstLine.top : 22;
    const hasTempo = tempoBox && tempoBox.width && tempoBox.height;
    const x = hasTempo ? tempoBox.right + 16 : firstLine.left + 4;
    for (let staff = 0; staff < Math.min(M.stavesOf(score), staves.length); staff += 1) {
      const top = lines[staff][0].getBoundingClientRect().top;
      const y = staff === 0 && hasTempo ? (tempoBox.top + tempoBox.bottom) / 2 : top - space * 2.6;
      const name = registerLabel(staff);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'score-register-trigger';
      if (M.registerOf(score, staff) === M.NO_REGISTER) button.classList.add('is-empty');
      button.dataset.staff = staff;
      button.style.left = (x - origin.left - stage.clientLeft) + 'px';
      button.style.top = Math.max(12, y - origin.top - stage.clientTop) + 'px';
      button.textContent = name;
      button.setAttribute('aria-label', t.registerButton.replace('{n}', staff + 1).replace('{name}', name));
      button.setAttribute('aria-controls', registerPopup.id);
      button.setAttribute('aria-haspopup', 'dialog');
      button.addEventListener('click', () => {
        if (registerPopup.matches(':popover-open')) { registerPopup.hidePopover(); return; }
        registerStaff = staff;
        registerList.querySelectorAll('button').forEach((option) => option.setAttribute('aria-pressed', String(option.dataset.register === M.registerOf(score, staff))));
        registerAnchor = button;
        registerPopup.showPopover();
        placeRegisterPopup();
      });
      stage.appendChild(button);
    }
  }

  // Un control de clave por pentagrama de cada renglon (y por cada cambio de clave dibujado).
  function mountClefButtons() {
    stage.querySelectorAll('g.clef').forEach((clef, i) => {
      const box = clef.getBoundingClientRect();
      const origin = stage.getBoundingClientRect();
      const measureNode = clef.closest('g.measure');
      const mi = measureNode ? Number(measureNode.id.slice(1)) : M.rowStarts(score)[i];
      const staff = measureNode ? [...measureNode.querySelectorAll(':scope > g.staff')].indexOf(clef.closest('g.staff')) : 0;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'score-clef-trigger';
      button.dataset.staff = staff;
      button.setAttribute('aria-label', t.clefAndKey + ': ' + (M.stavesOf(score) > 1 ? staffName(staff) + ', ' : '') + t.clefs[M.clefAt(score, mi, staff)] + ', ' + t.keys[M.keyAt(score, mi) + 7]);
      button.setAttribute('aria-controls', clefPopup.id);
      button.setAttribute('aria-haspopup', 'dialog');
      button.setAttribute('aria-expanded', 'false');
      button.style.left = (box.left + box.width / 2 - origin.left - stage.clientLeft) + 'px';
      button.style.top = (box.top + box.height / 2 - origin.top - stage.clientTop) + 'px';
      button.style.height = Math.max(44, box.height + 8) + 'px';
      button.addEventListener('click', () => {
        if (clefPopup.matches(':popover-open')) { clefPopup.hidePopover(); return; }
        openClefPopup({ kind: 'clef', index: i, staff }, mi);
      });
      hoverGlyph(button, clef);
      stage.appendChild(button);
    });
  }

  // ---- paleta -------------------------------------------------------------

  const ICONS = {
    'third-below': '<path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><text x="17.5" y="19.5" text-anchor="middle" font-size="17" font-weight="700" fill="currentColor" stroke="none">3</text>',
    'sixth-below': '<path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><text x="17.5" y="19.5" text-anchor="middle" font-size="17" font-weight="700" fill="currentColor" stroke="none">6</text>',
    merge: '<path d="m8 6 4-4 4 4"/><path d="M12 2v10.3a4 4 0 0 1-1.172 2.872L4 22"/><path d="m20 22-5-5"/>',
    split: '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.828L3 3"/><path d="m15 9 6-6"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    pause: '<rect x="14" y="3" width="5" height="18" rx="1"/><rect x="5" y="3" width="5" height="18" rx="1"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    piano: '<path d="M18.5 8c-1.4 0-2.6-.8-3.2-2A6.87 6.87 0 0 0 2 9v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-8.5C22 9.6 20.4 8 18.5 8"/><path d="M2 14h20"/><path d="M6 14v4"/><path d="M10 14v4"/><path d="M14 14v4"/><path d="M18 14v4"/>',
    voices: '<path d="m11 7.601-5.994 8.19a1 1 0 0 0 .1 1.298l.817.818a1 1 0 0 0 1.314.087L15.09 12"/><path d="M16.5 21.174C15.5 20.5 14.372 20 13 20c-2.058 0-3.928 2.356-6 2-2.072-.356-2.775-3.369-1.5-4.5"/><circle cx="16" cy="7" r="5"/>',
    guitar: '<path d="m11.9 12.1 4.514-4.514"/><path d="M20.1 2.3a1 1 0 0 0-1.4 0l-1.114 1.114A2 2 0 0 0 17 4.828v1.344a2 2 0 0 1-.586 1.414A2 2 0 0 1 17.828 7h1.344a2 2 0 0 0 1.414-.586L21.7 5.3a1 1 0 0 0 0-1.4z"/><path d="m6 16 2 2"/><path d="M8.2 9.9C8.7 8.8 9.8 8 11 8c2.8 0 5 2.2 5 5 0 1.2-.8 2.3-1.9 2.8l-.9.4A2 2 0 0 0 12 18a4 4 0 0 1-4 4c-3.3 0-6-2.7-6-6a4 4 0 0 1 4-4 2 2 0 0 0 1.8-1.2z"/><circle cx="11.5" cy="12.5" r=".5" fill="currentColor"/>',
    settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
    'square-chevrons-down': '<path d="M9 14L12 17L15 14"/><path d="M9 8L12 11L15 8"/><rect x="3" y="3" width="18" height="18" rx="2"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    'file-text': '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
    'file-code': '<path d="M10 12.5 8 15l2 2.5"/><path d="m14 12.5 2 2.5-2 2.5"/><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    trash:'<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/>',
    // Sin equivalente en Lucide: ligadura (arco entre dos notas) y ligadura quitada.
    merge: '<path d="m8 6 4-4 4 4"/><path d="M12 2v10.3a4 4 0 0 1-1.172 2.872L4 22"/><path d="m20 22-5-5"/>',
    link: '<ellipse cx="3" cy="8" rx="3" ry="2" transform="rotate(-25 3 8)" fill="currentColor" stroke="none"/><ellipse cx="21" cy="8" rx="3" ry="2" transform="rotate(-25 21 8)" fill="currentColor" stroke="none"/><path d="M4 13c1.500 7 14.500 7 16 0"/>',
    unlink: '<ellipse cx="3" cy="8" rx="3" ry="2" transform="rotate(-25 3 8)" fill="currentColor" stroke="none"/><ellipse cx="21" cy="8" rx="3" ry="2" transform="rotate(-25 21 8)" fill="currentColor" stroke="none"/><path d="M4 13c1.500 7 14.500 7 16 0"/><path d="M4 3l16 18"/>',
    beam: '<path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>',
    // Sin equivalente en Lucide: tresillo, tresillo quitado y notas separadas.
    triplet: '<path d="M3 19v-5h6M21 19v-5h-6"/><path d="M10 7.500c.5-1 4-1.500 4 .500 0 1.200-1.500 1.800-2 1.800.600 0 2.200.400 2.200 2 0 2-3.700 1.800-4.200.700" stroke-width="1.700"/>',
    untriplet: '<path d="M3 19v-5h6M21 19v-5h-6"/><path d="M10 7.500c.5-1 4-1.500 4 .500 0 1.200-1.500 1.800-2 1.800.600 0 2.200.400 2.200 2 0 2-3.700 1.800-4.200.700" stroke-width="1.700"/><path d="M4 4l16 12"/>',
    unbeam: '<circle cx="6" cy="18" r="3"/><path d="M9 18V4"/><circle cx="18" cy="16" r="3"/><path d="M21 16V2"/>',
    'move-horizontal': '<path d="m18 8 4 4-4 4"/><path d="M2 12h20"/><path d="m6 8-4 4 4 4"/>',
    'arrow-left': '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    'arrow-right': '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    download: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
  };

  const ACTION_ICONS = { triplet: 'triplet', untriplet: 'untriplet', link: 'link', unlink: 'unlink', beam: 'beam', unbeam: 'unbeam', joinChord: 'link', mergeLyrics: 'merge' };
  // Los demas grupos (2, 4 a 9 figuras) son el icono del tresillo con su numero.
  for (let n = 2; n <= 9; n += 1) {
    if (n === 3) continue;
    ICONS['tuplet' + n] = ICONS.triplet.replace(/<path d="M10 7[^>]*>/, '') + '<text x="12" y="13" text-anchor="middle" font-size="12" font-weight="700" stroke="none" fill="currentColor">' + n + '</text>';
    ICONS['untuplet' + n] = ICONS['tuplet' + n];
    ACTION_ICONS['tuplet' + n] = 'tuplet' + n;
    ACTION_ICONS['untuplet' + n] = 'untuplet' + n;
  }

  function lucide(name) {
    return '<svg class="lucide" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" ' +
      'stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + '</svg>';
  }

  // Glifos propios: Lucide no tiene figuras musicales. Notas y silencios son los trazos Bravura que dibuja Verovio en la partitura.
  const GLYPHS = {
    'note:w': '<path d="M15.74 18.63c4.5 0 9.14 1.99 9.14 5.87c0 4.06 -5.21 5.87 -10.02 5.87c-4.46 0 -7.86 -2.03 -7.86 -5.87c0 -3.88 4.1 -5.87 8.74 -5.87zM19.93 25.43c0 -0.62 -0.13 -1.28 -0.35 -1.94c-0.31 -0.88 -0.79 -1.68 -1.46 -2.38c-0.88 -0.93 -1.9 -1.37 -3 -1.37l-0.88 0.09c-0.66 0.22 -1.19 0.62 -1.59 1.24c-0.18 0.4 -0.26 0.75 -0.35 1.06s-0.13 0.71 -0.13 1.19c0 0.66 0.13 1.5 0.4 2.52s0.79 1.81 1.5 2.43c0.66 0.66 1.59 1.02 2.74 1.02c0.18 0 0.44 -0.04 0.79 -0.09c0.84 -0.22 1.41 -0.66 1.77 -1.32s0.57 -1.5 0.57 -2.43 z" fill-rule="evenodd"/>',
    'note:h': '<path d="M19.27 21.68c0 -0.97 -0.75 -1.72 -1.9 -1.72c-0.53 0 -1.15 0.13 -1.81 0.44c-3.75 1.9 -7.28 4.15 -7.28 6.89c0.22 1.1 0.66 1.41 2.16 1.41c2.96 -0.49 8.83 -4.19 8.83 -7.02zM7 26.09c0 -3 3.22 -7.68 8.83 -7.68c2.91 0 5.03 1.72 5.03 4.28c0 3.71 -4.68 7.64 -9.62 7.64c-2.82 0 -4.24 -1.41 -4.24 -4.24 z" fill-rule="evenodd"/><path d="M20.3 22.8V-12.3" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    'note:q': '<path d="M7 26.22c0 -3 3.22 -7.59 8.83 -7.59c2.91 0 5.03 1.63 5.03 4.19c0 3.71 -4.68 7.55 -9.62 7.55c-2.82 0 -4.24 -1.32 -4.24 -4.15 z"/><path d="M20.3 22.8V-12.3" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    'note:e': '<path d="M7 26.22c0 -3 3.22 -7.59 8.83 -7.59c2.91 0 5.03 1.63 5.03 4.19c0 3.71 -4.68 7.55 -9.62 7.55c-2.82 0 -4.24 -1.32 -4.24 -4.15 z"/><path d="M20.3 22.8V-12.3" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M27.65 16.23c0.66 -1.28 1.28 -2.43 2.03 -4.5c0.79 -2.16 1.32 -4.77 1.32 -6.09c0 -4.63 -3.53 -7.64 -7.41 -8.83c-0.79 -0.22 -2.07 -0.4 -3.84 -0.71v-8.39h0.97c0.35 0 1.46 2.69 3.13 4.19c0.18 0.13 -0.09 -0.13 2.69 2.47c2.74 2.56 5.38 6.05 5.38 10.64c0 1.68 -0.57 4.68 -1.54 7.19c-0.88 2.25 -1.9 4.37 -2.91 5.83c-0.26 0.22 -0.44 0.31 -0.57 0.31s-0.22 -0.09 -0.22 -0.22l0.18 -0.44c0.04 -0.13 0.62 -1.1 0.79 -1.46 z"/>',
    'note:s': '<path d="M7 26.22c0 -3 3.22 -7.59 8.83 -7.59c2.91 0 5.03 1.63 5.03 4.19c0 3.71 -4.68 7.55 -9.62 7.55c-2.82 0 -4.24 -1.32 -4.24 -4.15 z"/><path d="M20.3 22.8V-12.3" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M28.84 20.73c1.41 -2.12 2.16 -4.41 2.16 -6.58c0 -3.93 -2.43 -7.41 -7.41 -8.96c-0.79 -0.22 -2.07 -0.4 -3.84 -0.71v-8.39v-8.39h0.97c0.35 0 1.46 2.69 3.13 4.19c0.18 0.13 -0.09 -0.13 2.69 2.47c2.74 2.56 5.38 6.05 5.38 10.64c0 1.41 -0.31 2.87 -0.75 4.24c0.49 1.28 0.75 2.65 0.75 4.15c0 3.13 -1.41 6.53 -2.96 8.39c-0.26 0.22 -0.44 0.31 -0.57 0.31s-0.22 -0.09 -0.22 -0.22l0.18 -0.44c0.04 -0.13 0.26 -0.35 0.49 -0.71zM30.7 8.15c0.18 -0.79 0.31 -1.68 0.31 -2.52c0 -4.63 -3.53 -7.64 -7.41 -8.83c-0.49 -0.13 -1.19 -0.26 -2.07 -0.4c0.4 0.75 1.02 2.69 2.34 3.88c0.18 0.13 -0.09 -0.13 2.69 2.47c1.59 1.46 3.13 3.27 4.15 5.38 z"/>',
    'note:f': '<path d="M7 26.22c0 -3 3.22 -7.59 8.83 -7.59c2.91 0 5.03 1.63 5.03 4.19c0 3.71 -4.68 7.55 -9.62 7.55c-2.82 0 -4.24 -1.32 -4.24 -4.15 z"/><path d="M20.3 22.8V-12.3" stroke="currentColor" stroke-width="1.5" fill="none"/><path d="M30.7 8.15c0.18 -0.79 0.31 -1.68 0.31 -2.52c0 -4.63 -3.53 -7.64 -7.41 -8.83c-0.49 -0.13 -1.19 -0.26 -2.07 -0.4c0.4 0.75 1.02 2.69 2.34 3.88c0.18 0.13 -0.09 -0.13 2.69 2.47c1.59 1.46 3.13 3.27 4.15 5.38zM28.84 20.73c1.41 -2.12 2.16 -4.41 2.16 -6.58c0 -3.93 -2.43 -7.41 -7.41 -8.96c-0.79 -0.22 -2.07 -0.4 -3.84 -0.71v-8.39v-8.39v-8.39h0.97c0.35 0 1.46 2.69 3.13 4.19c0.18 0.13 -0.09 -0.13 2.69 2.47c2.69 2.52 5.38 5.91 5.38 10.37v0.26c-0.04 2.6 -0.44 3.53 -0.84 4.02c0.53 1.32 0.84 2.78 0.84 4.37c0 1.41 -0.31 2.87 -0.75 4.24c0.49 1.28 0.75 2.65 0.75 4.15c0 3.13 -1.41 6.53 -2.96 8.39c-0.26 0.22 -0.44 0.31 -0.57 0.31s-0.22 -0.09 -0.22 -0.22l0.18 -0.44c0.04 -0.13 0.26 -0.35 0.49 -0.71zM30.65 -0.36c0.18 -0.49 0.35 -1.24 0.35 -2.38c0 -4.63 -3.53 -7.64 -7.41 -8.83c-0.49 -0.13 -1.19 -0.26 -2.07 -0.4c0.4 0.75 1.02 2.69 2.34 3.88c0.18 0.13 -0.09 -0.13 2.69 2.47c1.54 1.46 3.09 3.18 4.1 5.25 z"/>',
    'rest:w':'<path d="M4 12.619h22" stroke="currentColor" stroke-width="1.4"/><g transform="translate(-1.676 -3.878) scale(1.225)"><path d="M7 18.54v-4.63c0 -0.4 0.04 -0.44 0.44 -0.44h12.36c0.4 0 0.44 0.04 0.44 0.44v4.63c0 0.4 -0.04 0.44 -0.44 0.44h-12.36c-0.4 0 -0.44 -0.04 -0.44 -0.44 z"/></g>',
    'rest:h': '<path d="M4 19.381h22" stroke="currentColor" stroke-width="1.4"/><g transform="translate(-1.676 -10.640) scale(1.225)"><path d="M7 24.06v-4.63c0 -0.4 0.04 -0.44 0.44 -0.44h12.36c0.4 0 0.44 0.04 0.44 0.44v4.63c0 0.4 -0.04 0.44 -0.44 0.44h-12.36c-0.4 0 -0.44 -0.04 -0.44 -0.44 z"/></g>',
    'rest:q': '<g transform="translate(-1.807 -14.445) scale(1.225)"><path d="M11.72 11.61c-0.57 -1.06 -1.32 -2.16 -2.3 -3.13c-0.04 -0.04 0 -0.09 0 -0.13l-0.09 -0.09c0.13 -0.13 0.18 -0.18 0.26 -0.18c0.53 0 1.15 0.31 1.77 0.88s1.94 1.77 3.93 3.58c1.15 1.06 1.24 1.28 2.03 2.07c0.18 0.18 0.35 0.4 0.44 0.62c0.26 0.35 0.35 0.71 0.35 1.19c0 0.84 -0.53 1.77 -1.59 2.69c-1.24 1.02 -2.16 1.68 -2.69 3.22c-0.18 0.49 -0.31 1.19 -0.44 2.21c0.57 1.9 1.5 3.66 2.6 5.34c1.37 2.07 2.6 3.49 4.46 5.69c-0.35 0 -1.15 -0.31 -2.38 -0.88l-2.74 -1.28l-0.93 -0.26l-1.02 -0.04c-1.1 0 -1.99 0.44 -2.65 1.32l-0.18 0.62l-0.04 0.53c0 1.46 0.88 2.47 1.72 3.44c0.35 0.4 0.75 0.79 1.15 1.15c0.75 0.66 1.19 1.06 1.24 1.32l-0.13 0.13c-0.49 -0.22 -0.84 -0.44 -1.1 -0.66c-0.4 -0.13 -1.63 -0.93 -1.99 -1.15c-1.06 -0.62 -1.99 -1.41 -2.78 -2.25c-0.84 -0.93 -1.63 -1.94 -1.63 -3.13c0 -2.78 1.19 -4.19 3.53 -4.19c1.81 0 3.8 0.79 6 2.3c-0.84 -1.15 -1.63 -2.12 -2.43 -2.91c-1.02 -1.02 -2.12 -1.94 -3.22 -2.87c-1.24 -1.02 -2.07 -1.77 -2.56 -2.34s-0.75 -1.15 -0.79 -1.72c3.31 -2.82 4.99 -5.52 4.99 -8.08c0 -1.19 -0.31 -2.12 -0.79 -3 z"/></g>',
    'rest:e': '<g transform="translate(-1.023 -15.817) scale(1.225)"><path d="M7 19.07c0.31 -1.5 1.46 -2.47 3.05 -2.65c1.28 0.13 1.9 0.4 2.34 1.28c0.18 0.35 0.31 0.66 0.44 0.97c0 0.93 -0.04 1.1 -0.49 1.54c-0.22 0.35 -0.79 0.62 -1.77 0.88l0.53 0.13l0.66 0.04c1.94 0 4.28 -1.15 5.38 -2.47c0.44 -0.49 0.79 -1.15 1.06 -1.85c0.31 -0.04 0.66 -0.09 0.97 -0.13l-6.18 18.71h-1.59l4.9 -14.56c-0.44 0.26 -1.19 0.53 -2.34 0.71l-2.3 0.35h-0.44l-0.88 -0.04c-0.04 0 -0.35 -0.13 -0.93 -0.26c-1.63 -0.4 -2.43 -1.24 -2.43 -2.65 z"/></g>',
    'rest:s': '<g transform="translate(-2.346 -22.645) scale(1.225)"><path d="M12.87 29.4c0 1.46 -0.93 2.21 -2.3 2.43c0.44 0.13 0.79 0.18 1.1 0.18c1.77 0 3.05 -1.06 3.97 -2.07l2.91 -8.69c-1.59 0.79 -2.82 1.1 -4.94 1.1c-1.02 0 -1.68 -0.13 -1.99 -0.35c-1.63 -0.31 -2.43 -1.19 -2.43 -2.6c0.35 -1.54 1.32 -2.38 3 -2.56c1.99 0.26 2.16 0.57 2.82 2.12c0 0.13 0.04 0.22 0.04 0.31c0 1.19 -1.1 2.03 -2.3 2.16c0.26 0.18 0.66 0.26 1.15 0.26c1.41 -0.09 2.74 -0.62 3.88 -1.28c1.41 -0.84 1.94 -1.59 2.6 -3.13l0.31 -0.04l0.44 -0.09h0.18c-3.18 9.71 -6.31 19.38 -9.49 29.09h-1.63l4.77 -14.3c-0.88 0.57 -2.25 0.88 -3.62 0.88c-0.93 0 -1.54 -0.18 -1.9 -0.44c-1.63 -0.26 -2.43 -1.15 -2.43 -2.56c0.35 -1.54 1.37 -2.47 3 -2.65c1.9 0.35 2.12 0.57 2.82 2.25 z"/></g>',
    'rest:f': '<g transform="translate(-4.371 -15.964) scale(1.225)"><path d="M10.05 26.88c1.94 0.4 2.16 0.44 2.78 2.21c0 0.62 -0.04 1.06 -0.18 1.28c-0.31 0.49 -1.02 0.88 -2.07 1.15c0.26 0.13 0.66 0.18 1.1 0.18c0.79 0 1.72 -0.31 2.69 -0.97c0.79 -0.53 1.32 -1.15 1.32 -1.15l2.69 -8.25c-0.97 0.53 -2.12 0.93 -3.58 0.93c-0.79 0 -1.5 -0.13 -2.03 -0.4c-1.59 -0.4 -2.38 -1.28 -2.38 -2.69c0.35 -1.5 1.37 -2.56 3 -2.56c1.5 0 2.78 1.06 2.78 2.52c0 0.49 -0.18 0.93 -0.44 1.32c-0.18 0.22 -0.71 0.53 -1.72 0.79c0.35 0.13 0.71 0.22 1.06 0.22c1.54 0 3.13 -1.1 3.88 -1.99l2.91 -8.74c-0.53 0.49 -1.46 0.53 -2.43 0.75c-0.79 0.18 -1.28 0.35 -1.54 0.35h-0.66l-1.24 -0.09c-0.44 -0.04 -0.75 -0.13 -1.02 -0.26c-1.63 -0.31 -2.47 -1.15 -2.47 -2.6c0.4 -1.46 1.46 -2.6 3.18 -2.6c1.46 0 2.34 0.93 2.69 2.16c0 1.63 -0.75 2.07 -2.25 2.43c0.22 0.18 0.57 0.26 1.06 0.26c0.62 0 1.28 -0.13 1.99 -0.35c2.07 -0.66 3.93 -1.9 4.46 -4.06l0.79 -0.09l0.18 0.04l-12.71 39.24h-1.63l4.68 -14.04c-0.75 0.44 -1.9 0.66 -3.18 0.66c-0.97 0 -1.77 -0.13 -2.3 -0.4c-1.54 -0.35 -2.43 -1.02 -2.43 -2.69c0.35 -1.54 1.37 -2.38 3 -2.56 z"/></g>',
    // Navigation symbols use Bravura outlines and conventional ending brackets.
    // Los tres comparten la misma linea fina en x=15 (y la gruesa de las repeticiones junto a ella), para que apilados se lean como una sola barra.
    'nav:dc': '<text x="15" y="21" text-anchor="middle" font-size="13" font-family="serif" font-weight="700">D.C.</text>',
    'nav:ds': '<text x="15" y="21" text-anchor="middle" font-size="13" font-family="serif" font-weight="700">D.S.</text>',
    'nav:segno': '<path transform="translate(5 29) scale(.049 -.049)" d="M108 474c-22 0 -38 -30 -38 -56c0 -54 73 -85 140 -116l138 205h41l-146 -221c41 -21 73 -44 96 -67c28 -29 42 -62 42 -97c0 -68 -54 -122 -124 -122c-40 0 -76 33 -76 73c0 22 21 38 43 38c23 0 34 -17 39 -38c6 -23 16 -34 31 -34c27 0 42 23 42 54c0 13 -3 23 -8 32c-9 17 -33 36 -72 57l-60 30l-134 -208h-40l141 223c-49 23 -85 50 -109 80c-21 27 -32 55 -32 84c0 47 25 80 54 102c17 13 37 20 58 20c46 0 91 -32 91 -77c0 -22 -23 -36 -45 -36c-19 0 -30 8 -35 25l-7 23c-5 17 -15 26 -30 26zM75 192c0 -21 -16 -38 -36 -38c-23 0 -39 13 -39 35c0 21 15 39 36 39c22 0 39 -15 39 -36zM337 322c0 24 16 38 37 38c23 0 37 -19 37 -37c0 -23 -17 -37 -37 -37c-23 0 -37 17 -37 36z"/>',
    'nav:first': '<path d="M4 25V7h23" stroke="currentColor" stroke-width="1.5" fill="none"/><text x="8" y="22" font-size="14" font-family="serif">1.</text>',
    'nav:second': '<path d="M4 25V7h23" stroke="currentColor" stroke-width="1.5" fill="none"/><text x="8" y="22" font-size="14" font-family="serif">2.</text>',
    // Reguladores: las dos lineas que se abren (crescendo) o se cierran (diminuendo).
    'hairpin:cresc': '<path d="M8 16l14-4M8 16l14 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>',
    'hairpin:dim': '<path d="M8 12l14 4M8 20l14-4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/>',
    'bar:double': '<path d="M10 4v24M15 4v24" stroke="currentColor" stroke-width="1.6"/>',
    'bar:start': '<path d="M10 4v24" stroke="currentColor" stroke-width="3.5"/><path d="M15 4v24" stroke="currentColor" stroke-width="1.6"/><circle cx="21" cy="12" r="1.8"/><circle cx="21" cy="20" r="1.8"/>',
    'bar:end': '<path d="M15 4v24" stroke="currentColor" stroke-width="1.6"/><path d="M20 4v24" stroke="currentColor" stroke-width="3.5"/><circle cx="9" cy="12" r="1.8"/><circle cx="9" cy="20" r="1.8"/>',
    barre: '<text x="3" y="18" font-size="16" font-weight="700" font-family="serif">C</text><path d="M3 24h24" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2.500" fill="none"/>',
    lyric: '<g transform="translate(3 4)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7V4h16v3M9 20h6M12 4v16"/></g>',
    chord: '<text x="15" y="21" text-anchor="middle" font-size="18" font-family="serif" font-weight="700">Am</text>',
    dead: '<path d="M8.500 19.500l11 11M19.500 19.500l-11 11" stroke="currentColor" stroke-width="2.200" fill="none"/><path d="M20.3 22.8V-12.3" stroke="currentColor" stroke-width="1.5" fill="none"/>',
    dot: '<circle cx="15" cy="15" r="3.200"/>',
    'acc:#': '<path d="M11 6v20M18 4v20M7.500 12.500l14-3.500M7.500 21l14-3.500" stroke="currentColor" stroke-width="1.800" fill="none"/>',
    'acc:b': '<path d="M10 4v22c4-2 8-5 8-8.500 0-2.500-2-3.500-4-3.500-1.500 0-3 .800-4 2" stroke="currentColor" stroke-width="1.800" fill="none" stroke-linejoin="round"/>',
    'acc:n': '<path d="M10 5v16l10-3.500M20 27V11L10 14.500" stroke="currentColor" stroke-width="1.800" fill="none" stroke-linejoin="round"/>',
  };

  function glyphKey(item) {
    if (item.kind === 'navigation') return 'nav:' + item.mark;
    if (item.kind === 'bar') return 'bar:' + item.bar;
    if (item.kind === 'barre') return 'barre';
    if (item.kind === 'chord') return 'chord';
    if (item.kind === 'lyric') return 'lyric';
    if (item.kind === 'hairpin') return 'hairpin:' + item.hairpin;
    if (item.dead) return 'dead';
    if (item.kind === 'note' || item.kind === 'rest') return item.kind + ':' + item.d;
    return item.kind === 'dot' ? 'dot' : 'acc:' + item.acc;
  }

  function glyphFor(item) {
    const svg = document.createElementNS(SVG_NS, 'svg');
    // Las banderas superan x=30 y la fusa sube por encima de y=-16.
    const tall = item.kind === 'note' && item.d !== 'w';
    // Los silencios usan la escala de la partitura; la fusa necesita espacio vertical extra.
    const rest = item.kind === 'rest';
    svg.setAttribute('viewBox', tall ? '0 -24 36 56' : rest ? '0 -12 30 56' : '0 0 30 32');
    svg.setAttribute('width', tall ? '36' : '30');
    svg.setAttribute('height', tall ? '56' : rest ? '56' : '32');
    if (tall) svg.classList.add('score-note-glyph');
    if (rest && ['f', 's', 'e'].includes(item.d)) svg.classList.add('score-small-rest-glyph');
    if (item.kind === 'lyric') svg.classList.add('score-lyric-glyph');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    if (item.kind === 'dynamic') {
      svg.innerHTML = '<text x="15" y="22" text-anchor="middle" font-size="' + (item.dynamic.length > 2 ? '15' : '19') + '" font-family="serif" font-style="italic" font-weight="700">' + item.dynamic + '</text>';
    } else svg.innerHTML = GLYPHS[glyphKey(item)];
    return svg;
  }

  const ITEMS = [
    { kind: 'note', d: 'f', key: '1', label: t.thirtySecond },
    { kind: 'note', d: 's', key: '2', label: t.sixteenth },
    { kind: 'note', d: 'e', key: '3', label: t.eighth },
    { kind: 'note', d: 'q', key: '4', label: t.quarter },
    { kind: 'note', d: 'h', key: '5', label: t.half },
    { kind: 'note', d: 'w', key: '6', label: t.whole },
    { kind: 'note', d: 'q', dead: true, key: t.shortcuts.dead, label: t.dead },
    null,
    { kind: 'rest', d: 'f', key: 'q', code: 'KeyQ', label: t.restThirtySecond },
    { kind: 'rest', d: 's', key: 'w', code: 'KeyW', label: t.restSixteenth },
    { kind: 'rest', d: 'e', key: 'e', code: 'KeyE', label: t.restEighth },
    { kind: 'rest', d: 'q', key: 'r', code: 'KeyR', label: t.restQuarter },
    { kind: 'rest', d: 'h', key: 't', code: 'KeyT', label: t.restHalf },
    { kind: 'rest', d: 'w', key: 'y', code: 'KeyY', label: t.restWhole },
    null,
    { kind: 'dot', key: t.shortcuts.dot, label: t.dot },
    { kind: 'acc', acc: '#', key: t.shortcuts.sharp, label: t.sharp },
    { kind: 'acc', acc: 'b', key: t.shortcuts.flat, label: t.flat },
    { kind: 'acc', acc: 'n', key: t.shortcuts.natural, label: t.natural },
  ];

  const BARS = [
    { kind: 'barre', label: t.barre },
    ...(chordsOn ? [{ kind: 'chord', label: t.chordTool }] : []),
    ...(lyrics ? [{ kind: 'lyric', label: t.lyricTool }] : []),
    { kind: 'bar', bar: 'start', label: t.barRepeatStart },
    { kind: 'bar', bar: 'end', label: t.barRepeatEnd },
    { kind: 'bar', bar: 'double', label: t.barDouble },
    ...['dc', 'ds', 'segno', 'first', 'second'].map((mark) => ({ kind: 'navigation', mark, label: t['nav' + mark] })),
    ...M.DYNAMICS.map((dynamic) => ({ kind: 'dynamic', dynamic, label: t.dynamic + ': ' + dynamic })),
    { kind: 'hairpin', hairpin: 'cresc', label: t.hairpinCresc },
    { kind: 'hairpin', hairpin: 'dim', label: t.hairpinDim },
  ];

  const intensities = document.createElement('div');
  intensities.className = 'score-intensities';
  ITEMS.concat(BARS).forEach((item) => {
    if (!item) {
      const sep = document.createElement('span');
      sep.className = 'score-palette-sep';
      palette.appendChild(sep);
      return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'score-palette-item score-palette-tool tooltip';
    button.setAttribute('aria-label', item.label);
    button.dataset.tooltip = item.label;
    button.appendChild(glyphFor(item));
    // The accessible name must contain the text the button shows (WCAG 2.5.3, "label in name"): D.C., D.S., 1., 2.
    const shown = button.textContent.trim();
    if (shown && !item.label.toLowerCase().includes(shown.toLowerCase())) button.setAttribute('aria-label', shown + ': ' + item.label);
    button.setAttribute('aria-pressed', 'false');
    button.dataset.group = item.kind === 'bar' || item.kind === 'navigation' ? 'repeats' : (item.kind === 'hairpin' || item.kind === 'dynamic') ? 'dynamics' : item.kind === 'barre' || item.kind === 'chord' ? 'barre' : item.kind === 'lyric' ? 'lyrics' : '';
    if (item.kind === 'bar') {
      button.dataset.barline = item.bar;
      button.addEventListener('click', (event) => {
        if (event.detail === 0) activateTool(item);
      });
    }
    if (item.kind === 'navigation') {
      button.dataset.navigation = item.mark;
      button.addEventListener('click', (event) => { if (event.detail === 0) activateTool(item); });
    }
    if (item.kind === 'dynamic') {
      button.dataset.dynamic = item.dynamic;
      button.addEventListener('click', (event) => { if (event.detail === 0) activateTool(item); });
    }
    if (item.kind === 'hairpin') {
      button.dataset.hairpin = item.hairpin;
      button.addEventListener('click', (event) => { if (event.detail === 0) activateTool(item); });
    }
    if (item.kind === 'barre' || item.kind === 'chord' || item.kind === 'lyric') {
      button.dataset.tool = item.kind;
      button.addEventListener('click', (event) => {
        if (event.detail === 0) activateTool(item);
      });
    }
    if (item.key) {
      button.dataset.shortcut = item.key;
      button.setAttribute('aria-keyshortcuts', item.key);
      button.setAttribute('aria-pressed', 'false');
      const key = document.createElement('span');
      key.className = 'score-palette-key';
      key.setAttribute('aria-hidden', 'true');
      key.textContent = item.key;
      button.appendChild(key);
      button.addEventListener('click', (event) => {
        if (event.detail === 0) activateTool(item);
      });
    }
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      beginDrag(event, { item, kind: item.kind, glyph: glyphFor(item) });
    });
    if (item.kind === 'dynamic') {
      if (!intensities.isConnected) barlines.appendChild(intensities);
      intensities.appendChild(button);
    } else (isPlacing(item) ? barlines : palette).appendChild(button);
  });

  // TAB: muestra u oculta una tablatura bajo cada renglon.
  const tabToggle = document.createElement('button');
  tabToggle.type = 'button';
  tabToggle.id = 'scoreTabToggle';
  tabToggle.className = 'score-palette-item score-tab-toggle tooltip';
  tabToggle.textContent = 'TAB';
  tabToggle.setAttribute('aria-label', 'TAB: ' + t.tabToggle);
  tabToggle.dataset.tooltip = t.tabToggle;
  tabToggle.addEventListener('click', () => {
    if (score.showTabs) delete score.showTabs; else score.showTabs = true;
    save();
    render();
  });
  barlines.prepend(tabToggle);

  // Los grupos de herramientas son de cada partitura; sin elegir, repeticion y dinamica se ven y las voces no.
  const toolOn = (name, fallback = true) => !settings || (score.tools && name in score.tools ? score.tools[name] : fallback);

  let player = null, audioContext = null, playbackState = 'idle', playbackRequest = 0, playbackTrack = null;
  let playbackDocument = null, playbackSnapshot = null;
  let playbackSelectionPosition = null;
  let playbackActivityDocument = null, playbackActivityMeasure = null, playbackActivityAt = 0;
  let playbackMarkedSelection = null;
  let playbackFrame = null, playbackLayout = [];
  const playbackCursor = document.createElement('span');
  playbackCursor.className = 'score-playback-cursor';
  playbackCursor.setAttribute('aria-hidden', 'true');
  let playbackHint = null, playbackHintPosition = null;

  function selectedPlaybackMeasure() {
    const measures = [
      ...picks().map((ref) => ref.mi),
      ...selectedChords.map((ref) => ref.mi),
      ...(selectedLink?.refs || []).map((ref) => ref.mi),
      ...(selectedBeam?.refs || []).map((ref) => ref.mi),
      ...selectedNavigation.map((ref) => ref.first),
      ...[...stage.querySelectorAll('.score-barline-trigger[aria-pressed="true"]')].map((node) => Number(node.dataset.measure)),
    ];
    if (selectedMeasure !== null) measures.push(selectedMeasure);
    if (selectedHairpin) measures.push(selectedHairpin.mi);
    return measures.length ? Math.min(...measures) : null;
  }

  function rememberPlaybackMeasure(mi, at = 0) {
    if (playbackActivityDocument !== score) {
      playbackActivityDocument = score;
      playbackActivityMeasure = null;
      playbackActivityAt = 0;
    }
    if (mi !== null) { playbackActivityMeasure = mi; playbackActivityAt = at; }
  }

  function rememberPlaybackSelection() {
    const hasSelection = selected || selectedChords.length || selectedNavigation.length || selectedLink || selectedBeam || selectedHairpin;
    const mi = hasSelection ? selected?.mi ?? selectedPlaybackMeasure() : null;
    const at = selected ? M.onsets(laneOf(selected)[selected.mi])[selected.i] : 0;
    const key = JSON.stringify([mi, selected, at]);
    if (playbackActivityDocument !== score || playbackMarkedSelection !== key) {
      playbackMarkedSelection = key;
      if (mi !== null) rememberPlaybackMeasure(mi, at ?? 0);
    }
  }

  function playbackOffset(mi, at = 0) {
    return (measureOffset(0, mi) + at) * 60 / (score.tempo || 120) / M.DIVISIONS;
  }

  function activePlaybackPosition() {
    rememberPlaybackMeasure(null);
    const mi = Math.min(playbackActivityMeasure ?? 0, M.measures(score).length - 1);
    return playbackOffset(mi, Math.min(playbackActivityAt, M.capacity(score, mi)));
  }

  function playbackPositionAt(event, mi) {
    const ref = eventUnder(event.clientX, event.clientY);
    if (ref) return M.onsets(laneOf(ref)[ref.mi])[ref.i];
    measurePlayback();
    const { anchors } = playbackLayout[mi];
    const x = event.clientX - stage.getBoundingClientRect().left;
    if (x <= anchors[0].x) return 0;
    for (let i = 1; i < anchors.length; i += 1) {
      const a = anchors[i - 1], b = anchors[i];
      if (x <= b.x) return a.time + (b.time - a.time) * (x - a.x) / (b.x - a.x);
    }
    return M.capacity(score, mi);
  }

  function playbackMeasureAt(event) {
    const origin = stage.getBoundingClientRect();
    const ref = eventUnder(event.clientX, event.clientY);
    const node = event.target.closest('[data-measure], g.measure');
    const mi = ref?.mi ?? (node ? Number(node.dataset.measure ?? node.id.slice(1)) : layout.findIndex((m) =>
      event.clientX >= origin.left + m.left && event.clientX <= origin.left + m.right &&
      event.clientY >= origin.top + m.top - 24 && event.clientY <= origin.top + m.bottom + 24));
    return Number.isInteger(mi) && mi >= 0 ? mi : locate(event.clientX, event.clientY)?.mi ?? -1;
  }

  function clearPlaybackHint() {
    playbackHint?.remove();
    playbackHint = null;
    playbackHintPosition = null;
    playbackCursor.hidden = false;
  }

  function drawPlaybackHint() {
    if (!playbackHint || !playbackHintPosition) return;
    const { mi, ratio } = playbackHintPosition;
    const bounds = layout[mi];
    if (!bounds || playbackHintPosition.document !== score) { clearPlaybackHint(); return; }
    const x = bounds.left + (bounds.right - bounds.left) * ratio;
    playbackHint.style.transform = `translate(${x - 1}px, ${bounds.top - 8}px)`;
    playbackHint.style.height = (bounds.bottom - bounds.top + 16) + 'px';
    playbackCursor.hidden = true;
    stage.appendChild(playbackHint);
  }

  function showPlaybackHint(event) {
    if (playButton.hidden || event.button !== 0 || playbackState === 'playing') return;
    const mi = playbackMeasureAt(event);
    if (!layout[mi]) return;
    rememberPlaybackMeasure(mi, playbackPositionAt(event, mi));
    clearPlaybackHint();
    const x = event.clientX - stage.getBoundingClientRect().left;
    const bounds = layout[mi];
    playbackHintPosition = { document: score, mi, ratio: (x - bounds.left) / (bounds.right - bounds.left) };
    playbackHint = document.createElement('span');
    playbackHint.className = 'score-playback-hint';
    playbackHint.setAttribute('aria-hidden', 'true');
    playbackHint.dataset.measure = String(mi);
    drawPlaybackHint();
  }

  // Record the gesture even when it clears a selection or revisits the same measure.
  stage.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.target.closest('.score-playback, .score-interval-toggle, .score-chord-names-toggle, .score-voice-legend, .score-selection-menu, .score-insert-measure')) return;
    const mi = playbackMeasureAt(event);
    if (!Number.isInteger(mi) || mi < 0 || mi >= M.measures(score).length) return;
    clearPlaybackHint();
    const at = playbackPositionAt(event, mi);
    rememberPlaybackMeasure(mi, at);
    // A new gesture during pause chooses a fresh start, including in the same measure.
    playbackSelectionPosition = null;
    if (playbackState === 'playing') {
      const from = playbackOffset(mi, at);
      player.play(playbackTrack, from);
      playbackSelectionPosition = from;
      if (playbackState === 'playing') animatePlayback();
    }
  }, true);

  function measurePlayback() {
    const origin = stage.getBoundingClientRect();
    let start = 0;
    playbackLayout = layout.map((bounds, mi) => {
      const duration = M.capacity(score, mi);
      const columns = new Map();
      for (let staff = 0; staff < M.stavesOf(score); staff += 1) {
        const measure = M.measures(score, staff)[mi] || [];
        const onsets = M.onsets(measure);
        eventNodes(mi, staff).forEach((node, i) => {
          const time = onsets[i];
          const column = columns.get(time) || [];
          column.push(centerX(node, origin));
          columns.set(time, column);
        });
      }
      if (!columns.has(0)) columns.set(0, [bounds.start]);
      columns.set(duration, [bounds.right]);
      const anchors = [...columns].map(([time, xs]) => ({ time, x: xs.reduce((a, b) => a + b, 0) / xs.length })).sort((a, b) => a.time - b.time);
      const entry = { start, end: start + duration, bounds, anchors };
      start += duration;
      return entry;
    });
  }

  function drawPlaybackCursor() {
    if (!player || !playbackTrack) return;
    const time = player.position * playbackTrack.tempo * M.DIVISIONS / 60;
    const mi = playbackLayout.findIndex((measure) => time < measure.end);
    const measure = playbackLayout[mi];
    if (!measure) return;
    const local = Math.max(0, time - measure.start);
    const { bounds, anchors } = measure;
    let x = anchors[anchors.length - 1].x;
    for (let i = 1; i < anchors.length; i += 1) {
      const a = anchors[i - 1], b = anchors[i];
      if (local <= b.time) { x = a.x + (b.x - a.x) * (local - a.time) / (b.time - a.time); break; }
    }
    playbackCursor.style.transform = `translate(${x}px, ${bounds.top - 8}px)`;
    playbackCursor.style.height = (bounds.bottom - bounds.top + 16) + 'px';
    playbackCursor.dataset.measure = String(mi);
    playbackCursor.dataset.time = String(time);
    if (!playbackCursor.isConnected) stage.appendChild(playbackCursor);
  }

  function animatePlayback() {
    cancelAnimationFrame(playbackFrame);
    drawPlaybackCursor();
    if (playbackState === 'playing') playbackFrame = requestAnimationFrame(animatePlayback);
  }

  const playButton = document.createElement('button');
  playButton.id = 'scorePlayback';
  playButton.type = 'button';
  playButton.className = 'score-palette-item score-playback tooltip';
  playButton.hidden = true;
  ['pointerdown', 'mousedown', 'click', 'dblclick'].forEach((type) => playButton.addEventListener(type, (event) => event.stopPropagation()));
  function syncPlayback() {
    const active = playbackState === 'playing';
    const loading = playbackState === 'loading';
    playButton.innerHTML = lucide(active ? 'pause' : 'play');
    const label = loading ? t.playbackLoading : active ? t.pause : t.play;
    playButton.setAttribute('aria-label', label);
    playButton.dataset.tooltip = label;
    playButton.setAttribute('aria-pressed', String(active));
    playButton.setAttribute('aria-busy', String(loading));
    playButton.disabled = loading;
  }
  function resetPlayback() {
    clearPlaybackHint();
    cancelAnimationFrame(playbackFrame);
    playbackCursor.remove();
    playbackLayout = [];
    playbackRequest += 1;
    player?.stop();
    playbackTrack = null;
    playbackDocument = null;
    playbackSnapshot = null;
    playbackSelectionPosition = null;
    playbackState = 'idle';
    syncPlayback();
  }
  function playbackSnapshotOf(document) {
    const clean = M.clone(document);
    M.pruneLower(clean);
    return JSON.stringify(clean);
  }
  // Settings can change while samples load; prepare the latest sound and tempo.
  async function preparePlaybackTrack(request) {
    let sound, tempo, track;
    do {
      sound = M.soundOf(score);
      tempo = score.tempo || 120;
      track = await player.prepare(M.clone(score), M, toolOn('voices', false) ? shownVoices : null, VOICE_COUNT);
    } while (request === playbackRequest && (sound !== M.soundOf(score) || tempo !== (score.tempo || 120)));
    return { ...track, sound, tempo };
  }
  async function refreshPlaybackTrack() {
    const request = ++playbackRequest;
    try {
      const track = await preparePlaybackTrack(request);
      if (request !== playbackRequest) return;
      // Keep playing while samples load, then preserve the musical position at the new tempo.
      const ratio = playbackTrack.tempo / track.tempo;
      const from = player.position * ratio;
      if (playbackSelectionPosition !== null) playbackSelectionPosition *= ratio;
      playbackTrack = track;
      player.replace(track, from);
      animatePlayback();
    } catch (error) {
      if (request === playbackRequest) say(t.playbackError);
    }
  }
  syncPlayback();
  playButton.addEventListener('click', async () => {
    clearPlaybackHint();
    if (playbackState === 'playing') {
      player.pause();
      playbackState = 'paused';
      animatePlayback();
      syncPlayback();
      return;
    }
    const from = activePlaybackPosition();
    const restart = playbackState !== 'paused' || from !== playbackSelectionPosition;
    const request = ++playbackRequest;
    playbackDocument = score;
    playbackSnapshot = playbackSnapshotOf(score);
    playbackState = 'loading';
    syncPlayback();
    try {
      // Unlock audio within the user gesture, before waiting for the lazy import or samples.
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const [{ createPlayer }] = await Promise.all([import('./score-playback.js'), audioContext.resume()]);
      if (request !== playbackRequest) return;
      player ||= createPlayer(audioContext, vendorUrl, resetPlayback);
      const track = playbackTrack?.sound === M.soundOf(score) && playbackTrack.tempo === (score.tempo || 120) ? playbackTrack : await preparePlaybackTrack(request);
      if (request !== playbackRequest) return;
      playbackTrack = track;
      playbackState = 'playing';
      const start = activePlaybackPosition();
      if (restart) playbackSelectionPosition = start;
      player.play(track, restart ? start : undefined);
      if (playbackState === 'playing') { measurePlayback(); animatePlayback(); }
      syncPlayback();
    } catch (error) {
      if (request !== playbackRequest) return;
      resetPlayback();
      say(t.playbackError);
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.defaultPrevented || playButton.hidden) return;
    if (event.target.closest('input, textarea, select, [contenteditable], ascii-tabs, [popover]:popover-open, [role="dialog"], button, a')) return;
    event.preventDefault();
    if (!event.repeat) playButton.click();
  });
  window.addEventListener('pagehide', resetPlayback);

  // The analysis toggle is a view preference for each open document.
  const intervalDocuments = new WeakSet();
  if (score.demo) intervalDocuments.add(score);
  const intervalButton = document.createElement('button');
  intervalButton.id = 'scoreIntervals';
  intervalButton.className = 'score-palette-item score-interval-toggle tooltip';
  intervalButton.type = 'button';
  intervalButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 4 5.765 15.835a.25.25 0 00.47 0L18 4"/></svg>';
  intervalButton.dataset.tooltip = t.toolsIntervalsTooltip;
  intervalButton.setAttribute('aria-label', t.toolsIntervalsTooltip);
  intervalButton.setAttribute('aria-pressed', 'false');
  intervalButton.addEventListener('click', () => {
    if (intervalDocuments.has(score)) intervalDocuments.delete(score);
    else if (hasIntervals(score, M, shownVoices.size ? shownVoices : null)) intervalDocuments.add(score);
    else return say(t.intervalsNeedVoices);
    render();
  });
  ['pointerdown', 'mousedown', 'click'].forEach((type) => intervalButton.addEventListener(type, (event) => event.stopPropagation()));

  // Pro: possible chord name above each column of three or more voices (the first one fits best; the others go in the tooltip).
  const proChordNames = Boolean(settings) && isPro();
  const chordNameDocuments = new WeakSet();
  const chordNamesButton = document.createElement('button');
  chordNamesButton.id = 'scoreChordNames';
  chordNamesButton.className = 'score-palette-item score-interval-toggle score-chord-names-toggle tooltip';
  chordNamesButton.type = 'button';
  chordNamesButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><text x="2" y="18" font-family="system-ui, sans-serif" font-size="14" font-weight="700">G</text><text x="13.5" y="11.5" font-family="system-ui, sans-serif" font-size="9.5" font-weight="700">7</text></svg>';
  chordNamesButton.dataset.tooltip = t.toolsChordNamesTooltip;
  chordNamesButton.setAttribute('aria-label', t.toolsChordNamesTooltip);
  chordNamesButton.setAttribute('aria-pressed', 'false');
  chordNamesButton.addEventListener('click', () => {
    if (chordNameDocuments.has(score)) chordNameDocuments.delete(score);
    else if (chordMarks(score, M, shownVoices.size ? shownVoices : null).length) chordNameDocuments.add(score);
    else return say(t.chordNamesNeedVoices);
    render();
  });
  ['pointerdown', 'mousedown', 'click'].forEach((type) => chordNamesButton.addEventListener(type, (event) => event.stopPropagation()));

  // Pro (categoria Voces): unir pentagramas y separar voces son dos herramientas de la barra izquierda, cada una con su popup
  // anclado al boton y los mismos circulos 1-4 de la leyenda.
  let duplicateVoiceButtons = []; // Pro: la crea el bloque de Ajustes; vive en la barra izquierda
  function restructureTool(id, icon, tooltip, fill) {
    const button = document.createElement('button');
    button.id = 'score' + id;
    button.className = 'score-palette-item score-interval-toggle score-restructure-toggle tooltip';
    button.type = 'button';
    button.innerHTML = lucide(icon);
    button.dataset.tooltip = tooltip;
    button.setAttribute('aria-label', tooltip);
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    ['pointerdown', 'mousedown', 'click'].forEach((type) => button.addEventListener(type, (event) => event.stopPropagation()));
    const popup = document.createElement('div');
    popup.id = 'score' + id + 'Popup';
    popup.className = 'score-meter-popup score-restructure-popup';
    popup.setAttribute('popover', 'auto');
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', tooltip);
    document.querySelector('.score-page').appendChild(popup);
    popup.addEventListener('toggle', (event) => button.setAttribute('aria-expanded', String(event.newState === 'open')));
    const place = () => {
      if (!button.isConnected || !popup.matches(':popover-open')) return;
      const anchor = button.getBoundingClientRect();
      const box = popup.getBoundingClientRect();
      popup.style.left = Math.max(8, Math.min(anchor.right + 8, window.innerWidth - box.width - 8)) + 'px';
      popup.style.top = Math.max(8, Math.min(anchor.top, window.innerHeight - box.height - 8)) + 'px';
    };
    button.addEventListener('click', () => {
      if (popup.matches(':popover-open')) { popup.hidePopover(); return; }
      popup.replaceChildren();
      fill(popup);
      popup.showPopover();
      place();
    });
    window.addEventListener('scroll', place, { passive: true, capture: true });
    window.addEventListener('resize', place);
    return { button, popup };
  }

  // Fila de un popup de unir/separar: casilla al inicio y el nombre a su lado.
  function checkRow(text, checked, onChange) {
    const row = document.createElement('label');
    row.className = 'score-restructure-row';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = checked;
    box.addEventListener('change', () => onChange(box.checked, box));
    const label = document.createElement('span');
    label.textContent = text;
    row.append(box, label);
    return { row, box };
  }
  const restructureHeading = (text) => {
    const heading = document.createElement('p');
    heading.textContent = text;
    return heading;
  };
  const restructureNote = (text, className = 'score-restructure-none') => {
    const note = document.createElement('p');
    note.className = className;
    note.textContent = text;
    return note;
  };
  const restructureList = (label) => {
    const list = document.createElement('div');
    list.className = 'score-restructure-list';
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', label);
    return list;
  };
  const restructureGo = (text) => {
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'score-restructure-go';
    go.textContent = text;
    go.disabled = true;
    return go;
  };
  const restructureFailed = () => say(t.restructureFailed);

  // Unir: elegir 2 o mas pentagramas. Con uno solo no hay nada que unir.
  function fillJoinPopup(popup) {
    const staves = M.stavesOf(score);
    popup.appendChild(restructureHeading(t.restructureJoin));
    if (!M.canJoinStaves(score)) {
      popup.appendChild(restructureNote(t.restructureNoJoin));
      return;
    }
    const list = restructureList(t.restructureJoin);
    const selected = new Set(Array.from({ length: staves }, (_, staff) => staff));
    const join = restructureGo(t.restructureJoinAction);
    join.disabled = selected.size < 2;
    for (let staff = 0; staff < staves; staff += 1) {
      const { row } = checkRow(t.restructureStaff.replace('{n}', staff + 1), true, (on) => {
        if (on) selected.add(staff); else selected.delete(staff);
        join.disabled = selected.size < 2;
      });
      row.dataset.staff = String(staff);
      list.appendChild(row);
    }
    join.addEventListener('click', () => {
      const chosen = [...selected];
      popup.hidePopover();
      if (!change(() => M.joinStaves(score, chosen))) restructureFailed();
    });
    popup.append(list, join);
  }

  // Separar: elegir, de un pentagrama con varias voces, las que pasan a uno nuevo debajo; al menos una queda.
  function fillSplitPopup(popup) {
    const staves = M.stavesOf(score);
    popup.appendChild(restructureHeading(t.restructureSplit));
    const splittable = Array.from({ length: staves }, (_, staff) => staff).filter((staff) => M.legendsOf(score, staff).length > 1);
    if (!splittable.length) {
      popup.appendChild(restructureNote(t.restructureNoSplit));
      return;
    }
    popup.appendChild(restructureNote(t.restructureSplitHint, 'score-restructure-hint'));
    const list = restructureList(t.restructureSplit);
    const split = restructureGo(t.restructureSplitAction);
    let from = -1;
    const selected = new Set();
    const boxes = [];
    splittable.forEach((staff) => {
      const legends = M.legendsOf(score, staff);
      // Con un solo pentagrama que separar no hace falta nombrarlo.
      if (staves > 1) {
        const name = document.createElement('p');
        name.className = 'score-restructure-staff-name';
        name.textContent = t.restructureStaff.replace('{n}', staff + 1);
        list.appendChild(name);
      }
      legends.forEach((n) => {
        const { row, box } = checkRow(t.restructureVoice.replace('{n}', n), false, (on) => {
          // Una sola voz de origen a la vez: elegir en otro pentagrama reemplaza lo elegido.
          if (from !== staff) {
            selected.clear();
            boxes.forEach((other) => { if (other !== box) other.checked = false; });
            from = staff;
          }
          if (on) selected.add(n); else selected.delete(n);
          split.disabled = !selected.size || selected.size >= legends.length;
        });
        row.dataset.voice = String(n);
        boxes.push(box);
        list.appendChild(row);
      });
    });
    split.addEventListener('click', () => {
      const staff = from, chosen = [...selected];
      popup.hidePopover();
      if (!change(() => M.splitStaff(score, staff, chosen))) restructureFailed();
    });
    popup.append(list, split);
  }
  const { button: joinButton, popup: joinPopup } = restructureTool('Join', 'merge', t.restructureJoin, fillJoinPopup);
  const { button: splitButton, popup: splitPopup } = restructureTool('Split', 'split', t.restructureSplit, fillSplitPopup);

  // Que herramientas muestra la barra lateral: TAB y cejilla son de guitarra; repeticion y dinamica se eligen en los ajustes.
  function applyTools() {
    const guitar = !settings || M.instrumentOf(score) === 'guitar';
    const shown = { repeats: !settings || toolOn('repeats'), dynamics: !settings || toolOn('dynamics'), barre: guitar, lyrics: toolOn('lyrics') };
    barlines.querySelectorAll('[data-group]').forEach((button) => { if (button.dataset.group) button.hidden = !shown[button.dataset.group]; });
    intensities.hidden = !shown.dynamics;
    tabToggle.hidden = !guitar;
    alignBarlinesToFirstStaff();
    playButton.hidden = !settings || !toolOn('playback', false);
    if (playButton.hidden) clearPlaybackHint();
    if (settings) stage.appendChild(playButton);
    intervalButton.remove();
    if (settings && toolOn('voices', false) && toolOn('intervals', false)) stage.appendChild(intervalButton);
    intervalButton.setAttribute('aria-pressed', String(intervalDocuments.has(score)));
    chordNamesButton.remove();
    if (proChordNames && toolOn('voices', false) && toolOn('intervals', false)) stage.appendChild(chordNamesButton);
    chordNamesButton.setAttribute('aria-pressed', String(chordNameDocuments.has(score)));
    [[splitButton, splitPopup], [joinButton, joinPopup]].forEach(([button, popup]) => {
      button.remove();
      if (settings && toolOn('voices', false) && M.restructurable(score)) stage.appendChild(button);
      else if (popup.matches(':popover-open')) popup.hidePopover();
    });
    if (duplicateVoiceButtons.length) {
      duplicateVoiceButtons.forEach((button) => {
        button.remove();
        if (toolOn('voices', false)) stage.appendChild(button);
      });
      if (!toolOn('voices', false)) document.getElementById('scoreVoicePicker')?.hidePopover();
    }
    alignVoiceLegend();
    if (playButton.hidden && playbackState !== 'idle') resetPlayback();
    if (activeItem && barlines.querySelector('.score-palette-tool[aria-pressed="true"][hidden]')) deactivateTool();
  }

  // Con "Voces" activado cada figura se tine segun su voz y una barra vertical, a la izquierda del pentagrama, da el color de cada numero.
  const VOICE_COUNT = 4;
  const voiceLegend = document.createElement('ol');
  voiceLegend.className = 'score-voice-legend';
  voiceLegend.setAttribute('aria-label', t.toolsVoices);
  // Voces elegidas en la leyenda: solo esas se colorean; con ninguna, la partitura se ve sin color. Nunca se oculta una figura.
  const shownVoices = new Set();
  const voiceButtons = [];
  for (let n = 1; n <= VOICE_COUNT; n++) {
    const item = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.voice = String(n);
    button.textContent = String(n);
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      if (shownVoices.has(n)) shownVoices.delete(n); else shownVoices.add(n);
      if (playbackTrack && playbackState !== 'loading') refreshPlaybackTrack();
      if (toolOn('intervals', false) && (intervalDocuments.has(score) || chordNameDocuments.has(score))) render();
      else applyVoices();
      updateSelectionMenu();
    });
    ['pointerdown', 'mousedown', 'click'].forEach((type) => button.addEventListener(type, (event) => event.stopPropagation()));
    voiceButtons.push(button);
    item.appendChild(button);
    voiceLegend.appendChild(item);
  }
  function applyVoices() {
    const on = toolOn('voices', false);
    stage.classList.toggle('has-voices', !!on);
    voiceLegend.remove();
    if (!on) return;
    voiceButtons.forEach((button, i) => button.setAttribute('aria-pressed', String(shownVoices.has(i + 1))));
    const upper = M.measures(score);
    const total = upper.length;
    for (let staff = 0; staff < M.stavesOf(score); staff++) {
      for (let mi = 0; mi < total; mi++) {
        const measure = staff ? M.measures(score, staff)[mi] : upper[mi];
        if (!measure) continue;
        M.voices(measure).forEach((voice, k) => voice.groups.forEach((g) => g.indices.forEach((i) => {
          const node = stage.querySelector('[id="' + M.ID_PREFIX[staff] + mi + '-' + i + '"]');
          if (!node) return;
          const n = M.legendOf(score, staff, k);
          node.dataset.voice = String(n);
          node.classList.toggle('is-voice-on', shownVoices.has(n));
        })));
      }
    }
    // Una ligadura es de la voz de su primera nota.
    stage.querySelectorAll('g.tie, g.slur').forEach((link) => {
      let startid = '';
      try { startid = String(toolkit.getElementAttr(link.id).startid || '').replace(/^#/, ''); } catch { /* sin ligadura que mapear */ }
      const start = startid ? stage.querySelector('[id="' + startid + '"]') : null;
      link.classList.toggle('is-voice-on', !!start && start.classList.contains('is-voice-on'));
      if (start?.dataset.voice) link.dataset.voice = start.dataset.voice;
    });
    // Las barras viven fuera de las notas: toman la voz de la primera nota que agrupan.
    stage.querySelectorAll('g.beam').forEach((beam) => {
      const first = beam.querySelector('g.note[data-voice]');
      beam.classList.toggle('is-voice-on', !!first && first.classList.contains('is-voice-on'));
      if (first) beam.dataset.voice = first.dataset.voice;
    });
    stage.appendChild(voiceLegend);
    alignVoiceLegend();
  }

  // ---- biblioteca de patrones (el sitio la ofrece con `patterns`; se activa en los ajustes) ----

  // Un patron es ritmo y grados de la escala (ver `M.patternFrom`), no notas: sirve en cualquier tonalidad. La biblioteca
  // es del usuario y no de una partitura, asi que vive con las opciones y no viaja en el documento.
  const LIBRARY_LIMIT = 60;
  // URL tools only override the initial state; the library remains available in settings.
  let libraryEnabled = !urlDefaults.tools && getSetting('patterns', false) === true;
  const patternsOn = () => patternsAvailable() && libraryEnabled;
  // Una columna mas a la izquierda solo cabe sin quitarle ancho a la partitura en pantallas anchas; en tablet no se ofrece.
  const patternsAvailable = () => patterns && settings && LIBRARY_PAGE.matches;
  let library = [];
  const libraryPanel = document.createElement('aside');
  libraryPanel.className = 'score-library';
  libraryPanel.hidden = true;
  libraryPanel.setAttribute('aria-label', t.patternsTitle);
  const libraryTitle = document.createElement('h2');
  libraryTitle.className = 'score-library-title';
  libraryTitle.textContent = t.patternsTitle;
  const libraryEmpty = document.createElement('p');
  libraryEmpty.className = 'score-library-empty';
  libraryEmpty.textContent = t.patternsEmpty;
  const libraryList = document.createElement('ul');
  libraryList.className = 'score-library-list';
  libraryPanel.append(libraryTitle, libraryEmpty, libraryList);
  if (patterns && settings) {
    const saved = getSetting('patternItems', []);
    library = (Array.isArray(saved) ? saved : []).map(M.cleanPattern).filter(Boolean).slice(0, LIBRARY_LIMIT);
    document.querySelector('.score-workspace').prepend(libraryPanel);
  }

  // El patron tal como queda al escribirlo (en la linea del medio de un compas vacio), dibujado por el mismo grabador de la
  // partitura: plicas, barras y silencios coinciden. Sin pentagrama, clave ni compas; `fit` recorta al contenido una vez en el DOM.
  // `space` es el alto de un espacio del pentagrama en pixeles; con `flat` todas las notas van a la misma altura.
  function patternStaff(pattern, { flat = false, space: size = 0.5 * 16 } = {}) {
    const wrap = document.createElement('span');
    wrap.className = 'score-pattern-staff';
    const sample = { meter: score.meter, clef: 'treble', fifths: 0, instrument: 'guitar', rows: [[[]]] };
    if (!toolkit) return wrap; // Verovio aun no cargo: se vuelve a dibujar al terminar
    if (!M.applyPattern(sample, pattern, { mi: 0, at: pattern.first, n: M.bottomLine(sample, 0, 0) + 4, flat })) return wrap;
    // applyPattern agrega renglones completos; la miniatura solo necesita los compases del patron, en una linea.
    const span = Math.max(...pattern.events.map((ev) => ev.mi)) + 1;
    sample.rows = [M.measures(sample).slice(0, span)];
    if (!previewToolkit) previewToolkit = newToolkit();
    previewToolkit.setOptions(layoutOptions(900, { breaks: 'none', minLastJustification: 1, pageMarginLeft: 10, pageMarginRight: 10, pageMarginTop: 10, pageMarginBottom: 10 }));
    previewToolkit.loadData(M.toMusicXml(sample));
    const svg = document.importNode(new DOMParser().parseFromString(previewToolkit.renderToSVG(1), 'image/svg+xml').documentElement, true);
    svg.setAttribute('aria-hidden', 'true');
    wrap.appendChild(svg);
    wrap.fit = () => {
      const box = svg.viewBox.baseVal;
      svg.style.maxWidth = 'none';
      svg.style.width = `${box.width}px`;
      svg.style.height = `${box.height}px`;
      const lines = [...svg.querySelectorAll('g.staff > path')].slice(0, 2).map((line) => line.getBoundingClientRect());
      if (lines.length < 2) return;
      const space = (lines[1].top - lines[0].top) * box.width / svg.getBoundingClientRect().width;
      svg.querySelectorAll('g.staff > path, g.clef, g.keySig, g.meterSig, g.mNum').forEach((el) => el.setAttribute('display', 'none'));
      // Solo las divisiones internas: no hace falta encerrar el patron entre barras exteriores.
      const measures = [...svg.querySelectorAll('g.measure')];
      measures.at(-1)?.querySelectorAll('g.barLine').forEach((el) => el.setAttribute('display', 'none'));
      // El viewBox no se toca (los svg anidados de Verovio escalan con el): se ajusta el tamano del svg a `size` pixeles
      // por espacio del pentagrama y el recorte al contenido lo hace el contenedor, con margenes negativos.
      svg.style.width = `${box.width * size / space}px`;
      svg.style.height = `${box.height * size / space}px`;
      const frame = svg.getBoundingClientRect();
      const rects = [...svg.querySelectorAll('g.layer, g.tie, g.slur, g.barLine:not([display="none"])')].map((el) => el.getBoundingClientRect());
      if (!rects.length) return;
      const pad = size * 0.5;
      const left = Math.min(...rects.map((r) => r.left)) - pad, right = Math.max(...rects.map((r) => r.right)) + pad;
      const top = Math.min(...rects.map((r) => r.top)) - pad, bottom = Math.max(...rects.map((r) => r.bottom)) + pad;
      wrap.style.alignItems = 'flex-start';
      wrap.style.width = `${right - left}px`;
      wrap.style.height = `${bottom - top}px`;
      svg.style.margin = `${frame.top - top}px 0 0 ${frame.left - left}px`;
    };
    return wrap;
  }

  function renderLibrary() {
    libraryList.replaceChildren();
    libraryEmpty.hidden = library.length > 0;
    library.forEach((pattern, index) => {
      const item = document.createElement('li');
      item.className = 'score-pattern';
      const section = (flat, label) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = flat ? 'score-pattern-rhythm' : 'score-pattern-notes';
        button.setAttribute('aria-label', label);
        if (flat) { button.classList.add('tooltip'); button.dataset.tooltip = label; } else button.title = label;
        // Sin foco por el pointerdown: se arrastra o se hace click, como los botones de la paleta.
        button.addEventListener('pointerdown', (event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          beginDrag(event, { pattern, flat, kind: 'pattern' });
        });
        button.addEventListener('click', (event) => { if (event.detail === 0) applyToChosenMeasure(pattern, flat); });
        return button;
      };
      const notes = section(false, t.patternRelative);
      notes.appendChild(patternStaff(pattern, { space: 0.5 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16) }));
      const scroll = document.createElement('div');
      scroll.className = 'score-pattern-scroll';
      scroll.appendChild(notes);
      const rhythm = section(true, t.patternRhythm);
      rhythm.innerHTML = lucide('square-chevrons-down');
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'score-pattern-remove';
      remove.innerHTML = lucide('x');
      remove.setAttribute('aria-label', t.patternRemove);
      remove.addEventListener('click', () => {
        // Se desvanece antes de salir de la lista; el patron se borra al empezar para que un segundo click no quite otro.
        library.splice(index, 1);
        saveLibrary();
        remove.disabled = true;
        item.classList.add('is-removing');
        const done = () => { item.remove(); libraryEmpty.hidden = library.length > 0; renderLibrary(); };
        item.addEventListener('transitionend', done, { once: true });
        setTimeout(done, 400);
      });
      item.append(remove, scroll, rhythm);
      libraryList.appendChild(item);
      if (notes.firstChild?.fit) notes.firstChild.fit();
    });
  }

  function saveLibrary() {
    setSetting('patternItems', library);
  }

  function applyLibrary() {
    const on = patternsOn();
    libraryPanel.hidden = !on;
    toolbars.classList.toggle('has-library', on);
    if (on) { renderLibrary(); alignBarlinesToFirstStaff(); }
  }

  // Shift+S: las figuras elegidas o, sin ninguna, el compas elegido.
  function savePattern() {
    const refs = picks().filter((ref) => eventAt(ref));
    const pattern = refs.length ? M.patternFrom(score, refs) : selectedMeasure !== null ? M.patternFromMeasure(score, selectedMeasure, selectedMeasureStaff) : null;
    if (!pattern) return say(refs.length ? t.patternOneStaff : t.patternNothing);
    const key = JSON.stringify(pattern);
    if (library.some((other) => JSON.stringify(other) === key)) return;
    library.unshift(pattern);
    library.length = Math.min(library.length, LIBRARY_LIMIT);
    saveLibrary();
    renderLibrary();
  }

  // Escribe el patron donde cae `target`: su primera nota con altura queda en la altura del puntero.
  function applyPattern(pattern, flat, { mi, staff, at, n }) {
    const trial = M.clone(score);
    M.restoreTabReferences(trial, M.captureTabReferences(score, score.showTabs ? tabColumns : score.tabs));
    const created = M.applyPattern(trial, pattern, { mi, staff, at, n, flat });
    if (!created) return say(t.full);
    change(() => {
      Object.assign(score, trial);
      selected = created[created.length - 1];
      group = created.length > 1 ? created : [];
    }, M.captureTabReferences(trial));
  }

  // Un click sobre el patron lo escribe en el compas elegido, desde su inicio y en la linea del medio del pentagrama.
  function applyToChosenMeasure(pattern, flat) {
    if (selectedMeasure === null) return say(t.patternPickMeasure);
    const mi = selectedMeasure, staff = selectedMeasureStaff;
    applyPattern(pattern, flat, { mi, staff, at: pattern.first, n: M.bottomLine(score, mi, staff) + 4 });
  }

  // El fantasma del patron es el mismo dibujo de la biblioteca (barras y plicas incluidas), al tamano de la partitura y con la
  // cabeza de la primera nota bajo el puntero.
  function patternGhost(pattern, flat, event) {
    const lines = stage.querySelectorAll('g.staff > path');
    const space = lines.length > 1 ? lines[1].getBoundingClientRect().top - lines[0].getBoundingClientRect().top : 10;
    const ghost = document.createElement('div');
    ghost.className = 'score-ghost';
    const drawing = patternStaff(pattern, { flat, space });
    ghost.appendChild(drawing);
    document.body.appendChild(ghost);
    if (drawing.fit) {
      drawing.fit();
      const head = drawing.querySelector('.notehead');
      const frame = drawing.getBoundingClientRect();
      const box = (head || drawing).getBoundingClientRect();
      drawing.style.transform = `translate(${-(box.left + box.width / 2 - frame.left)}px,${-(box.top + box.height / 2 - frame.top)}px)`;
    }
    moveGhost(ghost, event);
    return ghost;
  }

  // ---- ajustes: instrumento, tempo y grupos de herramientas (el sitio los activa con `settings`) ----

  if (settings) {
    const popup = document.createElement('div');
    popup.id = 'scoreSettingsPopup';
    popup.className = 'score-settings-popup';
    popup.setAttribute('popover', 'auto');
    popup.setAttribute('role', 'dialog');
    popup.setAttribute('aria-label', t.settings);

    const content = document.createElement('div');
    content.className = 'score-settings-content';
    popup.appendChild(content);

    const cog = document.createElement('button');
    cog.type = 'button';
    cog.id = 'scoreSettingsToggle';
    cog.className = 'score-palette-item score-settings-toggle tooltip';
    cog.innerHTML = lucide('settings');
    cog.setAttribute('aria-label', t.settings);
    cog.setAttribute('aria-haspopup', 'dialog');
    cog.setAttribute('aria-controls', popup.id);
    cog.setAttribute('aria-expanded', 'false');
    cog.dataset.tooltip = t.settings;
    barlines.prepend(cog);
    // The clear button sits right under the gear, as one more sidebar tool.
    const clear = document.getElementById('scoreClear');
    clear.classList.replace('score-download', 'score-palette-item');
    cog.after(clear);
    const duplicate = document.getElementById('scoreDuplicate');
    duplicate.classList.replace('score-download', 'score-palette-item');
    clear.after(duplicate);

    const title = document.createElement('h2');
    title.className = 'score-settings-heading-main';
    title.innerHTML = `${lucide('settings')}<span></span>`;
    title.lastChild.textContent = t.settings;
    const header = document.createElement('div');
    header.className = 'score-settings-header';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'score-settings-close';
    close.setAttribute('aria-label', t.settingsClose);
    close.textContent = '×';
    close.addEventListener('click', () => { popup.hidePopover(); cog.focus({ preventScroll: true }); });
    header.append(title, close);
    popup.prepend(header);

    // Cada ajuste es una seccion: su nombre y, debajo, sus opciones en horizontal.
    function section(label, tag = 'p') {
      const wrap = document.createElement('div');
      wrap.className = 'score-settings-section';
      const name = document.createElement(tag);
      name.textContent = label;
      name.className = 'score-settings-title';
      const row = document.createElement('div');
      row.className = 'score-settings-row';
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', label);
      wrap.append(name, row);
      content.appendChild(wrap);
      return row;
    }

    const instrumentRow = section(t.settingsInstrument);
    const instrumentIds = M.INSTRUMENTS.filter((id) => id !== 'voices' || M.choir);
    const instruments = instrumentIds.map((id) => {
      const field = document.createElement('label');
      field.className = 'score-settings-radio is-icon';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'scoreInstrument';
      radio.value = id;
      field.append(radio);
      field.insertAdjacentHTML('beforeend', lucide(id) + '<span></span>');
      field.lastChild.textContent = t['instrument' + id[0].toUpperCase() + id.slice(1)];
      radio.addEventListener('change', () => {
        if (score.instrument === id) return;
        change(() => M.setInstrument(score, id));
        sync();
      });
      instrumentRow.appendChild(field);
      return radio;
    });

    // Voces: de 2 a 4 pentagramas. Reducir solo oculta los de mas (se conservan); subir los vuelve a mostrar.
    const voicesCard = document.createElement('div');
    voicesCard.className = 'score-settings-card';
    voicesCard.hidden = true;
    // El mismo control sirve al coro (2 a 4) y a la guitarra Pro (1 a 4 pentagramas con una sola tablatura).
    function partsControl(min, apply) {
      const row = section(t.settingsParts);
      row.parentElement.classList.add('is-inline');
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.className = 'score-settings-slider';
      slider.min = String(min);
      slider.max = String(M.MAX_PARTS);
      slider.step = '1';
      slider.setAttribute('aria-label', t.settingsParts);
      const value = document.createElement('output');
      value.className = 'score-settings-tempo-value';
      const show = () => { value.textContent = t.partsValue.replace('{n}', slider.value); };
      slider.addEventListener('input', show);
      slider.addEventListener('change', () => { change(() => apply(score, Number(slider.value))); sync(); });
      const line = document.createElement('div');
      line.className = 'score-settings-slider-line';
      line.append(slider, value);
      row.classList.add('is-stacked');
      row.append(line);
      return { row, slider, show };
    }
    const { row: partsRow, slider: partsSlider, show: showParts } = partsControl(M.MIN_PARTS, M.setParts);

    // Voces: timbre del coro y colección de SoundFonts. Solo cambia el audio y el programa del MIDI.
    const soundRow = section(t.settingsSound);
    soundRow.classList.add('score-settings-sounds');
    voicesCard.append(partsRow.parentElement, soundRow.parentElement);
    content.appendChild(voicesCard);
    // Guitarra (solo Pro): cada voz es un pentagrama y todas comparten la misma tablatura.
    const guitarCard = document.createElement('div');
    guitarCard.className = 'score-settings-card';
    guitarCard.hidden = true;
    const { row: guitarPartsRow, slider: guitarPartsSlider, show: showGuitarParts } = partsControl(1, M.setGuitarParts);
    guitarCard.append(guitarPartsRow.parentElement);
    content.appendChild(guitarCard);
    const sounds = M.CHOIR_SOUNDS.map((id) => {
      const field = document.createElement('label');
      field.className = 'score-settings-radio';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'scoreSound';
      radio.value = id;
      const label = ARCHIVE_CHOIRS.find((sound) => sound.id === id)?.name
        || t[(['guitar', 'piano'].includes(id) ? 'instrument' : 'sound') + id[0].toUpperCase() + id.slice(1)];
      field.append(radio, document.createTextNode(label));
      radio.addEventListener('change', () => {
        if (M.soundOf(score) === id) return;
        const before = M.clone(score);
        M.pruneLower(before);
        M.setSound(score, id);
        recordChange(before);
        sync();
      });
      soundRow.appendChild(field);
      return radio;
    });

    // El tempo se arrastra en un control deslizante; la casilla de abajo ("sin indicacion") lo quita.
    const tempoRow = section(t.settingsTempo);
    tempoRow.parentElement.classList.add('score-settings-tempo');
    const tempoSlider = document.createElement('input');
    tempoSlider.type = 'range';
    tempoSlider.className = 'score-settings-slider';
    tempoSlider.min = String(M.MIN_TEMPO);
    tempoSlider.max = String(M.MAX_TEMPO);
    tempoSlider.step = '1';
    tempoSlider.setAttribute('aria-label', t.settingsTempo + ' (' + t.tempoUnit + ')');
    const tempoValue = document.createElement('output');
    tempoValue.className = 'score-settings-tempo-value';
    const tempoField = document.createElement('label');
    tempoField.className = 'score-settings-check';
    const tempoNone = document.createElement('input');
    tempoNone.type = 'checkbox';
    tempoField.append(tempoNone, document.createTextNode(t.tempoNone));
    const showTempo = () => { tempoValue.textContent = '\u2669 = ' + tempoSlider.value; };
    tempoSlider.addEventListener('input', () => { showTempo(); tempoNone.checked = false; });
    tempoSlider.addEventListener('change', () => { change(() => M.setTempo(score, Number(tempoSlider.value))); sync(); });
    tempoNone.addEventListener('change', () => {
      change(() => M.setTempo(score, tempoNone.checked ? null : Number(tempoSlider.value)));
      sync();
    });
    const sliderLine = document.createElement('div');
    sliderLine.className = 'score-settings-slider-line';
    sliderLine.append(tempoSlider, tempoValue);
    tempoRow.classList.add('is-stacked');
    tempoRow.append(sliderLine, tempoField);

    // Cada categoria de herramientas se activa con una casilla y muestra debajo sus iconos.
    const categories = [
      ['repeats', t.toolsRepeats, (item) => item.kind === 'bar' || item.kind === 'navigation'],
      ['dynamics', t.toolsDynamics, (item) => item.kind === 'hairpin' || item.kind === 'dynamic'],
      ['voices', t.toolsVoices, () => false, false],
      ['playback', t.toolsPlayback, () => false, false],
      ['intervals', t.toolsIntervals, () => false, false],
      ...(lyrics ? [['lyrics', t.toolsLyrics, (item) => item.kind === 'lyric']] : []),
    ];
    const toolsHeading = document.createElement('p');
    toolsHeading.className = 'score-settings-heading score-settings-title';
    toolsHeading.textContent = t.settingsTools;
    content.appendChild(toolsHeading);
    const toolsGrid = document.createElement('div');
    toolsGrid.className = 'score-settings-tools';
    content.appendChild(toolsGrid);
    let intervalModes = [];
    let refreshTonic = () => {};
    const checks = categories.map(([name, label, belongs, fallback = true]) => {
      const wrap = document.createElement('div');
      wrap.className = 'score-settings-section score-settings-category';
      wrap.dataset.category = name;
      const field = document.createElement('label');
      const check = document.createElement('input');
      check.type = 'checkbox';
      field.className = 'score-settings-check';
      field.append(check, document.createTextNode(label));
      const icons = document.createElement('div');
      icons.className = 'score-settings-icons';
      BARS.filter(belongs).forEach((item) => {
        const icon = document.createElement('span');
        icon.className = 'score-settings-icon';
        icon.setAttribute('role', 'img');
        icon.setAttribute('aria-label', item.label);
        icon.title = item.label;
        icon.appendChild(glyphFor(item));
        icons.appendChild(icon);
      });
      if (name === 'voices') {
        voiceButtons.forEach((button) => {
          const swatch = document.createElement('span');
          swatch.className = 'score-settings-icon score-voice-swatch';
          swatch.dataset.voice = button.dataset.voice;
          swatch.textContent = button.textContent;
          icons.appendChild(swatch);
        });
        // Pro: unir y separar voces son herramientas de esta categoria, sin casilla propia.
        if (M.choir) {
          [['merge', t.restructureJoin], ['split', t.restructureSplit]].forEach(([name, label]) => {
            const icon = document.createElement('span');
            icon.className = 'score-settings-icon';
            icon.setAttribute('role', 'img');
            icon.setAttribute('aria-label', label);
            icon.title = label;
            icon.innerHTML = lucide(name);
            icons.appendChild(icon);
          });
        }
      }
      if (name === 'voices' && proChordNames) {
        // Dos botones, una tercera o una sexta abajo (pasos diatonicos 2 y 5), con un solo popup para elegir voces.
        const duplicateKinds = [
          { id: 'scoreDuplicateVoice', icon: 'third-below', steps: 2, label: t.voiceDuplicate, tip: t.voiceDuplicateTooltip },
          { id: 'scoreDuplicateVoiceSixth', icon: 'sixth-below', steps: 5, label: t.voiceDuplicateSixth, tip: t.voiceDuplicateSixthTooltip },
        ];
        let duplicateSteps = 2, duplicateAnchor = null;
        // Con varias voces se elige cuales duplicar en un popup anclado al boton (dentro de Ajustes, para no cerrarlos).
        const picker = document.createElement('div');
        picker.id = 'scoreVoicePicker';
        picker.className = 'score-meter-popup score-voice-picker';
        picker.setAttribute('popover', 'auto');
        picker.setAttribute('role', 'dialog');
        picker.setAttribute('aria-label', t.voiceDuplicatePick);
        const pickerHeading = document.createElement('p');
        pickerHeading.textContent = t.voiceDuplicatePick;
        const pickerList = document.createElement('div');
        pickerList.className = 'score-voice-picker-list';
        const pickerConfirm = document.createElement('button');
        pickerConfirm.type = 'button';
        pickerConfirm.className = 'score-voice-picker-confirm';
        pickerConfirm.textContent = t.voiceDuplicateConfirm;
        picker.append(pickerHeading, pickerList, pickerConfirm);
        document.querySelector('.score-page').appendChild(picker);
        const duplicateVoices = (voices) => {
          const trial = M.clone(score);
          if (!M.duplicateVoice(trial, voices, duplicateSteps)) { say(t.voiceDuplicateUnavailable); return; }
          change(() => { Object.assign(score, trial); return true; });
          say('');
          picker.hidePopover();
        };
        const placePicker = () => {
          const anchor = duplicateAnchor.getBoundingClientRect(), box = picker.getBoundingClientRect();
          picker.style.left = Math.max(8, Math.min(anchor.left, window.innerWidth - box.width - 8)) + 'px';
          picker.style.top = Math.max(8, Math.min(anchor.bottom + 6, window.innerHeight - box.height - 8)) + 'px';
        };
        const picked = () => [...pickerList.querySelectorAll('[aria-pressed="true"]')].map((b) => Number(b.dataset.voice));
        pickerConfirm.addEventListener('click', () => duplicateVoices(picked()));
        const buildDuplicate = ({ id, icon, steps, label, tip }) => {
        const duplicate = document.createElement('button');
        duplicate.type = 'button';
        duplicate.className = 'score-palette-item score-interval-toggle score-duplicate-voice-toggle tooltip';
        duplicate.id = id;
        duplicate.innerHTML = lucide(icon);
        duplicate.setAttribute('aria-label', label);
        duplicate.dataset.tooltip = label;
        duplicate.title = tip;
        duplicate.setAttribute('aria-haspopup', 'dialog');
        duplicate.setAttribute('aria-controls', picker.id);
        duplicate.addEventListener('click', () => {
          if (picker.matches(':popover-open') && duplicateAnchor === duplicate) { picker.hidePopover(); return; }
          duplicateSteps = steps;
          duplicateAnchor = duplicate;
          const numbers = M.voiceNumbers(score);
          if (numbers.length < 2) { duplicateVoices(null); return; }
          pickerList.replaceChildren(...numbers.map((n) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.dataset.voice = String(n);
            button.setAttribute('aria-pressed', 'false');
            button.setAttribute('aria-label', t.voiceStaff.replace('{n}', n));
            button.textContent = String(n);
            button.addEventListener('click', () => {
              button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
              pickerConfirm.disabled = !picked().length;
            });
            return button;
          }));
          pickerConfirm.disabled = true;
          picker.showPopover();
          placePicker();
          pickerList.firstElementChild.focus({ preventScroll: true });
        });
        // Herramienta de la barra izquierda, bajo los botones de voces; en Ajustes solo queda su icono, informativo.
        ['pointerdown', 'mousedown', 'click'].forEach((type) => duplicate.addEventListener(type, (event) => event.stopPropagation()));
        const info = document.createElement('span');
        info.className = 'score-settings-icon';
        info.setAttribute('role', 'img');
        info.setAttribute('aria-label', label);
        info.title = label;
        info.innerHTML = lucide(icon);
        icons.appendChild(info);
        return duplicate;
        };
        duplicateVoiceButtons = duplicateKinds.map(buildDuplicate);
      }
      if (name === 'playback') {
        for (const name of ['play', 'pause']) {
          const icon = document.createElement('span');
          icon.className = 'score-settings-icon';
          icon.setAttribute('role', 'img');
          icon.setAttribute('aria-label', t[name]);
          icon.innerHTML = lucide(name);
          icons.appendChild(icon);
        }
      }
      if (name === 'intervals') {
        const icon = document.createElement('span');
        icon.className = 'score-settings-icon score-settings-intervals';
        icon.setAttribute('aria-hidden', 'true');
        icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-letter-v preview-icon"><path d="m6 4 5.765 15.835a.25.25 0 00.47 0L18 4"/></svg>';
        icons.appendChild(icon);
      }
      wrap.append(field, icons);
      // Intervalos: respecto de las voces vecinas (por defecto) o del bajo; viaja con la partitura y se deshace.
      if (name === 'intervals') {
        const modes = document.createElement('div');
        modes.className = 'score-settings-interval-modes';
        modes.setAttribute('role', 'radiogroup');
        modes.setAttribute('aria-label', t.toolsIntervals);
        intervalModes = ['bass', 'voices', 'tonic'].map((id) => {
          const mode = document.createElement('label');
          mode.className = 'score-settings-radio';
          const radio = document.createElement('input');
          radio.type = 'radio';
          radio.name = 'scoreIntervalMode';
          radio.value = id;
          mode.append(radio, document.createTextNode(t[{ bass: 'intervalsBass', voices: 'intervalsVoices', tonic: 'intervalsTonic' }[id]]));
          radio.addEventListener('change', () => {
            if (M.intervalModeOf(score) === id) return;
            const before = M.clone(score);
            M.pruneLower(before);
            M.setIntervalMode(score, id);
            recordChange(before);
            sync();
          });
          modes.appendChild(mode);
          return radio;
        });
        wrap.appendChild(modes);
        // La tonica que se estima (la misma de los nombres de acorde): se muestra y el usuario la confirma o la corrige.
        const notes = t.tonicNotes.split(',');
        const spell = (name) => {
          const { letter, mode } = parseTonic(name);
          return notes[letter] + (/#/.test(name) ? '\u266f' : /b/.test(name) ? '\u266d' : '') + ' ' + (mode === 'min' ? t.tonicMinor : t.tonicMajor);
        };
        const tonic = document.createElement('label');
        tonic.className = 'score-settings-tonic';
        const caption = document.createElement('span');
        caption.textContent = t.tonicLabel;
        const tonicSelect = document.createElement('select');
        tonicSelect.title = t.tonicHint;
        tonicSelect.setAttribute('aria-label', t.tonicLabel + '. ' + t.tonicHint);
        tonicSelect.addEventListener('change', () => {
          if ((M.tonicOf(score) || '') === tonicSelect.value) return;
          const before = M.clone(score);
          M.pruneLower(before);
          M.setTonic(score, tonicSelect.value || null);
          recordChange(before);
          sync();
        });
        tonic.append(caption, tonicSelect);
        modes.appendChild(tonic);
        refreshTonic = () => {
          const key = scoreKey(score, M);
          // Las 30 tonalidades con armadura de hasta siete alteraciones; la detectada se suma si quedara fuera.
          const pc = (n) => ((n % 12) + 12) % 12;
          const names = Array.from({ length: 15 }, (_, k) => spellTonic(pc((k - 7) * 7), 'maj', k - 7))
            .concat(Array.from({ length: 15 }, (_, k) => spellTonic(pc((k - 7) * 7 + 9), 'min', k - 7)));
          if (!names.includes(key.detectedName)) names.push(key.detectedName);
          tonicSelect.replaceChildren(...[['', t.tonicDetected + ': ' + spell(key.detectedName)], ...names.map((name) => [name, spell(name)])].map(([value, label]) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            return option;
          }));
          tonicSelect.value = M.tonicOf(score) || '';
          tonic.hidden = M.intervalModeOf(score) !== 'tonic';
        };
      }
      check.addEventListener('change', () => {
        M.setTool(score, name, check.checked);
        save();
        if (name === 'voices' || name === 'intervals' || name === 'lyrics') render(); else { applyTools(); applyVoices(); }
      });
      toolsGrid.appendChild(wrap);
      return [name, check, fallback];
    });

    // La biblioteca de patrones es del usuario, no de la partitura: la casilla vale para todas.
    let patternsCheck = null;
    if (patterns) {
      const wrap = document.createElement('div');
      wrap.className = 'score-settings-section score-settings-category';
      const field = document.createElement('label');
      field.className = 'score-settings-check';
      patternsCheck = document.createElement('input');
      patternsCheck.type = 'checkbox';
      field.append(patternsCheck, document.createTextNode(t.libraryPatterns));
      const hint = document.createElement('p');
      hint.className = 'score-settings-hint';
      hint.textContent = t.libraryHint;
      patternsCheck.addEventListener('change', () => {
        libraryEnabled = patternsCheck.checked;
        setSetting('patterns', libraryEnabled);
        applyLibrary();
      });
      const syncLibrary = () => {
        patternsCheck.disabled = !LIBRARY_PAGE.matches;
        hint.textContent = LIBRARY_PAGE.matches ? t.libraryHint : t.libraryWideScreen;
      };
      syncLibrary();
      LIBRARY_PAGE.addEventListener('change', () => { syncLibrary(); applyLibrary(); });
      wrap.append(field, hint);
      content.appendChild(wrap);
    }

    // Cada glifo se recorta a su tinta: la caja comun deja mas aire arriba en unos que en otros
    // y la distancia al checkbox se veria despareja.
    let fitted = false;
    function fitIcons() {
      if (fitted) return;
      fitted = true;
      popup.querySelectorAll('.score-settings-icon svg:not(.lucide)').forEach((svg) => {
        try {
          const box = svg.getBBox();
          if (!box.width || !box.height) return;
          svg.setAttribute('viewBox', `${box.x} ${box.y} ${box.width} ${box.height}`);
          svg.setAttribute('width', String(box.width));
          svg.setAttribute('height', String(box.height));
        } catch { /* sin caja medible: queda como estaba */ }
      });
    }

    function sync() {
      if (patternsCheck) patternsCheck.checked = libraryEnabled;
      instruments.forEach((radio, i) => { radio.checked = M.instrumentOf(score) === instrumentIds[i]; });
      voicesCard.hidden = M.instrumentOf(score) !== 'voices';
      sounds.forEach((radio) => { radio.checked = M.soundOf(score) === radio.value; });
      intervalModes.forEach((radio) => { radio.checked = M.intervalModeOf(score) === radio.value; });
      refreshTonic();
      guitarCard.hidden = !M.choir || M.instrumentOf(score) !== 'guitar';
      partsSlider.value = String(M.partsOf(score));
      showParts();
      guitarPartsSlider.value = String(M.guitarPartsOf(score));
      showGuitarParts();
      tempoSlider.value = String(score.tempo || 120);
      showTempo();
      tempoNone.checked = !score.tempo;
      checks.forEach(([name, check, fallback]) => { check.checked = toolOn(name, fallback); });
    }

    popup.addEventListener('toggle', (event) => cog.setAttribute('aria-expanded', String(event.newState === 'open')));
    cog.addEventListener('click', () => {
      if (popup.matches(':popover-open')) { popup.hidePopover(); return; }
      sync();
      popup.showPopover();
      fitIcons();
      (popup.querySelector('input:checked') || popup.querySelector('input')).focus({ preventScroll: true });
    });
    document.querySelector('.score-page').appendChild(popup);
  }

  // ---- renglones, descargas ----------------------------------------------

  addRow.innerHTML = lucide('plus');
  removeRow.innerHTML = lucide('minus');
  document.querySelectorAll('[data-icon]').forEach((node) => {
    if (ICONS[node.dataset.icon]) node.insertAdjacentHTML('afterbegin', lucide(node.dataset.icon));
  });
  document.getElementById('scoreNewTab').addEventListener('click', newTab);
  document.getElementById('scoreDuplicate').addEventListener('click', duplicateTab);
  renderTabs();
  applyLibrary();
  syncUrl();

  document.getElementById('scoreClear').addEventListener('click', async (event) => {
    if (score.demo) return;
    const button = event.currentTarget;
    const isOnly = docs.length === 1;
    const confirmed = await window.ScoreConfirm.ask({
      title: t.clearTitle, description: isOnly ? t.clearDescription : t.clearDescriptionTab, confirm: t.clearConfirm, cancel: t.clearCancel,
    });
    if (confirmed && isOnly) {
      // La unica pestana no se quita: vuelve a una partitura nueva, sin notas, titulo ni autor.
      change(() => {
        selected = null;
        group = [];
        score = applyUrlDefaults(Object.assign(M.emptyScore(), { title: defaultTitle }), urlDefaults, M);
      });
      renderTabs();
    } else if (confirmed) {
      docs.splice(active, 1);
      histories.splice(active, 1);
      // The neighbour to land on is an open tab; with none open, a closed score comes back.
      let landing = active - 1;
      while (landing >= 0 && !isOpen(landing)) landing -= 1;
      if (landing < 0) {
        landing = active;
        while (landing < docs.length && !isOpen(landing)) landing += 1;
      }
      active = landing < docs.length ? Math.max(landing, 0) : docs.length - 1;
      delete docs[active].closed;
      score = docs[active];
      history = histories[active];
      selected = null;
      selectedNavigation = [];
      group = [];
      save();
      renderTabs();
      render();
    }
    button.focus();
  });

  addRow.addEventListener('click', () => change(() => { score.rows.push(M.emptyRow()); }));
  removeRow.addEventListener('click', () => change(removeLastRow));

  // ---- menu del sitio: cargar y exportar ----------------------------------

  // Una partitura cargada se abre en una pestana nueva, sin tocar la actual.
  function openScore(loaded, { tools, sound, demo = false, demoId } = {}) {
    applyUrlDefaults(loaded, urlDefaults, M);
    if (demo) {
      loaded.demo = true;
      if (demoId) loaded.demoId = demoId;
      intervalDocuments.add(loaded);
      document.documentElement.classList.add('banner-closed');
    }
    if (tools) loaded.tools = { ...tools };
    if (sound) M.setSound(loaded, sound);
    docs[active] = score;
    histories[active] = history;
    docs.push(loaded);
    histories.push([]);
    enteringTab = docs.length - 1;
    switchTo(docs.length - 1);
  }

  // Importar y exportar viven en otro modulo (con el PDF y MIDI): se baja la primera vez que se usa alguno.
  let exporterReady = null;
  function exporter() {
    return (exporterReady = exporterReady || import('./score-export.js').then((module) => module.default({
      M, t, say, SCALE, defaultTitle, openScore, newToolkit, loadScript, vendorUrl, score: () => score,
    })));
  }
  function withExporter(action, onError) {
    return async (...args) => {
      try {
        return await action(await exporter(), ...args);
      } catch (e) {
        exporterReady = null;
        say(onError);
      }
    };
  }

  // The host connects its own controls; their position and layout belong to the site.
  const actions = {
    loadUrl: withExporter((tools, demo, options) => tools.loadUrl(demo.url, { ...options, demoId: demo.id }), t.importFailed || t.loadError),
    restoreDemo: (id) => {
      const matches = (one) => one.demo && one.demoId === id;
      const index = matches(score) ? active : docs.findIndex(matches);
      if (index < 0) return false;
      M.enableChoir();
      switchTo(index);
      return true;
    },
    loadFile: withExporter((tools, file) => file && tools.loadFile(file), t.importFailed || t.loadError),
    exportMusicXml: withExporter((tools) => tools.exportMusicXml(), t.loadError),
    exportMidi: withExporter((tools) => tools.exportMidi(), t.loadError),
    exportPdf: withExporter((tools, button) => tools.exportPdf(button), t.pdfError || t.loadError),
    warm: () => exporter().catch(() => { exporterReady = null; }),
  };

  // ---- arranque -----------------------------------------------------------

  let resizeTimer = 0;
  new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { if (stage.clientWidth !== renderedWidth) render(); }, 120);
  }).observe(stage);

  stage.setAttribute('aria-busy', 'true');
  // The 8 MB Verovio build is fetched once the page is idle, so it never competes with first paint; the server-drawn
  // staff holds the place (and the height) meanwhile.
  const whenIdle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
  // Saved scores are waiting behind a spinner (main.js), so Verovio starts right after first paint; otherwise it waits for idle.
  const loadSoon = stage.classList.contains('is-loading')
    ? new Promise((resolve) => requestAnimationFrame(() => resolve()))
    : new Promise((resolve) => whenIdle(resolve, { timeout: 1500 }));
  const ready = loadSoon.then(loadVerovio).then(() => {
    stage.removeAttribute('aria-busy');
    render();
    stage.classList.remove('is-loading');
    if (patternsOn()) renderLibrary(); // los patrones se dibujan con Verovio: recien ahora se puede
  }, () => {
    stage.removeAttribute('aria-busy');
    stage.classList.remove('is-loading');
    say(t.loadError);
  });
  bindActions({ ...actions, ready });

  // Consola del navegador: `voces()` lista las figuras de cada compas, por voz.
  window.voces = () => console.log(M.voicesText(score));

  // Para la consola: recalcula las voces sin fusionarlas ni cambiar sus tiempos. Se puede deshacer.
  function fix() {
    const before = JSON.stringify(score.rows);
    change(() => { for (let staff = 0; staff < M.stavesOf(score); staff += 1) M.measures(score, staff).forEach((measure, mi) => { M.mergeVoices(measure, M.capacity(score, mi)); }); });
    return before !== JSON.stringify(score.rows);
  }

  window.scoreEditor = { get score() { return score; }, render, fix, get ghostOffset() { return ghostOffset; }, set ghostOffset(value) { ghostOffset = value; } };
}
