import type { WorkspaceRoot } from '../core/workspace/model.js';
import { assertWorkspaceRoot } from '../core/workspace/roots.js';
import { readSandboxRules, type SandboxRules } from './osSandbox.js';

/** Add session grants to the existing sandbox plan without enabling or weakening isolation policy. */
export function workspaceSandboxPolicy(primary: string, roots: readonly WorkspaceRoot[] = []): {
  readonly rules: SandboxRules;
  readonly readOnlyRoots: readonly string[];
} {
  const rules = readSandboxRules(primary);
  for (const root of roots) assertWorkspaceRoot(root);
  if (!roots.length) return { rules, readOnlyRoots: [] };
  return { readOnlyRoots: roots.filter(root => root.access === 'read').map(root => root.path),
    rules: { ...rules, filesystem: { ...rules.filesystem,
    allowRead: [...new Set([...(rules.filesystem?.allowRead ?? []), ...roots.map(root => root.path)])],
    allowWrite: [...new Set([...(rules.filesystem?.allowWrite ?? []), ...roots.filter(root => root.access === 'write').map(root => root.path)])],
  } } };
}
