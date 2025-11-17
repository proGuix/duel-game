import { clamp } from '@core/math';
import type { Vec2 } from '@types';

type Path = { points: Vec2[]; size: number };

const overlay = document.getElementById('overlay') as HTMLDivElement;
const drawCanvas = document.getElementById('drawCanvas') as HTMLCanvasElement;
const btnClear = document.getElementById('btnClear') as HTMLButtonElement;
const btnClose = document.getElementById('btnClose') as HTMLButtonElement;

// Déclarations pour les globals injectés par le CDN
declare const tf: any;
declare const mobilenet: any;

// === Reco IA temps réel sur le canvas de dessin ===
let aiNet: any = null;
let aiRunning = false;
const aiResultEl = document.getElementById('aiResult') as HTMLSpanElement | null;

async function ensureModel() {
  if (!aiNet) {
    aiResultEl && (aiResultEl.textContent = 'chargement du modèle…');
    aiNet = await mobilenet.load(); // MobileNet v2
    aiResultEl && (aiResultEl.textContent = 'prêt');
  }
}

async function aiLoop() {
  if (!aiRunning) return;
  try {
    // Mobilenet accepte directement un <canvas>
    const preds = await aiNet.classify(drawCanvas);
    if (preds && preds.length && aiResultEl) {
      const best = preds[0];
      const pct = (best.probability * 100).toFixed(1); // ex: "87.3"
      aiResultEl.textContent = `Oh cela ressemble à ${best.className} (${pct}%)`;
    }
  } catch (err) {
    aiResultEl && (aiResultEl.textContent = 'erreur IA (voir console)');
    console.error('AI classify error:', err);
  }
  // Laisser respirer le thread & le GPU
  if (typeof tf !== 'undefined' && tf.nextFrame) {
    await tf.nextFrame();
  }
  requestAnimationFrame(aiLoop);
}

async function startAI() {
  if (aiRunning) return;
  await ensureModel();
  aiRunning = true;
  aiLoop();
}

function stopAI() {
  aiRunning = false;
}

const ctx = drawCanvas.getContext('2d')!;
let active = false;
let strokeSize = 6;
let isDown = false;
let paths: Path[] = [];
let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;

// function paintBackground() {
//   ctx.fillStyle = '#0b0e13';
//   ctx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);
//   // grid
//   ctx.save();
//   ctx.globalAlpha = 0.15;
//   ctx.strokeStyle = '#ffffff';
//   ctx.lineWidth = 1;
//   const step = 32;
//   ctx.beginPath();
//   for (let x = 0; x < drawCanvas.width; x += step) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, drawCanvas.height); }
//   for (let y = 0; y < drawCanvas.height; y += step) { ctx.moveTo(0, y + 0.5); ctx.lineTo(drawCanvas.width, y + 0.5); }
//   ctx.stroke();
//   ctx.restore();
// }

function paintBackground() {
  // fond uni (sans grille)
  ctx.fillStyle = '#0b0e13';
  ctx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);
}

function resizeCanvas() {
  const r = drawCanvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, (window.devicePixelRatio || 1)));
  drawCanvas.width = Math.floor(r.width * dpr);
  drawCanvas.height = Math.floor(r.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintBackground();
  redrawAll();
}

function getLocal(e: MouseEvent | Touch): Vec2 {
  const r = drawCanvas.getBoundingClientRect();
  return { x: (e as MouseEvent).clientX - r.left, y: (e as MouseEvent).clientY - r.top };
}

function startStroke(p: Vec2) {
  isDown = true;
  const path: Path = { points: [p], size: strokeSize };
  paths.push(path);
  minx = Math.min(minx, p.x); miny = Math.min(miny, p.y);
  maxx = Math.max(maxx, p.x); maxy = Math.max(maxy, p.y);
  // dot
  ctx.beginPath();
  ctx.fillStyle = '#ffffff';
  ctx.arc(p.x, p.y, strokeSize / 2, 0, Math.PI * 2);
  ctx.fill();
}

function addPoint(p: Vec2) {
  if (!isDown) return;
  const path = paths[paths.length - 1];
  path.points.push(p);
  minx = Math.min(minx, p.x); miny = Math.min(miny, p.y);
  maxx = Math.max(maxx, p.x); maxy = Math.max(maxy, p.y);

  const n = path.points.length;
  if (n >= 2) {
    const a = path.points[n - 2], b = path.points[n - 1];
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = path.size;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
}

function endStroke() { isDown = false; }

function redrawAll() {
  paintBackground();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#ffffff';
  for (const path of paths) {
    ctx.lineWidth = path.size;
    ctx.beginPath();
    for (let i = 0; i < path.points.length; i++) {
      const p = path.points[i];
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
}

function clear() {
  paths = [];
  strokeSize = 6;
  minx = Infinity; miny = Infinity; maxx = -Infinity; maxy = -Infinity;
  paintBackground();
}

let resolveClose: ((img: HTMLImageElement | null) => void) | null = null;

export function openDrawing(): Promise<HTMLImageElement | null> {
  if (active) return Promise.resolve(null);
  active = true;
  overlay.style.display = 'grid';
  resizeCanvas();
  startAI();
  return new Promise<HTMLImageElement | null>((resolve) => (resolveClose = resolve));
}

export function closeDrawingAndExport(): void {
  if (!active) return;
  // rien dessiné
  if (paths.length === 0) {
    overlay.style.display = 'none';
    active = false;
    stopAI();
    resolveClose?.(null);
    resolveClose = null;
    clear();
    return;
  }
  const pad = Math.ceil(strokeSize / 2) + 2;
  const minX = Math.max(0, Math.floor(minx - pad));
  const minY = Math.max(0, Math.floor(miny - pad));
  const maxX = Math.min(drawCanvas.width, Math.ceil(maxx + pad));
  const maxY = Math.min(drawCanvas.height, Math.ceil(maxy + pad));
  const bw = Math.max(1, maxX - minX);
  const bh = Math.max(1, maxY - minY);

  // recalcule en offscreen pour qualité
  const tmp = document.createElement('canvas');
  tmp.width = bw; tmp.height = bh;
  const tctx = tmp.getContext('2d')!;
  tctx.clearRect(0, 0, bw, bh);
  tctx.lineCap = 'round'; tctx.lineJoin = 'round'; tctx.strokeStyle = '#ffffff';
  for (const path of paths) {
    tctx.lineWidth = path.size;
    tctx.beginPath();
    for (let i = 0; i < path.points.length; i++) {
      const p = path.points[i];
      const x = p.x - minX, y = p.y - minY;
      if (i === 0) tctx.moveTo(x, y); else tctx.lineTo(x, y);
    }
    tctx.stroke();
  }

  const maxDim = 120;
  const scale = Math.min(1, maxDim / Math.max(bw, bh));
  const sw = Math.max(6, Math.round(bw * scale));
  const sh = Math.max(6, Math.round(bh * scale));
  const scaled = document.createElement('canvas');
  scaled.width = sw; scaled.height = sh;
  const sctx = scaled.getContext('2d')!;
  sctx.imageSmoothingEnabled = true; sctx.imageSmoothingQuality = 'high';
  sctx.drawImage(tmp, 0, 0, bw, bh, 0, 0, sw, sh);

  const img = new Image();
  img.onload = () => {
    overlay.style.display = 'none';
    active = false;
    stopAI();
    resolveClose?.(img);
    resolveClose = null;
    clear();
  };
  img.src = scaled.toDataURL('image/png');
}

export function isDrawingActive() { return active; }

// Event wiring
drawCanvas.addEventListener('mousedown', (e) => startStroke(getLocal(e)));
drawCanvas.addEventListener('mousemove', (e) => addPoint(getLocal(e)));
window.addEventListener('mouseup', endStroke);
drawCanvas.addEventListener('mouseleave', endStroke);
drawCanvas.addEventListener('touchstart', (e) => { e.preventDefault(); const t = e.touches[0]; startStroke(getLocal(t)); }, { passive: false });
drawCanvas.addEventListener('touchmove', (e) => { e.preventDefault(); const t = e.touches[0]; addPoint(getLocal(t)); }, { passive: false });
drawCanvas.addEventListener('touchend', (e) => { e.preventDefault(); endStroke(); }, { passive: false });

overlay.addEventListener('wheel', (e) => {
  if (!active) return;
  if ((e as WheelEvent).ctrlKey) {
    e.preventDefault();
    const delta = Math.sign((e as WheelEvent).deltaY);
    strokeSize = clamp(strokeSize - delta, 1, 40);
  }
}, { passive: false });

// Keyboard: 'C' pour effacer pendant que l'overlay est actif
window.addEventListener('keydown', (e) => {
  if (!active) return;                // ne réagit que si l'atelier est ouvert
  if (e.key === 'c' || e.key === 'C') {
    e.preventDefault();
    clear();                          // efface le dessin courant
  }
});

btnClear.addEventListener('click', clear);
btnClose.addEventListener('click', () => closeDrawingAndExport());

new ResizeObserver(() => { if (active) resizeCanvas(); }).observe(document.getElementById('drawBox')!);
