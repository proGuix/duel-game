// ai/bt.ts
export type BTStatus = 'Success' | 'Failure' | 'Running';

export interface BTNode {
  tick(dt: number): BTStatus;
  reset?(): void;
  name?: string;
}

// Composite: Selector (OR)
export class Selector implements BTNode {
  name?: string;
  constructor(private children: BTNode[], name?: string) { this.name = name; }
  tick(dt: number): BTStatus {
    for (const c of this.children) {
      const s = c.tick(dt);
      if (s !== 'Failure') return s; // Running ou Success
    }
    return 'Failure';
  }
  reset() { for (const c of this.children) c.reset?.(); }
}

// Composite: Sequence (AND)
export class Sequence implements BTNode {
  name?: string;
  private i = 0;
  constructor(private children: BTNode[], name?: string) { this.name = name; }
  tick(dt: number): BTStatus {
    while (this.i < this.children.length) {
      const s = this.children[this.i].tick(dt);
      if (s === 'Running') return 'Running';
      if (s === 'Failure') { this.i = 0; return 'Failure'; }
      this.i++;
    }
    this.i = 0;
    return 'Success';
  }
  reset() { this.i = 0; for (const c of this.children) c.reset?.(); }
}

// Leaf: Condition
export class Condition implements BTNode {
  name?: string;
  constructor(private fn: () => boolean, name?: string) { this.name = name; }
  tick(): BTStatus { return this.fn() ? 'Success' : 'Failure'; }
}

// Leaf: Action
export class Action implements BTNode {
  name?: string;
  constructor(private fn: (dt: number) => BTStatus, name?: string) { this.name = name; }
  tick(dt: number): BTStatus { return this.fn(dt); }
  reset() {}
}
