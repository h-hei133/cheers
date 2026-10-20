import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkBuild, launchArgs } from "./start-lib.mjs";
import { recoverBuildTransaction } from "./build-manifest.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "packages/ts-shell/package.json"), "utf8"));
let result;
try {
  const dist = path.join(root, "packages/ts-shell/dist");
  recoverBuildTransaction(root, dist);
  result = checkBuild({ root, dist, version: pkg.version });
} catch (error) {
  result = { ok: false, reason: `the verified build could not be checked: ${error instanceof Error ? error.message : String(error)}` };
}
if (!result.ok) {
  console.error(`Cheers: ${result.reason}`);
  process.exit(1);
}
const child = spawn(process.execPath, launchArgs(result.entry, process.argv.slice(2)), {
  stdio: "inherit",
  cwd: process.cwd(),
});
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => child.kill(signal));
child.on("error", error => {
  console.error(`Cheers: could not start the verified build: ${error.message}`);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
