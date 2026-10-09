import { evaluateToolPermissionScope } from '../core/query/toolPolicy.js';
import { selectWorkspaceRoot } from '../core/workspace/roots.js';
import type { PermissionScope } from '../cli/approval/permissionScope.js';
import type { DenyRule } from '../core/shell/approval/deny.js';
import type { ToolExecutionContext, ToolPreparation } from '../tools/types.js';
import { assertSourceAccess } from '../core/query/sourcePolicy.js';

interface PreparationGate extends Pick<ToolExecutionContext, 'workspaceRoot' | 'workspaceRoots' | 'sessionId'> {
  readonly permissionScope?: PermissionScope;
  readonly denyRules?: readonly DenyRule[];
  readonly admission?: () => string | undefined;
}

/** Preflight and publication both enforce every path's grants and read/write denials. */
export function preparationContext(toolName: string, options: PreparationGate): ToolExecutionContext {
  return { workspaceRoot: options.workspaceRoot, artifactRoot: options.workspaceRoot, workspaceRoots: options.workspaceRoots,
    assertSourceAccess: absolute => { const blocked = options.admission?.(); if (blocked) throw new Error(blocked); assertSourceAccess(absolute, options.workspaceRoot, options.workspaceRoots, options.permissionScope, options.denyRules); },
    sessionId: options.sessionId, taskId: 'preparation', assertFileAccess: absolute => {
      if (toolName === 'browser') {
        const blocked = options.admission?.(); if (blocked) throw new Error(blocked);
        assertSourceAccess(absolute, options.workspaceRoot, options.workspaceRoots, options.permissionScope, options.denyRules);
      } else targetPermission(toolName, { path: absolute, operation: 'write' }, options);
    } };
}

export function preparationPermission(toolName: string, preparation: ToolPreparation, options: PreparationGate) {
  if (preparation.permissionArgs) {
    const original = evaluateToolPermissionScope(toolName, { ...preparation.permissionArgs }, options.permissionScope, options.workspaceRoot, options.denyRules);
    if (original.denied || !preparation.permissionToolName) return original;
    return evaluateToolPermissionScope(preparation.permissionToolName, { ...preparation.permissionArgs }, options.permissionScope, options.workspaceRoot, options.denyRules);
  }
  const decisions = preparation.targets.map(target => targetPermission(toolName, target, options));
  return { requiresEscalation: decisions.some(decision => decision.requiresEscalation), denied: false,
    operation: preparation.targets.some(target => target.operation === 'delete') ? 'delete' as const : 'write' as const,
    target: preparation.targets.map(target => JSON.stringify(target.path)).join(', ') || '(no changes)',
    reason: `Approval covers the complete file plan and its revision.\n\n${preparation.preview}` };
}

function targetPermission(toolName: string, target: ToolPreparation['targets'][number], options: PreparationGate) {
  const blocked = options.admission?.();
  if (blocked) throw new Error(blocked);
  const root = selectWorkspaceRoot(options.workspaceRoot, options.workspaceRoots ?? [], target.path, 'write');
  const evaluation = evaluateToolPermissionScope(toolName, target, options.permissionScope, root, options.denyRules);
  for (const base of new Set([options.workspaceRoot, root])) {
    for (const name of new Set([toolName, 'write', 'edit', 'read'])) {
      const decision = evaluateToolPermissionScope(name, target, options.permissionScope, base, options.denyRules);
      if (decision.denied) throw new Error(decision.reason);
    }
  }
  return evaluation;
}
