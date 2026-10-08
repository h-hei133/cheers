import path from 'node:path';
import { parsePathSelector } from '../tools/selectorParser.js';
import type { WorkspaceRoot } from './model.js';
import { selectWorkspaceRoot } from './roots.js';

/** Resolve file tools before dispatch; commands, artifacts and external tools keep their own boundaries. */
export function workspaceToolBinding(name: string, args: Record<string, unknown>, primary: string, roots: readonly WorkspaceRoot[] = []) {
  // A server executes for the approved primary project; returned/source files
  // select their grants individually in the language owner.
  if (name === 'lsp' && args.backend !== 'scanner') return { root: primary, args, scoped: false };
  const key = name === 'lsp' ? 'filePath' : ['read', 'write', 'edit', 'apply_patch', 'grep', 'glob'].includes(name) ? 'path' : undefined;
  const raw = key && typeof args[key] === 'string' ? args[key] as string : undefined;
  const clean = name === 'read' && raw !== undefined ? parsePathSelector(raw).cleanPath : raw;
  if (!key || clean?.startsWith('artifact://') || (clean === undefined && name !== 'glob' && name !== 'grep')) return { root: primary, args, scoped: false };
  const target = path.resolve(primary, clean || '.');
  const root = selectWorkspaceRoot(primary, roots, target, name === 'write' || name === 'edit' || name === 'apply_patch' ? 'write' : 'read');
  // Keep primary-root relative arguments and their display spelling compatible.
  return { root, scoped: true, args: root === primary ? args : { ...args, [key]: target + (name === 'read' && raw ? raw.trim().slice(clean!.length) : '') } };
}
