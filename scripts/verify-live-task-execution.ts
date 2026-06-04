#!/usr/bin/env tsx

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseTaskLiveCatalog } from "../packages/ts-shell/src/runtime/evaluation/task/catalog.js";
import { createHostRuntime } from "../packages/ts-shell/src/runtime/api/host/runtime.js";
import {
  runTaskLiveReport,
  type TaskLiveEntryId,
  type TaskLiveProfile,
  type TaskLiveGateReceipt,
  type TaskLiveWorkspaceApplyReceipt,
} from "../packages/ts-shell/src/runtime/evaluation/task/liveRun.js";
import type { TaskLiveGateOutcome } from "../packages/ts-shell/src/runtime/evaluation/task/model.js";
import type { TaskLiveCatalog } from "../packages/ts-shell/src/runtime/evaluation/task/catalog.js";

type GateResult = {
  readonly name: "read-only-provider" | "anchored-provider";
  readonly label?: string;
  readonly attempted: boolean;
  readonly outcome: TaskLiveGateOutcome;
  readonly noMutation: boolean;
  readonly changedFiles: readonly string[];
  readonly noApply: boolean;
  readonly redactionStatus: "passed" | "failed";
  readonly fallbackConfigured?: boolean;
  readonly fallbackAttempted?: boolean;
  readonly fallbackOutcome?: "passed" | "failed" | "skipped" | "inconclusive";
  readonly primaryFailureClass?: "none" | "provider-network" | "provider-auth" | "config-or-skip" | "product-regression";
  readonly forcedPrimaryFailure?: boolean;
  readonly blocker: string;
};

const liveOptIn = process.env.PRIVATE_AGENTS_LIVE_TASK_EXECUTION?.trim() === "1";
const reviewedApplyOptIn = process.env.PRIVATE_AGENTS_LIVE_WRITE_REVIEWED_APPLY?.trim() === "1";
const realWorkspaceApplyOptIn = process.env.PRIVATE_AGENTS_LIVE_REAL_WORKSPACE_APPLY?.trim() === "1";
const liveProfile = taskLiveProfileFromEnv(process.env.PRIVATE_AGENTS_LIVE_TASK_PROFILE);
const liveCatalog = readLiveCatalogFromEnv(process.env.PRIVATE_AGENTS_LIVE_TASK_CATALOG);

console.log("gate name=live-task-execution");
console.log(`live-task-profile=${liveCatalog ? "catalog" : liveProfile}`);
console.log(`live-task-catalog=${liveCatalog?.catalogId ?? "none"}`);
console.log(`live-task-catalog-entry-count=${liveCatalog?.entries.length ?? 0}`);
console.log(`live-task-execution-opt-in=${liveOptIn}`);
console.log(`live-write-reviewed-apply-opt-in=${reviewedApplyOptIn}`);
console.log(`live-real-workspace-apply-opt-in=${realWorkspaceApplyOptIn}`);
console.log("private-config-manual-read=false");
console.log("raw-provider-output=excluded");
console.log("terminal-success-claim=false");

const host = createHostRuntime();
const gateResults: GateResult[] = [];
const workspaceApplyReceipts: TaskLiveWorkspaceApplyReceipt[] = [];

if (liveOptIn) {
  const readOnly = runReadOnlyProviderGate();
  gateResults.push(readOnly);

  const anchored = runAnchoredProviderGate({ forcedPrimaryFailure: false });
  gateResults.push(anchored);
  const forcedFallback = runAnchoredProviderGate({ forcedPrimaryFailure: true });
  gateResults.push(forcedFallback);

  if (realWorkspaceApplyOptIn) {
    workspaceApplyReceipts.push(runSelectedWorkspaceApplyGate());
  }
}

const report = await runTaskLiveReport({
  dispatch: host.dispatch,
  profile: liveProfile,
  catalog: liveCatalog,
  gateReceipts: gateResults.map(toGateReceipt),
  workspaceApplyReceipts,
  reviewedApplyOptIn,
});

for (const gate of gateResults) {
  const gateLabel = gate.label ?? gate.name;
  console.log(`gate.${gateLabel}.attempted=${gate.attempted}`);
  console.log(`gate.${gateLabel}.outcome=${gate.outcome}`);
  console.log(`gate.${gateLabel}.noMutation=${gate.noMutation}`);
  console.log(`gate.${gateLabel}.changedFiles=${JSON.stringify(gate.changedFiles)}`);
  console.log(`gate.${gateLabel}.noApply=${gate.noApply}`);
  console.log(`gate.${gateLabel}.redaction=${gate.redactionStatus}`);
  if (gate.primaryFailureClass) console.log(`gate.${gateLabel}.primaryFailureClass=${gate.primaryFailureClass}`);
  if (gate.forcedPrimaryFailure !== undefined) console.log(`gate.${gateLabel}.forcedPrimaryFailure=${gate.forcedPrimaryFailure}`);
  if (gate.fallbackConfigured !== undefined) console.log(`gate.${gateLabel}.fallbackConfigured=${gate.fallbackConfigured}`);
  if (gate.fallbackAttempted !== undefined) console.log(`gate.${gateLabel}.fallbackAttempted=${gate.fallbackAttempted}`);
  if (gate.fallbackOutcome) console.log(`gate.${gateLabel}.fallbackOutcome=${gate.fallbackOutcome}`);
  if (gate.blocker) console.log(`gate.${gateLabel}.blocker=${gate.blocker}`);
}
for (const receipt of workspaceApplyReceipts) {
  console.log(`gate.${receipt.gate}.attempted=${receipt.attempted}`);
  console.log(`gate.${receipt.gate}.outcome=${receipt.outcome}`);
  console.log(`gate.${receipt.gate}.entry=${receipt.entryId}`);
  console.log(`gate.${receipt.gate}.changedFiles=${JSON.stringify(receipt.changedFiles)}`);
  console.log(`gate.${receipt.gate}.writerTarget=${receipt.writerTarget}`);
  console.log(`gate.${receipt.gate}.postActionVerification=${receipt.postActionVerificationStatus}`);
  console.log(`gate.${receipt.gate}.redaction=${receipt.redactionStatus}`);
  console.log(`gate.${receipt.gate}.repositoryClean=${receipt.repositoryClean}`);
  if (receipt.blocker) console.log(`gate.${receipt.gate}.blocker=${receipt.blocker}`);
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
console.log(`completedWithTaskProofCount=${report.summary.completedWithTaskProofCount}`);
console.log(`completedWriteTaskProofCount=${report.summary.completedWriteTaskProofCount}`);
console.log(`reviewedDisposablePostApplyProofCount=${report.summary.reviewedDisposablePostApplyProofCount}`);
console.log(`correctionFreeCompletedWriteCount=${report.summary.correctionFreeCompletedWriteCount}`);
console.log(`correctionDispositionCount=${report.summary.correctionDispositionCount}`);
console.log(`debugOrRepairUseful=${report.summary.debugOrRepairUseful}`);
console.log(`debugOrRepairComplete=${report.summary.debugOrRepairComplete}`);
console.log(`multiFileCompleteOrExactPartial=${report.summary.multiFileCompleteOrExactPartial}`);
console.log(`artifactOrReportComplete=${report.summary.artifactOrReportComplete}`);
console.log(`continuationOrContextComplete=${report.summary.continuationOrContextComplete}`);
console.log(`rollbackRecoveryStatus=${report.summary.rollbackRecoveryStatus}`);
console.log(`qualityRecordCount=${report.summary.qualityRecordCount}`);
console.log(`writeOrArtifactQualityRecordCount=${report.summary.writeOrArtifactQualityRecordCount}`);
console.log(`dryRunQualityRecordCount=${report.summary.dryRunQualityRecordCount}`);
console.log(`reviewedIsolatedPostApplyCount=${report.summary.reviewedIsolatedPostApplyCount}`);
console.log(`realWorkspaceReadyCount=${report.summary.realWorkspaceReadyCount}`);
console.log(`realWorkspaceApplyCount=${report.summary.realWorkspaceApplyCount}`);
console.log(`manualCorrectionCount=${report.summary.manualCorrectionCount}`);
console.log(`debugRepairFailureProvedCount=${report.summary.debugRepairFailureProvedCount}`);
console.log(`multiFileQualityRecord=${report.summary.multiFileQualityRecord}`);
console.log(`artifactQualityPassed=${report.summary.artifactQualityPassed}`);
console.log(`primaryProviderSuccess=${report.summary.primaryProviderSuccess}`);
console.log(`primarySuccessFallbackSkipped=${report.summary.primarySuccessFallbackSkipped}`);
console.log(`forcedPrimaryFailureFallbackAttempted=${report.summary.forcedPrimaryFailureFallbackAttempted}`);
console.log(`forcedPrimaryFailureFallbackPassed=${report.summary.forcedPrimaryFailureFallbackPassed}`);
console.log(`providerFallbackCoveragePassed=${report.summary.providerFallbackCoveragePassed}`);
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
    `realWorkspaceApply=${result.realWorkspaceApplyStatus}`,
    `realWorkspaceApplyScope=${result.realWorkspaceApplyScope}`,
    `postApplyVerification=${result.postApplyVerificationStatus}`,
    `rollback=${result.rollbackStatus}`,
    `changedFiles=${JSON.stringify(result.changedFiles)}`,
    `quality=${result.qualityRecord ? "present" : "absent"}`,
    `qualityReadiness=${result.qualityRecord?.finalReadiness ?? "none"}`,
    `qualityTargetFiles=${result.qualityRecord?.targetFileCount ?? 0}`,
    `qualityHunksOrSections=${result.qualityRecord?.hunkOrSectionCount ?? 0}`,
    `manualCorrection=${result.qualityRecord?.manualCorrectionNeeded ?? false}`,
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
    redactionStatus: /redaction=pass/.test(output) || redactionSafe(output) ? "passed" : "failed",
    fallbackConfigured: /fallbackConfigured=true/.test(output),
    fallbackAttempted: /fallbackAttempted=true/.test(output),
    fallbackOutcome: fallbackOutcomeFromOutput(output),
    blocker: passed ? "" : blockerFromOutput(output),
  };
}

function runAnchoredProviderGate(input: { readonly forcedPrimaryFailure: boolean }): GateResult {
  const result = spawnSync("node", ["scripts/verify-real-provider-anchored-smoke.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PRIVATE_AGENTS_REAL_PROVIDER_SMOKE: "1",
      PRIVATE_AGENTS_LIVE_ANCHORED_PROVIDER_SMOKE: "1",
      ...(input.forcedPrimaryFailure
        ? { PRIVATE_AGENTS_ANCHORED_SMOKE_FORCE_PRIMARY_NETWORK_FAILURE: "1" }
        : {}),
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
    label: input.forcedPrimaryFailure ? "anchored-provider-forced-fallback" : "anchored-provider",
    attempted: true,
    outcome: passed ? "passed" : outcomeFromOutput(output, result.status ?? 1),
    noMutation: /no-write=true/.test(output),
    changedFiles: [],
    noApply: /no-apply|apply=not-run|mutation-authority=not-granted/.test(output),
    redactionStatus: /raw-provider-output=excluded/.test(output) || redactionSafe(output) ? "passed" : "failed",
    fallbackConfigured: /fallbackConfigured=true/.test(output),
    fallbackAttempted: /fallbackAttempted=true/.test(output),
    fallbackOutcome: fallbackOutcomeFromOutput(output),
    primaryFailureClass: primaryFailureClassFromOutput(output),
    forcedPrimaryFailure: input.forcedPrimaryFailure,
    blocker: passed ? "" : blockerFromOutput(output),
  };
}

function runSelectedWorkspaceApplyGate(): TaskLiveWorkspaceApplyReceipt {
  const worktree = createDisposableWorktree();
  if (!worktree.ok) {
    return {
      gate: "selected-workspace-apply",
      attempted: false,
      outcome: "blocked",
      entryId: selectedWorkspaceApplyEntryId(),
      changedFiles: [],
      writerTarget: "missing-or-unverified",
      postActionVerificationStatus: "not-run",
      redactionStatus: "passed",
      repositoryClean: false,
      blocker: worktree.blocker,
    };
  }
  try {
    const result = spawnSync("node", ["scripts/verify-real-user-capabilities.mjs", "--case=real-selected-workspace-single-file-update"], {
      cwd: worktree.path,
      env: {
        ...process.env,
        PRIVATE_AGENTS_TEST_ROOT: process.env.PRIVATE_AGENTS_TEST_ROOT?.trim() || "/tmp/private-agents-live-task-workspace-apply",
      },
      encoding: "utf8",
      maxBuffer: 1024 * 1024 * 8,
    });
    const output = redact(`${result.stdout ?? ""}\n${result.stderr ?? ""}`);
    const passed = (result.status ?? 1) === 0 &&
      /\[PASS\] real-selected-workspace-single-file-update/.test(output) &&
      /workspaceWriterInvoked=true/.test(output) &&
      /writerTarget=isolated-selected-workspace/.test(output) &&
      /postWriteVerification=pass|terminalSuccessAllowed=true/.test(output) &&
      /redaction=pass/.test(output);
    const changedFiles = /changedFiles=src\/app\.ts/.test(output) ? ["src/app.ts"] : [];
    return {
      gate: "selected-workspace-apply",
      attempted: true,
      outcome: passed ? "passed" : workspaceApplyOutcomeFromOutput(output, result.status ?? 1),
      entryId: selectedWorkspaceApplyEntryId(),
      changedFiles,
      writerTarget: /writerTarget=isolated-selected-workspace/.test(output)
        ? "isolated-selected-workspace"
        : "missing-or-unverified",
      postActionVerificationStatus: /postWriteVerification=pass|terminalSuccessAllowed=true/.test(output)
        ? "passed"
        : /postWriteVerification=fail/.test(output)
          ? "failed"
          : "not-run",
      redactionStatus: /redaction=pass/.test(output) || redactionSafe(output) ? "passed" : "failed",
      repositoryClean: /repositoryClean=true/.test(output),
      ...(passed ? {} : { blocker: workspaceApplyBlockerFromOutput(output) }),
    };
  } finally {
    cleanupDisposableWorktree(worktree.path);
  }
}

function taskLiveProfileFromEnv(value: string | undefined): TaskLiveProfile {
  return value?.trim() === "focused" ? "focused" : "broad";
}

function readLiveCatalogFromEnv(value: string | undefined): TaskLiveCatalog | undefined {
  const rawPath = value?.trim();
  if (!rawPath) return undefined;
  const resolved = path.resolve(process.cwd(), rawPath);
  const sprintRoot = path.resolve(process.cwd(), "docs/sprint");
  if (!resolved.startsWith(`${sprintRoot}${path.sep}`) || !resolved.endsWith(".json")) {
    throw new Error("live task catalog must be a repository docs/sprint JSON file");
  }
  return parseTaskLiveCatalog(JSON.parse(fs.readFileSync(resolved, "utf8")));
}

function selectedWorkspaceApplyEntryId(): Extract<TaskLiveEntryId, "single-file-edit" | "label-normalization"> {
  return liveProfile === "focused" ? "label-normalization" : "single-file-edit";
}

function createDisposableWorktree(): { readonly ok: true; readonly path: string } | { readonly ok: false; readonly blocker: string } {
  const repoRoot = process.cwd();
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "private-agents-live-task-workspace-"));
  const add = spawnSync("git", ["worktree", "add", "--detach", tempRoot, "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  if ((add.status ?? 1) !== 0) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
    return { ok: false, blocker: "disposable selected workspace unavailable" };
  }
  const linked = linkNodeModules(tempRoot);
  if (!linked) {
    cleanupDisposableWorktree(tempRoot);
    return { ok: false, blocker: "disposable selected workspace dependencies unavailable" };
  }
  return { ok: true, path: tempRoot };
}

function linkNodeModules(worktreePath: string): boolean {
  const source = path.join(process.cwd(), "node_modules");
  if (!fs.existsSync(source)) return false;
  const targetRoot = path.join(worktreePath, "node_modules");
  fs.mkdirSync(targetRoot, { recursive: true });
  for (const entry of fs.readdirSync(source)) {
    const sourceEntry = path.join(source, entry);
    const targetEntry = path.join(targetRoot, entry);
    if (!fs.existsSync(targetEntry)) {
      fs.symlinkSync(sourceEntry, targetEntry);
    }
  }
  return true;
}

function cleanupDisposableWorktree(worktreePath: string): void {
  spawnSync("git", ["worktree", "remove", "--force", worktreePath], {
    cwd: process.cwd(),
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
  });
  fs.rmSync(worktreePath, { recursive: true, force: true });
}

function toGateReceipt(gateResult: GateResult): TaskLiveGateReceipt {
  return {
    gate: gateResult.name,
    attempted: gateResult.attempted,
    outcome: gateResult.outcome,
    noMutation: gateResult.noMutation,
    changedFiles: gateResult.changedFiles,
    noApply: gateResult.noApply,
    redactionStatus: gateResult.redactionStatus,
    fallbackConfigured: gateResult.fallbackConfigured,
    fallbackAttempted: gateResult.fallbackAttempted,
    fallbackOutcome: gateResult.fallbackOutcome,
    primaryFailureClass: gateResult.primaryFailureClass,
    forcedPrimaryFailure: gateResult.forcedPrimaryFailure,
    ...(gateResult.blocker ? { blocker: gateResult.blocker } : {}),
  };
}

function primaryFailureClassFromOutput(output: string): GateResult["primaryFailureClass"] {
  if (/primaryFailureClass=provider-network/.test(output)) return "provider-network";
  if (/primaryFailureClass=provider-auth/.test(output)) return "provider-auth";
  if (/primaryFailureClass=config-or-skip/.test(output)) return "config-or-skip";
  if (/primaryFailureClass=product-regression/.test(output)) return "product-regression";
  if (/primaryFailureClass=none/.test(output)) return "none";
  return undefined;
}

function outcomeFromOutput(output: string, status: number): TaskLiveGateOutcome {
  if (/no-opt-in|provider-not-configured|missing config|missing-key/i.test(output) || status === 3) {
    return "config-or-skip";
  }
  if (/skip/i.test(output) && status === 0) return "skipped";
  if (/verification-blocked|repository was not clean|repository must be clean|no-mutation guard failure/i.test(output)) {
    return "failed";
  }
  if (/\b(network timeout|timeout|ECONN|ENOTFOUND|EAI_AGAIN)\b|status=provider-network|provider-network status/i.test(output) || status === 2) {
    return "provider-network-inconclusive";
  }
  return "failed";
}

function fallbackOutcomeFromOutput(output: string): GateResult["fallbackOutcome"] {
  if (/fallbackOutcome=passed/.test(output)) return "passed";
  if (/fallbackOutcome=failed/.test(output)) return "failed";
  if (/fallbackOutcome=inconclusive/.test(output)) return "inconclusive";
  if (/fallbackOutcome=skipped|fallbackAttempted=false/.test(output)) return "skipped";
  return undefined;
}

function workspaceApplyOutcomeFromOutput(output: string, status: number): TaskLiveWorkspaceApplyReceipt["outcome"] {
  if (/config-or-skip|provider\/preflight|missing config|missing-key|set PRIVATE_AGENTS_REAL_HOME/i.test(output) || status === 3) {
    return "config-or-skip";
  }
  if (/skip/i.test(output) && status === 0) return "skipped";
  if (/verification-blocked|repository was not clean|redaction failure/i.test(output)) return "blocked";
  if (/\b(network timeout|timeout|ECONN|ENOTFOUND|EAI_AGAIN)\b|status=provider-network|provider-network status/i.test(output) || status === 2) {
    return "provider-network-inconclusive";
  }
  return "failed";
}

function workspaceApplyBlockerFromOutput(output: string): string {
  if (/repository was not clean|verification-blocked/i.test(output)) return "clean repository preflight blocked selected workspace apply";
  if (/\b(network timeout|timeout|ECONN|ENOTFOUND|EAI_AGAIN)\b|status=provider-network|provider-network status/i.test(output)) return "provider network inconclusive";
  if (/redaction=fail|redaction failure|redaction-risk|redaction leak/i.test(output)) return "redaction blocked";
  if (/set PRIVATE_AGENTS_REAL_HOME|missing config|missing-key/i.test(output)) return "provider config or opt-in gate missing";
  return "selected workspace apply gate did not produce passed safe metadata";
}

function blockerFromOutput(output: string): string {
  if (/verification-blocked|repository was not clean|repository must be clean|no-mutation guard failure/i.test(output)) {
    return "clean repository preflight blocked live gate";
  }
  if (/\b(network timeout|timeout|ECONN|ENOTFOUND|EAI_AGAIN)\b|status=provider-network|provider-network status/i.test(output)) return "provider network inconclusive";
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
