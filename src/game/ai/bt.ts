// ai/bt.ts
export type BTStatus = 'Success' | 'Failure' | 'Running';
export type BTNodeType = 'Selector' | 'Sequence' | 'Condition' | 'Action';

export interface BTNode {
  tick(dt: number): BTStatus;
  reset?(): void;
  name?: string;
}

export type BTDebugMeta = {
  id: number;
  name: string;
  type: BTNodeType;
  status: BTStatus | 'Idle';
  lastFrame: number;
};

export type BTDebugPayload = {
  frame: number;
  nodes: BTDebugMeta[];
};

type BTDebugListener = (payload: BTDebugPayload) => void;

const nodeMetaMap = new WeakMap<BTNode, BTDebugMeta>();
const allMetas: BTDebugMeta[] = [];
let nextNodeId = 1;
let currentFrame = 0;
let debugListener: BTDebugListener | null = null;

function registerNode(node: BTNode, type: BTNodeType, name?: string) {
  if (nodeMetaMap.has(node)) return;
  const id = nextNodeId++;
  const meta: BTDebugMeta = {
    id,
    name: name || node.name || `Node_${id}`,
    type,
    status: 'Idle',
    lastFrame: 0
  };
  nodeMetaMap.set(node, meta);
  allMetas.push(meta);
}

function markNode(node: BTNode, status: BTStatus) {
  const meta = nodeMetaMap.get(node);
  if (!meta) return;
  meta.status = status;
  meta.lastFrame = currentFrame;
}

function snapshotMetas(): BTDebugMeta[] {
  return allMetas.map((meta) => ({ ...meta }));
}

export function beginBTDebugFrame() {
  currentFrame++;
  for (const meta of allMetas) {
    meta.status = 'Idle';
  }
}

export function endBTDebugFrame() {
  if (!debugListener) return;
  debugListener({ frame: currentFrame, nodes: snapshotMetas() });
}

export function setBTDebugListener(listener: BTDebugListener | null) {
  debugListener = listener;
  if (listener) listener({ frame: currentFrame, nodes: snapshotMetas() });
}

// Composite: Selector (OR)
export class Selector implements BTNode {
  name?: string;
  constructor(private children: BTNode[], name?: string) {
    this.name = name;
    registerNode(this, 'Selector', name);
  }
  tick(dt: number): BTStatus {
    for (const c of this.children) {
      const s = c.tick(dt);
      if (s !== 'Failure') {
        markNode(this, s);
        return s; // Running ou Success
      }
    }
    markNode(this, 'Failure');
    return 'Failure';
  }
  reset() { for (const c of this.children) c.reset?.(); }
  getChildren() { return [...this.children]; }
}

// Composite: Sequence (AND)
export class Sequence implements BTNode {
  name?: string;
  private i = 0;
  constructor(private children: BTNode[], name?: string) {
    this.name = name;
    registerNode(this, 'Sequence', name);
  }
  tick(dt: number): BTStatus {
    for (let j = 0; j < this.i; j++) {
      const child = this.children[j];
      if (child) markNode(child, 'Success');
    }
    while (this.i < this.children.length) {
      const s = this.children[this.i].tick(dt);
      if (s === 'Running') {
        markNode(this, 'Running');
        return 'Running';
      }
      if (s === 'Failure') {
        this.i = 0;
        markNode(this, 'Failure');
        return 'Failure';
      }
      this.i++;
    }
    this.i = 0;
    markNode(this, 'Success');
    return 'Success';
  }
  reset() { this.i = 0; for (const c of this.children) c.reset?.(); }
  getChildren() { return [...this.children]; }
}

// Leaf: Condition
export class Condition implements BTNode {
  name?: string;
  constructor(private fn: () => boolean, name?: string) {
    this.name = name;
    registerNode(this, 'Condition', name);
  }
  tick(): BTStatus {
    const result = this.fn() ? 'Success' : 'Failure';
    markNode(this, result);
    return result;
  }
}

// Leaf: Action
export class Action implements BTNode {
  name?: string;
  constructor(private fn: (dt: number) => BTStatus, name?: string) {
    this.name = name;
    registerNode(this, 'Action', name);
  }
  tick(dt: number): BTStatus {
    const result = this.fn(dt);
    markNode(this, result);
    return result;
  }
  reset() {}
}

export type BTDebugTreeNode = {
  id: number;
  name: string;
  type: BTNodeType;
  children: BTDebugTreeNode[];
};

export function buildBTDebugTree(root: BTNode): BTDebugTreeNode {
  const meta = nodeMetaMap.get(root);
  if (!meta) throw new Error('Behavior tree node missing debug metadata.');
  return {
    id: meta.id,
    name: meta.name,
    type: meta.type,
    children: getBTChildren(root).map((child) => buildBTDebugTree(child))
  };
}

export function getBTChildren(node: BTNode): BTNode[] {
  if (node instanceof Selector || node instanceof Sequence) return node.getChildren();
  return [];
}

