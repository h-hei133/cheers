import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export function workspacePackages(root, verifyPath = () => {}) {
  const manifest = path.join(root, "package.json");
  verifyPath(root, manifest);
  const declared = JSON.parse(readFileSync(manifest, "utf8")).workspaces ?? [];
  if (!Array.isArray(declared)) throw new Error("Expected explicit package workspace paths.");
  const names = new Set();
  return declared.map(directory => {
    if (typeof directory !== "string" || !/^packages\/[a-z0-9-]+$/.test(directory)) {
      throw new Error("Invalid package workspace path.");
    }
    const file = path.join(directory, "package.json");
    verifyPath(root, path.join(root, file));
    const pkg = JSON.parse(readFileSync(path.join(root, file), "utf8"));
    if (!/^@cheers\/[a-z0-9-]+$/.test(pkg.name) || names.has(pkg.name)) {
      throw new Error(`Invalid workspace package name in ${file}.`);
    }
    names.add(pkg.name);
    return { directory, file, pkg };
  });
}

/**
 * Returns `src/` directories for every declared workspace package, falling back to
 * `packages/ts-shell/src` for standalone test fixtures that do not declare a root `workspaces` array.
 */
export function workspaceSourceRoots(root) {
  const manifestPath = path.join(root, "package.json");
  if (existsSync(manifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      if (Array.isArray(manifest?.workspaces) && manifest.workspaces.length > 0) {
        return workspacePackages(root)
          .map(entry => path.join(root, entry.directory, "src"))
          .filter(dir => existsSync(dir));
      }
    } catch {
      // Fixtures with malformed or partial root manifests fall through to the caller's own checks.
    }
  }
  const fallback = path.join(root, "packages", "ts-shell", "src");
  return existsSync(fallback) ? [fallback] : [];
}

export function domainPackages(root, verifyPath) {
  return workspacePackages(root, verifyPath).filter(entry => entry.directory !== "packages/ts-shell").map(entry => {
    const api = entry.pkg.exports?.["."];
    if (entry.pkg.private !== true || api?.default !== "./dist/index.js" || api?.types !== "./api.d.ts" ||
        api["cheers-source"] !== "./src/index.ts" || api.bun !== "./src/index.ts") {
      throw new Error(`Invalid domain package entries in ${entry.file}.`);
    }
    return { ...entry, config: `${entry.directory}/tsconfig.json`, types: `${entry.directory}/api.d.ts` };
  });
}
