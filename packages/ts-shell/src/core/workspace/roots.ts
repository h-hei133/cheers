import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { verifyPathContainment } from '../security/pathJail.js';
import { MAX_WORKSPACE_ROOTS, type WorkspaceRoot } from './model.js';

export function captureWorkspaceRoot(target: string, base: string, access: WorkspaceRoot['access']): WorkspaceRoot {
  if (!target.trim() || target.length > 4096 || /[\x00-\x1f\x7f-\x9f]/.test(target)) throw new Error('Workspace path is invalid.');
  const canonical = realpathSync(path.resolve(base, target));
  const stats = statSync(canonical, { bigint: true });
  if (!stats.isDirectory()) throw new Error('Workspace roots must be existing directories.');
  return Object.freeze({ path: canonical, access, identity: `${stats.dev}:${stats.ino}:${stats.birthtimeMs}` });
}

export function assertWorkspaceRoot(root: WorkspaceRoot): void {
  const current = captureWorkspaceRoot(root.path, root.path, root.access);
  if (current.path !== root.path || current.identity !== root.identity) throw new Error('An additional workspace root changed identity. Remove it and add the intended directory again.');
}

export function validateWorkspaceRoots(primary: string, roots: readonly WorkspaceRoot[]): void {
  if (roots.length > MAX_WORKSPACE_ROOTS) throw new Error(`At most ${MAX_WORKSPACE_ROOTS} additional workspace roots are supported.`);
  const paths = [realpathSync(primary)];
  for (const root of roots) {
    assertWorkspaceRoot(root);
    if (paths.some(existing => contains(existing, root.path) || contains(root.path, existing))) {
      throw new Error('Workspace roots must be separate directories without overlapping paths.');
    }
    paths.push(root.path);
  }
}

/** Select one existing authority root; never widen a single-file writer's jail. */
export function selectWorkspaceRoot(primary: string, roots: readonly WorkspaceRoot[], target: string, access: WorkspaceRoot['access']): string {
  const absolute = path.resolve(primary, target);
  if (verifyPathContainment(absolute, primary).allowed || verifyPathContainment(absolute, realpathSync(primary)).allowed) return primary;
  for (const root of roots) {
    if (!contains(root.path, absolute)) continue;
    assertWorkspaceRoot(root);
    if (access === 'write' && root.access !== 'write') throw new Error('This additional workspace root is read-only.');
    if (verifyPathContainment(absolute, root.path).allowed) return root.path;
  }
  throw new Error('Tool path is outside the registered workspace roots.');
}

function contains(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
