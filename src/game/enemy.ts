import type { World, Bullet } from '@types';
import type { Vec, Blackboard } from '@ai/blackboard';
import { beginBTDebugFrame, endBTDebugFrame, type BTNode } from '@ai/bt';
import { getBehaviorDescriptor, listBehaviorOptions } from '@ai/behavior-registry';
import { EnemyView } from '@game/enemy/view';
import { createEnemyBlackboard, syncEnemyBlackboard } from '@game/enemy/blackboard';
import { buildBehaviorTree } from '@ai/behavior-factory';
import type { BehaviorContext, EnemyBrainState } from '@ai/behavior-context';

export class Enemy {
  private behaviorId: string = listBehaviorOptions()[0]?.id ?? 'classic';

  // visualization
  private view: EnemyView;
  get gfx() { return this.view.gfx; }
  get label() { return this.view.label; }
  get rangeOverlay() { return this.view.rangeOverlay; }

  // shape / physics
  r = 26;
  color = 0x4da3ff;
  x = 0; y = 0;
  vx = 0; vy = 0;

  // move
  maxSpeed = 180;
  accel = 900;
  friction = 0.9;

  // shooting & intents
  wantShoot = false;
  aimAt: Vec = { x: 0, y: 0 };
  lastShoot = 0;
  shootInterval = 4000; // ms

  // distances & evade
  shootDistanceMin = 200;
  shootDistanceMax = 280;
  evadeHorizon = 0.6;
  evadeMargin = 4;
  evadeDuration = 0.35;
  dashBoost = 1.25;

  // aim
  jitterDegrees = 5;
  projectileSpeed = 520;

  // internals
  private lastPlayerPos: Vec | null = null;
  private estPlayerVel: Vec = { x: 0, y: 0 };

  // blackboard + tree
  private bb: Blackboard;
  private tree: BTNode;
  private brainState: EnemyBrainState = { evadeTimeLeft: 0 };
  private context: BehaviorContext;

  getBehaviorTree(): BTNode {
    return this.tree;
  }

  constructor(world: World) {
    this.x = world.w * 0.75;
    this.y = world.h * 0.5;
    this.view = new EnemyView({
      radius: this.r,
      color: this.color,
      shootDistanceMin: this.shootDistanceMin,
      shootDistanceMax: this.shootDistanceMax
    });
    this.view.setPosition(this.x, this.y);

    // init blackboard
    this.bb = createEnemyBlackboard({
      enemyPos: { x: this.x, y: this.y },
      enemyVel: { x: this.vx, y: this.vy },
      enemyRadius: this.r,
      world,
      projectileSpeed: this.projectileSpeed,
      playerPos: { x: 0, y: 0 },
      playerVel: { x: 0, y: 0 },
      distShootMin: this.shootDistanceMin,
      distShootMax: this.shootDistanceMax,
      evadeHorizon: this.evadeHorizon,
      evadeMargin: this.evadeMargin,
      evadeDuration: this.evadeDuration,
      jitterDegrees: this.jitterDegrees
    });

    this.context = {
      bb: this.bb,
      host: {
        dashBoost: this.dashBoost,
        estimateLOS: () => this.estimateLOS(),
        state: this.brainState
      }
    };

    this.tree = this.buildBehaviorTree(this.behaviorId);
    this.view.updateLabel('Idle');
  }

  private buildBehaviorTree(id: string): BTNode {
    const descriptor = getBehaviorDescriptor(id) ?? getBehaviorDescriptor(listBehaviorOptions()[0]?.id ?? '');
    if (!descriptor) throw new Error('Aucun comportement enregistre.');
    return buildBehaviorTree(descriptor, this.context);
  }

  setBehaviorVariant(id: string, force = false) {
    const descriptor = getBehaviorDescriptor(id);
    if (!descriptor) {
      console.warn(`Comportement BT inconnu: ${id}`);
      return;
    }
    const changed = this.behaviorId !== id;
    this.behaviorId = id;
    if (!changed && !force) return;
    this.tree = buildBehaviorTree(descriptor, this.context);
    this.view.updateLabel('Idle');
  }

  getBehaviorVariant(): string {
    return this.behaviorId;
  }

  private accelTowards(dir: Vec, dt: number, boost = 1) {
    const a = { x: dir.x * this.accel * boost, y: dir.y * this.accel * boost };
    this.vx += a.x * dt;
    this.vy += a.y * dt;
    this.vx *= this.friction;
    this.vy *= this.friction;
    const speed = Math.hypot(this.vx, this.vy);
    if (speed > this.maxSpeed) {
      const k = this.maxSpeed / (speed || 1);
      this.vx *= k; this.vy *= k;
    }
  }

  private estimateLOS(): boolean {
    return true;
  }

  update(
    dt: number,
    now: number,
    world: World,
    playerPos: Vec,
    bullets: Bullet[],
    projectileSpeed: number
  ) {
    if (this.lastPlayerPos) {
      const inv = 1 / Math.max(dt, 1e-6);
      this.estPlayerVel = { x: (playerPos.x - this.lastPlayerPos.x) * inv, y: (playerPos.y - this.lastPlayerPos.y) * inv };
      this.estPlayerVel.x *= 0.7; this.estPlayerVel.y *= 0.7;
    }
    this.lastPlayerPos = { ...playerPos };

    this.projectileSpeed = projectileSpeed;

    syncEnemyBlackboard(this.bb, {
      enemyPos: { x: this.x, y: this.y },
      enemyVel: { x: this.vx, y: this.vy },
      enemyRadius: this.r,
      playerPos,
      playerVel: this.estPlayerVel,
      world,
      bullets,
      projectileSpeed,
      distShootMin: this.shootDistanceMin,
      distShootMax: this.shootDistanceMax,
      evadeHorizon: this.evadeHorizon,
      evadeMargin: this.evadeMargin,
      evadeDuration: this.evadeDuration,
      jitterDegrees: this.jitterDegrees
    });

    this.bb.intentMove = undefined;
    this.bb.intentDashBoost = undefined;
    this.bb.intentShoot = false;
    this.bb.intentAimAt = undefined;

    beginBTDebugFrame();
    const status = this.tree.tick(dt);
    endBTDebugFrame();
    this.view.updateLabel(this.bb.runningNodeName || (status === 'Running' ? 'Running' : status));

    const moveDir = this.bb.intentMove || { x: 0, y: 0 };
    const boost = this.bb.intentDashBoost ?? 1;
    const L = Math.hypot(moveDir.x, moveDir.y);
    if (L > 0) this.accelTowards({ x: moveDir.x / L, y: moveDir.y / L }, dt, boost);

    this.wantShoot = false;
    if (this.bb.intentShoot && this.bb.intentAimAt && now - this.lastShoot >= this.shootInterval) {
      this.wantShoot = true;
      this.aimAt = this.bb.intentAimAt;
    }

    this.x += this.vx * dt; this.y += this.vy * dt;

    if (this.x < this.r) { this.x = this.r; this.vx = Math.abs(this.vx); }
    if (this.x > world.w - this.r) { this.x = world.w - this.r; this.vx = -Math.abs(this.vx); }
    if (this.y < this.r) { this.y = this.r; this.vy = Math.abs(this.vy); }
    if (this.y > world.h - this.r) { this.y = world.h - this.r; this.vy = -Math.abs(this.vy); }

    this.view.setPosition(this.x, this.y);
  }
}
