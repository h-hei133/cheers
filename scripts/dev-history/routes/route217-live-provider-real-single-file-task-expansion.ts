#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { checkRealProviderReadiness } from "../../../packages/ts-shell/src/core/shell/providerReadiness.js";
import type { RuntimeProvider } from "../../../packages/ts-shell/src/config/runtimeConfig.js";
import { approveLiveProviderAdapter } from "../../../packages/ts-shell/src/orchestration/liveProviderAdapterApproval.js";
import type { LiveProviderReadinessStatus } from "../../../packages/ts-shell/src/orchestration/liveProviderAdapterApproval.js";
import { createOpenAICompatibleAnchoredSmokeAdapter } from "../../../packages/ts-shell/src/orchestration/openAICompatibleAnchoredSmokeAdapter.js";
import type {
  PlanningRuntimeProductExecutionOptions,
  PlanningRuntimeProductLiveProviderAttempt,
} from "../../../packages/ts-shell/src/orchestration/planningRuntimeProductExecution.js";
import type { ProviderEditAvailability } from "../../../packages/ts-shell/src/orchestration/providerEditPlanner.js";
import type { ProviderEditRawProposal } from "../../../packages/ts-shell/src/orchestration/providerEditProposal.js";
import { runMvpIntegratedFlow } from "../../../packages/ts-shell/src/orchestration/runMvpIntegratedFlow.js";
import {
  approvedRealProviderHome,
  buildEffectiveProviderEnv,
  canonicalProviderEnv,
} from "./real-provider-smokes/approvedProviderEnv.mjs";

type ProductResult = Awaited<ReturnType<typeof runMvpIntegratedFlow>>;

interface ProviderConfig {
  readonly provider: RuntimeProvider | "unknown";
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly safeLabel: string;
  readonly configSource: string;
}

interface TaskSpec {
  readonly id: string;
  readonly type: "output-message" | "behavior-logic" | "verification";
  readonly prompt: string;
  readonly taskIntentSummary: string;
  readonly targetPath: string;
  readonly files: Readonly<Record<string, string>>;
  readonly fakeProposal: ProviderEditRawProposal;
}

interface TaskReport {
  readonly id: string;
  readonly type: TaskSpec["type"];
  readonly targetPath: string;
  readonly productPath: boolean;
  readonly readEvidence: string;
  readonly providerCalled: boolean;
  readonly liveEvidenceSource: string;
  readonly proposalStatus: string;
  readonly exactClassification: string;
  readonly liveProviderStatus: string;
  readonly primaryCalled: boolean;
  readonly fallbackCalled: boolean;
  readonly primaryStatus: string;
  readonly fallbackStatus: string;
  readonly primaryDryRunStatus: string;
  readonly fallbackDryRunStatus: string;
  readonly parseStatus: string;
  readonly wrapperKind: string;
  readonly outputShapeKind: string;
  readonly targetMatched: string;
  readonly oldTextPresent: string;
  readonly newTextPresent: string;
  readonly oldTextLength: string;
  readonly newTextLength: string;
  readonly anchorState: string | null;
  readonly terminal: string | null;
  readonly applyState: string | null;
  readonly readback: string;
  readonly command: string | null;
  readonly commandDispatch: string | null;
  readonly changedFiles: readonly string[];
  readonly rawProviderOutputExcluded: boolean;
  readonly rawPatchTextExcluded: boolean;
  readonly failures: readonly string[];
}

const liveOptIn = process.env.PRIVATE_AGENTS_ROUTE217_LIVE_PROVIDER_TASKS?.trim() === "1";
const realProviderSmokeOptIn = process.env.PRIVATE_AGENTS_REAL_PROVIDER_SMOKE?.trim() === "1";
const realProviderHome = process.env.PRIVATE_AGENTS_REAL_HOME?.trim();
const originalDaemonEnabled = process.env.DAEMON_ENABLED;
const originalAuditLogPath = process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH;

process.env.DAEMON_ENABLED = "0";
const testRoot = process.env.PRIVATE_AGENTS_TEST_ROOT?.trim() ||
  path.join(os.tmpdir(), "private-agents-test", "route217-live-provider-real-single-file-task-expansion");
process.env.PRIVATE_AGENTS_TEST_ROOT = testRoot;
process.env.HOME = process.env.HOME?.startsWith(testRoot)
  ? process.env.HOME
  : path.join(testRoot, "home");
process.env.USERPROFILE = process.env.USERPROFILE?.startsWith(testRoot)
  ? process.env.USERPROFILE
  : path.join(testRoot, "home");
await fs.mkdir(process.env.HOME, { recursive: true });
const auditRoot = await fs.mkdtemp(path.join(testRoot, "route217-audit-"));
process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH = path.join(auditRoot, ".sisyphus", "audit", "permissions.jsonl");

const tasks: readonly TaskSpec[] = [
  {
    id: "small-output-message-improvement",
    type: "output-message",
    prompt:
      "Improve planner target ranking output so non-planner tasks return unmatched-target instead of unknown. Keep the change single-file.",
    taskIntentSummary:
      "Change only the non-planner fallback string returned by rankPlannerTargets from unknown to unmatched-target.",
    targetPath: "src/planning/targetRanking.ts",
    files: {
      "src/planning/targetRanking.ts": [
        "export function rankPlannerTargets(task: string) {",
        "  return task.includes('planner') ? 'targetRanking.ts' : 'unknown';",
        "}",
        "",
      ].join("\n"),
      "src/planning/targetRanking.test.ts":
        "expect(rankPlannerTargets('planner target ranking')).toBe('targetRanking.ts');\n",
    },
    fakeProposal: exactProposal({
      targetPath: "src/planning/targetRanking.ts",
      oldText: "  return task.includes('planner') ? 'targetRanking.ts' : 'unknown';",
      newText: "  return task.includes('planner') ? 'targetRanking.ts' : 'unmatched-target';",
      summary: "improve unmatched planner output label",
    }),
  },
  {
    id: "small-behavior-logic-fix",
    type: "behavior-logic",
    prompt:
      "Fix the planner target ranking bug by trimming the task before checking for planner. Keep the change single-file.",
    taskIntentSummary:
      "Change only the rankPlannerTargets predicate so task is trimmed before includes('planner') is evaluated.",
    targetPath: "src/planning/targetRanking.ts",
    files: {
      "src/planning/targetRanking.ts": [
        "export function rankPlannerTargets(task: string) {",
        "  return task.includes('planner') ? 'targetRanking.ts' : 'unknown';",
        "}",
        "",
      ].join("\n"),
      "src/planning/targetRanking.test.ts":
        "expect(rankPlannerTargets('planner target ranking')).toBe('targetRanking.ts');\n",
    },
    fakeProposal: exactProposal({
      targetPath: "src/planning/targetRanking.ts",
      oldText: "  return task.includes('planner') ? 'targetRanking.ts' : 'unknown';",
      newText: "  return task.trim().includes('planner') ? 'targetRanking.ts' : 'unknown';",
      summary: "trim planner task before includes check",
    }),
  },
  {
    id: "small-verification-improvement",
    type: "verification",
    prompt:
      "Improve planner target ranking verification metadata so the verification marker includes exact-anchor after readback. Keep the change single-file.",
    taskIntentSummary:
      "Change only the route217Verification metadata string from readback to readback+exact-anchor.",
    targetPath: "src/planning/targetRanking.ts",
    files: {
      "src/planning/targetRanking.ts": [
        "export function rankPlannerTargets(task: string) {",
        "  return task.trim().includes('planner') ? 'targetRanking.ts' : 'unknown';",
        "}",
        "",
        "export const route217Verification = 'readback';",
        "",
      ].join("\n"),
      "src/planning/targetRanking.test.ts":
        "expect(rankPlannerTargets('planner target ranking')).toBe('targetRanking.ts');\n",
    },
    fakeProposal: exactProposal({
      targetPath: "src/planning/targetRanking.ts",
      oldText: "export const route217Verification = 'readback';",
      newText: "export const route217Verification = 'readback+exact-anchor';",
      summary: "record exact anchor verification metadata",
    }),
  },
];

const route217TaskPack = [
  {
    id: "small-output-message-improvement",
    type: "output-message",
    targetFile: "src/planning/targetRanking.ts",
  },
  {
    id: "small-behavior-logic-fix",
    type: "behavior-logic",
    targetFile: "src/planning/targetRanking.ts",
  },
  {
    id: "small-verification-improvement",
    type: "verification",
    targetFile: "src/planning/targetRanking.ts",
  },
] as const;

try {
  const reports: TaskReport[] = [];
  reports.push(await runTask(tasks[0]!, "default-no-provider-no-apply", {}));
  for (const task of tasks) {
    reports.push(await runTask(task, "fake-focused-live-exact", {
      escalationDecision: "allow-once",
      execution: confirmedExecution({
        task,
        attempts: [fakeAttempt(task, "primary")],
        fallbackEnabled: false,
      }),
    }));
  }

  let liveSkipReason = "not-requested";
  if (liveOptIn && realProviderSmokeOptIn && realProviderHome === approvedRealProviderHome) {
    const effective = buildEffectiveProviderEnv(process.env);
    if (effective.providerEnvError) {
      liveSkipReason = "CONFIG-FAILED";
      for (const task of tasks) {
        reports.push(await runTask(task, "live-provider-real-task", {
          execution: liveExecution(task, [], false, safeEvidenceValue(effective.providerEnvError.reason)),
        }));
      }
    } else {
      const canonical = canonicalProviderEnv(effective.env);
      for (const task of tasks) {
        const primary = await buildPrimaryAttempt(primaryProviderConfig({
          env: canonical.env,
          configSource: effective.configSource,
          providerSafeLabel: canonical.providerSafeLabel,
        }));
        const fallbackConfig = fallbackProviderConfig({
          env: effective.env,
          primary: primaryProviderConfig({
            env: canonical.env,
            configSource: effective.configSource,
            providerSafeLabel: canonical.providerSafeLabel,
          }),
          configSource: effective.configSource,
        });
        const fallbackCandidate = fallbackConfig ? buildFallbackAttempt(fallbackConfig) : undefined;
        const fallback = fallbackCandidate?.adapterApproved ? fallbackCandidate : undefined;
        reports.push(await runTask(task, "live-provider-real-task", {
          escalationDecision: "allow-once",
          execution: confirmedExecution({
            task,
            attempts: [primary.attempt, ...(fallback ? [fallback.attempt] : [])],
            fallbackEnabled: Boolean(fallback),
          }),
        }));
        printAttempt(task.id, "primary", primary);
        if (fallbackCandidate) printAttempt(task.id, "fallback", fallbackCandidate);
      }
      liveSkipReason = "ran";
    }
  } else {
    liveSkipReason = !liveOptIn
      ? "no-route217-live-provider-opt-in"
      : !realProviderSmokeOptIn
        ? "real-provider-smoke-not-enabled"
        : "approved-real-provider-home-not-selected";
  }

  const liveReports = reports.filter((report) => report.id.endsWith(":live-provider-real-task"));
  const liveExactReadyCount = liveReports.filter((report) =>
    report.exactClassification === "exact-ready" ||
    report.exactClassification === "recovered-exact-ready"
  ).length;
  const liveApplyReadbackCount = liveReports.filter((report) =>
    report.applyState === "single-target-applied" && report.readback === "succeeded"
  ).length;
  const failures = reports.flatMap((report) => report.failures.map((failure) => `${report.id}: ${failure}`));
  const completion = liveReports.length === 3 &&
    liveApplyReadbackCount >= 1 &&
    (liveExactReadyCount >= 2 || liveReports.every((report) => actionableLiveStatus(report.liveProviderStatus)))
    ? "COMPLETE"
    : liveOptIn && liveReports.length === 3
      ? "PARTIAL"
      : "NOT-LIVE";

  console.log(redact(JSON.stringify({
    route: "217",
    gate: "route217-live-provider-real-single-file-task-expansion",
    taskPack: tasks.map((task) => ({
      id: task.id,
      type: task.type,
      targetFile: task.targetPath,
      singleFile: true,
      readEvidence: "bounded-current-target-content-in-provider-prompt",
      verification: "readback plus explicit node --version command when exact-ready",
      broadEditRisk: "low-explicit-single-target",
    })),
    liveOptIn,
    realProviderSmokeOptIn,
    liveSkipReason,
    liveTaskCount: liveReports.length,
    liveExactReadyCount,
    liveApplyReadbackCount,
    completion,
    rawProviderOutput: "excluded",
    oldTextPrinted: false,
    newTextPrinted: false,
    defaultProvider: reports[0]?.providerCalled ? "called" : "not-run",
    defaultApply: reports[0]?.applyState ?? "not-run",
    defaultCommandDispatch: reports[0]?.commandDispatch ?? "not-run",
    reports,
  }, null, 2)));
  if (failures.length > 0) {
    for (const failure of failures) console.log(`[fail] ${failure}`);
    process.exit(1);
  }
  if (liveReports.some((report) => report.liveProviderStatus === "NETWORK-BLOCKED")) process.exit(2);
  if (liveReports.some((report) => report.liveProviderStatus === "AUTH-FAILED" || report.liveProviderStatus === "CONFIG-FAILED")) {
    process.exit(3);
  }
  console.log("[pass] route217-live-provider-real-single-file-task-expansion");
} finally {
  await fs.rm(auditRoot, { recursive: true, force: true });
  restoreEnv("DAEMON_ENABLED", originalDaemonEnabled);
  restoreEnv("PRIVATE_AGENTS_AUDIT_LOG_PATH", originalAuditLogPath);
}

function confirmedExecution(input: {
  readonly task: TaskSpec;
  readonly attempts: readonly PlanningRuntimeProductLiveProviderAttempt[];
  readonly fallbackEnabled: boolean;
}): PlanningRuntimeProductExecutionOptions {
  return {
    ...liveExecution(input.task, input.attempts, input.fallbackEnabled),
    confirmation: { state: "trusted-confirmed" },
    controlledWorkspace: { scope: "controlled-temp-workspace", source: "benchmark" },
    verificationCommand: {
      command: "node --version",
      approval: "explicit",
      source: "benchmark",
    },
  };
}

function liveExecution(
  task: TaskSpec,
  attempts: readonly PlanningRuntimeProductLiveProviderAttempt[],
  fallbackEnabled: boolean,
  fallbackReason = "fallback may run once after provider availability failure",
): PlanningRuntimeProductExecutionOptions {
  return {
    liveProviderProposal: {
      optIn: true,
      source: "benchmark",
      taskEvidence: {
        mode: "single-file-exact-patch",
        taskIntentSummary: task.taskIntentSummary,
      },
      attempts,
      fallbackPolicy: {
        enabled: fallbackEnabled,
        reason: fallbackReason,
      },
    },
  };
}

function fakeAttempt(task: TaskSpec, role: "primary" | "fallback"): PlanningRuntimeProductLiveProviderAttempt {
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

async function runTask(task: TaskSpec, mode: string, options: {
  readonly execution?: PlanningRuntimeProductExecutionOptions;
  readonly escalationDecision?: "allow-once" | "deny";
}): Promise<TaskReport> {
  const workspaceRoot = await seedWorkspace(task);
  try {
    const before = await snapshotWorkspace(workspaceRoot);
    const result = await runMvpIntegratedFlow({
      sessionId: `sess_route217_${task.id}_${mode}`.replace(/[^a-z0-9_]/gi, "_"),
      prompt: task.prompt,
      workspaceRoot,
      providerMode: "synthetic",
      maxTurns: 4,
      escalationDecision: options.escalationDecision ?? "deny",
      ...(options.execution ? { planningMutationExecution: options.execution } : {}),
    });
    const after = await snapshotWorkspace(workspaceRoot);
    return projectReport({
      id: `${task.id}:${mode}`,
      task,
      result,
      changedFiles: diffSnapshots(before, after),
      mode,
    });
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

function projectReport(input: {
  readonly id: string;
  readonly task: TaskSpec;
  readonly result: ProductResult;
  readonly changedFiles: readonly string[];
  readonly mode: string;
}): TaskReport {
  const evidence = input.result.codingResult?.evidence ?? [];
  const finalOutput = input.result.finalOutput ?? "";
  const report: TaskReport = {
    id: input.id,
    type: input.task.type,
    targetPath: input.task.targetPath,
    productPath: evidence.includes("planning-runtime-product:path:runMvpIntegratedFlow"),
    readEvidence: evidence.some((entry) => entry.startsWith(`planning-runtime-product:read-reason:${input.task.targetPath}:`))
      ? "available"
      : "not-proven",
    providerCalled: evidence.includes("provider-called=true"),
    liveEvidenceSource: markerValue(evidence, "planning-runtime-product:live-provider-evidence-source:") ?? "default-safe",
    proposalStatus: markerValue(evidence, "planning-runtime-product-proposal:status:") ?? "not-run",
    exactClassification:
      markerValue(evidence, "planning-runtime-product-proposal:live-provider-exact-classification:") ??
      terminalClassToClassification(markerValue(evidence, "planning-runtime-product-proposal:live-provider-status:")),
    liveProviderStatus: markerValue(evidence, "planning-runtime-product-proposal:live-provider-status:") ?? "not-run",
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
    wrapperKind: markerValue(evidence, "provider-exact-patch-diagnostic:wrapper:") ?? "not-run",
    outputShapeKind: markerValue(evidence, "provider-exact-patch-diagnostic:shape:") ?? "not-run",
    targetMatched: markerValue(evidence, "provider-exact-patch-diagnostic:target-matched:") ?? "not-run",
    oldTextPresent: markerValue(evidence, "provider-exact-patch-diagnostic:old-text-present:") ?? "not-run",
    newTextPresent: markerValue(evidence, "provider-exact-patch-diagnostic:new-text-present:") ?? "not-run",
    oldTextLength: markerValue(evidence, "provider-exact-patch-diagnostic:old-text-length:") ?? "not-run",
    newTextLength: markerValue(evidence, "provider-exact-patch-diagnostic:new-text-length:") ?? "not-run",
    anchorState: extractLineValue(finalOutput, "Anchor state:") ?? "not-run",
    terminal: extractLineValue(finalOutput, "Terminal result:") ?? "not-run",
    applyState: extractLineValue(finalOutput, "Apply state:") ?? "not-run",
    readback:
      markerValue(evidence, "planning-runtime-product:proof-verification:") ??
      extractLineValue(finalOutput, "Readback verification:") ??
      "not-run",
    command: extractLineValue(finalOutput, "Verification command:") ?? "not-requested",
    commandDispatch: extractLineValue(finalOutput, "Verification command dispatch:") ?? "not-run",
    changedFiles: input.changedFiles,
    rawProviderOutputExcluded: evidence.includes("planning-runtime-product-proposal:raw-provider-output-excluded"),
    rawPatchTextExcluded: !redactionRisk(JSON.stringify({ evidence, finalOutput: safeOutput(finalOutput) })),
    failures: [],
  };
  return { ...report, failures: validateReport(report, input.mode) };
}

function validateReport(report: TaskReport, mode: string): readonly string[] {
  const failures: string[] = [];
  if (!report.productPath) failures.push("productPath=false");
  if (report.readEvidence !== "available") failures.push(`readEvidence=${report.readEvidence}`);
  if (!report.rawPatchTextExcluded) failures.push("rawPatchTextExcluded=false");
  if (mode === "default-no-provider-no-apply") {
    if (report.providerCalled) failures.push("default-provider-called=true");
    if (report.applyState !== "not-run") failures.push(`default-apply=${report.applyState}`);
    if (report.commandDispatch !== "not-run") failures.push(`default-command-dispatch=${report.commandDispatch}`);
    return failures;
  }
  if (!report.rawProviderOutputExcluded) failures.push("rawProviderOutputExcluded=false");
  if (mode === "fake-focused-live-exact") {
    if (report.liveEvidenceSource !== "fake-provider") failures.push(`fake-liveEvidenceSource=${report.liveEvidenceSource}`);
    if (report.exactClassification !== "exact-ready") failures.push(`fake-exactClassification=${report.exactClassification}`);
    if (report.applyState !== "single-target-applied") failures.push(`fake-apply=${report.applyState}`);
    if (report.readback !== "succeeded") failures.push(`fake-readback=${report.readback}`);
    if (report.changedFiles.join(",") !== report.targetPath) failures.push(`fake-changedFiles=${report.changedFiles.join(",")}`);
  }
  if (mode === "live-provider-real-task") {
    if (report.providerCalled && report.liveEvidenceSource !== "live-provider") {
      failures.push(`liveEvidenceSource=${report.liveEvidenceSource}`);
    }
    if (!actionableLiveStatus(report.liveProviderStatus)) {
      failures.push(`liveProviderStatus=${report.liveProviderStatus}`);
    }
    if (report.exactClassification === "exact-ready" || report.exactClassification === "recovered-exact-ready") {
      if (report.applyState !== "single-target-applied") failures.push(`live-apply=${report.applyState}`);
      if (report.readback !== "succeeded") failures.push(`live-readback=${report.readback}`);
      if (report.changedFiles.join(",") !== report.targetPath) failures.push(`live-changedFiles=${report.changedFiles.join(",")}`);
    }
  }
  return failures;
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
      providerAvailability: { kind: "unsupported", reason: "Route217 supports openai-compatible only" },
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
      providerAvailability: { kind: "unsupported", reason: "Route217 fallback supports openai-compatible only" },
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

async function seedWorkspace(task: TaskSpec): Promise<string> {
  const root = await fs.mkdtemp(path.join(testRoot, "route217-workspace-"));
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "route217-task" }, null, 2));
  for (const [relativePath, content] of Object.entries(task.files)) {
    const absolute = path.join(root, relativePath);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, content);
  }
  return root;
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
      summary: input.summary,
      oldText: input.oldText,
      newText: input.newText,
    }],
    confidence: "medium",
    riskSummary: "single-file exact replacement for Route217 task",
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

function markerValue(evidence: readonly string[], prefix: string): string | undefined {
  return evidence.find((entry) => entry.startsWith(prefix))?.slice(prefix.length);
}

function extractLineValue(output: string, label: string): string | null {
  const line = output.split(/\r?\n/).find((entry) => entry.trim().startsWith(label));
  if (!line) return null;
  return line.slice(line.indexOf(label) + label.length).trim();
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
      return "provider-error";
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
  console.log(`[route217] ${taskId} ${role}: approval=${attempt.approvalDecision} adapterApproved=${attempt.adapterApproved} readiness=${attempt.readinessStatus} providerErrorClass=${attempt.providerErrorClass}`);
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
