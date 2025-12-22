import {
  Application,
  Container,
  Graphics,
  Text
} from 'pixi.js';
import {
  ensureBehaviorRegistry,
  listBehaviorOptions,
  getBehaviorDescriptor,
  upsertBehaviorDescriptor,
  deleteBehaviorDescriptor,
  validateDescriptor,
  createEmptyDescriptor,
  generateBehaviorId,
  type BehaviorDescriptor,
  type BTNodeDef
} from '@ai/behavior-registry';

let app: Application;
let treeLayer: Container;
let uiLayer: Container;
let currentDescriptor: BehaviorDescriptor;
let selectedPath: number[] = [];

let paletteDragNode: BTNodeDef | null = null;
let dragNode: { path: number[]; node: BTNodeDef } | null = null;
let ghostContainer: Container | null = null;
let treeMask: Graphics;
let ghostAnchor = { dx: 0, dy: 0 };
let treeContentLeft = 0;
type NodeRect = {
  path: number[];
  parentPath: number[];
  x: number;
  y: number;
  width: number;
  height: number;
  isComposite: boolean;
};
let nodeRects: NodeRect[] = [];
let dropPreview: DropTarget | null = null;

let scrollOffset = 0;
let contentHeight = 0;

// Layout constants
const padding = 14;
const toolbarHeight = 56;
const paletteWidth = 230;
const nodeWidth = 420;
const nodeHeight = 40;
const indentStep = 24;
const nodeSpacing = 8;

const paletteItems: Array<{ label: string; node: BTNodeDef }> = [
  { label: 'Selector', node: { type: 'Selector', name: 'Selector', children: [] } },
  { label: 'Sequence', node: { type: 'Sequence', name: 'Sequence', children: [] } },
  { label: 'Danger?', node: { type: 'Condition', ref: 'danger', label: 'Danger?' } },
  { label: 'InRanged?', node: { type: 'Condition', ref: 'inRange', label: 'InRanged?' } },
  { label: 'NeedReposition?', node: { type: 'Condition', ref: 'needReposition', label: 'NeedReposition?' } },
  { label: 'HasLOS?', node: { type: 'Condition', ref: 'hasLOS', label: 'HasLOS?' } },
  { label: 'TooClose?', node: { type: 'Condition', ref: 'tooClose', label: 'TooClose?' } },
  { label: 'Evade', node: { type: 'Action', ref: 'evade', label: 'Evade' } },
  { label: 'RangedAttack', node: { type: 'Action', ref: 'rangedAttack', label: 'RangedAttack' } },
  { label: 'Reposition', node: { type: 'Action', ref: 'reposition', label: 'Reposition' } },
  { label: 'Patrol', node: { type: 'Action', ref: 'patrol', label: 'Patrol' } },
  { label: 'Strafe', node: { type: 'Action', ref: 'strafe', label: 'Strafe' } },
  { label: 'Charge', node: { type: 'Action', ref: 'charge', label: 'Charge' } }
];

async function bootstrap() {
  await ensureBehaviorRegistry();
  const opts = listBehaviorOptions();
  currentDescriptor = getBehaviorDescriptor(opts[0]?.id ?? '') ?? createEmptyDescriptor();
  await initPixi();
  renderUI();
  redrawTree();
}

async function initPixi() {
  app = new Application();
  await app.init({
    resizeTo: window,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1
  });
  const mount = document.getElementById('editorCanvas');
  mount?.appendChild(app.canvas);

  treeLayer = new Container();
  uiLayer = new Container();
  uiLayer.sortableChildren = true;
  app.stage.addChild(treeLayer, uiLayer);

  ghostContainer = new Container();
  ghostContainer.visible = false;
  ghostContainer.zIndex = 10_000;
  uiLayer.addChild(ghostContainer);

  window.addEventListener('resize', () => {
    clampScroll();
    renderUI();
    redrawTree();
  });

  window.addEventListener(
    'wheel',
    (e) => {
      const rect = app.canvas.getBoundingClientRect();
      const cx = e.clientX - rect.left;
      const cy = e.clientY - rect.top;
      if (isInsideTree(cx, cy)) {
        scrollOffset -= e.deltaY * 0.6;
        clampScroll();
        redrawTree();
      }
    },
    { passive: false }
  );

  window.addEventListener('keydown', (e) => {
    const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase() ?? '';
    if (['input', 'textarea', 'select'].includes(tag)) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selectedPath.length > 0) {
      e.preventDefault();
      removeNode(selectedPath);
    }
  });
}

function renderUI() {
  uiLayer.removeChildren();
  if (ghostContainer) {
    uiLayer.addChild(ghostContainer);
    ghostContainer.zIndex = 10_000;
  }
  const w = Math.round(app.renderer.width);
  const h = Math.round(app.renderer.height);

  // Toolbar
  const toolbar = new Graphics();
  toolbar.roundRect(padding, padding, w - padding * 2, toolbarHeight, 12);
  toolbar.fill({ color: 0x0c1019, alpha: 0.9 });
  toolbar.stroke({ width: 1, color: 0x1c2637, alpha: 0.7 });
  uiLayer.addChild(toolbar);

  let xCursor = Math.round(padding + 10);
  const yBtn = Math.round(padding + 10);

  const opts = listBehaviorOptions();
  const variantBtn = makeButton(
    `Variante: ${currentDescriptor.label}`,
    xCursor,
    yBtn,
    180,
    36,
    () => {
      const idx = opts.findIndex((o) => o.id === currentDescriptor.id);
      const next = opts[(idx + 1) % opts.length];
      loadVariant(next.id);
    }
  );
  uiLayer.addChild(variantBtn.container);
  xCursor += 190;

  const controls = [
    { label: 'Nouveau', action: () => { currentDescriptor = createEmptyDescriptor(); redrawTree(); } },
    {
      label: 'Dupliquer',
      action: () => {
        const clone = JSON.parse(JSON.stringify(currentDescriptor)) as BehaviorDescriptor;
        clone.id = generateBehaviorId('copy');
        clone.label = `${clone.label} (copie)`;
        currentDescriptor = validateDescriptor(clone);
        upsertBehaviorDescriptor(currentDescriptor);
        redrawTree();
      }
    },
    {
      label: 'Supprimer',
      action: () => {
        const all = listBehaviorOptions();
        if (all.length <= 1) return;
        deleteBehaviorDescriptor(currentDescriptor.id);
        const next = getBehaviorDescriptor(listBehaviorOptions()[0].id);
        if (next) currentDescriptor = next;
        redrawTree();
      }
    }
  ];
  for (const btn of controls) {
    const b = makeButton(btn.label, xCursor, yBtn, 100, 36, btn.action);
    uiLayer.addChild(b.container);
    xCursor += 110;
  }

  // Apply/Save on right
  const applyBtn = makeButton('Appliquer', w - padding - 220, yBtn, 90, 36, () => {
    upsertBehaviorDescriptor(validateDescriptor(currentDescriptor));
  });
  const saveBtn = makeButton('Enregistrer', w - padding - 120, yBtn, 110, 36, () => {
    upsertBehaviorDescriptor(validateDescriptor(currentDescriptor));
  }, true);
  uiLayer.addChild(applyBtn.container, saveBtn.container);

  // Palette
  const paletteX = Math.round(w - padding - paletteWidth);
  const paletteY = Math.round(padding * 2 + toolbarHeight);
  const paletteH = Math.round(h - paletteY - padding);
  const paletteBg = new Graphics();
  paletteBg.roundRect(paletteX, paletteY, paletteWidth, paletteH, 14);
  paletteBg.fill({ color: 0x0b0f18, alpha: 0.9 });
  paletteBg.stroke({ width: 1, color: 0x1f2a3d, alpha: 0.7 });
  uiLayer.addChild(paletteBg);

  let py = paletteY + 10;
  const categories: Array<{ title: string; filter: BTNodeDef['type'][] }> = [
    { title: 'Composites', filter: ['Selector', 'Sequence'] },
    { title: 'Conditions', filter: ['Condition'] },
    { title: 'Actions', filter: ['Action'] }
  ];
  for (const cat of categories) {
    const title = new Text(cat.title, { fill: 0x92b5ff, fontSize: 12, fontWeight: '700' });
    title.position.set(paletteX + 12, py);
    uiLayer.addChild(title);
    py += 16;
    for (const item of paletteItems.filter((p) => cat.filter.includes(p.node.type))) {
      const btn = makeButton(item.label, paletteX + 10, py, paletteWidth - 20, 32, () => {}, false, true);
      btn.container.eventMode = 'static';
      btn.container.cursor = 'grab';
      btn.container.on('pointerdown', (e) => {
        paletteDragNode = cloneNode(item.node);
        dragNode = null;
        app.canvas.style.cursor = 'grabbing';
        const { x: px, y: py } = toCanvasPoint(e.clientX, e.clientY);
        const bounds = btn.container.getBounds();
        ghostAnchor = { dx: px - bounds.x, dy: py - bounds.y };
        const ghost = buildPaletteGhost(item.label, bounds.width, bounds.height);
        showGhost(ghost, bounds.x, bounds.y);
        window.addEventListener('pointermove', onDragMove);
        window.addEventListener('pointerup', onPaletteDragEnd);
      });
      uiLayer.addChild(btn.container);
      py += 38;
    }
    py += 10;
  }
}

function redrawTree() {
  treeLayer.removeChildren();
  nodeRects = [];
  const w = app.renderer.width;
  const h = app.renderer.height;

  const treeBg = new Graphics();
  const treeX = Math.round(padding);
  const treeY = Math.round(padding * 2 + toolbarHeight);
  const treeW = Math.round(w - paletteWidth - padding * 3);
  const treeH = Math.round(h - treeY - padding);
  treeBg.roundRect(treeX, treeY, treeW, treeH, 12);
  treeBg.fill({ color: 0x070a10, alpha: 0.85 });
  treeBg.stroke({ width: 1, color: 0x111827, alpha: 0.6 });
  treeLayer.addChild(treeBg);

  const mask = new Graphics();
  mask.roundRect(treeX, treeY, treeW, treeH, 12);
  mask.fill(0xffffff);
  treeMask = mask;
  treeLayer.addChild(mask);

  const treeContent = new Container();
  treeContent.position.set(treeX, treeY);
  treeContent.mask = mask;
  treeLayer.addChild(treeContent);

  const startX = 20;
  treeContentLeft = treeX + startX;
  const startY = 20 + scrollOffset;
  const endY = layoutNode(currentDescriptor.root, [], startX, startY, treeW - 40, treeContent, treeX, treeY);
  contentHeight = endY - scrollOffset + 120;
  clampScroll();
}

function layoutNode(
  node: BTNodeDef,
  path: number[],
  x: number,
  y: number,
  maxWidth: number,
  container: Container,
  treeX: number,
  treeY: number
): number {
  const indent = indentStep * path.length;
  const cardWidth = Math.min(nodeWidth, maxWidth - indent);

  if (dragNode && arraysEqual(dragNode.path, path)) {
    // Skip drawing and do not reserve space so the tree contracts
    return y;
  }

  const bg = new Graphics();
  bg.roundRect(Math.round(x + indent), Math.round(y), cardWidth, nodeHeight, 10);
  bg.fill({ color: 0x101521, alpha: selectedPathMatch(path) ? 0.4 : 0.22 });
  bg.stroke({
    width: selectedPathMatch(path) ? 2 : 1,
    color: selectedPathMatch(path) ? 0x7bc4ff : 0x1f2a3d,
    alpha: 0.9
  });
  bg.eventMode = 'static';
  bg.cursor = 'pointer';
  bg.on('pointertap', () => {
    selectedPath = path;
    redrawTree();
  });
  bg.on('pointerdown', (e) => {
    dragNode = { path, node: getNodeAtPath(path) };
    app.canvas.style.cursor = 'grabbing';
    const { x: px, y: py } = toCanvasPoint(e.clientX, e.clientY);
    const nodeOriginX = treeX + x + indent;
    const nodeOriginY = treeY + y;
    ghostAnchor = { dx: px - nodeOriginX, dy: py - nodeOriginY };
    const ghost = buildGhostTree(node, maxWidth);
    showGhost(ghost, nodeOriginX, nodeOriginY);
    redrawTree();
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
  });

  const badge = new Text(shortType(node), { fill: 0x9bb5e8, fontSize: 11, fontWeight: '700' });
  badge.position.set(
    x + indent + 12,
    y + (nodeHeight - badge.height) / 2
  );

  const title = new Text(nodeLabel(node), { fill: 0xdfe8ff, fontSize: 14, fontWeight: '600' });
  title.position.set(
    x + indent + 12 + 40,
    y + (nodeHeight - title.height) / 2
  );

  container.addChild(bg, badge, title);
  nodeRects.push({
    path,
    parentPath: path.length > 0 ? path.slice(0, -1) : [],
    x: treeX + x + indent,
    y: treeY + y,
    width: cardWidth,
    height: nodeHeight,
    isComposite: isComposite(node)
  });

  let cursorY = y + nodeHeight + nodeSpacing;
  if (isComposite(node)) {
    const childIndent = indentStep * (path.length + 1);
    const childWidth = Math.min(nodeWidth, maxWidth - childIndent);
    const placeholderX = x + childIndent;
    const childPathBase = [...path];
    const showPlaceholder = (insertIndex: number) =>
      dropPreview &&
      arraysEqual(dropPreview.parentPath, path) &&
      dropPreview.insertIndex === insertIndex;

    node.children.forEach((child, index) => {
      if (showPlaceholder(index)) {
        cursorY = renderInsertPlaceholder(container, placeholderX, cursorY, childWidth);
      }
      cursorY = layoutNode(child, [...childPathBase, index], x, cursorY, maxWidth, container, treeX, treeY);
    });
    if (showPlaceholder(node.children.length)) {
      cursorY = renderInsertPlaceholder(container, placeholderX, cursorY, childWidth);
    }
  }

  // delete cross
  if (path.length > 0) {
    const cross = new Text('✕', { fill: 0xaec2e8, fontSize: 12, fontWeight: '700' });
    cross.eventMode = 'static';
    cross.cursor = 'pointer';
    cross.position.set(
      x + indent + cardWidth - 18,
      y + (nodeHeight - cross.height) / 2
    );
    cross.on('pointertap', (e) => {
      e.stopPropagation();
      removeNode(path);
    });
    container.addChild(cross);
  }

  return cursorY;
}

function moveNode(from: number[], toParent: number[], insertIndex: number) {
  if (isAncestorPath(from, toParent)) return;
  const parent = getNodeAtPath(toParent);
  if (!isComposite(parent)) return;
  const movingIndex = from[from.length - 1];
  const sameParent = arraysEqual(from.slice(0, -1), toParent);
  let targetIndex = insertIndex;
  if (sameParent && insertIndex > movingIndex) {
    targetIndex -= 1;
  }
  const node = detachNode(from);
  parent.children.splice(targetIndex, 0, node);
  selectedPath = [...toParent, targetIndex];
  dragNode = null;
  dropPreview = null;
  redrawTree();
}

function insertNodeAt(parentPath: number[], insertIndex: number, node: BTNodeDef) {
  const parent = getNodeAtPath(parentPath);
  if (!isComposite(parent)) return;
  parent.children.splice(insertIndex, 0, node);
  selectedPath = [...parentPath, insertIndex];
  dropPreview = null;
  redrawTree();
}

function onDragMove(e: PointerEvent) {
  if (!dragNode && !paletteDragNode) return;
  const { x, y } = toCanvasPoint(e.clientX, e.clientY);
  if (ghostContainer && ghostContainer.visible) {
    const gx = x - ghostAnchor.dx;
    const gy = y - ghostAnchor.dy;
    ghostContainer.position.set(gx, gy);
  }
  let target = findDropTarget(x, y);
  if (dragNode && target && isAncestorPath(dragNode.path, target.parentPath)) {
    target = null;
  }
  updateDropPreview(target);
}

function onDragEnd(e: PointerEvent) {
  const current = dragNode;
  let performedDrop = false;
  if (current) {
    const { x, y } = toCanvasPoint(e.clientX, e.clientY);
    let target = findDropTarget(x, y);
    if (target && isAncestorPath(current.path, target.parentPath)) {
      target = null;
    }
    if (target) {
      moveNode(current.path, target.parentPath, target.insertIndex);
      performedDrop = true;
    }
  }
  dragNode = null;
  dropPreview = null;
  app.canvas.style.cursor = 'default';
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onDragEnd);
  hideGhost();
  if (!performedDrop) redrawTree();
}

function onPaletteDragEnd(e: PointerEvent) {
  let performedDrop = false;
  if (paletteDragNode) {
    const { x, y } = toCanvasPoint(e.clientX, e.clientY);
    const target = findDropTarget(x, y);
    if (target) {
      insertNodeAt(target.parentPath, target.insertIndex, cloneNode(paletteDragNode));
      performedDrop = true;
    }
  }
  paletteDragNode = null;
  dropPreview = null;
  hideGhost();
  app.canvas.style.cursor = 'default';
  window.removeEventListener('pointermove', onDragMove);
  window.removeEventListener('pointerup', onPaletteDragEnd);
  if (!performedDrop) redrawTree();
}

function makeButton(
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  onClick: () => void,
  primary = false,
  hollow = false
) {
  const container = new Container();
  container.position.set(x, y);
  const bg = new Graphics();
  bg.roundRect(0, 0, w, h, 10);
  bg.fill({
    color: primary ? 0x4da3ff : 0x1a2030,
    alpha: primary ? 1 : hollow ? 0.1 : 0.3
  });
  bg.stroke({ width: 1, color: primary ? 0x4da3ff : 0x2a3343, alpha: hollow ? 0.5 : 0.6 });
  bg.eventMode = 'static';
  bg.cursor = 'pointer';
  bg.on('pointertap', onClick);
  const txt = new Text(label, { fill: primary ? 0x0b0f18 : 0xdfe8ff, fontSize: 13, fontWeight: '600' });
  txt.position.set(w / 2 - txt.width / 2, h / 2 - txt.height / 2);
  container.addChild(bg, txt);
  return { container, bg, txt };
}

function buildGhostTree(node: BTNodeDef, maxWidth: number): Container {
  const root = new Container();
  let cursorY = 0;
  const indentStepGhost = indentStep;
  const cardH = nodeHeight;
  const render = (n: BTNodeDef, depth: number) => {
    const indent = indentStepGhost * depth;
    const availableWidth = Math.max(40, maxWidth - indent);
    const width = Math.min(nodeWidth, availableWidth);
    const bg = new Graphics();
    bg.roundRect(indent, cursorY, width, cardH, 10);
    bg.fill({ color: 0x101521, alpha: 0.22 });
    bg.stroke({ width: 1, color: 0x1f2a3d, alpha: 0.9 });
    root.addChild(bg);
    const badge = new Text(shortType(n), { fill: 0x9bb5e8, fontSize: 11, fontWeight: '700' });
    badge.position.set(indent + 12, cursorY + (cardH - badge.height) / 2);
    const title = new Text(nodeLabel(n), { fill: 0xdfe8ff, fontSize: 14, fontWeight: '600' });
    title.position.set(indent + 12 + 40, cursorY + (cardH - title.height) / 2);
    root.addChild(badge, title);
    cursorY += cardH + nodeSpacing;
    if (isComposite(n)) {
      for (const child of n.children) render(child, depth + 1);
    }
  };
  render(node, 0);
  return root;
}

function buildPaletteGhost(label: string, width: number, height: number): Container {
  const wrapper = new Container();
  const bg = new Graphics();
  bg.roundRect(0, 0, width, height, 10);
  bg.fill({ color: 0x1a2030, alpha: 0.9 });
  bg.stroke({ width: 1, color: 0x4da3ff, alpha: 0.4 });
  wrapper.addChild(bg);
  const txt = new Text(label, { fill: 0xdfe8ff, fontSize: 13, fontWeight: '600' });
  txt.position.set(width / 2 - txt.width / 2, height / 2 - txt.height / 2);
  wrapper.addChild(txt);
  return wrapper;
}

function showGhost(content: Container, x: number, y: number) {
  if (!ghostContainer) return;
  ghostContainer.removeChildren();
  ghostContainer.addChild(content);
  ghostContainer.position.set(x, y);
  ghostContainer.visible = true;
}

function hideGhost() {
  if (!ghostContainer) return;
  ghostContainer.removeChildren();
  ghostContainer.visible = false;
}

function getNodeAtPath(path: number[]): BTNodeDef {
  let node: BTNodeDef = currentDescriptor.root;
  for (const i of path) {
    if (!isComposite(node)) throw new Error('Chemin invalide');
    node = node.children[i];
  }
  return node;
}

function detachNode(path: number[]): BTNodeDef {
  if (path.length === 0) throw new Error('Impossible de détacher la racine');
  const parentPath = path.slice(0, -1);
  const idx = path[path.length - 1];
  const parent = getNodeAtPath(parentPath);
  if (!isComposite(parent)) throw new Error('Parent invalide');
  const [node] = parent.children.splice(idx, 1);
  return node;
}

function removeNode(path: number[]) {
  if (path.length === 0) return;
  detachNode(path);
  selectedPath = path.slice(0, -1);
  redrawTree();
}

function nodeLabel(node: BTNodeDef) {
  if (isComposite(node)) return node.name;
  return node.label ? `${node.ref} - ${node.label}` : node.ref;
}

function shortType(node: BTNodeDef): string {
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
      return 'NODE';
  }
}

function isComposite(node: BTNodeDef): node is Extract<BTNodeDef, { type: 'Selector' | 'Sequence' }> {
  return node.type === 'Selector' || node.type === 'Sequence';
}

function selectedPathMatch(path: number[]) {
  return arraysEqual(selectedPath, path);
}

function arraysEqual(a: number[], b: number[]) {
  return a.length === b.length && a.every((v, i) => b[i] === v);
}

function isAncestorPath(a: number[], b: number[]) {
  if (a.length > b.length) return false;
  return a.every((v, i) => v === b[i]);
}

function cloneNode<T extends BTNodeDef>(node: T): T {
  return JSON.parse(JSON.stringify(node));
}

function toCanvasPoint(clientX: number, clientY: number) {
  const rect = app.canvas.getBoundingClientRect();
  const screen = app.renderer.screen;
  const scaleX = screen.width / rect.width;
  const scaleY = screen.height / rect.height;
  return {
    x: (clientX - rect.left) * scaleX,
    y: (clientY - rect.top) * scaleY
  };
}

function clampScroll() {
  const viewH = app?.renderer?.height ?? window.innerHeight;
  const minOffset = Math.min(0, viewH - (padding * 2 + toolbarHeight) - contentHeight);
  if (scrollOffset > 50) scrollOffset = 50;
  if (scrollOffset < minOffset) scrollOffset = minOffset;
}

function loadVariant(id: string) {
  const desc = getBehaviorDescriptor(id);
  if (!desc) return;
  currentDescriptor = desc;
  selectedPath = [];
  redrawTree();
  renderUI();
}

function isInsideTree(x: number, y: number) {
  const treeX = padding;
  const treeY = padding * 2 + toolbarHeight;
  const treeW = app.renderer.width - paletteWidth - padding * 3;
  const treeH = app.renderer.height - treeY - padding;
  return x >= treeX && x <= treeX + treeW && y >= treeY && y <= treeY + treeH;
}

function renderInsertPlaceholder(container: Container, px: number, py: number, width: number) {
  const placeholder = new Graphics();
  placeholder.roundRect(Math.round(px), Math.round(py), width, nodeHeight, 10);
  placeholder.fill({ color: 0x3dbb57, alpha: 0.18 });
  placeholder.stroke({ width: 1, color: 0x3dbb57, alpha: 0.5 });
  container.addChild(placeholder);
  return py + nodeHeight + nodeSpacing;
}

type DropTarget = { parentPath: number[]; insertIndex: number };

function findDropTarget(px: number, py: number): DropTarget | null {
  if (!isInsideTree(px, py)) return null;
  if (nodeRects.length === 0 || nodeRects.length === 1) return { parentPath: [], insertIndex: 0 };
  const rects = [...nodeRects].sort((a, b) => a.y - b.y);
  if (py < rects[0].y) {
    return { parentPath: [], insertIndex: 0 };
  }
  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];
    const top = rect.y;
    const bottom = rect.y + rect.height;
    if (py >= top && py <= bottom) {
      if(i == 0) {
        return { parentPath: [], insertIndex: 0 };
      }
      return resolveInsideRect(rect, py);
    }
    const next = rects[i + 1];
    if (next && py > bottom && py < next.y) {
      const horizontal = resolveBetweenHorizontal(px, rect, next);
      if (horizontal) return horizontal;
      return targetSiblingBefore(next);
    }
  }
  return resolveTailDrop(px, rects);
}

function resolveInsideRect(rect: NodeRect, py: number): DropTarget | null {
  const mid = rect.y + rect.height / 2;
  if (py < mid) {
    return targetSiblingBefore(rect);
  }
  if (rect.isComposite) {
    return { parentPath: rect.path, insertIndex: 0 };
  }
  return targetSiblingAfter(rect);
}

function resolveBetweenHorizontal(px: number, rectAbove: NodeRect, rectBelow: NodeRect): DropTarget | null {
  const options: Array<{ depth: number; target: DropTarget }> = [];
  options.push(...buildAfterChainUntil(rectAbove.path, rectBelow.path));
  if (rectAbove.isComposite) {
    const asChild = targetPrependChild(rectAbove);
    if (asChild) {
      options.push({ depth: rectAbove.path.length + 1, target: asChild });
    }
  } else {
    const after = targetSiblingAfter(rectAbove);
    if (after) {
      options.push({ depth: rectAbove.path.length, target: after });
    }
  }
  return selectDropByDepth(px, options);
}

function targetSiblingBefore(rect: NodeRect): DropTarget | null {
  if (rect.path.length === 0) return null;
  const parentPath = rect.parentPath;
  const index = rect.path[parentPath.length];
  return { parentPath, insertIndex: index };
}

function targetSiblingAfter(rect: NodeRect): DropTarget | null {
  if (rect.path.length === 0) return null;
  const parentPath = rect.parentPath;
  const index = rect.path[parentPath.length] + 1;
  return { parentPath, insertIndex: index };
}

function buildAfterChain(path: number[]): Array<{ depth: number; target: DropTarget }> {
  const items: Array<{ depth: number; target: DropTarget }> = [];
  let current = [...path];
  while (current.length > 0) {
    const target = targetAfterPath(current);
    if (!target) break;
    items.push({ depth: current.length, target });
    current = current.slice(0, -1);
  }
  return items;
}

function buildAfterChainUntil(path: number[], stopPath: number[]): Array<{ depth: number; target: DropTarget }> {
  const items: Array<{ depth: number; target: DropTarget }> = [];
  let current = [...path];
  while (current.length > 0) {
    if (isAncestorPath(current, stopPath)) break;
    const target = targetAfterPath(current);
    if (!target) break;
    items.push({ depth: current.length, target });
    current = current.slice(0, -1);
  }
  return items;
}

function targetBeforePath(path: number[]): DropTarget | null {
  if (path.length === 0) return null;
  const parentPath = path.slice(0, -1);
  const index = path[parentPath.length];
  return { parentPath, insertIndex: index };
}

function targetAfterPath(path: number[]): DropTarget | null {
  if (path.length === 0) return null;
  const parentPath = path.slice(0, -1);
  const index = path[parentPath.length] + 1;
  return { parentPath, insertIndex: index };
}

function resolveTailDrop(px: number, rects: NodeRect[]): DropTarget | null {
  const last = rects[rects.length - 1];
  const options: Array<{ depth: number; target: DropTarget }> = [];
  options.push(...buildAfterChain(last.path));
  if (last.isComposite) {
    const asChild = targetPrependChild(last);
    if (asChild) {
      options.push({ depth: last.path.length + 1, target: asChild });
    }
  } else {
    const after = targetSiblingAfter(last);
    if (after) {
      options.push({ depth: last.path.length, target: after });
    }
  }
  return selectDropByDepth(px, options);
}

function targetPrependChild(rect: NodeRect): DropTarget | null {
  if (!rect.isComposite) return null;
  const node = getNodeAtPath(rect.path);
  if (!isComposite(node)) return null;
  return { parentPath: rect.path, insertIndex: 0 };
}

function pointerDepth(px: number) {
  const relative = (px - treeContentLeft) / indentStep;
  if (!Number.isFinite(relative)) return 0;
  return Math.max(0, Math.round(relative));
}

function selectDropByDepth(px: number, options: Array<{ depth: number; target: DropTarget }>): DropTarget | null {
  if (options.length === 0) return null;
  const depth = pointerDepth(px);
  let best = options[0];
  let bestDist = Math.abs(depth - best.depth);
  for (let i = 1; i < options.length; i++) {
    const opt = options[i];
    const dist = Math.abs(depth - opt.depth);
    if (dist < bestDist || (dist === bestDist && opt.depth > best.depth)) {
      best = opt;
      bestDist = dist;
    }
  }
  return best.target;
}

function sameDropTarget(a: DropTarget | null, b: DropTarget | null) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.insertIndex === b.insertIndex && arraysEqual(a.parentPath, b.parentPath);
}

function updateDropPreview(target: DropTarget | null) {
  if (sameDropTarget(dropPreview, target)) return;
  dropPreview = target;
  redrawTree();
}

bootstrap().catch(console.error);
