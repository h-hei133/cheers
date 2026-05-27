import process from "node:process";
import { getRuntimeConfig } from "../config/runtimeConfig.js";
import { isRustDaemonEnabled } from "../daemon/client.js";
import { getWorkflowGitContext } from "../workflow/gitContext.js";

export function printCliDoctor(targetCwd: string, launchCwd: string): void {
  const runtimeConfig = getRuntimeConfig(targetCwd);
  const gitContext = getWorkflowGitContext(targetCwd);
  console.log("Private Coding Agents CLI Doctor");
  console.log(`Node: ${process.version}`);
  console.log(
    `Execution path: ${isRustDaemonEnabled() ? "rust-daemon" : "ts-local"}`,
  );
  console.log(`Provider: ${runtimeConfig.provider}`);
  console.log(`Max turns: ${runtimeConfig.maxTurns}`);
  console.log(
    `Config sources: ${runtimeConfig.configSources.join(", ") || "none"}`,
  );
  console.log(`Launch directory: ${launchCwd}`);
  console.log(`Target workspace: ${targetCwd}`);
  if (gitContext.insideGit) {
    console.log(`Git branch: ${gitContext.branch ?? "unknown"}`);
    console.log(`Workspace clean: ${gitContext.isClean ? "yes" : "no"}`);
    console.log(`Git root: ${gitContext.root ?? "unknown"}`);
  }
  console.log(
    "Tip: run `npm run doctor` from the repo root for full environment diagnostics.",
  );
}
