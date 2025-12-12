import { Graphics, Text } from 'pixi.js';

export type EnemyViewOptions = {
  radius: number;
  color: number;
  shootDistanceMin: number;
  shootDistanceMax: number;
};

export class EnemyView {
  readonly gfx = new Graphics();
  readonly label = new Text('', { fill: 0x4da3ff, fontSize: 12 });
  readonly rangeOverlay = new Graphics();

  constructor(private opts: EnemyViewOptions) {
    this.gfx.addChild(this.label);
    this.label.position.set(-this.opts.radius, -this.opts.radius - 18);
    this.rangeOverlay.alpha = 0.35;
    this.rangeOverlay.eventMode = 'none';
    this.rangeOverlay.zIndex = -1;
    this.rangeOverlay.position.set(0, 0);
    this.gfx.addChildAt(this.rangeOverlay, 0);
    this.redrawBody();
    this.updateRanges(this.opts.shootDistanceMin, this.opts.shootDistanceMax);
  }

  get radius() {
    return this.opts.radius;
  }

  setPosition(x: number, y: number) {
    this.gfx.position.set(x, y);
  }

  setColor(color: number) {
    if (this.opts.color === color) return;
    this.opts = { ...this.opts, color };
    this.redrawBody();
  }

  updateLabel(text: string) {
    this.label.text = `BT: ${text}`;
  }

  updateRanges(min: number, max: number) {
    this.opts = { ...this.opts, shootDistanceMin: min, shootDistanceMax: max };
    this.rangeOverlay.clear();
    this.rangeOverlay
      .circle(0, 0, min)
      .stroke({ width: 2.5, color: 0xffd84b, alpha: 0.55 });
    this.rangeOverlay
      .circle(0, 0, max)
      .stroke({ width: 2.5, color: 0xffd84b, alpha: 0.55 });
  }

  private redrawBody() {
    this.gfx.clear();
    this.gfx.beginFill(this.opts.color);
    this.gfx.circle(0, 0, this.opts.radius);
    this.gfx.endFill();
  }
}
