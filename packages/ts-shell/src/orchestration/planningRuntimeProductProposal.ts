import fs from "node:fs";
import path from "node:path";

import type { ContextAwareProviderPromptContext } from "./contextAwareProviderPrompt.js";
import { buildPlanningExactProposal } from "./planningExactProposal.js";
import type { PlanningRuntimeResult } from "./planningRuntime.js";
import type { PlanningMutationHandoffProjection } from "./planningMutationHandoffProjection.js";
import { hashContent } from "./patchRecovery/recoveryAuthorityStore.js";
import type { ProviderEditRawProposal } from "./providerEditProposal.js";
import type { PlanningRuntimeProductLiveProviderProposal } from "./planningRuntimeProductExecution.js";
import {
  runRealProviderProposalDryRun,
  type RealProviderProposalDryRunResult,
} from "./realProviderProposalDryRun.js";

export type PlanningRuntimeProductProposalStatus =
  | "prepared-exact"
  | "live-provider-config-failed"
  | "live-provider-network-blocked"
  | "live-provider-auth-failed"
  | "live-provider-failed"
  | "review-only"
  | "unsupported"
  | "not-run";

export type PlanningRuntimeProductProposalSource =
  | "manual-proposal-json"
  | "planning-runtime-deterministic"
  | "planning-handoff-summary"
  | "live-provider-proposal";

export interface PlanningRuntimeProductProposalPreparation {
  readonly proposalPreparationId: string;
  readonly status: PlanningRuntimeProductProposalStatus;
  readonly source: PlanningRuntimeProductProposalSource;
  readonly rawProposal?: ProviderEditRawProposal;
  readonly providerCalled: boolean;
  readonly liveOptIn: boolean;
  readonly liveEvidenceSource:
    | "live-provider"
    | "fake-provider"
    | "default-safe"
    | "not-proven";
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

type LiveProviderTerminalClass =
  | "CONFIG-FAILED"
  | "AUTH-FAILED"
  | "NETWORK-BLOCKED"
  | "FAILED";

type LiveProviderEvidenceSource =
  PlanningRuntimeProductProposalPreparation["liveEvidenceSource"];

export async function preparePlanningRuntimeProductProposal(input: {
  readonly workspaceRoot: string;
  readonly handoff: PlanningMutationHandoffProjection;
  readonly planningResult?: PlanningRuntimeResult;
  readonly rawProposal?: ProviderEditRawProposal | null;
  readonly liveProvider?: PlanningRuntimeProductLiveProviderProposal;
}): Promise<PlanningRuntimeProductProposalPreparation> {
  if (input.rawProposal) {
    return proposalPreparation({
      status: "prepared-exact",
      source: "manual-proposal-json",
      rawProposal: input.rawProposal,
      providerCalled: false,
      liveOptIn: false,
      liveEvidenceSource: "default-safe",
      reason:
        "Explicit internal proposal JSON was supplied for the compatibility/debug path.",
      nextAction:
        "Validate and anchor the supplied proposal before any review-confirm-execute handoff.",
      evidence: [
        "planning-runtime-product-proposal:manual-json:provided",
        "planning-runtime-product-proposal:provider-called:false",
      ],
    });
  }

  if (input.liveProvider?.optIn) {
    return prepareLiveProviderProposal({
      workspaceRoot: input.workspaceRoot,
      handoff: input.handoff,
      planningResult: input.planningResult,
      liveProvider: input.liveProvider,
    });
  }

  if (input.handoff.handoffState !== "handoff-ready") {
    return proposalPreparation({
      status: "not-run",
      source: "planning-handoff-summary",
      providerCalled: false,
      liveOptIn: false,
      liveEvidenceSource: "default-safe",
      reason: "Planning handoff is not ready for product proposal preparation.",
      nextAction: input.handoff.nextAction,
      evidence: [
        "planning-runtime-product-proposal:handoff:not-ready",
        "planning-runtime-product-proposal:provider-called:false",
      ],
    });
  }

  const exactProposal = buildPlanningExactProposal({
    handoff: input.handoff,
    planningResult: input.planningResult,
    currentContentByTargetPath: readCurrentContentByTargetLabel({
      workspaceRoot: input.workspaceRoot,
      targetPaths: input.handoff.targetPaths,
    }),
  });
  if (exactProposal.status !== "prepared-exact") {
    return proposalPreparation({
      status: exactProposal.status,
      source: "planning-handoff-summary",
      providerCalled: false,
      liveOptIn: false,
      liveEvidenceSource: "default-safe",
      reason: exactProposal.reason,
      nextAction: exactProposal.nextAction,
      evidence: [
        ...exactProposal.evidence,
        "planning-runtime-product-proposal:deterministic:no-exact-proposal",
        "planning-runtime-product-proposal:provider-called:false",
      ],
    });
  }

  return proposalPreparation({
    status: "prepared-exact",
    source: "planning-runtime-deterministic",
    rawProposal: exactProposal.rawProposal,
    providerCalled: false,
    liveOptIn: false,
    liveEvidenceSource: "default-safe",
    reason: exactProposal.reason,
    nextAction: exactProposal.nextAction,
    evidence: [
      ...exactProposal.evidence,
      "planning-runtime-product-proposal:deterministic:prepared-exact",
      "planning-runtime-product-proposal:manual-json:not-required",
      "planning-runtime-product-proposal:provider-called:false",
      "planning-runtime-product-proposal:live-opt-in:false",
      "planning-runtime-product-proposal:raw-content-excluded",
    ],
  });
}

async function prepareLiveProviderProposal(input: {
  readonly workspaceRoot: string;
  readonly handoff: PlanningMutationHandoffProjection;
  readonly planningResult?: PlanningRuntimeResult;
  readonly liveProvider: PlanningRuntimeProductLiveProviderProposal;
}): Promise<PlanningRuntimeProductProposalPreparation> {
  const attempts = input.liveProvider.attempts ?? [];
  const promptContext = buildLiveProviderPromptContext({
    workspaceRoot: input.workspaceRoot,
    handoff: input.handoff,
    planningResult: input.planningResult,
  });
  const commonEvidence = [
    "planning-runtime-product-proposal:live-provider-opt-in:true",
    `planning-runtime-product-proposal:live-provider-source:${input.liveProvider.source}`,
    `planning-runtime-product-proposal:live-provider-attempt-count:${attempts.length}`,
    `planning-runtime-product-proposal:live-provider-fallback-policy:${input.liveProvider.fallbackPolicy?.enabled ? "enabled" : "disabled"}`,
    ...(input.liveProvider.fallbackPolicy?.reason
      ? [`planning-runtime-product-proposal:live-provider-fallback-reason:${safeEvidenceValue(input.liveProvider.fallbackPolicy.reason)}`]
      : []),
  ];

  if (attempts.length === 0) {
    return liveProviderFailure({
      terminalClass: "CONFIG-FAILED",
      reason:
        "CONFIG-FAILED: product live-provider proposal opt-in did not include an approved configured adapter.",
      nextAction:
        "Use the existing approved real-provider smoke/config seam before claiming live provider proposal generation.",
      evidence: [
        ...commonEvidence,
        "planning-runtime-product-proposal:live-provider-status:CONFIG-FAILED",
        "planning-runtime-product-proposal:live-provider-primary:not-run",
        "planning-runtime-product-proposal:live-provider-fallback:not-run",
      ],
    });
  }

  if (!promptContext) {
    return liveProviderFailure({
      terminalClass: "CONFIG-FAILED",
      reason:
        "CONFIG-FAILED: Planning Runtime did not provide enough redacted context to build a provider prompt.",
      nextAction:
        "Rebuild Planning Runtime context before live-provider proposal generation.",
      evidence: [
        ...commonEvidence,
        "planning-runtime-product-proposal:live-provider-status:CONFIG-FAILED",
        "planning-runtime-product-proposal:live-provider-context:missing",
      ],
    });
  }

  let lastTerminalClass: LiveProviderTerminalClass = "CONFIG-FAILED";
  let providerCalled = false;
  let liveEvidenceSource: LiveProviderEvidenceSource = "not-proven";
  const attemptEvidence: string[] = [...commonEvidence, ...promptContext.evidence];
  for (const [index, attempt] of attempts.entries()) {
    if (index > 0 && input.liveProvider.fallbackPolicy?.enabled !== true) {
      attemptEvidence.push(
        `planning-runtime-product-proposal:live-provider-${attempt.role}:skipped-no-fallback-policy`,
      );
      continue;
    }
    if (index > 0 && !canUseFallbackAfter(lastTerminalClass)) {
      attemptEvidence.push(
        `planning-runtime-product-proposal:live-provider-${attempt.role}:skipped-after-${lastTerminalClass}`,
      );
      continue;
    }

    attemptEvidence.push(
      `planning-runtime-product-proposal:live-provider-attempt:${attempt.role}`,
      `planning-runtime-product-proposal:live-provider-${attempt.role}:provider:${safeEvidenceValue(attempt.providerSafeLabel)}`,
      `planning-runtime-product-proposal:live-provider-${attempt.role}:config-source:${safeEvidenceValue(attempt.providerConfigSource)}`,
      `planning-runtime-product-proposal:live-provider-${attempt.role}:readiness:${attempt.readinessStatus ?? "unknown"}`,
      `planning-runtime-product-proposal:live-provider-${attempt.role}:evidence-source:${attempt.evidenceSource ?? "not-proven"}`,
    );

    const preflightFailure = classifyAttemptPreflight(attempt);
    if (preflightFailure) {
      lastTerminalClass = preflightFailure;
      attemptEvidence.push(
        `planning-runtime-product-proposal:live-provider-${attempt.role}:status:${preflightFailure}`,
        `planning-runtime-product-proposal:live-provider-${attempt.role}:provider-called:false`,
      );
      continue;
    }

    const dryRun = await runRealProviderProposalDryRun({
      requestId: `route211-product-live-${attempt.role}-${input.handoff.handoffId}`,
      dryRunOptIn: true,
      promptContext,
      explicitTargetLabels: input.handoff.targetPaths,
      lifecycleId: promptContext.taskLifecycleId,
      analysisBriefId: promptContext.analysisBriefId,
      analysisQualityId: promptContext.analysisQualityId,
      analysisQualityDecision: promptContext.analysisQualityDecision,
      planQualityId: promptContext.planQualityId,
      planQualityLevel: promptContext.planQualityLevel,
      contextPacketId: promptContext.contextPacketId,
      contextGraphId: promptContext.contextGraphId,
      codeGraphTraceId: promptContext.codeGraphTraceId,
      taskExecutionPlanId: promptContext.taskExecutionPlanId,
      providerAvailability: attempt.providerAvailability,
      redactionStatus: promptContext.redactionStatus,
      provider: attempt.provider,
      currentContentByTargetLabel: readCurrentContentByTargetLabel({
        workspaceRoot: input.workspaceRoot,
        targetPaths: input.handoff.targetPaths,
      }),
      inWorkspaceTargetLabels: input.handoff.targetPaths,
    });
    attemptEvidence.push(
      ...dryRun.evidence,
      `planning-runtime-product-proposal:live-provider-${attempt.role}:dry-run-status:${dryRun.status}`,
      `planning-runtime-product-proposal:live-provider-${attempt.role}:provider-called:${dryRun.providerCalled}`,
    );
    if (dryRun.providerCalled) {
      providerCalled = true;
      liveEvidenceSource = attempt.evidenceSource ?? "not-proven";
    }

    if (isDryRunSuccess(dryRun)) {
      const exact = isExactReadyDryRun(dryRun);
      return proposalPreparation({
        status: exact ? "prepared-exact" : "review-only",
        source: "live-provider-proposal",
        rawProposal: dryRun.rawProposal,
        providerCalled: true,
        liveOptIn: true,
        liveEvidenceSource: attempt.evidenceSource ?? "not-proven",
        reason:
          exact
            ? "Live provider dry-run produced a validated exact proposal; apply still requires explicit confirmation and workspace authority."
            : "Live provider dry-run produced a validated review-only proposal; exact apply remains blocked until review supplies anchors.",
        nextAction:
          "Review the provider proposal and anchored evidence before any explicit confirmation.",
        evidence: [
          ...attemptEvidence,
          "planning-runtime-product-proposal:live-provider-status:provider-called",
          `planning-runtime-product-proposal:live-provider-selected-attempt:${attempt.role}`,
          `planning-runtime-product-proposal:live-provider-output:${dryRun.outputValidation.status}`,
          `planning-runtime-product-proposal:live-provider-anchor:${dryRun.anchoredProposal.handoffReadiness}`,
          "planning-runtime-product-proposal:raw-provider-output-excluded",
          "planning-runtime-product-proposal:no-provider-call-during-apply",
        ],
      });
    }

    lastTerminalClass = classifyDryRunFailure(dryRun);
    attemptEvidence.push(
      `planning-runtime-product-proposal:live-provider-${attempt.role}:status:${lastTerminalClass}`,
    );
  }

  return liveProviderFailure({
    terminalClass: lastTerminalClass,
    providerCalled,
    liveEvidenceSource,
    reason: `${lastTerminalClass}: live-provider proposal opt-in did not produce a usable provider proposal.`,
    nextAction:
      "Review provider readiness/fallback evidence; do not claim live provider success.",
    evidence: [
      ...attemptEvidence,
      `planning-runtime-product-proposal:live-provider-status:${lastTerminalClass}`,
      "planning-runtime-product-proposal:raw-provider-output-excluded",
    ],
  });
}

function liveProviderFailure(input: {
  readonly terminalClass: LiveProviderTerminalClass;
  readonly providerCalled?: boolean;
  readonly liveEvidenceSource?: LiveProviderEvidenceSource;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): PlanningRuntimeProductProposalPreparation {
  return proposalPreparation({
    status: statusForLiveProviderFailure(input.terminalClass),
    source: "live-provider-proposal",
    providerCalled: input.providerCalled ?? false,
    liveOptIn: true,
    liveEvidenceSource: input.liveEvidenceSource ?? "not-proven",
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: [
      ...input.evidence,
      `planning-runtime-product-proposal:provider-called:${input.providerCalled ?? false}`,
      "planning-runtime-product-proposal:raw-provider-output-excluded",
    ],
  });
}

function buildLiveProviderPromptContext(input: {
  readonly workspaceRoot: string;
  readonly handoff: PlanningMutationHandoffProjection;
  readonly planningResult?: PlanningRuntimeResult;
}): ContextAwareProviderPromptContext | undefined {
  const targetPath = input.handoff.targetPaths[0];
  const bundle = input.planningResult?.context.bundle;
  if (!targetPath || !bundle || input.handoff.handoffState !== "handoff-ready") {
    return undefined;
  }
  const requestId = `planning-product-live-${hashContent(JSON.stringify({
    runtimeId: input.planningResult?.runtimeId,
    handoffId: input.handoff.handoffId,
    targetPath,
  })).slice(0, 12)}`;
  const providerPrompt = [
    "Create a review-only provider edit proposal from Planning Runtime evidence.",
    `Request: ${input.planningResult.groundedAnalysis.summary}`,
    `Target: ${targetPath}`,
    `Expected change: ${input.handoff.expectedChangeSummary}`,
    `Verification intent: ${input.handoff.verificationIntent.summary}`,
    `Context packet: ${bundle.packet.packetId}`,
    `Context graph: ${bundle.graph.graphId}`,
    `Code graph trace: ${bundle.codeGraphTrace.traceId}`,
    `Analysis brief: ${bundle.analysisBrief.briefId}`,
    `Task execution plan: ${bundle.taskExecutionPlan.executionPlanId}`,
    "Return JSON only. Do not use markdown fences.",
    "Use operationKind exact-fenced-replacement when exact oldText/newText is known; otherwise return a target-bound review-only proposal with path and summary only.",
    "Return targets only for explicit target paths from this prompt.",
    "Do not claim files were changed. Do not run commands. Do not include provider config, API keys, headers, or raw full file content.",
  ].join("\n");

  return {
    requestId,
    contextPacketId: bundle.packet.packetId,
    contextGraphId: bundle.graph.graphId,
    agentPlanId: bundle.agentPlan.planId,
    taskLifecycleId: bundle.taskLifecycle.lifecycleId,
    analysisBriefId: bundle.analysisBrief.briefId,
    analysisQualityId: bundle.analysisQualityGate.gateId,
    analysisQualityDecision: bundle.analysisQualityGate.allowed ? "allow" : "stop",
    planQualityId: bundle.planQuality.qualityId,
    planQualityLevel: "ready",
    taskExecutionPlanId: bundle.taskExecutionPlan.executionPlanId,
    userRequest: input.planningResult.groundedAnalysis.summary,
    targetSummary: `Planning Runtime selected ${targetPath}`,
    target: {
      pathLabel: targetPath,
      summary: `Planning Runtime selected ${targetPath} for review-only provider proposal generation.`,
    },
    relatedContext: [],
    constraints: [
      "review-only provider proposal",
      "explicit confirmation required before apply",
      "existing proof backend only",
      "no provider call during apply",
    ],
    nonGoals: [
      "automatic mutation",
      "raw provider output in result surface",
      "fuzzy or broad apply",
    ],
    missingFacts: input.planningResult.groundedAnalysis.missingFacts,
    suggestedReads: input.handoff.readEvidenceIds,
    suggestedVerification: [input.handoff.verificationIntent.summary],
    omittedContentReasons: ["raw-full-content-excluded"],
    contextReadiness: "ready",
    codeGraphTraceId: bundle.codeGraphTrace.traceId,
    analysisBriefSummary: input.planningResult.groundedAnalysis.summary,
    executionPlanConstraints: input.handoff.requirements.map((requirement) =>
      `${requirement.id}:${requirement.status}`,
    ),
    verificationExpectation: "review-before-apply",
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    providerPrompt,
    evidence: [
      `planning-runtime-product-proposal:live-provider-context:${requestId}`,
      `planning-runtime-product-proposal:live-provider-context-packet:${bundle.packet.packetId}`,
      `planning-runtime-product-proposal:live-provider-context-graph:${bundle.graph.graphId}`,
      `planning-runtime-product-proposal:live-provider-code-graph:${bundle.codeGraphTrace.traceId}`,
      `planning-runtime-product-proposal:live-provider-analysis:${bundle.analysisBrief.briefId}`,
      `planning-runtime-product-proposal:live-provider-plan-quality:${bundle.planQuality.qualityId}`,
      "planning-runtime-product-proposal:live-provider-plan-readiness:handoff-ready",
      "planning-runtime-product-proposal:live-provider-redacted-and-budgeted",
      "planning-runtime-product-proposal:live-provider-provider-config-excluded",
    ],
  };
}

function classifyAttemptPreflight(
  attempt: NonNullable<PlanningRuntimeProductLiveProviderProposal["attempts"]>[number],
): LiveProviderTerminalClass | undefined {
  if (!attempt.provider || attempt.providerAvailability.kind === "not-configured") {
    return "CONFIG-FAILED";
  }
  switch (attempt.readinessStatus) {
    case "auth":
      return "AUTH-FAILED";
    case "network":
      return "NETWORK-BLOCKED";
    case "missing-config":
    case "missing-key":
    case "not-ready":
      return "CONFIG-FAILED";
    case "unsupported":
      return "FAILED";
    default:
      break;
  }
  if (attempt.providerAvailability.kind !== "available") {
    return "FAILED";
  }
  switch (attempt.readinessStatus) {
    case undefined:
    case "ready":
      return undefined;
    default:
      return "FAILED";
  }
}

function classifyDryRunFailure(
  dryRun: RealProviderProposalDryRunResult,
): LiveProviderTerminalClass {
  if (dryRun.status === "dry-run-provider-not-configured") return "CONFIG-FAILED";
  if (dryRun.status === "dry-run-provider-unsupported") return "CONFIG-FAILED";
  switch (dryRun.providerErrorClass) {
    case "auth":
      return "AUTH-FAILED";
    case "missing-key":
      return "CONFIG-FAILED";
    case "network":
    case "timeout":
      return "NETWORK-BLOCKED";
    default:
      return "FAILED";
  }
}

function statusForLiveProviderFailure(
  terminalClass: LiveProviderTerminalClass,
): PlanningRuntimeProductProposalStatus {
  switch (terminalClass) {
    case "CONFIG-FAILED":
      return "live-provider-config-failed";
    case "AUTH-FAILED":
      return "live-provider-auth-failed";
    case "NETWORK-BLOCKED":
      return "live-provider-network-blocked";
    case "FAILED":
      return "live-provider-failed";
  }
}

function canUseFallbackAfter(terminalClass: LiveProviderTerminalClass): boolean {
  return terminalClass !== "CONFIG-FAILED";
}

function isDryRunSuccess(
  dryRun: RealProviderProposalDryRunResult,
): dryRun is Extract<
  RealProviderProposalDryRunResult,
  { readonly providerCalled: true; readonly rawProposal: ProviderEditRawProposal }
> {
  return (
    dryRun.status === "dry-run-proposal-created" ||
    dryRun.status === "dry-run-review-required" ||
    dryRun.status === "dry-run-exact-ready-no-write"
  );
}

function isExactReadyDryRun(
  dryRun: Extract<
    RealProviderProposalDryRunResult,
    { readonly providerCalled: true; readonly rawProposal: ProviderEditRawProposal }
  >,
): boolean {
  return dryRun.status === "dry-run-exact-ready-no-write" &&
    (
      dryRun.anchoredProposal.handoffReadiness === "exact-single-target" ||
      dryRun.anchoredProposal.handoffReadiness === "exact-hunk-set"
    );
}

function readCurrentContentByTargetLabel(input: {
  readonly workspaceRoot: string;
  readonly targetPaths: readonly string[];
}): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const targetPath of input.targetPaths) {
    const current = readWorkspaceFile(input.workspaceRoot, targetPath);
    if (current !== undefined) {
      result.set(targetPath, current);
    }
  }
  return result;
}

function proposalPreparation(input: Omit<
  PlanningRuntimeProductProposalPreparation,
  "proposalPreparationId"
>): PlanningRuntimeProductProposalPreparation {
  const proposalPreparationId = `planning-product-proposal-${hashContent(JSON.stringify({
    status: input.status,
    source: input.source,
    targetPaths: input.rawProposal?.targets?.map((target) => target.path) ?? [],
    reason: input.reason,
  })).slice(0, 12)}`;
  return {
    proposalPreparationId,
    ...input,
    evidence: unique([
      `planning-runtime-product-proposal:id:${proposalPreparationId}`,
      `planning-runtime-product-proposal:status:${input.status}`,
      `planning-runtime-product-proposal:source:${input.source}`,
      `planning-runtime-product-proposal:provider-called:${input.providerCalled}`,
      `planning-runtime-product-proposal:live-opt-in:${input.liveOptIn}`,
      `planning-runtime-product-proposal:live-evidence-source:${input.liveEvidenceSource}`,
      ...input.evidence,
    ]),
  };
}

function readWorkspaceFile(
  workspaceRootInput: string,
  relativePath: string,
): string | undefined {
  const workspaceRoot = path.resolve(workspaceRootInput);
  const absolutePath = path.resolve(workspaceRoot, relativePath);
  if (!isSameOrInside(absolutePath, workspaceRoot)) {
    return undefined;
  }
  try {
    return fs.readFileSync(absolutePath, "utf8");
  } catch {
    return undefined;
  }
}

function isSameOrInside(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeEvidenceValue(value: string): string {
  return value.replace(/[^a-zA-Z0-9._:-]+/g, "_").slice(0, 120) || "unknown";
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
