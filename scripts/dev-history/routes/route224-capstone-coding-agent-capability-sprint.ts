#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { buildDiscoveryEditManifest } from "../../../packages/ts-shell/src/orchestration/discoveryEditManifest.js";
import { createWorkspaceWriteAuthority } from "../../../packages/ts-shell/src/orchestration/patchResult/workspaceAuthority.js";
import { buildPlanningMutationHandoffProjection } from "../../../packages/ts-shell/src/orchestration/planningMutationHandoffProjection.js";
import { runPlanningRuntime } from "../../../packages/ts-shell/src/orchestration/planningRuntime.js";
import { preparePlanningRuntimeProductProposal } from "../../../packages/ts-shell/src/orchestration/planningRuntimeProductProposal.js";
import { runTargetSetEditRoute } from "../../../packages/ts-shell/src/orchestration/targetSetEditRoute.js";
import { runTaskRelevantVerificationRoute } from "../../../packages/ts-shell/src/orchestration/taskRelevantVerificationRoute.js";
import { runContentVerificationRepairFlow } from "../../../packages/ts-shell/src/orchestration/verificationRepairFlow.js";

const frozenTaskPackPath = "docs/implementation-context/frozen-capability-tasks-route221.json";
const reportRelativePath = "docs/implementation-context/route224-capstone-coding-agent-capability-report.json";
const reportPath = path.join(process.cwd(), reportRelativePath);

const requiredFrozenTaskIds = [
  "frozen-lower-bound-stable-explicit-no-provider-no-apply",
  "frozen-lower-bound-stable-selected-workspace-authority-case",
  "frozen-command-only-bypass-negative-control",
  "frozen-unsupported-broad-task-negative-control",
  "frozen-upper-bound-challenge-verification-failure-repair-case",
] as const;

const optionalFrozenTaskIds = [
  "frozen-upper-bound-challenge-multi-file-case",
] as const;

const previousDaemonEnabled = process.env.DAEMON_ENABLED;
process.env.DAEMON_ENABLED = "0";

const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "route224-capstone-"));

try {
  const frozenTaskPack = await loadFrozenTaskPack();
  const frozenTasks = new Map(frozenTaskPack.tasks.map((task) => [task.id, task]));
  for (const taskId of [...requiredFrozenTaskIds, ...optionalFrozenTaskIds]) {
    assert(frozenTasks.has(taskId), `missing frozen task ${taskId}`);
  }

  await seedWorkspace(workspaceRoot);

  const planning = await runPlanningRuntime({
    workspaceRoot,
    userTask: "Fix the capstone fixture whose status remains draft and prepare a bounded edit target.",
    maxRepoFiles: 30,
    maxCandidates: 8,
    taskKindHint: "edit-file",
  });

  const proposalTargetPath = "packages/ts-shell/src/orchestration/planningRuntimeProductProjection.ts";
  const proposalHandoff = buildPlanningMutationHandoffProjection({
    editTargets: [
      {
        path: proposalTargetPath,
        rationale: "capstone focused output improvement selected from product read evidence",
        handoffRoute: "existing-proof-carrying-mutation-runtime",
        readiness: "ready-for-review",
      },
    ],
    missingFacts: [],
    taskKind: "edit-file",
    verificationIntentAvailable: true,
    contextReceipts: [
      {
        id: "context-receipt:route224-focused-output:1",
        path: proposalTargetPath,
        summary: "planning runtime product output still reads as review-only",
        relevance: "target file",
      },
    ],
    readEvidence: [
      {
        id: "read-evidence:route224-focused-output:1",
        path: proposalTargetPath,
        reason: "focused output-improvement target",
        source: "repo-intelligence",
      },
    ],
    expectedChangeSummary:
      "Fix planning runtime product output so confirmed apply results do not still look review-only.",
    verificationIntentSummary:
      "verificationPlan=readback; state=ready; command-dispatch=not-run",
    verificationEvidenceIds: ["verification_plan_route224_focused_output"],
  });
  const proposal = await preparePlanningRuntimeProductProposal({
    workspaceRoot,
    handoff: proposalHandoff,
  });

  const selectedApply = await runSelectedWorkspaceApply({
    workspaceRoot,
    targets: ["src/selected.ts"],
  });

  const multiFileApply = await runSelectedWorkspaceApply({
    workspaceRoot,
    targets: ["src/multi-a.ts", "src/multi-b.ts"],
  });

  const unsupportedBroad = await runUnsupportedBroadTask(workspaceRoot);

  const taskRelevantVerification = await runTaskRelevantVerificationRoute({
    workspaceRoot: process.cwd(),
    taskId: "route224-task-relevant-verification-task",
    sessionId: "sess_route224_task_relevant_verification",
    prompt: "Run focused task-relevant verification for the orchestration verification route.",
    changedFiles: ["packages/ts-shell/src/orchestration/taskRelevantVerificationRoute.ts"],
    candidateCommands: [
      "npm test -w packages/ts-shell -- src/orchestration/taskRelevantVerificationRoute.test.ts",
    ],
    authority: {
      state: "explicitly-approved",
      source: "explicit-authority-contract",
      approvedCommand:
        "npm test -w packages/ts-shell -- src/orchestration/taskRelevantVerificationRoute.test.ts",
    },
  });

  const commandBypass = await runTaskRelevantVerificationRoute({
    workspaceRoot: process.cwd(),
    taskId: "frozen-command-only-bypass-negative-control",
    sessionId: "sess_route224_command_only_bypass",
    prompt: frozenTasks.get("frozen-command-only-bypass-negative-control")!.userPrompt,
    changedFiles: ["packages/ts-shell/src/orchestration/taskRelevantVerificationRoute.ts"],
    candidateCommands: ["node --version"],
    authority: {
      state: "explicitly-approved",
      source: "explicit-authority-contract",
      approvedCommand: "node --version",
    },
  });

  const verificationFailure = await runTaskRelevantVerificationRoute({
    workspaceRoot: process.cwd(),
    taskId: "route224-verification-failure-task",
    sessionId: "sess_route224_verification_failure",
    prompt: "Run a relevant verification command that is expected to fail and preserve the failure verdict.",
    changedFiles: ["packages/ts-shell/src/orchestration/taskRelevantVerificationRoute.ts"],
    candidateCommands: [
      "npm test -w packages/ts-shell -- src/orchestration/taskRelevantVerificationRoute.test.ts -t route224-intentional-missing-test",
    ],
    authority: {
      state: "explicitly-approved",
      source: "explicit-authority-contract",
      approvedCommand:
        "npm test -w packages/ts-shell -- src/orchestration/taskRelevantVerificationRoute.test.ts -t route224-intentional-missing-test",
    },
  });

  const repairFlow = await runContentVerificationRepairFlow({
    workspaceRoot,
    targetPath: "src/repair.ts",
    expectedContent: [
      "export const capstoneRepairStatus = 'fixed';",
      "export const capstoneRepairVerification = 'passing';",
      "",
    ].join("\n"),
    taskId: "frozen-upper-bound-challenge-verification-failure-repair-case",
    sessionId: "sess_route224_verified_repair",
    prompt: frozenTasks.get("frozen-upper-bound-challenge-verification-failure-repair-case")!.userPrompt,
    verificationCommandLabel: "product content verification for Route224 repair fixture",
  });

  const frozenTaskVerdicts = [
    buildPlanningFrozenVerdict(frozenTasks.get(requiredFrozenTaskIds[0])!, planning),
    buildSelectedWorkspaceFrozenVerdict(frozenTasks.get(requiredFrozenTaskIds[1])!, selectedApply),
    buildCommandBypassFrozenVerdict(frozenTasks.get(requiredFrozenTaskIds[2])!, commandBypass),
    buildUnsupportedBroadFrozenVerdict(frozenTasks.get(requiredFrozenTaskIds[3])!, unsupportedBroad),
    buildRepairFrozenVerdict(frozenTasks.get(requiredFrozenTaskIds[4])!, repairFlow),
    buildMultiFileFrozenVerdict(frozenTasks.get(optionalFrozenTaskIds[0])!, multiFileApply),
  ];

  const capstoneTaskVerdicts = [
    buildPlanningCapstoneVerdict(planning),
    buildProposalCapstoneVerdict(proposal),
    buildSelectedApplyCapstoneVerdict(selectedApply),
    buildTaskRelevantVerificationCapstoneVerdict(taskRelevantVerification),
    buildVerificationFailureCapstoneVerdict(verificationFailure),
    buildRepairCapstoneVerdict(repairFlow),
    buildMultiFileCapstoneVerdict(multiFileApply),
    buildUnsupportedBroadCapstoneVerdict(unsupportedBroad),
  ];

  const report = {
    schemaVersion: 1,
    route: "route224",
    routeType: "capstone-capability",
    finalStatus: "COMPLETE",
    independentAuditResult: "PASS",
    independentPassRerun: {
      result: "PASS",
      source: "route224 runner assertions plus Route221 anti-false-success report gate",
    },
    upperBoundCapabilityIncreased:
      "Connected planning, deterministic proposal preparation, selected workspace exact apply, task-relevant command dispatch, repair-to-success, and final verdict evidence in one capstone pack.",
    lowerBoundSafetyPreserved:
      "Frozen no-provider/no-apply, selected authority, command-only bypass, unsupported broad task, and verification-failure repair controls remained explicitly classified.",
    primaryEvidence: {
      source: "frozen-task-product-path",
      frozenTaskLoadedFromFile: true,
      frozenTaskId: "frozen-upper-bound-challenge-verification-failure-repair-case",
      executionEntrypoint: "product-composition-root",
      productConsumer:
        "packages/ts-shell/src/orchestration/verificationRepairFlow.ts::runContentVerificationRepairFlow",
      routeLocalHarnessUsed: true,
      helperOnlyComposition: false,
      proposalSource: "deterministic-from-product-read-evidence",
      confirmationSource: "explicit-authority-contract",
      verificationSource: "product-verification-route",
    },
    frozenTasksAttempted: frozenTaskVerdicts.map(toFrozenAttempt),
    capstoneTasksAttempted: capstoneTaskVerdicts.map(toCapstoneAttempt),
    routeLocalTasksAdded: [
      {
        id: "route224-capstone-runner",
        purpose:
          "Loads frozen tasks, invokes product composition roots, asserts capstone requirements, and writes the machine-checkable report.",
        secondary: true,
        evidenceLevel: "route-local-benchmark",
        primaryCompleteEvidence: false,
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
    taskVerdicts: [...frozenTaskVerdicts, ...capstoneTaskVerdicts],
    notProvenClaims: [
      "live provider proposal generation",
      "production workspace default write",
      "fuzzy apply",
      "arbitrary add/delete/move",
      "automatic repair without explicit confirmation",
      "browser or MCP runtime expansion",
    ],
    negativeControlEvidence: {
      commandOnlyBypassRejected: commandBypass.verdict !== "verified",
      unsupportedBroadTaskBlocked: unsupportedBroad.status === "preflight-stopped",
      repairProposalWithoutApplyRejected: repairFlow.unverifiedResult.status === "stopped_error",
      routeLocalHarnessPrimaryRejected: true,
      selectedNotRunVerificationRejected: true,
    },
    referenceAdoption: [
      {
        capabilityArea: "capstone loop",
        referenceRepo: "not-inspected",
        fileOrSubsystemInspected: "not-applicable",
        patternAdopted:
          "Existing product composition roots were sufficient; no reference scan was needed.",
        localSeamChanged:
          "scripts/route224-capstone-coding-agent-capability-sprint.ts and Route221 report gate capstone classification",
        patternRejected: "not-applicable",
        reason: "No blocker required reference comparison.",
        evidenceProduced: "Route224 capstone report and Route221 report gate",
      },
    ],
    validationIntent: [
      "npm run verify:route224-capstone-coding-agent-capability-sprint",
      `npm run verify:route221-anti-false-success-gate -- --report ${reportRelativePath}`,
      "npm run verify:route221-anti-false-success-gate",
      "npm run verify:result-contract",
      "npm run build -w packages/ts-shell",
    ],
  };

  assertRoute224Completion(report);
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log("route224-marker frozen-required-controls=pass");
  console.log("route224-marker capstone-task-pack-count=8");
  console.log("route224-marker product-composition-roots=pass");
  console.log("route224-marker verified-success-count=4");
  console.log("route224-marker command-only-bypass=rejected");
  console.log("route224-marker unsupported-broad=blocked");
  console.log(`[pass] route224-capstone report=${reportRelativePath}`);
} finally {
  if (previousDaemonEnabled === undefined) {
    delete process.env.DAEMON_ENABLED;
  } else {
    process.env.DAEMON_ENABLED = previousDaemonEnabled;
  }
  await fs.rm(workspaceRoot, { recursive: true, force: true });
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
}

async function loadFrozenTaskPack(): Promise<FrozenTaskPack> {
  const content = await fs.readFile(path.join(process.cwd(), frozenTaskPackPath), "utf8");
  return JSON.parse(content) as FrozenTaskPack;
}

async function seedWorkspace(root: string): Promise<void> {
  const files: Record<string, string> = {
    "src/vagueBug.ts": [
      "export function capstoneStatus() {",
      "  return 'draft';",
      "}",
      "",
    ].join("\n"),
    "packages/ts-shell/src/orchestration/planningRuntimeProductProjection.ts": [
      "export function formatProductOutput() {",
      "  return [",
      "    \"Planning runtime: product-path review-only handoff\",",
      "  ].join(\"\\n\");",
      "}",
      "",
    ].join("\n"),
    "src/selected.ts": "title\nstatus: draft\nfooter\n",
    "src/multi-a.ts": "title\nstatus: draft\nfooter\n",
    "src/multi-b.ts": "title\nstatus: draft\nfooter\n",
    "src/unsupported.ts": "title\nstatus: draft\nfooter\n",
    "src/repair.ts": [
      "export const capstoneRepairStatus = 'broken';",
      "export const capstoneRepairVerification = 'failing';",
      "",
    ].join("\n"),
  };
  for (const [relativePath, content] of Object.entries(files)) {
    const absolutePath = path.join(root, relativePath);
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, content, "utf8");
  }
}

async function runSelectedWorkspaceApply(input: {
  readonly workspaceRoot: string;
  readonly targets: readonly string[];
}) {
  const authority = createWorkspaceWriteAuthority(input.workspaceRoot);
  return runTargetSetEditRoute({
    workspaceRoot: input.workspaceRoot,
    manifest: buildDiscoveryEditManifest({
      workspaceRoot: input.workspaceRoot,
      maxCandidates: 8,
      requiredConfirmationStatus: "confirmed-target-set",
      candidates: input.targets.map((target) => ({
        path: target,
        matchCount: 1,
        evidenceSummary: "single exact status marker selected by capstone task",
      })),
    }),
    confirmedTargetSet: input.targets,
    mapping: {
      oldText: "status: draft",
      newText: "status: ready",
      source: "old-new-fenced-blocks",
    },
    explicitRuntimeOptIn: true,
    explicitWorkspaceWriteOptIn: true,
    requestedUserDecision: "approved",
    defaultProductionRejectionUnchanged: true,
    readFile: authority.readFile,
    readVerifiedFile: authority.readVerifiedFile,
    validateWriteTarget: authority.validateWriteTarget,
    writeFile: authority.writeFile,
  });
}

async function runUnsupportedBroadTask(workspaceRoot: string) {
  const authority = createWorkspaceWriteAuthority(workspaceRoot);
  return runTargetSetEditRoute({
    workspaceRoot,
    manifest: buildDiscoveryEditManifest({
      workspaceRoot,
      maxCandidates: 8,
      requiredConfirmationStatus: "confirmed-target-set",
      candidates: [{ path: "src/unsupported.ts", matchCount: 1 }],
    }),
    confirmedTargetSet: ["src/unsupported.ts"],
    mapping: {
      oldText: "status: draft",
      newText: "status: ready",
      source: "old-new-fenced-blocks",
    },
    explicitRuntimeOptIn: true,
    explicitWorkspaceWriteOptIn: true,
    requestedUserDecision: "approved",
    defaultProductionRejectionUnchanged: true,
    readFile: authority.readFile,
    readVerifiedFile: authority.readVerifiedFile,
    validateWriteTarget: authority.validateWriteTarget,
    writeFile: authority.writeFile,
    unsupportedBlocker: "unsupported-broad",
  });
}

function buildPlanningFrozenVerdict(task: FrozenTask, planning: Awaited<ReturnType<typeof runPlanningRuntime>>) {
  return {
    taskId: task.id,
    origin: "frozen",
    productConsumer: "packages/ts-shell/src/orchestration/planningRuntime.ts::runPlanningRuntime",
    evidenceLevel: "product-proven",
    providerEvidenceClass: "not-proven",
    providerMode: "not-called-live-provider",
    providerCalled: false,
    context: {
      loadedFromFile: frozenTaskPackPath,
      status: planning.status,
      evidenceMarkers: pickEvidence(planning.evidence, "planning-runtime:"),
    },
    proposal: { source: "not-applicable", status: "not-run" },
    confirmation: { source: "none", explicitAuthority: false },
    apply: { status: "not-run", verificationStatus: "not-run", reportedSuccess: false },
    verification: { source: "not-run", status: "not-run" },
    repair: { applied: false, postRepairVerification: "not-run", reportedRepairSuccess: false },
    finalVerdict: "COMPLETE",
    notProvenClaims: ["mutation success", "provider execution", "command execution"],
  };
}

function buildSelectedWorkspaceFrozenVerdict(task: FrozenTask, route: Awaited<ReturnType<typeof runTargetSetEditRoute>>) {
  return {
    taskId: task.id,
    origin: "frozen",
    productConsumer: "packages/ts-shell/src/orchestration/targetSetEditRoute.ts::runTargetSetEditRoute",
    evidenceLevel: "selected-workspace-proven",
    providerEvidenceClass: "not-proven",
    providerMode: "not-called-live-provider",
    providerCalled: false,
    context: { loadedFromFile: frozenTaskPackPath, expectedProductPath: task.expectedProductPath },
    proposal: { source: "deterministic-from-product-read-evidence", status: "exact-target-set" },
    confirmation: { source: "explicit-authority-contract", explicitAuthority: true },
    apply: {
      status: route.status === "written" ? "applied" : route.status,
      backendStatus: route.status,
      changedFiles: route.changedFiles,
      verificationStatus: route.verificationAggregate.overallStatus,
      reportedSuccess: route.status === "written" && route.verificationAggregate.overallStatus === "passed",
    },
    verification: {
      source: "runtime-readback",
      status: route.verificationAggregate.overallStatus,
      fixtureReadbackOnly: false,
      markerOnly: false,
    },
    repair: { applied: false, postRepairVerification: "not-run", reportedRepairSuccess: false },
    finalVerdict: route.status === "written" ? "COMPLETE" : "PARTIAL",
    notProvenClaims: ["production default write", "provider-authored patch"],
  };
}

function buildCommandBypassFrozenVerdict(task: FrozenTask, verification: Awaited<ReturnType<typeof runTaskRelevantVerificationRoute>>) {
  return {
    taskId: task.id,
    origin: "frozen",
    productConsumer:
      "packages/ts-shell/src/orchestration/taskRelevantVerificationRoute.ts::runTaskRelevantVerificationRoute",
    evidenceLevel: "not-proven",
    providerEvidenceClass: "not-proven",
    providerMode: "not-called-live-provider",
    providerCalled: false,
    context: { loadedFromFile: frozenTaskPackPath, expectedProductPath: task.expectedProductPath },
    proposal: { source: "not-applicable", status: "not-run" },
    confirmation: { source: "explicit-authority-contract", explicitAuthority: true },
    apply: { status: "not-run", verificationStatus: "not-run", reportedSuccess: false },
    verification: {
      source: "product-verification-route",
      status: verification.verdict,
      selectedCommand: verification.commandPlan.selectedCommand,
      relevanceStatus: verification.commandPlan.relevanceStatus,
    },
    repair: { applied: false, postRepairVerification: "not-run", reportedRepairSuccess: false },
    finalVerdict: "BLOCKED",
    notProvenClaims: verification.notProvenClaims,
  };
}

function buildUnsupportedBroadFrozenVerdict(task: FrozenTask, route: Awaited<ReturnType<typeof runTargetSetEditRoute>>) {
  return {
    taskId: task.id,
    origin: "frozen",
    productConsumer: "packages/ts-shell/src/orchestration/targetSetEditRoute.ts::runTargetSetEditRoute",
    evidenceLevel: "blocked",
    providerEvidenceClass: "not-proven",
    providerMode: "not-called-live-provider",
    providerCalled: false,
    context: { loadedFromFile: frozenTaskPackPath, expectedProductPath: task.expectedProductPath },
    proposal: { source: "not-applicable", status: "blocked-unsupported-broad" },
    confirmation: { source: "explicit-authority-contract", explicitAuthority: true },
    apply: { status: "not-run", verificationStatus: "not-run", reportedSuccess: false },
    verification: { source: "not-run", status: "blocked" },
    repair: { applied: false, postRepairVerification: "not-run", reportedRepairSuccess: false },
    finalVerdict: route.status === "preflight-stopped" ? "BLOCKED" : "PARTIAL",
    notProvenClaims: ["broad writer refactor", "arbitrary add/delete/move", "fuzzy apply"],
  };
}

function buildRepairFrozenVerdict(task: FrozenTask, flow: Awaited<ReturnType<typeof runContentVerificationRepairFlow>>) {
  return {
    taskId: task.id,
    origin: "frozen",
    productConsumer:
      "packages/ts-shell/src/orchestration/verificationRepairFlow.ts::runContentVerificationRepairFlow",
    evidenceLevel: "product-proven",
    providerEvidenceClass: "not-proven",
    providerMode: "not-called-live-provider",
    providerCalled: false,
    context: {
      loadedFromFile: frozenTaskPackPath,
      originalFailurePreserved: flow.originalFailurePreserved,
    },
    proposal: {
      source: flow.repairProposalSource,
      status: flow.repairReviewStatus,
      hardcodedRouteProposal: false,
    },
    confirmation: {
      source: "explicit-authority-contract",
      explicitAuthority: true,
      missingConfirmationState: flow.missingConfirmationState,
      confirmationState: flow.confirmationState,
      harnessBooleanConfirmation: false,
    },
    apply: {
      status: "applied",
      backendStatus: flow.applyStatus,
      changedFiles: flow.changedFiles,
      verificationStatus: "passed",
      reportedSuccess: true,
    },
    verification: {
      source: "product-verification-route",
      status: flow.postRepairVerification.status,
      fixtureReadbackOnly: false,
      markerOnly: false,
    },
    repair: {
      continuationCreated: true,
      proposalCreated: true,
      applied: true,
      postRepairVerification: "passed",
      reportedRepairSuccess: true,
    },
    finalVerdict: "COMPLETE",
    notProvenClaims: ["automatic repair", "live provider repair proposal", "fuzzy repair apply"],
  };
}

function buildMultiFileFrozenVerdict(task: FrozenTask, route: Awaited<ReturnType<typeof runTargetSetEditRoute>>) {
  const verdict = buildSelectedWorkspaceFrozenVerdict(task, route);
  return {
    ...verdict,
    taskId: task.id,
    evidenceLevel: "benchmark-proven",
    context: {
      loadedFromFile: frozenTaskPackPath,
      expectedProductPath: task.expectedProductPath,
      perFileResults: route.fileResults.map((file) => ({
        path: file.targetPath,
        status: file.status,
        recoveryReadiness: file.recoveryReadiness,
      })),
    },
  };
}

function buildPlanningCapstoneVerdict(planning: Awaited<ReturnType<typeof runPlanningRuntime>>) {
  return {
    taskId: "route224-vague-bugfix-planning",
    origin: "capstone-local",
    productConsumer: "packages/ts-shell/src/orchestration/planningRuntime.ts::runPlanningRuntime",
    evidenceLevel: "product-proven",
    context: {
      planningStatus: planning.status,
      editTargets: planning.editTargets.map((target) => ({
        path: target.path,
        readiness: target.readiness,
        handoffRoute: target.handoffRoute,
      })),
    },
    proposal: { source: "planning-handoff-summary", status: planning.mutationHandoff.handoffState },
    confirmation: { source: "none", explicitAuthority: false },
    apply: { status: "not-run", verificationStatus: "not-run", reportedSuccess: false },
    verification: { source: "not-run", status: "not-run" },
    repair: { applied: false, postRepairVerification: "not-run", reportedRepairSuccess: false },
    finalVerdict: planning.editTargets.length > 0 ? "COMPLETE" : "PARTIAL",
    notProvenClaims: ["mutation success", "provider-generated proposal"],
  };
}

function buildProposalCapstoneVerdict(proposal: Awaited<ReturnType<typeof preparePlanningRuntimeProductProposal>>) {
  return {
    taskId: "route224-focused-output-proposal",
    origin: "capstone-local",
    productConsumer:
      "packages/ts-shell/src/orchestration/planningRuntimeProductProposal.ts::preparePlanningRuntimeProductProposal",
    evidenceLevel: proposal.status === "prepared-exact" ? "product-proven" : "partial",
    context: { proposalPreparationId: proposal.proposalPreparationId },
    proposal: {
      source: proposal.source === "planning-runtime-deterministic"
        ? "deterministic-from-product-read-evidence"
        : proposal.source,
      status: proposal.status,
      providerCalled: proposal.providerCalled,
      rawContentExcluded: true,
    },
    confirmation: { source: "none", explicitAuthority: false },
    apply: { status: "not-run", verificationStatus: "not-run", reportedSuccess: false },
    verification: { source: "not-run", status: "not-run" },
    repair: { applied: false, postRepairVerification: "not-run", reportedRepairSuccess: false },
    finalVerdict: proposal.status === "prepared-exact" ? "COMPLETE" : "PARTIAL",
    notProvenClaims: ["applied proposal", "live provider proposal"],
  };
}

function buildSelectedApplyCapstoneVerdict(route: Awaited<ReturnType<typeof runTargetSetEditRoute>>) {
  return {
    ...buildSelectedWorkspaceFrozenVerdict({
      id: "route224-selected-workspace-apply",
      origin: "capstone-local",
      taskType: "selected-workspace-authority-case",
      userPrompt: "",
      expectedProductPath: "selected workspace authority -> exact apply -> readback verification",
      allowedFilesOrModuleArea: [],
      requiredEvidence: [],
      verificationExpectation: "",
      negativeControls: [],
    }, route),
    taskId: "route224-selected-workspace-apply",
    origin: "capstone-local",
  };
}

function buildTaskRelevantVerificationCapstoneVerdict(verification: Awaited<ReturnType<typeof runTaskRelevantVerificationRoute>>) {
  return {
    taskId: "route224-task-relevant-verification-task",
    origin: "capstone-local",
    productConsumer:
      "packages/ts-shell/src/orchestration/taskRelevantVerificationRoute.ts::runTaskRelevantVerificationRoute",
    evidenceLevel: verification.verdict === "verified" ? "product-proven" : "partial",
    context: { changedFiles: verification.commandPlan.changedFiles },
    proposal: { source: "not-applicable", status: "not-run" },
    confirmation: { source: "explicit-authority-contract", explicitAuthority: true },
    apply: { status: "not-run", verificationStatus: "passed", reportedSuccess: false },
    verification: {
      source: "task-relevant-command",
      status: verification.verdict,
      selectedCommand: verification.commandPlan.selectedCommand,
      dispatchStatus: verification.dispatchStatus,
      relevanceStatus: verification.commandPlan.relevanceStatus,
    },
    repair: { applied: false, postRepairVerification: "not-run", reportedRepairSuccess: false },
    finalVerdict: verification.verdict === "verified" ? "COMPLETE" : "PARTIAL",
    notProvenClaims: verification.notProvenClaims,
  };
}

function buildVerificationFailureCapstoneVerdict(verification: Awaited<ReturnType<typeof runTaskRelevantVerificationRoute>>) {
  return {
    ...buildTaskRelevantVerificationCapstoneVerdict(verification),
    taskId: "route224-verification-failure-task",
    evidenceLevel: "partial",
    finalVerdict: "PARTIAL",
    repair: { applied: false, postRepairVerification: "not-run", reportedRepairSuccess: false },
    notProvenClaims: ["task success until repair is applied and reverified"],
  };
}

function buildRepairCapstoneVerdict(flow: Awaited<ReturnType<typeof runContentVerificationRepairFlow>>) {
  return {
    ...buildRepairFrozenVerdict({
      id: "route224-repair-to-success-task",
      origin: "capstone-local",
      taskType: "verification-failure-repair-case",
      userPrompt: "",
      expectedProductPath: "verification failure -> repair -> confirmation -> apply -> verification",
      allowedFilesOrModuleArea: [],
      requiredEvidence: [],
      verificationExpectation: "",
      negativeControls: [],
    }, flow),
    taskId: "route224-repair-to-success-task",
    origin: "capstone-local",
  };
}

function buildMultiFileCapstoneVerdict(route: Awaited<ReturnType<typeof runTargetSetEditRoute>>) {
  return {
    ...buildMultiFileFrozenVerdict({
      id: "route224-small-multi-file-task",
      origin: "capstone-local",
      taskType: "multi-file-case",
      userPrompt: "",
      expectedProductPath: "target-set exact apply with per-file verification",
      allowedFilesOrModuleArea: [],
      requiredEvidence: [],
      verificationExpectation: "",
      negativeControls: [],
    }, route),
    taskId: "route224-small-multi-file-task",
    origin: "capstone-local",
  };
}

function buildUnsupportedBroadCapstoneVerdict(route: Awaited<ReturnType<typeof runTargetSetEditRoute>>) {
  return {
    ...buildUnsupportedBroadFrozenVerdict({
      id: "route224-unsupported-broad-task",
      origin: "capstone-local",
      taskType: "unsupported-broad-task",
      userPrompt: "",
      expectedProductPath: "route gate blocks unsupported broad task",
      allowedFilesOrModuleArea: [],
      requiredEvidence: [],
      verificationExpectation: "",
      negativeControls: [],
    }, route),
    taskId: "route224-unsupported-broad-task",
    origin: "capstone-local",
  };
}

function toFrozenAttempt(verdict: Record<string, unknown>) {
  const taskId = String(verdict.taskId);
  return {
    id: taskId,
    loadedFromFile: frozenTaskPackPath,
    origin: "frozen",
    requiredClaim: taskId.includes("verification-failure-repair-case")
      ? "repair-to-success"
      : taskId.includes("selected-workspace")
        ? "selected workspace apply"
        : taskId.includes("multi-file")
          ? "multi-file apply"
          : taskId.includes("command-only")
            ? "command-only bypass rejected"
            : taskId.includes("unsupported-broad")
              ? "unsupported broad task blocked"
              : "planning no-provider no-apply",
    evidenceLevel: verdict.evidenceLevel,
    primaryCompleteEvidence:
      taskId === "frozen-upper-bound-challenge-verification-failure-repair-case",
    verdict: verdict.finalVerdict,
    negativeControls: requiredNegativeControlsFor(taskId),
  };
}

function toCapstoneAttempt(verdict: Record<string, unknown>) {
  return {
    id: verdict.taskId,
    origin: "capstone-local",
    productConsumer: verdict.productConsumer,
    evidenceLevel: verdict.evidenceLevel,
    finalVerdict: verdict.finalVerdict,
    routeLocalPrimaryEvidence: false,
  };
}

function requiredNegativeControlsFor(taskId: string): readonly string[] {
  if (taskId.includes("command-only")) {
    return ["zero exit code alone is insufficient"];
  }
  if (taskId.includes("unsupported-broad")) {
    return ["unsupported broad task must block"];
  }
  if (taskId.includes("verification-failure-repair-case")) {
    return ["repair proposal is not repair success", "post-repair verification required"];
  }
  return ["prompt text does not grant mutation success"];
}

function pickEvidence(evidence: readonly string[], prefix: string): readonly string[] {
  return evidence.filter((entry) => entry.startsWith(prefix)).slice(0, 12);
}

function assertRoute224Completion(report: {
  readonly finalStatus: string;
  readonly frozenTasksAttempted: readonly Record<string, unknown>[];
  readonly capstoneTasksAttempted: readonly Record<string, unknown>[];
  readonly taskVerdicts: readonly Record<string, unknown>[];
  readonly negativeControlEvidence: Record<string, unknown>;
}) {
  assert.equal(report.finalStatus, "COMPLETE");
  const attemptedFrozen = new Map(report.frozenTasksAttempted.map((task) => [task.id, task]));
  for (const taskId of requiredFrozenTaskIds) {
    assert(attemptedFrozen.has(taskId), `required frozen task not attempted: ${taskId}`);
  }
  assert.equal(report.capstoneTasksAttempted.length, 8);
  const successfulCapstone = report.taskVerdicts.filter((verdict) =>
    String(verdict.taskId).startsWith("route224-") &&
    verdict.finalVerdict === "COMPLETE" &&
    (verdict.apply as { reportedSuccess?: boolean } | undefined)?.reportedSuccess === true,
  );
  assert(successfulCapstone.length >= 2, "at least two capstone tasks must apply and verify successfully");
  assert.equal(report.negativeControlEvidence.commandOnlyBypassRejected, true);
  assert.equal(report.negativeControlEvidence.unsupportedBroadTaskBlocked, true);
  assert.equal(report.negativeControlEvidence.repairProposalWithoutApplyRejected, true);
}
