// Pro: drawer listing every saved score, grouped in folders. Scores move between folders by drag and drop.
// A score points at its folder with `folder` (an id from `folders`); no `folder` means the root. The editor owns the data.
export function createScoresDrawer({ t, lucide, docs, folders, active, labelOf, open, changed }) {
  let root = null;
  let list = null;
  let opener = null;
  let renaming = null; // id of the folder whose name is being edited
  let dragged = -1; // index in docs of the score being dragged

  const el = (tag, className, attrs = {}) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  };

  const iconButton = (icon, label, onClick) => {
    const button = el('button', 'scores-drawer-tool tooltip', { type: 'button', 'aria-label': label, 'data-tooltip': label });
    button.innerHTML = lucide(icon);
    button.addEventListener('click', (event) => { event.stopPropagation(); onClick(button); });
    return button;
  };

  function moveTo(index, folder) {
    const one = docs()[index];
    if (!one) return;
    if (folder) one.folder = folder; else delete one.folder;
    changed();
    render();
  }

  // A drop target: the folder block or the root area. The dragged score lands there.
  function dropTarget(node, folder) {
    node.addEventListener('dragover', (event) => {
      if (dragged < 0) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      node.classList.add('is-over');
    });
    node.addEventListener('dragleave', (event) => {
      if (!node.contains(event.relatedTarget)) node.classList.remove('is-over');
    });
    node.addEventListener('drop', (event) => {
      if (dragged < 0) return;
      event.preventDefault();
      event.stopPropagation();
      const index = dragged;
      dragged = -1;
      moveTo(index, folder);
    });
  }

  function scoreRow(index) {
    const one = docs()[index];
    const item = el('li', 'scores-drawer-score', { draggable: 'true', 'data-index': index });
    if (index === active()) item.classList.add('is-active');
    const grip = el('span', 'scores-drawer-grip');
    grip.innerHTML = lucide('grip-vertical');
    const button = el('button', 'scores-drawer-open', { type: 'button' });
    if (index === active()) button.setAttribute('aria-current', 'true');
    const name = el('span', 'scores-drawer-name');
    name.textContent = labelOf(one, index);
    button.append(name);
    button.addEventListener('click', () => { close(false); open(index); });
    item.append(grip, button);
    item.addEventListener('dragstart', (event) => {
      dragged = index;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', labelOf(one, index));
      requestAnimationFrame(() => item.classList.add('is-dragging'));
    });
    item.addEventListener('dragend', () => {
      dragged = -1;
      item.classList.remove('is-dragging');
      root.querySelectorAll('.is-over').forEach((node) => node.classList.remove('is-over'));
    });
    return item;
  }

  function startRename(folder) {
    renaming = folder.id;
    render();
  }

  function folderBlock(folder, indexes) {
    const block = el('li', 'scores-drawer-folder');
    block.classList.toggle('is-collapsed', Boolean(folder.collapsed));
    const head = el('div', 'scores-drawer-folder-head');
    const toggle = el('button', 'scores-drawer-folder-toggle', { type: 'button', 'aria-expanded': String(!folder.collapsed) });
    toggle.innerHTML = lucide('chevron-down') + lucide(folder.collapsed ? 'folder' : 'folder-open');
    if (renaming === folder.id) {
      const input = el('input', 'scores-drawer-folder-input', { type: 'text', maxlength: '60', 'aria-label': t.folderRename });
      input.value = folder.name;
      const finish = (keep) => {
        if (renaming !== folder.id) return;
        renaming = null;
        const name = input.value.trim();
        if (keep && name) folder.name = name;
        changed();
        render();
      };
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') finish(true);
        else if (event.key === 'Escape') { event.stopPropagation(); finish(false); }
      });
      input.addEventListener('blur', () => finish(true));
      toggle.classList.add('is-renaming');
      head.append(toggle, input);
      queueMicrotask(() => { input.focus(); input.select(); });
    } else {
      const name = el('span', 'scores-drawer-name');
      name.textContent = folder.name;
      const count = el('span', 'scores-drawer-count');
      count.textContent = String(indexes.length);
      toggle.append(name, count);
      toggle.addEventListener('click', () => { folder.collapsed = !folder.collapsed; changed(); render(); });
      head.append(toggle, iconButton('pencil', t.folderRename, () => startRename(folder)), iconButton('trash', t.folderDelete, () => {
        docs().forEach((one) => { if (one.folder === folder.id) delete one.folder; });
        folders.splice(folders.indexOf(folder), 1);
        changed();
        render();
      }));
    }
    block.append(head);
    const body = el('ul', 'scores-drawer-list');
    if (!folder.collapsed) {
      if (indexes.length) body.append(...indexes.map(scoreRow));
      else {
        const empty = el('li', 'scores-drawer-empty');
        empty.textContent = t.folderEmpty;
        body.append(empty);
      }
      block.append(body);
    }
    dropTarget(block, folder.id);
    return block;
  }

  function render() {
    if (!root) return;
    const all = docs().map((one, index) => (one.demo ? -1 : index)).filter((index) => index >= 0);
    const known = new Set(folders.map((folder) => folder.id));
    const loose = all.filter((index) => !known.has(docs()[index].folder));
    const children = folders.map((folder) => folderBlock(folder, all.filter((index) => docs()[index].folder === folder.id)));
    const rootZone = el('li', 'scores-drawer-root');
    if (folders.length) {
      const label = el('p', 'scores-drawer-heading');
      label.textContent = t.folderNone;
      rootZone.append(label);
    }
    const rootList = el('ul', 'scores-drawer-list');
    rootList.append(...loose.map(scoreRow));
    rootZone.append(rootList);
    dropTarget(rootZone, null);
    list.replaceChildren(...children, rootZone);
  }

  function build() {
    root = el('div', 'scores-drawer', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'scoresDrawerTitle' });
    const backdrop = el('div', 'scores-drawer-backdrop');
    backdrop.addEventListener('click', () => close(true));
    const panel = el('div', 'scores-drawer-panel');
    const head = el('div', 'scores-drawer-head');
    const title = el('h2', 'scores-drawer-title', { id: 'scoresDrawerTitle' });
    title.textContent = t.drawerTitle;
    const tools = el('div', 'scores-drawer-tools', { role: 'toolbar', 'aria-label': t.drawerTools });
    tools.append(
      iconButton('folder-plus', t.folderNew, () => {
        const folder = { id: Math.random().toString(36).slice(2, 10).padEnd(8, '0'), name: t.folderDefault };
        folders.unshift(folder);
        changed();
        startRename(folder);
      }),
      iconButton('chevrons-down-up', t.folderCollapseAll, () => {
        const collapse = folders.some((folder) => !folder.collapsed);
        folders.forEach((folder) => { folder.collapsed = collapse; });
        changed();
        render();
      }),
    );
    const closeButton = iconButton('x', t.drawerClose, () => close(true));
    closeButton.classList.add('scores-drawer-close');
    head.append(title, tools, closeButton);
    const hint = el('p', 'scores-drawer-hint');
    hint.textContent = t.drawerHint;
    list = el('ul', 'scores-drawer-tree');
    panel.append(head, hint, list);
    root.append(backdrop, panel);
    // On the document: deleting a folder removes the focused button, and Escape must still close the drawer.
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !root.hidden) { event.stopPropagation(); close(true); }
    });
    document.body.append(root);
  }

  function close(focus) {
    if (!root || root.hidden || root.classList.contains('is-closing')) return;
    renaming = null;
    if (focus && opener) opener.focus();
    const done = () => { root.hidden = true; root.classList.remove('is-closing'); };
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return done();
    root.classList.add('is-closing');
    root.querySelector('.scores-drawer-panel').addEventListener('animationend', done, { once: true });
  }

  return {
    open(from) {
      if (!root) build();
      opener = from || document.activeElement;
      render();
      root.hidden = false;
      root.querySelector('.scores-drawer-close').focus();
    },
    refresh: render,
  };
}
