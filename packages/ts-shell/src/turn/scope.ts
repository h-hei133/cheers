import path from 'node:path';
import type { ToolPreparation } from '../tools/types.js';
import type { ToolScopeBinding } from '../config/scope/tools.js';
import { assertScopeToolAllowed, captureToolScope, meetToolScopes } from '../config/scope/tools.js';
import { parsePathSelector } from '../core/tools/selectorParser.js';
import type { ScopeSettings } from '../config/scope/contract.js';

interface ScopeGate {
  readonly workspaceRoot: string;
  readonly configScope?: ToolScopeBinding;
}
interface CallScope {
  readonly owner: object;
  readonly name: string;
  readonly selection: string;
  readonly captures: Map<string, ReturnType<typeof captureToolScope>>;
}
const calls = new WeakMap<object, CallScope>();

function targets(name: string, args: Record<string, unknown>, root: string, preparation?: ToolPreparation): string[] {
  if (preparation?.targets.length) return preparation.targets.map(target => target.path);
  const key = name === 'lsp' && args.backend === 'scanner' ? 'filePath' : ['read', 'write', 'edit', 'apply_patch', 'grep', 'glob'].includes(name) ? 'path' : undefined;
  const raw = key && typeof args[key] === 'string' ? args[key] as string : undefined;
  const clean = name === 'read' && raw ? parsePathSelector(raw).cleanPath : raw;
  return [!clean || clean.startsWith('artifact://') ? root : path.resolve(root, clean)];
}

/** Prepared copies retain identities already observed during their source reads. */
export function bindToolScope(original: object, prepared: object, options: ScopeGate): void {
  const captured = calls.get(original);
  if (captured) {
    if (captured.owner !== options) throw new Error('Configuration scope belongs to another tool runtime.');
    calls.set(prepared, captured);
  }
}

export function toolScopePolicy(name: string, args: Record<string, unknown>, options: ScopeGate, preparation?: ToolPreparation, target?: string): ScopeSettings {
  if (!options.configScope) return {};
  let captured = calls.get(args);
  const selection = JSON.stringify(args);
  if (captured && (captured.owner !== options || captured.name !== name || captured.selection !== selection)) throw new Error('Configuration scope selection changed after preparation.');
  if (!captured) {
    captured = { owner: options, name, selection, captures: new Map() };
    calls.set(args, captured);
  }
  for (const selected of [...targets(name, args, options.workspaceRoot, preparation), ...target ? [target] : []]) {
    if (captured.captures.has(selected)) continue;
    if (captured.captures.size >= 4096) throw new Error('Configuration scope target limit reached; split the operation.');
    captured.captures.set(selected, captureToolScope(options.configScope, [selected]));
  }
  for (const snapshot of captured.captures.values()) {
    snapshot.assert(); assertScopeToolAllowed(snapshot.settings, name);
  }
  return meetToolScopes([...captured.captures.values()].map(snapshot => snapshot.settings));
}

export function forgetToolScope(args: object): void { calls.delete(args); }
