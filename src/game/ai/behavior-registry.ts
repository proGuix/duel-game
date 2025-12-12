import fallbackFile from '../../../enemy-behaviors.json';

export type BehaviorOption = { id: string; label: string };

export type ConditionRef = 'danger' | 'inRange' | 'needReposition' | 'hasLOS' | 'tooClose';
export type ActionRef = 'evade' | 'rangedAttack' | 'reposition' | 'patrol' | 'strafe' | 'charge';

export type CompositeType = 'Selector' | 'Sequence';

export type ConditionNodeDef = { type: 'Condition'; ref: ConditionRef; label?: string };
export type ActionNodeDef = { type: 'Action'; ref: ActionRef; label?: string };
export type CompositeNodeDef = { type: CompositeType; name: string; children: BTNodeDef[] };
export type BTNodeDef = CompositeNodeDef | ConditionNodeDef | ActionNodeDef;

export type BehaviorDescriptor = {
  id: string;
  label: string;
  root: BTNodeDef;
};

type BehaviorRegistry = Map<string, BehaviorDescriptor>;

const API_ENDPOINT = '/api/behaviors';
const STATIC_ENDPOINT = '/enemy-behaviors.json';
const registry: BehaviorRegistry = new Map();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export const conditionLibrary: Array<{ ref: ConditionRef; label: string; description: string }> = [
  {
    ref: 'danger',
    label: 'Danger?',
    description: "Retourne succes lorsqu'un projectile va toucher l'ennemi (declenche Evade)."
  },
  {
    ref: 'inRange',
    label: 'InRanged?',
    description: 'Est vrai si la cible se situe entre distShootMin et distShootMax.'
  },
  {
    ref: 'needReposition',
    label: 'NeedReposition?',
    description: "Echec du range/LOS => l'ennemi doit se deplacer pour retrouver un angle."
  },
  {
    ref: 'hasLOS',
    label: 'HasLOS?',
    description: 'Succes lorsque estimateLOS() confirme une ligne de vue degagee.'
  },
  {
    ref: 'tooClose',
    label: 'TooClose?',
    description: 'Succes si la cible est plus proche que distShootMin.'
  }
];

export const actionLibrary: Array<{ ref: ActionRef; label: string; description: string }> = [
  {
    ref: 'evade',
    label: 'Evade',
    description: "Declenche un dash lateral lorsqu'un danger est detecte."
  },
  {
    ref: 'rangedAttack',
    label: 'RangedAttack',
    description: 'Vise la cible, ajoute du jitter et demande un tir.'
  },
  {
    ref: 'reposition',
    label: 'Reposition',
    description: 'Cherche la distance ideale avec un strafe leger.'
  },
  {
    ref: 'patrol',
    label: 'Patrol',
    description: 'Mouvement aleatoire lent utilise comme fallback.'
  },
  {
    ref: 'strafe',
    label: 'Strafe',
    description: 'Tourne autour de la cible en priorisant un mouvement lateral.'
  },
  {
    ref: 'charge',
    label: 'Charge',
    description: 'Fonce directement vers la cible avec un leger boost.'
  }
];

const defaultDescriptors: BehaviorDescriptor[] = sanitizeArray(fallbackFile);

let initPromise: Promise<void> | null = null;

// Seed registry synchronously so le jeu démarre même si la lecture distante échoue.
replaceRegistry(clone(defaultDescriptors), false);

export function ensureBehaviorRegistry(): Promise<void> {
  if (!initPromise) initPromise = loadInitialData();
  return initPromise;
}

async function loadInitialData() {
  const data = await fetchBehaviorDescriptors();
  replaceRegistry(data, false);
}

async function fetchBehaviorDescriptors(): Promise<BehaviorDescriptor[]> {
  if (typeof fetch !== 'function') return clone(defaultDescriptors);
  const sources = [API_ENDPOINT, STATIC_ENDPOINT];
  for (const url of sources) {
    try {
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) continue;
      const payload = await res.json();
      return sanitizeArray(payload);
    } catch (err) {
      console.warn('[BT] Lecture des comportements impossible via', url, err);
    }
  }
  return clone(defaultDescriptors);
}

function replaceRegistry(entries: BehaviorDescriptor[], persist = true) {
  registry.clear();
  for (const def of entries) registry.set(def.id, clone(def));
  if (persist) persistRegistry();
}

function persistRegistry() {
  if (typeof fetch !== 'function') return;
  const body = JSON.stringify(snapshot());
  void fetch(API_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  }).catch((err) => console.warn('[BT] Impossible d\'écrire enemy-behaviors.json', err));
}

function snapshot(): BehaviorDescriptor[] {
  return Array.from(registry.values()).map((desc) => clone(desc));
}


export function getBehaviorDescriptors(): BehaviorDescriptor[] {
  return snapshot();
}

export function exportBehaviorDescriptors(pretty = true): string {
  return JSON.stringify(getBehaviorDescriptors(), null, pretty ? 2 : 0);
}

export function importBehaviorDescriptors(payload: string | BehaviorDescriptor[]) {
  let data: unknown = payload;
  if (typeof payload === 'string') {
    try {
      data = JSON.parse(payload);
    } catch {
      throw new Error('JSON invalide.');
    }
  }
  const sanitized = sanitizeArray(data);
  replaceRegistry(sanitized);
}

export function resetBehaviorDescriptors() {
  replaceRegistry(clone(defaultDescriptors));
}

export function listBehaviorOptions(): BehaviorOption[] {
  return snapshot().map((desc) => ({ id: desc.id, label: desc.label }));
}

export function getBehaviorDescriptor(id: string): BehaviorDescriptor | undefined {
  const entry = registry.get(id);
  return entry ? clone(entry) : undefined;
}

export function upsertBehaviorDescriptor(descriptor: BehaviorDescriptor) {
  registry.set(descriptor.id, clone(descriptor));
  persistRegistry();
}

export function deleteBehaviorDescriptor(id: string) {
  registry.delete(id);
  persistRegistry();
}

export function generateBehaviorId(prefix = 'custom'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptyDescriptor(): BehaviorDescriptor {
  const id = generateBehaviorId();
  return {
    id,
    label: 'Nouveau BT',
    root: {
      type: 'Selector',
      name: 'Root',
      children: []
    }
  };
}

export function isValidConditionRef(ref: string): ref is ConditionRef {
  return conditionLibrary.some((item) => item.ref === ref);
}

export function isValidActionRef(ref: string): ref is ActionRef {
  return actionLibrary.some((item) => item.ref === ref);
}

export function validateDescriptor(candidate: BehaviorDescriptor): BehaviorDescriptor {
  if (!candidate || typeof candidate !== 'object') throw new Error('Descripteur invalide.');
  if (!candidate.id || typeof candidate.id !== 'string') throw new Error('Champ "id" manquant.');
  if (!candidate.label || typeof candidate.label !== 'string') throw new Error('Champ "label" manquant.');
  return {
    id: candidate.id,
    label: candidate.label,
    root: validateNode(candidate.root)
  };
}

function validateNode(node: BTNodeDef): BTNodeDef {
  if (!node || typeof node !== 'object') throw new Error('Nœud invalide.');
  if (node.type === 'Selector' || node.type === 'Sequence') {
    if (!node.name || typeof node.name !== 'string') {
      throw new Error(`Le nœud composite doit posséder un nom lisible.`);
    }
    if (!Array.isArray(node.children)) {
      throw new Error(`Le nœud "${node.name}" doit contenir un tableau "children".`);
    }
    return {
      type: node.type,
      name: node.name,
      children: node.children.map((child) => validateNode(child as BTNodeDef))
    };
  }
  if (node.type === 'Condition') {
    if (!isValidConditionRef(node.ref)) throw new Error(`Condition inconnue: ${node.ref}`);
    return { type: 'Condition', ref: node.ref, label: node.label };
  }
  if (node.type === 'Action') {
    if (!isValidActionRef(node.ref)) throw new Error(`Action inconnue: ${node.ref}`);
    return { type: 'Action', ref: node.ref, label: node.label };
  }
  throw new Error(`Type de nœud non supporté: ${(node as BTNodeDef).type}`);
}

function sanitizeArray(raw: unknown): BehaviorDescriptor[] {
  if (!Array.isArray(raw)) {
    throw new Error('Le JSON doit représenter un tableau de comportements.');
  }
  return raw.map((entry) => validateDescriptor(entry as BehaviorDescriptor));
}
