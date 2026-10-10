import fs from 'node:fs';
import path from 'node:path';
import { sandboxSystemReadRoots } from '../../sandbox/osSandbox.js';

function contains(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

export function assertEvaluationPlacement(workspace: string, artifacts: string, executable: string): void {
  const roots = [workspace, artifacts].map(root => fs.realpathSync(root));
  const exposed = sandboxSystemReadRoots.flatMap(root => fs.existsSync(root) ? [root, fs.realpathSync(root)] : [root]);
  if (roots.some(root => exposed.some(system => contains(system, root) || contains(root, system)) || contains(root, executable)))
    throw new Error('Evaluation sources and session artifacts must be outside exposed system paths and the runtime executable. Move them before starting a new baseline.');
}
