import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".json"]);

/** Deterministic digest of every source file a build was made from. */
export function sourceDigest(root) {
  const sourceRoot = path.join(root, "packages/ts-shell/src");
  const files = [];
  const walk = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name.localeCompare(right.name))) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(full);
    }
  };
  if (existsSync(sourceRoot)) walk(sourceRoot);
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(path.relative(root, file).split(path.sep).join("/"));
    hash.update("\0");
    hash.update(readFileSync(file));
    hash.update("\0");
  }
  return { digest: hash.digest("hex"), files: files.length };
}

export function readManifest(dist) {
  const file = path.join(dist, "build-manifest.json");
  if (!existsSync(file)) return { state: "missing" };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (!parsed || typeof parsed !== "object" || typeof parsed.version !== "string"
      || typeof parsed.sourceDigest !== "string" || typeof parsed.buildId !== "string"
      || !Array.isArray(parsed.entry)) return { state: "truncated" };
    return { state: "present", manifest: parsed };
  } catch {
    return { state: "truncated" };
  }
}

/**
 * Whether the built artifact may run.
 *
 * Each refusal is a different fact: no build, an unreadable or truncated
 * manifest, a package version that moved after the build, or source files that
 * changed since. None of them silently runs older code.
 */
export function checkBuild({ root, dist, version }) {
  const manifest = readManifest(dist);
  if (manifest.state !== "present") return { ok: false, state: manifest.state, reason: manifest.state === "missing" ? "No verified build was found. Run npm run build:ts." : "The build manifest is unreadable or truncated. Rebuild with npm run build:ts." };
  const built = manifest.manifest;
  if (built.version !== version) return { ok: false, state: "version-mismatch", reason: `The build was made for version ${built.version}, but the package is ${version}. Run npm run build:ts.` };
  for (const entry of built.entry) {
    const target = path.join(dist, entry);
    if (!existsSync(target)) return { ok: false, state: "missing-entry", reason: `The build is missing ${entry}. Run npm run build:ts.` };
    if (!statSync(target).isFile()) return { ok: false, state: "missing-entry", reason: `The build entry ${entry} is not a file. Run npm run build:ts.` };
  }
  const current = sourceDigest(root);
  if (current.digest !== built.sourceDigest) return { ok: false, state: "stale", reason: `Source files changed after the build (${built.buildId.slice(0, 12)}). Run npm run build:ts.` };
  return { ok: true, state: "fresh", manifest: built, entry: path.join(dist, built.entry[0]) };
}
