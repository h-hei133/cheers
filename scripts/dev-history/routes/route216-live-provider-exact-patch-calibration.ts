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

interface AttemptBuild {
  readonly attempt: PlanningRuntimeProductLiveProviderAttempt;
  readonly approvalDecision: string;
  readonly adapterApproved: boolean;
  readonly readinessStatus: LiveProviderReadinessStatus;
  readonly providerErrorClass: string;
}

interface CalibrationReport {
  readonly id: string;
  readonly providerCalled: boolean;
  readonly liveEvidenceSource: string;
  readonly proposalStatus: string;
  readonly liveProviderStatus: string;
  readonly exactClassification: string;
  readonly parseStatus: string;
  readonly wrapperKind: string;
  readonly outputShapeKind: string;
  readonly targetMatched: string;
  readonly oldTextPresent: string;
  readonly newTextPresent: string;
  readonly oldTextLength: string;
  readonly newTextLength: string;
  readonly primaryStatus: string;
  readonly fallbackStatus: string;
  readonly primaryCalled: boolean;
  readonly fallbackCalled: boolean;
  readonly providerPatchRole: string;
  readonly exactPatchAuthor: string;
  readonly applyState: string | null;
  readonly loopVerdict: string | null;
  readonly readback: string;
  readonly changedFiles: readonly string[];
  readonly rawProviderOutputExcluded: boolean;
  readonly rawPatchTextExcluded: boolean;
  readonly failures: readonly string[];
}

const liveOptIn = process.env.PRIVATE_AGENTS_ROUTE216_LIVE_PROVIDER_CALIBRATION?.trim() === "1";
const realProviderSmokeOptIn = process.env.PRIVATE_AGENTS_REAL_PROVIDER_SMOKE?.trim() === "1";
const realProviderHome = process.env.PRIVATE_AGENTS_REAL_HOME?.trim();
const originalDaemonEnabled = process.env.DAEMON_ENABLED;
const originalAuditLogPath = process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH;

process.env.DAEMON_ENABLED = "0";
const testRoot = process.env.PRIVATE_AGENTS_TEST_ROOT?.trim() ||
  path.join(os.tmpdir(), "private-agents-test", "route216-live-provider-exact-patch-calibration");
process.env.PRIVATE_AGENTS_TEST_ROOT = testRoot;
process.env.HOME = process.env.HOME?.startsWith(testRoot)
  ? process.env.HOME
  : path.join(testRoot, "home");
process.env.USERPROFILE = process.env.USERPROFILE?.startsWith(testRoot)
  ? process.env.USERPROFILE
  : path.join(testRoot, "home");
await fs.mkdir(process.env.HOME, { recursive: true });
const auditRoot = await fs.mkdtemp(path.join(testRoot, "route216-audit-"));
process.env.PRIVATE_AGENTS_AUDIT_LOG_PATH = path.join(auditRoot, ".sisyphus", "audit", "permissions.jsonl");

const targetPath = "src/planning/targetRanking.ts";
const oldText = "  return task.includes('planner') ? 'targetRanking.ts' : 'unknown';";
const newText = "  return task.trim().includes('planner') ? 'targetRanking.ts' : 'unknown';";
const route216TerminalStatuses = new Set([
  "provider-called",
  "NETWORK-BLOCKED",
  "AUTH-FAILED",
  "CONFIG-FAILED",
  "PROVIDER-OUTPUT-INSUFFICIENT",
  "PATCH-AUTHOR-UNSUITABLE",
  "INVALID-FORMAT",
  "TARGET-MISMATCH",
  "OLD-TEXT-NOT-FOUND",
  "OLD-TEXT-MULTIPLE-MATCHES",
  "FAILED",
]);

try {
  const reports: CalibrationReport[] = [];
  reports.push(await runCase("default-no-provider-no-apply", {}));
  reports.push(await runCase("fake-focused-exact-author-success", {
    planningMutationExecution: liveExecution([fakeAttempt("primary", "focused-fake-primary", () => exactProposal())], false),
  }));
  reports.push(await runCase("fake-focused-provider-output-insufficient", {
    planningMutationExecution: liveExecution([
      fakeAttempt("primary", "focused-fake-primary", () => reviewOnlyProposal(false)),
      fakeAttempt("fallback", "focused-fake-fallback", () => reviewOnlyProposal(true)),
    ], true),
  }));

  let liveReport: CalibrationReport | undefined;
  let liveSkipReason = "not-requested";
  if (liveOptIn && realProviderSmokeOptIn && realProviderHome === approvedRealProviderHome) {
    const effective = buildEffectiveProviderEnv(process.env);
    if (effective.providerEnvError) {
      liveReport = await runCase("live-provider-calibration", {
        planningMutationExecution: liveExecution([], false, safeDetail(effective.providerEnvError.reason)),
      });
      liveSkipReason = "CONFIG-FAILED";
    } else {
      const canonical = canonicalProviderEnv(effective.env);
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
      const fallback = fallbackConfig ? buildFallbackAttempt(fallbackConfig) : undefined;
      liveReport = await runCase("live-provider-calibration", {
        escalationDecision: "allow-once",
        planningMutationExecution: {
          ...liveExecution([primary.attempt, ...(fallback ? [fallback.attempt] : [])], Boolean(fallback)),
          confirmation: { state: "trusted-confirmed" },
          controlledWorkspace: { scope: "controlled-temp-workspace", source: "benchmark" },
        },
      });
      liveSkipReason = "ran";
      printAttempt("primary", primary);
      if (fallback) printAttempt("fallback", fallback);
    }
  } else {
    liveSkipReason = !liveOptIn
      ? "no-route216-live-provider-opt-in"
      : !realProviderSmokeOptIn
        ? "real-provider-smoke-not-enabled"
        : "approved-real-provider-home-not-selected";
  }
  if (liveReport) reports.push(liveReport);

  const failures = reports.flatMap((report) => report.failures.map((failure) => `${report.id}: ${failure}`));
  const liveStatus = liveReport
    ? route216Status(liveReport)
    : liveSkipReason;
  console.log(redact(JSON.stringify({
    route: "216",
    gate: "route216-live-provider-exact-patch-calibration",
    calibrationTask: {
      targetFile: targetPath,
      readEvidence: "bounded-current-target-content-in-provider-prompt",
      expectedPatch: "trim planner task before includes check",
      rawPatchTextPrinted: false,
    },
    liveOptIn,
    realProviderSmokeOptIn,
    liveStatus,
    liveOldTextProduced: liveReport?.oldTextPresent ?? "not-run",
    liveNewTextProduced: liveReport?.newTextPresent ?? "not-run",
    liveExactReady: liveReport?.exactClassification === "exact-ready" ||
      liveReport?.exactClassification === "recovered-exact-ready",
    rawProviderOutput: "excluded",
    oldTextPrinted: false,
    newTextPrinted: false,
    reports,
  }, null, 2)));
  if (failures.length > 0) {
    for (const failure of failures) console.log(`[fail] ${failure}`);
    process.exit(1);
  }
  if (liveReport && liveReport.liveProviderStatus === "NETWORK-BLOCKED") process.exit(2);
  if (
    liveReport &&
    (liveReport.liveProviderStatus === "AUTH-FAILED" || liveReport.liveProviderStatus === "CONFIG-FAILED")
  ) {
    process.exit(3);
  }
  console.log("[pass] route216-live-provider-exact-patch-calibration");
} finally {
  await fs.rm(auditRoot, { recursive: true, force: true });
  restoreEnv("DAEMON_ENABLED", originalDaemonEnabled);
  restoreEnv("PRIVATE_AGENTS_AUDIT_LOG_PATH", originalAuditLogPath);
}

async function runCase(inputId: string, options: {
  readonly planningMutationExecution?: PlanningRuntimeProductExecutionOptions;
  readonly escalationDecision?: "allow-once" | "deny";
}): Promise<CalibrationReport> {
  const workspaceRoot = await fs.mkdtemp(path.join(testRoot, "route216-workspace-"));
  try {
    await seedWorkspace(workspaceRoot);
    const before = await snapshotWorkspace(workspaceRoot);
    const result = await runMvpIntegratedFlow({
      sessionId: `sess_route216_${inputId.replace(/[^a-z0-9_]/gi, "_")}`,
      prompt: "Fix the planner target ranking bug by trimming the task before checking for planner, and keep the change single-file.",
      workspaceRoot,
      providerMode: "synthetic",
      maxTurns: 4,
      escalationDecision: options.escalationDecision ?? "deny",
      ...(options.planningMutationExecution ? { planningMutationExecution: options.planningMutationExecution } : {}),
    });
    const after = await snapshotWorkspace(workspaceRoot);
    return projectReport(inputId, result, diffSnapshots(before, after));
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

function liveExecution(
  attempts: readonly PlanningRuntimeProductLiveProviderAttempt[],
  fallbackEnabled: boolean,
  fallbackReason = "calibration may try fallback once after primary does not prove exact patch authorship",
): PlanningRuntimeProductExecutionOptions {
  return {
    liveProviderProposal: {
      optIn: true,
      source: "benchmark",
      calibration: { mode: "exact-patch-author" },
      attempts,
      fallbackPolicy: {
        enabled: fallbackEnabled,
        reason: fallbackReason,
      },
    },
  };
}

function fakeAttempt(
  role: "primary" | "fallback",
  label: string,
  proposeEdit: () => ProviderEditRawProposal,
): PlanningRuntimeProductLiveProviderAttempt {
  return {
    role,
    providerSafeLabel: label,
    providerConfigSource: "benchmark-fixture",
    providerAvailability: { kind: "available", providerKindLabel: label },
    readinessStatus: "ready",
    evidenceSource: "fake-provider",
    provider: { proposeEdit },
  };
}

function exactProposal(): ProviderEditRawProposal {
  return {
    operationKind: "exact-fenced-replacement",
    targets: [{ path: targetPath, oldText, newText }],
    confidence: "medium",
    riskSummary: "single-file exact replacement calibration",
    verificationPlan: ["readback target"],
    diagnostics: [
      "provider-exact-patch-diagnostic:parse-status:exact-patch",
      "provider-exact-patch-diagnostic:wrapper:json",
      "provider-exact-patch-diagnostic:shape:exact-json",
      "provider-exact-patch-diagnostic:target-matched:true",
      "provider-exact-patch-diagnostic:old-text-present:true",
      "provider-exact-patch-diagnostic:new-text-present:true",
      `provider-exact-patch-diagnostic:old-text-length:${oldText.length}`,
      `provider-exact-patch-diagnostic:new-text-length:${newText.length}`,
      "provider-exact-patch-diagnostic:raw-content-excluded",
    ],
  };
}

function reviewOnlyProposal(missingFact: boolean): ProviderEditRawProposal {
  return {
    operationKind: "generated-replacement",
    targets: [{ path: targetPath, summary: missingFact ? "missing exact oldText/newText" : "review-only" }],
    confidence: "low",
    riskSummary: "provider did not supply exact patch fields",
    verificationPlan: ["readback target"],
    diagnostics: [
      "provider-exact-patch-diagnostic:parse-status:review-only",
      "provider-exact-patch-diagnostic:wrapper:json",
      "provider-exact-patch-diagnostic:shape:review-only-json",
      "provider-exact-patch-diagnostic:target-matched:true",
      "provider-exact-patch-diagnostic:old-text-present:false",
      "provider-exact-patch-diagnostic:new-text-present:false",
      `provider-exact-patch-diagnostic:review-only-missing-fact-present:${missingFact}`,
      "provider-exact-patch-diagnostic:raw-content-excluded",
    ],
  };
}

function projectReport(id: string, result: ProductResult, changedFiles: readonly string[]): CalibrationReport {
  const evidence = result.codingResult?.evidence ?? [];
  const finalOutput = result.finalOutput ?? "";
  const report: CalibrationReport = {
    id,
    providerCalled: evidence.includes("provider-called=true"),
    liveEvidenceSource: markerValue(evidence, "planning-runtime-product:live-provider-evidence-source:") ?? "default-safe",
    proposalStatus: markerValue(evidence, "planning-runtime-product-proposal:status:") ?? "not-run",
    liveProviderStatus: markerValue(evidence, "planning-runtime-product-proposal:live-provider-status:") ?? "not-run",
    exactClassification:
      markerValue(evidence, "planning-runtime-product-proposal:live-provider-exact-classification:") ??
      terminalClassToClassification(markerValue(evidence, "planning-runtime-product-proposal:live-provider-status:")),
    parseStatus: markerValue(evidence, "provider-exact-patch-diagnostic:parse-status:") ?? "not-run",
    wrapperKind: markerValue(evidence, "provider-exact-patch-diagnostic:wrapper:") ?? "not-run",
    outputShapeKind: markerValue(evidence, "provider-exact-patch-diagnostic:shape:") ?? "not-run",
    targetMatched: markerValue(evidence, "provider-exact-patch-diagnostic:target-matched:") ?? "not-run",
    oldTextPresent: markerValue(evidence, "provider-exact-patch-diagnostic:old-text-present:") ?? "not-run",
    newTextPresent: markerValue(evidence, "provider-exact-patch-diagnostic:new-text-present:") ?? "not-run",
    oldTextLength: markerValue(evidence, "provider-exact-patch-diagnostic:old-text-length:") ?? "not-run",
    newTextLength: markerValue(evidence, "provider-exact-patch-diagnostic:new-text-length:") ?? "not-run",
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
    primaryCalled: evidence.includes("planning-runtime-product-proposal:live-provider-primary:provider-called:true"),
    fallbackCalled: evidence.includes("planning-runtime-product-proposal:live-provider-fallback:provider-called:true"),
    providerPatchRole: markerValue(evidence, "planning-runtime-product-proposal:providerPatchRole:") ?? "not-set",
    exactPatchAuthor: markerValue(evidence, "planning-runtime-product-proposal:exactPatchAuthor:") ?? "not-set",
    applyState: extractLineValue(finalOutput, "Apply state:"),
    loopVerdict: extractLineValue(finalOutput, "Loop verdict:"),
    readback:
      markerValue(evidence, "planning-runtime-product:proof-verification:") ??
      extractLineValue(finalOutput, "Readback verification:") ??
      "not-run",
    changedFiles,
    rawProviderOutputExcluded: evidence.includes("planning-runtime-product-proposal:raw-provider-output-excluded"),
    rawPatchTextExcluded: !redactionRisk(JSON.stringify({ evidence })),
    failures: [],
  };
  return { ...report, failures: validateReport(report) };
}

function validateReport(report: CalibrationReport): readonly string[] {
  const failures: string[] = [];
  if (!report.rawPatchTextExcluded) failures.push("rawPatchTextExcluded=false");
  if (report.id === "default-no-provider-no-apply") {
    if (report.providerCalled) failures.push("default-provider-called=true");
    if (report.applyState !== "not-run") failures.push(`default-apply=${report.applyState}`);
    return failures;
  }
  if (!report.rawProviderOutputExcluded) failures.push("rawProviderOutputExcluded=false");
  if (report.id === "fake-focused-exact-author-success") {
    if (report.exactClassification !== "exact-ready") failures.push(`exactClassification=${report.exactClassification}`);
    if (report.oldTextPresent !== "true") failures.push(`oldTextPresent=${report.oldTextPresent}`);
    if (report.newTextPresent !== "true") failures.push(`newTextPresent=${report.newTextPresent}`);
    if (report.applyState !== "not-run") failures.push(`apply=${report.applyState}`);
  }
  if (report.id === "fake-focused-provider-output-insufficient") {
    if (report.liveProviderStatus !== "PROVIDER-OUTPUT-INSUFFICIENT") {
      failures.push(`liveProviderStatus=${report.liveProviderStatus}`);
    }
    if (!report.primaryCalled || !report.fallbackCalled) failures.push("bounded-primary-fallback-not-called");
    if (report.providerPatchRole !== "reviewer-or-planner") failures.push(`providerPatchRole=${report.providerPatchRole}`);
    if (report.exactPatchAuthor !== "deterministic-builder") failures.push(`exactPatchAuthor=${report.exactPatchAuthor}`);
    if (report.changedFiles.length > 0) failures.push(`changedFiles=${report.changedFiles.join(",")}`);
  }
  if (report.id === "live-provider-calibration") {
    if (!route216TerminalStatuses.has(report.liveProviderStatus)) {
      failures.push(`liveProviderStatus=${report.liveProviderStatus}`);
    }
    if (report.liveEvidenceSource !== "live-provider" && report.providerCalled) {
      failures.push(`liveEvidenceSource=${report.liveEvidenceSource}`);
    }
    if (
      report.exactClassification === "exact-ready" ||
      report.exactClassification === "recovered-exact-ready"
    ) {
      if (report.applyState !== "single-target-applied") failures.push(`live-exact-apply=${report.applyState}`);
      if (report.readback !== "succeeded") failures.push(`live-readback=${report.readback}`);
      if (report.changedFiles.join(",") !== targetPath) failures.push(`live-changedFiles=${report.changedFiles.join(",")}`);
    } else if (
      report.liveProviderStatus === "PROVIDER-OUTPUT-INSUFFICIENT" ||
      report.liveProviderStatus === "PATCH-AUTHOR-UNSUITABLE"
    ) {
      if (report.providerPatchRole !== "reviewer-or-planner") failures.push(`live-providerPatchRole=${report.providerPatchRole}`);
      if (report.exactPatchAuthor !== "deterministic-builder") failures.push(`live-exactPatchAuthor=${report.exactPatchAuthor}`);
      if (report.changedFiles.length > 0) failures.push(`live-changedFiles=${report.changedFiles.join(",")}`);
    }
  }
  return failures;
}

function route216Status(report: CalibrationReport): string {
  if (report.liveProviderStatus === "NETWORK-BLOCKED") return "NETWORK-BLOCKED";
  if (report.liveProviderStatus === "AUTH-FAILED") return "AUTH-FAILED";
  if (report.liveProviderStatus === "CONFIG-FAILED") return "CONFIG-FAILED";
  if (
    report.exactClassification === "exact-ready" ||
    report.exactClassification === "recovered-exact-ready"
  ) {
    return report.readback === "succeeded" ? "live-exact-ready-applied-verified" : "live-exact-ready-apply-not-proven";
  }
  if (
    report.liveProviderStatus === "PROVIDER-OUTPUT-INSUFFICIENT" ||
    report.liveProviderStatus === "PATCH-AUTHOR-UNSUITABLE"
  ) {
    return report.liveProviderStatus;
  }
  return "provider-error";
}

async function buildPrimaryAttempt(config: ProviderConfig): Promise<AttemptBuild> {
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
      providerAvailability: { kind: "unsupported", reason: "Route216 supports openai-compatible only" },
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

function buildFallbackAttempt(config: ProviderConfig): AttemptBuild {
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
      providerAvailability: { kind: "unsupported", reason: "Route216 fallback supports openai-compatible only" },
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
}): AttemptBuild {
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
  const provider = normalizeProvider(input.env.PRIVATE_AGENTS_REAL_PROVIDER) ?? "unknown";
  return {
    provider,
    apiKey: trim(input.env.PRIVATE_AGENTS_REAL_API_KEY),
    baseUrl: trim(input.env.PRIVATE_AGENTS_REAL_BASE_URL),
    model: trim(input.env.PRIVATE_AGENTS_REAL_MODEL),
    safeLabel: siliconFlowLabel(trim(input.env.PRIVATE_AGENTS_REAL_BASE_URL), "primary") ??
      input.providerSafeLabel,
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
  const provider = normalizeProvider(
    getTrimmed(input.env, [
      "PRIVATE_AGENTS_REAL_FALLBACK_PROVIDER",
      "PRIVATE_AGENTS_FALLBACK_PROVIDER",
      "SILICONFLOW_FALLBACK_PROVIDER",
    ]) ?? input.primary.provider,
  ) ?? "unknown";
  return {
    provider,
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

async function seedWorkspace(root: string): Promise<void> {
  await fs.mkdir(path.join(root, "src", "planning"), { recursive: true });
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({ name: "route216-calibration" }, null, 2));
  await fs.writeFile(
    path.join(root, targetPath),
    [
      "export function rankPlannerTargets(task: string) {",
      oldText,
      "}",
      "",
    ].join("\n"),
  );
  await fs.writeFile(
    path.join(root, "src", "planning", "targetRanking.test.ts"),
    "expect(rankPlannerTargets('planner target ranking')).toBe('targetRanking.ts');\n",
  );
}

async function snapshotWorkspace(root: string): Promise<Map<string, string>> {
  const snapshot = new Map<string, string>();
  await walk(root, root, snapshot);
  return snapshot;
}

async function walk(root: string, current: string, snapshot: Map<string, string>): Promise<void> {
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === "node_modules" || entry.name === ".sisyphus") continue;
    const absolutePath = path.join(current, entry.name);
    const relativePath = path.relative(root, absolutePath).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      await walk(root, absolutePath, snapshot);
    } else if (entry.isFile()) {
      snapshot.set(relativePath, await fs.readFile(absolutePath, "utf8"));
    }
  }
}

function diffSnapshots(before: Map<string, string>, after: Map<string, string>): readonly string[] {
  const keys = new Set([...before.keys(), ...after.keys()]);
  return Array.from(keys).filter((key) => before.get(key) !== after.get(key)).sort();
}

function terminalClassToClassification(value: string | undefined): string {
  switch (value) {
    case "PROVIDER-OUTPUT-INSUFFICIENT":
      return "provider-output-insufficient";
    case "PATCH-AUTHOR-UNSUITABLE":
      return "patch-author-unsuitable";
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
    case "provider-called":
      return "review-only";
    default:
      return "not-run";
  }
}

function normalizeProvider(value: string | undefined): RuntimeProvider | undefined {
  const normalized = value?.trim().toLowerCase().replace(/_/g, "-");
  switch (normalized) {
    case "compatible":
    case "openaicompatible":
    case "openai-compatible-api":
    case "siliconflow":
    case "deepseek":
      return "openai-compatible";
    case "openai":
    case "anthropic":
    case "openai-compatible":
    case "google":
    case "antigravity":
    case "claudecode":
      return normalized;
    default:
      return undefined;
  }
}

function firstMissingConfig(config: ProviderConfig): "api-key" | "base-url" | "model" | undefined {
  if (!config.apiKey) return "api-key";
  if (!config.baseUrl) return "base-url";
  if (!config.model) return "model";
  return undefined;
}

function mapReadinessFailure(kind: string): LiveProviderReadinessStatus {
  switch (kind) {
    case "missing-key":
      return "missing-key";
    case "missing-config":
      return "missing-config";
    case "unsupported-provider":
      return "unsupported";
    case "auth":
      return "auth";
    case "network":
      return "network";
    default:
      return "unknown";
  }
}

function availabilityForReadiness(status: LiveProviderReadinessStatus, reason: string): ProviderEditAvailability {
  if (status === "unsupported") return { kind: "unsupported", reason };
  if (status === "missing-config" || status === "missing-key") return { kind: "not-configured", reason };
  return { kind: "request-blocked", reason };
}

function defaultSiliconFlowFallbackBaseUrl(primaryBaseUrl: string | undefined): string | undefined {
  return primaryBaseUrl?.includes("api.siliconflow.cn")
    ? "https://api.siliconflow.com/v1"
    : undefined;
}

function siliconFlowLabel(baseUrl: string | undefined, role: "primary" | "fallback"): string | undefined {
  if (baseUrl?.includes("api.siliconflow.cn")) return `siliconflow-${role}-cn`;
  if (baseUrl?.includes("api.siliconflow.com")) return `siliconflow-${role}-com`;
  return undefined;
}

function getTrimmed(env: Record<string, string>, names: readonly string[]): string | undefined {
  for (const name of names) {
    const value = trim(env[name]);
    if (value) return value;
  }
  return undefined;
}

function trim(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function markerValue(evidence: readonly string[], prefix: string): string | undefined {
  return evidence.filter((entry) => entry.startsWith(prefix)).at(-1)?.slice(prefix.length);
}

function extractLineValue(output: string, label: string): string | null {
  const line = output.split("\n").find((entry) => entry.startsWith(label));
  return line ? line.slice(label.length).trim() : null;
}

function printAttempt(role: "primary" | "fallback", attempt: AttemptBuild): void {
  console.log(`${role}-approval-decision=${attempt.approvalDecision}`);
  console.log(`${role}-adapter-approved=${attempt.adapterApproved ? "true" : "false"}`);
  console.log(`${role}-readiness-status=${attempt.readinessStatus}`);
  console.log(`${role}-provider-label=${attempt.attempt.providerSafeLabel}`);
  console.log(`${role}-provider-error-class=${attempt.providerErrorClass || "none"}`);
}

function safeEvidenceValue(value: string): string {
  return value.replace(/[^a-zA-Z0-9._:+-]+/g, "_").slice(0, 120) || "unknown";
}

function redactionRisk(value: string): boolean {
  return /\/home\/wang\/\.private-agents-real|Bearer\s+\S+|\bsk-[A-Za-z0-9][A-Za-z0-9._-]{8,}\b|api[_-]?key|task\.includes\('planner'\)|task\.trim\(\)\.includes/i
    .test(value);
}

function safeDetail(value: string): string {
  return redact(value).replace(/\n+/g, " ").slice(0, 240);
}

function redact(value: string): string {
  return String(value ?? "")
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[REAL_PROVIDER_HOME]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\bsk-[A-Za-z0-9][A-Za-z0-9._-]{8,}\b/g, "[REDACTED_API_KEY]")
    .replace(
      /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|x-api-key)(\s*[:=]\s*)(["']?)[^\s"'`,;]+/gi,
      (_match, key, separator, quote) => `${key}${separator}${quote}[REDACTED]`,
    );
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}
