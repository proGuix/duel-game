import { Application, Container, Graphics } from 'pixi.js';
import type { World, State } from '@types';

export class Renderer {
  app: Application;
  root = new Container();
  bg = new Graphics();
  grid = new Graphics();

  constructor(app: Application) {
    this.app = app;
    this.app.stage.addChild(this.root);
    this.root.addChild(this.bg, this.grid);
  }

  resize(world: World) {
    // simple background
    this.bg.clear();
    this.bg.beginFill(0x0e0f13).drawRect(0, 0, world.w, world.h).endFill();

    // grid
    this.grid.clear();
    this.grid.alpha = 0.12;
    this.grid.lineStyle(1, 0xffffff, 1);
    const step = 40;
    for (let x = 0; x <= world.w; x += step) { this.grid.moveTo(x + 0.5, 0).lineTo(x + 0.5, world.h); }
    for (let y = 0; y <= world.h; y += step) { this.grid.moveTo(0, y + 0.5).lineTo(world.w, y + 0.5); }
  }

  setCenterMessage(text: string) {
    const el = document.getElementById('centerMsg')!;
    el.textContent = text;
  }

  setOverlayPause(on: boolean, state: State) {
    this.setCenterMessage(
      on
        ? '⏸️ Jeu en pause — Atelier de dessin ouvert\nAppuyez sur Entrée pour placer'
        : state.over
        ? (state.winner === 'player' ? '🎉 Vous avez gagné !\nAppuyez sur R pour rejouer' : '😵 Vous avez perdu…\nAppuyez sur R pour rejouer')
        : ''
    );
  }
}
