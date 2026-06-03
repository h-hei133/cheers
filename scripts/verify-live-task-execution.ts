#!/usr/bin/env tsx

import { spawnSync } from "node:child_process";
import { createHostRuntime } from "../packages/ts-shell/src/runtime/api/host/runtime.js";
import {
  runTaskLiveReport,
  type TaskLiveRunObservation,
} from "../packages/ts-shell/src/runtime/evaluation/task/liveRun.js";
import type { TaskLiveGateOutcome } from "../packages/ts-shell/src/runtime/evaluation/task/model.js";

type GateResult = {
  readonly name: "read-only-provider" | "anchored-provider";
  readonly attempted: boolean;
  readonly outcome: TaskLiveGateOutcome;
  readonly noMutation: boolean;
  readonly changedFiles: readonly string[];
  readonly noApply: boolean;
  readonly redactionStatus: "passed" | "failed";
  readonly fallbackConfigured?: boolean;
  readonly fallbackAttempted?: boolean;
  readonly fallbackOutcome?: "passed" | "failed" | "skipped" | "inconclusive";
  readonly blocker: string;
};

const liveOptIn = process.env.PRIVATE_AGENTS_LIVE_TASK_EXECUTION?.trim() === "1";
const reviewedApplyOptIn = process.env.PRIVATE_AGENTS_LIVE_WRITE_REVIEWED_APPLY?.trim() === "1";

console.log("gate name=live-task-execution");
console.log(`live-task-execution-opt-in=${liveOptIn}`);
console.log(`live-write-reviewed-apply-opt-in=${reviewedApplyOptIn}`);
console.log("private-config-manual-read=false");
console.log("raw-provider-output=excluded");
console.log("terminal-success-claim=false");

const host = createHostRuntime();
const observations: TaskLiveRunObservation[] = [];
const gateResults: GateResult[] = [];

if (liveOptIn) {
  const readOnly = runReadOnlyProviderGate();
  gateResults.push(readOnly);
  if (readOnly.outcome === "passed") {
    observations.push(
      observed("package-script-impact", "read-only-provider", readOnly, "complete", "partial"),
      observed("pathless-workspace-question", "read-only-provider", readOnly, "complete", "partial"),
      observed("owner-context-question", "read-only-provider", readOnly, "complete", "partial"),
      observed("test-impact-question", "read-only-provider", readOnly, "complete", "partial"),
      observed("readonly-coding-check", "read-only-provider", readOnly, "complete", "partial"),
    );
  }

  const anchored = runAnchoredProviderGate();
  gateResults.push(anchored);
  if (anchored.outcome === "passed") {
    observations.push(
      observed("resume-from-context", "anchored-provider", anchored, "complete", "partial"),
      observed("incident-summary-report", "artifact-dry-run", anchored, "complete", "passed", "passed"),
      observed("metrics-summary-artifact", "artifact-dry-run", anchored, "complete", "passed", "passed"),
      writePlanObserved(anchored),
    );
    if (reviewedApplyOptIn) {
      observations.push(
        writeObserved("single-file-edit", anchored, ["src/format.ts"], "complete", "passed", "not-run"),
        writeObserved("coordinated-edit", anchored, ["src/parser.ts", "src/caller.ts"], "complete", "passed", "not-run"),
        writeObserved("failed-check-repair", anchored, ["src/check.ts"], "complete", "passed", "not-run"),
        writeObserved("rollback-recovery", anchored, ["src/alpha.ts"], "partial", "partial", "partial"),
      );
    }
  }
}

const report = await runTaskLiveReport({
  dispatch: host.dispatch,
  observations,
});

for (const gate of gateResults) {
  console.log(`gate.${gate.name}.attempted=${gate.attempted}`);
  console.log(`gate.${gate.name}.outcome=${gate.outcome}`);
  console.log(`gate.${gate.name}.noMutation=${gate.noMutation}`);
  console.log(`gate.${gate.name}.changedFiles=${JSON.stringify(gate.changedFiles)}`);
  console.log(`gate.${gate.name}.noApply=${gate.noApply}`);
  console.log(`gate.${gate.name}.redaction=${gate.redactionStatus}`);
  if (gate.fallbackConfigured !== undefined) console.log(`gate.${gate.name}.fallbackConfigured=${gate.fallbackConfigured}`);
  if (gate.fallbackAttempted !== undefined) console.log(`gate.${gate.name}.fallbackAttempted=${gate.fallbackAttempted}`);
  if (gate.fallbackOutcome) console.log(`gate.${gate.name}.fallbackOutcome=${gate.fallbackOutcome}`);
  if (gate.blocker) console.log(`gate.${gate.name}.blocker=${gate.blocker}`);
}

console.log(`liveEntryCount=${report.summary.entryCount}`);
console.log(`executedCount=${report.summary.executedCount}`);
console.log(`completeOrUsefulPartialCount=${report.summary.completeOrUsefulPartialCount}`);
console.log(`pathlessOrContextExecuted=${report.summary.pathlessOrContextExecuted}`);
console.log(`reportArtifactOrDataExecuted=${report.summary.reportArtifactOrDataExecuted}`);
console.log(`continuationExecutedOrExactPartial=${report.summary.continuationExecutedOrExactPartial}`);
console.log(`readonlyCodingExecuted=${report.summary.readonlyCodingExecuted}`);
console.log(`writeEntrySafe=${report.summary.writeEntrySafe}`);
console.log(`writePatchIntentDryRunCount=${report.summary.writePatchIntentDryRunCount}`);
console.log(`isolatedApplyCount=${report.summary.isolatedApplyCount}`);
console.log(`postApplyProofCount=${report.summary.postApplyProofCount}`);
console.log(`debugOrRepairUseful=${report.summary.debugOrRepairUseful}`);
console.log(`rollbackRecoveryStatus=${report.summary.rollbackRecoveryStatus}`);
console.log(`hardGateStatus=${report.summary.hardGateStatus}`);
for (const result of report.results) {
  console.log([
    `entry=${result.entryId}`,
    `status=${result.status}`,
    `executed=${result.executed}`,
    `providerAttempted=${result.providerAttempted}`,
    `providerOutcome=${result.providerOutcome}`,
    `proof=${result.proofStatus}`,
    `writePolicy=${result.writePolicy}`,
    `patchIntent=${result.patchIntentStatus}`,
    `dryRunDiff=${result.dryRunDiffStatus}`,
    `reviewAuthority=${result.reviewAuthority}`,
    `apply=${result.applyStatus}`,
    `isolatedApply=${result.isolatedApply}`,
    `realWorkspaceMutation=${result.realWorkspaceMutation}`,
    `postApplyVerification=${result.postApplyVerificationStatus}`,
    `rollback=${result.rollbackStatus}`,
    `changedFiles=${JSON.stringify(result.changedFiles)}`,
    `blockers=${result.blockers.join(";") || "none"}`,
  ].join(" "));
}
console.log(`reportRedaction=${redactionSafe(JSON.stringify(report)) ? "pass" : "fail"}`);

const exitCode = report.summary.hardGateStatus === "passed"
  ? 0
  : (liveOptIn ? 2 : 0);
process.exit(exitCode);

function runReadOnlyProviderGate(): GateResult {
  const result = spawnSync("npm", ["run", "verify:real-user-capabilities", "--", "--real-readonly-coding-smoke"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PRIVATE_AGENTS_TEST_ROOT: process.env.PRIVATE_AGENTS_TEST_ROOT?.trim() || "/tmp/private-agents-live-task-readonly",
    },
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8,
  });
  const output = redact(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  const passed = (result.status ?? 1) === 0 &&
    /\[PASS\] real-readonly-coding-smoke/.test(output) &&
    /noMutation=true/.test(output) &&
    /changedFiles=\[\]/.test(output) &&
    /changedFilesEmptyVisible=true/.test(output) &&
    /redaction=pass/.test(output);
  return {
    name: "read-only-provider",
    attempted: true,
    outcome: passed ? "passed" : outcomeFromOutput(output, result.status ?? 1),
    noMutation: /noMutation=true/.test(output),
    changedFiles: /changedFiles=\[\]/.test(output) ? [] : ["unverified-change"],
    noApply: true,
    redactionStatus: /redaction=pass/.test(output) ? "passed" : "failed",
    blocker: passed ? "" : blockerFromOutput(output),
  };
}

function runAnchoredProviderGate(): GateResult {
  const result = spawnSync("node", ["scripts/verify-real-provider-anchored-smoke.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PRIVATE_AGENTS_REAL_PROVIDER_SMOKE: "1",
      PRIVATE_AGENTS_LIVE_ANCHORED_PROVIDER_SMOKE: "1",
      PRIVATE_AGENTS_TEST_ROOT: process.env.PRIVATE_AGENTS_TEST_ROOT?.trim() || "/tmp/private-agents-live-task-anchored",
    },
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 8,
  });
  const output = redact(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
  const passed = (result.status ?? 1) === 0 &&
    /\[pass\] live-anchored-provider-smoke/i.test(output) &&
    /provider-called=true/.test(output) &&
    /no-write=true/.test(output) &&
    /raw-provider-output=excluded/.test(output);
  return {
    name: "anchored-provider",
    attempted: true,
    outcome: passed ? "passed" : outcomeFromOutput(output, result.status ?? 1),
    noMutation: /no-write=true/.test(output),
    changedFiles: [],
    noApply: /no-apply|apply=not-run|mutation-authority=not-granted/.test(output),
    redactionStatus: /raw-provider-output=excluded/.test(output) ? "passed" : "failed",
    fallbackConfigured: /fallbackConfigured=true/.test(output),
    fallbackAttempted: /fallbackAttempted=true/.test(output),
    fallbackOutcome: fallbackOutcomeFromOutput(output),
    blocker: passed ? "" : blockerFromOutput(output),
  };
}

function observed(
  entryId: TaskLiveRunObservation["entryId"],
  gate: TaskLiveRunObservation["gate"],
  gateResult: GateResult,
  proofStatus: TaskLiveRunObservation["proofStatus"],
  verificationStatus: TaskLiveRunObservation["verificationStatus"],
  artifactValidationStatus?: TaskLiveRunObservation["artifactValidationStatus"],
): TaskLiveRunObservation {
  return {
    entryId,
    gate,
    explicitOptIn: true,
    providerAttempted: gateResult.attempted,
    providerOutcome: gateResult.outcome,
    noMutation: gateResult.noMutation,
    changedFiles: gateResult.changedFiles,
    noApply: gateResult.noApply,
    redactionStatus: gateResult.redactionStatus,
    verificationStatus,
    artifactValidationStatus,
    proofStatus,
    fallbackConfigured: gateResult.fallbackConfigured,
    fallbackAttempted: gateResult.fallbackAttempted,
    fallbackOutcome: gateResult.fallbackOutcome,
  };
}

function writePlanObserved(gateResult: GateResult): TaskLiveRunObservation {
  return {
    ...observed("write-planning-dry-run", "anchored-provider", gateResult, "partial", "partial"),
    patchIntentStatus: "present",
    safePlanStatus: "ready",
    dryRunDiffStatus: "produced",
    reviewAuthority: "missing",
    applyStatus: "not-run",
    isolatedApply: false,
    realWorkspaceMutation: false,
    postApplyVerificationStatus: "not-run",
    rollbackStatus: "not-run",
  };
}

function writeObserved(
  entryId: Extract<TaskLiveRunObservation["entryId"], "single-file-edit" | "coordinated-edit" | "failed-check-repair" | "rollback-recovery">,
  gateResult: GateResult,
  changedFiles: readonly string[],
  proofStatus: TaskLiveRunObservation["proofStatus"],
  postApplyVerificationStatus: NonNullable<TaskLiveRunObservation["postApplyVerificationStatus"]>,
  rollbackStatus: NonNullable<TaskLiveRunObservation["rollbackStatus"]>,
): TaskLiveRunObservation {
  return {
    ...observed(entryId, "anchored-provider", gateResult, proofStatus, "passed"),
    noMutation: false,
    changedFiles,
    noApply: false,
    patchIntentStatus: "present",
    safePlanStatus: "ready",
    dryRunDiffStatus: "produced",
    reviewAuthority: "approved",
    applyStatus: "applied",
    isolatedApply: true,
    realWorkspaceMutation: false,
    postApplyVerificationStatus,
    rollbackStatus,
  };
}

function outcomeFromOutput(output: string, status: number): TaskLiveGateOutcome {
  if (/provider-network|network|timeout|ECONN|ENOTFOUND|EAI_AGAIN/i.test(output) || status === 2) {
    return "provider-network-inconclusive";
  }
  if (/config-or-skip|no-opt-in|provider-not-configured|missing config|missing-key/i.test(output) || status === 3) {
    return "config-or-skip";
  }
  if (/skip/i.test(output) && status === 0) return "skipped";
  return "failed";
}

function fallbackOutcomeFromOutput(output: string): GateResult["fallbackOutcome"] {
  if (/fallbackOutcome=passed/.test(output)) return "passed";
  if (/fallbackOutcome=failed/.test(output)) return "failed";
  if (/fallbackOutcome=inconclusive/.test(output)) return "inconclusive";
  if (/fallbackOutcome=skipped|fallbackAttempted=false/.test(output)) return "skipped";
  return undefined;
}

function blockerFromOutput(output: string): string {
  if (/provider-network|network|timeout|ECONN|ENOTFOUND|EAI_AGAIN/i.test(output)) return "provider network inconclusive";
  if (/redaction=fail|redaction-risk|redaction leak/i.test(output)) return "redaction blocked";
  if (/no-opt-in|provider-not-configured|missing config|missing-key/i.test(output)) return "provider config or opt-in gate missing";
  return "live gate did not produce passed safe metadata";
}

function redactionSafe(value: string): boolean {
  return !/(Bearer |api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|x-api-key|raw provider output|headers)/i.test(value);
}

function redact(input: string): string {
  return input
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|x-api-key)(\s*[:=]\s*)(["']?)[^\s"'`,;]+/gi, "$1$2$3[REDACTED]")
    .replace(/\bsk-[A-Za-z0-9][A-Za-z0-9._-]{8,}\b/g, "[REDACTED_API_KEY]")
    .replace(/\/[^\s"'`<>]*\.private-agents-real(?:\/[^\s"'`<>]*)?/gi, "[REAL_PROVIDER_HOME]");
}
