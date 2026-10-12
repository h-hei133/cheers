import path from 'node:path';
import { createStateChanges } from '../state/changes.js';
import { commandInvocations } from '../commands/invocation.js';
import type { CommandDefinition } from '../commands/types.js';
import type { Skill } from '../skills/skillLoader.js';
import type { SkillDiscovery } from '../skills/discovery.js';
import type { ToolDefinition } from '../../tools/types.js';

/** Neutral session composition port. The feature owner retains lifecycle and authority. */
export interface CatalogContribution {
  readonly root: string;
  readonly sessionId: string;
  readonly commands: readonly CommandDefinition[];
  readonly tools: readonly ToolDefinition[];
  readonly skills: (signal?: AbortSignal, discovery?: SkillDiscovery) => readonly Skill[] | Promise<readonly Skill[]>;
}
const entries = new Set<CatalogContribution>();
const changes = createStateChanges();
export function registerCatalogContribution(entry: CatalogContribution): () => void {
  const existing = catalogContributions(entry.root, entry.sessionId).flatMap(value => value.commands).flatMap(commandInvocations).map(value => value.name);
  const invocations = entry.commands.flatMap(commandInvocations).map(value => value.name);
  if (new Set(invocations).size !== invocations.length || invocations.some(value => existing.includes(value))) throw new Error('Dynamic command registration collision.');
  const toolNames = entry.tools.map(tool => tool.name); const existingTools = catalogContributions(entry.root, entry.sessionId).flatMap(value => value.tools).map(tool => tool.name);
  if (new Set(toolNames).size !== toolNames.length || toolNames.some(value => existingTools.includes(value))) throw new Error('Dynamic tool registration collision.');
  entries.add(entry); changes.notify(path.resolve(entry.root), '*');
  return () => { if (entries.delete(entry)) changes.notify(path.resolve(entry.root), '*'); };
}
export function catalogContributions(root = process.cwd(), sessionId?: string): readonly CatalogContribution[] {
  const selected = [...entries].filter(entry => path.resolve(entry.root) === path.resolve(root) && (sessionId === undefined || entry.sessionId === sessionId));
  // A root-only compatibility caller cannot borrow one of several sessions' gates.
  return sessionId === undefined && new Set(selected.map(entry => entry.sessionId)).size > 1 ? [] : selected;
}
export function observeCatalogContributions(root: string | undefined, changed: () => void): () => void { return changes.subscribe(root === undefined ? '*' : path.resolve(root), changed); }
