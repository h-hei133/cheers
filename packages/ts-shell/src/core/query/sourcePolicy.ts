import { evaluateToolPermissionScope } from './toolPolicy.js';
import { selectWorkspaceRoot } from '../workspace/roots.js';
import type { PermissionScope } from '../../cli/approval/permissionScope.js';
import type { WorkspaceRoot } from '../workspace/model.js';
import type { DenyRule } from '../shell/approval/deny.js';

/** Source bytes need their own read grant and denial checks even inside an approved execution. */
export function assertSourceAccess(absolute: string, primary: string, roots: readonly WorkspaceRoot[] = [], scope?: PermissionScope, rules?: readonly DenyRule[]): void {
  const root = selectWorkspaceRoot(primary, roots, absolute, 'read');
  for (const base of new Set([primary, root])) {
    const decision = evaluateToolPermissionScope('read', { path: absolute }, scope, base, rules);
    if (decision.denied) throw new Error(decision.reason);
  }
}
