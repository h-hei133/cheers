import path from 'node:path';
import { assertProfileStorage, currentProfile, type ProfileIdentity } from '../../core/paths/profile/context.js';
import { profileWorkspaceDir } from '../../core/paths/profile/workspace.js';

/** Writers, restore selectors and undo receipts resolve the same snapshot owner. */
export function snapshotRoot(workspace: string, profile: ProfileIdentity | undefined = currentProfile()): string {
  const privateWorkspace = profileWorkspaceDir(workspace, profile);
  const target = privateWorkspace ? path.join(privateWorkspace, 'edit-snapshots') : path.join(workspace, '.sisyphus', 'edit-snapshots');
  assertProfileStorage(target, profile);
  return target;
}
