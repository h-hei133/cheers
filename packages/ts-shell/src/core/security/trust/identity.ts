import fs from 'node:fs';
import path from 'node:path';

export function identifyProject(workspaceRoot: string): string {
  const resolved = path.resolve(workspaceRoot);
  try { return fs.realpathSync(resolved); }
  catch { return resolved; }
}

export function covers(savedPath: string, candidate: string): boolean {
  const relative = path.relative(savedPath, candidate);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
