import { existsSync, lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  assertNoSymlinkPath,
  buildIdFor,
  buildInputDigest,
  REQUIRED_BUILD_ENTRY,
  REQUIRED_BUILD_INDEX,
  REQUIRED_BUILD_ASSETS,
  REQUIRED_BUILD_LAUNCHER,
  REQUIRED_PACKAGE_MAIN,
  safeRelativePath,
  snapshotDirectory,
  snapshotFile,
} from "./build-identity.mjs";

const SHA256 = /^[a-f0-9]{64}$/;

/** Keep launcher-level Node options on the verified child without duplicating its inspector. */
export function launchArgs(entry, args, execArgv = process.execArgv) {
  const options = [];
  for (let index = 0; index < execArgv.length; index += 1) {
    const option = execArgv[index];
    if (option === "--inspect" || option === "--inspect-brk" || option === "--inspect-wait"
      || option === "--inspect-brk-node" || option.startsWith("--inspect=")
      || option.startsWith("--inspect-brk=") || option.startsWith("--inspect-wait=")
      || option.startsWith("--inspect-brk-node=")) continue;
    if (option === "--inspect-port" || option === "--inspect-publish-uid") {
      index += 1;
      continue;
    }
    if (option.startsWith("--inspect-port=") || option.startsWith("--inspect-publish-uid=")) continue;
    options.push(option);
  }
  return [...options, entry, ...args];
}

function validArtifact(artifact, prefix) {
  if (!artifact || typeof artifact !== "object" || !safeRelativePath(artifact.path)
    || !artifact.path.startsWith(prefix) || !Number.isSafeInteger(artifact.size) || artifact.size < 0
    || !SHA256.test(artifact.sha256)) return false;
  return safeRelativePath(artifact.path.slice(prefix.length));
}

function validLauncher(launcher) {
  return launcher && typeof launcher === "object"
    && launcher.path === REQUIRED_BUILD_LAUNCHER
    && Number.isSafeInteger(launcher.size) && launcher.size >= 0
    && SHA256.test(launcher.sha256);
}

function validPackageMain(packageMain) {
  return packageMain && typeof packageMain === "object"
    && packageMain.path === REQUIRED_PACKAGE_MAIN
    && Number.isSafeInteger(packageMain.size) && packageMain.size >= 0
    && SHA256.test(packageMain.sha256);
}

function validExecutable(executable) {
  return executable && typeof executable === "object"
    && safeRelativePath(executable.path)
    && executable.path.startsWith("dist/executables/")
    && Number.isSafeInteger(executable.size) && executable.size > 0
    && SHA256.test(executable.sha256)
    && typeof executable.target === "string" && /^[a-z0-9-]+$/.test(executable.target)
    && executable.compiler && typeof executable.compiler === "object"
    && executable.compiler.name === "bun"
    && typeof executable.compiler.version === "string" && executable.compiler.version.length > 0
    && SHA256.test(executable.compiler.sha256)
    && typeof executable.builtAt === "string" && !Number.isNaN(Date.parse(executable.builtAt))
    && executable.verification && typeof executable.verification === "object"
    && (executable.verification.kind === "cross-target"
      || (executable.verification.kind === "host"
        && typeof executable.verification.version === "string" && executable.verification.version.length > 0));
}

function validCompilerInput(file) {
  return safeRelativePath(file);
}

function targetMatchesHost(target) {
  return target === `${process.platform}-${process.arch}` || target === `bun-${process.platform}-${process.arch}`;
}

function readManifest(dist) {
  const file = path.join(dist, "build-manifest.json");
  if (!existsSync(file)) return { state: "missing" };
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (!parsed || typeof parsed !== "object" || parsed.schemaVersion !== 2
      || typeof parsed.name !== "string" || !parsed.name
      || typeof parsed.version !== "string" || typeof parsed.mode !== "string" || !parsed.mode
      || typeof parsed.builtAt !== "string" || typeof parsed.node !== "string"
      || !SHA256.test(parsed.buildId) || !SHA256.test(parsed.inputsDigest) || !SHA256.test(parsed.artifactDigest)
      || !safeRelativePath(parsed.entry) || !validLauncher(parsed.launcher)
      || !validPackageMain(parsed.packageMain)
      || (parsed.executable !== undefined && !validExecutable(parsed.executable))
      || (parsed.executable?.verification?.kind === "host" && parsed.executable.verification.version !== parsed.version)
      || !Array.isArray(parsed.compilerInputs) || parsed.compilerInputs.some(file => !validCompilerInput(file))
      || !Array.isArray(parsed.artifacts) || parsed.artifacts.length === 0) return { state: "truncated" };
    const prefix = `builds/${parsed.buildId}/`;
    if (parsed.entry !== `${prefix}${REQUIRED_BUILD_ENTRY}`) return { state: "truncated" };
    const paths = new Set();
    for (const artifact of parsed.artifacts) {
      if (!validArtifact(artifact, prefix) || paths.has(artifact.path)) return { state: "truncated" };
      paths.add(artifact.path);
    }
    if (!paths.has(parsed.entry) || !paths.has(`${prefix}${REQUIRED_BUILD_INDEX}`)
      || REQUIRED_BUILD_ASSETS.some(asset => !paths.has(`${prefix}${asset}`))) return { state: "truncated" };
    const expectedBuildId = buildIdFor({
      version: parsed.version,
      inputsDigest: parsed.inputsDigest,
      node: parsed.node,
      mode: parsed.mode,
    });
    if (expectedBuildId !== parsed.buildId) return { state: "truncated" };
    return { state: "present", manifest: parsed };
  } catch {
    return { state: "truncated" };
  }
}

function artifactError(state, reason) {
  return { ok: false, state, reason };
}

/**
 * Whether the immutable build selected by the manifest may run.
 *
 * `optional` verifies a recorded executable when present, `required` also
 * requires one, and `ignore` exists only for rebuilding a broken executable.
 */
export function checkBuild({ root, dist, version, executablePolicy = "optional" }) {
  if (!["optional", "required", "ignore"].includes(executablePolicy)) {
    return artifactError("invalid-policy", `Unknown executable verification policy: ${String(executablePolicy)}`);
  }
  try {
    assertNoSymlinkPath(root, path.join(dist, "build-manifest.json"));
  } catch (error) {
    return artifactError("invalid-path", `The build manifest path is unsafe: ${error instanceof Error ? error.message : String(error)}`);
  }
  const manifest = readManifest(dist);
  if (manifest.state !== "present") {
    return {
      ok: false,
      state: manifest.state,
      reason: manifest.state === "missing"
        ? "No verified build was found. Run npm run build:ts."
        : "The build manifest is unreadable, outdated, or inconsistent. Rebuild with npm run build:ts.",
    };
  }
  const built = manifest.manifest;
  if (built.version !== version) {
    return { ok: false, state: "version-mismatch", reason: `The build was made for version ${built.version}, but the package is ${version}. Run npm run build:ts.` };
  }
  const buildRoot = path.join(dist, "builds", built.buildId);
  if (!existsSync(buildRoot)) return artifactError("missing-artifact", "The immutable build directory is missing. Run npm run build:ts.");
  const buildRootStat = lstatSync(buildRoot);
  if (buildRootStat.isSymbolicLink()) return artifactError("invalid-path", "The immutable build directory is a symlink. Rebuild with npm run build:ts.");
  if (!buildRootStat.isDirectory()) return artifactError("missing-artifact", "The immutable build directory is not a directory. Run npm run build:ts.");
  try {
    assertNoSymlinkPath(root, buildRoot);
  } catch (error) {
    return artifactError("invalid-path", `The immutable build path is unsafe: ${error instanceof Error ? error.message : String(error)}`);
  }
  const entry = path.resolve(dist, built.entry);
  const entryRelative = path.relative(buildRoot, entry).split(path.sep).join("/");
  if (!safeRelativePath(entryRelative)) {
    return artifactError("invalid-entry", "The build entry escapes its immutable build directory. Rebuild with npm run build:ts.");
  }
  let inputsDigest;
  try {
    inputsDigest = buildInputDigest(root, built.compilerInputs).digest;
  } catch (error) {
    return artifactError("invalid-inputs", `Build inputs cannot be verified: ${error instanceof Error ? error.message : String(error)}. Run npm install and npm run build:ts.`);
  }
  if (inputsDigest !== built.inputsDigest) {
    return { ok: false, state: "stale", reason: `Build inputs changed after the build (${built.buildId.slice(0, 12)}). Run npm run build:ts.` };
  }
  let snapshot;
  try {
    snapshot = snapshotDirectory(buildRoot);
  } catch (error) {
    return artifactError("artifact-mismatch", `The immutable build cannot be read safely: ${error instanceof Error ? error.message : String(error)}`);
  }
  let launcher;
  try {
    assertNoSymlinkPath(root, path.join(root, built.launcher.path));
    launcher = snapshotFile(path.join(root, built.launcher.path), built.launcher.path);
  } catch (error) {
    return artifactError("launcher-mismatch", `The CLI launcher cannot be verified: ${error instanceof Error ? error.message : String(error)}`);
  }
  const expectedMain = `export * from "./builds/${built.buildId}/${REQUIRED_BUILD_INDEX}";\n`;
  let packageMain;
  try {
    assertNoSymlinkPath(root, path.join(root, built.packageMain.path));
    packageMain = snapshotFile(path.join(root, built.packageMain.path), built.packageMain.path);
    if (readFileSync(path.join(root, built.packageMain.path), "utf8") !== expectedMain) {
      return artifactError("package-main-mismatch", "The package main pointer does not match the verified build. Rebuild with npm run build:ts.");
    }
  } catch (error) {
    return artifactError("package-main-mismatch", `The package main pointer cannot be verified: ${error instanceof Error ? error.message : String(error)}`);
  }
  const artifactPrefix = `builds/${built.buildId}/`;
  const expectedArtifacts = built.artifacts.map(artifact => ({
    ...artifact,
    path: artifact.path.slice(artifactPrefix.length),
  }));
  if (snapshot.digest !== built.artifactDigest || snapshot.artifacts.length !== built.artifacts.length
    || snapshot.artifacts.some((artifact, index) => {
      const expected = expectedArtifacts[index];
      return !expected || artifact.path !== expected.path || artifact.size !== expected.size || artifact.sha256 !== expected.sha256;
    })) {
    return artifactError("artifact-mismatch", "The immutable build bytes do not match the manifest. Rebuild with npm run build:ts.");
  }
  if (launcher.size !== built.launcher.size || launcher.sha256 !== built.launcher.sha256) {
    return artifactError("launcher-mismatch", "The CLI launcher does not match the verified build. Rebuild with npm run build:ts.");
  }
  if (packageMain.size !== built.packageMain.size || packageMain.sha256 !== built.packageMain.sha256) {
    return artifactError("package-main-mismatch", "The package main pointer bytes do not match the manifest. Rebuild with npm run build:ts.");
  }
  if (built.executable === undefined && executablePolicy === "required") {
    return artifactError("missing-executable", "The published build has no verified single-file executable. Run npm run build:exe.");
  }
  if (built.executable?.verification?.kind === "cross-target" && executablePolicy === "required") {
    return artifactError("executable-unverified",
      "The published executable was cross-compiled and has not run on this host. Run npm run build:exe for the host target.");
  }
  if (built.executable?.verification?.kind === "host" && !targetMatchesHost(built.executable.target)) {
    return artifactError("executable-unverified",
      "The published executable claims host verification for a different target. Run npm run build:exe for this host.");
  }
  if (built.executable !== undefined && executablePolicy !== "ignore") {
    let executable;
    try {
      assertNoSymlinkPath(root, path.join(root, built.executable.path));
      executable = snapshotFile(path.join(root, built.executable.path), built.executable.path);
    } catch (error) {
      return artifactError("executable-mismatch", `The single-file executable cannot be verified: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (executable.size !== built.executable.size || executable.sha256 !== built.executable.sha256) {
      return artifactError("executable-mismatch", "The single-file executable does not match the verified build. Run npm run build:exe.");
    }
  }
  return { ok: true, state: "fresh", manifest: built, entry, executable: built.executable };
}
