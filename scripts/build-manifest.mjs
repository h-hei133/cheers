import { createHash, randomUUID } from "node:crypto";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { chmod, mkdir, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  assertNoSymlinkPath,
  buildIdFor,
  buildInputDigest,
  REQUIRED_BUILD_ASSETS,
  REQUIRED_BUILD_ENTRY,
  REQUIRED_BUILD_INDEX,
  REQUIRED_BUILD_LAUNCHER,
  REQUIRED_PACKAGE_MAIN,
  safeRelativePath,
  snapshotDirectory,
  snapshotFile,
} from "./build-identity.mjs";

const SHA256 = /^[a-f0-9]{64}$/;
export const PUBLISH_JOURNAL = ".publish-journal.json";
export const PACKAGE_MAIN_BACKUP = ".package-main.previous";
export const BUILD_LOCK = ".build.lock";

function targetMatchesHost(target) {
  return target === `${process.platform}-${process.arch}` || target === `bun-${process.platform}-${process.arch}`;
}

function windowsTarget(target) {
  return target.startsWith("win32-") || target.includes("windows");
}

export function acquireBuildLock(root, dist) {
  const rootPath = path.resolve(root);
  const distPath = path.resolve(dist);
  mkdirSync(distPath, { recursive: true });
  assertNoSymlinkPath(rootPath, distPath);
  const file = path.join(distPath, BUILD_LOCK);
  const owner = randomUUID();
  let fd;
  let identity;
  const discardOwnedFile = () => {
    if (!identity) return;
    try {
      const current = lstatSync(file);
      if (current.dev === identity.dev && current.ino === identity.ino) unlinkSync(file);
    } catch {
      /* A missing or replaced lock is not ours to remove. */
    } finally {
      identity = undefined;
    }
  };
  const release = () => {
    if (!identity) return;
    try {
      const current = lstatSync(file);
      const recorded = JSON.parse(readFileSync(file, "utf8"));
      if (recorded.owner === owner && current.dev === identity.dev && current.ino === identity.ino) {
        unlinkSync(file);
      }
    } catch {
      /* A missing, replaced, or malformed lock is not ours to remove. */
    } finally {
      identity = undefined;
    }
  };
  try {
    fd = openSync(file, "wx");
    identity = fstatSync(fd);
    try {
      writeFileSync(fd, JSON.stringify({ owner, pid: process.pid, startedAt: Date.now() }));
    } finally {
      closeSync(fd);
      fd = undefined;
    }
    return { owner, release };
  } catch (error) {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* Best-effort close after a failed lock write. */ }
    }
    discardOwnedFile();
    if (error && typeof error === "object" && error.code === "EEXIST") return null;
    throw error;
  }
}

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function writeAtomic(root, file, content, mode = 0o644) {
  assertNoSymlinkPath(root, file);
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

function writeAtomicSync(root, file, content, mode = 0o644) {
  assertNoSymlinkPath(root, file);
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(temporary, content);
    chmodSync(temporary, mode);
    renameSync(temporary, file);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}

function readFileState(root, file) {
  assertNoSymlinkPath(root, file);
  let previous = null;
  let mode = 0o644;
  if (existsSync(file)) {
    const stat = lstatSync(file);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Replacement target is not a regular file: ${file}`);
    previous = readFileSync(file);
    mode = stat.mode & 0o777;
  }
  return { root, file, previous, mode };
}

function restoreFile(change) {
  if (change.previous === null) {
    rmSync(change.file, { force: true });
    return;
  }
  writeAtomicSync(change.root, change.file, change.previous, change.mode);
}

function packageMainContent(buildId) {
  return `export * from "./builds/${buildId}/${REQUIRED_BUILD_INDEX}";\n`;
}

async function pruneStableMirror(dist) {
  const keep = new Set(["builds", "build-manifest.json", "index.js", BUILD_LOCK, PUBLISH_JOURNAL, PACKAGE_MAIN_BACKUP]);
  for (const entry of await readdir(dist, { withFileTypes: true })) {
    if (keep.has(entry.name) || entry.name.startsWith(".staging-")) continue;
    await rm(path.join(dist, entry.name), { recursive: true, force: true });
  }
}

export function inspectBuildLock(root, dist) {
  const file = path.join(dist, BUILD_LOCK);
  if (!existsSync(file)) return { state: "absent" };
  assertNoSymlinkPath(root, file);
  const identity = lstatSync(file);
  let record;
  try {
    record = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return { state: "invalid" };
  }
  if (
    typeof record?.owner !== "string"
    || record.owner.length === 0
    || !Number.isSafeInteger(record?.pid)
    || record.pid <= 0
  ) return { state: "invalid" };
  try {
    process.kill(record.pid, 0);
    return { state: "active", pid: record.pid, owner: record.owner, identity };
  } catch (error) {
    if (error && typeof error === "object" && error.code === "EPERM") {
      return { state: "active", pid: record.pid, owner: record.owner, identity };
    }
    if (error && typeof error === "object" && error.code === "ESRCH") {
      return { state: "stale", pid: record.pid, owner: record.owner, identity };
    }
    return { state: "invalid" };
  }
}

export function recoverBuildTransaction(root, dist, options = {}) {
  const rootPath = path.resolve(root);
  const distPath = path.resolve(dist);
  if (options.lockOwner !== undefined) {
    const lock = inspectBuildLock(rootPath, distPath);
    if (lock.state !== "active" || lock.owner !== options.lockOwner) {
      throw new Error("The build lock is no longer owned by this publication; its transaction was not recovered.");
    }
    return recoverLockedTransaction(rootPath, distPath);
  }
  const acquired = acquireBuildLock(rootPath, distPath);
  if (!acquired) {
    const lock = inspectBuildLock(rootPath, distPath);
    if (lock.state === "active") {
      throw new Error(`A build is in progress (pid ${lock.pid}); its transaction was not recovered.`);
    }
    if (lock.state === "stale") {
      throw new Error(`A stale build lock (pid ${lock.pid}) was left unchanged; its transaction was not recovered.`);
    }
    throw new Error("The build lock is unreadable; its transaction was not recovered.");
  }
  try {
    options.onLockAcquired?.(acquired.owner);
    return recoverLockedTransaction(rootPath, distPath);
  } finally {
    acquired.release();
  }
}

function recoverLockedTransaction(root, dist) {
  const journalFile = path.join(dist, PUBLISH_JOURNAL);
  if (!existsSync(journalFile)) return false;
  assertNoSymlinkPath(root, journalFile);
  const journal = JSON.parse(readFileSync(journalFile, "utf8"));
  if (!SHA256.test(journal.targetBuildId ?? "")) throw new Error("Publish journal has an invalid target build id.");
  const manifestFile = path.join(dist, "build-manifest.json");
  let manifestBuildId;
  try {
    manifestBuildId = JSON.parse(readFileSync(manifestFile, "utf8")).buildId;
  } catch {
    manifestBuildId = undefined;
  }
  if (manifestBuildId !== journal.targetBuildId) {
    const mainFile = path.join(root, REQUIRED_PACKAGE_MAIN);
    if (journal.hadPrevious) {
      const backupFile = path.join(dist, PACKAGE_MAIN_BACKUP);
      assertNoSymlinkPath(root, backupFile);
      if (!existsSync(backupFile)) throw new Error("Publish journal is missing its package-main backup.");
      writeAtomicSync(root, mainFile, readFileSync(backupFile), journal.previousMode ?? 0o755);
    } else {
      rmSync(mainFile, { force: true });
    }
  }
  rmSync(journalFile, { force: true });
  rmSync(path.join(dist, PACKAGE_MAIN_BACKUP), { force: true });
  return true;
}

function beginBuildTransaction(root, dist, mainState, targetBuildId) {
  const backupFile = path.join(dist, PACKAGE_MAIN_BACKUP);
  const journalFile = path.join(dist, PUBLISH_JOURNAL);
  if (mainState.previous !== null) writeAtomicSync(root, backupFile, mainState.previous, 0o600);
  writeAtomicSync(root, journalFile, `${JSON.stringify({
    targetBuildId,
    hadPrevious: mainState.previous !== null,
    previousMode: mainState.mode,
  })}\n`, 0o600);
}

/** Publish one complete immutable build, then atomically replace the pointers. */
export async function publishBuild(options) {
  if (options.lockOwner !== undefined) return publishBuildLocked(options);
  const rootPath = path.resolve(options.root);
  const distPath = path.resolve(options.dist);
  const distRelative = path.relative(rootPath, distPath).split(path.sep).join("/");
  if (!safeRelativePath(distRelative)) throw new Error("Build output directory must be contained by the repository.");
  const lock = acquireBuildLock(rootPath, distPath);
  if (!lock) throw new Error("Another build is in progress; no build was published.");
  try {
    return await publishBuildLocked({ ...options, root: rootPath, dist: distPath, lockOwner: lock.owner });
  } finally {
    lock.release();
  }
}

/** Bind the compiled single-file executable to the exact published build. */
export async function attachExecutable(options) {
  if (options.lockOwner !== undefined) return attachExecutableLocked(options);
  const rootPath = path.resolve(options.root);
  const distPath = path.resolve(options.dist);
  const lock = acquireBuildLock(rootPath, distPath);
  if (!lock) throw new Error("Another build is in progress; the executable was not attached.");
  try {
    return await attachExecutableLocked({ ...options, root: rootPath, dist: distPath, lockOwner: lock.owner });
  } finally {
    lock.release();
  }
}

async function attachExecutableLocked(options) {
  const rootPath = path.resolve(options.root);
  const distPath = path.resolve(options.dist);
  recoverBuildTransaction(rootPath, distPath, { lockOwner: options.lockOwner });
  const manifestFile = path.join(distPath, "build-manifest.json");
  assertNoSymlinkPath(rootPath, manifestFile);
  const manifestState = readFileState(rootPath, manifestFile);
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  if (manifest?.schemaVersion !== 2 || manifest.buildId !== options.expectedBuildId
    || manifest.inputsDigest !== options.expectedInputsDigest
    || (options.expectedArtifactDigest !== undefined && manifest.artifactDigest !== options.expectedArtifactDigest)
    || !Array.isArray(manifest.compilerInputs)) {
    throw new Error("The published build changed before the executable could be attached.");
  }
  const executable = path.resolve(options.executable);
  const relative = path.relative(rootPath, executable).split(path.sep).join("/");
  if (!safeRelativePath(relative)) throw new Error("The executable must stay inside the repository.");
  if (typeof options.target !== "string" || !/^[a-z0-9-]+$/.test(options.target)) {
    throw new Error("The executable target is invalid.");
  }
  if (!options.compiler || options.compiler.name !== "bun"
    || typeof options.compiler.version !== "string" || !options.compiler.version.trim()
    || !SHA256.test(options.compiler.sha256 ?? "")) {
    throw new Error("The executable compiler provenance is incomplete.");
  }
  if (!options.verification || (options.verification.kind !== "host" && options.verification.kind !== "cross-target")) {
    throw new Error("The executable verification state is incomplete.");
  }
  if (options.verification.kind === "host"
    && (typeof options.verification.version !== "string" || options.verification.version !== manifest.version
      || !targetMatchesHost(options.target))) {
    throw new Error("A host-verified executable must record the build version for the current host target.");
  }
  assertNoSymlinkPath(rootPath, executable);
  const first = snapshotFile(executable, relative);
  if (first.size === 0) throw new Error("The executable is empty.");
  if (buildInputDigest(rootPath, manifest.compilerInputs).digest !== manifest.inputsDigest) {
    throw new Error("Build inputs changed before the executable could be attached.");
  }
  const second = snapshotFile(executable, relative);
  if (first.size !== second.size || first.sha256 !== second.sha256) {
    throw new Error("The executable changed while it was being attached.");
  }
  const executableName = windowsTarget(options.target) ? "cheers.exe" : "cheers";
  const immutable = path.join(rootPath, "dist", "executables", second.sha256, executableName);
  const immutableRelative = path.relative(rootPath, immutable).split(path.sep).join("/");
  if (!safeRelativePath(immutableRelative) || !immutableRelative.startsWith("dist/executables/")) {
    throw new Error("The immutable executable path is outside the executable store.");
  }
  assertNoSymlinkPath(rootPath, path.dirname(immutable));
  if (existsSync(immutable)) {
    const existing = snapshotFile(immutable, immutableRelative);
    if (existing.size !== second.size || existing.sha256 !== second.sha256) {
      throw new Error("The immutable executable path already contains different bytes.");
    }
  } else {
    const temporary = `${immutable}.${process.pid}.${randomUUID()}.tmp`;
    try {
      mkdirSync(path.dirname(immutable), { recursive: true });
      assertNoSymlinkPath(rootPath, path.dirname(immutable));
      copyFileSync(executable, temporary);
      chmodSync(temporary, 0o755);
      renameSync(temporary, immutable);
    } catch (error) {
      rmSync(temporary, { force: true });
      throw error;
    }
  }
  await options.verifyCandidate?.(immutable);
  const next = {
    ...manifest,
    executable: { path: immutableRelative, size: second.size, sha256: second.sha256,
      target: options.target, compiler: { ...options.compiler }, builtAt: new Date().toISOString(),
      verification: { ...options.verification } },
  };
  await writeAtomic(rootPath, manifestFile, `${JSON.stringify(next, null, 2)}\n`);
  try {
    const verified = await options.verify?.(next);
    if (verified === false) throw new Error("Post-install executable verification failed.");
  } catch (error) {
    try {
      restoreFile(manifestState);
    } catch (rollbackError) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}; manifest rollback failed: ${
        rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
    }
    throw error;
  }
  return next;
}

async function publishBuildLocked({
  root,
  dist,
  staging,
  version,
  name,
  node = process.versions.node,
  mode,
  inputsDigest,
  compilerInputs = [],
  lockOwner,
}) {
  if (!SHA256.test(inputsDigest ?? "")) throw new Error("A verified build input digest is required before publication.");
  if (typeof mode !== "string" || !mode.trim()) throw new Error("A build mode is required before publication.");
  if (!Array.isArray(compilerInputs) || compilerInputs.some(file => !safeRelativePath(file))) {
    throw new Error("Compiler input paths must be contained relative paths.");
  }
  const rootPath = path.resolve(root);
  const distPath = path.resolve(dist);
  const stagingPath = path.resolve(staging);
  const distRelative = path.relative(rootPath, distPath).split(path.sep).join("/");
  const stagingRelative = path.relative(distPath, stagingPath).split(path.sep).join("/");
  if (!safeRelativePath(distRelative)) throw new Error("Build output directory must be contained by the repository.");
  if (!safeRelativePath(stagingRelative) || stagingRelative === "builds" || stagingRelative.startsWith("builds/")) {
    throw new Error("Build staging directory must be contained by dist outside the immutable build set.");
  }
  assertNoSymlinkPath(rootPath, distPath);
  assertNoSymlinkPath(rootPath, stagingPath);
  recoverBuildTransaction(rootPath, distPath, { lockOwner });
  if (buildInputDigest(rootPath, compilerInputs).digest !== inputsDigest) {
    throw new Error("Build inputs changed before publication; the previous build was kept.");
  }
  const buildId = buildIdFor({ version, inputsDigest, node, mode });
  const buildRoot = path.join(distPath, "builds", buildId);
  const staged = snapshotDirectory(stagingPath);
  for (const required of [REQUIRED_BUILD_ENTRY, REQUIRED_BUILD_INDEX, ...REQUIRED_BUILD_ASSETS]) {
    if (!staged.artifacts.some(artifact => artifact.path === required)) throw new Error(`Build output is missing ${required}.`);
  }
  assertNoSymlinkPath(rootPath, path.join(rootPath, REQUIRED_BUILD_LAUNCHER));
  const launcher = {
    path: REQUIRED_BUILD_LAUNCHER,
    ...snapshotFile(path.join(rootPath, REQUIRED_BUILD_LAUNCHER), REQUIRED_BUILD_LAUNCHER),
  };
  const mainContent = packageMainContent(buildId);
  const packageMain = {
    path: REQUIRED_PACKAGE_MAIN,
    size: Buffer.byteLength(mainContent),
    sha256: digest(mainContent),
  };
  const artifacts = staged.artifacts.map(artifact => ({ ...artifact, path: `builds/${buildId}/${artifact.path}` }));
  const manifest = {
    schemaVersion: 2,
    name,
    version,
    mode,
    builtAt: new Date().toISOString(),
    node,
    inputsDigest,
    compilerInputs,
    artifactDigest: staged.digest,
    buildId,
    entry: `builds/${buildId}/${REQUIRED_BUILD_ENTRY}`,
    launcher,
    packageMain,
    artifacts,
  };
  await mkdir(path.dirname(buildRoot), { recursive: true });
  assertNoSymlinkPath(rootPath, buildRoot);
  if (!existsSync(buildRoot)) {
    await rename(stagingPath, buildRoot);
  } else {
    const existing = snapshotDirectory(buildRoot);
    if (existing.digest !== staged.digest) throw new Error(`Immutable build ${buildId.slice(0, 12)} already exists with different bytes.`);
    await rm(stagingPath, { recursive: true, force: true });
  }
  const mainFile = path.join(rootPath, REQUIRED_PACKAGE_MAIN);
  const mainState = readFileState(rootPath, mainFile);
  beginBuildTransaction(rootPath, distPath, mainState, buildId);
  try {
    writeAtomicSync(rootPath, mainFile, mainContent, 0o644);
    if (buildInputDigest(rootPath, compilerInputs).digest !== inputsDigest) {
      throw new Error("Build inputs changed before manifest publication; the previous build was kept.");
    }
    await writeAtomic(rootPath, path.join(distPath, "build-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  } catch (error) {
    try {
      restoreFile(mainState);
      rmSync(path.join(distPath, PUBLISH_JOURNAL), { force: true });
      rmSync(path.join(distPath, PACKAGE_MAIN_BACKUP), { force: true });
    } catch (restoreError) {
      throw new Error(`Build manifest publication failed and package-main rollback also failed: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`);
    }
    throw error;
  }
  try {
    await pruneStableMirror(distPath);
  } catch {
    /* Stale files are harmless; the immutable build and pointer are already valid. */
  }
  rmSync(path.join(distPath, PUBLISH_JOURNAL), { force: true });
  rmSync(path.join(distPath, PACKAGE_MAIN_BACKUP), { force: true });
  return manifest;
}
