import path from 'node:path';
import { createStateChanges } from '../state/changes.js';
import { commandInvocations } from '../commands/invocation.js';
import type { CommandDefinition } from '../commands/types.js';
import type { Skill } from '../skills/skillLoader.js';
import type { SkillDiscovery } from '../skills/discovery.js';
import type { ToolDefinition } from '../../tools/types.js';
import { registerExtensionEventProvider } from '../hooks/extensionBridge.js';
import type { CatalogProvider } from '../models/catalog.js';
import type { VirtualModelDefinition } from '../models/virtual/contract.js';
import { captureVirtualDefinitions, MAX_VIRTUAL_MODELS } from '../models/virtual/capture.js';

/** Neutral session composition port. The feature owner retains lifecycle and authority. */
export interface CatalogContribution {
  readonly root: string;
  readonly sessionId: string;
  readonly commands: readonly CommandDefinition[];
  readonly tools: readonly ToolDefinition[];
  readonly skills: (signal?: AbortSignal, discovery?: SkillDiscovery) => readonly Skill[] | Promise<readonly Skill[]>;
  readonly onEvent?: (event: string, payload: unknown, aliases?: readonly string[], signal?: AbortSignal) => Promise<unknown>;
  readonly virtualModels?: readonly VirtualModelDefinition[];
  /** The generation that owns these callbacks, independent of an individual request. */
  readonly signal?: AbortSignal;
}
const entries = new Set<CatalogContribution>();
const changes = createStateChanges();
export function registerCatalogContribution(entry: CatalogContribution, physicalCatalog: readonly CatalogProvider[] = []): () => void {
  // Capture caller properties before any collision decisions; getters may register another owner.
  entry = { ...entry };
  entry = { ...entry, root: path.resolve(entry.root) };
  const signal = entry.signal;
  const assertSignal = signal && AbortSignal.prototype.throwIfAborted.bind(signal);
  assertSignal?.();
  let active = true;
  const admission = () => { if (!active) throw new Error('Catalog contribution is retired.'); assertSignal?.(); };
  const virtualModels = captureVirtualDefinitions(entry.virtualModels ?? [], admission);
  const existing = catalogContributions(entry.root, entry.sessionId).flatMap(value => value.commands).flatMap(commandInvocations).map(value => value.name);
  const invocations = entry.commands.flatMap(commandInvocations).map(value => value.name);
  if (new Set(invocations).size !== invocations.length || invocations.some(value => existing.includes(value))) throw new Error('Dynamic command registration collision.');
  const toolNames = entry.tools.map(tool => tool.name); const existingTools = catalogContributions(entry.root, entry.sessionId).flatMap(value => value.tools).map(tool => tool.name);
  if (new Set(toolNames).size !== toolNames.length || toolNames.some(value => existingTools.includes(value))) throw new Error('Dynamic tool registration collision.');
  if (virtualModels.some(model => physicalCatalog.some(provider => provider.id === model.provider && provider.models.some(value => value.id === model.id)))) {
    throw new Error('Virtual model registration collides with a physical model.');
  }
  const currentModels = catalogContributions(entry.root, entry.sessionId).flatMap(value => value.virtualModels ?? []);
  if (virtualModels.length + currentModels.length > MAX_VIRTUAL_MODELS) throw new Error('Virtual model registration limit exceeded.');
  const identities = new Set(currentModels.map(model => JSON.stringify([model.provider, model.id])));
  for (const model of virtualModels) {
    const key = JSON.stringify([model.provider, model.id]);
    if (identities.has(key)) throw new Error('Virtual model registration collision.');
    identities.add(key);
  }
  const captured = Object.freeze({ ...entry, root: path.resolve(entry.root), virtualModels });
  const retire = () => {
    active = false;
    if (signal) EventTarget.prototype.removeEventListener.call(signal, 'abort', retire);
    if (entries.delete(captured)) changes.notify(captured.root, '*');
  };
  if (signal) EventTarget.prototype.addEventListener.call(signal, 'abort', retire, { once: true });
  admission(); entries.add(captured);
  try { admission(); } catch (error) { retire(); throw error; }
  changes.notify(captured.root, '*');
  return retire;
}
export function catalogContributions(root = process.cwd(), sessionId?: string): readonly CatalogContribution[] {
  const selected = [...entries].filter(entry => path.resolve(entry.root) === path.resolve(root) && (sessionId === undefined || entry.sessionId === sessionId));
  // A root-only compatibility caller cannot borrow one of several sessions' gates.
  return sessionId === undefined && new Set(selected.map(entry => entry.sessionId)).size > 1 ? [] : selected;
}
export function observeCatalogContributions(root: string | undefined, changed: () => void): () => void { return changes.subscribe(root === undefined ? '*' : path.resolve(root), changed); }

registerExtensionEventProvider((root, sessionId) =>
  catalogContributions(root, sessionId).flatMap(entry => (entry.onEvent ? [entry.onEvent] : [])),
);
