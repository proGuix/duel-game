import type { Blackboard, Vec } from '@ai/blackboard';
import type { World, Bullet } from '@types';

export type BlackboardConfig = {
  enemyPos: Vec;
  enemyVel: Vec;
  enemyRadius: number;
  world: World;
  projectileSpeed: number;
  playerPos: Vec;
  playerVel: Vec;
  distShootMin: number;
  distShootMax: number;
  evadeHorizon: number;
  evadeMargin: number;
  evadeDuration: number;
  jitterDegrees: number;
};

export type BlackboardSync = Omit<BlackboardConfig, 'world' | 'enemyRadius'> & {
  world: World;
  bullets: Bullet[];
  enemyRadius: number;
};

export function createEnemyBlackboard(config: BlackboardConfig): Blackboard {
  return {
    enemyPos: { ...config.enemyPos },
    enemyVel: { ...config.enemyVel },
    enemyRadius: config.enemyRadius,
    playerPos: { ...config.playerPos },
    playerVel: { ...config.playerVel },
    worldSize: { w: config.world.w, h: config.world.h },
    bullets: [],
    projectileSpeed: config.projectileSpeed,
    distShootMin: config.distShootMin,
    distShootMax: config.distShootMax,
    evadeHorizon: config.evadeHorizon,
    evadeMargin: config.evadeMargin,
    evadeDuration: config.evadeDuration,
    jitterRadians: config.jitterDegrees * Math.PI / 180,
    runningNodeName: 'Idle'
  };
}

export function syncEnemyBlackboard(bb: Blackboard, payload: BlackboardSync) {
  bb.enemyPos = { ...payload.enemyPos };
  bb.enemyVel = { ...payload.enemyVel };
  bb.enemyRadius = payload.enemyRadius;
  bb.playerPos = { ...payload.playerPos };
  bb.playerVel = { ...payload.playerVel };
  bb.worldSize = { w: payload.world.w, h: payload.world.h };
  bb.bullets = payload.bullets;
  bb.projectileSpeed = payload.projectileSpeed;
  bb.distShootMin = payload.distShootMin;
  bb.distShootMax = payload.distShootMax;
  bb.evadeHorizon = payload.evadeHorizon;
  bb.evadeMargin = payload.evadeMargin;
  bb.evadeDuration = payload.evadeDuration;
  bb.jitterRadians = payload.jitterDegrees * Math.PI / 180;
}
