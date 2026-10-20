import { randomUUID } from "node:crypto";
import { existsSync, lstatSync, readFileSync } from "node:fs";
import { chmod, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoSymlinkPath, REQUIRED_BUILD_LAUNCHER } from "./build-identity.mjs";

export const LAUNCHER_CONTENT = `#!/usr/bin/env node
import "../scripts/start.mjs";
`;

async function writeAtomic(file, content, mode) {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, content);
    await chmod(temporary, mode);
    await rename(temporary, file);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

export async function writeCliLauncher(root) {
  const launcher = path.join(root, REQUIRED_BUILD_LAUNCHER);
  assertNoSymlinkPath(root, launcher);
  await mkdir(path.dirname(launcher), { recursive: true });
  let previous = null;
  let mode = 0o755;
  if (existsSync(launcher)) {
    const stat = lstatSync(launcher);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`CLI launcher is not a regular file: ${launcher}`);
    previous = readFileSync(launcher);
    mode = stat.mode & 0o777;
    if (previous.equals(Buffer.from(LAUNCHER_CONTENT))) {
      if (mode === 0o755) return null;
      await chmod(launcher, 0o755);
      return { root, launcher, previous, mode };
    }
  }
  await writeAtomic(launcher, LAUNCHER_CONTENT, 0o755);
  return { root, launcher, previous, mode };
}

export async function restoreCliLauncher(change) {
  if (!change) return;
  assertNoSymlinkPath(change.root, change.launcher);
  if (change.previous === null) {
    await rm(change.launcher, { force: true });
    return;
  }
  await writeAtomic(change.launcher, change.previous, change.mode);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const launcher = await writeCliLauncher(root);
  console.log(`Wrote CLI bin entry: ${launcher}`);
}
