import path from 'node:path';

/** Additional roots grant file access; executable project resources still belong to the primary root. */
export interface WorkspaceRoot {
  readonly path: string;
  readonly access: 'read' | 'write';
  readonly identity: string;
}

export const MAX_WORKSPACE_ROOTS = 16;

/** Persisted grants are validated, never inferred from an arbitrary saved path. */
export function decodeWorkspaceRoots(value: unknown): readonly WorkspaceRoot[] {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > MAX_WORKSPACE_ROOTS) throw new Error('Saved workspace roots are invalid.');
  const roots = value.map((root: unknown): WorkspaceRoot => {
    if (!root || typeof root !== 'object') throw new Error('Saved workspace root is invalid.');
    const entry = root as Record<string, unknown>;
    if (typeof entry.path !== 'string' || !path.isAbsolute(entry.path) || /[\x00-\x1f\x7f-\x9f]/.test(entry.path)
      || entry.path.length > 4096 || (entry.access !== 'read' && entry.access !== 'write')
      || typeof entry.identity !== 'string' || !/^\d+:\d+:[\d.]+$/.test(entry.identity)) {
      throw new Error('Saved workspace root is invalid.');
    }
    return Object.freeze({ path: path.resolve(entry.path), access: entry.access, identity: entry.identity });
  });
  if (new Set(roots.map(root => process.platform === 'win32' ? root.path.toLowerCase() : root.path)).size !== roots.length) {
    throw new Error('Saved workspace roots contain duplicates.');
  }
  return Object.freeze(roots);
}
