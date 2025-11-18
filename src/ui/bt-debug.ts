import type { BTNode, BTNodeType, BTDebugTreeNode, BTDebugPayload } from '@ai/bt';
import { buildBTDebugTree, setBTDebugListener } from '@ai/bt';

let initialized = false;
const nodeElements = new Map<number, HTMLElement>();

export function initBTDebugger(root: BTNode) {
  if (initialized) return;
  initialized = true;

  ensureStyles();

  const panel = document.createElement('div');
  panel.id = 'btDebugPanel';
  panel.innerHTML = `
    <div class="bt-debug-header">
      <strong>Behavior Tree</strong>
      <button type="button" class="bt-debug-toggle">Masquer</button>
    </div>
    <div class="bt-debug-tree"></div>
  `;
  document.body.appendChild(panel);

  const treeContainer = panel.querySelector('.bt-debug-tree') as HTMLDivElement;
  const tree = buildBTDebugTree(root);
  renderTree(tree, treeContainer, 0);

  const toggleBtn = panel.querySelector('.bt-debug-toggle') as HTMLButtonElement;
  toggleBtn.addEventListener('click', () => {
    panel.classList.toggle('collapsed');
    toggleBtn.textContent = panel.classList.contains('collapsed') ? 'Afficher' : 'Masquer';
  });

  setBTDebugListener((payload: BTDebugPayload) => updateNodes(payload));
}

function renderTree(node: BTDebugTreeNode, container: HTMLDivElement, depth: number) {
  const row = document.createElement('div');
  row.className = 'bt-node';
  row.style.setProperty('--depth', depth.toString());
  row.dataset.status = 'Idle';

  const badge = document.createElement('span');
  badge.className = 'bt-node-type';
  badge.textContent = compactType(node.type);

  const name = document.createElement('span');
  name.className = 'bt-node-name';
  name.textContent = node.name;

  row.append(badge, name);
  container.appendChild(row);
  nodeElements.set(node.id, row);

  for (const child of node.children) {
    renderTree(child, container, depth + 1);
  }
}

function updateNodes({ frame, nodes }: BTDebugPayload) {
  for (const meta of nodes) {
    const el = nodeElements.get(meta.id);
    if (!el) continue;
    el.dataset.status = meta.status;
    if (meta.lastFrame === frame) el.classList.add('bt-node-active');
    else el.classList.remove('bt-node-active');
  }
}

function compactType(type: BTNodeType) {
  switch (type) {
    case 'Selector': return 'SEL';
    case 'Sequence': return 'SEQ';
    case 'Condition': return 'COND';
    case 'Action': return 'ACT';
    default: return type;
  }
}

function ensureStyles() {
  if (document.getElementById('btDebugStyles')) return;
  const style = document.createElement('style');
  style.id = 'btDebugStyles';
  style.textContent = `
    #btDebugPanel {
      position: fixed;
      right: 16px;
      bottom: 16px;
      width: min(320px, 28vw);
      max-height: 60vh;
      background: rgba(16, 20, 30, 0.9);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 12px;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
      color: #d7e2ff;
      font-family: 'JetBrains Mono', 'SFMono-Regular', Consolas, monospace;
      font-size: 12px;
      overflow: hidden;
      z-index: 2000;
    }
    #btDebugPanel.collapsed .bt-debug-tree {
      display: none;
    }
    #btDebugPanel .bt-debug-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 12px;
      background: rgba(255, 255, 255, 0.04);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    }
    #btDebugPanel .bt-debug-toggle {
      border: 1px solid rgba(255, 255, 255, 0.2);
      background: transparent;
      color: inherit;
      border-radius: 999px;
      padding: 2px 10px;
      cursor: pointer;
      font-size: 11px;
    }
    #btDebugPanel .bt-debug-tree {
      max-height: calc(60vh - 42px);
      overflow-y: auto;
    }
    #btDebugPanel .bt-node {
      position: relative;
      --highlight-color: rgba(255, 255, 255, 0.24);
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 12px 4px calc(20px + (var(--depth) * 12px));
    }
    #btDebugPanel .bt-node::before {
      content: '';
      position: absolute;
      left: calc(12px + (var(--depth) * 12px));
      right: 6px;
      top: 3px;
      bottom: 3px;
      border-radius: 4px;
      background: var(--highlight-color);
      opacity: 0.35;
      pointer-events: none;
    }
    #btDebugPanel .bt-node > * {
      position: relative;
      z-index: 1;
    }
    #btDebugPanel .bt-node-type {
      font-size: 10px;
      letter-spacing: 0.05em;
      color: #8fb5ff;
      opacity: 0.85;
      width: 42px;
    }
    #btDebugPanel .bt-node-name {
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    #btDebugPanel .bt-node[data-status='Running'] {
      background: rgba(255, 216, 75, 0.08);
      --highlight-color: rgba(255, 216, 75, 0.6);
    }
    #btDebugPanel .bt-node[data-status='Success'] {
      background: rgba(77, 255, 136, 0.08);
      --highlight-color: rgba(77, 255, 136, 0.6);
    }
    #btDebugPanel .bt-node[data-status='Failure'] {
      background: rgba(255, 90, 101, 0.08);
      --highlight-color: rgba(255, 90, 101, 0.6);
    }
    #btDebugPanel .bt-node[data-status='Idle'] {
      opacity: 0.6;
      --highlight-color: rgba(255, 255, 255, 0.06);
    }
    #btDebugPanel .bt-node.bt-node-active {
      box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.35);
    }
  `;
  document.head.appendChild(style);
}

