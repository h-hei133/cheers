import { readFileSync } from "node:fs";
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
