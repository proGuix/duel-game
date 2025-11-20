import { Graphics, Text } from 'pixi.js';
import type { World, Bullet } from '@types';
import { Selector, Sequence, Condition, Action, type BTNode, type BTStatus, beginBTDebugFrame, endBTDebugFrame } from '@ai/bt';
import { Blackboard, V, crownScore, detectIncomingDanger, leadAim } from '@ai/blackboard';
import {
  getBehaviorDescriptor,
  listBehaviorOptions,
  type ActionRef,
  type BTNodeDef,
  type ConditionRef
} from '@ai/behavior-registry';

type Vec = { x: number; y: number };

export class Enemy {
  gfx = new Graphics();
  label = new Text('', { fill: 0x4da3ff, fontSize: 12 });
  rangeOverlay = new Graphics();
  private behaviorId: string = listBehaviorOptions()[0]?.id ?? 'classic';

  // shape
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
  jitterDegrees = 5;    // règle ta difficulté (ex: 10/5/2)
  projectileSpeed = 520;

  // internals
  private lastPlayerPos: Vec | null = null;
  private estPlayerVel: Vec = { x: 0, y: 0 };

  // blackboard + tree
  private bb: Blackboard;
  private tree: BTNode;

  // debug
  private runningNodeName = '—';
  getBehaviorTree(): BTNode {
    return this.tree;
  }

  private evadeTimeLeft = 0;
  nextDirAt = 0;

  constructor(world: World) {
    this.x = world.w * 0.75;
    this.y = world.h * 0.5;
    this.draw();
    this.setupRangeOverlay();
    this.gfx.addChild(this.label);
    this.label.position.set(-this.r, -this.r - 18);

    // init blackboard
    this.bb = {
      enemyPos: { x: this.x, y: this.y },
      enemyVel: { x: this.vx, y: this.vy },
      enemyRadius: this.r,

      playerPos: { x: 0, y: 0 },
      playerVel: { x: 0, y: 0 },

      worldSize: { w: world.w, h: world.h },
      bullets: [],
      projectileSpeed: this.projectileSpeed,

      distShootMin: this.shootDistanceMin,
      distShootMax: this.shootDistanceMax,
      evadeHorizon: this.evadeHorizon,
      evadeMargin: this.evadeMargin,
      evadeDuration: this.evadeDuration,
      jitterRadians: this.jitterDegrees * Math.PI / 180,
    };

    this.tree = this.buildBehaviorTree(this.behaviorId);
    this.updateLabel('Idle');
  }

  // ---------- render ----------
  draw() {
    this.gfx.clear();
    this.gfx.beginFill(this.color);
    this.gfx.circle(0, 0, this.r);
    this.gfx.endFill();
    this.gfx.position.set(this.x, this.y);
    this.drawRangeOverlay();
  }
  private setupRangeOverlay() {
    this.rangeOverlay.alpha = 0.35;
    this.rangeOverlay.eventMode = 'none';
    this.rangeOverlay.zIndex = -1;
    this.rangeOverlay.position.set(0, 0);
    this.gfx.addChildAt(this.rangeOverlay, 0);
    this.drawRangeOverlay();
  }

  private drawRangeOverlay() {
    this.rangeOverlay.clear();
    this.rangeOverlay.circle(0, 0, this.shootDistanceMin).stroke({ width: 2.5, color: 0xffd84b, alpha: 0.55 });
    this.rangeOverlay.circle(0, 0, this.shootDistanceMax).stroke({ width: 2.5, color: 0xffd84b, alpha: 0.55 });
  }
  private updateLabel(name: string) {
    this.runningNodeName = name;
    this.label.text = `BT: ${name}`;
  }

  private instantiateNode(def: BTNodeDef): BTNode {
    switch (def.type) {
      case 'Selector':
        return new Selector(def.children.map((child) => this.instantiateNode(child)), def.name);
      case 'Sequence':
        return new Sequence(def.children.map((child) => this.instantiateNode(child)), def.name);
      case 'Condition':
        return this.createCondition(def.ref as ConditionRef, def.label);
      case 'Action':
        return this.createAction(def.ref as ActionRef, def.label);
      default:
        throw new Error(`Type de nœud inconnu: ${(def as { type: string }).type}`);
    }
  }

  private createCondition(ref: ConditionRef, label?: string): Condition {
    switch (ref) {
      case 'danger':
        return new Condition(() => {
          const res = detectIncomingDanger(this.bb);
          this.bb.danger = res.danger ? { dir: res.dir } : null;
          return res.danger;
        }, label ?? 'Danger?');
      case 'inRange':
        return new Condition(() => {
          const d = V.len(V.sub(this.bb.playerPos, this.bb.enemyPos));
          const ok = d >= this.bb.distShootMin && d <= this.bb.distShootMax;
          this.bb.inRange = ok;
          return ok;
        }, label ?? 'InRanged?');
      case 'needReposition':
        return new Condition(() => {
          const d = V.len(V.sub(this.bb.playerPos, this.bb.enemyPos));
          const rangeOk = d >= this.bb.distShootMin && d <= this.bb.distShootMax;
          const losOk = this.estimateLOS();
          this.bb.hasLOS = losOk;
          return !rangeOk || !losOk;
        }, label ?? 'NeedReposition?');
      default:
        throw new Error(`Condition inconnue: ${ref}`);
    }
  }

  private createAction(ref: ActionRef, label?: string): Action {
    switch (ref) {
      case 'evade':
        return new Action((dt) => this.actEvade(dt), label ?? 'Evade');
      case 'rangedAttack':
        return new Action((dt) => this.actRanged(dt), label ?? 'RangedAttack');
      case 'reposition':
        return new Action((dt) => this.actReposition(dt), label ?? 'Reposition');
      case 'patrol':
        return new Action((dt) => this.actPatrol(dt), label ?? 'Patrol');
      default:
        throw new Error(`Action inconnue: ${ref}`);
    }
  }

  // ---------- physics helpers ----------
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

  // ---------- BT construction ----------

  private buildBehaviorTree(id: string): BTNode {
    const descriptor = getBehaviorDescriptor(id);
    if (!descriptor) {
      const fallback = listBehaviorOptions()[0];
      if (!fallback) throw new Error('Aucun comportement enregistré.');
      this.behaviorId = fallback.id;
      const fb = getBehaviorDescriptor(fallback.id);
      if (!fb) throw new Error('Descripteur introuvable.');
      return this.instantiateNode(fb.root);
    }
    return this.instantiateNode(descriptor.root);
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
    this.tree = this.instantiateNode(descriptor.root);
    this.updateLabel('Idle');
  }

  getBehaviorVariant(): string {
    return this.behaviorId;
  }



  // ---------- Actions impl ----------
 private actEvade(dt: number): BTStatus {
  this.bb.runningNodeName = 'Evade';

  // si pas de danger (par sécurité), échoue pour laisser le BT essayer autre chose
  if (!this.bb.danger) return 'Failure';

  // initialiser un dash court si pas déjà actif
  if (this.evadeTimeLeft <= 0) {
    this.evadeTimeLeft = this.bb.evadeDuration;
  }

  // dash perpendiculaire à la direction d'arrivée du projectile
  const dir = V.perp(V.norm(this.bb.danger.dir));
  this.bb.intentMove = dir;
  this.bb.intentDashBoost = this.dashBoost;

  this.evadeTimeLeft -= dt;

  // tant qu'il reste du temps d'esquive → Running
  if (this.evadeTimeLeft > 0) return 'Running';

  // fin de l'esquive → Success, et on efface le danger courant
  this.evadeTimeLeft = 0;
  this.bb.danger = null;
  return 'Success';
}

  private actRanged(dt: number): BTStatus {
    this.bb.runningNodeName = 'Attack';
    const to = V.sub(this.bb.playerPos, this.bb.enemyPos);
    const dist = V.len(to);
    const dirTo = V.norm(to);

    // mouvement “couronne” + strafe selon couronne score
    const targetDist = crownScore(dist, this.bb.distShootMin + 20, this.bb.distShootMax - 20);
    let move: Vec = { x: 0, y: 0 };
    if (dist < this.bb.distShootMin + 20) move = V.mul(dirTo, -1);
    else if (dist > this.bb.distShootMax - 20) move = dirTo;
    const strafe = V.mul(V.perp(dirTo), 0.8 * (Math.random() < 0.5 ? 1 : -1));
    move = V.norm(V.add(move, strafe));
    this.bb.intentMove = move;

    // lead + jitter
    const lead = leadAim(this.bb.enemyPos, this.bb.playerPos, this.bb.playerVel, this.bb.projectileSpeed);
    let aim = lead ?? this.bb.playerPos;

    // jitter angulaire
    const jitter = (Math.random() - 0.5) * 2 * this.bb.jitterRadians;
    const aimDir = V.norm(V.sub(aim, this.bb.enemyPos));
    const cos = Math.cos(jitter), sin = Math.sin(jitter);
    const jittered = { x: aimDir.x * cos - aimDir.y * sin, y: aimDir.x * sin + aimDir.y * cos };
    aim = { x: this.bb.enemyPos.x + jittered.x * 1000, y: this.bb.enemyPos.y + jittered.y * 1000 };

    this.bb.intentShoot = true;
    this.bb.intentAimAt = aim;

    return 'Running';
  }

  private actReposition(dt: number): BTStatus {
    this.bb.runningNodeName = 'Reposition';
    // Simple: rejoindre une distance médiane + créer un angle latéral (strafe)
    const to = V.sub(this.bb.playerPos, this.bb.enemyPos);
    const dirTo = V.norm(to);
    let move = dirTo;

    // si trop près → recule ; si trop loin → avance
    const dist = V.len(to);
    if (dist < this.bb.distShootMin) move = V.mul(dirTo, -1);
    if (dist > this.bb.distShootMax) move = dirTo;

    // strafing pour changer l’angle de LOS (placeholder sans obstacles)
    move = V.norm(V.add(move, V.mul(V.perp(dirTo), 0.7 * (Math.random() < 0.5 ? 1 : -1))));

    this.bb.intentMove = move;
    return 'Running';
  }

  private actPatrol(dt: number): BTStatus {
    this.bb.runningNodeName = 'Patrol';
    // petit bruit aléatoire
    const dx = (Math.random() - 0.5) * 2;
    const dy = (Math.random() - 0.5) * 2;
    this.bb.intentMove = V.norm({ x: dx, y: dy });
    return 'Running';
  }

  private estimateLOS(): boolean {
    // TODO: remplace par un raycast contre tes murs/obstacles quand tu les auras.
    // Pour l’instant, on considère LOS = true (pas d’obstacles).
    return true;
  }

  // ---------- Update (appelé par main.ts) ----------
  update(
    dt: number,
    now: number,
    world: World,
    playerPos: Vec,
    bullets: Bullet[],
    projectileSpeed: number
  ) {
    // Perception → blackboard
    if (this.lastPlayerPos) {
      const inv = 1 / Math.max(dt, 1e-6);
      this.estPlayerVel = { x: (playerPos.x - this.lastPlayerPos.x) * inv, y: (playerPos.y - this.lastPlayerPos.y) * inv };
      // léger lissage
      this.estPlayerVel.x *= 0.7; this.estPlayerVel.y *= 0.7;
    }
    this.lastPlayerPos = { ...playerPos };

    this.projectileSpeed = projectileSpeed;

    this.bb.enemyPos = { x: this.x, y: this.y };
    this.bb.enemyVel = { x: this.vx, y: this.vy };
    this.bb.enemyRadius = this.r;
    this.bb.playerPos = playerPos;
    this.bb.playerVel = this.estPlayerVel;
    this.bb.worldSize = { w: world.w, h: world.h };
    this.bb.bullets = bullets;
    this.bb.projectileSpeed = projectileSpeed;

    this.bb.distShootMin = this.shootDistanceMin;
    this.bb.distShootMax = this.shootDistanceMax;
    this.bb.evadeHorizon = this.evadeHorizon;
    this.bb.evadeMargin = this.evadeMargin;
    this.bb.evadeDuration = this.evadeDuration;
    this.bb.jitterRadians = this.jitterDegrees * Math.PI / 180;

    // reset intents
    this.bb.intentMove = undefined;
    this.bb.intentDashBoost = undefined;
    this.bb.intentShoot = false;
    this.bb.intentAimAt = undefined;

    // Tick BT
    beginBTDebugFrame();
    const status = this.tree.tick(dt);
    endBTDebugFrame();
    this.updateLabel(this.bb.runningNodeName || (status === 'Running' ? 'Running' : status));

    // Appliquer intents
    const moveDir = this.bb.intentMove || { x: 0, y: 0 };
    const boost = this.bb.intentDashBoost ?? 1;
    const L = Math.hypot(moveDir.x, moveDir.y);
    if (L > 0) this.accelTowards({ x: moveDir.x / L, y: moveDir.y / L }, dt, boost);

    // Tir (même contrat que ta version précédente : main.ts fait le spawn)
    this.wantShoot = false;
    if (this.bb.intentShoot && this.bb.intentAimAt && now - this.lastShoot >= this.shootInterval) {
      this.wantShoot = true;
      this.aimAt = this.bb.intentAimAt;
      // lastShoot est mis à jour dans main.ts quand le tir est réellement spawné
    }

    // Intégration + murs
    this.x += this.vx * dt; this.y += this.vy * dt;

    if (this.x < this.r) { this.x = this.r; this.vx = Math.abs(this.vx); }
    if (this.x > world.w - this.r) { this.x = world.w - this.r; this.vx = -Math.abs(this.vx); }
    if (this.y < this.r) { this.y = this.r; this.vy = Math.abs(this.vy); }
    if (this.y > world.h - this.r) { this.y = world.h - this.r; this.vy = -Math.abs(this.vy); }

    this.gfx.position.set(this.x, this.y);
  }
}
