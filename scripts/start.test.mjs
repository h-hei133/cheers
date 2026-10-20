import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, statSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  acquireBuildLock,
  BUILD_LOCK,
  PACKAGE_MAIN_BACKUP,
  PUBLISH_JOURNAL,
  publishBuild,
  recoverBuildTransaction,
} from "./build-manifest.mjs";
import { buildCli, compileTypeScript } from "./build-cli.mjs";
import { LAUNCHER_CONTENT, writeCliLauncher } from "./build-cli-bin.mjs";
import { buildInputDigest, listCompilerFiles, REQUIRED_BUILD_ASSETS, REQUIRED_PACKAGE_MAIN } from "./build-identity.mjs";
import { checkBuild, launchArgs } from "./start-lib.mjs";

function write(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, value);
}

function writeStaging(staging, entry = "// built\n") {
  write(path.join(staging, "index.js"), "export const value = 1;\n");
  write(path.join(staging, "entrypoints/cli.js"), entry);
  for (const asset of ["dark", "dark-contrast", "light", "light-contrast", "schema"]) {
    write(path.join(staging, `presentation/themes/${asset}.json`), "{}\n");
  }
}

test("preserves Node execution options when launching the verified child", () => {
  assert.deepEqual(
    launchArgs(
      "/build/entry.js",
      ["--version"],
      ["--inspect=9229", "--require", "/tmp/preload.cjs", "--inspect-port", "9230", "--loader", "loader.mjs"],
    ),
    ["--require", "/tmp/preload.cjs", "--loader", "loader.mjs", "/build/entry.js", "--version"],
  );
});

test("does not inherit the launcher inspector in a real child process", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "cheers-launch-"));
  const entry = path.join(root, "entry.mjs");
  write(entry, "process.stdout.write('entry');\n");
  const result = spawnSync(process.execPath, launchArgs(entry, [], ["--inspect=0"]), {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "entry");
  assert.doesNotMatch(result.stderr, /Debugger listening|ws:\/\//);
  rmSync(root, { recursive: true, force: true });
});

test("applies launcher Node execution options in a real child process", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "cheers-launch-"));
  const preload = path.join(root, "preload.cjs");
  const entry = path.join(root, "entry.mjs");
  const marker = path.join(root, "marker.txt");
  write(preload, `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "preloaded");\n`);
  write(entry, "process.stdout.write('entry');\n");
  const result = spawnSync(process.execPath, launchArgs(entry, [], ["--require", preload]), {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "entry");
  assert.equal(readFileSync(marker, "utf8"), "preloaded");
  rmSync(root, { recursive: true, force: true });
});

function fixture(version = "1.0.0") {
  const root = mkdtempSync(path.join(os.tmpdir(), "cheers-start-"));
  const dist = path.join(root, "packages/ts-shell/dist");
  const staging = path.join(dist, ".staging");
  const inputs = [
    "package.json",
    "package-lock.json",
    "packages/ts-shell/package.json",
    "packages/ts-shell/tsconfig.json",
    "packages/ts-shell/tsconfig.build.json",
    "node_modules/typescript/package.json",
    "node_modules/typescript/bin/tsc",
    "node_modules/typescript/lib/tsc.js",
    "node_modules/typescript/lib/_tsc.js",
    "node_modules/typescript/lib/lib.es2024.d.ts",
    "node_modules/@types/node/index.d.ts",
    "scripts/build-cli.mjs",
    "scripts/build-cli-bin.mjs",
    "scripts/build-identity.mjs",
    "scripts/build-manifest.mjs",
    "scripts/start-lib.mjs",
    "scripts/start.mjs",
  ];
  for (const file of inputs) write(path.join(root, file), `fixture ${file}\n`);
  write(path.join(root, "packages/ts-shell/src/index.ts"), "export const value = 1;\n");
  write(path.join(root, "dist/cli.js"), "// launcher\n");
  write(path.join(dist, "stale.js"), "stale\n");
  writeStaging(staging);
  return { root, dist, staging, version, name: "fixture" };
}

async function buildFixture(version = "1.0.0", extra = {}) {
  const value = fixture(version);
  for (const [file, content] of Object.entries(extra)) write(path.join(value.staging, file), content);
  const inputsDigest = buildInputDigest(value.root).digest;
  const manifest = await publishBuild({ ...value, inputsDigest, mode: "production" });
  return { ...value, inputsDigest, manifest };
}

test("accepts a complete immutable build and returns its contained entry", async () => {
  const value = await buildFixture();
  const result = checkBuild({ root: value.root, dist: value.dist, version: value.version });
  assert.equal(result.state, "fresh");
  assert.equal(result.ok, true);
  assert.match(result.entry, new RegExp(`builds/${value.manifest.buildId}/entrypoints/cli\\.js$`));
  assert.equal(existsSync(path.join(value.dist, "stale.js")), false);
  rmSync(value.root, { recursive: true, force: true });
});

test("publishes a complete build through the transaction", async () => {
  const value = fixture();
  const inputsDigest = buildInputDigest(value.root).digest;
  const manifest = await buildCli({
    root: value.root,
    dist: value.dist,
    version: value.version,
    name: value.name,
    inputsDigest: () => ({ digest: inputsDigest, files: 1 }),
    listInputs: () => [],
    compile: async ({ staging }) => writeStaging(staging),
  });
  const checked = checkBuild({ root: value.root, dist: value.dist, version: value.version });
  assert.equal(checked.state, "fresh");
  assert.equal(checked.manifest.buildId, manifest.buildId);
  assert.equal(readFileSync(path.join(value.root, "dist/cli.js"), "utf8"), LAUNCHER_CONTENT);
  assert.equal(existsSync(path.join(value.dist, ".build.lock")), false);
  rmSync(value.root, { recursive: true, force: true });
});

test("binds enumerated compiler inputs outside known type roots", () => {
  const value = fixture();
  const compilerInput = path.join(value.root, "node_modules/custom-types/index.d.ts");
  write(compilerInput, "export type Value = 'before';\n");
  write(
    path.join(value.root, "node_modules/typescript/bin/tsc"),
    `process.stdout.write(${JSON.stringify(compilerInput)} + "\\n");\n`,
  );
  write(path.join(value.root, "node_modules/typescript/package.json"), '{"type":"commonjs"}\n');
  assert.deepEqual(listCompilerFiles(value.root), ["node_modules/custom-types/index.d.ts"]);
  const before = buildInputDigest(value.root, ["node_modules/custom-types/index.d.ts"]).digest;
  write(compilerInput, "export type Value = 'after';\n");
  const after = buildInputDigest(value.root, ["node_modules/custom-types/index.d.ts"]).digest;
  assert.notEqual(before, after);
  rmSync(value.root, { recursive: true, force: true });
});

test("rejects missing, outdated and version-mismatched manifests", async () => {
  const value = await buildFixture();
  assert.equal(checkBuild({ root: value.root, dist: path.join(value.root, "none"), version: value.version }).state, "missing");
  assert.equal(checkBuild({ root: value.root, dist: value.dist, version: "2.0.0" }).state, "version-mismatch");
  const pointer = path.join(value.dist, "build-manifest.json");
  const old = JSON.parse(readFileSync(pointer, "utf8"));
  writeFileSync(pointer, JSON.stringify({ ...old, schemaVersion: 1 }));
  assert.equal(checkBuild({ root: value.root, dist: value.dist, version: value.version }).state, "truncated");
  rmSync(value.root, { recursive: true, force: true });
});

test("rejects a missing immutable build directory", async () => {
  const value = await buildFixture();
  rmSync(path.join(value.dist, "builds", value.manifest.buildId), { recursive: true, force: true });
  assert.equal(checkBuild({ root: value.root, dist: value.dist, version: value.version }).state, "missing-artifact");
  rmSync(value.root, { recursive: true, force: true });
});

test("rejects a manifest that omits required runtime assets", async () => {
  const value = await buildFixture();
  const pointer = path.join(value.dist, "build-manifest.json");
  const manifest = JSON.parse(readFileSync(pointer, "utf8"));
  const omitted = `builds/${manifest.buildId}/${REQUIRED_BUILD_ASSETS[0]}`;
  writeFileSync(pointer, JSON.stringify({
    ...manifest,
    artifacts: manifest.artifacts.filter(artifact => artifact.path !== omitted),
  }));
  assert.equal(checkBuild({ root: value.root, dist: value.dist, version: value.version }).state, "truncated");
  rmSync(value.root, { recursive: true, force: true });
});

test("rejects changed build inputs before executing an old artifact", async () => {
  const value = await buildFixture();
  writeFileSync(path.join(value.root, "package-lock.json"), "changed\n");
  assert.equal(checkBuild({ root: value.root, dist: value.dist, version: value.version }).state, "stale");
  rmSync(value.root, { recursive: true, force: true });
});

test("binds compiler libraries and the build mode", async () => {
  const value = await buildFixture();
  writeFileSync(path.join(value.root, "node_modules/typescript/lib/lib.es2024.d.ts"), "changed\n");
  assert.equal(checkBuild({ root: value.root, dist: value.dist, version: value.version }).state, "stale");
  const production = fixture();
  const debug = fixture();
  const productionManifest = await publishBuild({
    ...production,
    inputsDigest: buildInputDigest(production.root).digest,
    mode: "production",
  });
  const debugManifest = await publishBuild({
    ...debug,
    inputsDigest: buildInputDigest(debug.root).digest,
    mode: "debug",
  });
  assert.notEqual(productionManifest.buildId, debugManifest.buildId);
  rmSync(value.root, { recursive: true, force: true });
  rmSync(production.root, { recursive: true, force: true });
  rmSync(debug.root, { recursive: true, force: true });
});

test("rejects input changes between compilation and publication", async () => {
  const value = await buildFixture();
  const pointer = path.join(value.dist, "build-manifest.json");
  const before = readFileSync(pointer, "utf8");
  const staging = path.join(value.dist, ".race");
  writeStaging(staging, "new bytes\n");
  writeFileSync(path.join(value.root, "package-lock.json"), "changed\n");
  await assert.rejects(
    () => publishBuild({ ...value, staging, inputsDigest: value.inputsDigest, mode: "production" }),
    /inputs changed before publication/,
  );
  assert.equal(readFileSync(pointer, "utf8"), before);
  rmSync(value.root, { recursive: true, force: true });
});

test("rejects changed or extra emitted bytes", async () => {
  const value = await buildFixture();
  const root = path.join(value.dist, "builds", value.manifest.buildId);
  writeFileSync(path.join(root, "entrypoints/cli.js"), "tampered\n");
  assert.equal(checkBuild({ root: value.root, dist: value.dist, version: value.version }).state, "artifact-mismatch");
  const second = await buildFixture();
  writeFileSync(path.join(second.dist, "builds", second.manifest.buildId, "unexpected.js"), "unexpected\n");
  assert.equal(checkBuild({ root: second.root, dist: second.dist, version: second.version }).state, "artifact-mismatch");
  rmSync(value.root, { recursive: true, force: true });
  rmSync(second.root, { recursive: true, force: true });
});

test("rejects missing emitted assets and changed launcher bytes", async () => {
  const value = await buildFixture();
  rmSync(path.join(value.dist, "builds", value.manifest.buildId, "presentation/themes/dark.json"));
  assert.equal(checkBuild({ root: value.root, dist: value.dist, version: value.version }).state, "artifact-mismatch");
  const second = await buildFixture();
  writeFileSync(path.join(second.root, "dist/cli.js"), "tampered launcher\n");
  assert.equal(checkBuild({ root: second.root, dist: second.dist, version: second.version }).state, "launcher-mismatch");
  const third = await buildFixture();
  writeFileSync(path.join(third.root, "packages/ts-shell/dist/index.js"), "tampered package main\n");
  assert.equal(checkBuild({ root: third.root, dist: third.dist, version: third.version }).state, "package-main-mismatch");
  rmSync(value.root, { recursive: true, force: true });
  rmSync(second.root, { recursive: true, force: true });
  rmSync(third.root, { recursive: true, force: true });
});

test("rejects symlinked build inputs and emitted artifacts", async t => {
  const input = await buildFixture();
  rmSync(path.join(input.root, "package-lock.json"));
  try {
    symlinkSync("package.json", path.join(input.root, "package-lock.json"));
  } catch (error) {
    rmSync(input.root, { recursive: true, force: true });
    if (error && typeof error === "object" && ["EPERM", "EACCES"].includes(error.code)) {
      t.skip("symlinks are not available in this environment");
      return;
    }
    throw error;
  }
  assert.equal(checkBuild({ root: input.root, dist: input.dist, version: input.version }).state, "invalid-inputs");
  const artifact = await buildFixture();
  const entry = path.join(artifact.dist, "builds", artifact.manifest.buildId, "entrypoints/cli.js");
  rmSync(entry);
  symlinkSync("../index.js", entry);
  assert.equal(checkBuild({ root: artifact.root, dist: artifact.dist, version: artifact.version }).state, "artifact-mismatch");
  rmSync(input.root, { recursive: true, force: true });
  rmSync(artifact.root, { recursive: true, force: true });
});

test("rejects an ancestor symlink around the immutable build set", async t => {
  const value = await buildFixture();
  const outside = mkdtempSync(path.join(os.tmpdir(), "cheers-builds-"));
  const builds = path.join(value.dist, "builds");
  const moved = path.join(outside, "builds");
  renameSync(builds, moved);
  try {
    symlinkSync(moved, builds, "dir");
  } catch (error) {
    rmSync(value.root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
    if (error && typeof error === "object" && ["EPERM", "EACCES"].includes(error.code)) {
      t.skip("symlinks are not available in this environment");
      return;
    }
    throw error;
  }
  assert.equal(checkBuild({ root: value.root, dist: value.dist, version: value.version }).state, "invalid-path");
  rmSync(value.root, { recursive: true, force: true });
  rmSync(outside, { recursive: true, force: true });
});

test("rejects entries outside or unlisted by the immutable build", async () => {
  const value = await buildFixture();
  const pointer = path.join(value.dist, "build-manifest.json");
  const manifest = JSON.parse(readFileSync(pointer, "utf8"));
  writeFileSync(pointer, JSON.stringify({ ...manifest, entry: "../cli.js" }));
  assert.equal(checkBuild({ root: value.root, dist: value.dist, version: value.version }).state, "truncated");
  writeFileSync(pointer, JSON.stringify({ ...manifest, entry: "builds/not-the-build/entrypoints/cli.js" }));
  assert.equal(checkBuild({ root: value.root, dist: value.dist, version: value.version }).state, "truncated");
  const registered = await buildFixture("1.0.0", { "other.js": "export const other = true;\n" });
  const registeredPointer = path.join(registered.dist, "build-manifest.json");
  const registeredManifest = JSON.parse(readFileSync(registeredPointer, "utf8"));
  writeFileSync(registeredPointer, JSON.stringify({
    ...registeredManifest,
    entry: `builds/${registeredManifest.buildId}/other.js`,
  }));
  assert.equal(checkBuild({ root: registered.root, dist: registered.dist, version: registered.version }).state, "truncated");
  rmSync(value.root, { recursive: true, force: true });
  rmSync(registered.root, { recursive: true, force: true });
});

test("rejects malformed artifact metadata without throwing", async () => {
  const value = await buildFixture();
  const pointer = path.join(value.dist, "build-manifest.json");
  const manifest = JSON.parse(readFileSync(pointer, "utf8"));
  writeFileSync(pointer, JSON.stringify({ ...manifest, artifacts: [null, ...manifest.artifacts] }));
  assert.equal(checkBuild({ root: value.root, dist: value.dist, version: value.version }).state, "truncated");
  writeFileSync(pointer, JSON.stringify({ ...manifest, inputsDigest: "f".repeat(64) }));
  assert.equal(checkBuild({ root: value.root, dist: value.dist, version: value.version }).state, "truncated");
  rmSync(value.root, { recursive: true, force: true });
});

test("refuses to overwrite an existing build with different bytes", async () => {
  const value = await buildFixture();
  const pointer = path.join(value.dist, "build-manifest.json");
  const before = readFileSync(pointer, "utf8");
  const staging = path.join(value.dist, ".second");
  writeStaging(staging, "different\n");
  await assert.rejects(() => publishBuild({ ...value, staging, inputsDigest: value.inputsDigest, mode: "production" }), /already exists with different bytes/);
  assert.equal(readFileSync(pointer, "utf8"), before);
  rmSync(value.root, { recursive: true, force: true });
});

test("does not publish when a required final artifact is missing", async () => {
  const value = fixture();
  const inputsDigest = buildInputDigest(value.root).digest;
  rmSync(path.join(value.root, "dist/cli.js"));
  await assert.rejects(() => publishBuild({ ...value, inputsDigest, mode: "production" }), /Required file is missing: dist\/cli\.js/);
  assert.equal(existsSync(path.join(value.dist, "build-manifest.json")), false);
  assert.equal(existsSync(path.join(value.dist, "builds")), false);
  rmSync(value.root, { recursive: true, force: true });
});

test("restores the previous launcher when compilation or publication fails", async () => {
  const value = fixture();
  const inputsDigest = buildInputDigest(value.root).digest;
  const launcher = path.join(value.root, "dist/cli.js");
  await assert.rejects(() => buildCli({
    root: value.root,
    dist: value.dist,
    version: value.version,
    name: value.name,
    inputsDigest: () => ({ digest: inputsDigest, files: 1 }),
    listInputs: () => [],
    compile: async () => { throw new Error("compile failed"); },
  }), /compile failed/);
  assert.equal(readFileSync(launcher, "utf8"), "// launcher\n");
  await assert.rejects(() => buildCli({
    root: value.root,
    dist: value.dist,
    version: value.version,
    name: value.name,
    inputsDigest: () => ({ digest: inputsDigest, files: 1 }),
    listInputs: () => [],
    compile: async () => {},
    publish: async () => { throw new Error("publish failed"); },
  }), /publish failed/);
  assert.equal(readFileSync(launcher, "utf8"), "// launcher\n");
  assert.equal(existsSync(path.join(value.dist, ".build.lock")), false);
  rmSync(value.root, { recursive: true, force: true });
});

test("rolls back the package main pointer when manifest publication fails", async () => {
  const value = await buildFixture();
  const packageMain = path.join(value.dist, "index.js");
  const before = readFileSync(packageMain, "utf8");
  const staging = path.join(value.dist, ".manifest-failure");
  writeStaging(staging, "new entry\n");
  const manifestFile = path.join(value.dist, "build-manifest.json");
  rmSync(manifestFile);
  mkdirSync(manifestFile);
  await assert.rejects(() => publishBuild({
    ...value,
    version: "2.0.0",
    staging,
    inputsDigest: buildInputDigest(value.root).digest,
    mode: "production",
  }));
  assert.equal(readFileSync(packageMain, "utf8"), before);
  rmSync(value.root, { recursive: true, force: true });
});

test("recovers a publish journal before a new publication", async () => {
  const value = await buildFixture();
  const main = path.join(value.root, REQUIRED_PACKAGE_MAIN);
  const original = readFileSync(main);
  write(path.join(value.dist, PACKAGE_MAIN_BACKUP), original);
  write(path.join(value.dist, PUBLISH_JOURNAL), JSON.stringify({
    targetBuildId: "f".repeat(64),
    hadPrevious: true,
    previousMode: 0o644,
  }));
  write(main, "tampered pointer\n");
  assert.equal(recoverBuildTransaction(value.root, value.dist), true);
  assert.deepEqual(readFileSync(main), original);
  assert.equal(checkBuild({ root: value.root, dist: value.dist, version: value.version }).state, "fresh");
  assert.equal(existsSync(path.join(value.dist, PUBLISH_JOURNAL)), false);
  assert.equal(existsSync(path.join(value.dist, PACKAGE_MAIN_BACKUP)), false);
  rmSync(value.root, { recursive: true, force: true });
});

test("does not recover a transaction while its build lock is active", async () => {
  const value = await buildFixture();
  const main = path.join(value.root, REQUIRED_PACKAGE_MAIN);
  const original = readFileSync(main);
  write(path.join(value.dist, PACKAGE_MAIN_BACKUP), original);
  write(path.join(value.dist, PUBLISH_JOURNAL), JSON.stringify({
    targetBuildId: "f".repeat(64),
    hadPrevious: true,
    previousMode: 0o644,
  }));
  write(path.join(value.dist, BUILD_LOCK), JSON.stringify({ owner: "active", pid: process.pid }));
  write(main, "tampered pointer\n");
  assert.throws(() => recoverBuildTransaction(value.root, value.dist), /build is in progress/);
  assert.equal(readFileSync(main, "utf8"), "tampered pointer\n");
  assert.equal(existsSync(path.join(value.dist, PUBLISH_JOURNAL)), true);
  assert.equal(existsSync(path.join(value.dist, PACKAGE_MAIN_BACKUP)), true);
  rmSync(value.root, { recursive: true, force: true });
});

test("fails closed on a stale build lock without changing the transaction", async () => {
  const value = await buildFixture();
  const main = path.join(value.root, REQUIRED_PACKAGE_MAIN);
  const original = readFileSync(main);
  write(path.join(value.dist, PACKAGE_MAIN_BACKUP), original);
  write(path.join(value.dist, PUBLISH_JOURNAL), JSON.stringify({
    targetBuildId: "f".repeat(64),
    hadPrevious: true,
    previousMode: 0o644,
  }));
  write(path.join(value.dist, BUILD_LOCK), JSON.stringify({
    owner: "abandoned",
    pid: 999_999_999,
    startedAt: 0,
  }));
  write(main, "tampered pointer\n");
  assert.throws(() => recoverBuildTransaction(value.root, value.dist), /stale build lock/);
  assert.equal(readFileSync(main, "utf8"), "tampered pointer\n");
  assert.equal(existsSync(path.join(value.dist, BUILD_LOCK)), true);
  assert.equal(existsSync(path.join(value.dist, PUBLISH_JOURNAL)), true);
  assert.equal(existsSync(path.join(value.dist, PACKAGE_MAIN_BACKUP)), true);
  rmSync(value.root, { recursive: true, force: true });
});

test("holds the build lock before recovering a transaction", async () => {
  const value = await buildFixture();
  const main = path.join(value.root, REQUIRED_PACKAGE_MAIN);
  const original = readFileSync(main);
  write(path.join(value.dist, PACKAGE_MAIN_BACKUP), original);
  write(path.join(value.dist, PUBLISH_JOURNAL), JSON.stringify({
    targetBuildId: "f".repeat(64),
    hadPrevious: true,
    previousMode: 0o644,
  }));
  write(main, "tampered pointer\n");
  let contender;
  assert.equal(recoverBuildTransaction(value.root, value.dist, {
    onLockAcquired: () => {
      contender = acquireBuildLock(value.root, value.dist);
    },
  }), true);
  assert.equal(contender, null);
  assert.deepEqual(readFileSync(main), original);
  assert.equal(existsSync(path.join(value.dist, BUILD_LOCK)), false);
  assert.equal(existsSync(path.join(value.dist, PUBLISH_JOURNAL)), false);
  assert.equal(existsSync(path.join(value.dist, PACKAGE_MAIN_BACKUP)), false);
  rmSync(value.root, { recursive: true, force: true });
});

test("preserves the TypeScript compiler exit code", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "cheers-compiler-"));
  const staging = path.join(root, "staging");
  write(path.join(root, "node_modules/typescript/bin/tsc"), "process.exit(2);\n");
  mkdirSync(staging, { recursive: true });
  assert.throws(() => compileTypeScript({ root, staging }), error => error.exitCode === 2);
  rmSync(root, { recursive: true, force: true });
});

test("does not remove a lock owned by another build", async () => {
  const value = fixture();
  const lock = path.join(value.dist, ".build.lock");
  write(lock, "held\n");
  await assert.rejects(() => buildCli({
    root: value.root,
    dist: value.dist,
    version: value.version,
    name: value.name,
    inputsDigest: () => ({ digest: "a".repeat(64), files: 1 }),
    listInputs: () => [],
    compile: async () => {},
  }), /Another build is in progress/);
  assert.equal(readFileSync(lock, "utf8"), "held\n");
  rmSync(value.root, { recursive: true, force: true });
});

test("fails publication without removing a lock replaced during compilation", async () => {
  const value = fixture();
  const lock = path.join(value.dist, ".build.lock");
  const replacement = '{"owner":"another-build"}\n';
  const inputsDigest = buildInputDigest(value.root).digest;
  await assert.rejects(() => buildCli({
    root: value.root,
    dist: value.dist,
    version: value.version,
    name: value.name,
    inputsDigest: () => ({ digest: inputsDigest, files: 1 }),
    listInputs: () => [],
    compile: async ({ staging }) => {
      writeStaging(staging);
      rmSync(lock);
      write(lock, replacement);
    },
  }), /no longer owned/);
  assert.equal(readFileSync(lock, "utf8"), replacement);
  rmSync(value.root, { recursive: true, force: true });
});

test("repairs a launcher with the correct bytes and wrong mode", async () => {
  const value = fixture();
  const launcher = path.join(value.root, "dist/cli.js");
  write(launcher, LAUNCHER_CONTENT);
  chmodSync(launcher, 0o644);
  const change = await writeCliLauncher(value.root);
  assert.ok(change);
  assert.equal(statSync(launcher).mode & 0o777, 0o755);
  assert.equal(readFileSync(launcher, "utf8"), LAUNCHER_CONTENT);
  rmSync(value.root, { recursive: true, force: true });
});
