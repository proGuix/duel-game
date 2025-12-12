import { Action, type BTStatus } from '@ai/bt';
import { V, leadAim } from '@ai/blackboard';
import type { ActionRef } from '@ai/behavior-registry';
import type { BehaviorContext } from '../behavior-context';

type ActionFactory = (ctx: BehaviorContext, label?: string) => Action;

const factories: Record<ActionRef, ActionFactory> = {
  evade: (ctx, label) =>
    new Action((dt) => actEvade(ctx, dt), label ?? 'Evade'),
  rangedAttack: (ctx, label) =>
    new Action((dt) => actRanged(ctx, dt), label ?? 'RangedAttack'),
  reposition: (ctx, label) =>
    new Action((dt) => actReposition(ctx, dt), label ?? 'Reposition'),
  patrol: (ctx, label) =>
    new Action((dt) => actPatrol(ctx, dt), label ?? 'Patrol'),
  strafe: (ctx, label) =>
    new Action((dt) => actStrafe(ctx, dt), label ?? 'Strafe'),
  charge: (ctx, label) =>
    new Action((dt) => actCharge(ctx, dt), label ?? 'Charge')
};

export function createActionNode(ref: ActionRef, ctx: BehaviorContext, label?: string): Action {
  const factory = factories[ref];
  if (!factory) throw new Error(`Action inconnue: ${ref as string}`);
  return factory(ctx, label);
}

function actEvade(ctx: BehaviorContext, dt: number): BTStatus {
  ctx.bb.runningNodeName = 'Evade';
  if (!ctx.bb.danger) return 'Failure';

  if (ctx.host.state.evadeTimeLeft <= 0) {
    ctx.host.state.evadeTimeLeft = ctx.bb.evadeDuration;
  }

  const dir = V.perp(V.norm(ctx.bb.danger.dir));
  ctx.bb.intentMove = dir;
  ctx.bb.intentDashBoost = ctx.host.dashBoost;
  ctx.host.state.evadeTimeLeft -= dt;

  if (ctx.host.state.evadeTimeLeft > 0) return 'Running';

  ctx.host.state.evadeTimeLeft = 0;
  ctx.bb.danger = null;
  return 'Success';
}

function actRanged(ctx: BehaviorContext, dt: number): BTStatus {
  ctx.bb.runningNodeName = 'Attack';
  const to = V.sub(ctx.bb.playerPos, ctx.bb.enemyPos);
  const dist = V.len(to);
  const dirTo = V.norm(to);

  let move = { x: 0, y: 0 };
  if (dist < ctx.bb.distShootMin + 20) move = V.mul(dirTo, -1);
  else if (dist > ctx.bb.distShootMax - 20) move = dirTo;
  const strafe = V.mul(V.perp(dirTo), 0.8 * (Math.random() < 0.5 ? 1 : -1));
  move = V.norm(V.add(move, strafe));
  ctx.bb.intentMove = move;

  const lead = leadAim(ctx.bb.enemyPos, ctx.bb.playerPos, ctx.bb.playerVel, ctx.bb.projectileSpeed);
  let aim = lead ?? ctx.bb.playerPos;

  const jitter = (Math.random() - 0.5) * 2 * ctx.bb.jitterRadians;
  const aimDir = V.norm(V.sub(aim, ctx.bb.enemyPos));
  const cos = Math.cos(jitter);
  const sin = Math.sin(jitter);
  const jittered = { x: aimDir.x * cos - aimDir.y * sin, y: aimDir.x * sin + aimDir.y * cos };
  aim = { x: ctx.bb.enemyPos.x + jittered.x * 1000, y: ctx.bb.enemyPos.y + jittered.y * 1000 };

  ctx.bb.intentShoot = true;
  ctx.bb.intentAimAt = aim;
  return 'Running';
}

function actReposition(ctx: BehaviorContext, dt: number): BTStatus {
  ctx.bb.runningNodeName = 'Reposition';
  const to = V.sub(ctx.bb.playerPos, ctx.bb.enemyPos);
  const dirTo = V.norm(to);
  let move = dirTo;

  const dist = V.len(to);
  if (dist < ctx.bb.distShootMin) move = V.mul(dirTo, -1);
  if (dist > ctx.bb.distShootMax) move = dirTo;

  move = V.norm(
    V.add(move, V.mul(V.perp(dirTo), 0.7 * (Math.random() < 0.5 ? 1 : -1)))
  );

  ctx.bb.intentMove = move;
  return 'Running';
}

function actPatrol(ctx: BehaviorContext, dt: number): BTStatus {
  ctx.bb.runningNodeName = 'Patrol';
  const dx = (Math.random() - 0.5) * 2;
  const dy = (Math.random() - 0.5) * 2;
  ctx.bb.intentMove = V.norm({ x: dx, y: dy });
  return 'Running';
}

function actStrafe(ctx: BehaviorContext, dt: number): BTStatus {
  ctx.bb.runningNodeName = 'Strafe';
  const to = V.sub(ctx.bb.playerPos, ctx.bb.enemyPos);
  const dirTo = V.norm(to);
  // rotation constante (gauche) + leger biais pour garder distance
  const lateral = V.perp(dirTo);
  const radialBias = ctx.bb.inRange ? 0 : ctx.bb.distShootMin - V.len(to);
  let move = V.add(lateral, V.mul(dirTo, radialBias > 0 ? -0.2 : 0.2));
  move = V.norm(move);
  ctx.bb.intentMove = move;
  return 'Running';
}

function actCharge(ctx: BehaviorContext, dt: number): BTStatus {
  ctx.bb.runningNodeName = 'Charge';
  const to = V.sub(ctx.bb.playerPos, ctx.bb.enemyPos);
  const dirTo = V.norm(to);
  ctx.bb.intentMove = dirTo;
  ctx.bb.intentDashBoost = Math.max(ctx.bb.intentDashBoost ?? 1, 1.2);
  return 'Running';
}
