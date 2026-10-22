#!/usr/bin/env node
// Build a single-file executable from the TypeScript CLI.
//
// Why this exists: the package ships as `dist/cli.js`, so using it means having
// Node installed and paying the interpreter's startup on every invocation —
// measured at 1.4 seconds against 0.2 for the compiled form. Compiling removes
// both: the runtime travels inside the binary and the modules are parsed at
// build time.
//
// The version and name are baked in because a compiled binary has no manifest
// to read. That is not a guess: the first build of this script produced a binary
// whose `--version` printed "version unknown", because `import.meta.url` points
// inside the runtime's virtual filesystem and the upward walk for a
// `package.json` finds nothing.
//
// Cross-compilation is available through `--target`, but the default is the
// host: building for another platform produces a binary that cannot be run to
// check it, and an unchecked artifact is worse than one that was never claimed.

import { spawnSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertNoSymlinkPath, buildInputDigest, listCompilerFiles, safeRelativePath } from "./build-identity.mjs";
import { acquireBuildLock, attachExecutable, recoverBuildTransaction } from "./build-manifest.mjs";
import { checkBuild } from "./start-lib.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliEntry = path.join(repoRoot, "packages", "ts-shell", "src", "entrypoints", "cli.tsx");
const tsShellManifest = path.join(repoRoot, "packages", "ts-shell", "package.json");
const binDir = path.join(repoRoot, "dist", "bin");
const dist = path.join(repoRoot, "packages", "ts-shell", "dist");

/** Targets this accepts, matching what the bundler can actually emit. */
const TARGETS = new Set([
  "bun-linux-x64",
  "bun-linux-arm64",
  "bun-linux-x64-musl",
  "bun-linux-arm64-musl",
  "bun-darwin-x64",
  "bun-darwin-arm64",
  "bun-windows-x64",
  "bun-windows-arm64",
]);

/** A Bun target names the host when it matches the running platform and arch. */
export function isHostTarget(target, platform = process.platform, arch = process.arch) {
  return target === `${platform}-${arch}` || target === `bun-${platform}-${arch}`;
}

function parseArgs(argv) {
  const options = { target: undefined, outfile: undefined };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--target") {
      const value = argv[index + 1];
      if (!value || !TARGETS.has(value)) {
        console.error(`--target must be one of: ${[...TARGETS].join(", ")}`);
        process.exit(2);
      }
      options.target = value;
      index += 1;
    } else if (token === "--outfile") {
      const value = argv[index + 1];
      if (!value) {
        console.error("--outfile needs a path");
        process.exit(2);
      }
      options.outfile = value;
      index += 1;
    } else {
      console.error(`Unknown argument: ${token}`);
      process.exit(2);
    }
  }
  return options;
}

/** Keep custom outputs in the dedicated executable directory, never a build pointer. */
export function resolveExecutableOutput(root, requested, windows = false) {
  const rootPath = path.resolve(root);
  const outputDirectory = path.join(rootPath, "dist", "bin");
  const outfile = path.resolve(rootPath, requested ?? path.join(outputDirectory, windows ? "cheers.exe" : "cheers"));
  const relative = path.relative(outputDirectory, outfile).split(path.sep).join("/");
  if (!safeRelativePath(relative) || relative.includes("/")) {
    throw new Error("--outfile must name a file directly inside dist/bin");
  }
  return outfile;
}

/** Bun preserves a Windows executable suffix on --outfile instead of appending a second one. */
export function compilerTemporaryPath(outfile, windowsTarget) {
  return `${outfile}.${process.pid}.${randomUUID()}.tmp${windowsTarget ? ".exe" : ""}`;
}

function commandOnPath(command) {
  const extensions = process.platform === "win32"
    ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";").filter(Boolean)
    : [""];
  for (const directory of (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)) {
    for (const extension of extensions) {
      const candidate = path.join(directory, `${command}${extension}`);
      if (!fs.existsSync(candidate)) continue;
      const stat = fs.lstatSync(candidate);
      if (stat.isFile() || stat.isSymbolicLink()) return fs.realpathSync(candidate);
    }
  }
  return undefined;
}

function captureBunProvenance() {
  const executable = commandOnPath("bun");
  if (!executable) throw new Error("bun was not found on PATH");
  const version = spawnSync(executable, ["--version"], { encoding: "utf8", windowsHide: true });
  if (version.error) throw version.error;
  if (version.status !== 0) throw new Error(`bun --version exited ${version.status ?? "unknown"}`);
  const text = version.stdout.trim();
  if (!text) throw new Error("bun --version returned no version");
  return {
    executable,
    name: "bun",
    version: text,
    sha256: createHash("sha256").update(fs.readFileSync(executable)).digest("hex"),
  };
}

async function buildExecutable({ version, name, outfile, target, bunTarget, windowsTarget }) {
  let buildLock;
  try {
    buildLock = acquireBuildLock(repoRoot, dist);
  } catch (error) {
    console.error(`Could not acquire the build lock: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  if (!buildLock) {
    console.error("Another build is in progress; the executable was not built.");
    return 1;
  }

  let temporary;
  try {
    recoverBuildTransaction(repoRoot, dist, { lockOwner: buildLock.owner });
    // Ignore only the existing executable here: a stale or tampered binary is
    // exactly what this command repairs. All TypeScript build inputs still have
    // to match the published manifest.
    const checked = checkBuild({ root: repoRoot, dist, version, executablePolicy: "ignore" });
    if (!checked.ok) {
      console.error(`Build a fresh TypeScript artifact first: ${checked.reason}`);
      return 2;
    }
    const compilerInputs = listCompilerFiles(repoRoot);
    const inputsDigest = buildInputDigest(repoRoot, compilerInputs).digest;
    if (inputsDigest !== checked.manifest.inputsDigest) {
      console.error("Build inputs changed before executable compilation. Run npm run build:ts again.");
      return 2;
    }

    try {
      fs.mkdirSync(path.dirname(outfile), { recursive: true });
      assertNoSymlinkPath(repoRoot, path.dirname(outfile));
    } catch (error) {
      console.error(`The executable output path is unsafe: ${error instanceof Error ? error.message : String(error)}`);
      return 1;
    }
    temporary = compilerTemporaryPath(outfile, windowsTarget);
    const compilerWithPath = captureBunProvenance();
    const { executable: bunExecutable, ...compiler } = compilerWithPath;

    const args = [
      "build",
      cliEntry,
      "--compile",
      "--minify",
      // Baked in so the binary can answer `--version` without a manifest.
      "--define",
      `__CHEERS_BUILD_VERSION__=${JSON.stringify(version)}`,
      "--define",
      `__CHEERS_BUILD_NAME__=${JSON.stringify(name)}`,
      "--outfile",
      temporary,
    ];
    if (bunTarget) args.push("--target", bunTarget);

    const result = spawnSync(bunExecutable, args, { cwd: repoRoot, stdio: "inherit", windowsHide: true });
    if (result.error) {
      // Reported rather than thrown: "bun is not installed" is a setup problem
      // the reader can fix, and a stack trace does not say so.
      console.error(`\nCould not run the bundler: ${result.error.message}`);
      console.error("Install Bun (https://bun.sh) to build a single-file executable.");
      return 3;
    }
    if (result.status !== 0) return result.status ?? 1;

    const afterCompilerInputs = listCompilerFiles(repoRoot);
    const afterDigest = buildInputDigest(repoRoot, afterCompilerInputs).digest;
    if (afterDigest !== inputsDigest || JSON.stringify(afterCompilerInputs) !== JSON.stringify(compilerInputs)) {
      console.error("Build inputs changed during executable compilation; the previous executable was kept.");
      return 1;
    }
    const afterCompiler = captureBunProvenance();
    if (JSON.stringify(afterCompiler) !== JSON.stringify(compilerWithPath)) {
      console.error("The Bun compiler changed during executable compilation; the previous executable was kept.");
      return 1;
    }

    const verification = isHostTarget(target)
      ? { kind: "host", version: runVersion(temporary, version) }
      : { kind: "cross-target" };
    await attachExecutable({
      root: repoRoot,
      dist,
      executable: temporary,
      target,
      expectedBuildId: checked.manifest.buildId,
      expectedInputsDigest: checked.manifest.inputsDigest,
      expectedArtifactDigest: checked.manifest.artifactDigest,
      compiler,
      verification,
      lockOwner: buildLock.owner,
      verifyCandidate: candidate => {
        if (verification.kind === "host") runVersion(candidate, version);
      },
      verify: manifest => {
        const verified = checkBuild({ root: repoRoot, dist, version,
          executablePolicy: verification.kind === "host" ? "required" : "optional" });
        if (!verified.ok) {
          throw new Error(`Published executable failed verification (${verified.state}): ${verified.reason}`);
        }
        if (manifest.executable?.sha256 !== createHash("sha256").update(fs.readFileSync(temporary)).digest("hex")) {
          throw new Error("The published manifest does not point at the compiled executable.");
        }
      },
    });
    installStableExecutable(outfile, temporary);
    temporary = undefined;

    const bytes = fs.statSync(outfile).size;
    console.log(`\nBuilt ${outfile}`);
    console.log(`  version ${version} (baked in)`);
    console.log(`  ${(bytes / 1024 / 1024).toFixed(0)} MB`);
    console.log(`\nCheck it: ${outfile} --version`);
    return 0;
  } catch (error) {
    console.error(`Executable build failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  } finally {
    if (temporary) fs.rmSync(temporary, { force: true });
    buildLock.release();
  }
}

function runVersion(executable, expected) {
  const result = spawnSync(executable, ["--version"], { encoding: "utf8", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Executable --version exited ${result.status ?? "unknown"}.`);
  const actual = result.stdout.trim();
  if (actual !== expected) throw new Error(`Executable --version returned ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}.`);
  return expected;
}

function installStableExecutable(outfile, candidate) {
  const backup = `${outfile}.${process.pid}.${randomUUID()}.previous`;
  let previousMoved = false;
  try {
    if (fs.existsSync(outfile)) {
      const stat = fs.lstatSync(outfile);
      if (stat.isSymbolicLink() || !stat.isFile()) throw new Error("The stable executable target is not a regular file.");
      fs.renameSync(outfile, backup);
      previousMoved = true;
    }
    fs.renameSync(candidate, outfile);
    if (previousMoved) fs.rmSync(backup, { force: true });
  } catch (error) {
    if (previousMoved && !fs.existsSync(outfile)) {
      try { fs.renameSync(backup, outfile); } catch { /* The manifest still points at immutable bytes. */ }
    }
    throw error;
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const manifest = JSON.parse(fs.readFileSync(tsShellManifest, "utf8"));
  const version = typeof manifest.version === "string" ? manifest.version : "0.0.0";
  const name = typeof manifest.name === "string" ? manifest.name : "cheers";
  const isWindowsTarget = (options.target ?? process.platform) === "win32"
    || (options.target ?? "").includes("windows");
  let outfile;
  try {
    outfile = resolveExecutableOutput(repoRoot, options.outfile, isWindowsTarget);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    return 2;
  }
  const target = options.target ?? `${process.platform}-${process.arch}`;
  return buildExecutable({ version, name, outfile, target, bunTarget: options.target, windowsTarget: isWindowsTarget });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
