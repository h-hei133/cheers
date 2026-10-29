import { evaluateToolPermissionScope } from '../core/query/toolPolicy.js';
import { selectWorkspaceRoot } from '../core/workspace/roots.js';
import type { PermissionScope } from '../cli/approval/permissionScope.js';
import type { DenyRule } from '../core/shell/approval/deny.js';
import type { ToolExecutionContext, ToolPreparation } from '../tools/types.js';
import { assertSourceAccess } from '../core/query/sourcePolicy.js';
import { assertAgentSourceAccess } from '../core/subagents/source.js';
import type { ToolScopeBinding } from '../config/scope/tools.js';
import { toolScopePolicy } from './scope.js';
import { fileAccessOptions } from './workspace.js';

interface PreparationGate extends Pick<ToolExecutionContext, 'workspaceRoot' | 'workspaceRoots' | 'sessionId'> {
  readonly background?: ToolExecutionContext['background'];
  readonly permissionScope?: PermissionScope;
  readonly denyRules?: readonly DenyRule[];
  readonly admission?: () => string | undefined;
  readonly configScope?: ToolScopeBinding;
}

/** Preflight and publication both enforce every path's grants and read/write denials. */
export function preparationContext(toolName: string, options: PreparationGate, signal?: AbortSignal, args: Record<string, unknown> = {}): ToolExecutionContext {
  return { workspaceRoot: options.workspaceRoot, artifactRoot: options.workspaceRoot, workspaceRoots: fileAccessOptions(toolName, args, options).workspaceRoots,
    abortSignal: signal,
    background: options.background,
    assertSourceAccess: absolute => { const blocked = options.admission?.(); if (blocked) throw new Error(blocked);
      const scoped = toolScopePolicy(toolName, args, options, undefined, absolute);
      (toolName === 'task' ? assertAgentSourceAccess : assertSourceAccess)(absolute, options.workspaceRoot, options.workspaceRoots, options.permissionScope, [...options.denyRules ?? [], ...scoped.denyRules ?? []]); },
    sessionId: options.sessionId, taskId: 'preparation', assertFileAccess: absolute => {
      if (toolName === 'browser') {
        const blocked = options.admission?.(); if (blocked) throw new Error(blocked);
        const scoped = toolScopePolicy(toolName, args, options, undefined, absolute);
        assertSourceAccess(absolute, options.workspaceRoot, options.workspaceRoots, options.permissionScope, [...options.denyRules ?? [], ...scoped.denyRules ?? []]);
      } else targetPermission(toolName, { path: absolute, operation: 'write' }, options, args);
    } };
}

export function preparationPermission(toolName: string, preparation: ToolPreparation, options: PreparationGate, args: Record<string, unknown> = {} ) {
  const scoped = toolScopePolicy(toolName, args, options, preparation);
  const denyRules = [...options.denyRules ?? [], ...scoped.denyRules ?? []];
  if (preparation.permissionArgs) {
    const original = evaluateToolPermissionScope(toolName, { ...preparation.permissionArgs }, options.permissionScope, options.workspaceRoot, denyRules);
    if (original.denied || !preparation.permissionToolName) return original;
    return evaluateToolPermissionScope(preparation.permissionToolName, { ...preparation.permissionArgs }, options.permissionScope, options.workspaceRoot, denyRules);
  }
  const decisions = preparation.targets.map(target => targetPermission(toolName, target, options, args));
  return { requiresEscalation: decisions.some(decision => decision.requiresEscalation), denied: false,
    operation: preparation.targets.some(target => target.operation === 'delete') ? 'delete' as const : 'write' as const,
    target: preparation.targets.map(target => JSON.stringify(target.path)).join(', ') || '(no changes)',
    reason: `Approval covers the complete file plan and its revision.\n\n${preparation.preview}` };
}

function targetPermission(toolName: string, target: ToolPreparation['targets'][number], options: PreparationGate, args: Record<string, unknown>) {
  const blocked = options.admission?.();
  if (blocked) throw new Error(blocked);
  const root = selectWorkspaceRoot(options.workspaceRoot, fileAccessOptions(toolName, args, options, target.path).workspaceRoots ?? [], target.path, 'write');
  const scoped = toolScopePolicy(toolName, args, options, undefined, target.path);
  const denyRules = [...options.denyRules ?? [], ...scoped.denyRules ?? []];
  const evaluation = evaluateToolPermissionScope(toolName, target, options.permissionScope, root, denyRules);
  for (const base of new Set([options.workspaceRoot, root])) {
    for (const name of new Set([toolName, 'write', 'edit', 'read'])) {
      const decision = evaluateToolPermissionScope(name, target, options.permissionScope, base, denyRules);
      if (decision.denied) throw new Error(decision.reason);
    }
  }
  return evaluation;
}
