import fs from "node:fs";
import path from "node:path";

/**
 * The directories that make up a project, from its root down to a given one.
 *
 * Two readers need this and must agree on it: instruction files are looked for in
 * each of these directories, and so are skills. If they disagreed, a repository
 * could have its rules honored from a parent directory while its skills were
 * ignored from the same one — with nothing said about why.
 *
 * The walk stops at the first directory holding a project-root marker. When there
 * is none, only the given directory is considered: an arbitrary parent is not a
 * project, and reading configuration out of one would attribute rules to a
 * repository that never declared them.
 *
 * The trade that comes with stopping at the marker is deliberate and worth
 * knowing: in a linked worktree, whose root holds a `.git` file rather than a
 * directory, the walk stops there and the main repository's files are not seen.
 * The alternative — walking past it — would apply the same rules twice.
 */

/** A directory holding this is treated as the top of the project. */
export const PROJECT_ROOT_MARKER = ".git";

/**
 * The chain from the outermost project directory down to `from`, inclusive.
 *
 * Outermost first, so a reader that applies each in turn lets the nearest one win.
 */
export function projectDirectories(from: string, onSource?: (target: string) => void): readonly string[] {
  const chain: string[] = [];
  let current = path.resolve(from);
  let reachedRoot = false;

  for (;;) {
    chain.push(current);
    onSource?.(path.join(current, PROJECT_ROOT_MARKER));
    if (fs.existsSync(path.join(current, PROJECT_ROOT_MARKER))) {
      reachedRoot = true;
      break;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  // `chain` runs nearest-first; the caller wants the outermost applied first.
  return reachedRoot ? chain.reverse() : [path.resolve(from)];
}
