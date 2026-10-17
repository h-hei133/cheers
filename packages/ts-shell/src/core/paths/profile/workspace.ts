import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { currentProfile, profilePath, type ProfileIdentity } from './context.js';

/** Private mutable state is keyed by the canonical workspace, never its label. */
export function profileWorkspaceDir(workspace: string, profile: ProfileIdentity | undefined = currentProfile()): string | undefined {
  if (!profile || profile.id === 'default') return undefined;
  const canonical = fs.realpathSync(workspace);
  const key = process.platform === 'win32' ? canonical.toLowerCase() : canonical;
  const digest = createHash('sha256').update(key).digest('hex');
  return profilePath(path.join('projects', digest), profile);
}
