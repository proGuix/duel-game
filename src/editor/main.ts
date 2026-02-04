import {
  Application,
  Container,
  Graphics,
  BitmapText,
  Sprite,
  Assets,
  Texture,
  BlurFilter,
  type TextStyleFontWeight,
  Rectangle
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
let hasUnsavedChanges = false;
let variantDropdownRef: (Container & {
  setSelected?: (desc: BehaviorDescriptor) => void;
  refreshOptions?: () => void;
  syncSelection?: () => void;
  openMenu?: () => void;
  closeMenu?: () => void;
  cleanup?: () => void;
}) | null = null;
let saveButtonRef: { setPrimary?: (primary: boolean) => void } | null = null;


let paletteDragNode: BTNodeDef | null = null;
let dragNode: { path: number[]; node: BTNodeDef } | null = null;
let ghostContainer: Container | null = null;
let treeMask: Graphics;
let ghostAnchor = { dx: 0, dy: 0 };
let treeContentLeft = 0;
let activeNamePrompt: Container | null = null;
let namePromptKeyHandler: ((e: KeyboardEvent) => void) | null = null;
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

type BitmapStyle = {
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string | number;
  fill?: number;
  align?: 'left' | 'center' | 'right';
};

function normalizeFontWeight(weight?: string | number): TextStyleFontWeight {
  if (typeof weight === 'number') return `${weight}` as TextStyleFontWeight;
  if (!weight) return '400';
  const trimmed = weight.trim().toLowerCase();
  if (trimmed === 'normal') return '400';
  if (trimmed === 'bold') return '700';
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? (`${parsed}` as TextStyleFontWeight) : '400';
}

function createBitmapTextNode(text: string, style: BitmapStyle) {
  const label = new BitmapText({
    text,
    style: {
      fontFamily: style.fontFamily ?? 'Segoe UI',
      fontSize: style.fontSize ?? 14,
      fontWeight: normalizeFontWeight(style.fontWeight),
      align: style.align ?? 'left',
      fill: style.fill ?? 0xffffff
    }
  });
  return label;
}

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
  variantDropdownRef?.cleanup?.();
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

  const yBtn = Math.round(padding + 10);
  const controlBtnWidth = 100;
  const controlBtnGap = 10;
  const saveBtnWidth = 110;
  const dropdownWidth = 200;
  const itemHeight = 36;
  const totalWidth =
    dropdownWidth +
    controlBtnGap +
    3 * controlBtnWidth +
    3 * controlBtnGap +
    saveBtnWidth;
  let xCursor = Math.round((w - totalWidth) / 2);

  variantDropdownRef = makeVariantDropdown(xCursor, yBtn, dropdownWidth, itemHeight);
  uiLayer.addChild(variantDropdownRef);
  xCursor += dropdownWidth + controlBtnGap;

  const controls = [
    {
      label: 'Nouveau',
      action: () => {
        promptBehaviorName(currentDescriptor?.label ?? 'Nouveau BT', (name) => {
          if (!name) return;
          const fresh = createEmptyDescriptor();
          fresh.label = name;
          currentDescriptor = validateDescriptor(fresh);
          upsertBehaviorDescriptor(currentDescriptor);
          hasUnsavedChanges = false;
          redrawTree();
          refreshVariantOptions();
          updateVariantSelectionUI();
          updateSaveButton();
        });
      }
    },
    {
      label: 'Dupliquer',
      action: () => {
        const clone = JSON.parse(JSON.stringify(currentDescriptor)) as BehaviorDescriptor;
        clone.id = generateBehaviorId('copy');
        clone.label = `${clone.label} (copie)`;
        currentDescriptor = validateDescriptor(clone);
        upsertBehaviorDescriptor(currentDescriptor);
        hasUnsavedChanges = false;
        redrawTree();
        refreshVariantOptions();
        updateVariantSelectionUI();
        updateSaveButton();
      }
    },
    {
      label: 'Supprimer',
      action: () => {
        const all = listBehaviorOptions();
        if (all.length <= 1) return;
        deleteBehaviorDescriptor(currentDescriptor.id);
        const remaining = listBehaviorOptions().filter((o) => o.id !== currentDescriptor.id);
        const nextId = remaining[0]?.id ?? listBehaviorOptions()[0]?.id;
        const next = nextId ? getBehaviorDescriptor(nextId) : null;
        if (next) currentDescriptor = next;
        hasUnsavedChanges = false;
        redrawTree();
        refreshVariantOptions();
        updateVariantSelectionUI();
        updateSaveButton();
      }
    }
  ];
  for (const btn of controls) {
    const b = makeButton(btn.label, xCursor, yBtn, controlBtnWidth, itemHeight, btn.action);
    uiLayer.addChild(b.container);
    xCursor += controlBtnWidth + controlBtnGap;
  }

  const saveBtn = makeButton('Enregistrer', xCursor, yBtn, saveBtnWidth, itemHeight, () => {
    saveCurrentDescriptor();
  }, hasUnsavedChanges);
  saveButtonRef = saveBtn;
  uiLayer.addChild(saveBtn.container);

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
    const title = createBitmapTextNode(cat.title, { fill: 0x92b5ff, fontSize: 12, fontWeight: '700' });
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

  if (activeNamePrompt) {
    uiLayer.addChild(activeNamePrompt);
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

  const badge = createBitmapTextNode(shortType(node), { fill: 0x9bb5e8, fontSize: 11, fontWeight: '700' });
  badge.position.set(
    x + indent + 12,
    y + (nodeHeight - badge.height) / 2
  );

  const title = createBitmapTextNode(nodeLabel(node), { fill: 0xdfe8ff, fontSize: 14, fontWeight: '600' });
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
    const cross = createBitmapTextNode('✕', { fill: 0xaec2e8, fontSize: 12, fontWeight: '700' });
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
  markDirty();
  redrawTree();
}

function insertNodeAt(parentPath: number[], insertIndex: number, node: BTNodeDef) {
  const parent = getNodeAtPath(parentPath);
  if (!isComposite(parent)) return;
  parent.children.splice(insertIndex, 0, node);
  selectedPath = [...parentPath, insertIndex];
  dropPreview = null;
  markDirty();
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
  container.eventMode = 'static';
  container.cursor = 'pointer';
  container.hitArea = new Rectangle(0, 0, w, h);
  container.on('pointerdown', (e) => {
    e.stopPropagation();
    onClick();
  });
  const bg = new Graphics();
  const txt = createBitmapTextNode(label, { fill: primary ? 0x0b0f18 : 0xdfe8ff, fontSize: 13, fontWeight: '600' });
  txt.position.set(w / 2 - txt.width / 2, h / 2 - txt.height / 2);
  const applyStyle = (isPrimary: boolean) => {
    bg.clear();
    bg.roundRect(0, 0, w, h, 10);
    bg.fill({
      color: isPrimary ? 0x4da3ff : 0x1a2030,
      alpha: isPrimary ? 1 : hollow ? 0.1 : 0.3
    });
    bg.stroke({ width: 1, color: isPrimary ? 0x4da3ff : 0x2a3343, alpha: hollow ? 0.5 : 0.6 });
    txt.tint = isPrimary ? 0x0b0f18 : 0xdfe8ff;
  };
  applyStyle(primary);
  container.addChild(bg, txt);
  return { container, bg, txt, setPrimary: (isPrimary: boolean) => applyStyle(isPrimary) };
}

function applyEllipsis(text: BitmapText, fullText: string, maxWidth: number) {
  const data = text as BitmapText & { _fullText?: string; _isTruncated?: boolean };
  data._fullText = fullText;
  data.text = fullText;
  if (text.width <= maxWidth) {
    data._isTruncated = false;
    return false;
  }
  const ellipsis = '…';
  let trimmed = fullText;
  while (trimmed.length > 0) {
    trimmed = trimmed.slice(0, -1);
    text.text = trimmed + ellipsis;
    if (text.width <= maxWidth) {
      data._isTruncated = true;
      return true;
    }
  }
  text.text = ellipsis;
  data._isTruncated = true;
  return true;
}

function makeVariantDropdown(
  x: number,
  y: number,
  w: number,
  h: number
) {
  const container = new Container() as Container & {
    setSelected?: (desc: BehaviorDescriptor) => void;
    refreshOptions?: () => void;
    syncSelection?: () => void;
    openMenu?: () => void;
    closeMenu?: () => void;
    cleanup?: () => void;
  };
  container.position.set(x, y);
  type FocusMode = 'none' | 'mouse' | 'keyboard';
  const state = {
    menuOpen: false,
    menuPhase: 'closed' as 'closed' | 'opening' | 'open' | 'closing',
    focusMode: 'none' as FocusMode,
    focusedIndex: -1,
    hoveredIndex: -1,
    lastPointer: { x: -1, y: -1 }
  };
  let dropdownHover = false;
  dropdownHover = state.focusMode !== 'none';

  const bg = new Graphics();

  const label = createBitmapTextNode(currentDescriptor.label ?? 'Variantes', {
    fill: 0xdfe8ff,
    fontSize: 13,
    fontWeight: '600'
  });
  label.position.set(12, h / 2 - label.height / 2);
  let labelFull = currentDescriptor.label ?? 'Variantes';
  let labelTruncated = applyEllipsis(label, labelFull, w - 40);
  container.addChild(label);

  const caret = new Graphics();
  const caretX = w - 24;
  const caretY = h / 2 - 2;
  const caretHeight = 8;
  const caretCenterX = caretX + 6;
  const caretCenterY = caretY + caretHeight / 2;
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
  const mixColor = (a: number, b: number, t: number) => {
    const ar = (a >> 16) & 0xff;
    const ag = (a >> 8) & 0xff;
    const ab = a & 0xff;
    const br = (b >> 16) & 0xff;
    const bg = (b >> 8) & 0xff;
    const bb = b & 0xff;
    const rr = Math.round(lerp(ar, br, t));
    const rg = Math.round(lerp(ag, bg, t));
    const rb = Math.round(lerp(ab, bb, t));
    return (rr << 16) | (rg << 8) | rb;
  };
  let fieldFocusMix = 0;
  let fieldFocusRaf = 0;
  const fieldFocusAnim = { active: false, start: 0, duration: 180, from: 0, to: 0 };
  const fieldGroup = new Container();
  fieldGroup.pivot.set(w / 2, h / 2);
  fieldGroup.position.set(w / 2, h / 2);
  const clickGlow = new Graphics();
  clickGlow.eventMode = 'none';
  clickGlow.alpha = 0;
  const drawClickGlow = () => {
    clickGlow.clear();
    clickGlow.roundRect(-1, -1, w + 2, h + 2, 12);
    clickGlow.fill({ color: 0x5aa7ff, alpha: 0.18 });
    clickGlow.stroke({ width: 1, color: 0x5aa7ff, alpha: 0.6 });
  };
  drawClickGlow();
  const caretAnimState = {
    angle: 0,
    target: 0,
    animating: false,
    rafId: 0,
    draw: null as null | (() => void)
  };
  const caretAnimSpeed = 0.25;
  const tickCaret = () => {
    if (!caretAnimState.animating) return;
    const delta = caretAnimState.target - caretAnimState.angle;
    if (Math.abs(delta) <= 0.01) {
      caretAnimState.angle = caretAnimState.target;
      caretAnimState.animating = false;
    } else {
      caretAnimState.angle += delta * caretAnimSpeed;
    }
    if (caretAnimState.draw) caretAnimState.draw();
    if (caretAnimState.animating) {
      caretAnimState.rafId = requestAnimationFrame(tickCaret);
    }
  };
  const setCaretTarget = (open: boolean) => {
    caretAnimState.target = open ? Math.PI : 0;
    if (!caretAnimState.animating) {
      caretAnimState.animating = true;
      caretAnimState.rafId = requestAnimationFrame(tickCaret);
    }
  };
  const isFieldFocused = () => state.focusMode !== 'none' || state.menuOpen;
  const drawCaret = () => {
    const caretAngle = caretAnimState.angle;
    caret.clear();
    caret.moveTo(caretX, caretY);
    caret.lineTo(caretX + 12, caretY);
    caret.lineTo(caretX + 6, caretY + caretHeight);
    caret.lineTo(caretX, caretY);
    const baseColor = 0x9ab4e4;
    const focusColor = 0x5aa7ff;
    caret.fill({ color: mixColor(baseColor, focusColor, fieldFocusMix), alpha: 0.9 });
    caret.pivot.set(caretCenterX, caretCenterY);
    caret.position.set(caretCenterX, caretCenterY);
    caret.rotation = caretAngle;
  };

  const fieldGlow = new Graphics();
  fieldGlow.eventMode = 'none';
  fieldGlow.visible = true;
  fieldGlow.filters = [new BlurFilter({ strength: 8, quality: 4 })];
  const fieldEdge = new Graphics();
  fieldEdge.eventMode = 'none';
  const idleAnim = { active: false, start: 0, delay: 0, period: 2600 };
  let idlePulse = 0;
  let idleRaf = 0;
  let idleTimeout: number | null = null;
  const drawFieldGlow = () => {
    fieldGlow.clear();
    const inset = 6;
    const band = 4;
    fieldGlow.roundRect(inset, inset, w - inset * 2, band, 5);
    const baseAlpha = 0.3;
    const idleBoost = idleAnim.active ? idlePulse * 0.4 : 0;
    fieldGlow.fill({ color: 0x6aaeff, alpha: baseAlpha + idleBoost });

    fieldEdge.clear();
    fieldEdge.roundRect(6, h - 4, w - 12, 3, 6);
    fieldEdge.fill({ color: 0x0b111e, alpha: 0.5 });
  };

  const drawDropdown = () => {
    bg.clear();
    bg.roundRect(0, 0, w, h, 10);
    bg.fill({ color: 0x1a2030, alpha: lerp(0.4, 0.55, fieldFocusMix) });
    bg.stroke({ width: 1, color: mixColor(0x2a3343, 0x5aa7ff, fieldFocusMix), alpha: lerp(0.7, 0.9, fieldFocusMix) });
    drawCaret();
    drawFieldGlow();
  };
  const runFieldFocusAnim = () => {
    if (!fieldFocusAnim.active) {
      fieldFocusRaf = 0;
      return;
    }
    const now = performance.now();
    const raw = Math.min(1, (now - fieldFocusAnim.start) / fieldFocusAnim.duration);
    const eased = 1 - Math.pow(1 - raw, 3);
    fieldFocusMix = fieldFocusAnim.from + (fieldFocusAnim.to - fieldFocusAnim.from) * eased;
    drawDropdown();
    if (raw < 1) {
      fieldFocusRaf = requestAnimationFrame(runFieldFocusAnim);
      return;
    }
    fieldFocusMix = fieldFocusAnim.to;
    fieldFocusAnim.active = false;
    fieldFocusRaf = 0;
  };
  const setFieldFocus = (focused: boolean) => {
    const next = focused ? 1 : 0;
    if (fieldFocusAnim.active && fieldFocusAnim.to === next) return;
    if (!fieldFocusAnim.active && Math.abs(fieldFocusMix - next) < 0.001) return;
    fieldFocusAnim.active = true;
    fieldFocusAnim.start = performance.now();
    fieldFocusAnim.from = fieldFocusMix;
    fieldFocusAnim.to = next;
    if (!fieldFocusRaf) {
      fieldFocusRaf = requestAnimationFrame(runFieldFocusAnim);
    }
  };
  const clickAnim = { active: false, start: 0, duration: 240 };
  let clickRaf = 0;
  const runIdleAnim = () => {
    if (!idleAnim.active) {
      idleRaf = 0;
      return;
    }
    const now = performance.now();
    const t = (now - idleAnim.start) / idleAnim.period;
    idlePulse = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
    drawDropdown();
    idleRaf = requestAnimationFrame(runIdleAnim);
  };
  const startIdleAnim = () => {
    if (idleAnim.active) return;
    idleAnim.active = true;
    idleAnim.start = performance.now();
    if (!idleRaf) {
      idleRaf = requestAnimationFrame(runIdleAnim);
    }
  };
  const startIdleDelay = () => {
    if (idleAnim.active || idleTimeout) return;
    idleTimeout = window.setTimeout(() => {
      idleTimeout = null;
      if (!state.menuOpen && state.focusMode !== 'none') {
        startIdleAnim();
      }
    }, idleAnim.delay);
  };
  const refreshIdleDelay = () => {
    if (idleAnim.active) return;
    if (idleTimeout) {
      window.clearTimeout(idleTimeout);
      idleTimeout = null;
    }
    startIdleDelay();
  };
  const stopIdleAnim = () => {
    if (idleTimeout) {
      window.clearTimeout(idleTimeout);
      idleTimeout = null;
    }
    if (idleAnim.active) {
      idleAnim.active = false;
    }
    idlePulse = 0;
    if (idleRaf) {
      cancelAnimationFrame(idleRaf);
      idleRaf = 0;
    }
    drawDropdown();
  };
  const runClickAnim = () => {
    if (!clickAnim.active) {
      clickRaf = 0;
      return;
    }
    const now = performance.now();
    const t = Math.min(1, (now - clickAnim.start) / clickAnim.duration);
    const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
    const p1 = 0.35;
    const p2 = 0.75;
    let scale = 1;
    if (t < p1) {
      scale = lerp(1, 0.99, easeOut(t / p1));
    } else if (t < p2) {
      scale = lerp(0.99, 1.01, easeOut((t - p1) / (p2 - p1)));
    } else {
      scale = lerp(1.01, 1, easeOut((t - p2) / (1 - p2)));
    }
    const nudge = Math.sin(Math.PI * t) * 1;
    fieldGroup.scale.set(scale);
    fieldGroup.position.set(w / 2, h / 2 + nudge);
    clickGlow.alpha = Math.sin(Math.PI * t) * 0.45;
    if (t < 1) {
      clickRaf = requestAnimationFrame(runClickAnim);
      return;
    }
    clickAnim.active = false;
    clickGlow.alpha = 0;
    fieldGroup.scale.set(1);
    fieldGroup.position.set(w / 2, h / 2);
    clickRaf = 0;
    applyIntentIfReady();
  };
  const triggerClickAnim = () => {
    clickAnim.active = true;
    clickAnim.start = performance.now();
    if (!clickRaf) {
      clickRaf = requestAnimationFrame(runClickAnim);
    }
  };
  fieldFocusMix = isFieldFocused() ? 1 : 0;
  caretAnimState.draw = () => drawCaret();
  setCaretTarget(state.menuOpen);
  drawDropdown();
  fieldGroup.addChild(bg, clickGlow, fieldGlow, fieldEdge, label, caret);
  container.addChild(fieldGroup);

  const menu = new Container();
  menu.position.set(0, h + 6);
  menu.visible = false;
  container.addChild(menu);
  let menuMask!: Graphics;
  let menuContent!: Container;
  let menuBg!: Graphics;

  const tooltip = new Container();
  tooltip.visible = false;
  tooltip.zIndex = 9999;
  const tooltipBg = new Graphics();
  const tooltipText = createBitmapTextNode('', { fill: 0xdfe8ff, fontSize: 12, fontWeight: '500' });
  const tooltipMeasure = createBitmapTextNode('', { fill: 0xdfe8ff, fontSize: 12, fontWeight: '500' });
  tooltip.addChild(tooltipBg, tooltipText);
  uiLayer.addChild(tooltip);

  const measureWidth = (text: string) => {
    tooltipMeasure.text = text;
    return tooltipMeasure.width;
  };
  const wrapTooltipText = (content: string, maxWidth: number) => {
    const words = content.split(/\s+/).filter((word) => word.length > 0);
    const lines: string[] = [];
    let line = '';
    for (const word of words.length ? words : [content]) {
      const test = line ? `${line} ${word}` : word;
      if (measureWidth(test) <= maxWidth) {
        line = test;
        continue;
      }
      if (line) lines.push(line);
      if (measureWidth(word) <= maxWidth) {
        line = word;
        continue;
      }
      let chunk = '';
      for (const ch of word) {
        const next = chunk + ch;
        if (measureWidth(next) > maxWidth && chunk.length > 0) {
          lines.push(chunk);
          chunk = ch;
        } else {
          chunk = next;
        }
      }
      line = chunk;
    }
    if (line) lines.push(line);
    return lines.join('\n');
  };

  const rectFromBounds = (bounds: { x: number; y: number; width: number; height: number }) => ({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height
  });

  const rectFromDisplayObject = (obj: Container) => rectFromBounds(obj.getBounds());
  const getFieldBoundsRect = () => rectFromBounds(bg.getBounds());

  const tooltipLayout = {
    padding: 8,
    margin: 10,
    gap: 10,
    radius: 8,
    arrowSize: 6,
    arrowWidth: 12,
    minWidth: 140,
    maxWidth: 320
  };
  const tooltipState = {
    visible: false,
    currentX: 0,
    currentY: 0,
    side: 'top' as 'top' | 'bottom' | 'left' | 'right',
    rectX: 0,
    rectY: 0,
    baseW: 0,
    baseH: 0,
    anchor: null as { x: number; y: number; width: number; height: number } | null
  };
  const hideTooltip = () => {
    tooltipState.visible = false;
    tooltipState.anchor = null;
    tooltip.visible = false;
  };

  const drawTooltipAt = () => {
    if (!tooltipState.anchor) return;
    const { currentX, currentY, rectX, rectY, baseW, baseH, side } = tooltipState;
    const { padding, radius, arrowSize, arrowWidth } = tooltipLayout;
    const ax = tooltipState.anchor.x + tooltipState.anchor.width / 2;
    const ay = tooltipState.anchor.y + tooltipState.anchor.height / 2;
    tooltip.position.set(currentX, currentY);
    tooltipBg.clear();
    tooltipBg.roundRect(rectX, rectY, baseW, baseH, radius);
    tooltipBg.fill({ color: 0x101521, alpha: 0.95 });
    tooltipBg.stroke({ width: 1, color: 0x4da3ff, alpha: 0.6 });
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
    const clampX = (v: number) => clamp(v, rectX + radius + arrowWidth / 2, rectX + baseW - radius - arrowWidth / 2);
    const clampY = (v: number) => clamp(v, rectY + radius + arrowWidth / 2, rectY + baseH - radius - arrowWidth / 2);
    const localAx = ax - currentX;
    const localAy = ay - currentY;
    if (side === 'top') {
      const arrowX = clampX(localAx);
      const y = rectY + baseH;
      tooltipBg.moveTo(arrowX - arrowWidth / 2, y);
      tooltipBg.lineTo(arrowX + arrowWidth / 2, y);
      tooltipBg.lineTo(arrowX, y + arrowSize);
      tooltipBg.closePath();
      tooltipBg.fill({ color: 0x101521, alpha: 0.95 });
      tooltipBg.stroke({ width: 1, color: 0x4da3ff, alpha: 0.6 });
    } else if (side === 'bottom') {
      const arrowX = clampX(localAx);
      const y = rectY;
      tooltipBg.moveTo(arrowX - arrowWidth / 2, y);
      tooltipBg.lineTo(arrowX + arrowWidth / 2, y);
      tooltipBg.lineTo(arrowX, y - arrowSize);
      tooltipBg.closePath();
      tooltipBg.fill({ color: 0x101521, alpha: 0.95 });
      tooltipBg.stroke({ width: 1, color: 0x4da3ff, alpha: 0.6 });
    } else if (side === 'left') {
      const arrowY = clampY(localAy);
      const x = rectX + baseW;
      tooltipBg.moveTo(x, arrowY - arrowWidth / 2);
      tooltipBg.lineTo(x, arrowY + arrowWidth / 2);
      tooltipBg.lineTo(x + arrowSize, arrowY);
      tooltipBg.closePath();
      tooltipBg.fill({ color: 0x101521, alpha: 0.95 });
      tooltipBg.stroke({ width: 1, color: 0x4da3ff, alpha: 0.6 });
    } else {
      const arrowY = clampY(localAy);
      const x = rectX;
      tooltipBg.moveTo(x, arrowY - arrowWidth / 2);
      tooltipBg.lineTo(x, arrowY + arrowWidth / 2);
      tooltipBg.lineTo(x - arrowSize, arrowY);
      tooltipBg.closePath();
      tooltipBg.fill({ color: 0x101521, alpha: 0.95 });
      tooltipBg.stroke({ width: 1, color: 0x4da3ff, alpha: 0.6 });
    }
    tooltipText.position.set(rectX + padding, rectY + padding);
    tooltip.visible = true;
  };

  type TooltipSide = 'top' | 'bottom' | 'left' | 'right';
  type Rect = { x: number; y: number; width: number; height: number };
  type TooltipCandidate = {
    side: TooltipSide;
    x: number;
    y: number;
    w: number;
    h: number;
    rectX: number;
    rectY: number;
  };

  const rectOverlapArea = (a: Rect, b: Rect) => {
    const overlapW = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
    const overlapH = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    return overlapW * overlapH;
  };

  const getDropdownAvoidRects = (): Rect[] => {
    const rects: Rect[] = [getFieldBoundsRect()];
    if (menu.visible) {
      rects.push(rectFromBounds(menuBg.getBounds()));
    }
    return rects;
  };

  const candidateCenter = (candidate: TooltipCandidate, bodyW: number, bodyH: number) => ({
    x: candidate.x + candidate.rectX + bodyW / 2,
    y: candidate.y + candidate.rectY + bodyH / 2
  });

  const showTooltip = (
    content: string,
    anchor: { x: number; y: number; width: number; height: number },
    opts?: { avoidRects?: Rect[] }
  ) => {
    const screen = app.screen;
    const maxWidth = Math.max(tooltipLayout.minWidth, Math.min(tooltipLayout.maxWidth, screen.width));
    tooltipText.text = wrapTooltipText(content, maxWidth - tooltipLayout.padding * 2);
    const baseW = tooltipText.width + tooltipLayout.padding * 2;
    const baseH = tooltipText.height + tooltipLayout.padding * 2;
    if (baseW > screen.width || baseH > screen.height) {
      hideTooltip();
      return;
    }
    const { gap, arrowSize } = tooltipLayout;
    const ax = anchor.x + anchor.width / 2;
    const ay = anchor.y + anchor.height / 2;
    const candidates: TooltipCandidate[] = [
      {
        side: 'top',
        x: ax - baseW / 2,
        y: anchor.y - gap - (baseH + arrowSize),
        w: baseW,
        h: baseH + arrowSize,
        rectX: 0,
        rectY: 0
      },
      {
        side: 'bottom',
        x: ax - baseW / 2,
        y: anchor.y + anchor.height + gap,
        w: baseW,
        h: baseH + arrowSize,
        rectX: 0,
        rectY: arrowSize
      },
      {
        side: 'right',
        x: anchor.x + anchor.width + gap,
        y: ay - baseH / 2,
        w: baseW + arrowSize,
        h: baseH,
        rectX: arrowSize,
        rectY: 0
      },
      {
        side: 'left',
        x: anchor.x - gap - (baseW + arrowSize),
        y: ay - baseH / 2,
        w: baseW + arrowSize,
        h: baseH,
        rectX: 0,
        rectY: 0
      }
    ];

    const fits = (candidate: TooltipCandidate) =>
      candidate.x >= 0 &&
      candidate.y >= 0 &&
      candidate.x + candidate.w <= screen.width &&
      candidate.y + candidate.h <= screen.height;

    let pool = candidates.filter(fits);
    if (!pool.length) {
      hideTooltip();
      return;
    }

    const avoidRects = opts?.avoidRects ?? [];
    const overlapFor = (candidate: TooltipCandidate) => {
      if (!avoidRects.length) return 0;
      const rect = {
        x: candidate.x + candidate.rectX,
        y: candidate.y + candidate.rectY,
        width: baseW,
        height: baseH
      };
      return avoidRects.reduce((sum, avoid) => sum + rectOverlapArea(rect, avoid), 0);
    };
    const overlaps = pool.map(overlapFor);
    const minOverlap = Math.min(...overlaps);
    pool = pool.filter((candidate) => Math.abs(overlapFor(candidate) - minOverlap) < 0.01);

    const canvasCenter = { x: screen.width / 2, y: screen.height / 2 };
    let chosen = pool[0];
    let bestDist = Math.hypot(
      candidateCenter(chosen, baseW, baseH).x - canvasCenter.x,
      candidateCenter(chosen, baseW, baseH).y - canvasCenter.y
    );
    for (let i = 1; i < pool.length; i += 1) {
      const candidate = pool[i];
      const dist = Math.hypot(
        candidateCenter(candidate, baseW, baseH).x - canvasCenter.x,
        candidateCenter(candidate, baseW, baseH).y - canvasCenter.y
      );
      if (dist < bestDist) {
        chosen = candidate;
        bestDist = dist;
      }
    }

    tooltipState.anchor = anchor;
    tooltipState.baseW = baseW;
    tooltipState.baseH = baseH;
    tooltipState.rectX = chosen.rectX;
    tooltipState.rectY = chosen.rectY;
    tooltipState.side = chosen.side;
    tooltipState.currentX = chosen.x;
    tooltipState.currentY = chosen.y;
    tooltipState.visible = true;
    drawTooltipAt();
  };

  type TooltipTarget = { kind: 'none' } | { kind: 'field' } | { kind: 'item'; index: number };
  type TooltipIntent =
    | { type: 'show'; target: TooltipTarget; ready: () => boolean }
    | { type: 'hide' };

  let tooltipIntent: TooltipIntent = { type: 'hide' };

  const requestTooltipIntent = (intent: TooltipIntent) => {
    tooltipIntent = intent;
    applyIntentIfReady();
  };

  const requestHideIntent = () => {
    requestTooltipIntent({ type: 'hide' });
  };

  const requestFieldIntent = () => {
    requestTooltipIntent({
      type: 'show',
      target: { kind: 'field' },
      ready: () => {
        if (!labelTruncated) return false;
        if (state.menuPhase === 'opening' || state.menuPhase === 'closing') return false;
        if (state.menuPhase === 'closed' && state.focusMode === 'none') return false;
        if (state.menuPhase === 'closed') return !clickAnim.active;
        return true;
      }
    });
  };

  const requestItemIntent = (idx: number) => {
    requestTooltipIntent({
      type: 'show',
      target: { kind: 'item', index: idx },
      ready: () =>
        state.menuPhase === 'open' &&
        menu.visible &&
        idx >= 0 &&
        idx < menuOptions.length &&
        menuTruncatedFlags[idx] &&
        !!menuItemBoundsGetters[idx] &&
        menuHoverProgress[idx] >= 0.99
    });
  };

  const applyIntentIfReady = () => {
    if (tooltipIntent.type === 'hide') {
      hideTooltip();
      return;
    }
    if (!tooltipIntent.ready()) {
      hideTooltip();
      return;
    }
    const { target } = tooltipIntent;
    if (target.kind === 'field') {
      showTooltip(labelFull, getFieldBoundsRect());
      return;
    }
    if (target.kind === 'item') {
      const idx = target.index;
      showTooltip(menuLabels[idx], menuItemBoundsGetters[idx]());
    }
  };

    const updateFocusFromPoint = (px: number, py: number) => {
    const bounds = bg.getBounds();
    const inside =
      px >= bounds.x &&
      px <= bounds.x + bounds.width &&
      py >= bounds.y &&
      py <= bounds.y + bounds.height;
    if (!state.menuOpen) {
      state.focusMode = inside ? 'mouse' : 'none';
      setFieldFocus(isFieldFocused());
    }
  };

  const syncHoverFromPointer = () => {
    if (state.focusMode === 'keyboard' && !state.menuOpen) {
      setFieldFocus(true);
      return;
    }
    if (state.lastPointer.x < 0) return;
    const bounds = bg.getBounds();
    dropdownHover =
      state.lastPointer.x >= bounds.x &&
      state.lastPointer.x <= bounds.x + bounds.width &&
      state.lastPointer.y >= bounds.y &&
      state.lastPointer.y <= bounds.y + bounds.height;
    state.focusMode = dropdownHover ? 'mouse' : 'none';
    setFieldFocus(isFieldFocused());
  };

  let windowPointerMoveHandler: ((e: PointerEvent) => void) | null = null;
  let windowPointerDownHandler: ((e: PointerEvent) => void) | null = null;
  let windowKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  const isPrimaryClick = (e: any) => {
    const btn =
      e?.button ??
      e?.data?.button ??
      e?.data?.originalEvent?.button ??
      e?.originalEvent?.button;
    return btn === undefined || btn === 0;
  };

  const resolveCursorAtPoint = (px: number, py: number) => {
    const boundary = app.renderer.events?.rootBoundary;
    if (!boundary) return 'default';
    let target = boundary.hitTest(px, py) as Container | null;
    while (target) {
      if (target === menu) {
        return 'default';
      }
      const cursor = (target as { cursor?: string }).cursor;
      if (cursor) {
        return cursor;
      }
      target = target.parent;
    }
    return 'default';
  };

  const itemHeight = 34;
  let menuWheelHandler: ((e: WheelEvent) => void) | null = null;
  let menuDragHandler: ((e: PointerEvent) => void) | null = null;
  let menuDragEndHandler: ((e: PointerEvent) => void) | null = null;
  let menuKeyHandler: ((e: KeyboardEvent) => void) | null = null;
  let menuPointerMoveHandler: ((e: PointerEvent) => void) | null = null;
  let menuFocusIndex = -1;
  let menuOptions: ReturnType<typeof listBehaviorOptions> = [];
  let menuItemBoundsGetters: Array<() => { x: number; y: number; width: number; height: number }> = [];
  let menuTruncatedFlags: boolean[] = [];
  let menuLabels: string[] = [];
  let menuHoverProgress: number[] = [];
  let menuItemNodes: Container[] = [];
  let menuLayout = { menuHeight: 0, menuPad: 0, scrollY: 0 };
  let applyMenuFocus: (idx: number, animate?: boolean) => void = (idx) => {
    menuFocusIndex = idx;
  };
  const rebuildMenu = () => {
    menu.removeChildren();
    const options = listBehaviorOptions();
    menuOptions = options;
    menuItemBoundsGetters = [];
    menuTruncatedFlags = [];
    menuLabels = [];
    menuHoverProgress = [];
    menuItemNodes = [];
    const menuPad = 6;
    const contentHeight = options.length * itemHeight + menuPad * 2 - 6;
    const maxMenuHeight = 320;
    const menuHeight = Math.min(contentHeight, maxMenuHeight);
    menu.sortableChildren = true;
    menu.eventMode = 'static';
    menu.hitArea = new Rectangle(0, 0, w, menuHeight);
    menu.on('pointerdown', (e: any) => {
      e.stopPropagation();
      if (!isPrimaryClick(e)) return;
      const global = e.global ?? { x: 0, y: 0 };
      const local = menu.toLocal(global);
      const idx = hitItemIndex(local.x, local.y + scrollY);
      const px = global.x;
      const py = global.y;
      const cursor = idx >= 0 || isPointerOnScrollbar(px, py) ? 'pointer' : 'default';
      app.renderer.events.setCursor(cursor);
      requestAnimationFrame(() => {
        app.renderer.events.setCursor(cursor);
      });
      if (idx >= 0) {
        applyMenuFocus(idx, false);
      }
    });

    const menuRadius = 12;
    const menuBgColor = 0x1b2232;
    const baseMenuWidth = w;
    const menuShadow = new Graphics();
    menuShadow.filters = [new BlurFilter(16)];
    menuShadow.position.set(0, 6);
    menuShadow.eventMode = 'none';
    menuShadow.zIndex = 0;
    menu.addChild(menuShadow);

    menuBg = new Graphics();
    menuBg.eventMode = 'none';
    menuBg.zIndex = 1;
    menu.addChild(menuBg);

    const menuGlow = new Graphics();
    menuGlow.eventMode = 'none';
    menuGlow.zIndex = 2;
    menu.addChild(menuGlow);

    menuMask = new Graphics();
    menuMask.eventMode = 'none';
    menu.addChild(menuMask);

    const redrawMenuChrome = (menuWidth: number) => {
      menuShadow.clear();
      menuShadow.roundRect(-6, -4, menuWidth + 12, menuHeight + 12, menuRadius + 4);
      menuShadow.fill({ color: 0x000000, alpha: 0.6 });
      menuBg.clear();
      menuBg.roundRect(0, 0, menuWidth, menuHeight, menuRadius);
      menuBg.fill({ color: menuBgColor, alpha: 0.98 });
      menuGlow.clear();
      menuGlow.roundRect(1.5, 1.5, menuWidth - 3, menuHeight - 3, menuRadius - 2);
      menuGlow.stroke({ width: 1, color: 0x6ea8ff, alpha: 0.08 });
      menuMask.clear();
      menuMask.roundRect(0, 0, menuWidth, menuHeight, menuRadius);
      menuMask.fill({ color: 0xffffff, alpha: 1 });
    };
    redrawMenuChrome(w);

    menuContent = new Container();
    menuContent.mask = menuMask;
    menuContent.zIndex = 3;
    menu.addChild(menuContent);

    let scrollY = 0;
    const maxScroll = Math.max(0, contentHeight - menuHeight);
    const itemRightPad = maxScroll > 0 ? 14 : 0;
    let thumb: Graphics | null = null;
    let track: Graphics | null = null;
    const trackBaseWidth = 4;
    const trackHoverWidth = 8;
    let trackWidth = trackBaseWidth;
    let trackX = 0;
    let trackTarget = trackBaseWidth;
    let trackRaf = 0;
    let trackHoverActive = false;
    const trackPad = 6;
    const trackInset = 1;
    const trackRightInset = 4;
    const trackHeight = Math.max(0, menuHeight - trackPad * 2);
    const trackInnerY = trackPad + trackInset;
    const trackInnerHeight = Math.max(0, trackHeight - trackInset * 2);
    const thumbMinHeight = 18;
    const thumbHeight = maxScroll > 0
      ? Math.max(thumbMinHeight, (menuHeight / contentHeight) * trackInnerHeight)
      : trackInnerHeight;

    const updateThumb = () => {
      if (!thumb || maxScroll <= 0) return;
      const ratio = scrollY / maxScroll;
      const available = trackInnerHeight - thumbHeight;
      thumb.y = trackInnerY + ratio * available;
      thumb.hitArea = new Rectangle(0, 0, trackWidth, thumbHeight);
    };

    const applyScroll = () => {
      scrollY = Math.max(0, Math.min(maxScroll, scrollY));
      menuContent.y = -scrollY;
      updateThumb();
    };
    applyScroll();
    const updateMenuLayout = () => {
      menuLayout.menuHeight = menuHeight;
      menuLayout.menuPad = menuPad;
      menuLayout.scrollY = scrollY;
    };
    updateMenuLayout();

    const drawFns: Array<(focused: boolean) => void> = [];
    const hoverSetters: Array<(t: number) => void> = [];
    let selectedIndex = -1;
    let focusedIndex = -1;
    const itemInset = 4;
    const itemInnerHeight = itemHeight - 6;
    const itemX = itemInset;
    const itemWidth = w - 8 - itemRightPad;
    const markerWidth = 2;
    const hoverShift = 3;
    const ghostHighlight = new Graphics();
    ghostHighlight.eventMode = 'none';
    ghostHighlight.visible = false;
    ghostHighlight.zIndex = 0;
    ghostHighlight.roundPixels = false;
    menuContent.sortableChildren = true;
    menuContent.addChild(ghostHighlight);
    const hoverDuration = 250;
    const ghostDuration = 120;
    const ghostAnim = {
      active: false,
      start: 0,
      duration: ghostDuration,
      startY: 0,
      endY: 0,
    };
    let ghostRaf = 0;

    const drawGhost = () => {
      ghostHighlight.clear();
      ghostHighlight.roundRect(itemInset, 0, itemWidth, itemInnerHeight, 8);
      ghostHighlight.fill({ color: 0x2b3a56, alpha: 0.28 });
      ghostHighlight.stroke({ width: 1, color: 0x5aa7ff, alpha: 0.18 });
    };
    drawGhost();

    const easeInOut = (t: number) => t * t * (3 - 2 * t);
    const runGhostAnim = () => {
      if (!ghostAnim.active) {
        ghostRaf = 0;
        return;
      }
      const now = performance.now();
      const raw = Math.min(1, (now - ghostAnim.start) / ghostAnim.duration);
      const eased = easeInOut(raw);
      ghostHighlight.y = ghostAnim.startY + (ghostAnim.endY - ghostAnim.startY) * eased;
      if (raw < 1) {
        ghostRaf = requestAnimationFrame(runGhostAnim);
        return;
      }
      ghostAnim.active = false;
      ghostHighlight.visible = false;
      ghostRaf = 0;
    };

    const startGhostSlide = (fromIndex: number, toIndex: number) => {
      if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return;
      ghostHighlight.visible = true;
      ghostHighlight.y = menuPad + fromIndex * itemHeight;
      ghostAnim.active = true;
      ghostAnim.start = performance.now();
      ghostAnim.startY = ghostHighlight.y;
      ghostAnim.endY = menuPad + toIndex * itemHeight;
      if (!ghostRaf) {
        ghostRaf = requestAnimationFrame(runGhostAnim);
      }
    };

    const hitItemIndex = (localX: number, localY: number) => {
      if (localX < itemX || localX > itemX + itemWidth) return -1;
      const offsetY = localY - menuPad;
      if (offsetY < 0) return -1;
      const idx = Math.floor(offsetY / itemHeight);
      const itemTop = menuPad + idx * itemHeight;
      const itemBottom = itemTop + itemInnerHeight;
      if (idx < 0 || idx >= options.length) return -1;
      if (localY < itemTop || localY > itemBottom) return -1;
      return idx;
    };
    
    const isPointerOnScrollbar = (px: number, py: number) => {
      if (track) {
        const bounds = track.getBounds();
        if (px >= bounds.x && px <= bounds.x + bounds.width && py >= bounds.y && py <= bounds.y + bounds.height) {
          return true;
        }
      }
      if (thumb) {
        const bounds = thumb.getBounds();
        if (px >= bounds.x && px <= bounds.x + bounds.width && py >= bounds.y && py <= bounds.y + bounds.height) {
          return true;
        }
      }
      return false;
    };

    const setFocusIndex = (nextIndex: number, animate = true) => {
      if (focusedIndex === nextIndex) return;
      const prevIndex = focusedIndex;
      if (animate) {
        startGhostSlide(prevIndex, nextIndex);
      }
      if (focusedIndex >= 0 && drawFns[focusedIndex]) {
        drawFns[focusedIndex](false);
      }
      focusedIndex = nextIndex;
      if (focusedIndex >= 0 && drawFns[focusedIndex]) {
        drawFns[focusedIndex](true);
      }
      if (prevIndex >= 0 && hoverSetters[prevIndex]) {
        hoverSetters[prevIndex](0);
      }
      if (focusedIndex >= 0 && hoverSetters[focusedIndex]) {
        hoverSetters[focusedIndex](1);
      }
    };
    applyMenuFocus = (idx: number, animate = true) => {
      setFocusIndex(idx, animate);
      menuFocusIndex = idx;
    };

    options.forEach((opt, idx) => {
      const item = new Container();
      item.position.set(0, menuPad + idx * itemHeight);
      item.zIndex = 1;
      const isCurrent = opt.id === currentDescriptor.id;
      const btnBg = new Graphics();
      let hoverT = 0;
      let hoverTarget = 0;
      let hoverRaf = 0;
      let hoverAnimStart = 0;
      let hoverAnimFrom = 0;
      let hoverAnimTo = 0;
      const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
      const lerpColor = (a: number, b: number, t: number) => {
        const ar = (a >> 16) & 0xff;
        const ag = (a >> 8) & 0xff;
        const ab = a & 0xff;
        const br = (b >> 16) & 0xff;
        const bg = (b >> 8) & 0xff;
        const bb = b & 0xff;
        const rr = Math.round(lerp(ar, br, t));
        const rg = Math.round(lerp(ag, bg, t));
        const rb = Math.round(lerp(ab, bb, t));
        return (rr << 16) | (rg << 8) | rb;
      };
      const drawItemBg = () => {
        const t = hoverT;
        menuHoverProgress[idx] = t;
        btnBg.clear();
        btnBg.roundRect(0, 0, w - 8 - itemRightPad, itemInnerHeight, 8);
        if (t > 0) {
          const fillColor = lerpColor(menuBgColor, 0x2b3a56, t);
          const fillAlpha = lerp(0.0, 1.0, t);
          const strokeColor = lerpColor(menuBgColor, 0x5aa7ff, t);
          const strokeAlpha = lerp(0.0, 1.0, t);
          btnBg.fill({ color: fillColor, alpha: fillAlpha });
          btnBg.stroke({ width: 1, color: strokeColor, alpha: strokeAlpha });
        }
        btnBg.x = itemInset;
        item.x = hoverT * hoverShift;
      };
      const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
      const animateHover = () => {
        const raw = Math.min(1, (performance.now() - hoverAnimStart) / hoverDuration);
        const eased = easeOut(raw);
        hoverT = hoverAnimFrom + (hoverAnimTo - hoverAnimFrom) * eased;
        drawItemBg();
        if (raw < 1) {
          hoverRaf = requestAnimationFrame(animateHover);
          return;
        }
        hoverT = hoverAnimTo;
        hoverRaf = 0;
        drawItemBg();
        if (menu.visible && item.parent === menuContent && focusedIndex === idx) {
          if (menuTruncatedFlags[idx]) {
            requestItemIntent(idx);
          }
        }
      };
      const setHover = (next: number) => {
        hoverTarget = next;
        hoverAnimStart = performance.now();
        hoverAnimFrom = hoverT;
        hoverAnimTo = hoverTarget;
        if (!hoverRaf) {
          hoverRaf = requestAnimationFrame(animateHover);
        }
      };
      hoverSetters[idx] = setHover;
      drawItemBg();
      drawFns[idx] = drawItemBg;
      item.addChild(btnBg);

      const txt = createBitmapTextNode(opt.label, { fill: 0xdfe8ff, fontSize: 13, fontWeight: '500' });
      const textX = 10;
      txt.position.set(textX, (itemInnerHeight - txt.height) / 2);
      const truncated = applyEllipsis(txt, opt.label, w - 40 - itemRightPad);
      menuTruncatedFlags[idx] = truncated;
      menuLabels[idx] = opt.label;
      item.addChild(txt);

      if (isCurrent) selectedIndex = idx;
      if (isCurrent) {
        const marker = new Graphics();
        const markerY = menuPad + idx * itemHeight;
        const markerH = itemInnerHeight;
        marker.roundRect(0, markerY, markerWidth, markerH, 2);
        marker.fill({ color: 0x8bb9ff, alpha: 0.9 });
        marker.eventMode = 'none';
        menuContent.addChild(marker);
      }

      item.eventMode = 'static';
      item.cursor = 'pointer';
      menuItemBoundsGetters[idx] = () => rectFromDisplayObject(item);
      item.on('pointerover', () => {
        applyMenuFocus(idx);
      });
      item.on('pointertap', (evt: any) => {
        evt.stopPropagation();
        if (!isPrimaryClick(evt)) return;
        closeMenu('pointer');
        if (opt.id !== currentDescriptor.id) {
          requestVariantSwitch(opt.id);
        }
      });

      menuContent.addChild(item);
      menuItemNodes.push(item);
    });

    if (selectedIndex >= 0) {
      const itemTop = menuPad + selectedIndex * itemHeight;
      const itemCenter = itemTop + (itemHeight - 6) / 2;
      scrollY = itemCenter - menuHeight / 2;
      applyScroll();
      updateMenuLayout();
      setFocusIndex(selectedIndex);
      menuFocusIndex = selectedIndex;
    }

    if (maxScroll > 0) {
      const trackLocal = new Graphics();
      track = trackLocal;
      const drawTrack = () => {
        const trackAlpha = trackHoverActive ? 0.94 : 0.9;
        const trackStrokeAlpha = trackHoverActive ? 0.7 : 0.6;
        trackLocal.clear();
        trackLocal.roundRect(0, 0, trackWidth, trackHeight, 3);
        const trackColor = trackHoverActive ? 0x1f324a : 0x0b111e;
        const trackStrokeColor = trackHoverActive ? 0x3b577e : 0x223044;
        trackLocal.fill({ color: trackColor, alpha: trackAlpha });
        trackLocal.stroke({ width: 1, color: trackStrokeColor, alpha: trackStrokeAlpha });
      };
      trackLocal.eventMode = 'static';
      trackLocal.cursor = 'pointer';
      trackLocal.zIndex = 3;
      menu.addChild(trackLocal);

      thumb = new Graphics();
      const drawThumb = () => {
        const thumbColor = trackHoverActive ? 0x66b3ff : 0x4da3ff;
        const thumbAlpha = trackHoverActive ? 0.86 : 0.8;
        if (!thumb) return;
        thumb.clear();
        thumb.roundRect(0, 0, trackWidth, thumbHeight, 3);
        thumb.fill({ color: thumbColor, alpha: thumbAlpha });
      };
      thumb.eventMode = 'static';
      thumb.cursor = 'pointer';
      thumb.zIndex = 4;
      menu.addChild(thumb);
      const applyTrackWidth = () => {
        const extra = trackWidth - trackBaseWidth;
        const menuWidth = baseMenuWidth + extra;
        menu.x = 0;
        trackX = menuWidth - trackRightInset - trackWidth - extra / 2;
        menu.hitArea = new Rectangle(0, 0, menuWidth, menuHeight);
        redrawMenuChrome(menuWidth);
        trackLocal.position.set(trackX, trackPad);
        if (thumb) {
          thumb.position.set(trackX, thumb.y || trackInnerY);
        }
        drawTrack();
        drawThumb();
        trackLocal.hitArea = new Rectangle(0, 0, trackWidth, trackHeight);
        updateThumb();
      };
      const animateTrackWidth = () => {
        const delta = trackTarget - trackWidth;
        if (Math.abs(delta) <= 0.1) {
          trackWidth = trackTarget;
          trackRaf = 0;
          applyTrackWidth();
          return;
        }
        trackWidth += delta * 0.25;
        applyTrackWidth();
        trackRaf = requestAnimationFrame(animateTrackWidth);
      };
      const setTrackHover = (hover: boolean) => {
        trackHoverActive = hover;
        drawTrack();
        drawThumb();
        trackTarget = hover ? trackHoverWidth : trackBaseWidth;
        if (!trackRaf) {
          trackRaf = requestAnimationFrame(animateTrackWidth);
        }
      };
      applyTrackWidth();

      let dragging = false;
      let dragOffset = 0;

      const toLocalY = (e: PointerEvent) => {
        const local = menu.toLocal({ x: e.clientX, y: e.clientY });
        return local.y;
      };

      const setScrollFromThumb = (thumbY: number) => {
        const available = trackInnerHeight - thumbHeight;
        const clamped = Math.max(trackInnerY, Math.min(trackInnerY + available, thumbY));
        const ratio = available > 0 ? (clamped - trackInnerY) / available : 0;
        scrollY = ratio * maxScroll;
        applyScroll();
      };

      const onThumbDown = (e: PointerEvent) => {
        e.stopPropagation();
        if (!isPrimaryClick(e)) return;
        dragging = true;
        dragOffset = toLocalY(e) - (thumb?.y ?? 0);
        setTrackHover(true);
      };

      const onTrackDown = (e: PointerEvent) => {
        e.stopPropagation();
        if (!isPrimaryClick(e)) return;
        const clickY = toLocalY(e) - trackPad;
        setScrollFromThumb(clickY - thumbHeight / 2 + trackInnerY);
        setTrackHover(true);
      };

      const onDragMove = (e: PointerEvent) => {
        if (!dragging) return;
        const nextY = toLocalY(e) - dragOffset;
        setScrollFromThumb(nextY);
      };

      const onDragEnd = (e: PointerEvent) => {
        dragging = false;
        const local = menu.toLocal({ x: e.clientX, y: e.clientY });
        const insideTrack =
          local.x >= trackX &&
          local.x <= trackX + trackWidth &&
          local.y >= trackPad &&
          local.y <= trackPad + trackHeight;
        if (!insideTrack) {
          setTrackHover(false);
        }
      };

      trackLocal.on('pointerover', () => setTrackHover(true));
      trackLocal.on('pointerout', () => {
        if (!dragging) setTrackHover(false);
      });
      thumb.on('pointerover', () => setTrackHover(true));
      thumb.on('pointerout', () => {
        if (!dragging) setTrackHover(false);
      });
      thumb.on('pointerdown', onThumbDown);
      trackLocal.on('pointerdown', onTrackDown);

      if (menuDragHandler) {
        window.removeEventListener('pointermove', menuDragHandler);
      }
      if (menuDragEndHandler) {
        window.removeEventListener('pointerup', menuDragEndHandler);
      }
      menuDragHandler = onDragMove;
      menuDragEndHandler = onDragEnd;
    }

    const onMenuWheel = (e: WheelEvent) => {
      if (!menu.visible || maxScroll <= 0) return;
      const { x: px, y: py } = toCanvasPoint(e.clientX, e.clientY);
      const bounds = menu.getBounds();
      if (px < bounds.x || px > bounds.x + bounds.width || py < bounds.y || py > bounds.y + bounds.height) {
        return;
      }
      e.preventDefault();
      e.stopImmediatePropagation();
      scrollY += e.deltaY * 0.6;
      applyScroll();
      const local = menu.toLocal({ x: e.clientX, y: e.clientY });
      const localY = local.y + scrollY - menuPad;
      const idx = hitItemIndex(local.x, local.y + scrollY);
      if (idx >= 0 && idx < options.length) {
        app.renderer.events.setCursor('pointer');
        applyMenuFocus(idx);
        requestItemIntent(idx);
      } else {
        app.renderer.events.setCursor(isPointerOnScrollbar(px, py) ? 'pointer' : 'default');
        requestHideIntent();
      }
    };

    if (menuWheelHandler) {
      window.removeEventListener('wheel', menuWheelHandler, { capture: true } as AddEventListenerOptions);
    }
    menuWheelHandler = onMenuWheel;

    if (menuKeyHandler) {
      window.removeEventListener('keydown', menuKeyHandler);
    }
    menuKeyHandler = (e: KeyboardEvent) => {
      if (!menu.visible) return;
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter' && e.key !== 'Escape') return;
      e.preventDefault();
    if (e.key === 'Escape') {
        closeMenu('keyboard');
        return;
    }
    if (e.key === 'Enter') {
        const opts = listBehaviorOptions();
        if (menuFocusIndex >= 0 && menuFocusIndex < opts.length) {
          const opt = opts[menuFocusIndex];
          closeMenu('keyboard');
          if (opt.id !== currentDescriptor.id) requestVariantSwitch(opt.id);
          return;
        }
      }
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      const next = Math.max(0, Math.min(options.length - 1, menuFocusIndex + dir));
      applyMenuFocus(next);
      requestItemIntent(next);
      const itemTop = menuPad + next * itemHeight;
      const itemBottom = itemTop + (itemHeight - 6);
      const desiredTop = itemTop - menuPad;
      const desiredBottom = itemBottom + menuPad;
      if (desiredTop < scrollY) {
        scrollY = desiredTop;
      } else if (desiredBottom > scrollY + menuHeight) {
        scrollY = desiredBottom - menuHeight;
      }
      applyScroll();
    };

    if (menuPointerMoveHandler) {
      window.removeEventListener('pointermove', menuPointerMoveHandler);
    }
    menuPointerMoveHandler = (e: PointerEvent) => {
      if (!menu.visible) return;
      const { x: px, y: py } = toCanvasPoint(e.clientX, e.clientY);
      const local = menu.toLocal({ x: e.clientX, y: e.clientY });
      const fieldBounds = bg.getBounds();
        const overField =
          px >= fieldBounds.x &&
          px <= fieldBounds.x + fieldBounds.width &&
          py >= fieldBounds.y &&
          py <= fieldBounds.y + fieldBounds.height;
        if (local.x < 0 || local.x > w || local.y < 0 || local.y > menuHeight) {
          if (overField) {
            requestFieldIntent();
          } else {
            requestHideIntent();
          }
          return;
        }
        const idx = hitItemIndex(local.x, local.y + scrollY);
        if (idx >= 0) {
          applyMenuFocus(idx);
          requestItemIntent(idx);
          return;
        }
        requestHideIntent();
      };
  };

  rebuildMenu();

  let outsideHandler: ((e: PointerEvent) => void) | null = null;
  const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
  const easeIn = (t: number) => t * t * t;

  const animateMenu = (durationMs: number, onUpdate: (t: number) => void, onDone?: () => void) => {
    const start = performance.now();
    const step = (now: number) => {
      const raw = Math.min(1, (now - start) / durationMs);
      onUpdate(raw);
      if (raw < 1) {
        requestAnimationFrame(step);
      } else if (onDone) {
        onDone();
      }
    };
    requestAnimationFrame(step);
  };

  const menuItemStaggerMs = 10;
  const menuItemAnimMs = 200;
  let menuItemsFinishAt = 0;
  const animateMenuItems = (opening: boolean) => {
    const count = menuItemNodes.length;
    if (!count) return;
    const startIndex = Math.max(0, Math.floor(menuLayout.scrollY / itemHeight));
    const endIndex = Math.min(count - 1, Math.ceil((menuLayout.scrollY + menuLayout.menuHeight) / itemHeight));
    menuItemNodes.forEach((child, index) => {
      if (!opening) return;
      if (index < startIndex || index > endIndex) {
        child.alpha = 1;
        return;
      }
      child.alpha = 0;
      const delay = (index - startIndex) * menuItemStaggerMs;
      const start = performance.now() + delay;
      const duration = menuItemAnimMs;
      const from = opening ? 0 : 1;
      const to = opening ? 1 : 0;
      const step = (now: number) => {
        const raw = Math.min(1, Math.max(0, (now - start) / duration));
        child.alpha = from + (to - from) * easeOut(raw);
        if (raw < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
    const visibleCount = Math.max(1, endIndex - startIndex + 1);
    const totalDelay = Math.max(0, visibleCount - 1) * menuItemStaggerMs;
    menuItemsFinishAt = performance.now() + totalDelay + menuItemAnimMs;
  };

  const menuCloseAnim = {
    active: false,
    start: 0,
    duration: 160
  };
  let menuCloseSnapshot: Sprite | null = null;
  let menuCloseSnapshotTexture: Texture | null = null;

  const runMenuOpenAnimation = () => {
    state.menuPhase = 'opening';
    menu.visible = true;
    menu.alpha = 0;
    menu.scale.set(1);
    menu.y = h + 6;
    menu.filters = [];
    menuMask.scale.set(1);
    menuMask.position.set(0, 0);
    menu.alpha = 0;
    menu.scale.set(0.98);
    const startY = h + 2;
    const endY = h + 6;
    menu.y = startY;
    menuItemNodes.forEach((child) => {
      child.alpha = 0;
    });
    animateMenuItems(true);
    animateMenu(180, (t) => {
        const eased = easeOut(t);
        menu.alpha = eased;
        menu.scale.set(0.98 + 0.02 * eased);
        menu.y = startY + (endY - startY) * eased;
      },
      () => {
        const finishOpen = () => {
          if (state.menuPhase === 'opening') {
            state.menuPhase = 'open';
            applyIntentIfReady();
          }
        };
        const waitItems = () => {
          if (state.menuPhase !== 'opening') return;
          if (performance.now() >= menuItemsFinishAt) {
            finishOpen();
            return;
          }
          requestAnimationFrame(waitItems);
        };
        waitItems();
      }
    );
  };

  const runMenuCloseAnimation = (snapshot: Sprite) => {
    if (!menuCloseAnim.active) {
      menuCloseAnim.active = true;
      menuCloseAnim.start = performance.now();
    }
    const startY = snapshot.y;
    const endY = startY - 4;
    snapshot.visible = true;
    snapshot.alpha = 1;
    snapshot.scale.set(1);
    const step = (now: number) => {
      const raw = Math.min(1, (now - menuCloseAnim.start) / menuCloseAnim.duration);
      const eased = easeIn(raw);
      snapshot.alpha = 1 - eased;
      snapshot.scale.set(1 - 0.02 * eased);
      snapshot.y = startY + (endY - startY) * eased;
      if (raw < 1) {
        requestAnimationFrame(step);
        return;
      }
      menuCloseAnim.active = false;
      if (state.menuPhase === 'closing') {
        state.menuPhase = 'closed';
        applyIntentIfReady();
      }
      snapshot.visible = false;
      snapshot.alpha = 1;
      snapshot.scale.set(1);
      snapshot.y = h + 6;
      if (menuCloseSnapshotTexture) {
        menuCloseSnapshotTexture.destroy(true);
        menuCloseSnapshotTexture = null;
      }
      if (menuCloseSnapshot) {
        menuCloseSnapshot.removeFromParent();
        menuCloseSnapshot = null;
      }
    };
    requestAnimationFrame(step);
  };

  const closeMenu = (reason: 'pointer' | 'keyboard' | 'program' = 'program') => {
    state.menuOpen = false;
    state.menuPhase = 'closing';
    if (reason !== 'program') {
      triggerClickAnim();
    }
    setCaretTarget(false);
    if (reason !== 'keyboard') {
      syncHoverFromPointer();
    }
    app.renderer.events.setCursor('default');
    const resetCursorOnUp = () => {
      if (state.lastPointer.x >= 0) {
        app.renderer.events.setCursor(resolveCursorAtPoint(state.lastPointer.x, state.lastPointer.y));
      }
      window.removeEventListener('pointerup', resetCursorOnUp);
    };
    window.addEventListener('pointerup', resetCursorOnUp, { once: true });
    if (reason !== 'keyboard' && state.lastPointer.x >= 0) {
      const fieldBounds = bg.getBounds();
      const overField =
        state.lastPointer.x >= fieldBounds.x &&
        state.lastPointer.x <= fieldBounds.x + fieldBounds.width &&
        state.lastPointer.y >= fieldBounds.y &&
        state.lastPointer.y <= fieldBounds.y + fieldBounds.height;
      if (!overField) {
        state.focusMode = 'none';
        setFieldFocus(false);
      }
    }
    if (reason === 'keyboard') {
      state.focusMode = 'keyboard';
      setFieldFocus(true);
    }
    if (state.focusMode !== 'none') {
      refreshIdleDelay();
    } else {
      stopIdleAnim();
    }
    const bounds = menu.getLocalBounds();
    const globalPos = menu.getGlobalPosition();
    const texture = app.renderer.generateTexture(menu);
    const snapshot = new Sprite(texture);
    snapshot.position.set(globalPos.x + bounds.x, globalPos.y + bounds.y);
    snapshot.zIndex = 9000;
    snapshot.eventMode = 'none';
    menuCloseSnapshot = snapshot;
    menuCloseSnapshotTexture = texture;
    uiLayer.addChild(snapshot);
    menu.visible = false;
    if (state.lastPointer.x >= 0) {
      app.renderer.events.setCursor(resolveCursorAtPoint(state.lastPointer.x, state.lastPointer.y));
    }
    menuCloseAnim.active = false;
    if (outsideHandler) {
      window.removeEventListener('pointerdown', outsideHandler, { capture: true } as AddEventListenerOptions);
      outsideHandler = null;
    }
    if (menuWheelHandler) {
      window.removeEventListener('wheel', menuWheelHandler, { capture: true } as AddEventListenerOptions);
      menuWheelHandler = null;
    }
    if (menuDragHandler) {
      window.removeEventListener('pointermove', menuDragHandler);
      menuDragHandler = null;
    }
    if (menuDragEndHandler) {
      window.removeEventListener('pointerup', menuDragEndHandler);
      menuDragEndHandler = null;
    }
    if (menuKeyHandler) {
      window.removeEventListener('keydown', menuKeyHandler);
      menuKeyHandler = null;
    }
    if (menuPointerMoveHandler) {
      window.removeEventListener('pointermove', menuPointerMoveHandler);
      menuPointerMoveHandler = null;
    }
    requestFieldIntent();
    runMenuCloseAnimation(snapshot);
  };

  const handleOutside = (evt: PointerEvent) => {
    if (!isPrimaryClick(evt)) return;
    const { x: px, y: py } = toCanvasPoint(evt.clientX, evt.clientY);
    const bounds = bg.getBounds();
    const menuBounds = menu.getBounds();
    const left = Math.min(bounds.x, menuBounds.x);
    const right = Math.max(bounds.x + bounds.width, menuBounds.x + menuBounds.width);
    const top = Math.min(bounds.y, menuBounds.y);
    const bottom = Math.max(bounds.y + bounds.height, menuBounds.y + menuBounds.height);
    if (px < left || px > right || py < top || py > bottom) {
      closeMenu('pointer');
    }
  };

  const openMenu = (e?: any) => {
    if (state.menuOpen) {
      closeMenu('pointer');
      return;
    }
    triggerClickAnim();
    stopIdleAnim();
    if (e?.global) {
      setFieldFocus(true);
    }
    menu.visible = true;
    state.menuOpen = true;
    setCaretTarget(true);
    rebuildMenu();
    if (menuFocusIndex >= 0) {
      requestItemIntent(menuFocusIndex);
    } else {
      requestHideIntent();
    }
    runMenuOpenAnimation();
    outsideHandler = handleOutside;
    window.addEventListener('pointerdown', outsideHandler, { capture: true });
    if (menuWheelHandler) {
      window.addEventListener('wheel', menuWheelHandler, { capture: true, passive: false });
    }
    if (menuDragHandler) {
      window.addEventListener('pointermove', menuDragHandler);
    }
    if (menuDragEndHandler) {
      window.addEventListener('pointerup', menuDragEndHandler);
    }
    if (menuKeyHandler) {
      window.addEventListener('keydown', menuKeyHandler);
    }
    if (menuPointerMoveHandler) {
      window.addEventListener('pointermove', menuPointerMoveHandler);
    }
  };

  [bg, label, caret].forEach((sprite) => {
    sprite.eventMode = 'static';
    sprite.cursor = 'pointer';
    sprite.on('pointertap', (evt) => {
      evt.stopPropagation();
      if (!isPrimaryClick(evt)) return;
      openMenu(evt);
    });
  });

  bg.eventMode = 'static';

  container.openMenu = () => openMenu();
  container.closeMenu = () => closeMenu('program');
  const updateLabelFromDescriptor = (desc: BehaviorDescriptor) => {
    labelFull = desc.label ?? 'Variantes';
    label.text = labelFull;
    labelTruncated = applyEllipsis(label, labelFull, w - 40);
    label.position.set(12, h / 2 - label.height / 2);
    setFieldFocus(isFieldFocused());
    if (state.menuOpen) {
      rebuildMenu();
    }
  };
  container.setSelected = (desc: BehaviorDescriptor) => {
    updateLabelFromDescriptor(desc);
  };
  container.refreshOptions = () => {
    if (state.menuOpen) {
      rebuildMenu();
    }
  };
  container.syncSelection = () => {
    syncHoverFromPointer();
  };
  const handleWindowPointerMove = (e: PointerEvent) => {
    if (activeNamePrompt) return;
    const pos = toCanvasPoint(e.clientX, e.clientY);
    state.lastPointer = { x: pos.x, y: pos.y };
    if (state.menuOpen) return;
    const bounds = bg.getBounds();
    const inside =
      pos.x >= bounds.x &&
      pos.x <= bounds.x + bounds.width &&
      pos.y >= bounds.y &&
      pos.y <= bounds.y + bounds.height;
    dropdownHover = inside;
    const nextFocus = inside ? 'mouse' : 'none';
    if (state.focusMode !== nextFocus) {
      state.focusMode = nextFocus;
      setFieldFocus(isFieldFocused());
    }
    if (inside) {
      refreshIdleDelay();
      requestFieldIntent();
    } else {
      stopIdleAnim();
      requestHideIntent();
    }
  };
  const handleWindowPointerDown = (e: PointerEvent) => {
    if (!isPrimaryClick(e)) return;
    if (state.focusMode !== 'keyboard' || state.menuOpen) return;
    const pos = toCanvasPoint(e.clientX, e.clientY);
    state.focusMode = 'none';
    requestHideIntent();
    const bounds = bg.getBounds();
    const inside =
      pos.x >= bounds.x &&
      pos.x <= bounds.x + bounds.width &&
      pos.y >= bounds.y &&
      pos.y <= bounds.y + bounds.height;
      state.focusMode = inside ? 'mouse' : 'none';
      setFieldFocus(isFieldFocused());
    if (inside) {
      refreshIdleDelay();
    } else {
      stopIdleAnim();
    }
  };
  const handleWindowKeyDown = (e: KeyboardEvent) => {
    if (activeNamePrompt) return;
    const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase() ?? '';
    if (['input', 'textarea', 'select'].includes(tag)) return;
    if (!state.menuOpen && state.focusMode !== 'none' && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      const options = listBehaviorOptions();
      const currentIndex = options.findIndex((o) => o.id === currentDescriptor.id);
      if (currentIndex < 0) return;
      const dir = e.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = Math.max(0, Math.min(options.length - 1, currentIndex + dir));
      const next = options[nextIndex];
      if (next && next.id !== currentDescriptor.id) {
        state.focusMode = 'keyboard';
        setFieldFocus(true);
        requestFieldIntent();
        requestVariantSwitch(next.id);
      }
      return;
    }
    if (!state.menuOpen && state.focusMode !== 'none' && e.key === 'ArrowRight') {
      e.preventDefault();
      openMenu();
      return;
    }
    if (state.menuOpen && e.key === 'ArrowLeft') {
      e.preventDefault();
      closeMenu('keyboard');
    }
  };
  windowPointerMoveHandler = handleWindowPointerMove;
  windowKeyHandler = handleWindowKeyDown;
  windowPointerDownHandler = handleWindowPointerDown;
  window.addEventListener('pointermove', handleWindowPointerMove);
  window.addEventListener('pointerdown', handleWindowPointerDown);
  window.addEventListener('keydown', handleWindowKeyDown);
  container.cleanup = () => {
    if (windowPointerMoveHandler) {
      window.removeEventListener('pointermove', windowPointerMoveHandler);
      windowPointerMoveHandler = null;
    }
    if (windowPointerDownHandler) {
      window.removeEventListener('pointerdown', windowPointerDownHandler);
      windowPointerDownHandler = null;
    }
    if (windowKeyHandler) {
      window.removeEventListener('keydown', windowKeyHandler);
      windowKeyHandler = null;
    }
    stopIdleAnim();
  };


    label.eventMode = 'static';

    caret.eventMode = 'static';

  syncHoverFromPointer();

  return container;
}

function updateVariantSelectionUI() {
  if (!variantDropdownRef?.setSelected) return;
  variantDropdownRef.setSelected(currentDescriptor);
  variantDropdownRef.syncSelection?.();
}

function refreshVariantOptions() {
  variantDropdownRef?.refreshOptions?.();
}

function updateSaveButton() {
  saveButtonRef?.setPrimary?.(hasUnsavedChanges);
}

function markDirty() {
  hasUnsavedChanges = true;
  updateSaveButton();
}

function saveCurrentDescriptor() {
  currentDescriptor = validateDescriptor(currentDescriptor);
  upsertBehaviorDescriptor(currentDescriptor);
  hasUnsavedChanges = false;
  updateSaveButton();
}

function requestVariantSwitch(nextId: string) {
  if (!hasUnsavedChanges) {
    loadVariant(nextId);
    return;
  }
  promptUnsavedChanges(
    () => {
      saveCurrentDescriptor();
      loadVariant(nextId);
    },
    () => {
      hasUnsavedChanges = false;
      loadVariant(nextId);
    },
    () => {}
  );
}

function promptBehaviorName(defaultValue: string, onResult: (name: string | null) => void) {
  if (!uiLayer || !app) {
    onResult(null);
    return;
  }
  if (activeNamePrompt) {
    onResult(null);
    return;
  }
  const overlay = new Container();
  overlay.zIndex = 30_000;
  overlay.eventMode = 'static';
  overlay.cursor = 'default';
  overlay.on('pointerdown', (e) => e.stopPropagation());
  overlay.on('pointerdown', (e) => e.stopPropagation());

  const w = app.renderer.width;
  const h = app.renderer.height;
  const shade = new Graphics();
  shade.rect(0, 0, w, h);
  shade.fill({ color: 0x02050b, alpha: 0.75 });
  overlay.addChild(shade);

  const dlgW = 420;
  const dlgH = 220;
  const dlgX = (w - dlgW) / 2;
  const dlgY = (h - dlgH) / 2;

  const panel = new Graphics();
  panel.roundRect(dlgX, dlgY, dlgW, dlgH, 18);
  panel.fill({ color: 0x101521, alpha: 0.95 });
  panel.stroke({ width: 1, color: 0x4da3ff, alpha: 0.6 });
  overlay.addChild(panel);

  const title = createBitmapTextNode('Nom de la nouvelle variante', { fill: 0xdfe8ff, fontSize: 18, fontWeight: '700' });
  title.position.set(dlgX + 20, dlgY + 20);
  overlay.addChild(title);

  const inputBg = new Graphics();
  inputBg.position.set(dlgX + 20, dlgY + 70);
  inputBg.roundRect(0, 0, dlgW - 40, 50, 12);
  inputBg.fill({ color: 0x0b0f18, alpha: 0.95 });
  inputBg.stroke({ width: 1, color: 0x1f2a3d, alpha: 0.8 });
  overlay.addChild(inputBg);

  const valueText = createBitmapTextNode('', { fill: 0xdfe8ff, fontSize: 22, fontWeight: '600' });
  overlay.addChild(valueText);

  const hint = createBitmapTextNode('Entrée pour valider • Échap pour annuler', { fill: 0x9ab0dc, fontSize: 12 });
  hint.alpha = 0.7;
  hint.position.set(dlgX + 20, dlgY + dlgH - 70);
  overlay.addChild(hint);

  const errorText = createBitmapTextNode('', { fill: 0xff7777, fontSize: 12, fontWeight: '600' });
  errorText.position.set(dlgX + 20, inputBg.y + inputBg.height + 10);
  overlay.addChild(errorText);

  let value = defaultValue ?? '';
  const maxLength = 36;
  const existingNames = new Set(
    listBehaviorOptions()
      .map((o) => o.label.trim().toLowerCase())
      .filter((n) => n.length > 0)
  );

  const updateValue = () => {
    valueText.text = value.length ? value : '(vide)';
    valueText.position.set(
      inputBg.position.x + 14,
      inputBg.position.y + (inputBg.height - valueText.height) / 2
    );
    errorText.text = '';
  };
  updateValue();

  const cleanup = (result: string | null) => {
    if (namePromptKeyHandler) {
      window.removeEventListener('keydown', namePromptKeyHandler);
      namePromptKeyHandler = null;
    }
    if (overlay.parent) {
      overlay.parent.removeChild(overlay);
    }
    activeNamePrompt = null;
    onResult(result);
  };

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed) {
      errorText.text = 'Veuillez saisir un nom.';
      return;
    }
    const normalized = trimmed.toLowerCase();
    if (existingNames.has(normalized)) {
      errorText.text = 'Un BT porte déjà ce nom.';
      return;
    }
    cleanup(trimmed);
  };

  const cancel = () => cleanup(null);

  namePromptKeyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
      return;
    }
    if (e.key === 'Backspace') {
      e.preventDefault();
      if (value.length > 0) {
        value = value.slice(0, -1);
        updateValue();
      }
      return;
    }
    if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
      if (value.length < maxLength) {
        value += e.key;
        updateValue();
      }
    }
  };
  window.addEventListener('keydown', namePromptKeyHandler);

  const cancelBtn = makeButton('Annuler', dlgX + 20, dlgY + dlgH - 50, 110, 36, cancel);
  const okBtn = makeButton('Valider', dlgX + dlgW - 140, dlgY + dlgH - 50, 120, 36, submit, true);
  overlay.addChild(cancelBtn.container, okBtn.container);

  uiLayer.addChild(overlay);
  activeNamePrompt = overlay;
}

function promptUnsavedChanges(onSave: () => void, onDiscard: () => void, onCancel: () => void) {
  if (!uiLayer || !app) {
    onCancel();
    return;
  }
  if (activeNamePrompt) {
    onCancel();
    return;
  }
  const overlay = new Container();
  overlay.zIndex = 30_000;
  overlay.eventMode = 'static';
  overlay.cursor = 'default';

  const w = app.renderer.width;
  const h = app.renderer.height;
  const shade = new Graphics();
  shade.rect(0, 0, w, h);
  shade.fill({ color: 0x02050b, alpha: 0.75 });
  overlay.addChild(shade);

  const dlgW = 460;
  const dlgH = 210;
  const dlgX = (w - dlgW) / 2;
  const dlgY = (h - dlgH) / 2;

  const panel = new Graphics();
  panel.roundRect(dlgX, dlgY, dlgW, dlgH, 18);
  panel.fill({ color: 0x101521, alpha: 0.95 });
  panel.stroke({ width: 1, color: 0x4da3ff, alpha: 0.6 });
  overlay.addChild(panel);

  const title = createBitmapTextNode('Modifications non enregistrées', { fill: 0xdfe8ff, fontSize: 18, fontWeight: '700' });
  title.position.set(dlgX + 20, dlgY + 20);
  overlay.addChild(title);

  const message = createBitmapTextNode(
    'Voulez-vous enregistrer avant de changer de variante ?',
    { fill: 0x9ab0dc, fontSize: 13, fontWeight: '500' }
  );
  message.position.set(dlgX + 20, dlgY + 60);
  overlay.addChild(message);

  const cleanup = () => {
    if (namePromptKeyHandler) {
      window.removeEventListener('keydown', namePromptKeyHandler);
      namePromptKeyHandler = null;
    }
    if (overlay.parent) overlay.parent.removeChild(overlay);
    activeNamePrompt = null;
  };

  const handleSave = () => {
    cleanup();
    onSave();
  };
  const handleDiscard = () => {
    cleanup();
    onDiscard();
  };
  const handleCancel = () => {
    cleanup();
    onCancel();
  };

  namePromptKeyHandler = (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSave();
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };
  window.addEventListener('keydown', namePromptKeyHandler);

  const ignoreBtn = makeButton('Ignorer', dlgX + 20, dlgY + dlgH - 50, 110, 36, handleDiscard);
  const cancelBtn = makeButton('Annuler', dlgX + 140, dlgY + dlgH - 50, 110, 36, handleCancel);
  const saveBtn = makeButton('Enregistrer', dlgX + dlgW - 150, dlgY + dlgH - 50, 130, 36, handleSave, true);
  overlay.addChild(ignoreBtn.container, cancelBtn.container, saveBtn.container);

  uiLayer.addChild(overlay);
  activeNamePrompt = overlay;
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
    const badge = createBitmapTextNode(shortType(n), { fill: 0x9bb5e8, fontSize: 11, fontWeight: '700' });
    badge.position.set(indent + 12, cursorY + (cardH - badge.height) / 2);
    const title = createBitmapTextNode(nodeLabel(n), { fill: 0xdfe8ff, fontSize: 14, fontWeight: '600' });
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
  const txt = createBitmapTextNode(label, { fill: 0xdfe8ff, fontSize: 13, fontWeight: '600' });
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
  markDirty();
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
  hasUnsavedChanges = false;
  redrawTree();
  updateVariantSelectionUI();
  updateSaveButton();
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
