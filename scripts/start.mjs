import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { checkBuild } from "./start-lib.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "packages/ts-shell/package.json"), "utf8"));
const result = checkBuild({ root, dist: path.join(root, "packages/ts-shell/dist"), version: pkg.version });
if (!result.ok) {
  console.error(`Cheers: ${result.reason}`);
  process.exit(1);
}
const child = spawn(process.execPath, [result.entry, ...process.argv.slice(2)], { stdio: "inherit", cwd: process.cwd() });
for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
