import { Graphics } from 'pixi.js';
import { clamp, norm } from '@core/math';
import type { World } from '@types';

export class Player {
  gfx = new Graphics();
  r = 26;
  color = 0xff4d4d;
  target: { x: number; y: number } | null = null;
  x = 0; y = 0;
  maxSpeed = 750; // px/s
  lastShoot = 0;
  cooldown = 180; // ms

  constructor(world: World) {
    this.x = world.w * 0.25;
    this.y = world.h * 0.5;
    this.draw();
  }

  draw() {
    this.gfx.clear();
    this.gfx.beginFill(this.color);
    this.gfx.drawCircle(0, 0, this.r);
    this.gfx.endFill();
    this.gfx.position.set(this.x, this.y);
  }

  update(dt: number, world: World) {
    if (this.target) {
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const L = Math.hypot(dx, dy);
      if (L > 0) {
        const step = Math.min(L, this.maxSpeed * dt);
        const d = norm({ x: dx, y: dy });
        this.x += d.x * step;
        this.y += d.y * step;
        this.x = clamp(this.x, this.r, world.w - this.r);
        this.y = clamp(this.y, this.r, world.h - this.r);
        this.gfx.position.set(this.x, this.y);
      }
    }
  }
}
