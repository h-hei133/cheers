import { chmodSync, existsSync, lstatSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { assertNoSymlinkPath } from "../build-identity.mjs";
import { managedPublicPath } from "./exports.mjs";

export function replacePublicFile(root, file, content, mode = 0o644) {
  assertNoSymlinkPath(root, file);
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(temporary, content);
    chmodSync(temporary, mode);
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}

export function capturePublicFiles(root, dist, files) {
  return files.map(file => {
    if (!managedPublicPath(file.path)) throw new Error("Unsafe public entrypoint path.");
    const target = path.join(dist, file.path);
    assertNoSymlinkPath(root, target);
    if (!existsSync(target)) return { path: file.path, previous: null, mode: 0o644 };
    const stat = lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("A public entrypoint is not a regular file.");
    return { path: file.path, previous: readFileSync(target).toString("base64"), mode: stat.mode & 0o777 };
  });
}

/** Validate the whole journal before restoring any file; old publisher journals remain readable. */
export function restorePublicFiles(root, dist, files) {
  if (!Array.isArray(files) || files.length === 0 || files.length > 4096) throw new Error("Invalid public-entry journal.");
  const paths = new Set();
  for (const file of files) {
    if (!file || !managedPublicPath(file.path) || paths.has(file.path)
      || !Number.isInteger(file.mode) || file.mode < 0 || file.mode > 0o777
      || (file.previous !== null && (typeof file.previous !== "string"
        || file.previous.length > 16 * 1024 * 1024
        || Buffer.from(file.previous, "base64").toString("base64") !== file.previous))) {
      throw new Error("Invalid public-entry journal.");
    }
    assertNoSymlinkPath(root, path.join(dist, file.path));
    paths.add(file.path);
  }
  for (const file of files) {
    const target = path.join(dist, file.path);
    if (file.previous === null) rmSync(target, { force: true });
    else replacePublicFile(root, target, Buffer.from(file.previous, "base64"), file.mode);
  }
}

/** Remove only files owned by a former manifest, and only if their bytes are still unchanged. */
export function prunePublicFiles(root, dist, previous, current, snapshot) {
  const prefix = `${path.relative(root, dist).split(path.sep).join("/")}/`;
  const keep = new Set(current.map(file => file.path));
  for (const file of previous?.publicApi?.files ?? []) {
    if (keep.has(file.path) || typeof file.path !== "string" || !file.path.startsWith(prefix)
      || !managedPublicPath(file.path.slice(prefix.length))) continue;
    const target = path.join(root, file.path);
    assertNoSymlinkPath(root, target);
    if (!existsSync(target)) continue;
    const actual = snapshot(target, file.path);
    if (actual.size === file.size && actual.sha256 === file.sha256) rmSync(target, { force: true });
  }
}
