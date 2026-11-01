import process from "node:process";
import { getRuntimeConfig } from "../config/runtimeConfig.js";
import { constrainRuntimeConfig } from "../config/constraints.js";
import { loadCatalogSnapshot } from "../core/models/catalogStore.js";
import { resolveProviderCredential } from "../core/shell/providerCredentials.js";
import { getWorkflowGitContext } from "../workflow/gitContext.js";

export function printCliDoctor(targetCwd: string, launchCwd: string): void {
  const runtimeConfig = getRuntimeConfig(targetCwd);
  const gitContext = getWorkflowGitContext(targetCwd);
  // The loader's diagnostics describe what the files said. Whether the result
  // can actually serve a request is a second question, answered against the
  // model catalogue by the same function the runtime publishes with. Reading
  // only the first left doctor silent about exactly the failures that stop a
  // start, so the one tool a blocked user can run reported nothing wrong.
  const catalog = loadCatalogSnapshot();
  const constrained = constrainRuntimeConfig(runtimeConfig,
    resolveProviderCredential({ runtimeConfig, pool: {} }), catalog.providers);
  console.log("Cheers CLI Doctor");
  console.log(`Node: ${process.version}`);
  console.log("Execution path: ts-local");
  console.log(`Provider: ${runtimeConfig.provider}`);
  console.log(`Max turns: ${runtimeConfig.maxTurns}`);
  console.log(
    `Config sources: ${runtimeConfig.configSources.join(", ") || "none"}`,
  );
  // The one place a skipped config file is visible without a stack trace. A
  // setting that appears to have been ignored is the symptom; this is the
  // explanation.
  for (const diagnostic of constrained.configDiagnostics) {
    console.log(`Config problem: ${diagnostic}`);
  }
  for (const diagnostic of catalog.diagnostics) {
    console.log(`Catalogue problem: ${diagnostic}`);
  }
  // A refusal at startup is the answer to "why will it not run", so doctor says
  // the same thing the start would, rather than leaving the user to start it and
  // read the refusal there.
  console.log(constrained.configValidation.valid
    ? "Config usable for requests: yes"
    : "Config usable for requests: no");
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
