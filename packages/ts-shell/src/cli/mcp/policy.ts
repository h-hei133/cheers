import type { ToolGateOptions } from '../../turn/tools.js';
import { evaluateToolPermissionScope } from '../../core/query/toolPolicy.js';

export function checkTarget(target: string, options: ToolGateOptions, write = true): void {
  const refused = options.admission?.(); if (refused) throw new Error(refused);
  for (const name of write ? ['read', 'apply_patch', 'write', 'edit'] : ['read']) {
    const decision = evaluateToolPermissionScope(name, { path: target }, options.permissionScope, options.workspaceRoot, options.denyRules);
    if (decision.denied) throw new Error(decision.reason);
  }
}
