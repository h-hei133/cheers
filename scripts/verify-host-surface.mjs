import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, "..");
const packagePath = path.join(repoRoot, "packages", "ts-shell", "package.json");
const cliPath = path.join(
  repoRoot,
  "packages",
  "ts-shell",
  "dist",
  "packages",
  "ts-shell",
  "src",
  "entrypoints",
  "cli.js",
);

const packageMetadata = JSON.parse(readFileSync(packagePath, "utf8"));
const failures = [];
const packageEntry = path.join(
  repoRoot,
  "packages",
  "ts-shell",
  "dist",
  "packages",
  "ts-shell",
  "src",
  "index.js",
);

if (packageMetadata.main !== "./dist/packages/ts-shell/src/index.js") {
  failures.push("package main entry is not stable");
}
if (!packageMetadata.bin?.agents) {
  failures.push("package cli entrypoint is missing");
}
if (!existsSync(cliPath)) {
  failures.push("built cli entrypoint is missing; run package build first");
}
if (!existsSync(packageEntry)) {
  failures.push("built package entrypoint is missing; run package build first");
}

const hostSurface = existsSync(packageEntry)
  ? await import(packageEntry)
  : undefined;
const host = hostSurface?.createHostRuntime?.();
const happyResponse = host
  ? await host.dispatch({
    action: "start-turn",
    inputText: "read a safe file through host surface",
    mode: "read-only",
    providerMode: "synthetic",
    correlationId: "verify-host-surface",
  })
  : undefined;
const happy = happyResponse && hostSurface
  ? hostSurface.projectHostJsonResponse({ response: happyResponse })
  : undefined;

if (typeof hostSurface?.createHostRuntime !== "function") {
  failures.push("package import did not expose host runtime");
}
if (typeof hostSurface?.projectHostJsonResponse !== "function") {
  failures.push("package import did not expose host json projection");
}
if (typeof hostSurface?.runEvaluationCase !== "function") {
  failures.push("package import did not expose host evaluation runner");
}
if (happy?.schemaVersion !== "host-json-response.v1") {
  failures.push("happy host command did not emit stable json schema");
}
if (happy?.events?.length < 1) {
  failures.push("happy host command did not emit structured events");
}
if (happy?.terminalSuccessClaim !== false) {
  failures.push("host json output claimed terminal success");
}
if (happy?.exit?.classification !== "completed-without-proof") {
  failures.push("happy host command did not preserve missing proof classification");
}

const providerBlockedResponse = host
  ? await host.dispatch({
  action: "start-turn",
    inputText: "live provider should stay blocked",
  mode: "read-only",
  providerMode: "real",
  correlationId: "verify-provider-blocked",
  })
  : undefined;
const providerBlocked = providerBlockedResponse && hostSurface
  ? hostSurface.projectHostJsonResponse({ response: providerBlockedResponse })
  : undefined;
if (!providerBlocked?.blockers?.some((blocker) => blocker.kind === "provider-blocked")) {
  failures.push("live provider command was not blocked");
}
if (providerBlocked?.exit?.classification !== "blocked") {
  failures.push("live provider command did not receive blocked exit classification");
}
const evaluation = hostSurface?.runEvaluationCase && host
  ? await hostSurface.runEvaluationCase({
    caseId: "read-only-tool-loop",
    dispatch: host.dispatch,
  })
  : undefined;
if (evaluation?.scenarioId !== "read-only-tool-loop") {
  failures.push("evaluation case did not run through package host surface");
}
if (evaluation?.terminalSuccessClaim !== false) {
  failures.push("evaluation case claimed terminal success");
}

const serialized = JSON.stringify({ happy, providerBlocked, evaluation });
if (/private-agents-real|RAW_OLD_TEXT_SHOULD_NOT_LEAK|RAW_NEW_TEXT_SHOULD_NOT_LEAK|oldText:RAW|newText:RAW|hidden reasoning/i.test(serialized)) {
  failures.push("host surface output leaked unsafe content");
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`host-surface-check failed: ${failure}`);
  }
  process.exit(1);
}

console.log("host-surface-check passed");
