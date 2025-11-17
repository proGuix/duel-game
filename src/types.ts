export type Vec2 = { x: number; y: number };

export type Bullet = {
  gfx: import('pixi.js').Graphics;
  v: Vec2;
  r: number;
  from: 'player' | 'enemy';
};

export type PlacedObject = {
  sprite: import('pixi.js').Sprite;
  w: number;
  h: number;
  x: number;
  y: number;
};

export type World = { w: number; h: number };

export type State = {
  running: boolean;
  over: boolean;
  winner: 'player' | 'enemy' | null;
};
