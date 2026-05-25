#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { checkRealProviderReadiness } from "../packages/ts-shell/src/core/shell/providerReadiness.js";
import type { RuntimeProvider } from "../packages/ts-shell/src/config/runtimeConfig.js";
import { approveLiveProviderAdapter } from "../packages/ts-shell/src/orchestration/liveProviderAdapterApproval.js";
import type { LiveProviderReadinessStatus } from "../packages/ts-shell/src/orchestration/liveProviderAdapterApproval.js";
import { createOpenAICompatibleAnchoredSmokeAdapter } from "../packages/ts-shell/src/orchestration/openAICompatibleAnchoredSmokeAdapter.js";
import { buildPlanningMutationHandoffProjection } from "../packages/ts-shell/src/orchestration/planningMutationHandoffProjection.js";
import { runPlanningMutationProofRoute } from "../packages/ts-shell/src/orchestration/planningMutationProofRoute.js";
import type { ProviderEditRawProposal } from "../packages/ts-shell/src/orchestration/providerEditProposal.js";
import type { ProviderEditAvailability } from "../packages/ts-shell/src/orchestration/providerEditPlanner.js";
import type {
  PlanningRuntimeProductExecutionOptions,
  PlanningRuntimeProductLiveProviderAttempt,
} from "../packages/ts-shell/src/orchestration/planningRuntimeProductExecution.js";
import { preparePlanningRuntimeProductProposal } from "../packages/ts-shell/src/orchestration/planningRuntimeProductProposal.js";
import { runMvpIntegratedFlow } from "../packages/ts-shell/src/orchestration/runMvpIntegratedFlow.js";
import { runPlanningRuntime } from "../packages/ts-shell/src/orchestration/planningRuntime.js";
import { createWorkspaceWriteAuthority } from "../packages/ts-shell/src/orchestration/patchResult/workspaceAuthority.js";
import {
  approvedRealProviderHome,
  buildEffectiveProviderEnv,
  canonicalProviderEnv,
} from "./real-provider-smokes/approvedProviderEnv.mjs";

type ProductResult = Awaited<ReturnType<typeof runMvpIntegratedFlow>>;

const TARGET_RANKING_OLD_TEXT =
  "  return task.includes('planner') ? 'targetRanking.ts' : 'unknown';";
const RESULT_SURFACE_OLD_TEXT = "export const resultSurfaceLabel = 'result';";
const ROUTE218_VERIFIER_OLD_TEXT = "export const route218VerifierStatus = 'pending';";

interface TaskPackEntry {
  readonly id: string;
  readonly capability: string;
  readonly targetFiles: readonly string[];
  readonly moduleArea: string;
  readonly expectedVerification: string;
  readonly liveProvider: boolean;
  readonly notToyReason: string;
  readonly risk: string;
  readonly fallbackClassification: string;
}

interface ProductReport {
  readonly id: string;
  readonly productPath: boolean;
  readonly providerCalled: boolean;
  readonly applyState: string;
  readonly readback: string;
  readonly command: string;
  readonly commandDispatch: string;
  readonly repair: string;
  readonly changedFiles: readonly string[];
}

interface ProviderConfig {
  readonly provider: RuntimeProvider | "unknown";
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly safeLabel: string;
  readonly configSource: string;
}

interface LiveSingleFileTask {
  readonly id: string;
  readonly moduleArea: string;
  readonly prompt: string;
  readonly taskIntentSummary: string;
  readonly targetPath: string;
  readonly files: Readonly<Record<string, string>>;
  readonly fakeProposal: ProviderEditRawProposal;
}

interface LiveSingleFileReport {
  readonly id: string;
  readonly mode: "fake-focused-live-exact" | "live-provider-real-task";
  readonly moduleArea: string;
  readonly targetPath: string;
  readonly productPath: boolean;
  readonly readEvidence: string;
  readonly providerCalled: boolean;
  readonly liveEvidenceSource: string;
  readonly proposalStatus: string;
  readonly liveProviderStatus: string;
  readonly exactClassification: string;
  readonly primaryCalled: boolean;
  readonly fallbackCalled: boolean;
  readonly primaryStatus: string;
  readonly fallbackStatus: string;
  readonly primaryDryRunStatus: string;
  readonly fallbackDryRunStatus: string;
  readonly parseStatus: string;
  readonly anchorState: string;
  readonly applyState: string;
  readonly readback: string;
  readonly command: string;
  readonly commandDispatch: string;
  readonly changedFiles: readonly string[];
  readonly rawProviderOutputExcluded: boolean;
  readonly rawPatchTextExcluded: boolean;
  readonly failures: readonly string[];
}

const originalDaemonEnabled = process.env.DAEMON_ENABLED;
const originalAuditLogPath = process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH;
const originalPrivateAgentsTestRoot = process.env.PRIVATE_AGENTS_TEST_ROOT;
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
const liveOptIn = process.env.PRIVATE_AGENTS_ROUTE218_LIVE_PROVIDER_TASKS?.trim() === "1";
const realProviderSmokeOptIn = process.env.PRIVATE_AGENTS_REAL_PROVIDER_SMOKE?.trim() === "1";
const realProviderHome = process.env.PRIVATE_AGENTS_REAL_HOME?.trim();
process.env.DAEMON_ENABLED = "0";

const testRoot = process.env.PRIVATE_AGENTS_TEST_ROOT?.trim() ||
  path.join(os.tmpdir(), "private-agents-test", "route218-real-authorized-coding-benchmark");
await fs.mkdir(testRoot, { recursive: true });
process.env.PRIVATE_AGENTS_TEST_ROOT = testRoot;
process.env.HOME = process.env.HOME?.startsWith(testRoot)
  ? process.env.HOME
  : path.join(testRoot, "home");
process.env.USERPROFILE = process.env.USERPROFILE?.startsWith(testRoot)
  ? process.env.USERPROFILE
  : path.join(testRoot, "home");
await fs.mkdir(process.env.HOME, { recursive: true });
const auditRoot = await fs.mkdtemp(path.join(testRoot, "route218-audit-"));
process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH = path.join(
  auditRoot,
  ".sisyphus",
  "audit",
  "permissions.jsonl",
);

const taskPack: readonly TaskPackEntry[] = [
  {
    id: "cross-module-planning-single-file",
    capability: "cross-module single-file",
    targetFiles: ["src/planning/targetRanking.ts"],
    moduleArea: "planning/orchestration",
    expectedVerification: "readback plus focused command when authorized",
    liveProvider: true,
    notToyReason: "planner fallback behavior affects target selection output",
    risk: "single-file exact anchor may be missing or ambiguous",
    fallbackClassification: "PROVIDER-OUTPUT-INSUFFICIENT or REVIEW-ONLY",
  },
  {
    id: "cross-module-result-single-file",
    capability: "cross-module single-file",
    targetFiles: ["src/result/resultSurface.ts"],
    moduleArea: "result/session surface",
    expectedVerification: "readback of result surface label",
    liveProvider: true,
    notToyReason: "result surface wording changes user-visible classification",
    risk: "provider may propose prose-only review",
    fallbackClassification: "REVIEW-ONLY",
  },
  {
    id: "cross-module-script-single-file",
    capability: "cross-module single-file",
    targetFiles: ["scripts/route218Verifier.ts"],
    moduleArea: "script/verifier",
    expectedVerification: "focused verifier command",
    liveProvider: true,
    notToyReason: "script/verifier case exercises non-src target selection",
    risk: "provider may lack exact script anchor",
    fallbackClassification: "PROVIDER-OUTPUT-INSUFFICIENT",
  },
  {
    id: "small-multi-file-target-set",
    capability: "small multi-file exact proposal",
    targetFiles: ["src/planning/targetRanking.ts", "src/result/resultSurface.ts"],
    moduleArea: "planning plus result surface",
    expectedVerification: "per-file readback evidence",
    liveProvider: true,
    notToyReason: "two modules must be proposed independently without hiding partial failure",
    risk: "one file can anchor while another fails",
    fallbackClassification: "truthful per-file REVIEW-ONLY or blocked evidence",
  },
  {
    id: "selected-workspace-authorized-apply",
    capability: "selected workspace authorized apply",
    targetFiles: ["src/planning/targetRanking.ts"],
    moduleArea: "workspace authority",
    expectedVerification: "selected workspace readback",
    liveProvider: false,
    notToyReason: "exercises production-shaped selected workspace authority instead of temp-only proof",
    risk: "authority must be explicit and bounded",
    fallbackClassification: "blocked authority reason",
  },
  {
    id: "verification-failure-repair-continuation",
    capability: "repair continuation",
    targetFiles: ["src/planning/targetRanking.ts"],
    moduleArea: "verification/repair/result session",
    expectedVerification: "failed readback preserved then repair continuation created",
    liveProvider: false,
    notToyReason: "failure must not become success and original failure must remain visible",
    risk: "repair-ready state can be mistaken for repaired",
    fallbackClassification: "blocked repair or repair-continuation-created",
  },
];

const liveSingleFileTasks: readonly LiveSingleFileTask[] = [
  {
    id: "cross-module-planning-single-file",
    moduleArea: "planning/orchestration",
    prompt:
      "Improve planner target ranking output so non-planner tasks return unmatched-target instead of unknown. Keep the change single-file.",
    taskIntentSummary:
      "Change only the non-planner fallback string returned by rankPlannerTargets from unknown to unmatched-target.",
    targetPath: "src/planning/targetRanking.ts",
    files: {
      "src/planning/targetRanking.ts": [
        "export function rankPlannerTargets(task: string) {",
        TARGET_RANKING_OLD_TEXT,
        "}",
        "",
      ].join("\n"),
      "src/planning/targetRanking.test.ts":
        "expect(rankPlannerTargets('planner target ranking')).toBe('targetRanking.ts');\n",
    },
    fakeProposal: exactProposal({
      targetPath: "src/planning/targetRanking.ts",
      oldText: TARGET_RANKING_OLD_TEXT,
      newText: "  return task.includes('planner') ? 'targetRanking.ts' : 'unmatched-target';",
      summary: "improve planner fallback label",
    }),
  },
  {
    id: "cross-module-result-single-file",
    moduleArea: "result/session surface",
    prompt:
      "Improve result surface reporting so resultSurfaceLabel says verified-result instead of result. Keep the change single-file.",
    taskIntentSummary:
      "Change only resultSurfaceLabel from result to verified-result.",
    targetPath: "src/result/resultSurface.ts",
    files: {
      "src/result/resultSurface.ts": `${RESULT_SURFACE_OLD_TEXT}\n`,
      "src/result/resultSurface.test.ts":
        "expect(resultSurfaceLabel).toBe('result');\n",
    },
    fakeProposal: exactProposal({
      targetPath: "src/result/resultSurface.ts",
      oldText: RESULT_SURFACE_OLD_TEXT,
      newText: "export const resultSurfaceLabel = 'verified-result';",
      summary: "improve result surface label",
    }),
  },
  {
    id: "cross-module-script-single-file",
    moduleArea: "script/verifier",
    prompt:
      "Improve route218 verifier metadata so route218VerifierStatus says anchored instead of pending. Keep the change single-file.",
    taskIntentSummary:
      "Change only route218VerifierStatus from pending to anchored.",
    targetPath: "scripts/route218Verifier.ts",
    files: {
      "scripts/route218Verifier.ts": `${ROUTE218_VERIFIER_OLD_TEXT}\n`,
      "scripts/route218Verifier.test.ts":
        "expect(route218VerifierStatus).toBe('pending');\n",
    },
    fakeProposal: exactProposal({
      targetPath: "scripts/route218Verifier.ts",
      oldText: ROUTE218_VERIFIER_OLD_TEXT,
      newText: "export const route218VerifierStatus = 'anchored';",
      summary: "improve route218 verifier status",
    }),
  },
];

try {
  const reports: ProductReport[] = [];
  reports.push(await runDefaultSafetyCase());
  reports.push(await runSelectedWorkspaceCase());
  reports.push(await runVerificationCommandCase());
  reports.push(await runRepairContinuationCase());
  const liveSingleFileReports: LiveSingleFileReport[] = [];
  for (const task of liveSingleFileTasks) {
    liveSingleFileReports.push(await runLiveSingleFileTask({
      task,
      mode: "fake-focused-live-exact",
      execution: liveSingleFileExecution({
        task,
        attempts: [fakeAttempt(task, "primary")],
        fallbackEnabled: false,
      }),
      escalationDecision: "allow-once",
    }));
  }
  let liveSkipReason = "not-requested";
  if (liveOptIn && realProviderSmokeOptIn && realProviderHome === approvedRealProviderHome) {
    const effective = buildEffectiveProviderEnv(process.env);
    if (effective.providerEnvError) {
      liveSkipReason = "CONFIG-FAILED";
      for (const task of liveSingleFileTasks) {
        liveSingleFileReports.push(await runLiveSingleFileTask({
          task,
          mode: "live-provider-real-task",
          execution: liveSingleFileExecution({
            task,
            attempts: [],
            fallbackEnabled: false,
            fallbackReason: safeEvidenceValue(effective.providerEnvError.reason),
          }),
          escalationDecision: "allow-once",
        }));
      }
    } else {
      const canonical = canonicalProviderEnv(effective.env);
      for (const task of liveSingleFileTasks) {
        const primaryConfig = primaryProviderConfig({
          env: canonical.env,
          configSource: effective.configSource,
          providerSafeLabel: canonical.providerSafeLabel,
        });
        const primary = await buildPrimaryAttempt(primaryConfig);
        const fallbackConfig = fallbackProviderConfig({
          env: effective.env,
          primary: primaryConfig,
          configSource: effective.configSource,
        });
        const fallbackCandidate = fallbackConfig
          ? buildFallbackAttempt(fallbackConfig)
          : undefined;
        const fallback = fallbackCandidate?.adapterApproved ? fallbackCandidate : undefined;
        liveSingleFileReports.push(await runLiveSingleFileTask({
          task,
          mode: "live-provider-real-task",
          execution: liveSingleFileExecution({
            task,
            attempts: [primary.attempt, ...(fallback ? [fallback.attempt] : [])],
            fallbackEnabled: Boolean(fallback),
          }),
          escalationDecision: "allow-once",
        }));
        printAttempt(task.id, "primary", primary);
        if (fallbackCandidate) printAttempt(task.id, "fallback", fallbackCandidate);
      }
      liveSkipReason = "ran";
    }
  } else {
    liveSkipReason = !liveOptIn
      ? "no-route218-live-provider-opt-in"
      : !realProviderSmokeOptIn
        ? "real-provider-smoke-not-enabled"
        : "approved-real-provider-home-not-selected";
  }
  const targetSet = await runTargetSetProposalCase();
  const realLiveReports = liveSingleFileReports.filter((report) =>
    report.mode === "live-provider-real-task"
  );
  const liveExactReadyCount = realLiveReports.filter((report) =>
    report.exactClassification === "exact-ready" ||
    report.exactClassification === "recovered-exact-ready"
  ).length;
  const liveApplyReadbackCount = realLiveReports.filter((report) =>
    report.applyState === "single-target-applied" && report.readback === "succeeded"
  ).length;

  const failures = [
    ...validateTaskPack(taskPack),
    ...validateProductReports(reports),
    ...validateLiveSingleFileReports(liveSingleFileReports),
    ...validateTargetSet(targetSet),
  ];
  const routeCompletion = classifyRouteCompletion({
    reports,
    targetSet,
    realLiveReports,
    liveExactReadyCount,
    liveApplyReadbackCount,
    failures,
  });

  console.log(JSON.stringify({
    route: "218",
    gate: "route218-real-authorized-coding-benchmark",
    status: routeCompletion.status,
    completionReasons: routeCompletion.reasons,
    providerStatus: realLiveReports.length > 0 ? "live-provider-attempted" : "fake-provider-only",
    liveProviderTouched: realLiveReports.some((report) => report.providerCalled),
    liveOptIn,
    realProviderSmokeOptIn,
    liveSkipReason,
    liveTaskCount: realLiveReports.length,
    liveExactReadyCount,
    liveApplyReadbackCount,
    rawProviderOutput: "excluded",
    oldTextPrinted: false,
    newTextPrinted: false,
    defaultSafety: reports[0],
    taskPack: taskPack.map((entry) => ({
      id: entry.id,
      capability: entry.capability,
      targetFiles: entry.targetFiles,
      moduleArea: entry.moduleArea,
      expectedVerification: entry.expectedVerification,
      liveProvider: entry.liveProvider,
      notToyReason: entry.notToyReason,
      risk: entry.risk,
      fallbackClassification: entry.fallbackClassification,
    })),
    liveSingleFileReports,
    targetSet,
    reports,
  }, null, 2));

  if (failures.length > 0) {
    for (const failure of failures) console.log(`[fail] ${failure}`);
    process.exit(1);
  }
  console.log("[pass] route218-real-authorized-coding-benchmark");
} finally {
  await fs.rm(auditRoot, { recursive: true, force: true });
  restoreEnv("DAEMON_ENABLED", originalDaemonEnabled);
  restoreEnv("PRIVATE_AGENTS_AUDIT_LOG_PATH", originalAuditLogPath);
  restoreEnv("PRIVATE_AGENTS_TEST_ROOT", originalPrivateAgentsTestRoot);
  restoreEnv("HOME", originalHome);
  restoreEnv("USERPROFILE", originalUserProfile);
}

async function runDefaultSafetyCase(): Promise<ProductReport> {
  return runProductCase({
    id: "default-no-provider-no-apply-no-command",
    execution: undefined,
    escalationDecision: "deny",
  });
}

async function runSelectedWorkspaceCase(): Promise<ProductReport> {
  const workspaceRoot = await seedWorkspace("selected-workspace-authorized-apply");
  try {
    const result = await runMvpIntegratedFlow({
      sessionId: "sess_route218_selected_workspace",
      prompt: "Fix the planner target ranking bug and cover the adjacent test",
      workspaceRoot,
      maxTurns: 4,
      planningMutationExecution: {
        confirmation: { state: "trusted-confirmed" },
        selectedWorkspace: {
          scope: "selected-workspace",
          source: "benchmark",
          explicitWorkspaceAuthority: true,
          allowedRoot: workspaceRoot,
        },
      },
    });
    return projectProductReport("selected-workspace-authorized-apply", result);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

async function runVerificationCommandCase(): Promise<ProductReport> {
  return runProductCase({
    id: "authorized-verification-command",
    escalationDecision: "allow-once",
    execution: {
      confirmation: { state: "trusted-confirmed" },
      controlledWorkspace: { scope: "controlled-temp-workspace", source: "benchmark" },
      verificationCommand: {
        command: "node --version",
        approval: "explicit",
        source: "benchmark",
      },
    },
  });
}

async function runRepairContinuationCase(): Promise<ProductReport> {
  return runProductCase({
    id: "verification-failure-repair-continuation",
    escalationDecision: "deny",
    execution: {
      confirmation: { state: "trusted-confirmed" },
      controlledWorkspace: { scope: "controlled-temp-workspace", source: "benchmark" },
      expectedContentByTargetPath: new Map([
        ["src/planning/targetRanking.ts", "wrong expected content\n"],
      ]),
    },
  });
}

async function runProductCase(input: {
  readonly id: string;
  readonly escalationDecision: "allow-once" | "deny";
  readonly execution?: Parameters<typeof runMvpIntegratedFlow>[0]["planningMutationExecution"];
}): Promise<ProductReport> {
  const workspaceRoot = await seedWorkspace(input.id);
  try {
    const result = await runMvpIntegratedFlow({
      sessionId: `sess_route218_${input.id}`.replace(/[^a-z0-9_]/gi, "_"),
      prompt: "Fix the planner target ranking bug and cover the adjacent test",
      workspaceRoot,
      maxTurns: 4,
      escalationDecision: input.escalationDecision,
      ...(input.execution ? { planningMutationExecution: input.execution } : {}),
    });
    return projectProductReport(input.id, result);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

async function runLiveSingleFileTask(input: {
  readonly task: LiveSingleFileTask;
  readonly mode: LiveSingleFileReport["mode"];
  readonly execution: PlanningRuntimeProductExecutionOptions;
  readonly escalationDecision: "allow-once" | "deny";
}): Promise<LiveSingleFileReport> {
  const workspaceRoot = await seedLiveWorkspace(input.task);
  try {
    const before = await snapshotWorkspace(workspaceRoot);
    const result = await runMvpIntegratedFlow({
      sessionId: `sess_route218_${input.task.id}_${input.mode}`.replace(/[^a-z0-9_]/gi, "_"),
      prompt: input.task.prompt,
      workspaceRoot,
      providerMode: "synthetic",
      maxTurns: 4,
      escalationDecision: input.escalationDecision,
      planningMutationExecution: input.execution,
    });
    const after = await snapshotWorkspace(workspaceRoot);
    return projectLiveSingleFileReport({
      task: input.task,
      mode: input.mode,
      result,
      changedFiles: diffSnapshots(before, after),
    });
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

function liveSingleFileExecution(input: {
  readonly task: LiveSingleFileTask;
  readonly attempts: readonly PlanningRuntimeProductLiveProviderAttempt[];
  readonly fallbackEnabled: boolean;
  readonly fallbackReason?: string;
}): PlanningRuntimeProductExecutionOptions {
  return {
    confirmation: { state: "trusted-confirmed" },
    controlledWorkspace: { scope: "controlled-temp-workspace", source: "benchmark" },
    verificationCommand: {
      command: "node --version",
      approval: "explicit",
      source: "benchmark",
    },
    liveProviderProposal: {
      optIn: true,
      source: "benchmark",
      taskEvidence: {
        mode: "single-file-exact-patch",
        taskIntentSummary: input.task.taskIntentSummary,
      },
      attempts: input.attempts,
      fallbackPolicy: {
        enabled: input.fallbackEnabled,
        reason: input.fallbackReason ?? "fallback may run once after provider availability failure",
      },
    },
  };
}

function fakeAttempt(
  task: LiveSingleFileTask,
  role: "primary" | "fallback",
): PlanningRuntimeProductLiveProviderAttempt {
  const label = `focused-fake-${role}`;
  return {
    role,
    providerSafeLabel: label,
    providerConfigSource: "benchmark-fixture",
    providerAvailability: { kind: "available", providerKindLabel: label },
    readinessStatus: "ready",
    evidenceSource: "fake-provider",
    provider: { proposeEdit: () => task.fakeProposal },
  };
}

function projectLiveSingleFileReport(input: {
  readonly task: LiveSingleFileTask;
  readonly mode: LiveSingleFileReport["mode"];
  readonly result: ProductResult;
  readonly changedFiles: readonly string[];
}): LiveSingleFileReport {
  const evidence = input.result.codingResult?.evidence ?? [];
  const output = input.result.finalOutput ?? "";
  const report: LiveSingleFileReport = {
    id: input.task.id,
    mode: input.mode,
    moduleArea: input.task.moduleArea,
    targetPath: input.task.targetPath,
    productPath: evidence.includes("planning-runtime-product:path:runMvpIntegratedFlow"),
    readEvidence: evidence.some((entry) => entry.startsWith(`planning-runtime-product:read-reason:${input.task.targetPath}:`))
      ? "available"
      : "not-proven",
    providerCalled: evidence.includes("provider-called=true"),
    liveEvidenceSource: markerValue(evidence, "planning-runtime-product:live-provider-evidence-source:") ?? "default-safe",
    proposalStatus: markerValue(evidence, "planning-runtime-product-proposal:status:") ?? "not-run",
    liveProviderStatus: markerValue(evidence, "planning-runtime-product-proposal:live-provider-status:") ?? "not-run",
    exactClassification:
      markerValue(evidence, "planning-runtime-product-proposal:live-provider-exact-classification:") ??
      terminalClassToClassification(markerValue(evidence, "planning-runtime-product-proposal:live-provider-status:")),
    primaryCalled: evidence.includes("planning-runtime-product-proposal:live-provider-primary:provider-called:true"),
    fallbackCalled: evidence.includes("planning-runtime-product-proposal:live-provider-fallback:provider-called:true"),
    primaryStatus:
      markerValue(evidence, "planning-runtime-product-proposal:live-provider-primary:status:") ??
      (evidence.includes("planning-runtime-product-proposal:live-provider-primary:provider-called:true")
        ? "provider-called"
        : "not-run"),
    fallbackStatus:
      markerValue(evidence, "planning-runtime-product-proposal:live-provider-fallback:status:") ??
      (evidence.includes("planning-runtime-product-proposal:live-provider-fallback:provider-called:true")
        ? "provider-called"
        : "not-run"),
    primaryDryRunStatus:
      markerValue(evidence, "planning-runtime-product-proposal:live-provider-primary:dry-run-status:") ?? "not-run",
    fallbackDryRunStatus:
      markerValue(evidence, "planning-runtime-product-proposal:live-provider-fallback:dry-run-status:") ?? "not-run",
    parseStatus: markerValue(evidence, "provider-exact-patch-diagnostic:parse-status:") ?? "not-run",
    anchorState: extractLineValue(output, "Anchor state:") ?? "not-run",
    applyState: extractLineValue(output, "Apply state:") ?? "not-run",
    readback:
      markerValue(evidence, "planning-runtime-product:proof-verification:") ??
      extractLineValue(output, "Readback verification:") ??
      "not-run",
    command: extractLineValue(output, "Verification command:") ?? "not-requested",
    commandDispatch: extractLineValue(output, "Verification command dispatch:") ?? "not-run",
    changedFiles: input.changedFiles,
    rawProviderOutputExcluded: evidence.includes("planning-runtime-product-proposal:raw-provider-output-excluded"),
    rawPatchTextExcluded: !redactionRisk(JSON.stringify({
      evidence,
      finalOutput: safeOutput(output),
    })),
    failures: [],
  };
  return { ...report, failures: validateLiveSingleFileReport(report) };
}

async function runTargetSetProposalCase() {
  const workspaceRoot = await seedWorkspace("small-multi-file-target-set");
  try {
    const planningResult = await runPlanningRuntime({
      workspaceRoot,
      userTask: "Fix the planner target ranking bug and cover the adjacent test",
      maxRepoFiles: 8,
      maxCandidates: 4,
      taskKindHint: "edit-file",
    });
    const preparation = await preparePlanningRuntimeProductProposal({
      workspaceRoot,
      handoff: targetSetHandoff(),
      planningResult,
      liveProvider: {
        optIn: true,
        source: "benchmark",
        taskEvidence: {
          mode: "small-target-set-exact-patch",
          taskIntentSummary:
            "Update the planner fallback label and the result surface label together.",
        },
        attempts: [
          {
            role: "primary",
            providerSafeLabel: "focused-fake-primary",
            providerConfigSource: "benchmark-fixture",
            providerAvailability: {
              kind: "available",
              providerKindLabel: "focused-fake-primary",
            },
            readinessStatus: "ready",
            evidenceSource: "fake-provider",
            provider: {
              proposeEdit: () => targetSetProposal(),
            },
          },
        ],
      },
    });
    const evidence = preparation.evidence;
    const authority = createWorkspaceWriteAuthority(workspaceRoot);
    const currentContentByTargetPath = new Map([
      ["src/planning/targetRanking.ts", await fs.readFile(path.join(workspaceRoot, "src", "planning", "targetRanking.ts"), "utf8")],
      ["src/result/resultSurface.ts", await fs.readFile(path.join(workspaceRoot, "src", "result", "resultSurface.ts"), "utf8")],
    ]);
    const proofRoute = await runPlanningMutationProofRoute({
      requestId: "route218-small-multi-file-target-set",
      handoff: targetSetHandoff(),
      taskKind: "edit-file",
      rawProposal: preparation.rawProposal,
      currentContentByTargetPath,
      confirmation: { state: "trusted-confirmed" },
      workspace: {
        scope: "controlled-temp-workspace",
        fencedOptions: workspaceOptions(workspaceRoot, authority),
        targetSetOptions: workspaceOptions(workspaceRoot, authority),
      },
      readVerifiedFile: authority.readVerifiedFile,
      expectedContentByTargetPath: new Map([
        [
          "src/planning/targetRanking.ts",
          [
            "export function rankPlannerTargets(task: string) {",
            "  return task.includes('planner') ? 'targetRanking.ts' : 'unmatched-target';",
            "}",
            "",
          ].join("\n"),
        ],
        ["src/result/resultSurface.ts", "export const resultSurfaceLabel = 'verified-result';\n"],
      ]),
      proposalEvidenceSource: "live-provider-proposal",
      evidenceSource: "fake-provider",
      providerCalled: preparation.providerCalled,
      liveOptIn: preparation.liveOptIn,
    });
    return {
      id: "small-multi-file-target-set",
      status: preparation.status,
      providerCalled: preparation.providerCalled,
      liveEvidenceSource: preparation.liveEvidenceSource,
      targetFiles: preparation.rawProposal?.targets?.map((target) => target.path) ?? [],
      outputValidation: markerValue(evidence, "provider-output-validation:status:") ?? "not-run",
      anchor: markerValue(evidence, "provider-anchored-proposal:handoff:") ?? "not-run",
      exactClassification:
        markerValue(evidence, "planning-runtime-product-proposal:live-provider-exact-classification:") ?? "not-run",
      apply: proofRoute.proofHandoff.applyState,
      readback: proofRoute.verification.verificationState === "succeeded" ? "succeeded" : proofRoute.verification.verificationState,
      backend: proofRoute.proofHandoff.backendLane,
      changedFiles: proofRoute.changedFiles,
      perFileEvidence: preparation.rawProposal?.targets?.map((target) => ({
        target: target.path,
        exactProposal: Boolean(target.oldText && target.newText) ? "ready" : "missing",
        apply: proofRoute.changedFiles.includes(target.path) ? "applied" : "not-applied",
        verify: proofRoute.verifiedFiles.includes(target.path) ? "readback-succeeded" : "not-verified",
      })) ?? [],
      rawProviderOutputExcluded: evidence.includes("planning-runtime-product-proposal:raw-provider-output-excluded"),
    };
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

function projectProductReport(id: string, result: ProductResult): ProductReport {
  const evidence = result.codingResult?.evidence ?? [];
  const output = result.finalOutput ?? "";
  return {
    id,
    productPath: evidence.includes("planning-runtime-product:path:runMvpIntegratedFlow"),
    providerCalled: evidence.includes("provider-called=true"),
    applyState: extractLineValue(output, "Apply state:") ?? "not-run",
    readback:
      markerValue(evidence, "planning-runtime-product:proof-verification:") ??
      extractLineValue(output, "Readback verification:") ??
      "not-run",
    command: extractLineValue(output, "Verification command:") ?? "not-requested",
    commandDispatch: extractLineValue(output, "Verification command dispatch:") ?? "not-run",
    repair: markerValue(evidence, "planning-runtime-product-repair:state:") ?? "not-proven",
    changedFiles: result.codingResult?.changedFiles ?? [],
  };
}

function validateTaskPack(entries: readonly TaskPackEntry[]): string[] {
  const failures: string[] = [];
  if (entries.length < 6) failures.push(`task-pack-count=${entries.length}`);
  const singleFileModules = new Set(
    entries
      .filter((entry) => entry.capability === "cross-module single-file")
      .map((entry) => entry.moduleArea),
  );
  if (singleFileModules.size < 3) failures.push(`cross-module-single-file-modules=${singleFileModules.size}`);
  if (!entries.some((entry) => entry.targetFiles.length > 1)) failures.push("missing-multi-file-task");
  if (!entries.some((entry) => entry.capability.includes("selected workspace"))) failures.push("missing-selected-workspace-task");
  if (!entries.some((entry) => entry.capability.includes("repair"))) failures.push("missing-repair-task");
  return failures;
}

function validateProductReports(reports: readonly ProductReport[]): string[] {
  const failures: string[] = [];
  const defaultReport = reports.find((report) => report.id === "default-no-provider-no-apply-no-command");
  if (!defaultReport) failures.push("missing-default-report");
  if (defaultReport?.providerCalled) failures.push("default-provider-called");
  if (defaultReport?.applyState !== "not-run") failures.push(`default-apply=${defaultReport?.applyState}`);
  if (defaultReport?.commandDispatch !== "not-run") failures.push(`default-command=${defaultReport?.commandDispatch}`);
  const selected = reports.find((report) => report.id === "selected-workspace-authorized-apply");
  if (selected?.applyState !== "single-target-applied") failures.push(`selected-apply=${selected?.applyState}`);
  if (selected?.readback !== "succeeded") failures.push(`selected-readback=${selected?.readback}`);
  const command = reports.find((report) => report.id === "authorized-verification-command");
  if (command?.command !== "passed") failures.push(`verification-command=${command?.command}`);
  if (command?.commandDispatch !== "existing-tool-runtime") failures.push(`verification-dispatch=${command?.commandDispatch}`);
  const repair = reports.find((report) => report.id === "verification-failure-repair-continuation");
  if (repair?.repair !== "repair-continuation-created") failures.push(`repair=${repair?.repair}`);
  if (repair?.readback !== "failed") failures.push(`repair-readback=${repair?.readback}`);
  return failures;
}

function validateLiveSingleFileReports(reports: readonly LiveSingleFileReport[]): string[] {
  const failures = reports.flatMap((report) =>
    report.failures.map((failure) => `${report.id}:${report.mode}:${failure}`),
  );
  const fakeReports = reports.filter((report) => report.mode === "fake-focused-live-exact");
  const fakeModules = new Set(fakeReports.map((report) => report.moduleArea));
  if (fakeReports.length !== 3) failures.push(`fake-live-single-file-count=${fakeReports.length}`);
  if (fakeModules.size !== 3) failures.push(`fake-live-single-file-modules=${fakeModules.size}`);
  return failures;
}

function validateLiveSingleFileReport(report: LiveSingleFileReport): readonly string[] {
  const failures: string[] = [];
  if (!report.productPath) failures.push("productPath=false");
  if (report.readEvidence !== "available") failures.push(`readEvidence=${report.readEvidence}`);
  if (!report.rawPatchTextExcluded) failures.push("rawPatchTextExcluded=false");
  if (report.mode === "fake-focused-live-exact") {
    if (report.liveEvidenceSource !== "fake-provider") failures.push(`liveEvidenceSource=${report.liveEvidenceSource}`);
    if (report.exactClassification !== "exact-ready") failures.push(`exactClassification=${report.exactClassification}`);
    if (report.applyState !== "single-target-applied") failures.push(`apply=${report.applyState}`);
    if (report.readback !== "succeeded") failures.push(`readback=${report.readback}`);
    if (report.command !== "passed") failures.push(`command=${report.command}`);
    if (report.commandDispatch !== "existing-tool-runtime") failures.push(`commandDispatch=${report.commandDispatch}`);
    if (report.changedFiles.join(",") !== report.targetPath) failures.push(`changedFiles=${report.changedFiles.join(",")}`);
    if (!report.rawProviderOutputExcluded) failures.push("rawProviderOutputExcluded=false");
  }
  if (report.mode === "live-provider-real-task") {
    if (report.providerCalled && report.liveEvidenceSource !== "live-provider") {
      failures.push(`liveEvidenceSource=${report.liveEvidenceSource}`);
    }
    if (!actionableLiveStatus(report.liveProviderStatus)) {
      failures.push(`liveProviderStatus=${report.liveProviderStatus}`);
    }
    if (report.exactClassification === "exact-ready" || report.exactClassification === "recovered-exact-ready") {
      if (report.applyState !== "single-target-applied") failures.push(`liveApply=${report.applyState}`);
      if (report.readback !== "succeeded") failures.push(`liveReadback=${report.readback}`);
      if (report.command !== "passed") failures.push(`liveCommand=${report.command}`);
      if (report.commandDispatch !== "existing-tool-runtime") failures.push(`liveCommandDispatch=${report.commandDispatch}`);
      if (report.changedFiles.join(",") !== report.targetPath) failures.push(`liveChangedFiles=${report.changedFiles.join(",")}`);
    }
  }
  return failures;
}

function validateTargetSet(targetSet: Awaited<ReturnType<typeof runTargetSetProposalCase>>): string[] {
  const failures: string[] = [];
  if (targetSet.status !== "prepared-exact") failures.push(`target-set-status=${targetSet.status}`);
  if (targetSet.liveEvidenceSource !== "fake-provider") failures.push(`target-set-source=${targetSet.liveEvidenceSource}`);
  if (targetSet.outputValidation !== "valid-exact-hunk-set") failures.push(`target-set-output=${targetSet.outputValidation}`);
  if (targetSet.anchor !== "exact-hunk-set") failures.push(`target-set-anchor=${targetSet.anchor}`);
  if (targetSet.targetFiles.length !== 2) failures.push(`target-set-file-count=${targetSet.targetFiles.length}`);
  if (!targetSet.rawProviderOutputExcluded) failures.push("target-set-raw-provider-output-not-excluded");
  if (targetSet.apply !== "target-set-applied" && targetSet.apply !== "hunk-set-applied") failures.push(`target-set-apply=${targetSet.apply}`);
  if (targetSet.readback !== "succeeded") failures.push(`target-set-readback=${targetSet.readback}`);
  if (targetSet.changedFiles.length !== 2) failures.push(`target-set-changed-count=${targetSet.changedFiles.length}`);
  return failures;
}

function classifyRouteCompletion(input: {
  readonly reports: readonly ProductReport[];
  readonly targetSet: Awaited<ReturnType<typeof runTargetSetProposalCase>>;
  readonly realLiveReports: readonly LiveSingleFileReport[];
  readonly liveExactReadyCount: number;
  readonly liveApplyReadbackCount: number;
  readonly failures: readonly string[];
}): { readonly status: "COMPLETE" | "PARTIAL" | "FAILED"; readonly reasons: readonly string[] } {
  if (input.failures.length > 0) {
    return { status: "FAILED", reasons: input.failures };
  }
  const defaultReport = input.reports.find((report) => report.id === "default-no-provider-no-apply-no-command");
  const selected = input.reports.find((report) => report.id === "selected-workspace-authorized-apply");
  const command = input.reports.find((report) => report.id === "authorized-verification-command");
  const repair = input.reports.find((report) => report.id === "verification-failure-repair-continuation");
  const liveModules = new Set(input.realLiveReports.map((report) => report.moduleArea));
  const taskCount = taskPack.length;
  const complete =
    taskCount >= 5 &&
    input.realLiveReports.length >= 3 &&
    liveModules.size >= 3 &&
    input.liveExactReadyCount >= 2 &&
    input.liveApplyReadbackCount >= 2 &&
    (input.targetSet.apply === "target-set-applied" || input.targetSet.apply === "hunk-set-applied") &&
    input.targetSet.perFileEvidence.length >= 2 &&
    input.targetSet.perFileEvidence.every((file) =>
      file.exactProposal === "ready" &&
      file.apply === "applied" &&
      file.verify === "readback-succeeded"
    ) &&
    selected?.applyState === "single-target-applied" &&
    selected?.readback === "succeeded" &&
    command?.command === "passed" &&
    command?.commandDispatch === "existing-tool-runtime" &&
    repair?.repair === "repair-continuation-created" &&
    repair?.readback === "failed" &&
    defaultReport?.providerCalled === false &&
    defaultReport?.applyState === "not-run" &&
    defaultReport?.commandDispatch === "not-run";
  if (complete) {
    return {
      status: "COMPLETE",
      reasons: [
        "realistic-product-path-tasks>=5",
        "cross-module-live-single-file-tasks=3",
        "live-exact-apply-readback>=2",
        "small-multi-file-per-file-exact-apply-readback",
        "selected-workspace-authorized-apply",
        "authorized-verification-command",
        "repair-continuation-preserved-failure",
        "default-no-provider-no-apply-no-command",
      ],
    };
  }
  return {
    status: "PARTIAL",
    reasons: [
      `taskCount=${taskCount}`,
      `realLiveReports=${input.realLiveReports.length}`,
      `liveModules=${liveModules.size}`,
      `liveExactReadyCount=${input.liveExactReadyCount}`,
      `liveApplyReadbackCount=${input.liveApplyReadbackCount}`,
      `targetSetApply=${input.targetSet.apply}`,
      `selectedApply=${selected?.applyState ?? "missing"}`,
      `verificationCommand=${command?.command ?? "missing"}`,
      `repair=${repair?.repair ?? "missing"}`,
    ],
  };
}

async function seedWorkspace(id: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(testRoot, `${id}-`));
  await fs.mkdir(path.join(root, "src", "planning"), { recursive: true });
  await fs.mkdir(path.join(root, "src", "result"), { recursive: true });
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: id }, null, 2));
  await fs.writeFile(path.join(root, "src", "planning", "targetRanking.ts"), [
    "export function rankPlannerTargets(task: string) {",
    TARGET_RANKING_OLD_TEXT,
    "}",
    "",
  ].join("\n"));
  await fs.writeFile(
    path.join(root, "src", "planning", "targetRanking.test.ts"),
    "expect(rankPlannerTargets('planner target ranking')).toBe('targetRanking.ts');\n",
  );
  await fs.writeFile(
    path.join(root, "src", "result", "resultSurface.ts"),
    `${RESULT_SURFACE_OLD_TEXT}\n`,
  );
  return root;
}

async function seedLiveWorkspace(task: LiveSingleFileTask): Promise<string> {
  const root = await fs.mkdtemp(path.join(testRoot, `${task.id}-`));
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: task.id }, null, 2));
  for (const [relativePath, content] of Object.entries(task.files)) {
    const absolute = path.join(root, relativePath);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, content);
  }
  return root;
}

function targetSetHandoff() {
  return buildPlanningMutationHandoffProjection({
    editTargets: [
      {
        path: "src/planning/targetRanking.ts",
        rationale: "repo score 99; explicit planner target",
        handoffRoute: "existing-proof-carrying-mutation-runtime",
        readiness: "ready-for-review",
      },
      {
        path: "src/result/resultSurface.ts",
        rationale: "repo score 92; explicit result surface target",
        handoffRoute: "existing-proof-carrying-mutation-runtime",
        readiness: "ready-for-review",
      },
    ],
    missingFacts: [],
    taskKind: "edit-file",
    verificationIntentAvailable: true,
    readEvidence: [
      {
        id: "read-evidence:route218:1",
        path: "src/planning/targetRanking.ts",
        reason: "target file",
        source: "repo-intelligence",
      },
      {
        id: "read-evidence:route218:2",
        path: "src/result/resultSurface.ts",
        reason: "target file",
        source: "repo-intelligence",
      },
    ],
    expectedChangeSummary:
      "Update the planner fallback label and result surface label together.",
    verificationIntentSummary:
      "verificationPlan=readback target set; state=ready; command-dispatch=not-run",
    verificationEvidenceIds: ["verification_plan_route218_target_set"],
  });
}

function targetSetProposal(): ProviderEditRawProposal {
  return {
    operationKind: "exact-fenced-replacement",
    targets: [
      {
        path: "src/planning/targetRanking.ts",
        oldText: TARGET_RANKING_OLD_TEXT,
        newText: "  return task.includes('planner') ? 'targetRanking.ts' : 'unmatched-target';",
        summary: "improve planner fallback label",
      },
      {
        path: "src/result/resultSurface.ts",
        oldText: RESULT_SURFACE_OLD_TEXT,
        newText: "export const resultSurfaceLabel = 'verified-result';",
        summary: "improve result surface label",
      },
    ],
    verificationPlan: ["readback verifies both target files"],
  };
}

function exactProposal(input: {
  readonly targetPath: string;
  readonly oldText: string;
  readonly newText: string;
  readonly summary: string;
}): ProviderEditRawProposal {
  return {
    operationKind: "exact-fenced-replacement",
    targets: [{
      path: input.targetPath,
      oldText: input.oldText,
      newText: input.newText,
      summary: input.summary,
    }],
    confidence: "medium",
    riskSummary: "single-file exact replacement for Route218 task",
    verificationPlan: ["readback target", "node --version"],
    diagnostics: [
      "provider-exact-patch-diagnostic:parse-status:exact-patch",
      "provider-exact-patch-diagnostic:wrapper:json",
      "provider-exact-patch-diagnostic:shape:exact-json",
      "provider-exact-patch-diagnostic:target-matched:true",
      "provider-exact-patch-diagnostic:old-text-present:true",
      "provider-exact-patch-diagnostic:new-text-present:true",
      `provider-exact-patch-diagnostic:old-text-length:${input.oldText.length}`,
      `provider-exact-patch-diagnostic:new-text-length:${input.newText.length}`,
      "provider-exact-patch-diagnostic:raw-content-excluded",
    ],
  };
}

async function snapshotWorkspace(root: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();
  await walk(root, root, snapshot);
  return snapshot;
}

async function walk(root: string, dir: string, snapshot: Map<string, string>): Promise<void> {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(root, absolute, snapshot);
      continue;
    }
    snapshot.set(path.relative(root, absolute).replace(/\\/g, "/"), await fs.readFile(absolute, "utf8"));
  }
}

function diffSnapshots(before: Map<string, string>, after: Map<string, string>): readonly string[] {
  const changed: string[] = [];
  for (const [file, content] of after.entries()) {
    if (file.startsWith(".sisyphus/")) continue;
    if (before.get(file) !== content) changed.push(file);
  }
  return changed.sort();
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

function extractLineValue(output: string, prefix: string): string | undefined {
  const line = output.split(/\r?\n/).find((entry) => entry.trim().startsWith(prefix));
  return line?.slice(line.indexOf(prefix) + prefix.length).trim();
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
      role: "primary",
      config,
      readinessStatus: missing === "api-key" ? "missing-key" : "missing-config",
      providerAvailability: { kind: "not-configured", reason: `${missing} is missing` },
    });
  }
  if (config.provider !== "openai-compatible") {
    return buildApprovalAttempt({
      role: "primary",
      config,
      readinessStatus: "unsupported",
      providerAvailability: { kind: "unsupported", reason: "Route218 supports openai-compatible only" },
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
      role: "primary",
      config,
      readinessStatus,
      providerAvailability: availabilityForReadiness(readinessStatus, readiness.failure.stopReason),
    });
  }
  return buildApprovalAttempt({
    role: "primary",
    config,
    readinessStatus: "ready",
    providerAvailability: { kind: "available", providerKindLabel: config.safeLabel },
  });
}

function buildFallbackAttempt(config: ProviderConfig): Awaited<ReturnType<typeof buildPrimaryAttempt>> {
  const missing = firstMissingConfig(config);
  if (missing) {
    return buildApprovalAttempt({
      role: "fallback",
      config,
      readinessStatus: missing === "api-key" ? "missing-key" : "missing-config",
      providerAvailability: { kind: "not-configured", reason: `${missing} is missing` },
    });
  }
  if (config.provider !== "openai-compatible") {
    return buildApprovalAttempt({
      role: "fallback",
      config,
      readinessStatus: "unsupported",
      providerAvailability: { kind: "unsupported", reason: "Route218 fallback supports openai-compatible only" },
    });
  }
  return buildApprovalAttempt({
    role: "fallback",
    config,
    readinessStatus: "ready",
    providerAvailability: { kind: "available", providerKindLabel: config.safeLabel },
  });
}

function buildApprovalAttempt(input: {
  readonly role: "primary" | "fallback";
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
      role: input.role,
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
    safeLabel: siliconFlowLabel(trim(input.env.PRIVATE_AGENTS_REAL_BASE_URL), "primary") ?? input.providerSafeLabel,
    configSource: `${safeEvidenceValue(input.configSource)}+primary`,
  };
}

function fallbackProviderConfig(input: {
  readonly env: Record<string, string>;
  readonly primary: ProviderConfig;
  readonly configSource: string;
}): ProviderConfig | undefined {
  const fallbackBaseUrl = getTrimmed(input.env, [
    "PRIVATE_AGENTS_REAL_FALLBACK_BASE_URL",
    "PRIVATE_AGENTS_PROVIDER_FALLBACK_BASE_URL",
    "PRIVATE_AGENTS_FALLBACK_BASE_URL",
    "OPENAI_COMPATIBLE_FALLBACK_BASE_URL",
    "SILICONFLOW_FALLBACK_BASE_URL",
  ]) ?? defaultSiliconFlowFallbackBaseUrl(input.primary.baseUrl);
  if (!fallbackBaseUrl && !input.primary.apiKey && !input.primary.model) return undefined;
  return {
    provider: normalizeProvider(
      getTrimmed(input.env, [
        "PRIVATE_AGENTS_REAL_FALLBACK_PROVIDER",
        "PRIVATE_AGENTS_FALLBACK_PROVIDER",
        "SILICONFLOW_FALLBACK_PROVIDER",
      ]) ?? input.primary.provider,
    ) ?? "unknown",
    apiKey: getTrimmed(input.env, [
      "PRIVATE_AGENTS_REAL_FALLBACK_API_KEY",
      "PRIVATE_AGENTS_PROVIDER_FALLBACK_API_KEY",
      "PRIVATE_AGENTS_FALLBACK_API_KEY",
      "OPENAI_COMPATIBLE_FALLBACK_API_KEY",
      "SILICONFLOW_FALLBACK_API_KEY",
    ]) ?? input.primary.apiKey,
    baseUrl: fallbackBaseUrl,
    model: getTrimmed(input.env, [
      "PRIVATE_AGENTS_REAL_FALLBACK_MODEL",
      "PRIVATE_AGENTS_PROVIDER_FALLBACK_MODEL",
      "PRIVATE_AGENTS_FALLBACK_MODEL",
      "OPENAI_COMPATIBLE_FALLBACK_MODEL",
    ]) ?? input.primary.model,
    safeLabel: siliconFlowLabel(fallbackBaseUrl, "fallback") ?? "openai-compatible-fallback",
    configSource: `${safeEvidenceValue(input.configSource)}+fallback`,
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
  if (kind === "network" || kind === "timeout") return "network";
  if (kind === "missing-key") return "missing-key";
  return "not-ready";
}

function availabilityForReadiness(
  status: LiveProviderReadinessStatus,
  reason: string,
): ProviderEditAvailability {
  if (status === "network") return { kind: "request-blocked", reason: `provider-readiness:network:${safeEvidenceValue(reason)}` };
  if (status === "auth") return { kind: "request-blocked", reason: "provider-readiness:auth" };
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

function getTrimmed(env: Record<string, string>, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = trim(env[name]);
    if (value) return value;
  }
  return undefined;
}

function defaultSiliconFlowFallbackBaseUrl(primaryBaseUrl: string | undefined): string | undefined {
  if (!primaryBaseUrl) return undefined;
  return /siliconflow/i.test(primaryBaseUrl) ? primaryBaseUrl : undefined;
}

function siliconFlowLabel(baseUrl: string | undefined, role: "primary" | "fallback"): string | undefined {
  if (!baseUrl || !/siliconflow/i.test(baseUrl)) return undefined;
  return role === "primary" ? "siliconflow-primary" : "siliconflow-fallback";
}

function terminalClassToClassification(value: string | undefined): string {
  switch (value) {
    case "INVALID-FORMAT":
      return "invalid-format";
    case "TARGET-MISMATCH":
      return "target-mismatch";
    case "OLD-TEXT-NOT-FOUND":
      return "old-text-not-found";
    case "OLD-TEXT-MULTIPLE-MATCHES":
      return "old-text-multiple-matches";
    case "NETWORK-BLOCKED":
      return "network-blocked";
    case "AUTH-FAILED":
      return "auth-failed";
    case "CONFIG-FAILED":
      return "config-failed";
    case "PROVIDER-OUTPUT-INSUFFICIENT":
      return "provider-output-insufficient";
    case "REVIEW-ONLY":
      return "review-only";
    case "PROVIDER-ERROR":
    case "FAILED":
      return "provider-error";
    default:
      return "not-run";
  }
}

function actionableLiveStatus(value: string): boolean {
  return new Set([
    "provider-called",
    "NETWORK-BLOCKED",
    "AUTH-FAILED",
    "CONFIG-FAILED",
    "PROVIDER-OUTPUT-INSUFFICIENT",
    "REVIEW-ONLY",
    "PROVIDER-ERROR",
    "INVALID-FORMAT",
    "TARGET-MISMATCH",
    "OLD-TEXT-NOT-FOUND",
    "OLD-TEXT-MULTIPLE-MATCHES",
    "FAILED",
  ]).has(value);
}

function safeEvidenceValue(value: string): string {
  return value.replace(/[^a-zA-Z0-9_.:+-]/g, "-").slice(0, 120);
}

function safeOutput(output: string): string {
  return output
    .replace(/oldText[^,\n]*/gi, "oldText:<redacted>")
    .replace(/newText[^,\n]*/gi, "newText:<redacted>");
}

function redactionRisk(text: string): boolean {
  return /api[_-]?key|authorization|bearer\s+[a-z0-9._-]+|\bsk-[a-z0-9._-]{12,}/i.test(text);
}

function redact(text: string): string {
  return text
    .replace(/\bsk-[A-Za-z0-9._-]{12,}/g, "sk-<redacted>")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer <redacted>");
}

function printAttempt(
  taskId: string,
  role: "primary" | "fallback",
  attempt: Awaited<ReturnType<typeof buildPrimaryAttempt>>,
): void {
  console.log(`[route218] ${taskId} ${role}: approval=${attempt.approvalDecision} adapterApproved=${attempt.adapterApproved} readiness=${attempt.readinessStatus} providerErrorClass=${attempt.providerErrorClass}`);
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
