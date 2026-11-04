import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { currentProfile, profilePath, type ProfileIdentity } from './context.js';
import { assertUnlinkedPath } from './identity.js';

/** Private mutable state is keyed by the canonical workspace, never its label. */
export function profileWorkspaceDir(workspace: string, profile: ProfileIdentity | undefined = currentProfile()): string | undefined {
  if (!profile || profile.id === 'default') return undefined;
  const canonical = fs.realpathSync(workspace);
  return profileWorkspaceDirForCanonicalRoot(canonical, profile);
}

/** Persisted canonical roots retain their private storage identity after removal. */
export function profileWorkspaceDirForCanonicalRoot(canonical: string, profile: ProfileIdentity): string {
  if (profile.id === 'default' || !path.isAbsolute(canonical) || path.resolve(canonical) !== canonical
    || /[\x00-\x1f\x7f-\x9f]/.test(canonical)) throw new Error('Workspace storage identity is unavailable.');
  // A missing suffix is acceptable, but a surviving linked ancestor is not proof
  // that this persisted pathname still names the original canonical workspace.
  assertUnlinkedPath(canonical);
  const key = process.platform === 'win32' ? canonical.toLowerCase() : canonical;
  const digest = createHash('sha256').update(key).digest('hex');
  return profilePath(path.join('projects', digest), profile);
}
