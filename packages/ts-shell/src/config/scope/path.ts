import fs from 'node:fs';
import path from 'node:path';
import { assertDirectoryIdentity, directoryIdentity, type DirectoryIdentity } from '../../core/paths/profile/identity.js';

export interface ScopePath {
  readonly selection: string;
  readonly canonical: string;
  readonly anchor: DirectoryIdentity;
  readonly directory: boolean;
}

/** Inputs are canonical: only Windows drive/UNC anchors are case insensitive. */
export function scopeContains(prefix: string, target: string, flavor: Pick<typeof path, 'parse' | 'sep'> = path): boolean {
  if (flavor === path.win32 || flavor.sep === '\\') {
    const baseRoot = flavor.parse(prefix).root;
    const targetRoot = flavor.parse(target).root;
    if (baseRoot.toLowerCase() !== targetRoot.toLowerCase()) return false;
    prefix = prefix.slice(baseRoot.length); target = target.slice(targetRoot.length);
    if (!prefix) return true;
  }
  const base = prefix.replace(new RegExp(`${flavor.sep === '\\' ? '\\\\' : '/'}+$`), '');
  return target === base || target.startsWith(base + flavor.sep);
}

/** A missing suffix is allowed; an unresolved object or unreadable ancestor is not. */
export function captureScopePath(target: string, base: string, directory = false): ScopePath {
  if (!target.trim() || target.length > 4096 || /[\x00-\x1f\x7f-\x9f]/.test(target)) throw new Error('Configuration scope path is invalid.');
  const selection = path.resolve(base, target);
  let current = selection;
  const missing: string[] = [];
  try {
    for (;;) {
      try {
        const canonical = fs.realpathSync.native(current);
        const stats = fs.statSync(canonical);
        if ((missing.length || directory) && !stats.isDirectory()) throw new Error();
        const anchor = directoryIdentity(stats.isDirectory() ? canonical : path.dirname(canonical));
        return Object.freeze({ selection, canonical: path.join(canonical, ...missing.reverse()), anchor, directory });
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) throw error;
        // lstat sees dangling links, including a link in a missing target's parents.
        try { fs.lstatSync(current); throw new Error(); }
        catch (probe) { if (!(probe && typeof probe === 'object' && 'code' in probe && probe.code === 'ENOENT')) throw probe; }
      }
      const parent = path.dirname(current);
      if (parent === current) throw new Error();
      missing.push(path.basename(current)); current = parent;
    }
  } catch { throw new Error('Configuration scope path could not be verified.'); }
}

export function assertScopePath(captured: ScopePath): void {
  try {
    assertDirectoryIdentity(captured.anchor);
    const current = captureScopePath(captured.selection, captured.anchor.path, captured.directory);
    if (current.canonical !== captured.canonical) throw new Error();
  } catch { throw new Error('Configuration scope path changed identity; start a new operation after reloading.'); }
}
