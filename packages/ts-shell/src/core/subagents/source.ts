import path from 'node:path';
import { resolveUserDataFile } from '../paths/userHome.js';
import { assertSourceAccess } from '../query/sourcePolicy.js';
import { evaluateToolPermissionScope } from '../query/toolPolicy.js';
import type { PermissionScope } from '../../cli/approval/permissionScope.js';
import type { WorkspaceRoot } from '../workspace/model.js';
import type { DenyRule } from '../shell/approval/deny.js';

/** User definitions are an owned configuration source; this grants no general file access. */
export function assertAgentSourceAccess(absolute: string, primary: string, roots: readonly WorkspaceRoot[] = [], scope?: PermissionScope, rules?: readonly DenyRule[]): void {
  const user = resolveUserDataFile('agents'); const relative = path.relative(user, path.resolve(absolute));
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    assertSourceAccess(absolute, primary, roots, scope, rules); return;
  }
  for (const root of new Set([primary, user])) {
    const decision = evaluateToolPermissionScope('read', { path: absolute }, scope, root, rules);
    if (decision.denied) throw new Error(decision.reason);
  }
}
