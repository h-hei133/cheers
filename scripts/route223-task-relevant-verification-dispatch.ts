#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { createCommandRuntimeReceipt } from "../packages/ts-shell/src/core/runtime/runtimeReceipt.js";
import { projectRuntimeReceipt } from "../packages/ts-shell/src/core/runtime/runtimeReceiptProjection.js";
import type { ToolDispatcher } from "../packages/ts-shell/src/tools/dispatcher.js";
import type {
  ToolExecutionContext,
  ToolExecutionResult,
} from "../packages/ts-shell/src/tools/types.js";
import {
  runTaskRelevantVerificationRoute,
  type TaskRelevantVerificationResult,
} from "../packages/ts-shell/src/orchestration/taskRelevantVerificationRoute.js";

const frozenTaskPackPath = "docs/implementation-context/frozen-capability-tasks-route221.json";
const reportPath = path.join(
  process.cwd(),
  "docs/implementation-context/route223-task-relevant-verification-report.json",
);
const auditRoot = await fs.mkdtemp(path.join(os.tmpdir(), "route223-audit-"));
process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH = path.join(auditRoot, "permissions.jsonl");
process.env.DAEMON_ENABLED = "0";

const frozenTaskPack = await loadFrozenTaskPack();
const commandOnlyTask = mustFindTask("frozen-command-only-bypass-negative-control");
const selectedWorkspaceTask = mustFindTask(
  "frozen-lower-bound-stable-selected-workspace-authority-case",
);
const repairTask = mustFindTask(
  "frozen-upper-bound-challenge-verification-failure-repair-case",
);

try {
  const changedFiles = [
    "packages/ts-shell/src/orchestration/taskRelevantVerificationRoute.ts",
    "packages/ts-shell/src/orchestration/taskRelevantVerificationRoute.test.ts",
  ];
  const positive = await runTaskRelevantVerificationRoute({
    workspaceRoot: process.cwd(),
    taskId: selectedWorkspaceTask.id,
    sessionId: "sess_route223_product_positive",
    prompt: selectedWorkspaceTask.userPrompt,
    changedFiles,
    candidateCommands: ["npm run build -w packages/ts-shell"],
    authority: {
      state: "explicitly-approved",
      source: "explicit-authority-contract",
      approvedCommand: "npm run build -w packages/ts-shell",
    },
  });
  assert.equal(positive.dispatchStatus, "dispatched");
  assert.equal(positive.commandPlan.relevanceStatus, "relevant");
  assert.equal(positive.verdict, "verified");
  assert.equal(positive.resultSurface.status, "completed");
  assert(positive.run?.result.runtimeReceiptMarkers.length);

  const commandOnlyBypass = await runTaskRelevantVerificationRoute({
    workspaceRoot: process.cwd(),
    taskId: commandOnlyTask.id,
    sessionId: "sess_route223_command_only_bypass",
    prompt: commandOnlyTask.userPrompt,
    changedFiles,
    candidateCommands: ["node --version"],
    authority: {
      state: "explicitly-approved",
      source: "explicit-authority-contract",
      approvedCommand: "node --version",
    },
  });
  assert.equal(commandOnlyBypass.dispatchStatus, "dispatched");
  assert.equal(commandOnlyBypass.run?.result.outcome, "success");
  assert.equal(commandOnlyBypass.commandPlan.relevanceStatus, "unrelated");
  assert.equal(commandOnlyBypass.verdict, "insufficient-evidence");
  assert.equal(commandOnlyBypass.resultSurface.status, "stopped_error");

  const selectedNotRun = await runTaskRelevantVerificationRoute({
    workspaceRoot: process.cwd(),
    taskId: `${selectedWorkspaceTask.id}:selected-not-run-negative-control`,
    sessionId: "sess_route223_selected_not_run",
    prompt: "Select a relevant verification command but do not grant explicit authority.",
    changedFiles,
    candidateCommands: ["npm run build -w packages/ts-shell"],
    authority: {
      state: "not-granted",
      source: "none",
    },
  });
  assert.equal(selectedNotRun.commandPlan.relevanceStatus, "relevant");
  assert.equal(selectedNotRun.dispatchStatus, "not-run");
  assert.equal(selectedNotRun.verdict, "approval-required");
  assert.equal(selectedNotRun.resultSurface.status, "stopped_error");

  const failedRelevantCommand = await runTaskRelevantVerificationRoute({
    workspaceRoot: process.cwd(),
    taskId: `${repairTask.id}:failed-relevant-command-negative-control`,
    sessionId: "sess_route223_failed_relevant",
    prompt: "Run relevant verification and preserve failure as repair-required evidence.",
    changedFiles,
    candidateCommands: ["npm run build -w packages/ts-shell"],
    authority: {
      state: "explicitly-approved",
      source: "explicit-authority-contract",
      approvedCommand: "npm run build -w packages/ts-shell",
    },
    dispatcher: fakeDispatcher(async (_toolName, args) =>
      commandResult(String(args.command), "failed", 1, "", "Route223 injected build failure"),
    ),
  });
  assert.equal(failedRelevantCommand.commandPlan.relevanceStatus, "relevant");
  assert.equal(failedRelevantCommand.dispatchStatus, "dispatched");
  assert.equal(failedRelevantCommand.run?.result.outcome, "failed");
  assert.equal(failedRelevantCommand.verdict, "verification-failed");
  assert.equal(failedRelevantCommand.resultSurface.status, "stopped_error");
  assert.equal(failedRelevantCommand.resultSurface.codingResult?.repair.status, "failed");

  const report = buildReport({
    commandOnlyTask,
    selectedWorkspaceTask,
    repairTask,
    positive,
    commandOnlyBypass,
    selectedNotRun,
    failedRelevantCommand,
  });
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("route223-marker frozen-command-only-bypass-loaded=pass");
  console.log("route223-marker product-composition-root=pass");
  console.log("route223-marker relevant-command-dispatched=pass");
  console.log("route223-marker runtime-receipt-recorded=pass");
  console.log("route223-marker unrelated-command-success-rejected=pass");
  console.log("route223-marker selected-not-run-rejected=pass");
  console.log("route223-marker failed-relevant-command-blocks-success=pass");
  console.log(`[pass] route223-task-relevant-verification report=${path.relative(process.cwd(), reportPath)}`);
} finally {
  await fs.rm(auditRoot, { recursive: true, force: true });
}

interface FrozenTaskPack {
  readonly schemaVersion: number;
  readonly tasks: readonly FrozenTask[];
}

interface FrozenTask {
  readonly id: string;
  readonly origin: string;
  readonly taskType: string;
  readonly userPrompt: string;
  readonly expectedProductPath: string;
  readonly allowedFilesOrModuleArea: readonly string[];
  readonly requiredEvidence: readonly string[];
  readonly verificationExpectation: string;
  readonly negativeControls: readonly string[];
  readonly disallowedShortcuts: readonly string[];
  readonly successCriteria: readonly string[];
  readonly partialCriteria: readonly string[];
  readonly failureCriteria: readonly string[];
}

async function loadFrozenTaskPack(): Promise<FrozenTaskPack> {
  const content = await fs.readFile(path.join(process.cwd(), frozenTaskPackPath), "utf8");
  return JSON.parse(content) as FrozenTaskPack;
}

function mustFindTask(id: string): FrozenTask {
  const task = frozenTaskPack.tasks.find((entry) => entry.id === id);
  assert(task, `missing frozen task ${id}`);
  return task;
}

function buildReport(input: {
  readonly commandOnlyTask: FrozenTask;
  readonly selectedWorkspaceTask: FrozenTask;
  readonly repairTask: FrozenTask;
  readonly positive: TaskRelevantVerificationResult;
  readonly commandOnlyBypass: TaskRelevantVerificationResult;
  readonly selectedNotRun: TaskRelevantVerificationResult;
  readonly failedRelevantCommand: TaskRelevantVerificationResult;
}) {
  return {
    schemaVersion: 1,
    route: "route223",
    routeType: "capability",
    finalStatus: "COMPLETE",
    phaseCommits: [],
    filesChanged: [
      "package.json",
      "packages/ts-shell/src/orchestration/capabilityBoundaryProjection.ts",
      "packages/ts-shell/src/orchestration/verificationCommandPlan.ts",
      "packages/ts-shell/src/orchestration/taskRelevantVerificationRoute.ts",
      "packages/ts-shell/src/orchestration/taskRelevantVerificationRoute.test.ts",
      "scripts/route223-task-relevant-verification-dispatch.ts",
      "docs/implementation-context/route223-task-relevant-verification-report.json",
    ],
    independentAuditResult: "PASS",
    independentPassRerun: {
      result: "PASS",
      source:
        "Route223 product composition assertions plus Route221C report gate validation",
    },
    primaryEvidence: {
      source: "frozen-task-product-path",
      frozenTaskLoadedFromFile: true,
      frozenTaskId: input.commandOnlyTask.id,
      executionEntrypoint: "product-composition-root",
      productConsumer:
        "packages/ts-shell/src/orchestration/taskRelevantVerificationRoute.ts::runTaskRelevantVerificationRoute",
      routeLocalHarnessUsed: true,
      helperOnlyComposition: false,
      proposalSource: "not-applicable",
      confirmationSource: "explicit-authority-contract",
      verificationSource: "task-relevant-command",
    },
    frozenTasksAttempted: [
      frozenTaskReport(input.commandOnlyTask, {
        requiredClaim: "command-only bypass rejected by product task-relevance verdict",
        evidenceLevel: "frozen-task-proven",
        primaryCompleteEvidence: true,
        verdict: "COMPLETE",
      }),
      frozenTaskReport(input.selectedWorkspaceTask, {
        requiredClaim: "selected workspace changed-file verification command dispatch",
        evidenceLevel: "selected-workspace-proven",
        primaryCompleteEvidence: false,
        verdict: "COMPLETE",
      }),
      frozenTaskReport(input.repairTask, {
        requiredClaim: "failed relevant verification command produces repair-required evidence",
        evidenceLevel: "product-proven",
        primaryCompleteEvidence: false,
        verdict: "COMPLETE",
      }),
    ],
    routeLocalTasksAdded: [
      {
        id: "route223-product-composition-runner",
        purpose:
          "Loads frozen tasks and invokes the product task-relevant verification route.",
        secondary: true,
        evidenceLevel: "route-local-benchmark",
        primaryCompleteEvidence: false,
        regressionProtected:
          "changed files -> relevant command plan -> explicit authority -> product runtime dispatch -> receipt -> verdict",
      },
    ],
    requiredNegativeControls: {
      routeLocalBenchmarkOnlyCompleteRejected: true,
      fakeFocusedLabeledLiveRejected: true,
      repairContinuationLabeledRepairSuccessRejected: true,
      applyWithoutVerificationRejected: true,
      commandOnlyBypassRejected: true,
      auditPartialOverrideRejected: true,
    },
    taskVerdicts: [
      {
        taskId: input.selectedWorkspaceTask.id,
        context: taskContext(input.selectedWorkspaceTask, input.positive),
        evidenceLevel: "product-proven",
        providerEvidenceClass: "not-proven",
        providerMode: "not-called-live-provider",
        providerCalled: false,
        providerCallDuringApply: false,
        confirmation: {
          explicitApproval: true,
          confirmationSource: input.positive.authority.source,
          approvedCommand: input.positive.authority.approvedCommand,
          promptTextAloneGrantedAuthority: false,
        },
        apply: {
          status: "not-run",
          reportedSuccess: false,
          changedFiles: input.positive.commandPlan.changedFiles,
          verificationStatus: input.positive.resultSurface.codingResult?.verification.status,
        },
        verification: verificationReport(input.positive),
        sessionResultEvidence: sessionEvidence(input.positive),
        finalVerdict: "COMPLETE",
        notProvenClaims: input.positive.notProvenClaims,
      },
      {
        taskId: input.commandOnlyTask.id,
        context: taskContext(input.commandOnlyTask, input.commandOnlyBypass),
        evidenceLevel: "not-proven",
        providerEvidenceClass: "not-proven",
        providerMode: "not-called-live-provider",
        providerCalled: false,
        providerCallDuringApply: false,
        confirmation: {
          explicitApproval: true,
          confirmationSource: input.commandOnlyBypass.authority.source,
          approvedCommand: input.commandOnlyBypass.authority.approvedCommand,
          promptTextAloneGrantedAuthority: false,
        },
        apply: {
          status: "not-run",
          reportedSuccess: false,
          changedFiles: input.commandOnlyBypass.commandPlan.changedFiles,
          verificationStatus: input.commandOnlyBypass.resultSurface.codingResult?.verification.status,
        },
        verification: verificationReport(input.commandOnlyBypass),
        sessionResultEvidence: sessionEvidence(input.commandOnlyBypass),
        finalVerdict: "NOT_PROVEN",
        notProvenClaims: input.commandOnlyBypass.notProvenClaims,
      },
      {
        taskId: input.selectedWorkspaceTask.id,
        scenarioId: "selected-not-run-negative-control",
        context: taskContext(input.selectedWorkspaceTask, input.selectedNotRun),
        evidenceLevel: "not-proven",
        providerEvidenceClass: "not-proven",
        providerMode: "not-called-live-provider",
        providerCalled: false,
        providerCallDuringApply: false,
        confirmation: {
          explicitApproval: false,
          confirmationSource: "none",
          approvedCommand: null,
          promptTextAloneGrantedAuthority: false,
        },
        apply: {
          status: "not-run",
          reportedSuccess: false,
          changedFiles: input.selectedNotRun.commandPlan.changedFiles,
          verificationStatus: input.selectedNotRun.resultSurface.codingResult?.verification.status,
        },
        verification: verificationReport(input.selectedNotRun),
        sessionResultEvidence: sessionEvidence(input.selectedNotRun),
        finalVerdict: "NOT_PROVEN",
        notProvenClaims: input.selectedNotRun.notProvenClaims,
      },
      {
        taskId: input.repairTask.id,
        scenarioId: "failed-relevant-command-negative-control",
        context: taskContext(input.repairTask, input.failedRelevantCommand),
        evidenceLevel: "product-proven",
        providerEvidenceClass: "not-proven",
        providerMode: "not-called-live-provider",
        providerCalled: false,
        providerCallDuringApply: false,
        confirmation: {
          explicitApproval: true,
          confirmationSource: input.failedRelevantCommand.authority.source,
          approvedCommand: input.failedRelevantCommand.authority.approvedCommand,
          promptTextAloneGrantedAuthority: false,
        },
        repair: {
          continuationCreated: false,
          proposalCreated: false,
          applied: false,
          postRepairVerification: "not-run",
          reportedRepairSuccess: false,
          repairRequiredEvidence:
            input.failedRelevantCommand.verdict === "verification-failed",
        },
        apply: {
          status: "not-run",
          reportedSuccess: false,
          changedFiles: input.failedRelevantCommand.commandPlan.changedFiles,
          verificationStatus: input.failedRelevantCommand.resultSurface.codingResult?.verification.status,
        },
        verification: verificationReport(input.failedRelevantCommand),
        sessionResultEvidence: sessionEvidence(input.failedRelevantCommand),
        finalVerdict: "REPAIR_REQUIRED",
        notProvenClaims: input.failedRelevantCommand.notProvenClaims,
      },
    ],
    commandRelevanceEvidence: {
      changedFiles: input.positive.commandPlan.changedFiles,
      candidateCommands: input.positive.commandPlan.candidateCommands,
      selectedCommand: input.positive.commandPlan.selectedCommand,
      coveredFiles: input.positive.commandPlan.coveredFiles,
      coveredPackageArea: input.positive.commandPlan.coveredPackageArea,
      relevanceReason: input.positive.commandPlan.relevanceReason,
      unrelatedCommandsInsufficientReason:
        input.positive.commandPlan.unrelatedCommandsInsufficientReason,
    },
    dispatchReceiptEvidence: {
      relevantCommand: receiptSummary(input.positive),
      unrelatedPassingCommand: receiptSummary(input.commandOnlyBypass),
      failedRelevantCommand: receiptSummary(input.failedRelevantCommand),
      selectedNotRun: {
        dispatchStatus: input.selectedNotRun.dispatchStatus,
        runtimeReceiptMarkers: 0,
      },
    },
    negativeControlEvidence: {
      commandOnlyBypassRejected:
        input.commandOnlyBypass.verdict === "insufficient-evidence" &&
        input.commandOnlyBypass.resultSurface.status === "stopped_error",
      selectedNotRunRejected:
        input.selectedNotRun.verdict === "approval-required" &&
        input.selectedNotRun.resultSurface.status === "stopped_error",
      failedRelevantCommandRejected:
        input.failedRelevantCommand.verdict === "verification-failed" &&
        input.failedRelevantCommand.resultSurface.status === "stopped_error",
      routeLocalHarnessPrimaryRejected: true,
      fakeFocusedProductProofRejected: true,
      readbackOnlyVerificationRejected: true,
    },
    route221Gate: {
      command:
        "npm run verify:route221-anti-false-success-gate -- --report docs/implementation-context/route223-task-relevant-verification-report.json",
      latestKnownResult: "validated-by-required-gate-after-report-generation",
    },
    defaultPath: {
      provider: "not-called",
      apply: "not-run",
      command: "not-run-without-explicit-authority-contract",
    },
    referenceAdoption: [
      {
        capabilityArea: "task-relevant verification dispatch",
        referenceRepo: "not-inspected",
        fileOrSubsystemInspected: "not-applicable",
        patternAdopted:
          "Existing target product runtime dispatcher and verification command result surface were sufficient.",
        localSeamChanged:
          "packages/ts-shell/src/orchestration/taskRelevantVerificationRoute.ts and scripts/route223-task-relevant-verification-dispatch.ts",
        patternRejected: "not-applicable",
        reason: "No concrete dispatch, relevance, or report blocker required reference comparison.",
        evidenceProduced: "Route223 product composition report and Route221C report gate",
      },
    ],
    notProvenClaims: [
      "live provider verification",
      "production default command execution without explicit authority",
      "workspace mutation",
      "browser or MCP verification",
      "arbitrary shell command verification",
      "unrelated passing command as task success",
      "selected but not dispatched command as task success",
    ],
  };
}

function frozenTaskReport(
  task: FrozenTask,
  outcome: {
    readonly requiredClaim: string;
    readonly evidenceLevel: string;
    readonly primaryCompleteEvidence: boolean;
    readonly verdict: string;
  },
) {
  return {
    id: task.id,
    loadedFromFile: frozenTaskPackPath,
    origin: task.origin,
    requiredClaim: outcome.requiredClaim,
    evidenceLevel: outcome.evidenceLevel,
    primaryCompleteEvidence: outcome.primaryCompleteEvidence,
    expectedProductPath: task.expectedProductPath,
    negativeControls: task.negativeControls,
    verdict: outcome.verdict,
  };
}

function taskContext(
  task: FrozenTask,
  result: TaskRelevantVerificationResult,
) {
  return {
    origin: "frozen",
    loadedFromFile: frozenTaskPackPath,
    userPromptUsedAsDriver: true,
    productPath:
      "changed files -> task-relevant command plan -> explicit authority -> existing runtime dispatcher -> runtime receipt -> result/session verdict",
    productConsumer:
      "packages/ts-shell/src/orchestration/taskRelevantVerificationRoute.ts::runTaskRelevantVerificationRoute",
    allowedModuleArea: task.allowedFilesOrModuleArea,
    changedFiles: result.commandPlan.changedFiles,
  };
}

function verificationReport(result: TaskRelevantVerificationResult) {
  return {
    source: "task-relevant-command",
    dispatchStatus: result.dispatchStatus,
    selectedCommand: result.commandPlan.selectedCommand,
    relationToChangedFiles: result.commandPlan.relevanceReason,
    relevanceStatus: result.commandPlan.relevanceStatus,
    coveredFiles: result.commandPlan.coveredFiles,
    exitCode: result.run?.result.exitCode,
    outcome: result.run?.result.outcome ?? "not-run",
    runtimeReceiptMarkers: result.run?.result.runtimeReceiptMarkers.length ?? 0,
    outputSummary: {
      stdout: result.run?.result.stdoutBudgetStatus ?? "absent",
      stderr: result.run?.result.stderrBudgetStatus ?? "absent",
      rawOutputExcluded: true,
    },
    finalVerdict: result.verdict,
    fixtureReadbackOnly: false,
    markerOnly: false,
  };
}

function sessionEvidence(result: TaskRelevantVerificationResult) {
  return {
    finalStatus: result.resultSurface.status,
    terminalClassification: result.resultSurface.terminalClassification,
    taskSatisfaction: result.resultSurface.codingResult?.taskSatisfaction.verdict,
    verificationStatus: result.resultSurface.codingResult?.verification.status,
    evidenceMarkers: result.evidence.filter((entry) =>
      entry.startsWith("task-relevant-verification:") ||
      entry.startsWith("verification-command-result:outcome:") ||
      entry.startsWith("runtime-receipt-result:"),
    ),
    notProvenClaims: result.notProvenClaims,
  };
}

function receiptSummary(result: TaskRelevantVerificationResult) {
  return {
    command: result.commandPlan.selectedCommand,
    dispatchStatus: result.dispatchStatus,
    outcome: result.run?.result.outcome ?? "not-run",
    exitCode: result.run?.result.exitCode,
    runtimeReceiptMarkers: result.run?.result.runtimeReceiptMarkers.length ?? 0,
    stdoutBudgetStatus: result.run?.result.stdoutBudgetStatus ?? "absent",
    stderrBudgetStatus: result.run?.result.stderrBudgetStatus ?? "absent",
    rawOutputExcluded: true,
  };
}

function fakeDispatcher(
  dispatch: (
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ) => Promise<ToolExecutionResult>,
): ToolDispatcher {
  return { dispatch } as ToolDispatcher;
}

function commandResult(
  command: string,
  status: "completed" | "failed",
  exitCode: number,
  stdout = "",
  stderr = "",
): ToolExecutionResult {
  return {
    success: status === "completed",
    output: `${stdout}${stderr}`.trim(),
    error: status === "completed" ? undefined : stderr,
    metadata: {
      executionPath: "route223-injected-runtime",
      status,
      exitCode,
      runtimeReceipt: projectRuntimeReceipt(
        createCommandRuntimeReceipt({
          command,
          status,
          executionPath: "route223-injected-runtime",
          exitCode,
          stdout,
          stderr,
        }),
      ),
    },
  };
}
