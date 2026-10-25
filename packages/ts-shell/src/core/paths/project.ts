import fs from 'node:fs';
import path from 'node:path';
import { resolveUserDataFile, userDataDir, userHomeDir } from './userHome.js';

const LEGACY_FILES = { 'config.json': '.cheers.json', 'mcp.json': '.cheers.mcp.json' } as const;

export function projectConfigCandidates(root: string, name: keyof typeof LEGACY_FILES): readonly string[] {
  const current = path.join(root, '.cheers', name);
  const legacy = path.join(root, LEGACY_FILES[name]);
  // Opening HOME (or a profile's parent) must not relabel its personal file as project state.
  const identity = canonical(current);
  const personal = [path.join(userDataDir(), name), path.join(userHomeDir(), '.cheers', name), resolveUserDataFile(name)];
  return personal.some(file => identity === canonical(file)) ? [legacy] : [current, legacy];
}

function canonical(file: string): string {
  try { return fs.realpathSync(file); }
  catch {
    const parent = path.dirname(file);
    return parent === file ? path.resolve(file) : path.join(canonical(parent), path.basename(file));
  }
}

/** Invalid or inaccessible entries belong to the reader; only absence permits fallback. */
function present(file: string): boolean {
  try { fs.lstatSync(file); return true; }
  catch (error) { return (error as NodeJS.ErrnoException).code !== 'ENOENT'; }
}

/** Prefer the project directory, retaining an existing legacy file's edit identity. */
export function resolveProjectConfigFile(root: string, name: keyof typeof LEGACY_FILES): string {
  const candidates = projectConfigCandidates(root, name);
  return candidates.find(present) ?? candidates[0]!;
}
