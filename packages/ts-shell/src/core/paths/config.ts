import fs from 'node:fs';
import path from 'node:path';

const EXTENSIONS = ['.yaml', '.yml', '.json'] as const;

/** Candidate paths keep directory ownership ahead of format preference. */
export function configFileCandidates(directories: readonly string[], stem: string): readonly string[] {
  if (!/^[A-Za-z0-9_-][A-Za-z0-9_.-]{0,63}$/.test(stem) || directories.length === 0) throw new Error('Invalid configuration path.');
  return directories.flatMap(directory => EXTENSIONS.map(extension => path.join(directory, `${stem}${extension}`)));
}

/** Select the first existing file, or the preferred new YAML path. */
export function resolveConfigFile(directories: readonly string[], stem: string): string {
  const candidates = configFileCandidates(directories, stem);
  for (const candidate of candidates) {
    try { fs.lstatSync(candidate); return candidate; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return candidate; }
  }
  return candidates[0]!;
}
