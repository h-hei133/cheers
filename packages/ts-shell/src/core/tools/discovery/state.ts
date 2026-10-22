import { createHash } from 'node:crypto';
import type { ToolDefinition, ToolPreparation } from '../../../tools/types.js';

/**
 * The tools a run starts with, and the catalogue it may load from.
 *
 * A model that receives every schema pays for all of them on every request,
 * including the ones the task will never touch. Discovery keeps a small fixed
 * set and lets the model ask for the rest by name. It is not an authorization
 * mechanism: a loaded tool still goes through the same schema validation,
 * permission gate and sandbox as a pinned one.
 */
export const PINNED_TOOL_NAMES = ['read', 'glob', 'grep', 'bash', 'edit', 'write', 'apply_patch', 'ask', 'task', 'taskOutput', 'taskStop', 'todo'] as const;
export const DISCOVERY_SEARCH_TOOL = 'tool_search';
export const DISCOVERY_LOAD_TOOL = 'tool_load';
const LOADED_LIMIT = 32;

export interface DiscoveryMatch {
  readonly name: string;
  readonly summary: string;
  readonly loaded: boolean;
  readonly pinned: boolean;
}

export interface ToolDiscovery {
  readonly generation: string;
  readonly catalog: ReadonlyMap<string, ToolDefinition>;
  subscribe(listener: () => void): () => void;
  snapshot(): ReadonlyMap<string, ToolDefinition>;
  search(query: string, limit?: number): readonly DiscoveryMatch[];
  load(names: readonly string[]): { readonly loaded: readonly string[]; readonly rejected: readonly string[] };
  attachMeta(tools: readonly ToolDefinition[]): void;
}

export class ToolGenerationError extends Error {
  constructor(toolName: string) {
    super(`Tool '${toolName}' belongs to an older discovery generation and cannot execute.`);
    this.name = 'ToolGenerationError';
  }
}

export function createToolDiscovery(input: {
  readonly catalog: ReadonlyMap<string, ToolDefinition>;
  readonly pinned?: readonly string[];
  readonly initial?: readonly string[];
}): ToolDiscovery {
  const pinned = new Set(input.pinned ?? PINNED_TOOL_NAMES);
  const loaded = new Set((input.initial ?? []).filter(name => input.catalog.has(name)));
  const listeners = new Set<() => void>();
  let meta: readonly ToolDefinition[] = [];
  const notify = (): void => {
    for (const listener of [...listeners]) listener();
  };
  const generation = (): string => createHash('sha256').update(JSON.stringify([...input.catalog.entries()]
    .map(([name, tool]) => [name, tool.description, tool.argsSchema])
    .sort((left, right) => String(left[0]).localeCompare(String(right[0]))))).digest('hex');
  const toolFingerprint = (tool: ToolDefinition): string => JSON.stringify([tool.description, tool.argsSchema]);

  const guard = (tool: ToolDefinition, snapshotGeneration: string, catalogueOwned: boolean): ToolDefinition => {
    const fingerprint = toolFingerprint(tool);
    const verify = (): void => {
      if (catalogueOwned) {
        const current = input.catalog.get(tool.name);
        if (!current || current !== tool || toolFingerprint(current) !== fingerprint) {
          throw new ToolGenerationError(tool.name);
        }
      } else if (generation() !== snapshotGeneration) {
        throw new ToolGenerationError(tool.name);
      }
    };
    const prepare = tool.prepare
      ? async (args: Record<string, unknown>, context: Parameters<NonNullable<ToolDefinition['prepare']>>[1]) => {
          verify();
          return guardPreparation(await tool.prepare!(args, context), verify);
        }
      : undefined;
    return {
      ...tool,
      ...(prepare ? { prepare } : {}),
      async execute(args, context) {
        verify();
        return tool.execute(args, context);
      },
    };
  };

  const snapshot = (): ReadonlyMap<string, ToolDefinition> => {
    const snapshotGeneration = generation();
    const selected = new Map<string, ToolDefinition>();
    for (const [name, tool] of input.catalog) {
      if (pinned.has(name) || loaded.has(name)) selected.set(name, guard(tool, snapshotGeneration, true));
    }
    for (const tool of meta) selected.set(tool.name, guard(tool, snapshotGeneration, false));
    return selected;
  };

  return {
    get generation() { return generation(); },
    catalog: input.catalog,
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    snapshot,
    search: (query, limit = 8) => {
      const text = query.trim().toLowerCase();
      if (!text) return [];
      const bounded = Math.max(1, Math.min(20, Math.trunc(limit)));
      return [...input.catalog.values()]
        .filter(tool => tool.name !== DISCOVERY_SEARCH_TOOL && tool.name !== DISCOVERY_LOAD_TOOL)
        .map(tool => {
          const name = tool.name.toLowerCase();
          const description = tool.description.toLowerCase();
          const score = name === text ? 0 : name.startsWith(text) ? 1 : name.includes(text) ? 2 : description.includes(text) ? 3 : 4;
          return { tool, score };
        })
        .filter(match => match.score < 4)
        .sort((left, right) => left.score - right.score || left.tool.name.localeCompare(right.tool.name))
        .slice(0, bounded)
        .map(match => ({ name: match.tool.name, summary: match.tool.description.split('\n')[0]!.slice(0, 240),
          loaded: loaded.has(match.tool.name), pinned: pinned.has(match.tool.name) }));
    },
    load: names => {
      const accepted: string[] = []; const rejected: string[] = [];
      const before = [...loaded].sort().join("\0");
      for (const raw of names) {
        const name = String(raw).trim();
        if (!name || name === DISCOVERY_SEARCH_TOOL || name === DISCOVERY_LOAD_TOOL || !input.catalog.has(name)) { rejected.push(name || '(empty)'); continue; }
        if (!pinned.has(name) && !loaded.has(name) && loaded.size >= LOADED_LIMIT) { rejected.push(name); continue; }
        loaded.add(name); accepted.push(name);
      }
      if ([...loaded].sort().join("\0") !== before) notify();
      return { loaded: accepted, rejected };
    },
    attachMeta: tools => {
      const before = JSON.stringify(meta);
      meta = tools;
      if (JSON.stringify(meta) !== before) notify();
    },
  };
}

function guardPreparation(preparation: ToolPreparation, verify: () => void): ToolPreparation {
  return {
    ...preparation,
    async execute(context, selection, approval) {
      verify();
      return preparation.execute(context, selection, approval);
    },
  };
}
