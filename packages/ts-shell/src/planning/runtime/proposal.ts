import fs from "node:fs";
import path from "node:path";

import type { ContextAwareProviderPromptContext } from "../../orchestration/contextAwareProviderPrompt.js";
import { buildPlanningExactProposal } from "../../orchestration/planningExactProposal.js";
import type { PlanningRuntimeResult } from "./engine.js";
import type { PlanningMutationHandoffProjection } from "../handoff/mutation.js";
import { hashContent } from "../../orchestration/patchRecovery/recoveryAuthorityStore.js";
import type { ProviderExactPatchClassification } from "../../orchestration/providerExactPatchContract.js";
import type { ProviderEditRawProposal } from "../../orchestration/providerEditProposal.js";
import type { PlanningRuntimeProductLiveProviderProposal } from "../../orchestration/planningRuntimeProductExecution.js";
import {
  projectProviderProposalBoundaryFromPreparation,
  type ProductProviderProposalBoundary,
} from "../../proposal/providerProposalFacade.js";
import {
  runRealProviderProposalDryRun,
  type RealProviderProposalDryRunResult,
} from "../../orchestration/realProviderProposalDryRun.js";

export type PlanningRuntimeProductProposalStatus =
  | "prepared-exact"
  | "live-provider-config-failed"
  | "live-provider-network-blocked"
  | "live-provider-auth-failed"
  | "live-provider-output-insufficient"
  | "live-provider-patch-author-unsuitable"
  | "live-provider-invalid-format"
  | "live-provider-target-mismatch"
  | "live-provider-old-text-not-found"
  | "live-provider-old-text-multiple-matches"
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
  readonly providerProposalBoundary: ProductProviderProposalBoundary;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

type LiveProviderTerminalClass =
  | "CONFIG-FAILED"
  | "AUTH-FAILED"
  | "NETWORK-BLOCKED"
  | "INVALID-FORMAT"
  | "TARGET-MISMATCH"
  | "OLD-TEXT-NOT-FOUND"
  | "OLD-TEXT-MULTIPLE-MATCHES"
  | "PROVIDER-OUTPUT-INSUFFICIENT"
  | "PATCH-AUTHOR-UNSUITABLE"
  | "PROVIDER-ERROR"
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
    taskEvidence: input.liveProvider.taskEvidence,
    calibration: input.liveProvider.calibration,
  });
  const calibrationMode = input.liveProvider.calibration?.mode;
  const commonEvidence = [
    "planning-runtime-product-proposal:live-provider-opt-in:true",
    `planning-runtime-product-proposal:live-provider-source:${input.liveProvider.source}`,
    `planning-runtime-product-proposal:live-provider-attempt-count:${attempts.length}`,
    `planning-runtime-product-proposal:live-provider-fallback-policy:${input.liveProvider.fallbackPolicy?.enabled ? "enabled" : "disabled"}`,
    ...(input.liveProvider.taskEvidence?.mode
      ? [`planning-runtime-product-proposal:live-provider-task-evidence:${input.liveProvider.taskEvidence.mode}`]
      : []),
    ...(calibrationMode
      ? [`planning-runtime-product-proposal:live-provider-calibration:${calibrationMode}`]
      : []),
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

    const dryRunOutcome = await runLiveProviderAttemptWithContractRetry({
      workspaceRoot: input.workspaceRoot,
      handoff: input.handoff,
      promptContext,
      attempt,
      calibrationMode,
    });
    const dryRun = dryRunOutcome.dryRun;
    attemptEvidence.push(
      ...dryRunOutcome.evidence,
      `planning-runtime-product-proposal:live-provider-${attempt.role}:dry-run-status:${dryRun.status}`,
      `planning-runtime-product-proposal:live-provider-${attempt.role}:provider-called:${dryRun.providerCalled}`,
    );
    if (dryRunOutcome.providerCalled) {
      providerCalled = true;
      liveEvidenceSource = attempt.evidenceSource ?? "not-proven";
    }

    if (isDryRunSuccess(dryRun)) {
      const exact = isExactReadyDryRun(dryRun);
      const exactClass = classifyDryRunExactPatch(dryRun);
      const terminalClass = liveProviderTerminalClassForExactPatch(exactClass);
      if (!exact && terminalClass) {
        return liveProviderFailure({
          terminalClass,
          providerCalled: true,
          liveEvidenceSource: attempt.evidenceSource ?? "not-proven",
          reason: `${terminalClass}: live provider exact patch was not anchorable against current target content.`,
          nextAction:
            "Refresh the target read evidence or request a unique exact oldText anchor before apply.",
          evidence: [
            ...attemptEvidence,
            "planning-runtime-product-proposal:live-provider-status:provider-called",
            `planning-runtime-product-proposal:live-provider-selected-attempt:${attempt.role}`,
            `planning-runtime-product-proposal:live-provider-output:${dryRun.outputValidation.status}`,
            `planning-runtime-product-proposal:live-provider-anchor:${dryRun.anchoredProposal.handoffReadiness}`,
            `planning-runtime-product-proposal:live-provider-exact-classification:${exactClass}`,
            `planning-runtime-product-proposal:live-provider-${attempt.role}:status:${terminalClass}`,
            "planning-runtime-product-proposal:raw-provider-output-excluded",
            "planning-runtime-product-proposal:no-provider-call-during-apply",
          ],
        });
      }
      if (!exact && calibrationMode === "exact-patch-author") {
        lastTerminalClass = classifyExactPatchAuthorInsufficiency(dryRun);
        attemptEvidence.push(
          `planning-runtime-product-proposal:live-provider-${attempt.role}:status:${lastTerminalClass}`,
          "planning-runtime-product-proposal:providerPatchRole:reviewer-or-planner",
          "planning-runtime-product-proposal:exactPatchAuthor:deterministic-builder",
        );
        continue;
      }
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
            : `Live provider dry-run remained review-only: ${describeReviewOnlyDryRun(dryRun)}.`,
        nextAction:
          "Review the provider proposal and anchored evidence before any explicit confirmation.",
        evidence: [
          ...attemptEvidence,
          `planning-runtime-product-proposal:live-provider-status:${exact ? "provider-called" : "REVIEW-ONLY"}`,
          `planning-runtime-product-proposal:live-provider-selected-attempt:${attempt.role}`,
          `planning-runtime-product-proposal:live-provider-output:${dryRun.outputValidation.status}`,
          `planning-runtime-product-proposal:live-provider-anchor:${dryRun.anchoredProposal.handoffReadiness}`,
          `planning-runtime-product-proposal:live-provider-exact-classification:${exactClass}`,
          "planning-runtime-product-proposal:raw-provider-output-excluded",
          "planning-runtime-product-proposal:no-provider-call-during-apply",
        ],
      });
    }

    lastTerminalClass = calibrationMode === "exact-patch-author"
      ? classifyExactPatchAuthorFailure(dryRun)
      : classifyDryRunFailure(dryRun);
    attemptEvidence.push(
      `planning-runtime-product-proposal:live-provider-${attempt.role}:status:${lastTerminalClass}`,
    );
  }

  return liveProviderFailure({
    terminalClass: lastTerminalClass,
    providerCalled,
    liveEvidenceSource,
    reason: calibrationMode === "exact-patch-author"
      ? `${lastTerminalClass}: live provider did not prove suitability as a direct exact patch author.`
      : `${lastTerminalClass}: live-provider proposal opt-in did not produce a usable provider proposal.`,
    nextAction: calibrationMode === "exact-patch-author"
      ? "Use live provider output for review/planning and let the deterministic builder author exact oldText/newText patches."
      : "Review provider readiness/fallback evidence; do not claim live provider success.",
    evidence: [
      ...attemptEvidence,
      `planning-runtime-product-proposal:live-provider-status:${lastTerminalClass}`,
      ...(calibrationMode === "exact-patch-author"
        ? [
            "planning-runtime-product-proposal:providerPatchRole:reviewer-or-planner",
            "planning-runtime-product-proposal:exactPatchAuthor:deterministic-builder",
          ]
        : []),
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
      `planning-runtime-product-proposal:live-provider-status:${input.terminalClass}`,
      `planning-runtime-product-proposal:provider-called:${input.providerCalled ?? false}`,
      "planning-runtime-product-proposal:raw-provider-output-excluded",
    ],
  });
}

function buildLiveProviderPromptContext(input: {
  readonly workspaceRoot: string;
  readonly handoff: PlanningMutationHandoffProjection;
  readonly planningResult?: PlanningRuntimeResult;
  readonly taskEvidence?: PlanningRuntimeProductLiveProviderProposal["taskEvidence"];
  readonly calibration?: PlanningRuntimeProductLiveProviderProposal["calibration"];
}): ContextAwareProviderPromptContext | undefined {
  const targetPath = input.handoff.targetPaths[0];
  const targetPaths = input.handoff.targetPaths.slice(0, 3);
  const bundle = input.planningResult?.context.bundle;
  if (!targetPath || !bundle || input.handoff.handoffState !== "handoff-ready") {
    return undefined;
  }
  const requestId = `planning-product-live-${hashContent(JSON.stringify({
    runtimeId: input.planningResult?.runtimeId,
    handoffId: input.handoff.handoffId,
    targetPath,
  })).slice(0, 12)}`;
  const calibrationContent = input.calibration?.mode === "exact-patch-author"
    ? boundedTargetContent({
        workspaceRoot: input.workspaceRoot,
        targetPath,
        maxChars: input.calibration.targetContentMaxChars ?? 4000,
      })
    : undefined;
  const taskEvidenceContent = input.taskEvidence?.mode === "single-file-exact-patch"
    ? boundedTargetContent({
        workspaceRoot: input.workspaceRoot,
        targetPath,
        maxChars: input.taskEvidence.targetContentMaxChars ?? 6000,
      })
    : undefined;
  const targetSetEvidenceContent = input.taskEvidence?.mode === "small-target-set-exact-patch"
    ? boundedTargetSetContent({
        workspaceRoot: input.workspaceRoot,
        targetPaths,
        maxCharsPerTarget: input.taskEvidence.targetContentMaxChars ?? 5000,
      })
    : undefined;
  const suppliedTargetContent = calibrationContent ?? taskEvidenceContent;
  const providerPrompt = [
    "Create an exact single-file patch proposal from Planning Runtime evidence.",
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
    "Required shape when current target content is supplied: {\"targetFile\":\"<explicit target>\",\"oldText\":\"<exact current text>\",\"newText\":\"<replacement text>\",\"reason\":\"<short reason>\",\"verificationHint\":\"<safe readback/test>\"}.",
    "oldText and newText are mandatory unless a required fact is missing.",
    "oldText must be copied byte-for-byte from current read evidence and must identify one exact region in the selected target.",
    "newText must be non-empty and bounded to that replacement only.",
    "Review-only is allowed only if a required fact is missing; if so return {\"status\":\"review-only\",\"targetFile\":\"<explicit target>\",\"missingFact\":\"<specific missing fact>\",\"reason\":\"<why exact oldText/newText cannot be produced>\"}.",
    "Return only the explicit single target path from this prompt.",
    ...(input.calibration?.mode === "exact-patch-author"
      ? [
          "Calibration mode: answer whether you can act as a direct single-file exact patch author.",
          suppliedTargetContent
            ? `Current target content for ${targetPath}:\n<<<ROUTE216_TARGET_CONTENT\n${suppliedTargetContent}\nROUTE216_TARGET_CONTENT`
            : "Current target content was not available; name that as the missingFact if you cannot produce oldText/newText.",
          "Use the supplied current target content as the only source for oldText.",
        ]
      : []),
    ...(input.taskEvidence?.mode === "single-file-exact-patch"
      ? [
          "Route217 task mode: produce one exact oldText/newText patch for this real single-file task when the supplied target content is sufficient.",
          ...(input.taskEvidence.taskIntentSummary
            ? [`Route217 task intent: ${input.taskEvidence.taskIntentSummary}`]
            : []),
          suppliedTargetContent
            ? `Current target content for ${targetPath}:\n<<<ROUTE217_TARGET_CONTENT\n${suppliedTargetContent}\nROUTE217_TARGET_CONTENT`
            : "Current target content was not available; return review-only with missingFact=current target content.",
          "Use the supplied current target content as the only source for oldText.",
          "Return a single JSON object only. The first character must be { and the last character must be }.",
          "Do not include prose, markdown, code fences, diffs, analysis text, or multiple alternatives.",
          "If exact oldText/newText cannot be copied from the supplied target content, return review-only JSON with a concrete missingFact.",
        ]
      : []),
    ...(input.taskEvidence?.mode === "small-target-set-exact-patch"
      ? [
          "Route218 small target-set mode: produce a bounded exact target-set proposal for 2-3 explicit files when the supplied target content is sufficient.",
          ...(input.taskEvidence.taskIntentSummary
            ? [`Route218 task intent: ${input.taskEvidence.taskIntentSummary}`]
            : []),
          `Explicit target set: ${targetPaths.join(", ")}`,
          targetSetEvidenceContent
            ? `Current target contents:\n<<<ROUTE218_TARGET_SET_CONTENT\n${targetSetEvidenceContent}\nROUTE218_TARGET_SET_CONTENT`
            : "Current target-set content was not available; return review-only with missingFact=current target-set content.",
          "Use the supplied current target contents as the only source for each oldText.",
          "Return a single JSON object only. The first character must be { and the last character must be }.",
          "Required shape: {\"operationKind\":\"exact-fenced-replacement\",\"targets\":[{\"path\":\"<explicit target>\",\"oldText\":\"<exact current text>\",\"newText\":\"<replacement text>\",\"summary\":\"<safe summary>\"}],\"verificationPlan\":[\"<safe readback/test>\"]}.",
          "Every returned target path must be in the explicit target set, and each oldText must identify one exact region in its own file.",
          "Do not include prose, markdown, code fences, diffs, analysis text, or alternatives.",
          "If any required file cannot be patched exactly, return review-only JSON with a concrete missingFact rather than a partial success claim.",
        ]
      : []),
    "Do not claim files were changed. Do not run commands. Do not include provider config, API keys, headers, or content outside the supplied target evidence.",
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
      "single-file exact patch provider proposal when evidence is sufficient",
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
      ...(input.calibration?.mode === "exact-patch-author"
        ? [
            "planning-runtime-product-proposal:live-provider-calibration:exact-patch-author",
            `planning-runtime-product-proposal:live-provider-target-content:${suppliedTargetContent ? "included" : "missing"}`,
            "planning-runtime-product-proposal:live-provider-old-new-mandatory",
          ]
        : []),
      ...(input.taskEvidence?.mode === "single-file-exact-patch"
        ? [
            "planning-runtime-product-proposal:live-provider-task-evidence:single-file-exact-patch",
            `planning-runtime-product-proposal:live-provider-target-content:${suppliedTargetContent ? "included" : "missing"}`,
            `planning-runtime-product-proposal:live-provider-task-intent:${input.taskEvidence.taskIntentSummary ? "included" : "missing"}`,
            "planning-runtime-product-proposal:live-provider-old-new-mandatory",
          ]
        : []),
      ...(input.taskEvidence?.mode === "small-target-set-exact-patch"
        ? [
            "planning-runtime-product-proposal:live-provider-task-evidence:small-target-set-exact-patch",
            `planning-runtime-product-proposal:live-provider-target-set-size:${targetPaths.length}`,
            `planning-runtime-product-proposal:live-provider-target-set-content:${targetSetEvidenceContent ? "included" : "missing"}`,
            `planning-runtime-product-proposal:live-provider-task-intent:${input.taskEvidence.taskIntentSummary ? "included" : "missing"}`,
            "planning-runtime-product-proposal:live-provider-target-set-old-new-mandatory",
          ]
        : []),
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
  const exactClass = classifyDryRunExactPatch(dryRun);
  if (exactClass === "review-only" && isReviewOnlyOutputInsufficient(dryRun)) {
    return "PROVIDER-OUTPUT-INSUFFICIENT";
  }
  switch (exactClass) {
    case "invalid-format":
      return "INVALID-FORMAT";
    case "target-mismatch":
      return "TARGET-MISMATCH";
    case "old-text-not-found":
      return "OLD-TEXT-NOT-FOUND";
    case "old-text-multiple-matches":
      return "OLD-TEXT-MULTIPLE-MATCHES";
    default:
      break;
  }
  switch (dryRun.providerErrorClass) {
    case "auth":
      return "AUTH-FAILED";
    case "missing-key":
      return "CONFIG-FAILED";
    case "network":
    case "timeout":
      return "NETWORK-BLOCKED";
    default:
      return "PROVIDER-ERROR";
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
    case "INVALID-FORMAT":
      return "live-provider-invalid-format";
    case "TARGET-MISMATCH":
      return "live-provider-target-mismatch";
    case "OLD-TEXT-NOT-FOUND":
      return "live-provider-old-text-not-found";
    case "OLD-TEXT-MULTIPLE-MATCHES":
      return "live-provider-old-text-multiple-matches";
    case "PROVIDER-OUTPUT-INSUFFICIENT":
      return "live-provider-output-insufficient";
    case "PATCH-AUTHOR-UNSUITABLE":
      return "live-provider-patch-author-unsuitable";
    case "PROVIDER-ERROR":
      return "live-provider-failed";
    case "FAILED":
      return "live-provider-failed";
  }
}

function canUseFallbackAfter(terminalClass: LiveProviderTerminalClass): boolean {
  return terminalClass === "NETWORK-BLOCKED" ||
    terminalClass === "PROVIDER-ERROR";
}

async function runLiveProviderAttemptWithContractRetry(input: {
  readonly workspaceRoot: string;
  readonly handoff: PlanningMutationHandoffProjection;
  readonly promptContext: ContextAwareProviderPromptContext;
  readonly attempt: NonNullable<PlanningRuntimeProductLiveProviderProposal["attempts"]>[number];
  readonly calibrationMode?: PlanningRuntimeProductLiveProviderProposal["calibration"]["mode"];
}): Promise<{
  readonly dryRun: RealProviderProposalDryRunResult;
  readonly providerCalled: boolean;
  readonly evidence: readonly string[];
}> {
  const evidence: string[] = [];
  const first = await runLiveProviderDryRunAttempt({
    workspaceRoot: input.workspaceRoot,
    handoff: input.handoff,
    promptContext: input.promptContext,
    attempt: input.attempt,
    requestIdSuffix: "initial",
  });
  evidence.push(
    ...first.evidence,
    `planning-runtime-product-proposal:live-provider-${input.attempt.role}:contract-attempt:initial`,
  );
  const firstTerminalClass = input.calibrationMode === "exact-patch-author"
    ? classifyExactPatchAuthorFailure(first)
    : classifyDryRunFailure(first);
  if (!shouldContractRetry(firstTerminalClass)) {
    return {
      dryRun: first,
      providerCalled: first.providerCalled,
      evidence,
    };
  }

  evidence.push(
    `planning-runtime-product-proposal:live-provider-${input.attempt.role}:contract-retry:started`,
    `planning-runtime-product-proposal:live-provider-${input.attempt.role}:contract-retry-trigger:${firstTerminalClass}`,
  );
  const retry = await runLiveProviderDryRunAttempt({
    workspaceRoot: input.workspaceRoot,
    handoff: input.handoff,
    promptContext: buildContractRepairPromptContext(input.promptContext),
    attempt: input.attempt,
    requestIdSuffix: "contract-retry-1",
  });
  evidence.push(
    ...retry.evidence,
    `planning-runtime-product-proposal:live-provider-${input.attempt.role}:contract-attempt:contract-retry-1`,
    `planning-runtime-product-proposal:live-provider-${input.attempt.role}:contract-retry:finished`,
  );
  return {
    dryRun: retry,
    providerCalled: first.providerCalled || retry.providerCalled,
    evidence,
  };
}

async function runLiveProviderDryRunAttempt(input: {
  readonly workspaceRoot: string;
  readonly handoff: PlanningMutationHandoffProjection;
  readonly promptContext: ContextAwareProviderPromptContext;
  readonly attempt: NonNullable<PlanningRuntimeProductLiveProviderProposal["attempts"]>[number];
  readonly requestIdSuffix: "initial" | "contract-retry-1";
}): Promise<RealProviderProposalDryRunResult> {
  return runRealProviderProposalDryRun({
    requestId: `route211-product-live-${input.attempt.role}-${input.requestIdSuffix}-${input.handoff.handoffId}`,
    dryRunOptIn: true,
    promptContext: input.promptContext,
    explicitTargetLabels: input.handoff.targetPaths,
    lifecycleId: input.promptContext.taskLifecycleId,
    analysisBriefId: input.promptContext.analysisBriefId,
    analysisQualityId: input.promptContext.analysisQualityId,
    analysisQualityDecision: input.promptContext.analysisQualityDecision,
    planQualityId: input.promptContext.planQualityId,
    planQualityLevel: input.promptContext.planQualityLevel,
    contextPacketId: input.promptContext.contextPacketId,
    contextGraphId: input.promptContext.contextGraphId,
    codeGraphTraceId: input.promptContext.codeGraphTraceId,
    taskExecutionPlanId: input.promptContext.taskExecutionPlanId,
    providerAvailability: input.attempt.providerAvailability,
    redactionStatus: input.promptContext.redactionStatus,
    provider: input.attempt.provider,
    currentContentByTargetLabel: readCurrentContentByTargetLabel({
      workspaceRoot: input.workspaceRoot,
      targetPaths: input.handoff.targetPaths,
    }),
    inWorkspaceTargetLabels: input.handoff.targetPaths,
  });
}

function shouldContractRetry(terminalClass: LiveProviderTerminalClass): boolean {
  return terminalClass === "INVALID-FORMAT" ||
    terminalClass === "PROVIDER-OUTPUT-INSUFFICIENT";
}

function buildContractRepairPromptContext(
  context: ContextAwareProviderPromptContext,
): ContextAwareProviderPromptContext {
  return {
    ...context,
    requestId: `${context.requestId}-contract-retry-1`,
    providerPrompt: [
      context.providerPrompt,
      "",
      "Contract repair retry 1 of 1.",
      "Your prior response did not satisfy the exact patch JSON contract.",
      "Return exactly one JSON object and nothing else.",
      "Required shape: {\"targetFile\":\"<explicit target>\",\"oldText\":\"<exact current text copied from supplied target content>\",\"newText\":\"<replacement text>\",\"reason\":\"<short reason>\",\"verificationHint\":\"<safe verification>\"}.",
      "If exact oldText/newText cannot be copied from supplied current target content, return {\"status\":\"review-only\",\"targetFile\":\"<explicit target>\",\"missingFact\":\"<specific missing fact>\",\"reason\":\"<why exact oldText/newText cannot be produced>\"}.",
      "Do not include markdown fences, prose, diffs, multiple alternatives, or guessed anchors.",
    ].join("\n"),
    evidence: [
      ...context.evidence,
      "planning-runtime-product-proposal:live-provider-contract-retry:prompt:exact-json-only",
      "planning-runtime-product-proposal:live-provider-contract-retry:max-attempts:1",
    ],
  };
}

function classifyExactPatchAuthorInsufficiency(
  dryRun: Extract<
    RealProviderProposalDryRunResult,
    { readonly providerCalled: true; readonly rawProposal: ProviderEditRawProposal }
  >,
): LiveProviderTerminalClass {
  const diagnostics = dryRun.rawProposal.diagnostics ?? [];
  const oldTextPresent = diagnostics.includes("provider-exact-patch-diagnostic:old-text-present:true");
  const newTextPresent = diagnostics.includes("provider-exact-patch-diagnostic:new-text-present:true");
  const missingFactPresent = diagnostics.includes(
    "provider-exact-patch-diagnostic:review-only-missing-fact-present:true",
  );
  if (!oldTextPresent || !newTextPresent) return "PROVIDER-OUTPUT-INSUFFICIENT";
  return missingFactPresent ? "PROVIDER-OUTPUT-INSUFFICIENT" : "PATCH-AUTHOR-UNSUITABLE";
}

function classifyExactPatchAuthorFailure(
  dryRun: RealProviderProposalDryRunResult,
): LiveProviderTerminalClass {
  if (
    dryRun.evidence.includes("provider-exact-patch-contract:parse:missing-required-field") ||
    dryRun.evidence.includes("provider-exact-patch-contract:parse:empty-old-or-new") ||
    dryRun.evidence.includes("provider-exact-patch-contract:parse:unchanged-old-new") ||
    dryRun.evidence.includes("provider-exact-patch-diagnostic:old-text-present:false") ||
    dryRun.evidence.includes("provider-exact-patch-diagnostic:new-text-present:false")
  ) {
    return "PROVIDER-OUTPUT-INSUFFICIENT";
  }
  return classifyDryRunFailure(dryRun);
}

function liveProviderTerminalClassForExactPatch(
  classification: ProviderExactPatchClassification,
): LiveProviderTerminalClass | undefined {
  switch (classification) {
    case "invalid-format":
      return "INVALID-FORMAT";
    case "target-mismatch":
      return "TARGET-MISMATCH";
    case "old-text-not-found":
      return "OLD-TEXT-NOT-FOUND";
    case "old-text-multiple-matches":
      return "OLD-TEXT-MULTIPLE-MATCHES";
    default:
      return undefined;
  }
}

function describeReviewOnlyDryRun(
  dryRun: Extract<
    RealProviderProposalDryRunResult,
    { readonly providerCalled: true; readonly rawProposal: ProviderEditRawProposal }
  >,
): string {
  const output = dryRun.outputValidation.status;
  const anchor = dryRun.anchoredProposal.handoffReadiness;
  const anchoring = dryRun.anchoringResult.status;
  if (output === "partial-anchor") {
    return `review-only because provider output was target-bound but missing complete oldText/newText anchors (${anchoring})`;
  }
  if (output === "unanchored-generated") {
    return "review-only because provider output did not include exact target-bound anchors";
  }
  return `review-only because anchor=${anchor}, output=${output}, anchoring=${anchoring}`;
}

function classifyDryRunExactPatch(
  dryRun: RealProviderProposalDryRunResult,
): ProviderExactPatchClassification {
  if (dryRun.status === "dry-run-provider-error") {
    if (dryRun.providerErrorClass === "auth") return "auth-failed";
    if (dryRun.providerErrorClass === "missing-key") return "config-failed";
    if (dryRun.providerErrorClass === "network" || dryRun.providerErrorClass === "timeout") {
      return "network-blocked";
    }
    return "provider-error";
  }
  if (
    dryRun.status === "dry-run-provider-not-configured" ||
    dryRun.status === "dry-run-provider-unsupported" ||
    dryRun.status === "dry-run-missing-context"
  ) {
    return "config-failed";
  }
  if (dryRun.outputValidation?.targetBinding === "outside-context") return "target-mismatch";
  if (
    dryRun.outputValidation?.status === "malformed-output" ||
    dryRun.outputValidation?.status === "empty-output" ||
    dryRun.outputValidation?.status === "over-budget-output" ||
    dryRun.outputValidation?.status === "unsafe-output" ||
    dryRun.outputValidation?.status === "fuzzy-output" ||
    dryRun.outputValidation?.status === "broad-refactor-output" ||
    dryRun.outputValidation?.status === "unanchored-generated"
  ) {
    return "invalid-format";
  }
  if (dryRun.anchoringResult?.evidence.includes("provider-anchor-match:outcome:no-match")) {
    return "old-text-not-found";
  }
  if (dryRun.anchoringResult?.evidence.includes("provider-anchor-match:outcome:multiple-candidates-ambiguous")) {
    return "old-text-multiple-matches";
  }
  if (
    dryRun.status === "dry-run-exact-ready-no-write" &&
    dryRun.rawProposal?.diagnostics?.includes("provider-exact-patch-diagnostic:parse-status:recovered-exact-patch")
  ) {
    return "recovered-exact-ready";
  }
  if (dryRun.status === "dry-run-exact-ready-no-write") return "exact-ready";
  if (dryRun.status === "dry-run-review-required") return "review-only";
  return "provider-error";
}

function isReviewOnlyOutputInsufficient(
  dryRun: RealProviderProposalDryRunResult,
): boolean {
  if (dryRun.status !== "dry-run-review-required") return false;
  const diagnostics = dryRun.rawProposal?.diagnostics ?? [];
  return (
    diagnostics.includes("provider-exact-patch-diagnostic:parse-status:review-only") ||
    diagnostics.includes("provider-exact-patch-diagnostic:old-text-present:false") ||
    diagnostics.includes("provider-exact-patch-diagnostic:new-text-present:false") ||
    dryRun.outputValidation?.status === "partial-anchor" ||
    dryRun.outputValidation?.status === "unanchored-generated"
  );
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
  "proposalPreparationId" | "providerProposalBoundary"
>): PlanningRuntimeProductProposalPreparation {
  const proposalPreparationId = `planning-product-proposal-${hashContent(JSON.stringify({
    status: input.status,
    source: input.source,
    targetPaths: input.rawProposal?.targets?.map((target) => target.path) ?? [],
    reason: input.reason,
  })).slice(0, 12)}`;
  const providerProposalBoundary = projectProviderProposalBoundaryFromPreparation({
    source: input.source,
    status: input.status,
    providerCalled: input.providerCalled,
    liveOptIn: input.liveOptIn,
    liveEvidenceSource: input.liveEvidenceSource,
    targetFiles: input.rawProposal?.targets?.map((target) => target.path) ?? [],
    evidence: input.evidence,
    reason: input.reason,
  });
  return {
    proposalPreparationId,
    ...input,
    providerProposalBoundary,
    evidence: unique([
      `planning-runtime-product-proposal:id:${proposalPreparationId}`,
      `planning-runtime-product-proposal:status:${input.status}`,
      `planning-runtime-product-proposal:source:${input.source}`,
      `planning-runtime-product-proposal:provider-called:${input.providerCalled}`,
      `planning-runtime-product-proposal:live-opt-in:${input.liveOptIn}`,
      `planning-runtime-product-proposal:live-evidence-source:${input.liveEvidenceSource}`,
      `planning-runtime-product-proposal:provider-boundary:${providerProposalBoundary.provider.readiness}`,
      `planning-runtime-product-proposal:proposal-boundary:${providerProposalBoundary.proposal.exactness}`,
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

function boundedTargetContent(input: {
  readonly workspaceRoot: string;
  readonly targetPath: string;
  readonly maxChars: number;
}): string | undefined {
  const content = readWorkspaceFile(input.workspaceRoot, input.targetPath);
  if (content === undefined || content.length > input.maxChars) return undefined;
  return content;
}

function boundedTargetSetContent(input: {
  readonly workspaceRoot: string;
  readonly targetPaths: readonly string[];
  readonly maxCharsPerTarget: number;
}): string | undefined {
  const sections: string[] = [];
  for (const targetPath of input.targetPaths) {
    const content = boundedTargetContent({
      workspaceRoot: input.workspaceRoot,
      targetPath,
      maxChars: input.maxCharsPerTarget,
    });
    if (content === undefined) return undefined;
    sections.push([
      `FILE ${targetPath}`,
      "<<<CONTENT",
      content,
      "CONTENT",
    ].join("\n"));
  }
  return sections.length >= 2 ? sections.join("\n---\n") : undefined;
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
