import path from "node:path";
import fs from "node:fs";

function canonicalPath(target: string): string {
  if (process.platform === "linux") {
    try {
      return fs.realpathSync.native(target);
    } catch {
      // Keep the JavaScript resolver for filesystems the native resolver cannot handle.
    }
  }
  return fs.realpathSync(target);
}

/**
 * The real path of the deepest ancestor of `target` that exists, with the
 * not-yet-existing remainder appended.
 *
 * The remainder is appended rather than dropped so the caller compares the place
 * the write would actually land, not merely the directory it lands in: asked to
 * write `escape/new.html`, this answers with the resolved `escape` directory plus
 * `new.html`, which is outside the workspace and answers the question correctly.
 * Nothing exists at all — no path component resolves — returns nothing, and the
 * caller falls back to the lexical answer.
 */
function realpathOfDeepestExisting(target: string): string | undefined {
  const remainder: string[] = [];
  let current = target;
  for (;;) {
    if (fs.existsSync(current)) {
      try {
        return path.join(canonicalPath(current), ...remainder.reverse());
      } catch {
        return undefined;
      }
    }
    const parent = path.dirname(current);
    // Walking past the root would loop forever, since `dirname("/")` is `"/"`.
    if (parent === current) return undefined;
    remainder.push(path.basename(current));
    current = parent;
  }
}

export interface PathContainmentResult {
  readonly allowed: boolean;
  readonly resolvedPath: string;
  readonly reason?: string;
}

/**
 * Resolves a target path against a workspace root and checks whether it resides
 * strictly inside the workspace boundary, defending against path traversal (../)
 * and symlink breakouts.
 */
export function verifyPathContainment(
  targetPath: string,
  workspaceRoot: string = process.cwd(),
): PathContainmentResult {
  if (!targetPath || typeof targetPath !== "string") {
    return {
      allowed: false,
      resolvedPath: "",
      reason: "Target path is empty or invalid.",
    };
  }

  const normalizedWorkspace = path.resolve(workspaceRoot);
  const resolvedTarget = path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(normalizedWorkspace, targetPath);

  // Check simple prefix containment first
  const relative = path.relative(normalizedWorkspace, resolvedTarget);
  const isDirectlyContained = relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);

  if (!isDirectlyContained && resolvedTarget !== normalizedWorkspace) {
    return {
      allowed: false,
      resolvedPath: resolvedTarget,
      reason: `Path '${targetPath}' resolves outside workspace root '${normalizedWorkspace}'.`,
    };
  }

  // Check realpath if the file/dir exists to guard against symlink breakouts
  try {
    // A target that does not exist yet still has a directory that does, and that
    // directory is the one that decides where the write lands. Checking only the
    // target meant `escape/new.html` was allowed while `escape/exists.html` was
    // refused for the same symlink: the new file had no realpath to compare, so
    // the check was skipped and only the lexical prefix was ever consulted.
    const realTarget = realpathOfDeepestExisting(resolvedTarget);
    if (realTarget !== undefined) {
      const realWorkspace = fs.existsSync(normalizedWorkspace)
        ? canonicalPath(normalizedWorkspace)
        : normalizedWorkspace;
      const realRelative = path.relative(realWorkspace, realTarget);
      const isRealContained = realRelative !== ".." && !realRelative.startsWith(`..${path.sep}`) && !path.isAbsolute(realRelative);

      if (!isRealContained && realTarget !== realWorkspace) {
        return {
          allowed: false,
          resolvedPath: realTarget,
          reason: `Path '${targetPath}' symlink resolves outside workspace root.`,
        };
      }
      return { allowed: true, resolvedPath: realTarget };
    }
  } catch {
    // If realpath resolution fails, fall back to resolvedTarget if directly contained
  }

  return {
    allowed: isDirectlyContained || resolvedTarget === normalizedWorkspace,
    resolvedPath: resolvedTarget,
    reason: isDirectlyContained ? undefined : `Path '${targetPath}' is outside workspace.`,
  };
}
