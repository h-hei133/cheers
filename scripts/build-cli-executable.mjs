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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cliEntry = path.join(repoRoot, "packages", "ts-shell", "src", "entrypoints", "cli.tsx");
const tsShellManifest = path.join(repoRoot, "packages", "ts-shell", "package.json");
const outDir = path.join(repoRoot, "dist", "bin");

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

const options = parseArgs(process.argv.slice(2));

const manifest = JSON.parse(fs.readFileSync(tsShellManifest, "utf8"));
const version = typeof manifest.version === "string" ? manifest.version : "0.0.0";
const name = typeof manifest.name === "string" ? manifest.name : "cheers";

const isWindowsTarget = (options.target ?? process.platform) === "win32"
  || (options.target ?? "").includes("windows");
const outfile = options.outfile
  ?? path.join(outDir, isWindowsTarget ? "cheers.exe" : "cheers");

fs.mkdirSync(path.dirname(outfile), { recursive: true });

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
  outfile,
];
if (options.target) args.push("--target", options.target);

const result = spawnSync("bun", args, { cwd: repoRoot, stdio: "inherit", windowsHide: true });

if (result.error) {
  // Reported rather than thrown: "bun is not installed" is a setup problem the
  // reader can fix, and a stack trace does not say so.
  console.error(`\nCould not run the bundler: ${result.error.message}`);
  console.error("Install Bun (https://bun.sh) to build a single-file executable.");
  process.exit(3);
}
if (result.status !== 0) process.exit(result.status ?? 1);

const bytes = fs.statSync(outfile).size;
console.log(`\nBuilt ${outfile}`);
console.log(`  version ${version} (baked in)`);
console.log(`  ${(bytes / 1024 / 1024).toFixed(0)} MB`);
console.log(`\nCheck it: ${outfile} --version`);
