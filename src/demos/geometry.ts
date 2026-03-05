import { Application, Container, Graphics, BitmapText, type TextStyleFontWeight } from 'pixi.js';

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

let app: Application;
let uiLayer: Container;
const padding = 14;
const toolbarHeight = 0;

let demoRectA: Graphics | null = null;
let demoRectB: Graphics | null = null;
let demoRectAContainer: Container | null = null;
let demoRectBContainer: Container | null = null;
let demoHull: Graphics | null = null;
let demoHullLabelA: BitmapText | null = null;
let demoHullLabelB: BitmapText | null = null;
let demoS1MidLabel: BitmapText | null = null;
let demoS2MidLabel: BitmapText | null = null;
let demoGreenCornerLabelA: BitmapText | null = null;
let demoGreenCornerLabelB: BitmapText | null = null;
let demoGreenProjLabelA: BitmapText | null = null;
let demoGreenProjLabelB: BitmapText | null = null;
let demoGreenIntersectionLabel: BitmapText | null = null;
let demoRedIntersectionLabel: BitmapText | null = null;
let demoRedProjLabelA: BitmapText | null = null;
let demoRedProjLabelB: BitmapText | null = null;
let demoGreenMidLabel: BitmapText | null = null;
let demoCurveLabel1: BitmapText | null = null;
let demoCurveLabel2: BitmapText | null = null;
let demoCurveLabelM: BitmapText | null = null;
let demoC1TanStartLabel: BitmapText | null = null;
let demoC1TanEndLabel: BitmapText | null = null;
let demoC2TanStartLabel: BitmapText | null = null;
let demoC2TanEndLabel: BitmapText | null = null;
let demoCMTanStartLabel: BitmapText | null = null;
let demoCMTanEndLabel: BitmapText | null = null;
let demoSegGreenA1Label: BitmapText | null = null;
let demoSegGreenB1Label: BitmapText | null = null;
let demoSegRedA2Label: BitmapText | null = null;
let demoSegRedB2Label: BitmapText | null = null;
let demoProjS1MidOnA1Label: BitmapText | null = null;
let demoProjS1MidOnB1Label: BitmapText | null = null;
let demoProjS1MidOnAB1Label: BitmapText | null = null;
let demoProjS1MidOnABaseLabel: BitmapText | null = null;
let demoProjS2MidOnA2Label: BitmapText | null = null;
let demoProjS2MidOnB2Label: BitmapText | null = null;
let demoProjS2MidOnAB2Label: BitmapText | null = null;
let demoProjS2MidOnABaseLabel: BitmapText | null = null;
let demoRectState = {
  initialized: false,
  a: { x: 0, y: 0 },
  b: { x: 0, y: 0 }
};
let demoDragTarget: 'a' | 'b' | null = null;
let demoDragOffset = { x: 0, y: 0 };
let demoDragMoveHandler: ((e: PointerEvent) => void) | null = null;
let demoDragEndHandler: ((e: PointerEvent) => void) | null = null;
const LABEL_POSITION_LERP = 0.35;
const LABEL_POSITION_EPS = 0.05;
const labelPositionTargets = new Map<BitmapText, { x: number; y: number }>();
let labelAnimatorStarted = false;

const toCanvasPoint = (clientX: number, clientY: number) => {
  const rect = app.canvas.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
};

const ensureLabelAnimator = () => {
  if (labelAnimatorStarted || !app) return;
  labelAnimatorStarted = true;
  app.ticker.add(() => {
    for (const [label, target] of labelPositionTargets) {
      if (!label.parent || !label.visible) continue;
      const dx = target.x - label.x;
      const dy = target.y - label.y;
      if (Math.abs(dx) <= LABEL_POSITION_EPS && Math.abs(dy) <= LABEL_POSITION_EPS) {
        label.position.set(target.x, target.y);
        continue;
      }
      label.position.set(label.x + dx * LABEL_POSITION_LERP, label.y + dy * LABEL_POSITION_LERP);
    }
  });
};

const setLabelPositionTarget = (label: BitmapText, x: number, y: number) => {
  const hadTarget = labelPositionTargets.has(label);
  labelPositionTargets.set(label, { x, y });
  if (!hadTarget || !Number.isFinite(label.x) || !Number.isFinite(label.y)) {
    label.position.set(x, y);
  }
};

type LabelKind = 'point' | 'segment' | 'curve';

type LabelPlacementRequest = {
  id: string;
  label: BitmapText;
  anchor: { x: number; y: number };
  kind: LabelKind;
  priority: number;
  tangent?: { x: number; y: number };
  preferred?: 'tr' | 'br' | 'tl' | 'bl';
};

type Rect2D = { x: number; y: number; width: number; height: number };
const SHOW_LABEL_CONVEX_RECTS = false;

const labelMetrics = (label: BitmapText) => {
  const bounds = label.getLocalBounds();
  const width = Math.max(8, bounds.width || label.width || 8);
  const height = Math.max(8, bounds.height || label.height || 8);
  const bx = Number.isFinite(bounds.x) ? bounds.x : 0;
  const by = Number.isFinite(bounds.y) ? bounds.y : 0;
  return { width, height, bx, by };
};

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const LABEL_ANCHOR_DISTANCE = 10;
const LABEL_MIN_GAP = 20;
const LABEL_REPULSION_STRENGTH = 0.9;
const PREFERRED_DIRS = {
  tr: { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  br: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  tl: { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  bl: { x: -Math.SQRT1_2, y: Math.SQRT1_2 }
} as const;

const getPreferredDir = (preferred?: 'tr' | 'br' | 'tl' | 'bl') => {
  if (preferred && preferred in PREFERRED_DIRS) return PREFERRED_DIRS[preferred];
  return PREFERRED_DIRS.tr;
};

const rectGapDistance = (a: Rect2D, b: Rect2D) => {
  const dx = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), 0);
  const dy = Math.max(a.y - (b.y + b.height), b.y - (a.y + a.height), 0);
  return Math.hypot(dx, dy);
};

const closestPointOnRectBoundary = (p: { x: number; y: number }, r: Rect2D) => {
  const left = r.x;
  const right = r.x + r.width;
  const top = r.y;
  const bottom = r.y + r.height;
  const cx = clamp(p.x, left, right);
  const cy = clamp(p.y, top, bottom);
  const inside = p.x > left && p.x < right && p.y > top && p.y < bottom;
  if (!inside) return { x: cx, y: cy };
  const dLeft = Math.abs(p.x - left);
  const dRight = Math.abs(right - p.x);
  const dTop = Math.abs(p.y - top);
  const dBottom = Math.abs(bottom - p.y);
  const minD = Math.min(dLeft, dRight, dTop, dBottom);
  if (minD === dLeft) return { x: left, y: p.y };
  if (minD === dRight) return { x: right, y: p.y };
  if (minD === dTop) return { x: p.x, y: top };
  return { x: p.x, y: bottom };
};

const preferredRectFromContact = (
  contact: { x: number; y: number },
  m: { width: number; height: number; bx: number; by: number },
  preferred?: 'tr' | 'br' | 'tl' | 'bl'
): Rect2D => {
  switch (preferred) {
    case 'br':
      return { x: contact.x, y: contact.y, width: m.width, height: m.height };
    case 'tl':
      return { x: contact.x - m.width, y: contact.y - m.height, width: m.width, height: m.height };
    case 'bl':
      return { x: contact.x - m.width, y: contact.y, width: m.width, height: m.height };
    case 'tr':
    default:
      return { x: contact.x, y: contact.y - m.height, width: m.width, height: m.height };
  }
};

const projectRectToAnchorDistance = (
  anchor: { x: number; y: number },
  rect: Rect2D,
  preferredDir: { x: number; y: number }
): Rect2D => {
  let out = { ...rect };
  for (let i = 0; i < 8; i += 1) {
    const q = closestPointOnRectBoundary(anchor, out);
    const dx = q.x - anchor.x;
    const dy = q.y - anchor.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) {
      out.x += preferredDir.x * LABEL_ANCHOR_DISTANCE;
      out.y += preferredDir.y * LABEL_ANCHOR_DISTANCE;
      continue;
    }
    const shift = LABEL_ANCHOR_DISTANCE - d;
    if (Math.abs(shift) < 1e-4) break;
    out.x += (dx / d) * shift;
    out.y += (dy / d) * shift;
  }
  return out;
};

function placeLabels(
  canvasWidth: number,
  canvasHeight: number,
  requests: LabelPlacementRequest[]
) {
  ensureLabelAnimator();
  const placedForDebug: Array<{ req: LabelPlacementRequest; rect: Rect2D }> = [];
  type PlacementEntry = {
    req: LabelPlacementRequest;
    m: { width: number; height: number; bx: number; by: number };
    anchorInside: boolean;
    preferredDir: { x: number; y: number };
    preferredRect: Rect2D;
    rect: Rect2D;
  };

  const sorted = [...requests].sort((a, b) => b.priority - a.priority);
  const entries: PlacementEntry[] = sorted.map((req) => {
    const m = labelMetrics(req.label);
    const preferredDir = getPreferredDir(req.preferred);
    const anchorInside =
      req.anchor.x >= 0 && req.anchor.x <= canvasWidth && req.anchor.y >= 0 && req.anchor.y <= canvasHeight;
    const preferredContact = {
      x: req.anchor.x + preferredDir.x * LABEL_ANCHOR_DISTANCE,
      y: req.anchor.y + preferredDir.y * LABEL_ANCHOR_DISTANCE
    };
    const preferredRect = preferredRectFromContact(preferredContact, m, req.preferred);
    if (anchorInside) {
      return {
        req,
        m,
        anchorInside,
        preferredDir,
        preferredRect,
        rect: projectRectToAnchorDistance(req.anchor, preferredRect, preferredDir)
      };
    }
    // Exception: if anchor is outside canvas, allow clamping inside canvas.
    return {
      req,
      m,
      anchorInside,
      preferredDir,
      preferredRect,
      rect: {
        x: clamp(preferredRect.x, 0, Math.max(0, canvasWidth - m.width)),
        y: clamp(preferredRect.y, 0, Math.max(0, canvasHeight - m.height)),
        width: m.width,
        height: m.height
      }
    };
  });

  // Coordinate-descent / relaxation with strict projection to anchor distance.
  // Optimized with a spatial grid (near-neighbor checks) + early stop.
  const passCount = 7;
  const iterCount = 12;
  const earlyStopIterEps = 0.06;
  const earlyStopPassEps = 0.08;
  const maxStep = 14;
  const moveScale = 0.55;
  const cellSize = Math.max(
    32,
    Math.ceil(
      Math.max(...entries.map((e) => Math.max(e.rect.width, e.rect.height)), 32) + LABEL_MIN_GAP
    )
  );

  const cellRangeForRect = (r: Rect2D, margin = 0) => {
    const x0 = Math.floor((r.x - margin) / cellSize);
    const y0 = Math.floor((r.y - margin) / cellSize);
    const x1 = Math.floor((r.x + r.width + margin) / cellSize);
    const y1 = Math.floor((r.y + r.height + margin) / cellSize);
    return { x0, y0, x1, y1 };
  };

  const buildSpatialGrid = () => {
    const grid = new Map<string, number[]>();
    const margin = LABEL_MIN_GAP;
    for (let i = 0; i < entries.length; i += 1) {
      const range = cellRangeForRect(entries[i].rect, margin);
      for (let cy = range.y0; cy <= range.y1; cy += 1) {
        for (let cx = range.x0; cx <= range.x1; cx += 1) {
          const key = `${cx},${cy}`;
          const bucket = grid.get(key);
          if (bucket) bucket.push(i);
          else grid.set(key, [i]);
        }
      }
    }
    return grid;
  };

  const getNeighborIndexes = (idx: number, grid: Map<string, number[]>) => {
    const out = new Set<number>();
    const range = cellRangeForRect(entries[idx].rect, LABEL_MIN_GAP);
    for (let cy = range.y0; cy <= range.y1; cy += 1) {
      for (let cx = range.x0; cx <= range.x1; cx += 1) {
        const bucket = grid.get(`${cx},${cy}`);
        if (!bucket) continue;
        for (const j of bucket) {
          if (j !== idx) out.add(j);
        }
      }
    }
    return out;
  };

  for (let pass = 0; pass < passCount; pass += 1) {
    const order =
      pass % 2 === 0
        ? entries.map((_, i) => i)
        : entries.map((_, i) => entries.length - 1 - i);

    let passMaxMove = 0;
    for (let it = 0; it < iterCount; it += 1) {
      const grid = buildSpatialGrid();
      let iterMaxMove = 0;

      for (const idx of order) {
        const e = entries[idx];
        if (!e.anchorInside) continue;

        const rect = e.rect;
        const priorityWeight = 1 + e.req.priority / 300;
        let fx = (e.preferredRect.x - rect.x) * (0.18 * priorityWeight);
        let fy = (e.preferredRect.y - rect.y) * (0.18 * priorityWeight);

        const neighbors = getNeighborIndexes(idx, grid);
        for (const j of neighbors) {
          const other = entries[j].rect;
          const gap = rectGapDistance(rect, other);
          const miss = LABEL_MIN_GAP - gap;
          if (miss <= 0) continue;

          const acx = rect.x + rect.width * 0.5;
          const acy = rect.y + rect.height * 0.5;
          const bcx = other.x + other.width * 0.5;
          const bcy = other.y + other.height * 0.5;
          const dx = acx - bcx;
          const dy = acy - bcy;
          const len = Math.hypot(dx, dy) || 1;
          fx += (dx / len) * (miss * LABEL_REPULSION_STRENGTH);
          fy += (dy / len) * (miss * LABEL_REPULSION_STRENGTH);
        }

        if (rect.x < 0) fx += (-rect.x) * 1.6;
        if (rect.y < 0) fy += (-rect.y) * 1.6;
        if (rect.x + rect.width > canvasWidth) fx -= (rect.x + rect.width - canvasWidth) * 1.6;
        if (rect.y + rect.height > canvasHeight) fy -= (rect.y + rect.height - canvasHeight) * 1.6;

        const fl = Math.hypot(fx, fy);
        if (fl > maxStep) {
          fx = (fx / fl) * maxStep;
          fy = (fy / fl) * maxStep;
        }

        const nextRect = projectRectToAnchorDistance(
          e.req.anchor,
          {
            x: rect.x + fx * moveScale,
            y: rect.y + fy * moveScale,
            width: rect.width,
            height: rect.height
          },
          e.preferredDir
        );
        const move = Math.hypot(nextRect.x - rect.x, nextRect.y - rect.y);
        if (move > iterMaxMove) iterMaxMove = move;
        e.rect = nextRect;
      }

      if (iterMaxMove > passMaxMove) passMaxMove = iterMaxMove;
      if (iterMaxMove < earlyStopIterEps) break;
    }

    if (passMaxMove < earlyStopPassEps) break;
  }

  for (const e of entries) {
    const m = e.m;
    const anchorInside =
      e.req.anchor.x >= 0 && e.req.anchor.x <= canvasWidth && e.req.anchor.y >= 0 && e.req.anchor.y <= canvasHeight;
    if (anchorInside) {
      e.rect = projectRectToAnchorDistance(e.req.anchor, e.rect, e.preferredDir);
      setLabelPositionTarget(e.req.label, e.rect.x - m.bx, e.rect.y - m.by);
    } else {
      const rect = {
        x: clamp(e.preferredRect.x, 0, Math.max(0, canvasWidth - m.width)),
        y: clamp(e.preferredRect.y, 0, Math.max(0, canvasHeight - m.height)),
        width: m.width,
        height: m.height
      };
      e.rect = rect;
      setLabelPositionTarget(e.req.label, rect.x - m.bx, rect.y - m.by);
    }
    e.req.label.visible = true;
    placedForDebug.push({ req: e.req, rect: e.rect });
  }

  return placedForDebug;
}

function renderGeometry() {
  const w = Math.round(app.renderer.width);
  const h = Math.round(app.renderer.height);
    if (!demoRectState.initialized) {
      demoRectState.initialized = true;
      demoRectState.a = { x: w / 2 - 220, y: h / 2 - 70 };
      demoRectState.b = { x: w / 2 + 20, y: h / 2 + 20 };
    }
    const rectA = { w: 150, h: 90, r: 10 };
    const rectB = { w: 210, h: 120, r: 10 };
    const convexHull = (points: { x: number; y: number }[]) => {
      if (points.length <= 3) return points;
      const pts = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));
      const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
        (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
      const lower: { x: number; y: number }[] = [];
      for (const p of pts) {
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
          lower.pop();
        }
        lower.push(p);
      }
      const upper: { x: number; y: number }[] = [];
      for (let i = pts.length - 1; i >= 0; i -= 1) {
        const p = pts[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
          upper.pop();
        }
        upper.push(p);
      }
      upper.pop();
      lower.pop();
      return lower.concat(upper);
    };
  
    const drawHull = () => {
      if (!demoHull) return;
      const hullGfx = demoHull;
      const s1Color = 0x4cd964;
      const s2Color = 0xff4d4d;
      const labelRequests: LabelPlacementRequest[] = [];
      const queueLabel = (
        id: string,
        label: BitmapText | null,
        anchor: { x: number; y: number },
        kind: LabelKind,
        priority: number,
        tangent?: { x: number; y: number },
        preferred?: 'tr' | 'br' | 'tl' | 'bl'
      ) => {
        if (!label) return;
        labelRequests.push({ id, label, anchor, kind, priority, tangent, preferred });
      };
      // removed curve controls
      const cornersA = [
        { x: demoRectState.a.x, y: demoRectState.a.y },
        { x: demoRectState.a.x + rectA.w, y: demoRectState.a.y },
        { x: demoRectState.a.x + rectA.w, y: demoRectState.a.y + rectA.h },
        { x: demoRectState.a.x, y: demoRectState.a.y + rectA.h }
      ];
      const bx = demoRectState.b.x + rectB.w / 2;
      const by = demoRectState.b.y + rectB.h / 2;
      const cornersB = [
        { x: demoRectState.b.x, y: demoRectState.b.y },
        { x: demoRectState.b.x + rectB.w, y: demoRectState.b.y },
        { x: demoRectState.b.x + rectB.w, y: demoRectState.b.y + rectB.h },
        { x: demoRectState.b.x, y: demoRectState.b.y + rectB.h }
      ];
      const points = [...cornersA, ...cornersB];
      const hull = convexHull(points);
      if (!hull.length) return;
      const matchesCorner = (p: { x: number; y: number }, corners: { x: number; y: number }[]) => {
        const eps = 0.5;
        return corners.some((c) => Math.abs(c.x - p.x) <= eps && Math.abs(c.y - p.y) <= eps);
      };
      const hullEdges: Array<{ a: { x: number; y: number }; b: { x: number; y: number } }> = [];
      for (let i = 0; i < hull.length; i += 1) {
        const a = hull[i];
        const b = hull[(i + 1) % hull.length];
        hullEdges.push({ a, b });
      }
      const isOnRectA = (p: { x: number; y: number }) => matchesCorner(p, cornersA);
      const isOnRectB = (p: { x: number; y: number }) => matchesCorner(p, cornersB);
      const bridgeEdges = hullEdges.filter(({ a, b }) => {
        const aA = isOnRectA(a);
        const bA = isOnRectA(b);
        const aB = isOnRectB(a);
        const bB = isOnRectB(b);
        return (aA && bB) || (aB && bA);
      });
  
      hullGfx.clear();
      if (bridgeEdges.length) {
        bridgeEdges.forEach(({ a, b }, idx) => {
          hullGfx.moveTo(a.x, a.y);
          hullGfx.lineTo(b.x, b.y);
          hullGfx.stroke({
            width: 1,
            color: idx === 0 ? s1Color : s2Color,
            alpha: 0.8
          });
        });
      }
  
      const labelStyle = { fill: 0xdfe8ff, fontSize: 12, fontWeight: '600' } as const;
      if (!demoHullLabelA) {
        demoHullLabelA = createBitmapTextNode('S1', labelStyle);
        demoHullLabelA.zIndex = 9998;
      }
      if (!demoHullLabelB) {
        demoHullLabelB = createBitmapTextNode('S2', labelStyle);
        demoHullLabelB.zIndex = 9998;
      }
      if (!demoS1MidLabel) {
        demoS1MidLabel = createBitmapTextNode('S1M', { fill: s1Color, fontSize: 11, fontWeight: '600' });
        demoS1MidLabel.zIndex = 9998;
      }
      if (!demoS2MidLabel) {
        demoS2MidLabel = createBitmapTextNode('S2M', { fill: s2Color, fontSize: 11, fontWeight: '600' });
        demoS2MidLabel.zIndex = 9998;
      }
      const labels = [demoHullLabelA, demoHullLabelB];
      labels.forEach((label) => {
        if (!label?.parent) uiLayer.addChild(label);
        label.visible = false;
      });
      if (demoS1MidLabel.parent === null) uiLayer.addChild(demoS1MidLabel);
      demoS1MidLabel.visible = false;
      if (demoS2MidLabel.parent === null) uiLayer.addChild(demoS2MidLabel);
      demoS2MidLabel.visible = false;
      const edge1 = bridgeEdges[0] ?? null;
      const edge2 = bridgeEdges[1] ?? null;
      const s1Mid: { x: number; y: number } | null = edge1
        ? { x: (edge1.a.x + edge1.b.x) / 2, y: (edge1.a.y + edge1.b.y) / 2 }
        : null;
      const s2Mid: { x: number; y: number } | null = edge2
        ? { x: (edge2.a.x + edge2.b.x) / 2, y: (edge2.a.y + edge2.b.y) / 2 }
        : null;

      if (edge1 && s1Mid && demoHullLabelA) {
        demoHullLabelA.tint = s1Color;
        queueLabel(
          'S1',
          demoHullLabelA,
          s1Mid,
          'segment',
          265,
          { x: edge1.b.x - edge1.a.x, y: edge1.b.y - edge1.a.y },
          'tr'
        );
      }
      if (edge2 && s2Mid && demoHullLabelB) {
        demoHullLabelB.tint = s2Color;
        queueLabel(
          'S2',
          demoHullLabelB,
          s2Mid,
          'segment',
          265,
          { x: edge2.b.x - edge2.a.x, y: edge2.b.y - edge2.a.y },
          'tr'
        );
      }
      if (s1Mid && demoS1MidLabel) {
        hullGfx.circle(s1Mid.x, s1Mid.y, 4);
        hullGfx.fill({ color: s1Color, alpha: 0.9 });
        demoS1MidLabel.tint = s1Color;
        queueLabel('S1M', demoS1MidLabel, s1Mid, 'point', 260, undefined, 'tr');
      }
      if (s2Mid && demoS2MidLabel) {
        hullGfx.circle(s2Mid.x, s2Mid.y, 4);
        hullGfx.fill({ color: s2Color, alpha: 0.9 });
        demoS2MidLabel.tint = s2Color;
        queueLabel('S2M', demoS2MidLabel, s2Mid, 'point', 260, undefined, 'tr');
      }
  
      if (!demoGreenCornerLabelA) {
        demoGreenCornerLabelA = createBitmapTextNode('A', { fill: 0xffd86b, fontSize: 12, fontWeight: '600' });
        demoGreenCornerLabelA.zIndex = 9998;
      }
      if (!demoGreenCornerLabelB) {
        demoGreenCornerLabelB = createBitmapTextNode('B', { fill: 0xffd86b, fontSize: 12, fontWeight: '600' });
        demoGreenCornerLabelB.zIndex = 9998;
      }
      if (demoGreenCornerLabelA.parent === null) uiLayer.addChild(demoGreenCornerLabelA);
      if (demoGreenCornerLabelB.parent === null) uiLayer.addChild(demoGreenCornerLabelB);
      demoGreenCornerLabelA.visible = false;
      demoGreenCornerLabelB.visible = false;
      // removed AB / AB1 / AB2 labels
      if (!demoGreenProjLabelA) {
        demoGreenProjLabelA = createBitmapTextNode('P1A', { fill: s1Color, fontSize: 11, fontWeight: '600' });
        demoGreenProjLabelA.zIndex = 9998;
      }
      if (!demoGreenProjLabelB) {
        demoGreenProjLabelB = createBitmapTextNode('P1B', { fill: s1Color, fontSize: 11, fontWeight: '600' });
        demoGreenProjLabelB.zIndex = 9998;
      }
      if (!demoRedProjLabelA) {
        demoRedProjLabelA = createBitmapTextNode('P2A', { fill: s2Color, fontSize: 11, fontWeight: '600' });
        demoRedProjLabelA.zIndex = 9998;
      }
      if (!demoRedProjLabelB) {
        demoRedProjLabelB = createBitmapTextNode('P2B', { fill: s2Color, fontSize: 11, fontWeight: '600' });
        demoRedProjLabelB.zIndex = 9998;
      }
      if (demoGreenProjLabelA.parent === null) uiLayer.addChild(demoGreenProjLabelA);
      if (demoGreenProjLabelB.parent === null) uiLayer.addChild(demoGreenProjLabelB);
      if (demoRedProjLabelA.parent === null) uiLayer.addChild(demoRedProjLabelA);
      if (demoRedProjLabelB.parent === null) uiLayer.addChild(demoRedProjLabelB);
      demoGreenProjLabelA.visible = false;
      demoGreenProjLabelB.visible = false;
      demoRedProjLabelA.visible = false;
      demoRedProjLabelB.visible = false;
      if (!demoGreenIntersectionLabel) {
        demoGreenIntersectionLabel = createBitmapTextNode('I1', { fill: s1Color, fontSize: 11, fontWeight: '600' });
        demoGreenIntersectionLabel.zIndex = 9998;
      }
      if (demoGreenIntersectionLabel.parent === null) uiLayer.addChild(demoGreenIntersectionLabel);
      demoGreenIntersectionLabel.visible = false;
      if (!demoRedIntersectionLabel) {
        demoRedIntersectionLabel = createBitmapTextNode('I2', { fill: s2Color, fontSize: 11, fontWeight: '600' });
        demoRedIntersectionLabel.zIndex = 9998;
      }
      if (demoRedIntersectionLabel.parent === null) uiLayer.addChild(demoRedIntersectionLabel);
      demoRedIntersectionLabel.visible = false;
      if (!demoGreenMidLabel) {
        demoGreenMidLabel = createBitmapTextNode('M', { fill: 0xffd86b, fontSize: 11, fontWeight: '600' });
        demoGreenMidLabel.zIndex = 9998;
      }
      if (demoGreenMidLabel.parent === null) uiLayer.addChild(demoGreenMidLabel);
      demoGreenMidLabel.visible = false;
      if (!demoCurveLabel1) {
        demoCurveLabel1 = createBitmapTextNode('C1', { fill: s1Color, fontSize: 12, fontWeight: '600' });
        demoCurveLabel1.zIndex = 9998;
      }
      if (!demoCurveLabel2) {
        demoCurveLabel2 = createBitmapTextNode('C2', { fill: s2Color, fontSize: 12, fontWeight: '600' });
        demoCurveLabel2.zIndex = 9998;
      }
      if (!demoCurveLabelM) {
        demoCurveLabelM = createBitmapTextNode('CM', { fill: 0x7dd3fc, fontSize: 12, fontWeight: '600' });
        demoCurveLabelM.zIndex = 9998;
      }
      if (!demoC1TanStartLabel) {
        demoC1TanStartLabel = createBitmapTextNode('T1A', { fill: s1Color, fontSize: 11, fontWeight: '600' });
        demoC1TanStartLabel.zIndex = 9998;
      }
      if (!demoC1TanEndLabel) {
        demoC1TanEndLabel = createBitmapTextNode('T1B', { fill: s1Color, fontSize: 11, fontWeight: '600' });
        demoC1TanEndLabel.zIndex = 9998;
      }
      if (!demoC2TanStartLabel) {
        demoC2TanStartLabel = createBitmapTextNode('T2A', { fill: s2Color, fontSize: 11, fontWeight: '600' });
        demoC2TanStartLabel.zIndex = 9998;
      }
      if (!demoC2TanEndLabel) {
        demoC2TanEndLabel = createBitmapTextNode('T2B', { fill: s2Color, fontSize: 11, fontWeight: '600' });
        demoC2TanEndLabel.zIndex = 9998;
      }
      if (!demoCMTanStartLabel) {
        demoCMTanStartLabel = createBitmapTextNode('TMA', { fill: 0x7dd3fc, fontSize: 11, fontWeight: '600' });
        demoCMTanStartLabel.zIndex = 9998;
      }
      if (!demoCMTanEndLabel) {
        demoCMTanEndLabel = createBitmapTextNode('TMB', { fill: 0x7dd3fc, fontSize: 11, fontWeight: '600' });
        demoCMTanEndLabel.zIndex = 9998;
      }
      if (!demoSegGreenA1Label) {
        demoSegGreenA1Label = createBitmapTextNode('S1A', { fill: s1Color, fontSize: 11, fontWeight: '600' });
        demoSegGreenA1Label.zIndex = 9998;
      }
      if (!demoSegGreenB1Label) {
        demoSegGreenB1Label = createBitmapTextNode('S1B', { fill: s1Color, fontSize: 11, fontWeight: '600' });
        demoSegGreenB1Label.zIndex = 9998;
      }
      if (!demoSegRedA2Label) {
        demoSegRedA2Label = createBitmapTextNode('S2A', { fill: s2Color, fontSize: 11, fontWeight: '600' });
        demoSegRedA2Label.zIndex = 9998;
      }
      if (!demoSegRedB2Label) {
        demoSegRedB2Label = createBitmapTextNode('S2B', { fill: s2Color, fontSize: 11, fontWeight: '600' });
        demoSegRedB2Label.zIndex = 9998;
      }
      if (!demoProjS1MidOnA1Label) {
        demoProjS1MidOnA1Label = createBitmapTextNode('PAS1M', { fill: s1Color, fontSize: 11, fontWeight: '600' });
        demoProjS1MidOnA1Label.zIndex = 9998;
      }
      if (!demoProjS1MidOnB1Label) {
        demoProjS1MidOnB1Label = createBitmapTextNode('PBS1M', { fill: s1Color, fontSize: 11, fontWeight: '600' });
        demoProjS1MidOnB1Label.zIndex = 9998;
      }
      if (!demoProjS1MidOnAB1Label) {
        demoProjS1MidOnAB1Label = createBitmapTextNode('PS1M', { fill: s1Color, fontSize: 11, fontWeight: '600' });
        demoProjS1MidOnAB1Label.zIndex = 9998;
      }
      if (!demoProjS1MidOnABaseLabel) {
        demoProjS1MidOnABaseLabel = createBitmapTextNode('PMS1M', { fill: s1Color, fontSize: 11, fontWeight: '600' });
        demoProjS1MidOnABaseLabel.zIndex = 9998;
      }
      if (!demoProjS2MidOnA2Label) {
        demoProjS2MidOnA2Label = createBitmapTextNode('PAS2M', { fill: s2Color, fontSize: 11, fontWeight: '600' });
        demoProjS2MidOnA2Label.zIndex = 9998;
      }
      if (!demoProjS2MidOnB2Label) {
        demoProjS2MidOnB2Label = createBitmapTextNode('PBS2M', { fill: s2Color, fontSize: 11, fontWeight: '600' });
        demoProjS2MidOnB2Label.zIndex = 9998;
      }
      if (!demoProjS2MidOnAB2Label) {
        demoProjS2MidOnAB2Label = createBitmapTextNode('PS2M', { fill: s2Color, fontSize: 11, fontWeight: '600' });
        demoProjS2MidOnAB2Label.zIndex = 9998;
      }
      if (!demoProjS2MidOnABaseLabel) {
        demoProjS2MidOnABaseLabel = createBitmapTextNode('PMS2M', { fill: s2Color, fontSize: 11, fontWeight: '600' });
        demoProjS2MidOnABaseLabel.zIndex = 9998;
      }
      if (demoCurveLabel1.parent === null) uiLayer.addChild(demoCurveLabel1);
      if (demoCurveLabel2.parent === null) uiLayer.addChild(demoCurveLabel2);
      if (demoCurveLabelM.parent === null) uiLayer.addChild(demoCurveLabelM);
      if (demoC1TanStartLabel.parent === null) uiLayer.addChild(demoC1TanStartLabel);
      if (demoC1TanEndLabel.parent === null) uiLayer.addChild(demoC1TanEndLabel);
      if (demoC2TanStartLabel.parent === null) uiLayer.addChild(demoC2TanStartLabel);
      if (demoC2TanEndLabel.parent === null) uiLayer.addChild(demoC2TanEndLabel);
      if (demoCMTanStartLabel.parent === null) uiLayer.addChild(demoCMTanStartLabel);
      if (demoCMTanEndLabel.parent === null) uiLayer.addChild(demoCMTanEndLabel);
      if (demoSegGreenA1Label.parent === null) uiLayer.addChild(demoSegGreenA1Label);
      if (demoSegGreenB1Label.parent === null) uiLayer.addChild(demoSegGreenB1Label);
      if (demoSegRedA2Label.parent === null) uiLayer.addChild(demoSegRedA2Label);
      if (demoSegRedB2Label.parent === null) uiLayer.addChild(demoSegRedB2Label);
      if (demoProjS1MidOnA1Label.parent === null) uiLayer.addChild(demoProjS1MidOnA1Label);
      if (demoProjS1MidOnB1Label.parent === null) uiLayer.addChild(demoProjS1MidOnB1Label);
      if (demoProjS1MidOnAB1Label.parent === null) uiLayer.addChild(demoProjS1MidOnAB1Label);
      if (demoProjS1MidOnABaseLabel.parent === null) uiLayer.addChild(demoProjS1MidOnABaseLabel);
      if (demoProjS2MidOnA2Label.parent === null) uiLayer.addChild(demoProjS2MidOnA2Label);
      if (demoProjS2MidOnB2Label.parent === null) uiLayer.addChild(demoProjS2MidOnB2Label);
      if (demoProjS2MidOnAB2Label.parent === null) uiLayer.addChild(demoProjS2MidOnAB2Label);
      if (demoProjS2MidOnABaseLabel.parent === null) uiLayer.addChild(demoProjS2MidOnABaseLabel);
      demoCurveLabel1.visible = false;
      demoCurveLabel2.visible = false;
      demoCurveLabelM.visible = false;
      demoC1TanStartLabel.visible = false;
      demoC1TanEndLabel.visible = false;
      demoC2TanStartLabel.visible = false;
      demoC2TanEndLabel.visible = false;
      demoCMTanStartLabel.visible = false;
      demoCMTanEndLabel.visible = false;
      demoSegGreenA1Label.visible = false;
      demoSegGreenB1Label.visible = false;
      demoSegRedA2Label.visible = false;
      demoSegRedB2Label.visible = false;
      demoProjS1MidOnA1Label.visible = false;
      demoProjS1MidOnB1Label.visible = false;
      demoProjS1MidOnAB1Label.visible = false;
      demoProjS1MidOnABaseLabel.visible = false;
      demoProjS2MidOnA2Label.visible = false;
      demoProjS2MidOnB2Label.visible = false;
      demoProjS2MidOnAB2Label.visible = false;
      demoProjS2MidOnABaseLabel.visible = false;
  
      const rectAX0 = demoRectState.a.x;
      const rectAY0 = demoRectState.a.y;
      const rectAX1 = demoRectState.a.x + rectA.w;
      const rectAY1 = demoRectState.a.y + rectA.h;
      const rectBX0 = demoRectState.b.x;
      const rectBY0 = demoRectState.b.y;
      const rectBX1 = demoRectState.b.x + rectB.w;
      const rectBY1 = demoRectState.b.y + rectB.h;
      const rectACenter = { x: rectAX0 + rectA.w / 2, y: rectAY0 + rectA.h / 2 };
      const rectBCenter = { x: rectBX0 + rectB.w / 2, y: rectBY0 + rectB.h / 2 };
      const toB = { x: rectBCenter.x - rectACenter.x, y: rectBCenter.y - rectACenter.y };
      const toA = { x: -toB.x, y: -toB.y };
  
      const pickOther = (
        seg: { p1: { x: number; y: number }; p2: { x: number; y: number } },
        anchor: { x: number; y: number }
      ) =>
        Math.hypot(seg.p1.x - anchor.x, seg.p1.y - anchor.y) <
        Math.hypot(seg.p2.x - anchor.x, seg.p2.y - anchor.y)
          ? seg.p2
          : seg.p1;
  
      const lineIntersection = (
        a1: { x: number; y: number },
        a2: { x: number; y: number },
        b1: { x: number; y: number },
        b2: { x: number; y: number }
      ) => {
        const d1x = a2.x - a1.x;
        const d1y = a2.y - a1.y;
        const d2x = b2.x - b1.x;
        const d2y = b2.y - b1.y;
        const denom = d1x * d2y - d1y * d2x;
        if (Math.abs(denom) < 1e-6) return null;
        const t = ((b1.x - a1.x) * d2y - (b1.y - a1.y) * d2x) / denom;
        return { x: a1.x + d1x * t, y: a1.y + d1y * t };
      };
  
      const pickGreen = (
        anchor: { x: number; y: number },
        rectX0: number,
        rectY0: number,
        rectX1: number,
        rectY1: number,
        toOther: { x: number; y: number },
        color: number
      ) => {
        const candidates: Array<{ score: number; x1: number; y1: number; x2: number; y2: number }> = [];
        if (Math.abs(anchor.y - rectY0) <= 0.5) {
          candidates.push({ score: -(toOther.y), x1: rectX0, y1: rectY0, x2: rectX1, y2: rectY0 });
        }
        if (Math.abs(anchor.y - rectY1) <= 0.5) {
          candidates.push({ score: toOther.y, x1: rectX0, y1: rectY1, x2: rectX1, y2: rectY1 });
        }
        if (Math.abs(anchor.x - rectX0) <= 0.5) {
          candidates.push({ score: -(toOther.x), x1: rectX0, y1: rectY0, x2: rectX0, y2: rectY1 });
        }
        if (Math.abs(anchor.x - rectX1) <= 0.5) {
          candidates.push({ score: toOther.x, x1: rectX1, y1: rectY0, x2: rectX1, y2: rectY1 });
        }
        if (!candidates.length) return null;
        const best = candidates.reduce((acc, cur) => (cur.score > acc.score ? cur : acc), candidates[0]);
        hullGfx.moveTo(best.x1, best.y1);
        hullGfx.lineTo(best.x2, best.y2);
        hullGfx.stroke({ width: 1, color, alpha: 0.75 });
        return { p1: { x: best.x1, y: best.y1 }, p2: { x: best.x2, y: best.y2 } };
      };
  
      let seg1GreenA: { p1: { x: number; y: number }; p2: { x: number; y: number } } | null = null;
      let seg1GreenB: { p1: { x: number; y: number }; p2: { x: number; y: number } } | null = null;
      let seg2RedA: { p1: { x: number; y: number }; p2: { x: number; y: number } } | null = null;
      let seg2RedB: { p1: { x: number; y: number }; p2: { x: number; y: number } } | null = null;
  
      const drawCurvesForSegment = (
        seg: { a: { x: number; y: number }; b: { x: number; y: number } },
        color: number,
        isSeg1: boolean
      ) => {
        const aOnRectA = isOnRectA(seg.a);
        const bOnRectA = isOnRectA(seg.b);
        const endA = aOnRectA ? seg.a : seg.b;
        const endB = aOnRectA ? seg.b : seg.a;
        const anchorA = aOnRectA ? seg.a : bOnRectA ? seg.b : null;
        const anchorB = isOnRectB(seg.a) ? seg.a : isOnRectB(seg.b) ? seg.b : null;
        if (!anchorA || !anchorB) return;
        const rectAGreen = pickGreen(anchorA, rectAX0, rectAY0, rectAX1, rectAY1, toB, color);
        const rectBGreen = pickGreen(anchorB, rectBX0, rectBY0, rectBX1, rectBY1, toA, color);
        if (!rectAGreen || !rectBGreen) return;
        if (isSeg1) {
          seg1GreenA = rectAGreen;
          seg1GreenB = rectBGreen;
        } else {
          seg2RedA = rectAGreen;
          seg2RedB = rectBGreen;
        }
      };
  
      bridgeEdges.slice(0, 2).forEach((seg, idx) =>
        drawCurvesForSegment(seg, idx === 0 ? s1Color : s2Color, idx === 0)
      );
  
      const ptA = rectACenter;
      const ptB = rectBCenter;
      hullGfx.circle(ptA.x, ptA.y, 4);
      hullGfx.circle(ptB.x, ptB.y, 4);
      hullGfx.fill({ color: 0xffd86b, alpha: 0.9 });
      queueLabel('A', demoGreenCornerLabelA, ptA, 'point', 300, undefined, 'tr');
      queueLabel('B', demoGreenCornerLabelB, ptB, 'point', 300, undefined, 'tr');
  
      const midX = (ptA.x + ptB.x) / 2;
      const midY = (ptA.y + ptB.y) / 2;
      const abMid = { x: midX, y: midY };
      hullGfx.circle(abMid.x, abMid.y, 4);
      hullGfx.fill({ color: 0xffd86b, alpha: 0.9 });
      queueLabel('M', demoGreenMidLabel, abMid, 'point', 220, undefined, 'tr');
  
      const projOnLine = (p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => {
        const vx = b.x - a.x;
        const vy = b.y - a.y;
        const denom = vx * vx + vy * vy;
        if (denom <= 1e-6) return null;
        const t = ((p.x - a.x) * vx + (p.y - a.y) * vy) / denom;
        return { x: a.x + t * vx, y: a.y + t * vy };
      };
  
      const seg1A = seg1GreenA as unknown as { p1: { x: number; y: number }; p2: { x: number; y: number } } | null;
      const seg1B = seg1GreenB as unknown as { p1: { x: number; y: number }; p2: { x: number; y: number } } | null;
      let pas1mPoint: { x: number; y: number } | null = null;
      let pbs1mPoint: { x: number; y: number } | null = null;
      let ps1mPoint: { x: number; y: number } | null = null;
      let pms1mPoint: { x: number; y: number } | null = null;
      if (seg1A) {
        const mx = (seg1A.p1.x + seg1A.p2.x) * 0.5;
        const my = (seg1A.p1.y + seg1A.p2.y) * 0.5;
        queueLabel(
          'S1A',
          demoSegGreenA1Label,
          { x: mx, y: my },
          'segment',
          210,
          { x: seg1A.p2.x - seg1A.p1.x, y: seg1A.p2.y - seg1A.p1.y }
        );
      }
      if (seg1B) {
        const mx = (seg1B.p1.x + seg1B.p2.x) * 0.5;
        const my = (seg1B.p1.y + seg1B.p2.y) * 0.5;
        queueLabel(
          'S1B',
          demoSegGreenB1Label,
          { x: mx, y: my },
          'segment',
          210,
          { x: seg1B.p2.x - seg1B.p1.x, y: seg1B.p2.y - seg1B.p1.y }
        );
      }
      if (s1Mid && seg1A && demoProjS1MidOnA1Label) {
        const pas1m = projOnLine(s1Mid, seg1A.p1, seg1A.p2);
        if (pas1m) {
          pas1mPoint = pas1m;
          hullGfx.circle(pas1m.x, pas1m.y, 4);
          hullGfx.fill({ color: s1Color, alpha: 0.9 });
          demoProjS1MidOnA1Label.tint = s1Color;
          queueLabel('PAS1M', demoProjS1MidOnA1Label, pas1m, 'point', 230, undefined, 'tr');
        }
      }
      if (s1Mid && seg1B && demoProjS1MidOnB1Label) {
        const pbs1m = projOnLine(s1Mid, seg1B.p1, seg1B.p2);
        if (pbs1m) {
          pbs1mPoint = pbs1m;
          hullGfx.circle(pbs1m.x, pbs1m.y, 4);
          hullGfx.fill({ color: s1Color, alpha: 0.9 });
          demoProjS1MidOnB1Label.tint = s1Color;
          queueLabel('PBS1M', demoProjS1MidOnB1Label, pbs1m, 'point', 230, undefined, 'tr');
        }
      }
      if (pas1mPoint && pbs1mPoint) {
        hullGfx.moveTo(pas1mPoint.x, pas1mPoint.y);
        hullGfx.lineTo(pbs1mPoint.x, pbs1mPoint.y);
        hullGfx.stroke({ width: 1, color: s1Color, alpha: 0.75 });
      }
      if (s1Mid && pas1mPoint && pbs1mPoint && demoProjS1MidOnAB1Label) {
        const ps1m = projOnLine(s1Mid, pas1mPoint, pbs1mPoint);
        if (ps1m) {
          ps1mPoint = ps1m;
          hullGfx.circle(ps1m.x, ps1m.y, 4);
          hullGfx.fill({ color: s1Color, alpha: 0.9 });
          demoProjS1MidOnAB1Label.tint = s1Color;
          queueLabel('PS1M', demoProjS1MidOnAB1Label, ps1m, 'point', 240, undefined, 'tr');
        }
      }
      if (s1Mid && ps1mPoint && demoProjS1MidOnABaseLabel) {
        const pms1m = lineIntersection(s1Mid, ps1mPoint, ptA, ptB);
        if (pms1m) {
          pms1mPoint = pms1m;
          hullGfx.circle(pms1m.x, pms1m.y, 4);
          hullGfx.fill({ color: s1Color, alpha: 0.9 });
          demoProjS1MidOnABaseLabel.tint = s1Color;
          queueLabel('PMS1M', demoProjS1MidOnABaseLabel, pms1m, 'point', 240, undefined, 'tr');
        }
      }
  
      if (abMid && seg1A) {
        const p1a = projOnLine(abMid, seg1A.p1, seg1A.p2);
        if (p1a) {
          hullGfx.circle(p1a.x, p1a.y, 4);
          hullGfx.fill({ color: s1Color, alpha: 0.9 });
          queueLabel('P1A', demoGreenProjLabelA, p1a, 'point', 180, undefined, 'tr');
        }
      }
      if (abMid && seg1B) {
        const p1b = projOnLine(abMid, seg1B.p1, seg1B.p2);
        if (p1b) {
          hullGfx.circle(p1b.x, p1b.y, 4);
          hullGfx.fill({ color: s1Color, alpha: 0.9 });
          queueLabel('P1B', demoGreenProjLabelB, p1b, 'point', 180, undefined, 'tr');
        }
      }
      const seg2A = seg2RedA as unknown as { p1: { x: number; y: number }; p2: { x: number; y: number } } | null;
      const seg2B = seg2RedB as unknown as { p1: { x: number; y: number }; p2: { x: number; y: number } } | null;
      let pas2mPoint: { x: number; y: number } | null = null;
      let pbs2mPoint: { x: number; y: number } | null = null;
      let ps2mPoint: { x: number; y: number } | null = null;
      let pms2mPoint: { x: number; y: number } | null = null;
      if (seg2A) {
        const mx = (seg2A.p1.x + seg2A.p2.x) * 0.5;
        const my = (seg2A.p1.y + seg2A.p2.y) * 0.5;
        queueLabel(
          'S2A',
          demoSegRedA2Label,
          { x: mx, y: my },
          'segment',
          210,
          { x: seg2A.p2.x - seg2A.p1.x, y: seg2A.p2.y - seg2A.p1.y }
        );
      }
      if (seg2B) {
        const mx = (seg2B.p1.x + seg2B.p2.x) * 0.5;
        const my = (seg2B.p1.y + seg2B.p2.y) * 0.5;
        queueLabel(
          'S2B',
          demoSegRedB2Label,
          { x: mx, y: my },
          'segment',
          210,
          { x: seg2B.p2.x - seg2B.p1.x, y: seg2B.p2.y - seg2B.p1.y }
        );
      }
      if (s2Mid && seg2A && demoProjS2MidOnA2Label) {
        const pas2m = projOnLine(s2Mid, seg2A.p1, seg2A.p2);
        if (pas2m) {
          pas2mPoint = pas2m;
          hullGfx.circle(pas2m.x, pas2m.y, 4);
          hullGfx.fill({ color: s2Color, alpha: 0.9 });
          demoProjS2MidOnA2Label.tint = s2Color;
          queueLabel('PAS2M', demoProjS2MidOnA2Label, pas2m, 'point', 230, undefined, 'tr');
        }
      }
      if (s2Mid && seg2B && demoProjS2MidOnB2Label) {
        const pbs2m = projOnLine(s2Mid, seg2B.p1, seg2B.p2);
        if (pbs2m) {
          pbs2mPoint = pbs2m;
          hullGfx.circle(pbs2m.x, pbs2m.y, 4);
          hullGfx.fill({ color: s2Color, alpha: 0.9 });
          demoProjS2MidOnB2Label.tint = s2Color;
          queueLabel('PBS2M', demoProjS2MidOnB2Label, pbs2m, 'point', 230, undefined, 'tr');
        }
      }
      if (pas2mPoint && pbs2mPoint) {
        hullGfx.moveTo(pas2mPoint.x, pas2mPoint.y);
        hullGfx.lineTo(pbs2mPoint.x, pbs2mPoint.y);
        hullGfx.stroke({ width: 1, color: s2Color, alpha: 0.75 });
      }
      if (s2Mid && pas2mPoint && pbs2mPoint && demoProjS2MidOnAB2Label) {
        const ps2m = projOnLine(s2Mid, pas2mPoint, pbs2mPoint);
        if (ps2m) {
          ps2mPoint = ps2m;
          hullGfx.circle(ps2m.x, ps2m.y, 4);
          hullGfx.fill({ color: s2Color, alpha: 0.9 });
          demoProjS2MidOnAB2Label.tint = s2Color;
          queueLabel('PS2M', demoProjS2MidOnAB2Label, ps2m, 'point', 240, undefined, 'tr');
        }
      }
      if (s2Mid && ps2mPoint && demoProjS2MidOnABaseLabel) {
        const pms2m = lineIntersection(s2Mid, ps2mPoint, ptA, ptB);
        if (pms2m) {
          pms2mPoint = pms2m;
          hullGfx.circle(pms2m.x, pms2m.y, 4);
          hullGfx.fill({ color: s2Color, alpha: 0.9 });
          demoProjS2MidOnABaseLabel.tint = s2Color;
          queueLabel('PMS2M', demoProjS2MidOnABaseLabel, pms2m, 'point', 240, undefined, 'tr');
        }
      }
  
      if (abMid && seg2A) {
        const p2a = projOnLine(abMid, seg2A.p1, seg2A.p2);
        if (p2a) {
          hullGfx.circle(p2a.x, p2a.y, 4);
          hullGfx.fill({ color: s2Color, alpha: 0.9 });
          queueLabel('P2A', demoRedProjLabelA, p2a, 'point', 180, undefined, 'tr');
        }
      }
      if (abMid && seg2B) {
        const p2b = projOnLine(abMid, seg2B.p1, seg2B.p2);
        if (p2b) {
          hullGfx.circle(p2b.x, p2b.y, 4);
          hullGfx.fill({ color: s2Color, alpha: 0.9 });
          queueLabel('P2B', demoRedProjLabelB, p2b, 'point', 180, undefined, 'tr');
        }
      }
  
      let interI1: { x: number; y: number } | null = null;
      let interI2: { x: number; y: number } | null = null;
      if (seg1A && seg1B) {
        interI1 = lineIntersection(seg1A.p1, seg1A.p2, seg1B.p1, seg1B.p2);
        if (interI1) {
          hullGfx.circle(interI1.x, interI1.y, 4);
          hullGfx.fill({ color: s1Color, alpha: 0.9 });
          queueLabel('I1', demoGreenIntersectionLabel, interI1, 'point', 290, undefined, 'tr');
        }
      }
      if (seg2A && seg2B) {
        interI2 = lineIntersection(seg2A.p1, seg2A.p2, seg2B.p1, seg2B.p2);
        if (interI2) {
          hullGfx.circle(interI2.x, interI2.y, 4);
          hullGfx.fill({ color: s2Color, alpha: 0.9 });
          queueLabel('I2', demoRedIntersectionLabel, interI2, 'point', 290, undefined, 'tr');
        }
      }
  
      const samePoint = (a: { x: number; y: number }, b: { x: number; y: number }) =>
        Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
  
      const seg1 = bridgeEdges[0];
      const orderSegment = (seg: { a: { x: number; y: number }; b: { x: number; y: number } }) => {
        const aOnA = isOnRectA(seg.a);
        const aOnB = isOnRectB(seg.a);
        const bOnA = isOnRectA(seg.b);
        const bOnB = isOnRectB(seg.b);
        if (aOnA && bOnB) return { start: seg.a, end: seg.b };
        if (bOnA && aOnB) return { start: seg.b, end: seg.a };
        // Fallback for ambiguous edge cases: keep previous distance heuristic.
        const da = Math.hypot(seg.a.x - rectACenter.x, seg.a.y - rectACenter.y);
        const db = Math.hypot(seg.b.x - rectACenter.x, seg.b.y - rectACenter.y);
        return da <= db ? { start: seg.a, end: seg.b } : { start: seg.b, end: seg.a };
      };
      let c1Start: { x: number; y: number } | null = null;
      let c1End: { x: number; y: number } | null = null;
      let c1Control: { x: number; y: number } | null = null;
      if (seg1 && abMid) {
        const ordered = orderSegment(seg1);
        const candidates: Array<{ x: number; y: number }> = [];
        if (ps1mPoint) candidates.push(ps1mPoint);
        if (pms1mPoint) candidates.push(pms1mPoint);
        if (candidates.length) {
          const distScore = (p: { x: number; y: number }) =>
            Math.hypot(p.x - ordered.start.x, p.y - ordered.start.y) + Math.hypot(p.x - ordered.end.x, p.y - ordered.end.y);
          const best = candidates.reduce((acc, cur) => (distScore(cur) < distScore(acc) ? cur : acc), candidates[0]);
          c1Start = ordered.start;
          c1End = ordered.end;
          c1Control = best;
          const bestColor =
            samePoint(best, abMid) ? 0xffd86b : s1Color;
          hullGfx.circle(best.x, best.y, 7);
          hullGfx.fill({ color: bestColor, alpha: 0.95 });
          hullGfx.moveTo(c1Start.x, c1Start.y);
          hullGfx.quadraticCurveTo(best.x, best.y, c1End.x, c1End.y);
          hullGfx.stroke({ width: 2.5, color: s1Color, alpha: 0.9 });
          const c1MidX = 0.25 * c1Start.x + 0.5 * best.x + 0.25 * c1End.x;
          const c1MidY = 0.25 * c1Start.y + 0.5 * best.y + 0.25 * c1End.y;
          queueLabel(
            'C1',
            demoCurveLabel1,
            { x: c1MidX, y: c1MidY },
            'curve',
            150,
            { x: c1End.x - c1Start.x, y: c1End.y - c1Start.y }
          );
        }
      }
  
      const seg2 = bridgeEdges[1];
      let c2Start: { x: number; y: number } | null = null;
      let c2End: { x: number; y: number } | null = null;
      let c2Control: { x: number; y: number } | null = null;
      if (seg2 && abMid) {
        const ordered = orderSegment(seg2);
        const candidates: Array<{ x: number; y: number }> = [];
        if (ps2mPoint) candidates.push(ps2mPoint);
        if (pms2mPoint) candidates.push(pms2mPoint);
        if (candidates.length) {
          const distScore = (p: { x: number; y: number }) =>
            Math.hypot(p.x - ordered.start.x, p.y - ordered.start.y) + Math.hypot(p.x - ordered.end.x, p.y - ordered.end.y);
          const best = candidates.reduce((acc, cur) => (distScore(cur) < distScore(acc) ? cur : acc), candidates[0]);
          c2Start = ordered.start;
          c2End = ordered.end;
          c2Control = best;
          const bestColor =
            samePoint(best, abMid) ? 0xffd86b : s2Color;
          hullGfx.circle(best.x, best.y, 7);
          hullGfx.fill({ color: bestColor, alpha: 0.95 });
          hullGfx.moveTo(c2Start.x, c2Start.y);
          hullGfx.quadraticCurveTo(best.x, best.y, c2End.x, c2End.y);
          hullGfx.stroke({ width: 2.5, color: s2Color, alpha: 0.9 });
          const c2MidX = 0.25 * c2Start.x + 0.5 * best.x + 0.25 * c2End.x;
          const c2MidY = 0.25 * c2Start.y + 0.5 * best.y + 0.25 * c2End.y;
          queueLabel(
            'C2',
            demoCurveLabel2,
            { x: c2MidX, y: c2MidY },
            'curve',
            150,
            { x: c2End.x - c2Start.x, y: c2End.y - c2Start.y }
          );
        }
      }
  
      const quadPoint = (
        p0: { x: number; y: number },
        p1: { x: number; y: number },
        p2: { x: number; y: number },
        t: number
      ) => {
        const mt = 1 - t;
        const mt2 = mt * mt;
        const t2 = t * t;
        return {
          x: mt2 * p0.x + 2 * mt * t * p1.x + t2 * p2.x,
          y: mt2 * p0.y + 2 * mt * t * p1.y + t2 * p2.y
        };
      };
  
      const quadTangent = (
        p0: { x: number; y: number },
        p1: { x: number; y: number },
        p2: { x: number; y: number },
        t: number
      ) => ({
        x: 2 * (1 - t) * (p1.x - p0.x) + 2 * t * (p2.x - p1.x),
        y: 2 * (1 - t) * (p1.y - p0.y) + 2 * t * (p2.y - p1.y)
      });

      const computeTangentExtension = (
        anchor: { x: number; y: number },
        tangent: { x: number; y: number },
        outwardSign: 1 | -1,
        extendLen = 130
      ) => {
        const len = Math.hypot(tangent.x, tangent.y);
        if (len < 1e-6) {
          return null;
        }
        const dir = { x: (tangent.x / len) * outwardSign, y: (tangent.y / len) * outwardSign };
        const end = { x: anchor.x + dir.x * extendLen, y: anchor.y + dir.y * extendLen };
        return { start: anchor, end };
      };

      const drawTangentExtension = (
        ray: { start: { x: number; y: number }; end: { x: number; y: number } } | null,
        color: number,
        label?: BitmapText | null
      ) => {
        if (!ray) {
          if (label) label.visible = false;
          return;
        }
        hullGfx.moveTo(ray.start.x, ray.start.y);
        hullGfx.lineTo(ray.end.x, ray.end.y);
        hullGfx.stroke({ width: 1, color, alpha: 0.6 });
        if (!label) return;
        label.tint = color;
        queueLabel(
          `tan:${label.text}`,
          label,
          ray.end,
          'segment',
          120,
          { x: ray.end.x - ray.start.x, y: ray.end.y - ray.start.y }
        );
      };

      if (c1Start && c1Control && c1End && c2Start && c2Control && c2End) {
        const c1TanStart = quadTangent(c1Start, c1Control, c1End, 0);
        const c1TanEnd = quadTangent(c1Start, c1Control, c1End, 1);
        const c2TanStart = quadTangent(c2Start, c2Control, c2End, 0);
        const c2TanEnd = quadTangent(c2Start, c2Control, c2End, 1);
        const c1StartRay = computeTangentExtension(c1Start, c1TanStart, -1);
        const c1EndRay = computeTangentExtension(c1End, c1TanEnd, 1);
        const c2StartRay = computeTangentExtension(c2Start, c2TanStart, -1);
        const c2EndRay = computeTangentExtension(c2End, c2TanEnd, 1);
        drawTangentExtension(c1StartRay, s1Color, demoC1TanStartLabel);
        drawTangentExtension(c1EndRay, s1Color, demoC1TanEndLabel);
        drawTangentExtension(c2StartRay, s2Color, demoC2TanStartLabel);
        drawTangentExtension(c2EndRay, s2Color, demoC2TanEndLabel);
        const cmStartRay =
          c1StartRay && c2StartRay
            ? {
                start: {
                  x: (c1StartRay.start.x + c2StartRay.start.x) / 2,
                  y: (c1StartRay.start.y + c2StartRay.start.y) / 2
                },
                end: {
                  x: (c1StartRay.end.x + c2StartRay.end.x) / 2,
                  y: (c1StartRay.end.y + c2StartRay.end.y) / 2
                }
              }
            : null;
        const cmEndRay =
          c1EndRay && c2EndRay
            ? {
                start: {
                  x: (c1EndRay.start.x + c2EndRay.start.x) / 2,
                  y: (c1EndRay.start.y + c2EndRay.start.y) / 2
                },
                end: {
                  x: (c1EndRay.end.x + c2EndRay.end.x) / 2,
                  y: (c1EndRay.end.y + c2EndRay.end.y) / 2
                }
              }
            : null;
        drawTangentExtension(cmStartRay, 0x7dd3fc, demoCMTanStartLabel);
        drawTangentExtension(cmEndRay, 0x7dd3fc, demoCMTanEndLabel);

        const steps = 40;
        for (let i = 0; i <= steps; i += 1) {
          const t = i / steps;
          const p1 = quadPoint(c1Start, c1Control, c1End, t);
          const p2 = quadPoint(c2Start, c2Control, c2End, t);
          const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
          if (i === 0) hullGfx.moveTo(mid.x, mid.y);
          else hullGfx.lineTo(mid.x, mid.y);
        }
        hullGfx.stroke({ width: 2, color: 0x7dd3fc, alpha: 0.85 });
        const cmT = 0.5;
        const cmP1 = quadPoint(c1Start, c1Control, c1End, cmT);
        const cmP2 = quadPoint(c2Start, c2Control, c2End, cmT);
        const cmMid = { x: (cmP1.x + cmP2.x) / 2, y: (cmP1.y + cmP2.y) / 2 };
        if (demoCurveLabelM) {
          demoCurveLabelM.tint = 0x7dd3fc;
          queueLabel(
            'CM',
            demoCurveLabelM,
            cmMid,
            'curve',
            140,
            { x: c2Start.x - c1Start.x, y: c2Start.y - c1Start.y },
            'br'
          );
        }

      }

      const placedLabelRects = placeLabels(w, h, labelRequests);
      if (SHOW_LABEL_CONVEX_RECTS) {
        const resolveLabelColor = (label: BitmapText) => {
          if (typeof label.tint === 'number' && Number.isFinite(label.tint) && label.tint !== 0xffffff) {
            return label.tint;
          }
          const fill = (label as unknown as { style?: { fill?: unknown } }).style?.fill;
          if (typeof fill === 'number' && Number.isFinite(fill)) return fill;
          if (Array.isArray(fill)) {
            const first = fill.find((v) => typeof v === 'number');
            if (typeof first === 'number') return first;
          }
          if (typeof label.tint === 'number' && Number.isFinite(label.tint)) return label.tint;
          return 0xffffff;
        };
        for (const { req, rect } of placedLabelRects) {
          const color = resolveLabelColor(req.label);
          hullGfx.circle(req.anchor.x, req.anchor.y, LABEL_ANCHOR_DISTANCE);
          hullGfx.stroke({ width: 1, color, alpha: 0.28 });
          hullGfx.rect(rect.x, rect.y, rect.width, rect.height);
          hullGfx.stroke({ width: 1, color, alpha: 0.55 });
        }
      }
  
    };
  
    // Toolbar
    const toolbar = new Graphics();
    toolbar.roundRect(padding, padding, w - padding * 2, toolbarHeight, 12);
    toolbar.fill({ color: 0x0c1019, alpha: 0.9 });
    toolbar.stroke({ width: 1, color: 0x1c2637, alpha: 0.7 });
    uiLayer.addChild(toolbar);
  
    const startDemoDrag = (target: 'a' | 'b', evt: any) => {
      evt.stopPropagation();
      const p = evt.global ?? { x: evt.clientX ?? 0, y: evt.clientY ?? 0 };
      const pos = target === 'a' ? demoRectState.a : demoRectState.b;
      demoDragTarget = target;
      demoDragOffset = { x: p.x - pos.x, y: p.y - pos.y };
      if (!demoDragMoveHandler) {
        demoDragMoveHandler = (e: PointerEvent) => {
          if (!demoDragTarget) return;
          const next = toCanvasPoint(e.clientX, e.clientY);
          const nextPos = {
            x: next.x - demoDragOffset.x,
            y: next.y - demoDragOffset.y
          };
          if (demoDragTarget === 'a') {
            demoRectState.a = nextPos;
            demoRectAContainer?.position.set(nextPos.x, nextPos.y);
          } else {
            demoRectState.b = nextPos;
            demoRectBContainer?.position.set(nextPos.x, nextPos.y);
          }
          drawHull();
        };
      }
      if (!demoDragEndHandler) {
        demoDragEndHandler = () => {
          demoDragTarget = null;
          if (demoDragMoveHandler) {
            window.removeEventListener('pointermove', demoDragMoveHandler);
          }
          if (demoDragEndHandler) {
            window.removeEventListener('pointerup', demoDragEndHandler);
          }
        };
      }
      window.addEventListener('pointermove', demoDragMoveHandler);
      window.addEventListener('pointerup', demoDragEndHandler);
    };
  
    demoHull = new Graphics();
    demoHull.eventMode = 'none';
    demoHull.zIndex = 9990;
    uiLayer.addChild(demoHull);
  
    demoRectAContainer = new Container();
    demoRectAContainer.position.set(demoRectState.a.x, demoRectState.a.y);
    demoRectAContainer.eventMode = 'static';
    demoRectAContainer.cursor = 'pointer';
    demoRectAContainer.on('pointerdown', (evt) => startDemoDrag('a', evt));
    demoRectA = new Graphics();
    demoRectA.roundRect(0, 0, rectA.w, rectA.h, rectA.r);
    demoRectA.fill({ color: 0x1f2a3f, alpha: 0.9 });
    demoRectA.stroke({ width: 1, color: 0x5aa7ff, alpha: 0.7 });
    const rectALabel = createBitmapTextNode('Rectangle A', { fill: 0xdfe8ff, fontSize: 14, fontWeight: '600' });
    rectALabel.position.set(12, 10);
    demoRectAContainer.addChild(demoRectA, rectALabel);
    uiLayer.addChild(demoRectAContainer);
  
    demoRectBContainer = new Container();
    demoRectBContainer.position.set(demoRectState.b.x, demoRectState.b.y);
    demoRectBContainer.eventMode = 'static';
    demoRectBContainer.cursor = 'pointer';
    demoRectBContainer.on('pointerdown', (evt) => startDemoDrag('b', evt));
    demoRectB = new Graphics();
    demoRectB.roundRect(0, 0, 210, 120, 12);
    demoRectB.fill({ color: 0x223149, alpha: 0.88 });
    demoRectB.stroke({ width: 1, color: 0x8bb9ff, alpha: 0.7 });
    const rectBLabel = createBitmapTextNode('Rectangle B', { fill: 0xdfe8ff, fontSize: 14, fontWeight: '600' });
    rectBLabel.position.set(12, 12);
    demoRectBContainer.addChild(demoRectB, rectBLabel);
    uiLayer.addChild(demoRectBContainer);
  
    drawHull();
  
}

async function init() {
  app = new Application();
  await app.init({
    resizeTo: window,
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1
  });
  const mount = document.getElementById('geometryCanvas') ?? document.body;
  mount.appendChild(app.canvas);
  uiLayer = new Container();
  uiLayer.sortableChildren = true;
  app.stage.addChild(uiLayer);
  renderGeometry();
  window.addEventListener('resize', () => renderGeometry());
}

init();
