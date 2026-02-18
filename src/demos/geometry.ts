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
let demoHull: Graphics | null = null;
let demoHullLabelA: BitmapText | null = null;
let demoHullLabelB: BitmapText | null = null;
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
let demoRectState = {
  initialized: false,
  a: { x: 0, y: 0 },
  b: { x: 0, y: 0 }
};
let demoEllipseCenterT = 0;
let demoEllipsePanel: Container | null = null;
let demoEllipsePanelBg: Graphics | null = null;
let demoEllipsePanelDragOffset = { x: 0, y: 0 };
let demoEllipsePanelDragMoveHandler: ((e: PointerEvent) => void) | null = null;
let demoEllipsePanelDragEndHandler: ((e: PointerEvent) => void) | null = null;
let demoEllipseSliderTrack: Graphics | null = null;
let demoEllipseSliderHandle: Graphics | null = null;
let demoEllipseSliderLabel: BitmapText | null = null;
let demoEllipseFocusTrack: Graphics | null = null;
let demoEllipseFocusHandle: Graphics | null = null;
let demoEllipseFocusLabel: BitmapText | null = null;
let demoEllipseAxisTrack: Graphics | null = null;
let demoEllipseAxisHandle: Graphics | null = null;
let demoEllipseAxisLabel: BitmapText | null = null;
let demoEllipseAngleTrack: Graphics | null = null;
let demoEllipseAngleHandle: Graphics | null = null;
let demoEllipseAngleLabel: BitmapText | null = null;
let demoEllipseDragMoveHandler: ((e: PointerEvent) => void) | null = null;
let demoEllipseDragEndHandler: ((e: PointerEvent) => void) | null = null;
let demoEllipseAngleDragMoveHandler: ((e: PointerEvent) => void) | null = null;
let demoEllipseAngleDragEndHandler: ((e: PointerEvent) => void) | null = null;
let demoEllipseAngleT = 0.5;
let demoEllipseFocusT = 0.3;
let demoEllipseAxisT = 0.5;
let demoEllipseFocusDragMoveHandler: ((e: PointerEvent) => void) | null = null;
let demoEllipseFocusDragEndHandler: ((e: PointerEvent) => void) | null = null;
let demoEllipseAxisDragMoveHandler: ((e: PointerEvent) => void) | null = null;
let demoEllipseAxisDragEndHandler: ((e: PointerEvent) => void) | null = null;
let demoEllipseSolveT = 0.5;
let demoEllipseSolvePanel: Container | null = null;
let demoEllipseSolvePanelBg: Graphics | null = null;
let demoEllipseSolvePanelDragOffset = { x: 0, y: 0 };
let demoEllipseSolvePanelDragMoveHandler: ((e: PointerEvent) => void) | null = null;
let demoEllipseSolvePanelDragEndHandler: ((e: PointerEvent) => void) | null = null;
let demoEllipseSolveTrack: Graphics | null = null;
let demoEllipseSolveHandle: Graphics | null = null;
let demoEllipseSolveLabel: BitmapText | null = null;
let demoEllipseSolveDragMoveHandler: ((e: PointerEvent) => void) | null = null;
let demoEllipseSolveDragEndHandler: ((e: PointerEvent) => void) | null = null;
let demoDragTarget: 'a' | 'b' | null = null;
let demoDragOffset = { x: 0, y: 0 };
let demoDragMoveHandler: ((e: PointerEvent) => void) | null = null;
let demoDragEndHandler: ((e: PointerEvent) => void) | null = null;

const toCanvasPoint = (clientX: number, clientY: number) => {
  const rect = app.canvas.getBoundingClientRect();
  return { x: clientX - rect.left, y: clientY - rect.top };
};

function renderGeometry() {
  const w = Math.round(app.renderer.width);
  const h = Math.round(app.renderer.height);
    if (!demoRectState.initialized) {
      demoRectState.initialized = true;
      demoRectState.a = { x: w / 2 - 220, y: h / 2 - 70 };
      demoRectState.b = { x: w / 2 + 20, y: h / 2 + 20 };
    }
    const rectA = { w: 150, h: 90, r: 10 };
    const rectB = { w: 210, h: 120, r: 12 };
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
      const labels = [demoHullLabelA, demoHullLabelB];
      labels.forEach((label) => {
        if (!label?.parent) uiLayer.addChild(label);
        label.visible = false;
      });
      bridgeEdges.slice(0, 2).forEach(({ a, b }, idx) => {
        const label = labels[idx];
        if (!label) return;
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        label.text = idx === 0 ? 'S1' : 'S2';
        label.position.set(midX + 6, midY - 18);
        label.visible = true;
        label.tint = idx === 0 ? s1Color : s2Color;
      });
  
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
      if (demoCurveLabel1.parent === null) uiLayer.addChild(demoCurveLabel1);
      if (demoCurveLabel2.parent === null) uiLayer.addChild(demoCurveLabel2);
      demoCurveLabel1.visible = false;
      demoCurveLabel2.visible = false;
  
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
      const centerT = Math.max(0, Math.min(1, demoEllipseCenterT));
      let ellipseCenter = {
        x: ptA.x + (ptB.x - ptA.x) * centerT,
        y: ptA.y + (ptB.y - ptA.y) * centerT
      };
      hullGfx.circle(ptA.x, ptA.y, 4);
      hullGfx.circle(ptB.x, ptB.y, 4);
      hullGfx.fill({ color: 0xffd86b, alpha: 0.9 });
      demoGreenCornerLabelA.position.set(ptA.x + 6, ptA.y - 16);
      demoGreenCornerLabelB.position.set(ptB.x + 6, ptB.y - 16);
      demoGreenCornerLabelA.visible = true;
      demoGreenCornerLabelB.visible = true;
  
      hullGfx.moveTo(ptA.x, ptA.y);
      hullGfx.lineTo(ptB.x, ptB.y);
      hullGfx.stroke({ width: 1, color: 0xffd86b, alpha: 0.85 });
      const midX = (ptA.x + ptB.x) / 2;
      const midY = (ptA.y + ptB.y) / 2;
      const abMid = { x: midX, y: midY };
      hullGfx.circle(abMid.x, abMid.y, 4);
      hullGfx.fill({ color: 0xffd86b, alpha: 0.9 });
      demoGreenMidLabel.position.set(abMid.x + 6, abMid.y - 14);
      demoGreenMidLabel.visible = true;
  
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
  
      if (abMid && seg1A) {
        const p1a = projOnLine(abMid, seg1A.p1, seg1A.p2);
        if (p1a) {
          hullGfx.circle(p1a.x, p1a.y, 4);
          hullGfx.fill({ color: s1Color, alpha: 0.9 });
          demoGreenProjLabelA.position.set(p1a.x + 6, p1a.y - 14);
          demoGreenProjLabelA.visible = true;
        }
      }
      if (abMid && seg1B) {
        const p1b = projOnLine(abMid, seg1B.p1, seg1B.p2);
        if (p1b) {
          hullGfx.circle(p1b.x, p1b.y, 4);
          hullGfx.fill({ color: s1Color, alpha: 0.9 });
          demoGreenProjLabelB.position.set(p1b.x + 6, p1b.y - 14);
          demoGreenProjLabelB.visible = true;
        }
      }
      const seg2A = seg2RedA as unknown as { p1: { x: number; y: number }; p2: { x: number; y: number } } | null;
      const seg2B = seg2RedB as unknown as { p1: { x: number; y: number }; p2: { x: number; y: number } } | null;
  
      if (abMid && seg2A) {
        const p2a = projOnLine(abMid, seg2A.p1, seg2A.p2);
        if (p2a) {
          hullGfx.circle(p2a.x, p2a.y, 4);
          hullGfx.fill({ color: s2Color, alpha: 0.9 });
          demoRedProjLabelA.position.set(p2a.x + 6, p2a.y - 14);
          demoRedProjLabelA.visible = true;
        }
      }
      if (abMid && seg2B) {
        const p2b = projOnLine(abMid, seg2B.p1, seg2B.p2);
        if (p2b) {
          hullGfx.circle(p2b.x, p2b.y, 4);
          hullGfx.fill({ color: s2Color, alpha: 0.9 });
          demoRedProjLabelB.position.set(p2b.x + 6, p2b.y - 14);
          demoRedProjLabelB.visible = true;
        }
      }
  
      let interI1: { x: number; y: number } | null = null;
      let interI2: { x: number; y: number } | null = null;
      if (seg1A && seg1B) {
        interI1 = lineIntersection(seg1A.p1, seg1A.p2, seg1B.p1, seg1B.p2);
        if (interI1) {
          hullGfx.circle(interI1.x, interI1.y, 4);
          hullGfx.fill({ color: s1Color, alpha: 0.9 });
          demoGreenIntersectionLabel.position.set(interI1.x + 6, interI1.y - 14);
          demoGreenIntersectionLabel.visible = true;
        }
      }
      if (seg2A && seg2B) {
        interI2 = lineIntersection(seg2A.p1, seg2A.p2, seg2B.p1, seg2B.p2);
        if (interI2) {
          hullGfx.circle(interI2.x, interI2.y, 4);
          hullGfx.fill({ color: s2Color, alpha: 0.9 });
          demoRedIntersectionLabel.position.set(interI2.x + 6, interI2.y - 14);
          demoRedIntersectionLabel.visible = true;
        }
      }
  
      const samePoint = (a: { x: number; y: number }, b: { x: number; y: number }) =>
        Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
  
      const seg1 = bridgeEdges[0];
      const orderSegment = (seg: { a: { x: number; y: number }; b: { x: number; y: number } }) => {
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
        const p1a = seg1A ? projOnLine(abMid, seg1A.p1, seg1A.p2) : null;
        const p1b = seg1B ? projOnLine(abMid, seg1B.p1, seg1B.p2) : null;
        if (p1a) candidates.push(p1a);
        if (p1b) candidates.push(p1b);
        candidates.push(abMid);
        if (interI1) candidates.push(interI1);
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
        demoCurveLabel1.position.set(c1MidX + 6, c1MidY - 16);
        demoCurveLabel1.visible = true;
      }
  
      const seg2 = bridgeEdges[1];
      let c2Start: { x: number; y: number } | null = null;
      let c2End: { x: number; y: number } | null = null;
      let c2Control: { x: number; y: number } | null = null;
      if (seg2 && abMid) {
        const ordered = orderSegment(seg2);
        const candidates: Array<{ x: number; y: number }> = [];
        const p2a = seg2A ? projOnLine(abMid, seg2A.p1, seg2A.p2) : null;
        const p2b = seg2B ? projOnLine(abMid, seg2B.p1, seg2B.p2) : null;
        if (p2a) candidates.push(p2a);
        if (p2b) candidates.push(p2b);
        candidates.push(abMid);
        if (interI2) candidates.push(interI2);
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
        demoCurveLabel2.position.set(c2MidX + 6, c2MidY - 16);
        demoCurveLabel2.visible = true;
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
  
      if (c1Start && c1Control && c1End && c2Start && c2Control && c2End) {
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
        const c1At = quadPoint(c1Start, c1Control, c1End, centerT);
        const c2At = quadPoint(c2Start, c2Control, c2End, centerT);
        ellipseCenter = { x: (c1At.x + c2At.x) / 2, y: (c1At.y + c2At.y) / 2 };
  
        const solveT = Math.max(0, Math.min(1, demoEllipseSolveT));
        const s1 = quadPoint(c1Start, c1Control, c1End, solveT);
        const s2 = quadPoint(c2Start, c2Control, c2End, solveT);
        const cmPoint = { x: (s1.x + s2.x) / 2, y: (s1.y + s2.y) / 2 };
        hullGfx.circle(cmPoint.x, cmPoint.y, 3);
        hullGfx.fill({ color: 0x9ad9ff, alpha: 0.9 });
        const solve3x3 = (m: number[][], b: number[]) => {
          const a = m.map((row) => row.slice());
          const x = b.slice();
          for (let i = 0; i < 3; i += 1) {
            let max = i;
            for (let r = i + 1; r < 3; r += 1) {
              if (Math.abs(a[r][i]) > Math.abs(a[max][i])) max = r;
            }
            if (Math.abs(a[max][i]) < 1e-8) return null;
            [a[i], a[max]] = [a[max], a[i]];
            [x[i], x[max]] = [x[max], x[i]];
            const div = a[i][i];
            for (let c = i; c < 3; c += 1) a[i][c] /= div;
            x[i] /= div;
            for (let r = 0; r < 3; r += 1) {
              if (r === i) continue;
              const factor = a[r][i];
              for (let c = i; c < 3; c += 1) a[r][c] -= factor * a[i][c];
              x[r] -= factor * x[i];
            }
          }
          return x;
        };
        const ellipseFromTangents = (
          p1: { x: number; y: number },
          t1: { x: number; y: number },
          p2: { x: number; y: number },
          t2: { x: number; y: number }
        ) => {
          const rows = [
            { r: [p1.x * p1.x, 2 * p1.x * p1.y, p1.y * p1.y], b: 1 },
            { r: [t1.x * p1.x, t1.x * p1.y + t1.y * p1.x, t1.y * p1.y], b: 0 },
            { r: [p2.x * p2.x, 2 * p2.x * p2.y, p2.y * p2.y], b: 1 },
            { r: [t2.x * p2.x, t2.x * p2.y + t2.y * p2.x, t2.y * p2.y], b: 0 }
          ];
          const mtm = [
            [0, 0, 0],
            [0, 0, 0],
            [0, 0, 0]
          ];
          const mtb = [0, 0, 0];
          rows.forEach(({ r, b }) => {
            for (let i = 0; i < 3; i += 1) {
              for (let j = 0; j < 3; j += 1) mtm[i][j] += r[i] * r[j];
              mtb[i] += r[i] * b;
            }
          });
          const q = solve3x3(mtm, mtb);
          if (!q) return null;
          const [A, B, C] = q;
          const det = A * C - B * B;
          if (!(A > 0 && C > 0 && det > 1e-8)) return null;
          let residual = 0;
          rows.forEach(({ r, b }) => {
            const v = r[0] * A + r[1] * B + r[2] * C - b;
            residual += v * v;
          });
          return { A, B, C, residual };
        };
        const ellipseAxes = (A: number, B: number, C: number) => {
          const trace = A + C;
          const disc = Math.sqrt((A - C) * (A - C) + 4 * B * B);
          const l1 = (trace + disc) / 2;
          const l2 = (trace - disc) / 2;
          if (l1 <= 0 || l2 <= 0) return;
          const a = 1 / Math.sqrt(l1);
          const b = 1 / Math.sqrt(l2);
          const angle = 0.5 * Math.atan2(2 * B, A - C);
          return { a, b, angle };
        };
        const drawRotatedEllipse = (
          A: number,
          B: number,
          C: number,
          alpha: number,
          width = 1,
          color = 0x9ad9ff
        ) => {
          const axes = ellipseAxes(A, B, C);
          if (!axes) return;
          const { a, b, angle } = axes;
          const cosR = Math.cos(angle);
          const sinR = Math.sin(angle);
          const steps = 64;
          for (let i = 0; i <= steps; i += 1) {
            const t = (i / steps) * Math.PI * 2;
            const x = a * Math.cos(t);
            const y = b * Math.sin(t);
            const rx = x * cosR - y * sinR + cmPoint.x;
            const ry = x * sinR + y * cosR + cmPoint.y;
            if (i === 0) hullGfx.moveTo(rx, ry);
            else hullGfx.lineTo(rx, ry);
          }
          hullGfx.stroke({ width, color, alpha });
        };
  
        const samples = 1000;
        const ellipses: Array<{ A: number; B: number; C: number; residual: number }> = [];
        const eps = 1e-6;
        for (let i = 1; i < samples; i += 1) {
          const tA = i / samples;
          const p1 = quadPoint(c1Start, c1Control, c1End, tA);
          const tg1 = quadTangent(c1Start, c1Control, c1End, tA);
          const p1Local = { x: p1.x - cmPoint.x, y: p1.y - cmPoint.y };
          for (let j = 1; j < samples; j += 1) {
            const tB = j / samples;
            const p2 = quadPoint(c2Start, c2Control, c2End, tB);
            const tg2 = quadTangent(c2Start, c2Control, c2End, tB);
            const p2Local = { x: p2.x - cmPoint.x, y: p2.y - cmPoint.y };
            const ell = ellipseFromTangents(p1Local, tg1, p2Local, tg2);
            if (!ell || ell.residual > 1e-4) continue;
            const dup = ellipses.some(
              (e) => Math.abs(e.A - ell.A) < eps && Math.abs(e.B - ell.B) < eps && Math.abs(e.C - ell.C) < eps
            );
            if (dup) continue;
            ellipses.push({ A: ell.A, B: ell.B, C: ell.C, residual: ell.residual });
          }
        }
        const maxEllipses = 100;
        const limited = ellipses
          .slice()
          .sort((a, b) => a.residual - b.residual)
          .slice(0, maxEllipses);
        let bestRound = -Infinity;
        let bestArea = -Infinity;
        const best: Array<{ A: number; B: number; C: number }> = [];
        const roundEps = 1e-4;
        const areaEps = 1e-2;
        limited.forEach((e) => {
          const axes = ellipseAxes(e.A, e.B, e.C);
          if (!axes) return;
          const { a, b } = axes;
          const roundness = Math.min(a, b) / Math.max(a, b);
          const area = Math.PI * a * b;
          if (roundness > bestRound + roundEps) {
            bestRound = roundness;
            bestArea = area;
            best.length = 0;
            best.push(e);
          } else if (Math.abs(roundness - bestRound) <= roundEps) {
            if (area > bestArea + areaEps) {
              bestArea = area;
              best.length = 0;
              best.push(e);
            } else if (Math.abs(area - bestArea) <= areaEps) {
              best.push(e);
            }
          }
        });
        limited.forEach((e) => drawRotatedEllipse(e.A, e.B, e.C, 0.15));
        best.forEach((e) => drawRotatedEllipse(e.A, e.B, e.C, 0.5, 2.5, 0xff9f1a));
      }
  
      const ellipseAngle = demoEllipseAngleT * Math.PI * 2;
      const cosR = Math.cos(ellipseAngle);
      const sinR = Math.sin(ellipseAngle);
      const baseMajor = Math.max(120, Math.min(260, Math.hypot(ptB.x - ptA.x, ptB.y - ptA.y)));
      const a = baseMajor * (0.05 + demoEllipseAxisT * 0.95);
      const maxFocus = baseMajor * 0.45;
      const desiredC = maxFocus * demoEllipseFocusT;
      const c = Math.min(desiredC, Math.max(1, a - 4));
      const b = Math.sqrt(Math.max(1, a * a - c * c));
      const steps = 90;
      for (let i = 0; i <= steps; i += 1) {
        const t = (i / steps) * Math.PI * 2;
        const x = a * Math.cos(t);
        const y = b * Math.sin(t);
        const rx = x * cosR - y * sinR + ellipseCenter.x;
        const ry = x * sinR + y * cosR + ellipseCenter.y;
        if (i === 0) hullGfx.moveTo(rx, ry);
        else hullGfx.lineTo(rx, ry);
      }
      hullGfx.stroke({ width: 1, color: 0x9ad9ff, alpha: 0.6 });
      hullGfx.circle(ellipseCenter.x, ellipseCenter.y, 3);
      hullGfx.fill({ color: 0x9ad9ff, alpha: 0.9 });
      const fx = cosR * c;
      const fy = sinR * c;
      hullGfx.circle(ellipseCenter.x + fx, ellipseCenter.y + fy, 3);
      hullGfx.circle(ellipseCenter.x - fx, ellipseCenter.y - fy, 3);
      hullGfx.fill({ color: 0xffd86b, alpha: 0.9 });
  
      if (demoEllipseSliderTrack && demoEllipseSliderHandle) {
        const sliderX = demoEllipseSliderTrack.position.x;
        const sliderW = demoEllipseSliderTrack.width;
        demoEllipseSliderHandle.position.set(sliderX + sliderW * centerT, demoEllipseSliderTrack.position.y + 3);
      }
      if (demoEllipseFocusTrack && demoEllipseFocusHandle) {
        const sliderX = demoEllipseFocusTrack.position.x;
        const sliderW = demoEllipseFocusTrack.width;
        demoEllipseFocusHandle.position.set(sliderX + sliderW * demoEllipseFocusT, demoEllipseFocusTrack.position.y + 3);
      }
      if (demoEllipseAxisTrack && demoEllipseAxisHandle) {
        const sliderX = demoEllipseAxisTrack.position.x;
        const sliderW = demoEllipseAxisTrack.width;
        demoEllipseAxisHandle.position.set(sliderX + sliderW * demoEllipseAxisT, demoEllipseAxisTrack.position.y + 3);
      }
      if (demoEllipseAngleTrack && demoEllipseAngleHandle) {
        const sliderX = demoEllipseAngleTrack.position.x;
        const sliderW = demoEllipseAngleTrack.width;
        demoEllipseAngleHandle.position.set(sliderX + sliderW * demoEllipseAngleT, demoEllipseAngleTrack.position.y + 3);
      }
      if (demoEllipseSolveTrack && demoEllipseSolveHandle) {
        const sliderX = demoEllipseSolveTrack.position.x;
        const sliderW = demoEllipseSolveTrack.width;
        demoEllipseSolveHandle.position.set(sliderX + sliderW * demoEllipseSolveT, demoEllipseSolveTrack.position.y + 3);
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
            demoRectA?.position.set(nextPos.x, nextPos.y);
          } else {
            demoRectState.b = nextPos;
            demoRectB?.position.set(nextPos.x, nextPos.y);
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
  
    demoRectA = new Graphics();
    demoRectA.roundRect(0, 0, 150, 90, 10);
    demoRectA.fill({ color: 0x1f2a3f, alpha: 0.9 });
    demoRectA.stroke({ width: 1, color: 0x5aa7ff, alpha: 0.7 });
    demoRectA.position.set(demoRectState.a.x, demoRectState.a.y);
    demoRectA.eventMode = 'static';
    demoRectA.cursor = 'pointer';
    demoRectA.on('pointerdown', (evt) => startDemoDrag('a', evt));
    const rectALabel = createBitmapTextNode('Rectangle A', { fill: 0xdfe8ff, fontSize: 14, fontWeight: '600' });
    rectALabel.position.set(12, 10);
    demoRectA.addChild(rectALabel);
    uiLayer.addChild(demoRectA);
  
    demoRectB = new Graphics();
    demoRectB.roundRect(0, 0, 210, 120, 12);
    demoRectB.fill({ color: 0x223149, alpha: 0.88 });
    demoRectB.stroke({ width: 1, color: 0x8bb9ff, alpha: 0.7 });
    demoRectB.position.set(demoRectState.b.x, demoRectState.b.y);
    demoRectB.eventMode = 'static';
    demoRectB.cursor = 'pointer';
    demoRectB.on('pointerdown', (evt) => startDemoDrag('b', evt));
    const rectBLabel = createBitmapTextNode('Rectangle B', { fill: 0xdfe8ff, fontSize: 14, fontWeight: '600' });
    rectBLabel.position.set(12, 12);
    demoRectB.addChild(rectBLabel);
    uiLayer.addChild(demoRectB);
  
    const sliderW = 220;
    const sliderH = 6;
    const panelPad = 12;
    const sliderX = panelPad;
    const sliderY = panelPad + 18;
    const sliderStepY = 26;
    const panelW = sliderW + panelPad * 2;
    const panelH = sliderY + sliderStepY * 3 + sliderH + panelPad;
    if (!demoEllipsePanel) {
      demoEllipsePanel = new Container();
      demoEllipsePanel.position.set(padding + 16, padding + toolbarHeight + 8);
      demoEllipsePanel.zIndex = 9992;
      uiLayer.addChild(demoEllipsePanel);
    }
    if (!demoEllipsePanelBg && demoEllipsePanel) {
      demoEllipsePanelBg = new Graphics();
      demoEllipsePanelBg.roundRect(0, 0, panelW, panelH, 10);
      demoEllipsePanelBg.fill({ color: 0x0c1019, alpha: 0.9 });
      demoEllipsePanelBg.stroke({ width: 1, color: 0x1c2637, alpha: 0.7 });
      demoEllipsePanelBg.eventMode = 'static';
      demoEllipsePanelBg.cursor = 'grab';
      demoEllipsePanelBg.on('pointerdown', (evt) => {
        evt.stopPropagation();
        const p = evt.global ?? { x: evt.clientX ?? 0, y: evt.clientY ?? 0 };
        const start = toCanvasPoint(p.x, p.y);
        demoEllipsePanelDragOffset = {
          x: start.x - (demoEllipsePanel?.position.x ?? 0),
          y: start.y - (demoEllipsePanel?.position.y ?? 0)
        };
        if (!demoEllipsePanelDragMoveHandler) {
          demoEllipsePanelDragMoveHandler = (e: PointerEvent) => {
            if (!demoEllipsePanel) return;
            const next = toCanvasPoint(e.clientX, e.clientY);
            demoEllipsePanel.position.set(next.x - demoEllipsePanelDragOffset.x, next.y - demoEllipsePanelDragOffset.y);
          };
        }
        if (!demoEllipsePanelDragEndHandler) {
          demoEllipsePanelDragEndHandler = () => {
            if (demoEllipsePanelDragMoveHandler) {
              window.removeEventListener('pointermove', demoEllipsePanelDragMoveHandler);
            }
            if (demoEllipsePanelDragEndHandler) {
              window.removeEventListener('pointerup', demoEllipsePanelDragEndHandler);
            }
          };
        }
        window.addEventListener('pointermove', demoEllipsePanelDragMoveHandler);
        window.addEventListener('pointerup', demoEllipsePanelDragEndHandler);
      });
      demoEllipsePanel.addChild(demoEllipsePanelBg);
    }
    if (!demoEllipseSliderTrack) {
      demoEllipseSliderTrack = new Graphics();
      demoEllipseSliderTrack.roundRect(0, 0, sliderW, sliderH, sliderH / 2);
      demoEllipseSliderTrack.fill({ color: 0x202a3b, alpha: 0.95 });
      demoEllipseSliderTrack.stroke({ width: 1, color: 0x3a4a66, alpha: 0.7 });
      demoEllipseSliderTrack.position.set(sliderX, sliderY);
      demoEllipseSliderTrack.eventMode = 'static';
      demoEllipseSliderTrack.cursor = 'pointer';
      demoEllipsePanel?.addChild(demoEllipseSliderTrack);
    }
    if (!demoEllipseSliderHandle) {
      demoEllipseSliderHandle = new Graphics();
      demoEllipseSliderHandle.circle(0, 0, 7);
      demoEllipseSliderHandle.fill({ color: 0x9ad9ff, alpha: 0.95 });
      demoEllipseSliderHandle.stroke({ width: 1, color: 0xffffff, alpha: 0.35 });
      demoEllipseSliderHandle.eventMode = 'static';
      demoEllipseSliderHandle.cursor = 'pointer';
      demoEllipsePanel?.addChild(demoEllipseSliderHandle);
    }
    if (!demoEllipseSliderLabel) {
      demoEllipseSliderLabel = createBitmapTextNode('Ellipse center', {
        fill: 0xdfe8ff,
        fontSize: 12,
        fontWeight: '600'
      });
      demoEllipseSliderLabel.position.set(sliderX, sliderY - 18);
      demoEllipsePanel?.addChild(demoEllipseSliderLabel);
    }
  
    const setEllipseTFromX = (clientX: number, clientY: number) => {
      const p = toCanvasPoint(clientX, clientY);
      const panelX = demoEllipsePanel?.position.x ?? 0;
      const t = (p.x - panelX - sliderX) / sliderW;
      demoEllipseCenterT = Math.max(0, Math.min(1, t));
      drawHull();
    };
  
    const startEllipseDrag = (evt: any) => {
      evt.stopPropagation();
      const p = evt.global ?? { x: evt.clientX ?? 0, y: evt.clientY ?? 0 };
      setEllipseTFromX(p.x, p.y);
      if (!demoEllipseDragMoveHandler) {
        demoEllipseDragMoveHandler = (e: PointerEvent) => setEllipseTFromX(e.clientX, e.clientY);
      }
      if (!demoEllipseDragEndHandler) {
        demoEllipseDragEndHandler = () => {
          if (demoEllipseDragMoveHandler) {
            window.removeEventListener('pointermove', demoEllipseDragMoveHandler);
          }
          if (demoEllipseDragEndHandler) {
            window.removeEventListener('pointerup', demoEllipseDragEndHandler);
          }
        };
      }
      window.addEventListener('pointermove', demoEllipseDragMoveHandler);
      window.addEventListener('pointerup', demoEllipseDragEndHandler);
    };
  
    demoEllipseSliderTrack.on('pointerdown', (evt) => startEllipseDrag(evt));
    demoEllipseSliderHandle.on('pointerdown', (evt) => startEllipseDrag(evt));
  
    const focusSliderX = sliderX;
    const focusSliderY = sliderY + sliderStepY;
    const focusSliderW = sliderW;
    const focusSliderH = sliderH;
    if (!demoEllipseFocusTrack) {
      demoEllipseFocusTrack = new Graphics();
      demoEllipseFocusTrack.roundRect(0, 0, focusSliderW, focusSliderH, focusSliderH / 2);
      demoEllipseFocusTrack.fill({ color: 0x202a3b, alpha: 0.95 });
      demoEllipseFocusTrack.stroke({ width: 1, color: 0x3a4a66, alpha: 0.7 });
      demoEllipseFocusTrack.position.set(focusSliderX, focusSliderY);
      demoEllipseFocusTrack.eventMode = 'static';
      demoEllipseFocusTrack.cursor = 'pointer';
      demoEllipsePanel?.addChild(demoEllipseFocusTrack);
    }
    if (!demoEllipseFocusHandle) {
      demoEllipseFocusHandle = new Graphics();
      demoEllipseFocusHandle.circle(0, 0, 7);
      demoEllipseFocusHandle.fill({ color: 0x9ad9ff, alpha: 0.95 });
      demoEllipseFocusHandle.stroke({ width: 1, color: 0xffffff, alpha: 0.35 });
      demoEllipseFocusHandle.eventMode = 'static';
      demoEllipseFocusHandle.cursor = 'pointer';
      demoEllipsePanel?.addChild(demoEllipseFocusHandle);
    }
    if (!demoEllipseFocusLabel) {
      demoEllipseFocusLabel = createBitmapTextNode('Ellipse focus', {
        fill: 0xdfe8ff,
        fontSize: 12,
        fontWeight: '600'
      });
      demoEllipseFocusLabel.position.set(focusSliderX, focusSliderY - 18);
      demoEllipsePanel?.addChild(demoEllipseFocusLabel);
    }
  
    const setEllipseFocusFromX = (clientX: number, clientY: number) => {
      const p = toCanvasPoint(clientX, clientY);
      const panelX = demoEllipsePanel?.position.x ?? 0;
      const t = (p.x - panelX - focusSliderX) / focusSliderW;
      demoEllipseFocusT = Math.max(0, Math.min(1, t));
      drawHull();
    };
  
    const startEllipseFocusDrag = (evt: any) => {
      evt.stopPropagation();
      const p = evt.global ?? { x: evt.clientX ?? 0, y: evt.clientY ?? 0 };
      setEllipseFocusFromX(p.x, p.y);
      if (!demoEllipseFocusDragMoveHandler) {
        demoEllipseFocusDragMoveHandler = (e: PointerEvent) => setEllipseFocusFromX(e.clientX, e.clientY);
      }
      if (!demoEllipseFocusDragEndHandler) {
        demoEllipseFocusDragEndHandler = () => {
          if (demoEllipseFocusDragMoveHandler) {
            window.removeEventListener('pointermove', demoEllipseFocusDragMoveHandler);
          }
          if (demoEllipseFocusDragEndHandler) {
            window.removeEventListener('pointerup', demoEllipseFocusDragEndHandler);
          }
        };
      }
      window.addEventListener('pointermove', demoEllipseFocusDragMoveHandler);
      window.addEventListener('pointerup', demoEllipseFocusDragEndHandler);
    };
  
    demoEllipseFocusTrack.on('pointerdown', (evt) => startEllipseFocusDrag(evt));
    demoEllipseFocusHandle.on('pointerdown', (evt) => startEllipseFocusDrag(evt));
  
    const axisSliderX = sliderX;
    const axisSliderY = sliderY + sliderStepY * 2;
    const axisSliderW = sliderW;
    const axisSliderH = sliderH;
    if (!demoEllipseAxisTrack) {
      demoEllipseAxisTrack = new Graphics();
      demoEllipseAxisTrack.roundRect(0, 0, axisSliderW, axisSliderH, axisSliderH / 2);
      demoEllipseAxisTrack.fill({ color: 0x202a3b, alpha: 0.95 });
      demoEllipseAxisTrack.stroke({ width: 1, color: 0x3a4a66, alpha: 0.7 });
      demoEllipseAxisTrack.position.set(axisSliderX, axisSliderY);
      demoEllipseAxisTrack.eventMode = 'static';
      demoEllipseAxisTrack.cursor = 'pointer';
      demoEllipsePanel?.addChild(demoEllipseAxisTrack);
    }
    if (!demoEllipseAxisHandle) {
      demoEllipseAxisHandle = new Graphics();
      demoEllipseAxisHandle.circle(0, 0, 7);
      demoEllipseAxisHandle.fill({ color: 0x9ad9ff, alpha: 0.95 });
      demoEllipseAxisHandle.stroke({ width: 1, color: 0xffffff, alpha: 0.35 });
      demoEllipseAxisHandle.eventMode = 'static';
      demoEllipseAxisHandle.cursor = 'pointer';
      demoEllipsePanel?.addChild(demoEllipseAxisHandle);
    }
    if (!demoEllipseAxisLabel) {
      demoEllipseAxisLabel = createBitmapTextNode('Ellipse axis', {
        fill: 0xdfe8ff,
        fontSize: 12,
        fontWeight: '600'
      });
      demoEllipseAxisLabel.position.set(axisSliderX, axisSliderY - 18);
      demoEllipsePanel?.addChild(demoEllipseAxisLabel);
    }
  
    const setEllipseAxisFromX = (clientX: number, clientY: number) => {
      const p = toCanvasPoint(clientX, clientY);
      const panelX = demoEllipsePanel?.position.x ?? 0;
      const t = (p.x - panelX - axisSliderX) / axisSliderW;
      demoEllipseAxisT = Math.max(0, Math.min(1, t));
      drawHull();
    };
  
    const startEllipseAxisDrag = (evt: any) => {
      evt.stopPropagation();
      const p = evt.global ?? { x: evt.clientX ?? 0, y: evt.clientY ?? 0 };
      setEllipseAxisFromX(p.x, p.y);
      if (!demoEllipseAxisDragMoveHandler) {
        demoEllipseAxisDragMoveHandler = (e: PointerEvent) => setEllipseAxisFromX(e.clientX, e.clientY);
      }
      if (!demoEllipseAxisDragEndHandler) {
        demoEllipseAxisDragEndHandler = () => {
          if (demoEllipseAxisDragMoveHandler) {
            window.removeEventListener('pointermove', demoEllipseAxisDragMoveHandler);
          }
          if (demoEllipseAxisDragEndHandler) {
            window.removeEventListener('pointerup', demoEllipseAxisDragEndHandler);
          }
        };
      }
      window.addEventListener('pointermove', demoEllipseAxisDragMoveHandler);
      window.addEventListener('pointerup', demoEllipseAxisDragEndHandler);
    };
  
    demoEllipseAxisTrack.on('pointerdown', (evt) => startEllipseAxisDrag(evt));
    demoEllipseAxisHandle.on('pointerdown', (evt) => startEllipseAxisDrag(evt));
  
    const angleSliderX = sliderX;
    const angleSliderY = sliderY + sliderStepY * 3;
    const angleSliderW = sliderW;
    const angleSliderH = sliderH;
    if (!demoEllipseAngleTrack) {
      demoEllipseAngleTrack = new Graphics();
      demoEllipseAngleTrack.roundRect(0, 0, angleSliderW, angleSliderH, angleSliderH / 2);
      demoEllipseAngleTrack.fill({ color: 0x202a3b, alpha: 0.95 });
      demoEllipseAngleTrack.stroke({ width: 1, color: 0x3a4a66, alpha: 0.7 });
      demoEllipseAngleTrack.position.set(angleSliderX, angleSliderY);
      demoEllipseAngleTrack.eventMode = 'static';
      demoEllipseAngleTrack.cursor = 'pointer';
      demoEllipsePanel?.addChild(demoEllipseAngleTrack);
    }
    if (!demoEllipseAngleHandle) {
      demoEllipseAngleHandle = new Graphics();
      demoEllipseAngleHandle.circle(0, 0, 7);
      demoEllipseAngleHandle.fill({ color: 0x9ad9ff, alpha: 0.95 });
      demoEllipseAngleHandle.stroke({ width: 1, color: 0xffffff, alpha: 0.35 });
      demoEllipseAngleHandle.eventMode = 'static';
      demoEllipseAngleHandle.cursor = 'pointer';
      demoEllipsePanel?.addChild(demoEllipseAngleHandle);
    }
    if (!demoEllipseAngleLabel) {
      demoEllipseAngleLabel = createBitmapTextNode('Ellipse angle', {
        fill: 0xdfe8ff,
        fontSize: 12,
        fontWeight: '600'
      });
      demoEllipseAngleLabel.position.set(angleSliderX, angleSliderY - 18);
      demoEllipsePanel?.addChild(demoEllipseAngleLabel);
    }
  
    const setEllipseAngleFromX = (clientX: number, clientY: number) => {
      const p = toCanvasPoint(clientX, clientY);
      const panelX = demoEllipsePanel?.position.x ?? 0;
      const t = (p.x - panelX - angleSliderX) / angleSliderW;
      demoEllipseAngleT = Math.max(0, Math.min(1, t));
      drawHull();
    };
  
    const startEllipseAngleDrag = (evt: any) => {
      evt.stopPropagation();
      const p = evt.global ?? { x: evt.clientX ?? 0, y: evt.clientY ?? 0 };
      setEllipseAngleFromX(p.x, p.y);
      if (!demoEllipseAngleDragMoveHandler) {
        demoEllipseAngleDragMoveHandler = (e: PointerEvent) => setEllipseAngleFromX(e.clientX, e.clientY);
      }
      if (!demoEllipseAngleDragEndHandler) {
        demoEllipseAngleDragEndHandler = () => {
          if (demoEllipseAngleDragMoveHandler) {
            window.removeEventListener('pointermove', demoEllipseAngleDragMoveHandler);
          }
          if (demoEllipseAngleDragEndHandler) {
            window.removeEventListener('pointerup', demoEllipseAngleDragEndHandler);
          }
        };
      }
      window.addEventListener('pointermove', demoEllipseAngleDragMoveHandler);
      window.addEventListener('pointerup', demoEllipseAngleDragEndHandler);
    };
  
    demoEllipseAngleTrack.on('pointerdown', (evt) => startEllipseAngleDrag(evt));
    demoEllipseAngleHandle.on('pointerdown', (evt) => startEllipseAngleDrag(evt));
  
    const solvePanelW = sliderW + panelPad * 2;
    const solvePanelH = sliderY + sliderH + panelPad;
    if (!demoEllipseSolvePanel) {
      demoEllipseSolvePanel = new Container();
      demoEllipseSolvePanel.position.set(padding + 16, padding + toolbarHeight + 8 + panelH + 16);
      demoEllipseSolvePanel.zIndex = 9992;
      uiLayer.addChild(demoEllipseSolvePanel);
    }
    if (!demoEllipseSolvePanelBg && demoEllipseSolvePanel) {
      demoEllipseSolvePanelBg = new Graphics();
      demoEllipseSolvePanelBg.roundRect(0, 0, solvePanelW, solvePanelH, 10);
      demoEllipseSolvePanelBg.fill({ color: 0x0c1019, alpha: 0.9 });
      demoEllipseSolvePanelBg.stroke({ width: 1, color: 0x1c2637, alpha: 0.7 });
      demoEllipseSolvePanelBg.eventMode = 'static';
      demoEllipseSolvePanelBg.cursor = 'grab';
      demoEllipseSolvePanelBg.on('pointerdown', (evt) => {
        evt.stopPropagation();
        const p = evt.global ?? { x: evt.clientX ?? 0, y: evt.clientY ?? 0 };
        const start = toCanvasPoint(p.x, p.y);
        demoEllipseSolvePanelDragOffset = {
          x: start.x - (demoEllipseSolvePanel?.position.x ?? 0),
          y: start.y - (demoEllipseSolvePanel?.position.y ?? 0)
        };
        if (!demoEllipseSolvePanelDragMoveHandler) {
          demoEllipseSolvePanelDragMoveHandler = (e: PointerEvent) => {
            if (!demoEllipseSolvePanel) return;
            const next = toCanvasPoint(e.clientX, e.clientY);
            demoEllipseSolvePanel.position.set(next.x - demoEllipseSolvePanelDragOffset.x, next.y - demoEllipseSolvePanelDragOffset.y);
          };
        }
        if (!demoEllipseSolvePanelDragEndHandler) {
          demoEllipseSolvePanelDragEndHandler = () => {
            if (demoEllipseSolvePanelDragMoveHandler) {
              window.removeEventListener('pointermove', demoEllipseSolvePanelDragMoveHandler);
            }
            if (demoEllipseSolvePanelDragEndHandler) {
              window.removeEventListener('pointerup', demoEllipseSolvePanelDragEndHandler);
            }
          };
        }
        window.addEventListener('pointermove', demoEllipseSolvePanelDragMoveHandler);
        window.addEventListener('pointerup', demoEllipseSolvePanelDragEndHandler);
      });
      demoEllipseSolvePanel.addChild(demoEllipseSolvePanelBg);
    }
    if (!demoEllipseSolveTrack) {
      demoEllipseSolveTrack = new Graphics();
      demoEllipseSolveTrack.roundRect(0, 0, sliderW, sliderH, sliderH / 2);
      demoEllipseSolveTrack.fill({ color: 0x202a3b, alpha: 0.95 });
      demoEllipseSolveTrack.stroke({ width: 1, color: 0x3a4a66, alpha: 0.7 });
      demoEllipseSolveTrack.position.set(sliderX, sliderY);
      demoEllipseSolveTrack.eventMode = 'static';
      demoEllipseSolveTrack.cursor = 'pointer';
      demoEllipseSolvePanel?.addChild(demoEllipseSolveTrack);
    }
    if (!demoEllipseSolveHandle) {
      demoEllipseSolveHandle = new Graphics();
      demoEllipseSolveHandle.circle(0, 0, 7);
      demoEllipseSolveHandle.fill({ color: 0x9ad9ff, alpha: 0.95 });
      demoEllipseSolveHandle.stroke({ width: 1, color: 0xffffff, alpha: 0.35 });
      demoEllipseSolveHandle.eventMode = 'static';
      demoEllipseSolveHandle.cursor = 'pointer';
      demoEllipseSolvePanel?.addChild(demoEllipseSolveHandle);
    }
    if (!demoEllipseSolveLabel) {
      demoEllipseSolveLabel = createBitmapTextNode('Solutions center', {
        fill: 0xdfe8ff,
        fontSize: 12,
        fontWeight: '600'
      });
      demoEllipseSolveLabel.position.set(sliderX, sliderY - 18);
      demoEllipseSolvePanel?.addChild(demoEllipseSolveLabel);
    }
  
    const setEllipseSolveFromX = (clientX: number, clientY: number) => {
      const p = toCanvasPoint(clientX, clientY);
      const panelX = demoEllipseSolvePanel?.position.x ?? 0;
      const t = (p.x - panelX - sliderX) / sliderW;
      demoEllipseSolveT = Math.max(0, Math.min(1, t));
      drawHull();
    };
  
    const startEllipseSolveDrag = (evt: any) => {
      evt.stopPropagation();
      const p = evt.global ?? { x: evt.clientX ?? 0, y: evt.clientY ?? 0 };
      setEllipseSolveFromX(p.x, p.y);
      if (!demoEllipseSolveDragMoveHandler) {
        demoEllipseSolveDragMoveHandler = (e: PointerEvent) => setEllipseSolveFromX(e.clientX, e.clientY);
      }
      if (!demoEllipseSolveDragEndHandler) {
        demoEllipseSolveDragEndHandler = () => {
          if (demoEllipseSolveDragMoveHandler) {
            window.removeEventListener('pointermove', demoEllipseSolveDragMoveHandler);
          }
          if (demoEllipseSolveDragEndHandler) {
            window.removeEventListener('pointerup', demoEllipseSolveDragEndHandler);
          }
        };
      }
      window.addEventListener('pointermove', demoEllipseSolveDragMoveHandler);
      window.addEventListener('pointerup', demoEllipseSolveDragEndHandler);
    };
  
    demoEllipseSolveTrack.on('pointerdown', (evt) => startEllipseSolveDrag(evt));
    demoEllipseSolveHandle.on('pointerdown', (evt) => startEllipseSolveDrag(evt));
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
