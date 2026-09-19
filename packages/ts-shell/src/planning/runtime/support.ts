import crypto from "node:crypto";

import type { ContextEngineResult } from "../../context/acquisition/engine.js";
import type {
  PlanningMutationHandoffContextReceiptInput,
  PlanningMutationHandoffReadEvidenceInput,
} from "../handoff/mutation.js";
import type {
  PlanningRuntimeEditTarget,
  PlanningRuntimeResult,
  PlanningUnsupportedClassification,
} from "./types.js";

/**
 * Planning runtime support facts.
 *
 * Unsupported classification, handoff receipts and read evidence, verification
 * intent, edit-target selection, blocking facts, and warnings. These are the
 * narrower determinations the plan-quality builders in `./facts.js` draw on.
 */

export function buildUnsupportedClassification(input: {
  readonly runtimeId: string;
  readonly context: ContextEngineResult;
  readonly status: PlanningRuntimeResult["status"];
  readonly missingFacts: readonly string[];
  readonly editTargets: readonly PlanningRuntimeEditTarget[];
}): PlanningUnsupportedClassification {
  const reasons = unique([
    ...(input.status === "unsupported" ? ["planning status unsupported"] : []),
    ...(input.missingFacts.length > 0 ? ["insufficient context"] : []),
    ...(input.context.discoveryHandoff?.ambiguityState === "multiple-plausible-candidates" ? ["ambiguous target"] : []),
    ...(input.context.bundle?.stagedContextAcquisition.staleContext.status === "stale" ? ["stale context"] : []),
    ...(input.editTargets.length === 0 && !isReadOnlyPlanningTask(input.context.workflowPlan.taskKind) ? ["missing target"] : []),
    ...(input.editTargets.some((target) => target.readiness === "unsupported") ? ["unsupported edit type"] : []),
    ...(input.context.workflowPlan.taskKind === "run-command" ? ["command-only task should bypass mutation handoff"] : []),
    ...(isBroadRefactorRequest(input.context.userTask) ? ["unsupported broad refactor"] : []),
    ...(requiresProviderButDisabled(input.context.userTask) ? ["requires provider but provider disabled"] : []),
  ]);
  const unsafeReasons = unique([
    ...(requestsUnsafeAuthority(input.context.userTask) ? ["unsafe authority request"] : []),
  ]);
  const unsupportedReasons = unique([...reasons, ...unsafeReasons]);
  const classificationId = `planning_unsupported_${hash({
    runtimeId: input.runtimeId,
    reasons: unsupportedReasons,
  })}`;

  return {
    classificationId,
    reasons: unsupportedReasons,
    unsafeReasons,
    unsupportedReasons,
    commandOnlyBypassesMutationHandoff: input.context.workflowPlan.taskKind === "run-command",
    terminalSuccessClaim: false,
    evidence: [
      `planning-unsupported-classification:id:${classificationId}`,
      `planning-unsupported-classification:reasons:${unsupportedReasons.length}`,
      `planning-unsupported-classification:command-only:${input.context.workflowPlan.taskKind === "run-command"}`,
      "planning-unsupported-classification:terminal-success-claim:false",
    ],
  };
}

export function buildHandoffContextReceipts(
  context: ContextEngineResult,
): readonly PlanningMutationHandoffContextReceiptInput[] {
  return context.memory.fileReceipts.map((receipt, index) => ({
    id: `context-receipt:${context.memory.memoryId}:${index + 1}`,
    path: receipt.path,
    summary: receipt.summary,
    relevance: receipt.relevance,
  }));
}

export function buildHandoffReadEvidence(
  context: ContextEngineResult,
): readonly PlanningMutationHandoffReadEvidenceInput[] {
  return context.filesRead.map((file, index) => ({
    id: `read-evidence:${context.engineId}:${index + 1}`,
    path: file.path,
    reason: file.reason,
    source: file.source,
  }));
}

export function hasVerificationIntent(
  verificationIntent: PlanningRuntimeResult["verificationIntent"],
): boolean {
  if ("verificationPlanId" in verificationIntent) {
    return Boolean(
      verificationIntent.commandSafeLabel ||
      verificationIntent.command ||
      verificationIntent.expectedEvidence.length > 0,
    );
  }
  return verificationIntent.commands.length > 0;
}

export function summarizeVerificationIntent(
  verificationIntent: PlanningRuntimeResult["verificationIntent"],
): string {
  if ("verificationPlanId" in verificationIntent) {
    const command = verificationIntent.commandSafeLabel ?? "(no command)";
    return [
      `verificationPlan=${verificationIntent.verificationPlanId}`,
      `state=${verificationIntent.state}`,
      `source=${verificationIntent.source}`,
      `command=${command}`,
      `readiness=${verificationIntent.executionReadiness}`,
      "command-dispatch=not-run",
    ].join("; ");
  }
  return [
    `state=${verificationIntent.state}`,
    `commands=${verificationIntent.commands.length}`,
    "command-dispatch=not-run",
  ].join("; ");
}

export function collectVerificationEvidenceIds(
  verificationIntent: PlanningRuntimeResult["verificationIntent"],
): readonly string[] {
  if ("verificationPlanId" in verificationIntent) {
    return [
      verificationIntent.verificationPlanId,
      verificationIntent.sourceAgentPlanId,
      verificationIntent.sourceContextPacketId,
      verificationIntent.sourceContextGraphId,
      verificationIntent.sourceTestImpactPlanId,
      verificationIntent.sourceImpactQueryId,
      verificationIntent.sourcePlanQualityId,
      verificationIntent.sourceContextSufficiencyId,
      verificationIntent.sourceAnalysisQualityGateId,
      verificationIntent.sourceTaskLifecycleId,
      verificationIntent.sourceAnalysisBriefId,
      verificationIntent.sourceTaskExecutionPlanId,
    ].filter((id): id is string => Boolean(id));
  }
  return verificationIntent.evidence;
}

export function isReadOnlyPlanningTask(taskKind: ContextEngineResult["workflowPlan"]["taskKind"]): boolean {
  return taskKind === "read-file" ||
    taskKind === "inspect-files" ||
    taskKind === "repo-explain";
}

function isBroadRefactorRequest(userTask: string): boolean {
  return /\b(refactor|rewrite|change|fix)\s+(all|everything|entire|whole)\b/i.test(userTask) ||
    /\b(entire|whole)\s+(repo|repository|codebase)\b/i.test(userTask);
}

function requiresProviderButDisabled(userTask: string): boolean {
  return /\b(real provider|live provider|call provider|use provider)\b/i.test(userTask);
}

function requestsUnsafeAuthority(userTask: string): boolean {
  return /\b(apply|write|modify)\b.*\b(without|no)\s+(approval|permission|confirmation)\b/i.test(userTask) ||
    /\bskip\s+(verification|permission|approval)\b/i.test(userTask);
}

export function selectEditTargets(
  context: ContextEngineResult,
  blockingFacts: readonly string[],
): readonly PlanningRuntimeEditTarget[] {
  if (context.workflowPlan.taskKind !== "edit-file" && context.workflowPlan.taskKind !== "write-file") {
    return [];
  }
  if (context.status === "insufficient-context") {
    return [];
  }
  if (context.status === "reused-memory") {
    return context.memory.editTargetRationale.map((entry) => {
      const [path, ...rest] = entry.split(":");
      return {
        path: path.trim(),
        rationale: rest.join(":").trim() || "reused fresh context memory",
        handoffRoute: "existing-proof-carrying-mutation-runtime" as const,
        readiness: blockingFacts.length > 0 ? "needs-more-context" as const : "ready-for-review" as const,
      };
    });
  }
  const target = context.selectedCandidate;
  if (!target) {
    return [];
  }
  const needsMoreContext = blockingFacts.length > 0;
  return [
    {
      path: target.safeLabel,
      rationale: [
        `repo score ${target.score}`,
        ...target.reasons.slice(0, 3),
        context.bundle?.codeGraphImpact.readiness ? `impact=${context.bundle.codeGraphImpact.readiness}` : undefined,
      ].filter(Boolean).join("; "),
      handoffRoute: "existing-proof-carrying-mutation-runtime",
      readiness: needsMoreContext ? "needs-more-context" : "ready-for-review",
    },
  ];
}

export function buildBlockingFacts(input: {
  readonly context: ContextEngineResult;
  readonly memoryMissingFacts: readonly string[];
}): readonly string[] {
  if (!input.context.bundle) {
    return unique([
      ...input.context.missingFacts,
      ...input.memoryMissingFacts,
    ]);
  }
  const sufficiency = input.context.bundle.taskContextSufficiency;
  const calibration = input.context.bundle.analysisCalibration;
  const primaryTargetReadForReview = hasIncludedPrimaryTarget(input.context);
  const budgetLimitedBlocks =
    sufficiency.state === "budget-limited" &&
    !primaryTargetReadForReview;
  const sufficiencyBlocks = sufficiency.state === "needs-required-context" ||
    sufficiency.state === "stale-context" ||
    budgetLimitedBlocks ||
    sufficiency.state === "unsupported";
  const calibrationBlocks =
    (
      calibration.readiness === "missing-facts" &&
      !primaryTargetReadForReview
    ) ||
    calibration.readiness === "stale-context" ||
    calibration.readiness === "unsupported";
  return unique([
    ...input.context.repo.missingFacts,
    ...sufficiency.missingRequiredFacts,
    ...(sufficiencyBlocks ? [sufficiency.readinessDowngrade] : []),
    ...(calibrationBlocks ? calibration.missingFacts : []),
  ]);
}

function hasIncludedPrimaryTarget(context: ContextEngineResult): boolean {
  const selectedPath = context.selectedCandidate?.safeLabel;
  return Boolean(
    selectedPath &&
      isCodeLikePrimaryTarget(context.selectedCandidate?.role) &&
      context.filesRead.some((file) =>
        file.path === selectedPath &&
        file.reason === "explicit target" &&
        file.source === "repo-intelligence",
      ),
  );
}

function isCodeLikePrimaryTarget(
  role: NonNullable<ContextEngineResult["selectedCandidate"]>["role"] | undefined,
): boolean {
  return role === "source" || role === "test" || role === "entrypoint";
}

export function buildPlanningWarnings(input: {
  readonly context: ContextEngineResult;
  readonly verificationIntent: PlanningRuntimeResult["verificationIntent"];
  readonly blockingFacts: readonly string[];
}): readonly string[] {
  const blocking = new Set(input.blockingFacts);
  const bundle = input.context.bundle;
  const warnings = bundle
    ? [
        ...input.context.missingFacts,
        ...bundle.agentPlan.missingFacts,
        ...bundle.planQuality.missingFacts,
        ...bundle.taskContextSufficiency.missingOptionalFacts,
        ...bundle.taskContextSufficiency.omittedReasons,
        ...(bundle.analysisQualityGate.allowed ? [] : [bundle.analysisQualityGate.reason]),
        ...("verificationPlanId" in input.verificationIntent && input.verificationIntent.state !== "ready"
          ? [`verification intent ${input.verificationIntent.state}`]
          : []),
      ]
    : [
        ...input.context.memory.planningWarnings,
        ...("state" in input.verificationIntent && input.verificationIntent.state !== "memory-reused"
          ? [`verification intent ${input.verificationIntent.state}`]
          : []),
      ];
  return unique(warnings).filter((warning) => !blocking.has(warning));
}

export function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

export function hash(input: object): string {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 12);
}
