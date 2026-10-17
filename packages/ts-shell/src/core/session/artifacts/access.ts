import path from 'node:path';
import { ArtifactManager } from '../artifactManager.js';
import { assertSourceAccess } from '../../query/sourcePolicy.js';
import { evaluateToolPermissionScope } from '../../query/toolPolicy.js';
import { assertProfileStorage } from '../../paths/profile/context.js';
import { verifyPathContainment } from '../../security/pathJail.js';
import type { PermissionScope } from '../../../cli/approval/permissionScope.js';
import type { WorkspaceRoot } from '../../workspace/model.js';
import type { DenyRule } from '../../shell/approval/deny.js';

/** Only this session's produced artifacts add a read source; parent denials still apply. */
export function assertArtifactSourceAccess(absolute: string, primary: string, sessionId?: string,
  roots: readonly WorkspaceRoot[] = [], scope?: PermissionScope, rules?: readonly DenyRule[]): void {
  const directory = ArtifactManager.getShared(primary, sessionId).directory;
  const relative = path.relative(directory, absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    assertSourceAccess(absolute, primary, roots, scope, rules); return;
  }
  assertProfileStorage(absolute);
  const checked = verifyPathContainment(absolute, directory);
  if (!checked.allowed || checked.resolvedPath !== absolute) throw new Error('Artifact source changed its owner.');
  for (const root of new Set([primary, directory])) {
    const decision = evaluateToolPermissionScope('read', { path: absolute }, scope, root, rules);
    if (decision.denied) throw new Error(decision.reason);
  }
}
