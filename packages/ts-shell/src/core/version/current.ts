import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The version this build is.
 *
 * Read from the package manifest rather than written down here. A constant and a
 * manifest drift the moment either is bumped, and the one that drifts is always
 * the constant — the manifest is what a release tool edits. The previous
 * hardcoded string had already fallen behind the manifest it described.
 *
 * Resolved by walking up from this module rather than by trusting the working
 * directory: a session runs from wherever the user opened it, and a relative
 * lookup would find some other project's manifest or none at all.
 */

let cached: string | undefined;

/**
 * Values a build baked in, when the build baked any in.
 *
 * A single-file executable has no manifest to walk up to: `import.meta.url`
 * points inside the runtime's virtual filesystem (`/$bunfs/...`), so the walk
 * below finds nothing and the binary reports "version unknown" — measured, not
 * assumed. The build replaces these identifiers with literals, so a compiled
 * binary answers from itself.
 *
 * `typeof` is applied to the identifier *directly*, and that is load-bearing.
 * Under `tsx` and `node` the identifiers are not declared at all, and
 * `typeof someUndeclaredName` is the only form that reads one without throwing.
 * Handing the identifier to a helper instead — `bakedValue(__CHEERS_BUILD_VERSION__)`
 * — evaluates it as an argument, which throws before any guard inside the helper
 * can run. That mistake was made here and shipped: a build whose manifest was
 * unreachable threw `ReferenceError: __CHEERS_BUILD_VERSION__ is not defined`
 * from `packageVersion()` instead of returning `undefined`.
 */
declare const __CHEERS_BUILD_VERSION__: string | undefined;
declare const __CHEERS_BUILD_NAME__: string | undefined;

/** A baked-in value, or `undefined` when the build supplied none. */
const bakedVersion: string | undefined =
  typeof __CHEERS_BUILD_VERSION__ === "string" && __CHEERS_BUILD_VERSION__.trim() !== ""
    ? __CHEERS_BUILD_VERSION__.trim()
    : undefined;

const bakedName: string | undefined =
  typeof __CHEERS_BUILD_NAME__ === "string" && __CHEERS_BUILD_NAME__.trim() !== ""
    ? __CHEERS_BUILD_NAME__.trim()
    : undefined;

/** The manifest fields this needs. */
interface PackageManifest {
  readonly name?: unknown;
  readonly version?: unknown;
}

function manifestPath(): string | undefined {
  let directory = path.dirname(fileURLToPath(import.meta.url));
  // Four levels: this file sits under src/<area>/<sub>/, and the build output
  // keeps the same depth, so one walk serves both.
  for (let depth = 0; depth < 6; depth += 1) {
    const candidate = path.join(directory, "package.json");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
  return undefined;
}

function readManifest(): PackageManifest | undefined {
  const file = manifestPath();
  if (!file) return undefined;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as PackageManifest;
  } catch {
    // A manifest that will not parse is a broken install, not a broken session.
    // Reporting no version is the honest answer; inventing one is not.
    return undefined;
  }
}

/**
 * The version string, or `undefined` when no manifest can be read.
 *
 * Absent rather than defaulted to a placeholder: a made-up version would be
 * compared against a published release and produce an update prompt for a build
 * that does not exist.
 */
export function packageVersion(): string | undefined {
  if (cached !== undefined) return cached || undefined;
  const fromManifest = readManifest()?.version;
  // Manifest first, because it is what a release tool edits and a stale baked-in
  // constant is exactly the drift this module was written to avoid. The build
  // constant only answers where no manifest is reachable.
  const version =
    typeof fromManifest === "string" && fromManifest.trim() !== ""
      ? fromManifest.trim()
      : bakedVersion;
  cached = version ?? "";
  return version;
}

/** The package name, for a user agent that says who is asking. */
export function packageName(): string | undefined {
  const fromManifest = readManifest()?.name;
  if (typeof fromManifest === "string" && fromManifest.trim() !== "") return fromManifest.trim();
  return bakedName;
}

/**
 * What this build calls itself, for `--version`.
 *
 * Falls back to a name without a version rather than to a fabricated one, so a
 * build that cannot find its manifest still says what it is.
 */
export function versionLabel(): string {
  const version = packageVersion();
  return version ?? "version unknown";
}
