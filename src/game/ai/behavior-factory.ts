import { Selector, Sequence, type BTNode } from '@ai/bt';
import type { BehaviorDescriptor, BTNodeDef, ActionRef, ConditionRef } from '@ai/behavior-registry';
import type { BehaviorContext } from './behavior-context';
import { createActionNode } from './nodes/actions';
import { createConditionNode } from './nodes/conditions';

export function buildBehaviorTree(descriptor: BehaviorDescriptor, ctx: BehaviorContext): BTNode {
  return instantiateNode(descriptor.root, ctx);
}

function instantiateNode(def: BTNodeDef, ctx: BehaviorContext): BTNode {
  switch (def.type) {
    case 'Selector':
      return new Selector(def.children.map((child) => instantiateNode(child, ctx)), def.name);
    case 'Sequence':
      return new Sequence(def.children.map((child) => instantiateNode(child, ctx)), def.name);
    case 'Condition':
      return createConditionNode(def.ref as ConditionRef, ctx, def.label);
    case 'Action':
      return createActionNode(def.ref as ActionRef, ctx, def.label);
    default:
      throw new Error(`Type de noeud inconnu: ${(def as { type: string }).type}`);
  }
}
