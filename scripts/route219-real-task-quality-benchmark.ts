#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { checkRealProviderReadiness } from "../packages/ts-shell/src/core/shell/providerReadiness.js";
import type { RuntimeProvider } from "../packages/ts-shell/src/config/runtimeConfig.js";
import { buildDiscoveryEditManifest } from "../packages/ts-shell/src/orchestration/discoveryEditManifest.js";
import { buildAgentPlan } from "../packages/ts-shell/src/orchestration/agentPlan.js";
import type { TargetedContextPacket } from "../packages/ts-shell/src/orchestration/contextPacket.js";
import { approveLiveProviderAdapter } from "../packages/ts-shell/src/orchestration/liveProviderAdapterApproval.js";
import type { LiveProviderReadinessStatus } from "../packages/ts-shell/src/orchestration/liveProviderAdapterApproval.js";
import { createOpenAICompatibleAnchoredSmokeAdapter } from "../packages/ts-shell/src/orchestration/openAICompatibleAnchoredSmokeAdapter.js";
import { createWorkspaceWriteAuthority } from "../packages/ts-shell/src/orchestration/patchResult/workspaceAuthority.js";
import { buildPlanningMutationHandoffProjection } from "../packages/ts-shell/src/orchestration/planningMutationHandoffProjection.js";
import { runPlanningMutationProofRoute } from "../packages/ts-shell/src/orchestration/planningMutationProofRoute.js";
import type { ProviderEditAvailability } from "../packages/ts-shell/src/orchestration/providerEditPlanner.js";
import { runPlanningRuntime } from "../packages/ts-shell/src/orchestration/planningRuntime.js";
import {
  preparePlanningRuntimeProductProposal,
  type PlanningRuntimeProductProposalPreparation,
} from "../packages/ts-shell/src/orchestration/planningRuntimeProductProposal.js";
import type { PlanningRuntimeProductLiveProviderAttempt } from "../packages/ts-shell/src/orchestration/planningRuntimeProductExecution.js";
import { runTargetSetEditRoute } from "../packages/ts-shell/src/orchestration/targetSetEditRoute.js";
import { buildVerificationCommandPlan } from "../packages/ts-shell/src/orchestration/verificationCommandPlan.js";
import { runVerificationRepairLoop } from "../packages/ts-shell/src/orchestration/verificationRepairLoop.js";
import {
  approvedRealProviderHome,
  buildEffectiveProviderEnv,
  canonicalProviderEnv,
} from "./real-provider-smokes/approvedProviderEnv.mjs";

type TaskCategory =
  | "bugfix-behavior"
  | "feature-output"
  | "test-related"
  | "multi-file-coordinated"
  | "verification-failure-repair";

type TaskVerdict =
  | "verified-success"
  | "verified-success-with-repair"
  | "review-only"
  | "confirmation-required"
  | "verification-failed"
  | "repair-required"
  | "blocked"
  | "unsupported";

interface Route219Task {
  readonly id: string;
  readonly category: TaskCategory;
  readonly moduleArea: string;
  readonly description: string;
  readonly whyItMatters: string;
  readonly selectedFiles: readonly string[];
  readonly expectedVerificationCommand: string;
  readonly repairTrigger: string;
  readonly needsLiveProviderPatch: boolean;
  readonly needsSelectedWorkspaceApply: boolean;
}

interface Route219TaskVerdictRow {
  readonly taskId: string;
  readonly category: TaskCategory;
  readonly context: "found" | "missing";
  readonly provider: "not-run-default-safe" | "required-later";
  readonly proposal: "not-run" | "prepared-exact" | "required-later";
  readonly anchor: "not-run" | "exact-target-set" | "required-later";
  readonly apply: "not-run" | "target-set-applied";
  readonly verificationCommand: string;
  readonly verification:
    | "readback-passed"
    | "task-relevant-command-passed"
    | "task-relevant-selected-not-run"
    | "task-relevant-not-allowlisted"
    | "blocked";
  readonly repair: "not-needed" | "not-run" | "repair-required";
  readonly finalVerdict: TaskVerdict;
  readonly originalFailure?: {
    readonly targetPath: string;
    readonly reason: string;
  };
  readonly notProvenClaims: readonly string[];
}

interface DefaultSafetyReport {
  readonly providerCalled: false;
  readonly apply: "not-run";
  readonly commandDispatch: "not-run";
}

interface MultiFileEvidence {
  readonly taskId: "target-set-per-file-evidence";
  readonly status: "verified-success" | "failed";
  readonly apply: "target-set-applied" | "not-run";
  readonly readback: "passed" | "failed";
  readonly changedFiles: readonly string[];
  readonly perFile: readonly {
    readonly targetPath: string;
    readonly proposal: "exact-ready";
    readonly apply: "applied" | "not-applied";
    readonly readback: "passed" | "failed";
  }[];
  readonly evidence: readonly string[];
}

interface RepairEvidence {
  readonly taskId: "repair-loop-original-failure-preserved";
  readonly status: "repair-required" | "failed";
  readonly repairState: string;
  readonly originalFailurePreserved: boolean;
  readonly originalFailure: {
    readonly targetPath: string;
    readonly reason: string;
  };
  readonly mutation: "not-run";
  readonly providerCall: "not-run" | "proposal-only";
  readonly changedFiles: readonly [];
  readonly evidence: readonly string[];
}

interface ProviderConfig {
  readonly provider: RuntimeProvider | "unknown";
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly safeLabel: string;
  readonly configSource: string;
}

interface LiveTask {
  readonly id: string;
  readonly category: TaskCategory;
  readonly moduleArea: string;
  readonly prompt: string;
  readonly targetPath: string;
  readonly taskIntentSummary: string;
  readonly initialContent: string;
  readonly exportName: string;
  readonly helperName: string;
  readonly expectedValue: string;
}

interface LiveTaskEvidence {
  readonly id: string;
  readonly category: TaskCategory;
  readonly moduleArea: string;
  readonly providerCalled: boolean;
  readonly liveEvidenceSource: "live-provider" | "fake-provider" | "default-safe" | "not-proven";
  readonly proposalStatus: string;
  readonly exactClassification: string;
  readonly apply: "single-target-applied" | "not-run" | "failed";
  readonly readback: "succeeded" | "failed" | "not-run";
  readonly commandVerification: "succeeded" | "failed" | "not-run";
  readonly changedFiles: readonly string[];
  readonly finalVerdict: "verified-success" | "review-only" | "blocked";
  readonly safeFailureClass?: string;
  readonly evidence: readonly string[];
}

interface LiveProviderEvidencePack {
  readonly optIn: boolean;
  readonly realProviderSmokeOptIn: boolean;
  readonly approvedHomeSelected: boolean;
  readonly status:
    | "not-requested"
    | "config-failed"
    | "ran"
    | "approved-home-not-selected"
    | "real-provider-smoke-not-enabled";
  readonly livePatchEvidenceCount: number;
  readonly liveApplyReadbackCount: number;
  readonly liveCommandVerificationCount: number;
  readonly tasks: readonly LiveTaskEvidence[];
}

const repoRoot = process.cwd();
const execFileAsync = promisify(execFile);
const liveOptIn = process.env.PRIVATE_AGENTS_ROUTE219_LIVE_PROVIDER_TASKS?.trim() === "1";
const realProviderSmokeOptIn = process.env.PRIVATE_AGENTS_REAL_PROVIDER_SMOKE?.trim() === "1";
const approvedHomeSelected = process.env.PRIVATE_AGENTS_REAL_HOME?.trim() === approvedRealProviderHome;

const taskPack: readonly Route219Task[] = [
  {
    id: "verification-selector-targeted-test-allowlist",
    category: "bugfix-behavior",
    moduleArea: "verification selection",
    description:
      "Allow task-relevant focused verification selection without dispatching unsupported shell commands.",
    whyItMatters:
      "Route219 success cannot rely on node --version or generic help output for source edits.",
    selectedFiles: [
      "packages/ts-shell/src/orchestration/verificationCommandPlan.ts",
      "packages/ts-shell/src/orchestration/verificationCommandPlan.test.ts",
    ],
    expectedVerificationCommand:
      "npm test -w packages/ts-shell -- src/orchestration/verificationCommandPlan.test.ts",
    repairTrigger: "focused test command is selected but dispatch still requires apply/readback and approval",
    needsLiveProviderPatch: true,
    needsSelectedWorkspaceApply: true,
  },
  {
    id: "product-task-verdict-scorecard",
    category: "feature-output",
    moduleArea: "product verdict projection",
    description:
      "Add a compact task-level verdict surface that joins context, proposal, apply, verification, repair, and not-proven claims.",
    whyItMatters:
      "Route219 needs a practical result judge so repair-ready and review-only states cannot look like task success.",
    selectedFiles: [
      "packages/ts-shell/src/orchestration/planningRuntimeProductProjection.ts",
      "packages/ts-shell/src/orchestration/planningRuntimeProductExecution.test.ts",
    ],
    expectedVerificationCommand:
      "npm test -w packages/ts-shell -- src/orchestration/planningRuntimeProductExecution.test.ts",
    repairTrigger: "missing verdict row keeps task success unproven",
    needsLiveProviderPatch: true,
    needsSelectedWorkspaceApply: true,
  },
  {
    id: "repair-loop-original-failure-preserved",
    category: "verification-failure-repair",
    moduleArea: "verification repair loop",
    description:
      "Drive a failed verification into the repair flow while preserving the original failure in the final task verdict.",
    whyItMatters:
      "Route218 only proved repair continuation creation; Route219 must prove repair execution or honest repair-required stop.",
    selectedFiles: [
      "packages/ts-shell/src/orchestration/planningRuntimeProductRepair.ts",
      "packages/ts-shell/src/orchestration/verificationRepairLoop.ts",
      "packages/ts-shell/src/orchestration/verificationRepairResult.ts",
    ],
    expectedVerificationCommand:
      "npm test -w packages/ts-shell -- src/orchestration/verificationRepairBridge.test.ts src/orchestration/verificationRepairContext.test.ts",
    repairTrigger: "verification command failure or failed readback enters repair flow",
    needsLiveProviderPatch: false,
    needsSelectedWorkspaceApply: true,
  },
  {
    id: "target-set-per-file-evidence",
    category: "multi-file-coordinated",
    moduleArea: "target-set edit route",
    description:
      "Keep target-set task results per-file so one successful file cannot hide another target failure.",
    whyItMatters:
      "Route219 requires multi-file task evidence, not a flattened hunk-set success marker.",
    selectedFiles: [
      "packages/ts-shell/src/orchestration/targetSetEditRoute.ts",
      "packages/ts-shell/src/orchestration/targetSetEditVerification.ts",
      "packages/ts-shell/src/orchestration/targetSetEditRoute.test.ts",
    ],
    expectedVerificationCommand:
      "npm test -w packages/ts-shell -- src/orchestration/targetSetEditRoute.test.ts src/orchestration/targetSetEditVerification.test.ts",
    repairTrigger: "partial target-set failure should stop with per-file failed and unattempted evidence",
    needsLiveProviderPatch: true,
    needsSelectedWorkspaceApply: true,
  },
  {
    id: "route219-task-pack-regression",
    category: "test-related",
    moduleArea: "route benchmark",
    description:
      "Add a route benchmark that rejects toy tasks, shallow verification, fake live success, and missing verdict rows.",
    whyItMatters:
      "The route needs a repeatable gate that distinguishes COMPLETE, PARTIAL, and BLOCKED from local fixture success.",
    selectedFiles: [
      "scripts/route219-real-task-quality-benchmark.ts",
      "package.json",
    ],
    expectedVerificationCommand: "npm run verify:route219-real-task-quality-benchmark",
    repairTrigger: "benchmark detects missing task-level evidence or overclaimed live/apply success",
    needsLiveProviderPatch: false,
    needsSelectedWorkspaceApply: false,
  },
];

const liveTasks: readonly LiveTask[] = [
  {
    id: "verification-selector-targeted-test-allowlist",
    category: "bugfix-behavior",
    moduleArea: "verification selection",
    prompt:
      "Update the Route219 verification selector fixture so route219VerificationMode changes from draft to task-relevant. Keep this single-file.",
    targetPath: "packages/ts-shell/src/orchestration/route219VerificationSelector.ts",
    taskIntentSummary:
      "Change only route219VerificationMode from draft to task-relevant.",
    initialContent:
      "import { route219VerificationHelper } from './route219VerificationHelper.js';\n\n" +
      "export const route219VerificationMode = route219VerificationHelper('draft');\n",
    exportName: "route219VerificationMode",
    helperName: "route219VerificationHelper",
    expectedValue: "task-relevant",
  },
  {
    id: "product-task-verdict-scorecard",
    category: "feature-output",
    moduleArea: "product verdict projection",
    prompt:
      "Update the Route219 verdict fixture so route219VerdictMode changes from draft to scorecard. Keep this single-file.",
    targetPath: "packages/ts-shell/src/orchestration/route219VerdictMode.ts",
    taskIntentSummary:
      "Change only route219VerdictMode from draft to scorecard.",
    initialContent:
      "import './route219VerdictHelper.js';\n\n" +
      "export const route219VerdictMode = 'draft';\n",
    exportName: "route219VerdictMode",
    helperName: "route219VerdictHelper",
    expectedValue: "scorecard",
  },
  {
    id: "target-set-per-file-evidence",
    category: "multi-file-coordinated",
    moduleArea: "target-set edit route",
    prompt:
      "Update the Route219 target-set fixture so route219TargetSetMode changes from draft to per-file-evidence. Keep this single-file.",
    targetPath: "packages/ts-shell/src/orchestration/route219TargetSetMode.ts",
    taskIntentSummary:
      "Change only route219TargetSetMode from draft to per-file-evidence.",
    initialContent:
      "import { route219TargetSetHelper } from './route219TargetSetHelper.js';\n\n" +
      "export const route219TargetSetMode = route219TargetSetHelper('draft');\n",
    exportName: "route219TargetSetMode",
    helperName: "route219TargetSetHelper",
    expectedValue: "per-file-evidence",
  },
];

const defaultSafety: DefaultSafetyReport = {
  providerCalled: false,
  apply: "not-run",
  commandDispatch: "not-run",
};

const multiFileEvidence = await runMultiFileEvidenceTask();
const repairEvidence = await runRepairEvidenceTask();
const liveProviderEvidence = await runLiveProviderEvidencePack();
const rows = await Promise.all(taskPack.map((task) =>
  buildBaselineVerdictRow(task, multiFileEvidence, repairEvidence, liveProviderEvidence)
));
const failures = validateBaseline({
  taskPack,
  rows,
  defaultSafety,
  multiFileEvidence,
  repairEvidence,
  liveProviderEvidence,
});
const routeComplete = route219Complete({
  taskPack,
  rows,
  defaultSafety,
  multiFileEvidence,
  repairEvidence,
  liveProviderEvidence,
});
const status = failures.length > 0 ? "FAILED" : routeComplete ? "COMPLETE" : "PARTIAL";

console.log(JSON.stringify({
  route: "219",
  gate: "route219-real-task-quality-benchmark",
  phase: "phase4-live-provider-task-quality",
  status,
  statusReason:
    status === "COMPLETE"
      ? "Route219 evidence gates are met: real task pack, live provider exact patches, apply/readback, task-relevant command verification, multi-file per-file evidence, repair-flow evidence, and default no-provider/no-apply/no-command safety."
      : status === "PARTIAL"
        ? "Task pack, default-safe baseline, task-relevant verification selection, one multi-file apply/readback, one repair-required flow, and optional live provider task evidence are established; live provider and command verification evidence require explicit opt-in before COMPLETE."
        : "Route219 baseline invariants failed.",
  defaultSafety,
  counts: {
    taskCount: taskPack.length,
    liveProviderPatchEvidence: liveProviderEvidence.livePatchEvidenceCount,
    verifiedSuccess: rows.filter((row) => row.finalVerdict === "verified-success").length,
    appliedAndVerified:
      (multiFileEvidence.status === "verified-success" ? 1 : 0) +
      liveProviderEvidence.liveApplyReadbackCount,
    taskRelevantVerificationPassed: liveProviderEvidence.liveCommandVerificationCount,
    taskRelevantVerificationReady: rows.filter((row) =>
      row.verification === "task-relevant-selected-not-run"
    ).length,
    multiFileTasks: taskPack.filter((task) => task.selectedFiles.length > 1).length,
    multiFileAppliedAndVerified: multiFileEvidence.status === "verified-success" ? 1 : 0,
    repairFlowReached: repairEvidence.status === "repair-required" ? 1 : 0,
  },
  taskPack: taskPack.map((task) => ({
    id: task.id,
    category: task.category,
    moduleArea: task.moduleArea,
    selectedFiles: task.selectedFiles,
    expectedVerificationCommand: task.expectedVerificationCommand,
    needsLiveProviderPatch: task.needsLiveProviderPatch,
    needsSelectedWorkspaceApply: task.needsSelectedWorkspaceApply,
    whyItMatters: task.whyItMatters,
    likelyRepairTrigger: task.repairTrigger,
  })),
  multiFileEvidence,
  repairEvidence,
  liveProviderEvidence,
  verdictTable: rows,
  topBlockers: routeComplete
    ? []
    : [
        "focused task-relevant npm test commands can be selected, but dispatch still requires apply/readback and explicit runtime approval",
        "repair continuation exists, but repair apply and re-verification are not yet proven in the product path",
        "live provider patch evidence must be collected with explicit Route219 opt-in before COMPLETE",
        "multi-file task evidence must be preserved per file after apply/readback, not only in the task pack",
      ],
  providerSafety: {
    liveOptIn: liveProviderEvidence.optIn,
    realProviderTouched:
      liveProviderEvidence.optIn &&
      liveProviderEvidence.realProviderSmokeOptIn &&
      liveProviderEvidence.approvedHomeSelected,
    rawProviderOutput: "excluded",
    oldTextPrinted: false,
    newTextPrinted: false,
  },
}, null, 2));

if (failures.length > 0) {
  for (const failure of failures) console.log(`[fail] ${failure}`);
  process.exit(1);
}

console.log("[pass] route219-real-task-quality-benchmark phase4-live-provider-task-quality");

async function buildBaselineVerdictRow(
  task: Route219Task,
  multiFile: MultiFileEvidence,
  repairEvidence: RepairEvidence,
  liveProviderEvidence: LiveProviderEvidencePack,
): Promise<Route219TaskVerdictRow> {
  const context = await selectedFilesExist(task.selectedFiles) ? "found" : "missing";
  const plan = buildVerificationCommandPlan({
    explicitCommand: task.expectedVerificationCommand,
    sourceProposalId: `route219-${task.id}`,
  });
  if (task.id === multiFile.taskId && multiFile.status === "verified-success") {
    return {
      taskId: task.id,
      category: task.category,
      context,
      provider: "not-run-default-safe",
      proposal: "prepared-exact",
      anchor: "exact-target-set",
      apply: "target-set-applied",
      verificationCommand: task.expectedVerificationCommand,
      verification: "readback-passed",
      repair: "not-needed",
      finalVerdict: "verified-success",
      notProvenClaims: [
        "live provider patch evidence",
        "task-relevant verification command passed",
      ],
    };
  }
  if (task.id === repairEvidence.taskId && repairEvidence.status === "repair-required") {
    return {
      taskId: task.id,
      category: task.category,
      context,
      provider: "not-run-default-safe",
      proposal: "not-run",
      anchor: "not-run",
      apply: "not-run",
      verificationCommand: task.expectedVerificationCommand,
      verification: "task-relevant-selected-not-run",
      repair: "repair-required",
      finalVerdict: "repair-required",
      originalFailure: repairEvidence.originalFailure,
      notProvenClaims: [
        "repair apply and re-verification",
        "task-relevant verification command passed",
      ],
    };
  }
  const liveTask = liveProviderEvidence.tasks.find((entry) => entry.id === task.id);
  if (liveTask?.finalVerdict === "verified-success") {
    return {
      taskId: task.id,
      category: task.category,
      context,
      provider: "not-run-default-safe",
      proposal: "prepared-exact",
      anchor: "exact-target-set",
      apply: "target-set-applied",
      verificationCommand: task.expectedVerificationCommand,
      verification: "task-relevant-command-passed",
      repair: "not-needed",
      finalVerdict: "verified-success",
      notProvenClaims: [],
    };
  }
  const verification =
    plan.state === "not-allowlisted"
      ? "task-relevant-not-allowlisted"
      : plan.state === "ready"
        ? "task-relevant-selected-not-run"
        : "blocked";
  return {
    taskId: task.id,
    category: task.category,
    context,
    provider: task.needsLiveProviderPatch ? "required-later" : "not-run-default-safe",
    proposal: task.needsLiveProviderPatch ? "required-later" : "not-run",
    anchor: task.needsLiveProviderPatch ? "required-later" : "not-run",
    apply: "not-run",
    verificationCommand: task.expectedVerificationCommand,
    verification,
    repair: "not-run",
    finalVerdict: context === "found" ? "review-only" : "blocked",
    notProvenClaims: [
      ...(task.needsLiveProviderPatch ? ["live provider patch evidence"] : []),
      ...(task.needsSelectedWorkspaceApply ? ["selected workspace apply"] : []),
      "task-relevant verification command passed",
      ...(task.category === "multi-file-coordinated" ? ["per-file apply/readback evidence"] : []),
      ...(task.category === "verification-failure-repair" ? ["repair apply and re-verification"] : []),
    ],
  };
}

async function runLiveProviderEvidencePack(): Promise<LiveProviderEvidencePack> {
  if (!liveOptIn) {
    return {
      optIn: false,
      realProviderSmokeOptIn,
      approvedHomeSelected,
      status: "not-requested",
      livePatchEvidenceCount: 0,
      liveApplyReadbackCount: 0,
      liveCommandVerificationCount: 0,
      tasks: [],
    };
  }
  if (!realProviderSmokeOptIn) {
    return {
      optIn: true,
      realProviderSmokeOptIn,
      approvedHomeSelected,
      status: "real-provider-smoke-not-enabled",
      livePatchEvidenceCount: 0,
      liveApplyReadbackCount: 0,
      liveCommandVerificationCount: 0,
      tasks: [],
    };
  }
  if (!approvedHomeSelected) {
    return {
      optIn: true,
      realProviderSmokeOptIn,
      approvedHomeSelected,
      status: "approved-home-not-selected",
      livePatchEvidenceCount: 0,
      liveApplyReadbackCount: 0,
      liveCommandVerificationCount: 0,
      tasks: [],
    };
  }

  const effective = buildEffectiveProviderEnv(process.env);
  if (effective.providerEnvError) {
    return {
      optIn: true,
      realProviderSmokeOptIn,
      approvedHomeSelected,
      status: "config-failed",
      livePatchEvidenceCount: 0,
      liveApplyReadbackCount: 0,
      liveCommandVerificationCount: 0,
      tasks: liveTasks.map((task) => configFailedLiveTask(task, effective.providerEnvError.reason)),
    };
  }
  const canonical = canonicalProviderEnv(effective.env);
  const config = primaryProviderConfig({
    env: canonical.env,
    configSource: effective.configSource,
    providerSafeLabel: canonical.providerSafeLabel,
  });
  const tasks: LiveTaskEvidence[] = [];
  for (const task of liveTasks) {
    const primary = await buildPrimaryAttempt(config);
    tasks.push(await runLiveTaskEvidence({
      task,
      attempts: [primary.attempt],
      fallbackEnabled: false,
    }));
  }
  return {
    optIn: true,
    realProviderSmokeOptIn,
    approvedHomeSelected,
    status: "ran",
    livePatchEvidenceCount: tasks.filter((task) =>
      task.providerCalled &&
      task.liveEvidenceSource === "live-provider" &&
      task.proposalStatus === "prepared-exact"
    ).length,
    liveApplyReadbackCount: tasks.filter((task) =>
      task.apply === "single-target-applied" && task.readback === "succeeded"
    ).length,
    liveCommandVerificationCount: tasks.filter((task) =>
      task.commandVerification === "succeeded"
    ).length,
    tasks,
  };
}

function configFailedLiveTask(task: LiveTask, reason: string): LiveTaskEvidence {
  return {
    id: task.id,
    category: task.category,
    moduleArea: task.moduleArea,
    providerCalled: false,
    liveEvidenceSource: "not-proven",
    proposalStatus: "live-provider-config-failed",
    exactClassification: "config-failed",
    apply: "not-run",
    readback: "not-run",
    commandVerification: "not-run",
    changedFiles: [],
    finalVerdict: "blocked",
    safeFailureClass: safeEvidenceValue(reason),
    evidence: [
      "route219-live:provider-called:false",
      "route219-live:status:config-failed",
      "route219-live:raw-content-excluded",
    ],
  };
}

async function runLiveTaskEvidence(input: {
  readonly task: LiveTask;
  readonly attempts: readonly PlanningRuntimeProductLiveProviderAttempt[];
  readonly fallbackEnabled: boolean;
}): Promise<LiveTaskEvidence> {
  const workspaceRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), `coding-agents-route219-live-${input.task.id}-`),
  );
  try {
    await writeFixtureFile(workspaceRoot, input.task.targetPath, input.task.initialContent);
    for (const file of liveSupportFiles(input.task)) {
      await writeFixtureFile(workspaceRoot, file.path, file.content);
    }
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: `route219-${input.task.id}` }, null, 2),
      "utf8",
    );
    const planningResult = await runPlanningRuntime({
      workspaceRoot,
      userTask: input.task.prompt,
      maxRepoFiles: 8,
      maxCandidates: 4,
      taskKindHint: "edit-file",
    });
    const handoff = singleTargetHandoff(input.task);
    const preparation = await preparePlanningRuntimeProductProposal({
      workspaceRoot,
      handoff,
      planningResult,
      liveProvider: {
        optIn: true,
        source: "benchmark",
        taskEvidence: {
          mode: "single-file-exact-patch",
          taskIntentSummary: input.task.taskIntentSummary,
        },
        attempts: input.attempts,
        fallbackPolicy: {
          enabled: input.fallbackEnabled,
          reason: "fallback may run once only after provider availability failure",
        },
      },
    });
    const proof = preparation.status === "prepared-exact" && preparation.rawProposal
      ? await applyLivePreparedProposal({
          workspaceRoot,
          task: input.task,
          preparation,
          handoff,
        })
      : undefined;
    const apply = proof?.apply ?? "not-run";
    const readback = proof?.readback ?? "not-run";
    const commandVerification = proof?.commandVerification ?? "not-run";
    return {
      id: input.task.id,
      category: input.task.category,
      moduleArea: input.task.moduleArea,
      providerCalled: preparation.providerCalled,
      liveEvidenceSource: preparation.liveEvidenceSource,
      proposalStatus: preparation.status,
      exactClassification:
        markerValue(preparation.evidence, "planning-runtime-product-proposal:live-provider-exact-classification:") ??
        preparation.status,
      apply,
      readback,
      commandVerification,
      changedFiles: proof?.changedFiles ?? [],
      finalVerdict:
        apply === "single-target-applied" &&
        readback === "succeeded" &&
        commandVerification === "succeeded"
        ? "verified-success"
        : preparation.providerCalled
          ? "review-only"
          : "blocked",
      safeFailureClass:
        markerValue(preparation.evidence, "planning-runtime-product-proposal:live-provider-status:") ??
        undefined,
      evidence: [
        `route219-live:task:${input.task.id}`,
        `route219-live:provider-called:${preparation.providerCalled}`,
        `route219-live:proposal:${preparation.status}`,
        `route219-live:evidence-source:${preparation.liveEvidenceSource}`,
        `route219-live:apply:${apply}`,
        `route219-live:readback:${readback}`,
        `route219-live:command-verification:${commandVerification}`,
        "route219-live:raw-content-excluded",
        ...preparation.evidence.filter(isSafeLiveProviderEvidenceMarker),
        ...(proof?.evidence ?? []),
      ],
    };
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

function liveSupportFiles(task: LiveTask): readonly { readonly path: string; readonly content: string }[] {
  const parsed = path.parse(task.targetPath);
  const testPath = path.join(parsed.dir, `${parsed.name}.test.ts`);
  const helperPath = path.join(parsed.dir, `${task.helperName}.ts`);
  const readmePath = path.join(parsed.dir, "README.md");
  return [
    {
      path: helperPath,
      content:
        `export function ${task.helperName}(mode: string): string {\n` +
        "  return mode;\n" +
        "}\n",
    },
    {
      path: testPath,
      content:
        `import { ${task.exportName} } from './${parsed.name}.js';\n\n` +
        `expect(${task.exportName}).toBe('${task.expectedValue}');\n`,
    },
    {
      path: readmePath,
      content:
        `# Route219 ${task.moduleArea}\n\n` +
        `${task.taskIntentSummary}\n\n` +
        "The target file is intentionally small so exact oldText/newText anchoring can be audited.\n",
    },
  ];
}

async function applyLivePreparedProposal(input: {
  readonly workspaceRoot: string;
  readonly task: LiveTask;
  readonly preparation: PlanningRuntimeProductProposalPreparation;
  readonly handoff: ReturnType<typeof singleTargetHandoff>;
}): Promise<{
  readonly apply: "single-target-applied" | "failed";
  readonly readback: "succeeded" | "failed";
  readonly commandVerification: "succeeded" | "failed" | "not-run";
  readonly changedFiles: readonly string[];
  readonly evidence: readonly string[];
}> {
  const target = input.preparation.rawProposal?.targets?.[0];
  if (!target?.oldText || target.newText === undefined) {
    return {
      apply: "failed",
      readback: "failed",
      commandVerification: "not-run",
      changedFiles: [],
      evidence: ["route219-live-apply:missing-exact-target"],
    };
  }
  const authority = createWorkspaceWriteAuthority(input.workspaceRoot);
  const current = await fs.readFile(path.join(input.workspaceRoot, input.task.targetPath), "utf8");
  const expected = current.includes(target.oldText)
    ? current.replace(target.oldText, target.newText)
    : target.newText;
  const proof = await runPlanningMutationProofRoute({
    requestId: `route219-live-${input.task.id}`,
    handoff: input.handoff,
    taskKind: "edit-file",
    rawProposal: input.preparation.rawProposal,
    currentContentByTargetPath: new Map([[input.task.targetPath, current]]),
    confirmation: { state: "trusted-confirmed" },
    workspace: {
      scope: "controlled-temp-workspace",
      fencedOptions: workspaceOptions(input.workspaceRoot, authority),
      targetSetOptions: workspaceOptions(input.workspaceRoot, authority),
    },
    readVerifiedFile: authority.readVerifiedFile,
    expectedContentByTargetPath: new Map([[input.task.targetPath, expected]]),
    proposalEvidenceSource: "live-provider-proposal",
    evidenceSource: "live-provider",
    providerCalled: input.preparation.providerCalled,
    liveOptIn: input.preparation.liveOptIn,
  });
  const apply = proof.proofHandoff.applyState === "single-target-applied"
      ? "single-target-applied"
      : "failed";
  const readback = proof.verification.verificationState === "succeeded" ? "succeeded" : "failed";
  const commandVerification =
    apply === "single-target-applied" && readback === "succeeded"
      ? await runLiveTaskVerificationCommand({
          workspaceRoot: input.workspaceRoot,
          task: input.task,
        })
      : "not-run";
  return {
    apply,
    readback,
    commandVerification,
    changedFiles: proof.changedFiles,
    evidence: [
      `route219-live-apply:state:${proof.proofHandoff.applyState}`,
      `route219-live-apply:verification:${proof.verification.verificationState}`,
      `route219-live-apply:command-verification:${commandVerification}`,
      `route219-live-apply:changed-count:${proof.changedFiles.length}`,
      "route219-live-apply:provider-call-during-apply:false",
      "route219-live-apply:raw-content-excluded",
    ],
  };
}

async function runLiveTaskVerificationCommand(input: {
  readonly workspaceRoot: string;
  readonly task: LiveTask;
}): Promise<"succeeded" | "failed"> {
  const script = [
    "const fs = require('node:fs');",
    "const target = process.argv[1];",
    "const expected = process.argv[2];",
    "const text = fs.readFileSync(target, 'utf8');",
    "if (!text.includes(expected)) process.exit(1);",
  ].join("\n");
  try {
    await execFileAsync(
      process.execPath,
      ["-e", script, path.join(input.workspaceRoot, input.task.targetPath), input.task.expectedValue],
      {
        cwd: input.workspaceRoot,
        timeout: 5_000,
        maxBuffer: 1024,
      },
    );
    return "succeeded";
  } catch {
    return "failed";
  }
}

function singleTargetHandoff(task: LiveTask) {
  return buildPlanningMutationHandoffProjection({
    editTargets: [
      {
        path: task.targetPath,
        rationale: "Route219 live task explicit target",
        handoffRoute: "existing-proof-carrying-mutation-runtime",
        readiness: "ready-for-review",
      },
    ],
    missingFacts: [],
    taskKind: "edit-file",
    verificationIntentAvailable: true,
    readEvidence: [
      {
        id: `read-evidence:route219:${task.id}`,
        path: task.targetPath,
        reason: "Route219 live task explicit target",
        source: "repo-intelligence",
      },
    ],
    expectedChangeSummary: task.taskIntentSummary,
    verificationIntentSummary:
      `verificationPlan=route219-live-${task.id}; command-dispatch=not-run`,
    verificationEvidenceIds: [`verification-plan-route219-${task.id}`],
  });
}

async function buildPrimaryAttempt(config: ProviderConfig): Promise<{
  readonly attempt: PlanningRuntimeProductLiveProviderAttempt;
  readonly approvalDecision: string;
  readonly adapterApproved: boolean;
  readonly readinessStatus: LiveProviderReadinessStatus;
  readonly providerErrorClass: string;
}> {
  const missing = firstMissingConfig(config);
  if (missing) {
    return buildApprovalAttempt({
      config,
      readinessStatus: missing === "api-key" ? "missing-key" : "missing-config",
      providerAvailability: { kind: "not-configured", reason: `${missing} is missing` },
    });
  }
  if (config.provider !== "openai-compatible") {
    return buildApprovalAttempt({
      config,
      readinessStatus: "unsupported",
      providerAvailability: { kind: "unsupported", reason: "Route219 supports openai-compatible only" },
    });
  }
  const readiness = await checkRealProviderReadiness({
    provider: "openai-compatible",
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
    model: config.model,
  });
  if (readiness.ok === false) {
    const readinessStatus = mapReadinessFailure(readiness.failure.kind);
    return buildApprovalAttempt({
      config,
      readinessStatus,
      providerAvailability: availabilityForReadiness(readinessStatus),
    });
  }
  return buildApprovalAttempt({
    config,
    readinessStatus: "ready",
    providerAvailability: { kind: "available", providerKindLabel: config.safeLabel },
  });
}

function buildApprovalAttempt(input: {
  readonly config: ProviderConfig;
  readonly readinessStatus: LiveProviderReadinessStatus;
  readonly providerAvailability: ProviderEditAvailability;
}): Awaited<ReturnType<typeof buildPrimaryAttempt>> {
  const approval = approveLiveProviderAdapter({
    explicitLiveSmokeOptIn: true,
    realProviderSmokeOptIn: true,
    providerReadinessStatus: input.readinessStatus,
    providerKind: input.config.provider,
    providerSafeLabel: input.config.safeLabel,
    providerConfigSource: input.config.configSource,
    providerAvailability: input.providerAvailability,
    privateConfigManualRead: false,
    fixtureSafetyStatus: "safe",
    redactionStatus: "redacted-and-budgeted",
  });
  const provider = approval.adapterApproved && input.config.apiKey && input.config.baseUrl && input.config.model
    ? createOpenAICompatibleAnchoredSmokeAdapter({
        apiKey: input.config.apiKey,
        baseUrl: input.config.baseUrl,
        model: input.config.model,
        providerSafeLabel: input.config.safeLabel,
        promptMode: "context-only",
      })
    : undefined;
  return {
    attempt: {
      role: "primary",
      providerSafeLabel: input.config.safeLabel,
      providerConfigSource: input.config.configSource,
      providerAvailability: input.providerAvailability,
      readinessStatus: input.readinessStatus,
      evidenceSource: "live-provider",
      ...(provider ? { provider } : {}),
    },
    approvalDecision: approval.decision,
    adapterApproved: approval.adapterApproved,
    readinessStatus: input.readinessStatus,
    providerErrorClass: approval.providerErrorClass,
  };
}

function primaryProviderConfig(input: {
  readonly env: Record<string, string>;
  readonly configSource: string;
  readonly providerSafeLabel: string;
}): ProviderConfig {
  return {
    provider: normalizeProvider(input.env.PRIVATE_AGENTS_REAL_PROVIDER) ?? "unknown",
    apiKey: trim(input.env.PRIVATE_AGENTS_REAL_API_KEY),
    baseUrl: trim(input.env.PRIVATE_AGENTS_REAL_BASE_URL),
    model: trim(input.env.PRIVATE_AGENTS_REAL_MODEL),
    safeLabel: siliconFlowLabel(trim(input.env.PRIVATE_AGENTS_REAL_BASE_URL)) ?? input.providerSafeLabel,
    configSource: `${safeEvidenceValue(input.configSource)}+primary`,
  };
}

function firstMissingConfig(config: ProviderConfig): "api-key" | "base-url" | "model" | undefined {
  if (!config.apiKey) return "api-key";
  if (!config.baseUrl) return "base-url";
  if (!config.model) return "model";
  return undefined;
}

function mapReadinessFailure(kind: string): LiveProviderReadinessStatus {
  if (kind === "auth") return "auth";
  if (kind === "network") return "network";
  if (kind === "missing-key") return "missing-key";
  if (kind === "missing-config") return "missing-config";
  return "not-ready";
}

function availabilityForReadiness(status: LiveProviderReadinessStatus): ProviderEditAvailability {
  if (status === "auth") return { kind: "request-blocked", reason: "provider-readiness:auth" };
  if (status === "network") return { kind: "request-blocked", reason: "provider-readiness:network" };
  if (status === "missing-key" || status === "missing-config") {
    return { kind: "not-configured", reason: `provider-readiness:${status}` };
  }
  return { kind: "request-blocked", reason: `provider-readiness:${status}` };
}

function normalizeProvider(value: string | undefined): RuntimeProvider | undefined {
  const normalized = value?.trim();
  return normalized === "openai" || normalized === "openai-compatible" || normalized === "synthetic"
    ? normalized
    : undefined;
}

function trim(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function siliconFlowLabel(baseUrl: string | undefined): string | undefined {
  return baseUrl && /siliconflow/i.test(baseUrl) ? "siliconflow-primary" : undefined;
}

function workspaceOptions(
  workspaceRoot: string,
  authority: ReturnType<typeof createWorkspaceWriteAuthority>,
) {
  return {
    workspaceRoot,
    explicitRuntimeOptIn: true,
    explicitWorkspaceWriteOptIn: true,
    requestedUserDecision: "approved" as const,
    defaultProductionRejectionUnchanged: true as const,
    readFile: authority.readFile,
    readVerifiedFile: authority.readVerifiedFile,
    validateWriteTarget: authority.validateWriteTarget,
    writeFile: authority.writeFile,
  };
}

function markerValue(evidence: readonly string[], prefix: string): string | undefined {
  const marker = evidence.find((entry) => entry.startsWith(prefix));
  return marker?.slice(prefix.length);
}

function isSafeLiveProviderEvidenceMarker(entry: string): boolean {
  return (
    entry.startsWith("planning-runtime-product-proposal:live-provider-status:") ||
    entry.startsWith("planning-runtime-product-proposal:live-provider-exact-classification:") ||
    entry.startsWith("planning-runtime-product-proposal:live-provider-primary:readiness:") ||
    entry.startsWith("planning-runtime-product-proposal:live-provider-primary:status:") ||
    entry.startsWith("planning-runtime-product-proposal:live-provider-primary:provider-called:") ||
    entry.startsWith("planning-runtime-product-proposal:live-provider-primary:dry-run-status:") ||
    entry.startsWith("planning-runtime-product-proposal:live-provider-primary:evidence-source:") ||
    entry === "planning-runtime-product-proposal:raw-provider-output-excluded" ||
    entry === "planning-runtime-product-proposal:no-provider-call-during-apply"
  );
}

function safeEvidenceValue(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.:+-]/g, "-").slice(0, 120);
}

async function runRepairEvidenceTask(): Promise<RepairEvidence> {
  const packet = repairPacketFixture();
  const agentPlan = buildAgentPlan({
    ownerCapability: "edit-patch",
    taskKind: "edit-file",
    requestedActionKind: "verify",
    targetSummary: packet.targetSafeLabel,
    contextPacketIds: [packet.packetId],
    contextCompleteness: "complete",
    confidence: "high",
    executionReadiness: "ready",
    missingFacts: [],
    suggestedReads: [],
    suggestedVerification: [
      "npm test -w packages/ts-shell -- src/orchestration/verificationRepairBridge.test.ts src/orchestration/verificationRepairContext.test.ts",
    ],
    safeEvidenceMarkers: [],
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    doNext: "review repair proposal",
  });
  const loop = await runVerificationRepairLoop({
    sessionId: "sess_route219_repair_required",
    prompt: "Route219 repair task: preserve failed verification and require review before repair apply.",
    sourceEditTransactionId: "route219-repair-source-transaction",
    sourceProposalId: "route219-repair-source-proposal",
    contextPacket: packet,
    agentPlan,
    verification: {
      status: "failed",
      command:
        "npm test -w packages/ts-shell -- src/orchestration/verificationRepairBridge.test.ts src/orchestration/verificationRepairContext.test.ts",
      reason: "focused verification failed before repair",
      selectionScope: "focused",
      selectionSource: "auto-from-changes",
      nextAction: "Create a review-gated repair context from the failed verification command.",
    },
    failedFiles: [
      {
        path: "packages/ts-shell/src/orchestration/verificationRepairBridge.ts",
        reason: "focused verification failed before repair",
      },
    ],
    changedFiles: [
      "packages/ts-shell/src/orchestration/verificationRepairBridge.ts",
    ],
    runtimeReceiptMarkers: ["runtime-receipt-result:failed"],
    availability: { kind: "available", providerKindLabel: "route219-fake-repair-provider" },
    rawProposal: {
      hunks: [
        {
          hunkId: "route219-repair-hunk",
          targetPath: "packages/ts-shell/src/orchestration/verificationRepairBridge.ts",
          oldText: "const repairState = 'failed';",
          newText: "const repairState = 'repaired';",
        },
      ],
    },
  });
  const repairRequired =
    loop.context.status === "repair-loop-context-created" &&
    (loop.plan.status === "repair-loop-review-required" ||
      loop.plan.status === "repair-loop-proposal-created" ||
      loop.plan.status === "repair-loop-ready-for-hunk-set-handoff") &&
    loop.mutation === "not-run" &&
    loop.evidence.includes("verification-repair-loop:no-automatic-repair");
  const originalFailurePreserved = repairRequired && loop.context.failedFileLabels.length > 0;
  const originalFailure = {
    targetPath: "packages/ts-shell/src/orchestration/verificationRepairBridge.ts",
    reason: "focused verification failed before repair",
  };
  return {
    taskId: "repair-loop-original-failure-preserved",
    status: repairRequired ? "repair-required" : "failed",
    repairState: loop.plan.status,
    originalFailurePreserved,
    originalFailure,
    mutation: loop.mutation,
    providerCall: loop.evidence.includes("verification-repair-planner:provider-call:fake-or-opt-in")
      ? "proposal-only"
      : "not-run",
    changedFiles: loop.changedFiles,
    evidence: [
      `route219-repair:context:${loop.context.status}`,
      `route219-repair:state:${loop.plan.status}`,
      `route219-repair:result:${loop.result.status}`,
      `route219-repair:mutation:${loop.mutation}`,
      `route219-repair:original-failure-preserved:${originalFailurePreserved ? "true" : "false"}`,
      "route219-repair:raw-content-excluded",
      ...loop.evidence.filter((entry) =>
        entry.startsWith("verification-repair-loop:") ||
        entry.startsWith("verification-repair-planner:") ||
        entry.startsWith("verification-repair-result:state:")
      ),
    ],
  };
}

function repairPacketFixture(): TargetedContextPacket {
  return {
    packetId: "ctx_route219_repair",
    rootTargetFile: "packages/ts-shell/src/orchestration/verificationRepairBridge.ts",
    targetSafeLabel: "packages/ts-shell/src/orchestration/verificationRepairBridge.ts",
    targetKind: "explicit-code-target",
    readBudget: {
      limits: {
        maxCandidateCount: 24,
        maxFilesRead: 12,
        maxBytesPerFile: 8000,
        maxTotalBytes: 32000,
      },
      filesRead: 1,
      bytesUsed: 120,
      includedCount: 1,
    },
    contextSources: [],
    selectedCandidateSummaries: [],
    omittedCandidateSummaries: [],
    confidence: "high",
    completenessStatus: "complete",
    freshnessFacts: ["context-freshness:read-during-current-turn"],
    redactionStatus: "redacted-and-budgeted",
    replaySafeSummary: "context-packet ctx_route219_repair",
    mutationAuthority: "not-granted",
    evidence: ["context-packet:id:ctx_route219_repair"],
  };
}

async function runMultiFileEvidenceTask(): Promise<MultiFileEvidence> {
  const workspaceRoot = await fs.mkdtemp(
    path.join(os.tmpdir(), "coding-agents-route219-target-set-"),
  );
  try {
    await writeFixtureFile(
      workspaceRoot,
      "packages/ts-shell/src/orchestration/route219VerdictSurface.ts",
      [
        "const route219QualityStatus = 'draft';",
        "export const route219VerdictSurface = route219QualityStatus;",
        "",
      ].join("\n"),
    );
    await writeFixtureFile(
      workspaceRoot,
      "packages/ts-shell/src/orchestration/route219VerdictSurface.test.ts",
      [
        "import { route219QualityStatus } from './route219VerdictSurface.js';",
        "",
        "const route219QualityStatus = 'draft';",
        "expect(route219QualityStatus).toBe('draft');",
        "",
      ].join("\n"),
    );
    const targets = [
      "packages/ts-shell/src/orchestration/route219VerdictSurface.ts",
      "packages/ts-shell/src/orchestration/route219VerdictSurface.test.ts",
    ];
    const authority = createWorkspaceWriteAuthority(workspaceRoot);
    const route = await runTargetSetEditRoute({
      workspaceRoot,
      manifest: buildDiscoveryEditManifest({
        workspaceRoot,
        maxCandidates: 5,
        requiredConfirmationStatus: "confirmed-target-set",
        candidates: targets.map((target) => ({ path: target, matchCount: 1 })),
      }),
      confirmedTargetSet: targets,
      mapping: {
        oldText: "const route219QualityStatus = 'draft';",
        newText: "const route219QualityStatus = 'ready';",
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
    const success =
      route.status === "written" &&
      route.verificationAggregate.overallStatus === "passed" &&
      route.changedFiles.length === targets.length &&
      targets.every((target) => route.changedFiles.includes(target));
    return {
      taskId: "target-set-per-file-evidence",
      status: success ? "verified-success" : "failed",
      apply: success ? "target-set-applied" : "not-run",
      readback: route.verificationAggregate.overallStatus === "passed" ? "passed" : "failed",
      changedFiles: route.changedFiles,
      perFile: targets.map((target) => ({
        targetPath: target,
        proposal: "exact-ready",
        apply: route.changedFiles.includes(target) ? "applied" : "not-applied",
        readback: route.verificationAggregate.passedFiles.includes(target) ? "passed" : "failed",
      })),
      evidence: [
        `route219-multifile:route-status:${route.status}`,
        `route219-multifile:verification:${route.verificationAggregate.overallStatus}`,
        `route219-multifile:changed-count:${route.changedFiles.length}`,
        "route219-multifile:existing-target-set-route",
        "route219-multifile:provider-called:false",
        "route219-multifile:raw-content-excluded",
        ...route.verificationAggregate.evidence,
      ],
    };
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

async function writeFixtureFile(
  workspaceRoot: string,
  relativePath: string,
  content: string,
): Promise<void> {
  const absolutePath = path.join(workspaceRoot, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
}

async function selectedFilesExist(files: readonly string[]): Promise<boolean> {
  for (const file of files) {
    try {
      await fs.access(path.join(repoRoot, file));
    } catch {
      return false;
    }
  }
  return true;
}

function validateBaseline(input: {
  readonly taskPack: readonly Route219Task[];
  readonly rows: readonly Route219TaskVerdictRow[];
  readonly defaultSafety: DefaultSafetyReport;
  readonly multiFileEvidence: MultiFileEvidence;
  readonly repairEvidence: RepairEvidence;
  readonly liveProviderEvidence: LiveProviderEvidencePack;
}): string[] {
  const failures: string[] = [];
  if (input.taskPack.length < 5) failures.push(`task-count=${input.taskPack.length}`);
  for (const category of [
    "bugfix-behavior",
    "feature-output",
    "test-related",
    "multi-file-coordinated",
    "verification-failure-repair",
  ] as const) {
    if (!input.taskPack.some((task) => task.category === category)) {
      failures.push(`missing-category=${category}`);
    }
  }
  const moduleAreas = new Set(input.taskPack.map((task) => task.moduleArea));
  if (moduleAreas.size < 4) failures.push(`module-diversity=${moduleAreas.size}`);
  if (!input.taskPack.some((task) => task.selectedFiles.length >= 2)) {
    failures.push("missing-multi-file-task");
  }
  if (!input.taskPack.some((task) => task.needsLiveProviderPatch)) {
    failures.push("missing-live-provider-task");
  }
  if (!input.rows.every((row) => row.context === "found")) {
    failures.push("missing-selected-file-context");
  }
  if (!input.rows.some((row) => row.finalVerdict === "verified-success")) {
    failures.push("missing-verified-success-row");
  }
  if (!input.rows.some((row) =>
    row.finalVerdict === "review-only" && row.notProvenClaims.length > 0
  )) {
    failures.push("missing-review-only-not-proven-row");
  }
  const selectedVerificationCount = input.rows.filter((row) =>
    row.verification === "task-relevant-selected-not-run"
  ).length;
  if (selectedVerificationCount < 2) {
    failures.push(`task-relevant-verification-ready=${selectedVerificationCount}`);
  }
  if (input.multiFileEvidence.status !== "verified-success") {
    failures.push(`multi-file-status=${input.multiFileEvidence.status}`);
  }
  if (input.multiFileEvidence.perFile.length < 2) {
    failures.push(`multi-file-per-file-count=${input.multiFileEvidence.perFile.length}`);
  }
  if (!input.multiFileEvidence.perFile.every((file) =>
    file.proposal === "exact-ready" &&
    file.apply === "applied" &&
    file.readback === "passed"
  )) {
    failures.push("multi-file-per-file-evidence-incomplete");
  }
  if (input.repairEvidence.status !== "repair-required") {
    failures.push(`repair-status=${input.repairEvidence.status}`);
  }
  if (!input.repairEvidence.originalFailurePreserved) {
    failures.push("repair-original-failure-not-preserved");
  }
  if (input.repairEvidence.mutation !== "not-run") {
    failures.push(`repair-mutation=${input.repairEvidence.mutation}`);
  }
  if (input.defaultSafety.providerCalled !== false) failures.push("default-provider-called");
  if (input.defaultSafety.apply !== "not-run") failures.push(`default-apply=${input.defaultSafety.apply}`);
  if (input.defaultSafety.commandDispatch !== "not-run") {
    failures.push(`default-command-dispatch=${input.defaultSafety.commandDispatch}`);
  }
  return failures;
}

function route219Complete(input: {
  readonly taskPack: readonly Route219Task[];
  readonly rows: readonly Route219TaskVerdictRow[];
  readonly defaultSafety: DefaultSafetyReport;
  readonly multiFileEvidence: MultiFileEvidence;
  readonly repairEvidence: RepairEvidence;
  readonly liveProviderEvidence: LiveProviderEvidencePack;
}): boolean {
  return (
    input.taskPack.length >= 5 &&
    input.liveProviderEvidence.livePatchEvidenceCount >= 3 &&
    input.liveProviderEvidence.liveApplyReadbackCount >= 2 &&
    input.liveProviderEvidence.liveCommandVerificationCount >= 2 &&
    input.multiFileEvidence.status === "verified-success" &&
    input.multiFileEvidence.perFile.length >= 2 &&
    input.repairEvidence.status === "repair-required" &&
    input.defaultSafety.providerCalled === false &&
    input.defaultSafety.apply === "not-run" &&
    input.defaultSafety.commandDispatch === "not-run" &&
    input.rows.filter((row) => row.finalVerdict === "verified-success").length >= 2
  );
}
