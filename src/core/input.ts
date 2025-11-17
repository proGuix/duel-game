import type { Vec2 } from '@types';

export class Input {
  mouse: Vec2 = { x: 0, y: 0 };
  pressed = new Set<string>();

  constructor(target: HTMLElement | Window = window) {
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });
    window.addEventListener('keydown', (e) => this.pressed.add(e.key));
    window.addEventListener('keyup', (e) => this.pressed.delete(e.key));
  }

  isDown(key: string) {
    return this.pressed.has(key);
  }
}
