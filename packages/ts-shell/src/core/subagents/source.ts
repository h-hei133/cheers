import path from 'node:path';
import { resolveUserDataFile } from '../paths/userHome.js';
import { profileWorkspaceDir } from '../paths/profile/workspace.js';
import { assertSourceAccess } from '../query/sourcePolicy.js';
import { evaluateToolPermissionScope } from '../query/toolPolicy.js';
import type { PermissionScope } from '../../cli/approval/permissionScope.js';
import type { WorkspaceRoot } from '../workspace/model.js';
import type { DenyRule } from '../shell/approval/deny.js';

/** User definitions are an owned configuration source; this grants no general file access. */
export function assertAgentSourceAccess(absolute: string, primary: string, roots: readonly WorkspaceRoot[] = [], scope?: PermissionScope, rules?: readonly DenyRule[]): void {
  const workspace = profileWorkspaceDir(primary);
  const sources = [resolveUserDataFile('agents'), resolveUserDataFile('agent-memory'),
    ...(workspace ? [path.join(workspace, 'memory'), path.join(workspace, 'memory-local')] : [])];
  const user = sources.find(source => {
    const relative = path.relative(source, path.resolve(absolute));
    return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  });
  if (!user) {
    assertSourceAccess(absolute, primary, roots, scope, rules); return;
  }
  for (const root of new Set([primary, user])) {
    const decision = evaluateToolPermissionScope('read', { path: absolute }, scope, root, rules);
    if (decision.denied) throw new Error(decision.reason);
  }
}
