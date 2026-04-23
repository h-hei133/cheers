import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

function hasNonInteractivePrintFlag(args) {
  return args.includes("--print") || args.includes("-p");
}

function main() {
  const runnerArgs = process.argv.slice(2);
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error(
      "Interactive live runner requires a real TTY (stdin/stdout). Default automation remains non-TTY by design.",
    );
    process.exit(2);
  }
  if (hasNonInteractivePrintFlag(runnerArgs)) {
    console.error(
      "Interactive live runner does not accept --print/-p. Use default start flow for non-interactive batch mode.",
    );
    process.exit(2);
  }

  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, "..");
  const shellCwd = path.join(repoRoot, "packages", "ts-shell");
  const tsxCliPath = path.join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const cliEntrypoint = "src/entrypoints/cli.tsx";

  const child = spawn(
    process.execPath,
    [tsxCliPath, cliEntrypoint, ...runnerArgs],
    {
      cwd: shellCwd,
      env: process.env,
      stdio: "inherit",
      windowsHide: false,
    },
  );

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 0);
  });

  child.on("error", (error) => {
    console.error(
      `Failed to launch interactive live runner: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  });
}

main();
