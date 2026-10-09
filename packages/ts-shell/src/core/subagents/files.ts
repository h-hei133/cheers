import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DEFINITION_BYTES } from './definition.js';
import { inspectWorkspaceFile } from '../../edit/authority/state.js';

/** Existing ancestors must remain ordinary directories, including the runtime home. */
export function pathIdentity(target: string): string {
  const parts: string[] = []; let current = path.resolve(target);
  while (true) {
    try { const stat = fs.lstatSync(current);
      if (stat.isSymbolicLink() || (current !== path.resolve(target) && !stat.isDirectory())) throw new Error('Agent paths must not traverse symlinks or non-directories.');
      parts.push(`${current}:${stat.dev}:${stat.ino}:${stat.isDirectory() ? 'd' : 'f'}`);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; parts.push(`${current}:missing`); }
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
  return parts.join('|');
}
export function readAgentFile(target: string): string | undefined {
  pathIdentity(target);
  let root = path.dirname(path.resolve(target)); while (!fs.existsSync(root)) root = path.dirname(root);
  const state = inspectWorkspaceFile(root, path.relative(root, target), undefined, DEFINITION_BYTES);
  return state.state === 'exists' ? state.content : undefined;
}
export function definitionIdentity(target: string, raw: string): string {
  return createHash('sha256').update(pathIdentity(target)).update('\0').update(raw).digest('hex');
}
