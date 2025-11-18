import { Graphics } from 'pixi.js';
import { norm, circleHit } from '@core/math';
import type { Bullet } from '@types';

export class Bullets {
  list: Bullet[] = [];
  speed = 520;
  radius = 7;
  max = 200;

  spawn(from: { x: number; y: number; r: number }, to: { x: number; y: number }, who: 'player' | 'enemy'): Bullet {
    let dx = to.x - from.x, dy = to.y - from.y;
    if (dx === 0 && dy === 0) dx = 1;
    const d = norm({ x: dx, y: dy });

    const gfx = new Graphics();
    gfx.beginFill(0xffd84b).circle(0, 0, this.radius).endFill();

    const b: Bullet = {
      gfx,
      v: { x: d.x * this.speed, y: d.y * this.speed },
      r: this.radius,
      from: who
    };

    gfx.position.set(from.x + d.x * (from.r + this.radius + 1), from.y + d.y * (from.r + this.radius + 1));
    this.list.push(b);
    if (this.list.length > this.max) this.list.shift();
    return b;
  }

  update(dt: number, bounds: { w: number; h: number }) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      b.gfx.x += b.v.x * dt;
      b.gfx.y += b.v.y * dt;
      if (b.gfx.x < -b.r || b.gfx.x > bounds.w + b.r || b.gfx.y < -b.r || b.gfx.y > bounds.h + b.r) {
        b.gfx.destroy();
        this.list.splice(i, 1);
      }
    }
  }

  // ✅ NE compter que les balles tirées par "from"
  checkHit(target: { x: number; y: number; r: number }, from: 'player' | 'enemy'): boolean {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const b = this.list[i];
      if (b.from === from && circleHit(b.gfx.x, b.gfx.y, b.r, target.x, target.y, target.r)) {
        b.gfx.destroy();
        this.list.splice(i, 1);
        return true;
      }
    }
    return false;
  }
}
