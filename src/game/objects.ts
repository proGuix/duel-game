import { Container, Sprite, Texture } from 'pixi.js';
import type { PlacedObject } from '@types';

export class ObjectsLayer {
  list: PlacedObject[] = [];
  container = new Container();

  addFromImage(img: HTMLImageElement, x: number, y: number, w: number, h: number) {
    const tex = Texture.from(img);
    const sprite = new Sprite({ texture: tex });
    sprite.anchor.set(0.5);
    sprite.position.set(x, y);
    sprite.width = w; sprite.height = h;
    this.container.addChild(sprite);
    this.list.push({ sprite, w, h, x, y });
  }
}
