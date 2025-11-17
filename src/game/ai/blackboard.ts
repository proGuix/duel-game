// ai/blackboard.ts
import type { Bullet } from '@types';

export type Vec = { x: number; y: number };

export interface Blackboard {
  // inputs (écrits par Enemy.update à chaque frame)
  enemyPos: Vec;
  enemyVel: Vec;
  enemyRadius: number;

  playerPos: Vec;
  playerVel: Vec;

  worldSize: { w: number; h: number };
  bullets: Bullet[];
  projectileSpeed: number;

  // params gameplay (réglages)
  distShootMin: number;
  distShootMax: number;
  evadeHorizon: number;
  evadeMargin: number;
  evadeDuration: number;
  jitterRadians: number;

  // intents (écrits par les actions, lus par Enemy.applyIntents)
  intentMove?: Vec;       // direction voulue (normée)
  intentDashBoost?: number; // multiplicateur temporaire
  intentShoot?: boolean;
  intentAimAt?: Vec;

  // runtime (partagé entre nodes)
  danger?: { dir: Vec } | null;
  hasLOS?: boolean;
  inRange?: boolean;

  // debug name pour affichage
  runningNodeName?: string;
}

// ---- util vecteurs ----
export const V = {
  add: (a: Vec, b: Vec) => ({ x: a.x + b.x, y: a.y + b.y }),
  sub: (a: Vec, b: Vec) => ({ x: a.x - b.x, y: a.y - b.y }),
  mul: (a: Vec, s: number) => ({ x: a.x * s, y: a.y * s }),
  len: (a: Vec) => Math.hypot(a.x, a.y),
  norm: (a: Vec) => { const L = Math.hypot(a.x, a.y) || 1; return { x: a.x / L, y: a.y / L }; },
  dot: (a: Vec, b: Vec) => a.x*b.x + a.y*b.y,
  perp: (a: Vec) => ({ x: -a.y, y: a.x }),
};

export function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

// score distance “couronne” (1 au centre de la plage)
export function crownScore(dist: number, min: number, max: number): number {
  if (dist <= min || dist >= max) return 0;
  const mid = (min + max) / 2;
  const t = 1 - Math.abs(dist - mid) / (max - mid);
  return clamp01(t);
}

// detection danger (comme ta FSM, déplacée ici)
export function detectIncomingDanger(bb: Blackboard): { danger: boolean; dir: Vec } {
  let worst: { t: number; dir: Vec } | null = null;

  const enemyPos = bb.enemyPos;
  const R = bb.enemyRadius;
  const horizon = bb.evadeHorizon;
  const margin = bb.evadeMargin;

  for (const b of bb.bullets) {
    if (b.from !== 'player') continue;
    const bulletPos = { x: b.gfx.x, y: b.gfx.y };
    const bulletVel = b.v;
    const relPos = V.sub(bulletPos, enemyPos);
    const relVel = V.sub(bulletVel, bb.enemyVel);
    const relSpeed2 = V.dot(relVel, relVel);
    if (relSpeed2 <= 1e-6) continue;

    const tStar = - V.dot(relPos, relVel) / relSpeed2;
    if (tStar < 0 || tStar > horizon) continue;

    const closest = V.add(relPos, V.mul(relVel, tStar));
    const distMin = V.len(closest);
    const safeDist = R + b.r + margin;

    if (distMin <= safeDist) {
      const dir = V.norm(relVel);
      if (!worst || tStar < worst.t) worst = { t: tStar, dir };
    }
  }
  if (worst) return { danger: true, dir: worst.dir };
  return { danger: false, dir: { x: 0, y: 0 } };
}

// lead aim
export function leadAim(pb: Vec, pr: Vec, vr: Vec, vp: number): Vec | null {
  const r = V.sub(pr, pb);
  const a = V.dot(vr, vr) - vp*vp;
  const b = 2 * V.dot(r, vr);
  const c = V.dot(r, r);
  const EPS = 1e-6;
  let t: number | null = null;

  if (Math.abs(a) < EPS) {
    if (Math.abs(b) < EPS) return null;
    t = -c / b;
  } else {
    const disc = b*b - 4*a*c;
    if (disc < 0) return null;
    const sdisc = Math.sqrt(disc);
    const t1 = (-b - sdisc)/(2*a);
    const t2 = (-b + sdisc)/(2*a);
    t = Math.min(t1, t2);
    if (t < EPS) t = Math.max(t1, t2);
  }
  if (!t || t < EPS) return null;
  return V.add(pr, V.mul(vr, t));
}
