import { selectWorkspaceRoot } from '../../workspace/roots.js';
import { evaluateToolPermissionScope } from '../../query/toolPolicy.js';
import type { CommandContext } from '../types.js';

/** Explicit restore intent grants its selected write; existing workspace and deny rules still apply. */
export function restoreAccess(context: CommandContext): (absolutePath: string) => void {
  return absolute => {
    const blocked = context.admission?.();
    if (blocked) throw new Error(blocked);
    const primary = context.projectRoot ?? context.cwd;
    const root = selectWorkspaceRoot(primary, context.workspaceRoots ?? [], absolute, 'write');
    const rules = context.readConfiguration?.().config.denyRules ?? context.runtimeConfig?.denyRules ?? [];
    for (const base of new Set([primary, root])) {
      for (const tool of ['write', 'edit', 'read']) {
        const decision = evaluateToolPermissionScope(tool, { path: absolute }, 'ask', base, rules);
        if (decision.denied) throw new Error(decision.reason);
      }
    }
  };
}
