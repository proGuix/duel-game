import { Condition } from '@ai/bt';
import { V, detectIncomingDanger } from '@ai/blackboard';
import type { ConditionRef } from '@ai/behavior-registry';
import type { BehaviorContext } from '../behavior-context';

type ConditionFactory = (ctx: BehaviorContext, label?: string) => Condition;

const factories: Record<ConditionRef, ConditionFactory> = {
  danger: (ctx, label) =>
    new Condition(() => {
      const res = detectIncomingDanger(ctx.bb);
      ctx.bb.danger = res.danger ? { dir: res.dir } : null;
      return res.danger;
    }, label ?? 'Danger?'),
  inRange: (ctx, label) =>
    new Condition(() => {
      const d = V.len(V.sub(ctx.bb.playerPos, ctx.bb.enemyPos));
      const ok = d >= ctx.bb.distShootMin && d <= ctx.bb.distShootMax;
      ctx.bb.inRange = ok;
      return ok;
    }, label ?? 'InRanged?'),
  needReposition: (ctx, label) =>
    new Condition(() => {
      const d = V.len(V.sub(ctx.bb.playerPos, ctx.bb.enemyPos));
      const rangeOk = d >= ctx.bb.distShootMin && d <= ctx.bb.distShootMax;
      const losOk = ctx.host.estimateLOS();
      ctx.bb.hasLOS = losOk;
      return !rangeOk || !losOk;
    }, label ?? 'NeedReposition?')
};

export function createConditionNode(ref: ConditionRef, ctx: BehaviorContext, label?: string): Condition {
  const factory = factories[ref];
  if (!factory) throw new Error(`Condition inconnue: ${ref as string}`);
  return factory(ctx, label);
}
