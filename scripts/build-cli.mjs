import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoSymlinkPath, buildInputDigest, listCompilerFiles } from "./build-identity.mjs";
import { restoreCliLauncher, writeCliLauncher } from "./build-cli-bin.mjs";
import { acquireBuildLock, publishBuild } from "./build-manifest.mjs";

const SCRIPT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BUILD_MODE = "production";

export class BuildError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "BuildError";
    this.exitCode = exitCode;
  }
}

export function compileTypeScript({ root, staging }) {
  const result = spawnSync(process.execPath, [
    path.join(root, "node_modules/typescript/bin/tsc"),
    "-p", path.join(root, "packages/ts-shell/tsconfig.build.json"),
    "--outDir", staging,
  ], { cwd: root, stdio: "inherit" });
  if (result.error) throw new BuildError(result.error.message, 1);
  if (result.status !== 0) throw new BuildError(`TypeScript build failed with exit ${result.status ?? "unknown"}.`, result.status || 1);
}

export async function buildCli({
  root = SCRIPT_ROOT,
  dist = path.join(root, "packages/ts-shell/dist"),
  version,
  name,
  mode = BUILD_MODE,
  inputsDigest = buildInputDigest,
  listInputs = listCompilerFiles,
  compile = compileTypeScript,
  replaceLauncher = writeCliLauncher,
  restoreLauncher = restoreCliLauncher,
  publish = publishBuild,
} = {}) {
  const packageFile = path.join(root, "packages/ts-shell/package.json");
  const pkg = version && name ? { version, name } : JSON.parse(readFileSync(packageFile, "utf8"));
  const buildVersion = version ?? pkg.version;
  const buildName = name ?? pkg.name;
  const staging = path.join(dist, `.staging-${process.pid}-${randomUUID()}`);
  assertNoSymlinkPath(root, dist);
  mkdirSync(dist, { recursive: true });
  let buildLock;
  try {
    buildLock = acquireBuildLock(root, dist);
  } catch (error) {
    throw new BuildError(`Could not acquire the build lock: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!buildLock) throw new BuildError("Another build is in progress; no build was published.");
  let launcherChange = null;
  try {
    const beforeCompilerInputs = listInputs(root);
    const before = inputsDigest(root, beforeCompilerInputs);
    mkdirSync(staging, { recursive: true });
    await compile({ root, staging });
    const afterCompilerInputs = listInputs(root);
    if (JSON.stringify(afterCompilerInputs) !== JSON.stringify(beforeCompilerInputs)) {
      throw new BuildError("Compiler inputs changed during compilation; the previous build was kept.");
    }
    const after = inputsDigest(root, afterCompilerInputs);
    if (after.digest !== before.digest) throw new BuildError("Build inputs changed during compilation; the previous build was kept.");
    launcherChange = await replaceLauncher(root);
    const manifest = await publish({
      root,
      dist,
      staging,
      version: buildVersion,
      name: buildName,
      mode,
      inputsDigest: before.digest,
      compilerInputs: beforeCompilerInputs,
      lockOwner: buildLock.owner,
    });
    launcherChange = null;
    return manifest;
  } catch (error) {
    if (launcherChange) {
      try {
        await restoreLauncher(launcherChange);
      } catch (restoreError) {
        throw new BuildError(`${error instanceof Error ? error.message : String(error)}; launcher rollback failed: ${restoreError instanceof Error ? restoreError.message : String(restoreError)}`, error?.exitCode ?? 1);
      }
    }
    throw error;
  } finally {
    rmSync(staging, { recursive: true, force: true });
    buildLock.release();
  }
}

async function main() {
  try {
    const manifest = await buildCli();
    console.log(`Wrote build manifest ${manifest.buildId.slice(0, 12)} for ${manifest.name}@${manifest.version}`);
  } catch (error) {
    console.error(`Build failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = error?.exitCode ?? 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
