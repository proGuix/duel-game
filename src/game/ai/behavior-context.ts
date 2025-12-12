import type { Blackboard } from './blackboard';

export type EnemyBrainState = {
  evadeTimeLeft: number;
};

export type BehaviorHost = {
  dashBoost: number;
  estimateLOS: () => boolean;
  state: EnemyBrainState;
};

export type BehaviorContext = {
  bb: Blackboard;
  host: BehaviorHost;
};
