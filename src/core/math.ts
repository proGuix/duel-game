import type { Vec2 } from '@types';

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const len = (v: Vec2) => Math.hypot(v.x, v.y);
export const norm = (v: Vec2): Vec2 => {
  const L = len(v);
  return L > 0 ? { x: v.x / L, y: v.y / L } : { x: 0, y: 0 };
};
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const mul = (v: Vec2, s: number): Vec2 => ({ x: v.x * s, y: v.y * s });

export const circleHit = (x1: number, y1: number, r1: number, x2: number, y2: number, r2: number) => {
  const dx = x2 - x1, dy = y2 - y1;
  return dx * dx + dy * dy <= (r1 + r2) * (r1 + r2);
};
