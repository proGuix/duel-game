import {
  actionLibrary,
  conditionLibrary,
  createEmptyDescriptor,
  deleteBehaviorDescriptor,
  generateBehaviorId,
  getBehaviorDescriptor,
  listBehaviorOptions,
  upsertBehaviorDescriptor,
  validateDescriptor,
  type BehaviorDescriptor,
  type BTNodeDef
} from '@ai/behavior-registry';

type BehaviorEditorConfig = {
  getCurrentBehaviorId: () => string;
  onBehaviorsChanged: () => void;
  onApplyBehavior: (id: string) => void;
};

type PaletteNode = { label: string; description?: string; node: BTNodeDef };

const DRAG_MIME = 'application/x-duel-bt-node';

let initialized = false;
let panelEl: HTMLDivElement | null = null;
let textareaEl: HTMLTextAreaElement | null = null;
let selectEl: HTMLSelectElement | null = null;
let messageEl: HTMLDivElement | null = null;
let builderTreeEl: HTMLDivElement | null = null;
let builderPaletteEl: HTMLDivElement | null = null;
let builderDescriptor: BehaviorDescriptor | null = null;

export function initBehaviorEditor(config: BehaviorEditorConfig) {
  const trigger = document.getElementById('btEditorBtn') as HTMLButtonElement | null;
  if (!trigger || initialized) return;
  initialized = true;

  ensureStyles();
  buildPanel();
  if (!panelEl || !textareaEl || !selectEl || !messageEl || !builderTreeEl || !builderPaletteEl) return;

  renderBuilderPalette();

  const closeBtn = panelEl.querySelector<HTMLButtonElement>('[data-close]');
  closeBtn?.addEventListener('click', closePanel);
  panelEl.addEventListener('click', (evt) => {
    if (evt.target === panelEl) closePanel();
  });
  trigger.addEventListener('click', () => {
    openPanel();
    refreshBehaviorList(config.getCurrentBehaviorId());
  });

  selectEl.addEventListener('change', () => {
    const id = selectEl?.value;
    if (id) loadDescriptor(id);
  });

  panelEl.querySelector<HTMLButtonElement>('[data-action="new"]')?.addEventListener('click', () => {
    const descriptor = createEmptyDescriptor();
    upsertBehaviorDescriptor(descriptor);
    config.onBehaviorsChanged();
    refreshBehaviorList(descriptor.id);
    message(`Nouvelle variante créée (${descriptor.id}).`);
  });

  panelEl.querySelector<HTMLButtonElement>('[data-action="duplicate"]')?.addEventListener('click', () => {
    const id = selectEl?.value;
    if (!id) return;
    const current = getBehaviorDescriptor(id);
    if (!current) {
      message('Aucun comportement à dupliquer.');
      return;
    }
    const base = current.id.replace(/-copy$/i, '') || 'copy';
    const copyId = generateBehaviorId(base);
    const duplicate: BehaviorDescriptor = { ...current, id: copyId, label: `${current.label} (copie)` };
    upsertBehaviorDescriptor(duplicate);
    config.onBehaviorsChanged();
    refreshBehaviorList(duplicate.id);
    message('Variante dupliquée.');
  });

  panelEl.querySelector<HTMLButtonElement>('[data-action="delete"]')?.addEventListener('click', () => {
    const id = selectEl?.value;
    if (!id) return;
    const options = listBehaviorOptions();
    if (options.length <= 1) {
      message('Impossible de supprimer la dernière variante.');
      return;
    }
    if (!window.confirm('Supprimer définitivement cette variante ?')) return;
    deleteBehaviorDescriptor(id);
    config.onBehaviorsChanged();
    const next = listBehaviorOptions()[0];
    refreshBehaviorList(next?.id);
    if (config.getCurrentBehaviorId() === id && next) {
      config.onApplyBehavior(next.id);
    }
    message('Variante supprimée.');
  });

  panelEl.querySelector<HTMLButtonElement>('[data-action="apply"]')?.addEventListener('click', () => {
    const id = selectEl?.value;
    if (id) {
      config.onApplyBehavior(id);
      message('Variante appliquée.');
    }
  });

  panelEl.querySelector<HTMLButtonElement>('[data-action="save"]')?.addEventListener('click', () => {
    if (!textareaEl) return;
    try {
      const parsed = JSON.parse(textareaEl.value);
      const validated = validateDescriptor(parsed);
      upsertBehaviorDescriptor(validated);
      textareaEl.value = JSON.stringify(validated, null, 2);
      builderDescriptor = cloneDescriptor(validated);
      renderBuilderTree();
      config.onBehaviorsChanged();
      refreshBehaviorList(validated.id);
      config.onApplyBehavior(validated.id);
      message('Comportement enregistré.');
    } catch (err) {
      message(err instanceof Error ? err.message : String(err));
    }
  });

  panelEl.querySelector<HTMLButtonElement>('[data-builder="from-json"]')?.addEventListener('click', () => {
    syncBuilderFromTextarea();
  });

  panelEl.querySelector<HTMLButtonElement>('[data-builder="clear-root"]')?.addEventListener('click', () => {
    if (!builderDescriptor) return;
    if (!isCompositeNode(builderDescriptor.root)) {
      message('La racine doit être un sélecteur ou une séquence.');
      return;
    }
    if (!window.confirm('Vider tous les enfants de la racine ?')) return;
    builderDescriptor.root.children = [];
    renderBuilderTree();
    syncTextareaFromBuilder();
    message('Racine vidée.');
  });

  builderTreeEl.addEventListener('click', (evt) => {
    const target = evt.target as HTMLElement;
    const removeBtn = target.closest<HTMLButtonElement>('[data-node-remove]');
    if (removeBtn) {
      const path = parsePath(removeBtn.dataset.nodeRemove);
      removeNodeAtPath(path);
      return;
    }
    const editBtn = target.closest<HTMLButtonElement>('[data-node-edit]');
    if (editBtn) {
      const path = parsePath(editBtn.dataset.nodeEdit);
      renameNodeAtPath(path);
    }
  });
  builderTreeEl.addEventListener('dragover', (evt) => {
    const zone = getDropZone(evt.target);
    const hasData = evt.dataTransfer?.types.includes(DRAG_MIME);
    if (zone && hasData) {
      evt.preventDefault();
      zone.classList.add('drop-target');
    }
  });
  builderTreeEl.addEventListener('dragleave', (evt) => {
    const zone = getDropZone(evt.target);
    zone?.classList.remove('drop-target');
  });
  builderTreeEl.addEventListener('drop', (evt) => {
    const zone = getDropZone(evt.target);
    if (!zone) return;
    zone.classList.remove('drop-target');
    const payload = evt.dataTransfer?.getData(DRAG_MIME);
    if (!payload) return;
    evt.preventDefault();
    try {
      const data = JSON.parse(payload) as { kind: 'palette' | 'existing'; node?: BTNodeDef; path?: number[] };
      const parentPath = parsePath(zone.dataset.dropPath);
      const insertIndex = Number(zone.dataset.insertIndex ?? '0');
      if (data.kind === 'palette' && data.node) {
        insertNode(parentPath, insertIndex, cloneNode(data.node));
      } else if (data.kind === 'existing' && data.path) {
        moveExistingNode(data.path, parentPath, insertIndex);
      }
    } catch (err) {
      message(err instanceof Error ? err.message : String(err));
    }
  });

  refreshBehaviorList(config.getCurrentBehaviorId());
}

function refreshBehaviorList(selectedId?: string) {
  if (!selectEl) return;
  const options = listBehaviorOptions();
  selectEl.innerHTML = '';
  for (const opt of options) {
    const optionEl = document.createElement('option');
    optionEl.value = opt.id;
    optionEl.textContent = opt.label;
    selectEl.appendChild(optionEl);
  }
  if (options.length === 0) {
    builderDescriptor = null;
    renderBuilderTree();
    if (textareaEl) textareaEl.value = '';
    return;
  }
  const target = selectedId && options.some((o) => o.id === selectedId) ? selectedId : options[0].id;
  selectEl.value = target;
  loadDescriptor(target);
}

function loadDescriptor(id: string) {
  if (!textareaEl) return;
  const descriptor = getBehaviorDescriptor(id);
  if (!descriptor) {
    textareaEl.value = '';
    builderDescriptor = null;
    renderBuilderTree();
    return;
  }
  textareaEl.value = JSON.stringify(descriptor, null, 2);
  builderDescriptor = cloneDescriptor(descriptor);
  renderBuilderTree();
  message('');
}

function insertNode(parentPath: number[], index: number, node: BTNodeDef) {
  if (!builderDescriptor) return;
  const parent = getNodeAtPath(parentPath);
  if (!isCompositeNode(parent)) {
    message('Ajoutez les éléments sur un sélecteur ou une séquence.');
    return;
  }
  parent.children.splice(index, 0, node);
  renderBuilderTree();
  syncTextareaFromBuilder();
}

function removeNodeAtPath(path: number[]) {
  if (!builderDescriptor) return;
  if (path.length === 0) {
    message('Impossible de supprimer la racine.');
    return;
  }
  try {
    const parentPath = path.slice(0, -1);
    const parent = getNodeAtPath(parentPath);
    if (!isCompositeNode(parent)) return;
    parent.children.splice(path[path.length - 1], 1);
    renderBuilderTree();
    syncTextareaFromBuilder();
  } catch (err) {
    message(err instanceof Error ? err.message : String(err));
  }
}

function renameNodeAtPath(path: number[]) {
  if (!builderDescriptor) return;
  try {
    const node = getNodeAtPath(path);
    if (isCompositeNode(node)) {
      const next = window.prompt('Nom du nœud', node.name);
      if (next && next.trim()) {
        node.name = next.trim();
        renderBuilderTree();
        syncTextareaFromBuilder();
      }
    } else {
      const next = window.prompt('Label affiché (optionnel)', node.label ?? '');
      node.label = next && next.trim() ? next.trim() : undefined;
      renderBuilderTree();
      syncTextareaFromBuilder();
    }
  } catch (err) {
    message(err instanceof Error ? err.message : String(err));
  }
}

function syncTextareaFromBuilder() {
  if (!textareaEl) return;
  if (!builderDescriptor) {
    textareaEl.value = '';
    return;
  }
  textareaEl.value = JSON.stringify(builderDescriptor, null, 2);
}

function syncBuilderFromTextarea() {
  if (!textareaEl) return;
  try {
    const parsed = JSON.parse(textareaEl.value);
    const validated = validateDescriptor(parsed);
    builderDescriptor = cloneDescriptor(validated);
    renderBuilderTree();
    message('Builder synchronisé depuis le JSON.');
  } catch (err) {
    message(err instanceof Error ? err.message : String(err));
  }
}

function getNodeAtPath(path: number[]): BTNodeDef {
  if (!builderDescriptor) throw new Error('Aucun comportement chargé.');
  let node: BTNodeDef = builderDescriptor.root;
  for (const index of path) {
    if (!isCompositeNode(node)) throw new Error('Chemin invalide.');
    node = node.children[index];
  }
  return node;
}

function moveExistingNode(from: number[], toParent: number[], insertIndex: number) {
  if (!builderDescriptor) return;
  if (isAncestorPath(from, toParent)) {
    message('Impossible de déplacer un nœud dans lui-même.');
    return;
  }
  const node = detachNode(from);
  insertNode(toParent, insertIndex, node);
}

function detachNode(path: number[]): BTNodeDef {
  if (!builderDescriptor) throw new Error('Aucun comportement chargé.');
  if (path.length === 0) throw new Error('Impossible de détacher la racine.');
  const parentPath = path.slice(0, -1);
  const idx = path[path.length - 1];
  const parent = getNodeAtPath(parentPath);
  if (!isCompositeNode(parent)) throw new Error('Parent invalide.');
  const [node] = parent.children.splice(idx, 1);
  return node;
}

function isAncestorPath(ancestor: number[], maybeDesc: number[]): boolean {
  if (ancestor.length > maybeDesc.length) return false;
  return ancestor.every((v, i) => v === maybeDesc[i]);
}

function renderBuilderTree() {
  if (!builderTreeEl) return;
  builderTreeEl.innerHTML = '';
  if (!builderDescriptor) {
    builderTreeEl.innerHTML = `<p class="bt-builder-empty">Sélectionnez une variante pour commencer.</p>`;
    return;
  }
  builderTreeEl.appendChild(renderNode(builderDescriptor.root, []));
}

function renderNode(node: BTNodeDef, path: number[]): HTMLDivElement {
  const wrapper = document.createElement('div');
  wrapper.className = 'bt-builder-node';
  wrapper.dataset.path = pathToString(path);

  const header = document.createElement('div');
  header.className = 'bt-builder-node-header';

  const badge = document.createElement('span');
  badge.className = 'bt-builder-node-type';
  badge.textContent = shortType(node);

  const title = document.createElement('span');
  title.className = 'bt-builder-node-title';
  title.textContent = nodeLabel(node);

  const actions = document.createElement('div');
  actions.className = 'bt-builder-node-actions';
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.title = 'Renommer';
  editBtn.dataset.nodeEdit = pathToString(path);
  editBtn.textContent = '✎';
  actions.appendChild(editBtn);
  if (path.length > 0) {
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.title = 'Supprimer';
    removeBtn.dataset.nodeRemove = pathToString(path);
    removeBtn.textContent = '✕';
    actions.appendChild(removeBtn);
    header.draggable = true;
    header.addEventListener('dragstart', (evt) => {
      evt.dataTransfer?.setData(DRAG_MIME, JSON.stringify({ kind: 'existing', path }));
      evt.dataTransfer?.setData('text/plain', nodeLabel(node));
      evt.dataTransfer!.effectAllowed = 'move';
    });
  }

  header.append(badge, title, actions);
  wrapper.appendChild(header);

  if (isCompositeNode(node)) {
    const children = document.createElement('div');
    children.className = 'bt-builder-children';
    if (node.children.length === 0) {
      const hint = document.createElement('div');
      hint.className = 'bt-builder-drop-hint';
      hint.textContent = 'Glissez-déposez un nœud ici';
      hint.dataset.dropPath = pathToString(path);
      hint.dataset.insertIndex = '0';
      children.appendChild(hint);
    } else {
      node.children.forEach((child, index) => {
        children.appendChild(renderDropZone(path, index));
        children.appendChild(renderNode(child, [...path, index]));
      });
      children.appendChild(renderDropZone(path, node.children.length));
    }
    wrapper.appendChild(children);
  }

  return wrapper;
}

function renderDropZone(parentPath: number[], insertIndex: number): HTMLDivElement {
  const drop = document.createElement('div');
  drop.className = 'bt-dropzone';
  drop.dataset.dropPath = pathToString(parentPath);
  drop.dataset.insertIndex = String(insertIndex);
  drop.textContent = '';
  return drop;
}

function renderBuilderPalette() {
  if (!builderPaletteEl) return;
  const compositeItems: PaletteNode[] = [
    { label: 'Selector', description: 'Teste ses enfants jusqu’à succès.', node: { type: 'Selector', name: 'Selector', children: [] } },
    { label: 'Sequence', description: 'Exécute ses enfants en série.', node: { type: 'Sequence', name: 'Sequence', children: [] } }
  ];
  const conditionItems: PaletteNode[] = conditionLibrary.map((entry) => ({
    label: entry.label,
    description: entry.description,
    node: { type: 'Condition', ref: entry.ref, label: entry.label }
  }));
  const actionItems: PaletteNode[] = actionLibrary.map((entry) => ({
    label: entry.label,
    description: entry.description,
    node: { type: 'Action', ref: entry.ref, label: entry.label }
  }));

  builderPaletteEl.innerHTML = `
    ${renderPaletteSection('Composites', compositeItems)}
    ${renderPaletteSection('Conditions', conditionItems)}
    ${renderPaletteSection('Actions', actionItems)}
  `;

  builderPaletteEl.querySelectorAll<HTMLElement>('[data-palette]').forEach((item) => {
    item.draggable = true;
    item.addEventListener('dragstart', (evt) => {
      const data = item.dataset.palette;
      if (!data || !evt.dataTransfer) return;
      evt.dataTransfer.setData(DRAG_MIME, JSON.stringify({ kind: 'palette', node: JSON.parse(data) }));
      evt.dataTransfer.setData('text/plain', item.textContent ?? 'node');
      evt.dataTransfer.effectAllowed = 'copy';
    });
  });
}

function renderPaletteSection(title: string, items: PaletteNode[]) {
  const content = items
    .map(
      (item) => `
        <button type="button" class="bt-palette-item" data-palette='${JSON.stringify(item.node)}'>
          <strong>${item.label}</strong>
          <span>${item.description ?? ''}</span>
        </button>
      `
    )
    .join('');
  return `
    <div class="bt-builder-palette-section">
      <h4>${title}</h4>
      <div class="bt-builder-palette-grid">${content}</div>
    </div>
  `;
}

function getDropZone(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  return target.closest('[data-drop-path]');
}

function shortType(node: BTNodeDef) {
  switch (node.type) {
    case 'Selector':
      return 'SEL';
    case 'Sequence':
      return 'SEQ';
    case 'Condition':
      return 'COND';
    case 'Action':
      return 'ACT';
    default:
      return node.type;
  }
}

function nodeLabel(node: BTNodeDef) {
  if (isCompositeNode(node)) return `${node.name}`;
  return `${node.type === 'Condition' ? node.ref : node.ref}${node.label ? ` • ${node.label}` : ''}`;
}

function isCompositeNode(node: BTNodeDef): node is Extract<BTNodeDef, { type: 'Selector' | 'Sequence' }> {
  return node.type === 'Selector' || node.type === 'Sequence';
}

function pathToString(path: number[]): string {
  return path.length === 0 ? 'root' : path.join('.');
}

function parsePath(value?: string | null): number[] {
  if (!value || value === 'root') return [];
  return value
    .split('.')
    .map((token) => Number(token))
    .filter((num) => Number.isFinite(num));
}

function cloneDescriptor(desc: BehaviorDescriptor): BehaviorDescriptor {
  return JSON.parse(JSON.stringify(desc));
}

function cloneNode<T extends BTNodeDef>(node: T): T {
  return JSON.parse(JSON.stringify(node));
}

function openPanel() {
  panelEl?.classList.add('visible');
  document.body.classList.add('bt-editor-open');
}

function closePanel() {
  panelEl?.classList.remove('visible');
  document.body.classList.remove('bt-editor-open');
}

function message(text: string) {
  if (!messageEl) return;
  messageEl.textContent = text;
}

function buildPanel() {
  panelEl = document.createElement('div');
  panelEl.id = 'btEditorPanel';
  panelEl.innerHTML = `
    <div class="bt-editor-window" role="dialog" aria-modal="true">
      <div class="bt-editor-header">
        <strong>Éditeur de Behavior Tree</strong>
        <button type="button" class="bt-editor-close" data-close aria-label="Fermer">×</button>
      </div>
      <div class="bt-editor-body">
        <div class="bt-editor-row">
          <label for="btEditorSelect">Variante</label>
          <select id="btEditorSelect"></select>
          <div class="bt-editor-buttons">
            <button type="button" data-action="new">Nouveau</button>
            <button type="button" data-action="duplicate">Dupliquer</button>
            <button type="button" class="danger" data-action="delete">Supprimer</button>
          </div>
        </div>

        <div class="bt-builder-shell">
          <div class="bt-builder-toolbar">
            <strong>Assistant visuel (drag & drop)</strong>
            <div class="bt-editor-buttons">
              <button type="button" data-builder="from-json">Recharger depuis le JSON</button>
              <button type="button" data-builder="clear-root">Vider la racine</button>
            </div>
          </div>
          <div class="bt-builder-layout">
            <div id="btBuilderTree" class="bt-builder-tree"></div>
            <div id="btBuilderPalette" class="bt-builder-palette"></div>
          </div>
        </div>

        <textarea id="btEditorJson" spellcheck="false"></textarea>
        <div class="bt-editor-actions">
          <div class="bt-editor-hints">
            Modifiez librement le JSON (champ <code>root</code>), puis synchronisez ou glissez les blocs depuis la palette.
          </div>
          <div class="bt-editor-actions-right">
            <button type="button" data-action="apply">Appliquer</button>
            <button type="button" class="primary" data-action="save">Enregistrer</button>
          </div>
        </div>
        <div class="bt-editor-message" id="btEditorMessage"></div>
      </div>
    </div>
  `;

  document.body.appendChild(panelEl);
  textareaEl = panelEl.querySelector('#btEditorJson');
  selectEl = panelEl.querySelector('#btEditorSelect');
  messageEl = panelEl.querySelector('#btEditorMessage');
  builderTreeEl = panelEl.querySelector('#btBuilderTree');
  builderPaletteEl = panelEl.querySelector('#btBuilderPalette');
}

function ensureStyles() {
  if (document.getElementById('btEditorStyles')) return;
  const style = document.createElement('style');
  style.id = 'btEditorStyles';
  style.textContent = `
    body.bt-editor-open { overflow: hidden; }
    #btEditorPanel {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.6);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 2100;
      padding: 20px;
    }
    #btEditorPanel.visible { display: flex; }
    .bt-editor-window {
      width: min(1080px, 92vw);
      max-height: 92vh;
      background: #0f131d;
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 14px;
      box-shadow: 0 25px 60px rgba(0,0,0,0.6);
      color: #f2f5ff;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .bt-editor-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 18px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.03);
    }
    .bt-editor-body {
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      overflow: auto;
    }
    .bt-editor-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }
    .bt-editor-row label { font-weight: 600; }
    .bt-editor-row select {
      min-width: 180px;
      background: #161c2a;
      color: inherit;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 6px;
      padding: 4px 8px;
    }
    .bt-editor-buttons {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .bt-editor-buttons button,
    .bt-editor-actions-right button {
      border-radius: 999px;
      border: 1px solid rgba(255,255,255,0.2);
      background: rgba(255,255,255,0.05);
      color: inherit;
      padding: 4px 12px;
      cursor: pointer;
    }
    .bt-editor-buttons button.danger { border-color: rgba(255,90,90,0.5); color: #ff8a8a; }
    .bt-editor-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }
    .bt-editor-actions .primary {
      background: #4da3ff;
      border-color: #4da3ff;
      color: #0b101c;
      font-weight: 600;
    }
    #btEditorJson {
      min-height: 220px;
      width: 100%;
      background: #0b0f18;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      color: #f2f5ff;
      font-family: 'JetBrains Mono', Consolas, monospace;
      font-size: 13px;
      padding: 12px;
      resize: vertical;
    }
    .bt-editor-message {
      min-height: 18px;
      color: #ffd84b;
      font-size: 13px;
    }
    .bt-editor-close {
      border: none;
      background: transparent;
      color: inherit;
      font-size: 20px;
      cursor: pointer;
    }
    .bt-builder-shell {
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 10px;
      padding: 12px;
      background: rgba(255,255,255,0.02);
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .bt-builder-toolbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 10px;
    }
    .bt-builder-layout {
      display: grid;
      grid-template-columns: 2fr 1fr;
      gap: 12px;
      min-height: 240px;
    }
    @media (max-width: 900px) {
      .bt-builder-layout {
        grid-template-columns: 1fr;
      }
    }
    .bt-builder-tree {
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      padding: 10px;
      background: rgba(0,0,0,0.25);
      max-height: 360px;
      overflow: auto;
    }
    .bt-builder-empty {
      margin: 0;
      opacity: 0.7;
      font-style: italic;
    }
    .bt-builder-node {
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      padding: 8px;
      margin-bottom: 8px;
      background: rgba(15,20,32,0.7);
    }
    .bt-builder-node-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 6px;
    }
    .bt-builder-node-type {
      font-size: 10px;
      letter-spacing: 0.08em;
      color: #8fb5ff;
      background: rgba(79,132,255,0.15);
      padding: 2px 6px;
      border-radius: 12px;
    }
    .bt-builder-node-title {
      flex: 1;
      font-weight: 600;
    }
    .bt-builder-node-actions button {
      border: none;
      background: transparent;
      color: #f2f5ff;
      cursor: pointer;
      padding: 0 4px;
      font-size: 13px;
    }
    .bt-builder-children {
      margin-top: 6px;
      padding-left: 10px;
      border-left: 1px dashed rgba(255,255,255,0.15);
      display: flex;
      flex-direction: column;
      gap: 6px;
      min-height: 28px;
    }
    .bt-dropzone {
      border: 1px dashed rgba(77,163,255,0.35);
      border-radius: 6px;
      min-height: 8px;
      padding: 4px 0;
      opacity: 0.35;
      transition: background 0.1s ease, opacity 0.1s ease;
    }
    .bt-dropzone.drop-target {
      background: rgba(77,163,255,0.14);
      opacity: 0.9;
    }
    .bt-builder-children.drop-target {
      background: rgba(77,163,255,0.12);
      border-radius: 6px;
    }
    .bt-builder-drop-hint {
      opacity: 0.6;
      font-size: 12px;
      font-style: italic;
      padding: 6px 0;
    }
    .bt-builder-palette {
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 8px;
      padding: 10px;
      background: rgba(10,14,22,0.8);
      max-height: 360px;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .bt-builder-palette-section h4 {
      margin: 0 0 6px;
      font-size: 13px;
      color: #8fb5ff;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .bt-builder-palette-grid {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .bt-palette-item {
      border: 1px dashed rgba(255,255,255,0.2);
      border-radius: 8px;
      background: rgba(255,255,255,0.04);
      color: inherit;
      text-align: left;
      padding: 6px 8px;
      cursor: grab;
    }
    .bt-palette-item strong { display: block; font-size: 13px; }
    .bt-palette-item span { font-size: 11px; opacity: 0.8; }
  `;
  document.head.appendChild(style);
}
