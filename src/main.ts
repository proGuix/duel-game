import { Application, Container, Graphics } from 'pixi.js';
import { Input } from '@core/input';
import { clamp } from '@core/math';
import type { State, World } from '@types';
import { Player } from '@game/player';
import { Enemy } from '@game/enemy';
import { Bullets } from '@game/bullets';
import { ObjectsLayer } from '@game/objects';
import { Renderer } from '@game/renderer';
import { openDrawing, closeDrawingAndExport, isDrawingActive } from '@ui/drawing';

async function bootstrap() {
  const app = new Application();
  await app.init({
    background: '#0e0f13',
    resizeTo: window,
    antialias: true
  });
  document.getElementById('app')!.appendChild(app.canvas);

  const world: World = { w: app.renderer.width, h: app.renderer.height };
  const input = new Input();
  const renderer = new Renderer(app);

  // Layers
  const gameLayer = new Container();
  const bulletsLayer = new Container();
  const objects = new ObjectsLayer();
  renderer.root.addChild(objects.container, bulletsLayer, gameLayer);

  // Entities
  const player = new Player(world);
  const enemy = new Enemy(world);
  gameLayer.addChild(player.gfx, enemy.gfx);

  // Bullets
  const bullets = new Bullets();

  const state: State = { running: true, over: false, winner: null };

  // Direction line (optional)
  const aim = new Graphics();
  gameLayer.addChild(aim);

  function resize() {
    world.w = app.renderer.width;
    world.h = app.renderer.height;
    renderer.resize(world);
  }
  app.renderer.on('resize', resize);
  resize();

  let lastMouse = { x: world.w / 2, y: world.h / 2 };
  window.addEventListener('mousemove', (e) => { lastMouse = { x: e.clientX, y: e.clientY }; player.target = { ...lastMouse }; });

  // Input keys
  window.addEventListener('keydown', async (e) => {
    if (e.code === 'Space') {
      if (!isDrawingActive() && !state.over) {
        e.preventDefault();
        shootFromPlayer();
      }
    } else if (e.key === 'r' || e.key === 'R') {
      e.preventDefault(); restart();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!isDrawingActive()) {
        // open drawing, anchor at current cursor
        drawingAnchor = { x: clamp(lastMouse.x, 0, world.w), y: clamp(lastMouse.y, 0, world.h) };
        state.running = false;
        renderer.setOverlayPause(true, state);
        const img = await openDrawing(); // wait user
        // overlay closed
        state.running = !state.over;
        renderer.setOverlayPause(false, state);
        if (img) {
          const w = Math.min(120, img.width);
          const h = Math.min(120, img.height);
          objects.addFromImage(img, drawingAnchor.x, drawingAnchor.y, w, h);
        }
      } else {
        closeDrawingAndExport();
      }
    }
  });

  function shootFromPlayer() {
    const now = performance.now();
    if (now - player.lastShoot < player.cooldown) return;
    player.lastShoot = now;
    const b = bullets.spawn({ x: player.x, y: player.y, r: player.r }, { x: enemy.x, y: enemy.y }, 'player');
    bulletsLayer.addChild(b.gfx);
  }

  // function shootFromEnemy(now: number) {
  //   if (now - enemy.lastShoot < enemy.shootInterval || state.over) return;
  //   enemy.lastShoot = now;
  //   const b = bullets.spawn({ x: enemy.x, y: enemy.y, r: enemy.r }, { x: player.x, y: player.y }, 'enemy');
  //   bulletsLayer.addChild(b.gfx);
  // }

    function shootFromEnemy(now: number) {
    if (state.over) return;

    // L'IA décide : veut-elle tirer ?
    if (!enemy.wantShoot) return;

    // Cooldown côté ennemi (éviter double tir la même frame)
    if (now - enemy.lastShoot < enemy.shootInterval) return;

    enemy.lastShoot = now;

    // Vise la position proposée par l'IA (aimAt)
    const b = bullets.spawn(
      { x: enemy.x, y: enemy.y, r: enemy.r },
      { x: enemy.aimAt.x, y: enemy.aimAt.y },
      'enemy'
    );
    bulletsLayer.addChild(b.gfx);
  }


  // Placement object (drawing)
  let drawingAnchor = { x: world.w / 2, y: world.h / 2 };

  // Update loop
  app.ticker.add(() => {
    const dt = app.ticker.deltaMS / 1000;
    const now = performance.now();

    if (state.running) {
      player.update(dt, world);
      enemy.update(dt, now, world, { x: player.x, y: player.y }, bullets.list, bullets.speed);
      shootFromEnemy(now);
      bullets.update(dt, world);

      // collisions
      if (bullets.checkHit({ x: enemy.x, y: enemy.y, r: enemy.r }, 'player')) {
        state.over = true; state.running = false; state.winner = 'player';
        renderer.setCenterMessage('🎉 Vous avez gagné !\nAppuyez sur R pour rejouer');
      }
      if (bullets.checkHit({ x: player.x, y: player.y, r: player.r }, 'enemy')) {
        state.over = true; state.running = false; state.winner = 'enemy';
        renderer.setCenterMessage('😵 Vous avez perdu…\nAppuyez sur R pour rejouer');
      }

      // aim line
      aim.clear();
      aim.alpha = 0.35;
      aim.lineStyle(2, 0xffd84b, 1).moveTo(player.x, player.y).lineTo(enemy.x, enemy.y);
    }
  });

  // Restart
  function restart() {
    state.running = true; state.over = false; state.winner = null;
    // Reset positions
    player.x = world.w * 0.25; player.y = world.h * 0.5; player.target = null; player.lastShoot = 0; player.draw();
    enemy.x = world.w * 0.75; enemy.y = world.h * 0.5; enemy.vx = 0; enemy.vy = 0; enemy.lastShoot = 0; enemy.nextDirAt = 0; enemy.draw();

    // Clear bullets
    for (const b of bullets.list) b.gfx.destroy();
    bullets.list.length = 0;

    // Keep placed objects; to clear them too, uncomment:
    // for (const o of objects.list) o.sprite.destroy(); objects.list.length = 0; objects.container.removeChildren();

    renderer.setCenterMessage('');
  }
}

bootstrap();
