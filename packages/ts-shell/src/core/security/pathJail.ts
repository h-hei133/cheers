import path from "node:path";
import fs from "node:fs";

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
  const isDirectlyContained = !relative.startsWith("..") && !path.isAbsolute(relative);

  if (!isDirectlyContained && resolvedTarget !== normalizedWorkspace) {
    return {
      allowed: false,
      resolvedPath: resolvedTarget,
      reason: `Path '${targetPath}' resolves outside workspace root '${normalizedWorkspace}'.`,
    };
  }

  // Check realpath if the file/dir exists to guard against symlink breakouts
  try {
    if (fs.existsSync(resolvedTarget)) {
      const realTarget = fs.realpathSync(resolvedTarget);
      const realWorkspace = fs.existsSync(normalizedWorkspace)
        ? fs.realpathSync(normalizedWorkspace)
        : normalizedWorkspace;
      const realRelative = path.relative(realWorkspace, realTarget);
      const isRealContained = !realRelative.startsWith("..") && !path.isAbsolute(realRelative);

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
