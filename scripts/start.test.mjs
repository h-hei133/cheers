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
  attachExecutable,
  publishBuild,
  recoverBuildTransaction,
} from "./build-manifest.mjs";
import { compilerTemporaryPath, isHostTarget, resolveExecutableOutput } from "./build-cli-executable.mjs";
import { buildCli, compileTypeScript } from "./build-cli.mjs";
import { LAUNCHER_CONTENT, writeCliLauncher } from "./build-cli-bin.mjs";
import { buildInputDigest, listCompilerFiles, REQUIRED_BUILD_ASSETS, REQUIRED_BUILD_INPUTS, REQUIRED_PACKAGE_MAIN } from "./build-identity.mjs";
import { bindingName, publicFiles } from "./build/exports.mjs";
import { capturePublicFiles } from "./build/transaction.mjs";
import { checkBuild, launchArgs } from "./start-lib.mjs";

function write(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, value);
}

function writeStaging(staging, entry = "// built\n") {
  write(path.join(staging, "index.js"), "export const value = 1;\n");
  write(path.join(staging, "types/index.d.ts"), "export declare const value: number;\n");
  write(path.join(staging, "public.js"), `export { value as ${bindingName(".", "value")} } from "./index.js";\n`);
  write(path.join(staging, "public.json"), JSON.stringify({ schemaVersion: 1,
    entries: [{ specifier: ".", path: "index.js", types: "types/index.d.ts", names: ["value"] }] }));
  write(path.join(staging, "entrypoints/cli.js"), entry);
  for (const asset of REQUIRED_BUILD_ASSETS) {
    write(path.join(staging, asset), "{}\n");
  }
}

const bunCompiler = { name: "bun", version: "1.2.0", sha256: "c".repeat(64) };
const hostTarget = `${process.platform}-${process.arch}`;

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
  for (const file of REQUIRED_BUILD_INPUTS) write(path.join(root, file), `fixture ${file}\n`);
  write(path.join(root, "package.json"), '{"type":"module"}\n');
  write(path.join(root, "packages/ts-shell/package.json"), JSON.stringify({ name: "@cheers/build-fixture", type: "module", version,
    main: "./dist/index.js", types: "./dist/types/index.d.ts", files: ["dist"],
    exports: { ".": { types: "./dist/types/index.d.ts", import: "./dist/index.js", default: "./dist/index.js" } } }));
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
  assert.equal(readFileSync(path.join(value.dist, "stale.js"), "utf8"), "stale\n");
  rmSync(value.root, { recursive: true, force: true });
});

test("binds a single-file executable to the published build and rejects tampering", async () => {
  const value = await buildFixture();
  assert.equal(checkBuild({ root: value.root, dist: value.dist, version: value.version, executablePolicy: "required" }).state, "missing-executable");
  const executable = path.join(value.root, "dist/bin/cheers");
  write(executable, "compiled executable\n");
  await attachExecutable({ root: value.root, dist: value.dist, executable,
    expectedBuildId: value.manifest.buildId, expectedInputsDigest: value.inputsDigest, target: hostTarget, compiler: bunCompiler,
    verification: { kind: "host", version: value.version } });
  const checked = checkBuild({ root: value.root, dist: value.dist, version: value.version, executablePolicy: "required" });
  assert.equal(checked.state, "fresh");
  assert.equal(checked.executable.sha256, checked.manifest.executable.sha256);
  assert.deepEqual(checked.manifest.executable.compiler, bunCompiler);
  writeFileSync(path.join(value.root, checked.manifest.executable.path), "tampered executable\n");
  assert.equal(checkBuild({ root: value.root, dist: value.dist, version: value.version }).state, "executable-mismatch");
  assert.equal(checkBuild({ root: value.root, dist: value.dist, version: value.version, executablePolicy: "ignore" }).state, "fresh");
  rmSync(value.root, { recursive: true, force: true });
});

test("restricts executable output to a file directly inside dist/bin", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "cheers-output-"));
  assert.equal(resolveExecutableOutput(root, "dist/bin/cheers"), path.join(root, "dist/bin/cheers"));
  assert.throws(() => resolveExecutableOutput(root, ".git/config"), /directly inside dist\/bin/);
  assert.throws(() => resolveExecutableOutput(root, "dist/cli.js"), /directly inside dist\/bin/);
  assert.throws(() => resolveExecutableOutput(root, "dist/bin/nested/cheers"), /directly inside dist\/bin/);
  rmSync(root, { recursive: true, force: true });
});

test("keeps the executable suffix Bun requires for a Windows compile target", () => {
  const outfile = path.join(os.tmpdir(), "cheers.exe");
  assert.match(compilerTemporaryPath(outfile, false), /\.tmp$/);
  assert.match(compilerTemporaryPath(outfile, true), /\.tmp\.exe$/);
});

test("recognizes both host target spellings and keeps other targets cross-target", () => {
  assert.equal(isHostTarget("linux-x64", "linux", "x64"), true);
  assert.equal(isHostTarget("bun-linux-x64", "linux", "x64"), true);
  assert.equal(isHostTarget("bun-linux-arm64", "linux", "x64"), false);
  assert.equal(isHostTarget("bun-windows-x64", "linux", "x64"), false);
});

test("names immutable Windows executables with the .exe suffix", async () => {
  for (const target of ["win32-x64", "bun-windows-x64"]) {
    const value = await buildFixture();
    const executable = path.join(value.root, "dist/bin/cheers.exe");
    write(executable, "compiled executable\n");
    const manifest = await attachExecutable({ root: value.root, dist: value.dist, executable,
      expectedBuildId: value.manifest.buildId, expectedInputsDigest: value.inputsDigest, target, compiler: bunCompiler,
      verification: { kind: "cross-target" } });
    assert.match(manifest.executable.path, /\/cheers\.exe$/);
    rmSync(value.root, { recursive: true, force: true });
  }
});

test("restores the previous manifest when executable verification fails", async () => {
  const value = await buildFixture();
  const manifestFile = path.join(value.dist, "build-manifest.json");
  const before = readFileSync(manifestFile);
  const executable = path.join(value.root, "dist/bin/cheers");
  write(executable, "compiled executable\n");
  await assert.rejects(() => attachExecutable({ root: value.root, dist: value.dist, executable,
    expectedBuildId: value.manifest.buildId, expectedInputsDigest: value.inputsDigest, target: hostTarget, compiler: bunCompiler,
    verification: { kind: "host", version: value.version },
    verify: () => { throw new Error("post-install verification failed"); },
  }), /post-install verification failed/);
  assert.deepEqual(readFileSync(manifestFile), before);
  assert.equal(checkBuild({ root: value.root, dist: value.dist, version: value.version }).state, "fresh");
  rmSync(value.root, { recursive: true, force: true });
});

test("refuses to bind an executable without compiler provenance", async () => {
  const value = await buildFixture();
  const executable = path.join(value.root, "dist/bin/cheers");
  write(executable, "compiled executable\n");
  await assert.rejects(() => attachExecutable({ root: value.root, dist: value.dist, executable,
    expectedBuildId: value.manifest.buildId, expectedInputsDigest: value.inputsDigest, target: hostTarget }),
  /compiler provenance is incomplete/);
  rmSync(value.root, { recursive: true, force: true });
});

test("refuses to attach an executable after build inputs change", async () => {
  const value = await buildFixture();
  const executable = path.join(value.root, "dist/bin/cheers");
  write(executable, "compiled executable\n");
  writeFileSync(path.join(value.root, "package-lock.json"), "changed before attach\n");
  await assert.rejects(() => attachExecutable({ root: value.root, dist: value.dist, executable,
    expectedBuildId: value.manifest.buildId, expectedInputsDigest: value.inputsDigest, target: hostTarget, compiler: bunCompiler,
    verification: { kind: "host", version: value.version } }),
  /Build inputs changed before the executable could be attached/);
  assert.equal(checkBuild({ root: value.root, dist: value.dist, version: value.version }).state, "stale");
  rmSync(value.root, { recursive: true, force: true });
});

test("rejects an empty executable and keeps the previous manifest", async () => {
  const value = await buildFixture();
  const manifestFile = path.join(value.dist, "build-manifest.json");
  const before = readFileSync(manifestFile);
  const executable = path.join(value.root, "dist/bin/empty");
  write(executable, "");
  await assert.rejects(() => attachExecutable({ root: value.root, dist: value.dist, executable,
    expectedBuildId: value.manifest.buildId, expectedInputsDigest: value.inputsDigest, target: hostTarget,
    compiler: bunCompiler, verification: { kind: "host", version: value.version } }),
  /executable is empty/);
  assert.deepEqual(readFileSync(manifestFile), before);
  assert.equal(checkBuild({ root: value.root, dist: value.dist, version: value.version }).state, "fresh");
  rmSync(value.root, { recursive: true, force: true });
});

test("does not claim a cross-target executable was host-verified", async () => {
  const value = await buildFixture();
  const executable = path.join(value.root, "dist/bin/cross");
  write(executable, "cross target bytes\n");
  await attachExecutable({ root: value.root, dist: value.dist, executable,
    expectedBuildId: value.manifest.buildId, expectedInputsDigest: value.inputsDigest, target: "darwin-arm64",
    compiler: bunCompiler, verification: { kind: "cross-target" } });
  assert.equal(checkBuild({ root: value.root, dist: value.dist, version: value.version,
    executablePolicy: "required" }).state, "executable-unverified");
  assert.equal(checkBuild({ root: value.root, dist: value.dist, version: value.version }).state, "fresh");
  rmSync(value.root, { recursive: true, force: true });
});

test("rejects host verification recorded for a different target", async () => {
  const value = await buildFixture();
  const executable = path.join(value.root, "dist/bin/wrong-host");
  write(executable, "wrong host bytes\n");
  await assert.rejects(() => attachExecutable({ root: value.root, dist: value.dist, executable,
    expectedBuildId: value.manifest.buildId, expectedInputsDigest: value.inputsDigest, target: "darwin-arm64",
    compiler: bunCompiler, verification: { kind: "host", version: value.version } }),
  /host-verified executable/);
  assert.equal(checkBuild({ root: value.root, dist: value.dist, version: value.version }).state, "fresh");
  rmSync(value.root, { recursive: true, force: true });
});

test("rejects host verification recorded for a different build version", async () => {
  const value = await buildFixture();
  const executable = path.join(value.root, "dist/bin/wrong-version");
  write(executable, "wrong version bytes\n");
  await assert.rejects(() => attachExecutable({ root: value.root, dist: value.dist, executable,
    expectedBuildId: value.manifest.buildId, expectedInputsDigest: value.inputsDigest, target: hostTarget,
    compiler: bunCompiler, verification: { kind: "host", version: "9.9.9" } }),
  /record the build version/);
  assert.equal(checkBuild({ root: value.root, dist: value.dist, version: value.version }).state, "fresh");

  await attachExecutable({ root: value.root, dist: value.dist, executable,
    expectedBuildId: value.manifest.buildId, expectedInputsDigest: value.inputsDigest, target: hostTarget,
    compiler: bunCompiler, verification: { kind: "host", version: value.version } });
  const manifestFile = path.join(value.dist, "build-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  writeFileSync(manifestFile, `${JSON.stringify({
    ...manifest,
    executable: { ...manifest.executable, verification: { kind: "host", version: "9.9.9" } },
  }, null, 2)}\n`);
  assert.equal(checkBuild({ root: value.root, dist: value.dist, version: value.version }).state, "truncated");
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

test("binds the media workspace source into the release build identity", () => {
  const value = fixture();
  try {
    write(path.join(value.root, 'package.json'), JSON.stringify({ workspaces: ['packages/media'] }));
    write(path.join(value.root, 'packages/media/package.json'), JSON.stringify({ private: true, name: '@cheers/media', exports: {
      '.': { types: './api.d.ts', bun: './src/index.ts', 'cheers-source': './src/index.ts', default: './dist/index.js' },
    } }));
    write(path.join(value.root, 'packages/media/tsconfig.json'), '{}');
    write(path.join(value.root, 'packages/media/api.d.ts'), 'export declare const decoder: string;');
    const source = path.join(value.root, 'packages/media/src/index.ts');
    write(source, 'export const decoder = "before";\n');
    const before = buildInputDigest(value.root).digest;
    write(source, 'export const decoder = "after";\n');
    assert.notEqual(buildInputDigest(value.root).digest, before);
  } finally { rmSync(value.root, { recursive: true, force: true }); }
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

test("publishes native subpath imports with shared identity, default and live bindings", async () => {
  const value = fixture();
  try {
    const pkgFile = path.join(value.root, "packages/ts-shell/package.json");
    const pkg = JSON.parse(readFileSync(pkgFile, "utf8"));
    pkg.exports["./state"] = { types: "./dist/types/core/state.d.ts", import: "./dist/core/state.js", default: "./dist/core/state.js" };
    write(pkgFile, JSON.stringify(pkg));
    const entries = [
      { specifier: ".", path: "index.js", types: "types/index.d.ts", names: ["increment", "owner", "value"] },
      { specifier: "./state", path: "core/state.js", types: "types/core/state.d.ts", names: ["default", "increment", "owner", "value"] },
    ];
    write(path.join(value.staging, "chunks/state.js"), "export const owner = {}; export let value = 0; export function increment() { value++; }\n");
    write(path.join(value.staging, "index.js"), 'export { owner, value, increment } from "./chunks/state.js";\n');
    write(path.join(value.staging, "core/state.js"), 'export { owner as default, owner, value, increment } from "../chunks/state.js";\n');
    write(path.join(value.staging, "types/core/state.d.ts"), "export declare const owner: object; export default owner;\n");
    write(path.join(value.staging, "public.json"), JSON.stringify({ schemaVersion: 1, entries }));
    write(path.join(value.staging, "public.js"), entries.map(entry =>
      `export { ${entry.names.map(name => `${JSON.stringify(name)} as ${bindingName(entry.specifier, name)}`).join(", ")} } from ${JSON.stringify(`./${entry.path}`)};\n`).join(""));
    const manifest = await publishBuild({ ...value, inputsDigest: buildInputDigest(value.root).digest, mode: "production" });
    const probe = path.join(value.root, "packages/ts-shell/probe.mjs");
    write(probe, `import assert from 'node:assert/strict';
import * as root from '@cheers/build-fixture';
import defaultOwner, * as state from '@cheers/build-fixture/state';
assert.deepEqual(Object.keys(root), ['increment','owner','value']);
assert.equal(root.owner, state.owner);
assert.equal(defaultOwner, root.owner);
state.increment();
assert.equal(root.value, 1);
root.increment();
assert.equal(state.value, 2);
`);
    const result = spawnSync(process.execPath, [probe], { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(checkBuild({ ...value }).state, "fresh");
    write(path.join(value.dist, "core/state.js"), "export const owner = {};\n");
    assert.equal(checkBuild({ ...value }).state, "package-exports-mismatch");
    for (const file of publicFiles(manifest.buildId, entries)) write(path.join(value.dist, file.path), file.content);
    write(path.join(value.dist, "current.js"), 'export * from "./missing.js";\n');
    assert.equal(checkBuild({ ...value }).state, "package-exports-mismatch");
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});

test("recovers every public file, original mode and prior absence from the journal", async () => {
  const value = await buildFixture();
  try {
    const files = publicFiles(value.manifest.buildId, value.manifest.publicApi.entries);
    files.push({ path: "future/index.js", content: "export {};\n" });
    chmodSync(path.join(value.dist, "current.js"), 0o640);
    const previous = capturePublicFiles(value.root, value.dist, files);
    write(path.join(value.dist, PUBLISH_JOURNAL), JSON.stringify({ schemaVersion: 2, targetBuildId: "f".repeat(64), files: previous }));
    for (const file of files) write(path.join(value.dist, file.path), "changed\n");
    assert.equal(recoverBuildTransaction(value.root, value.dist), true);
    assert.equal(checkBuild({ ...value }).state, "fresh");
    assert.equal(statSync(path.join(value.dist, "current.js")).mode & 0o777, 0o640);
    assert.equal(existsSync(path.join(value.dist, "future/index.js")), false);
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});

test("rejects a forged recovery path before changing any public file", async () => {
  const value = await buildFixture();
  try {
    const file = path.join(value.dist, "current.js");
    const before = readFileSync(file, "utf8");
    write(path.join(value.dist, PUBLISH_JOURNAL), JSON.stringify({ schemaVersion: 2, targetBuildId: "f".repeat(64), files: [
      { path: "current.js", previous: Buffer.from("replaced").toString("base64"), mode: 0o644 },
      { path: "../outside.js", previous: null, mode: 0o644 },
    ] }));
    assert.throws(() => recoverBuildTransaction(value.root, value.dist), /Invalid public-entry journal/);
    assert.equal(readFileSync(file, "utf8"), before);
    assert.equal(existsSync(path.join(value.dist, PUBLISH_JOURNAL)), true);
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
});

test("packing includes only the selected generation and declared public files", async () => {
  const value = await buildFixture();
  try {
    const older = "f".repeat(64);
    write(path.join(value.dist, "builds", older, "obsolete.js"), "export const old = true;\n");
    write(path.join(value.dist, ".staging-unfinished", "private.js"), "throw new Error('not published');\n");
    write(path.join(value.dist, "types/private.d.ts"), "export declare const old: true;\n");
    const destination = path.join(value.root, "pack");
    mkdirSync(destination);
    const result = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm",
      ["pack", "--json", "--ignore-scripts", "--pack-destination", destination], {
        cwd: path.join(value.root, "packages/ts-shell"), encoding: "utf8", timeout: 20_000,
      });
    assert.equal(result.status, 0, result.stderr);
    const parsed = JSON.parse(result.stdout);
    const [packed] = Array.isArray(parsed) ? parsed : Object.values(parsed);
    const files = new Set(packed.files.map(file => file.path));
    assert.equal(files.has("dist/index.js"), true);
    assert.equal(files.has("dist/current.js"), true);
    assert.equal(files.has("dist/types/index.d.ts"), true);
    assert.equal(files.has(`dist/builds/${value.manifest.buildId}/public.js`), true);
    assert.equal(files.has(`dist/builds/${value.manifest.buildId}/types/index.d.ts`), true);
    assert.equal(files.has(`dist/builds/${older}/obsolete.js`), false);
    assert.equal(files.has("dist/.staging-unfinished/private.js"), false);
    assert.equal(files.has("dist/stale.js"), false);
    assert.equal(files.has("dist/types/private.d.ts"), false);
    assert.equal(files.has("src/index.ts"), false);
  } finally {
    rmSync(value.root, { recursive: true, force: true });
  }
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
