import crypto from "node:crypto";

import { buildVerificationCommandPlan, type VerificationCommandPlan } from "./verificationCommandPlan.js";
import { buildGroundedPlanningProjection } from "./groundedPlanningProjection.js";
import {
  buildPlanningMutationHandoffProjection,
  type PlanningMutationHandoffContextReceiptInput,
  type PlanningMutationHandoffReadEvidenceInput,
  type PlanningMutationHandoffProjection,
} from "./planningMutationHandoffProjection.js";
import {
  runContextEngine,
  type ContextEngineResult,
  type ContextEngineTaskKindHint,
} from "./contextEngine.js";
import type { ContextWorkingMemory } from "./contextMemory.js";

export type PlanningRuntimeTaskKindHint = ContextEngineTaskKindHint;

export interface PlanningRuntimeEditTarget {
  readonly path: string;
  readonly rationale: string;
  readonly handoffRoute:
    | "existing-proof-carrying-mutation-runtime"
    | "unsupported-before-mutation-runtime";
  readonly readiness: "ready-for-review" | "needs-more-context" | "unsupported";
}

export interface PlanningRuntimeResult {
  readonly runtimeId: string;
  readonly status: "ready-for-handoff" | "needs-more-context" | "unsupported";
  readonly context: ContextEngineResult;
  readonly groundedAnalysis: {
    readonly summary: string;
    readonly confidence: "high" | "medium" | "low";
    readonly missingFacts: readonly string[];
    readonly planningWarnings: readonly string[];
    readonly evidenceIds: readonly string[];
  };
  readonly executablePlan: {
    readonly summary: string;
    readonly steps: readonly string[];
    readonly planQuality?: string;
    readonly executionPlanId?: string;
  };
  readonly editTargets: readonly PlanningRuntimeEditTarget[];
  readonly verificationIntent: VerificationCommandPlan | {
    readonly state: "memory-reused" | "context-not-ready";
    readonly commands: readonly string[];
    readonly evidence: readonly string[];
  };
  readonly mutationHandoff: PlanningMutationHandoffProjection;
  readonly continuationMemory: ContextWorkingMemory;
  readonly evidence: readonly string[];
}

export async function runPlanningRuntime(input: {
  readonly workspaceRoot: string;
  readonly userTask: string;
  readonly previousMemory?: ContextWorkingMemory;
  readonly maxRepoFiles?: number;
  readonly maxCandidates?: number;
  readonly taskKindHint?: PlanningRuntimeTaskKindHint;
}): Promise<PlanningRuntimeResult> {
  const context = await runContextEngine({
    workspaceRoot: input.workspaceRoot,
    userTask: input.userTask,
    previousMemory: input.previousMemory,
    maxRepoFiles: input.maxRepoFiles,
    maxCandidates: input.maxCandidates,
    taskKindHint: input.taskKindHint,
  });
  const memoryMissingFacts = context.bundle ? [] : context.memory.missingFacts;
  const verificationIntent = context.bundle
    ? buildVerificationCommandPlan({
        agentPlan: context.bundle.agentPlan,
        testImpactPlan: context.bundle.testImpact,
        codeGraphImpact: context.bundle.codeGraphImpact,
        planQuality: context.bundle.planQuality,
        taskContextSufficiency: context.bundle.taskContextSufficiency,
        analysisQualityGate: context.bundle.analysisQualityGate,
        taskLifecycle: context.bundle.taskLifecycle,
        taskExecutionPlan: context.bundle.taskExecutionPlan,
        cwdLabel: "workspace-root",
        requireContext: true,
      })
    : {
        state: memoryMissingFacts.length > 0 ? "context-not-ready" as const : "memory-reused" as const,
        commands: context.memory.verificationIntent,
        evidence: [
          `planning-runtime:verification-intent:memory:${context.memory.memoryId}`,
          `planning-runtime:verification-intent:memory-missing-facts:${memoryMissingFacts.length}`,
          "planning-runtime:verification-intent:not-executed",
        ],
      };
  const missingFacts = buildBlockingFacts({ context, memoryMissingFacts });
  const planningWarnings = buildPlanningWarnings({ context, verificationIntent, blockingFacts: missingFacts });
  const editTargets = selectEditTargets(context, missingFacts);
  const groundedPlanning = buildGroundedPlanningProjection(context);
  const reviewReadyMutationTarget =
    editTargets.some((target) => target.readiness === "ready-for-review");
  const readOnlyPlanningReady =
    isReadOnlyPlanningTask(context.workflowPlan.taskKind) &&
    context.status !== "insufficient-context" &&
    missingFacts.length === 0;
  const status =
    (reviewReadyMutationTarget || readOnlyPlanningReady) && missingFacts.length === 0
      ? "ready-for-handoff"
      : editTargets.length === 0 || editTargets.every((target) => target.readiness === "unsupported")
        ? "unsupported"
        : "needs-more-context";
  const runtimeId = `planning_runtime_${hash({
    engineId: context.engineId,
    status,
    editTargets: editTargets.map((target) => target.path),
    memoryId: context.memory.memoryId,
  })}`;
  const mutationHandoff = buildPlanningMutationHandoffProjection({
    editTargets,
    missingFacts,
    taskKind: context.workflowPlan.taskKind,
    verificationIntentAvailable: hasVerificationIntent(verificationIntent),
    contextReceipts: buildHandoffContextReceipts(context),
    readEvidence: buildHandoffReadEvidence(context),
    expectedChangeSummary: groundedPlanning.planSummary,
    verificationIntentSummary: summarizeVerificationIntent(verificationIntent),
    verificationEvidenceIds: collectVerificationEvidenceIds(verificationIntent),
  });

  return {
    runtimeId,
    status,
    context,
    groundedAnalysis: {
      summary: groundedPlanning.analysisSummary,
      confidence: context.bundle?.analysisCalibration.confidence ?? (context.status === "reused-memory" ? "medium" : "low"),
      missingFacts,
      planningWarnings,
      evidenceIds: [
        ...(context.bundle ? [
          context.bundle.analysisBrief.briefId,
          context.bundle.analysisCalibration.calibrationId,
          context.bundle.taskContextSufficiency.sufficiencyId,
        ] : []),
        context.memory.memoryId,
      ],
    },
    executablePlan: {
      summary: groundedPlanning.planSummary,
      steps: groundedPlanning.steps,
      ...(context.bundle ? { planQuality: context.bundle.planQuality.level } : {}),
      ...(context.bundle ? { executionPlanId: context.bundle.taskExecutionPlan.executionPlanId } : {}),
    },
    editTargets,
    verificationIntent,
    mutationHandoff,
    continuationMemory: context.memory,
    evidence: [
      ...context.evidence,
      ...(context.bundle?.agentPlan.safeEvidenceMarkers ?? []),
      ...(context.bundle?.planQuality.evidence ?? []),
      ...(Array.isArray(verificationIntent.evidence) ? verificationIntent.evidence : []),
      ...groundedPlanning.evidence,
      ...mutationHandoff.evidence,
      `planning-runtime:id:${runtimeId}`,
      `planning-runtime:status:${status}`,
      `planning-runtime:edit-targets:${editTargets.length}`,
      "planning-runtime:mutation-authority:not-granted",
      "planning-runtime:provider-call:not-run",
      "planning-runtime:command-dispatch:not-run",
    ],
  };
}

function buildHandoffContextReceipts(
  context: ContextEngineResult,
): readonly PlanningMutationHandoffContextReceiptInput[] {
  return context.memory.fileReceipts.map((receipt, index) => ({
    id: `context-receipt:${context.memory.memoryId}:${index + 1}`,
    path: receipt.path,
    summary: receipt.summary,
    relevance: receipt.relevance,
  }));
}

function buildHandoffReadEvidence(
  context: ContextEngineResult,
): readonly PlanningMutationHandoffReadEvidenceInput[] {
  return context.filesRead.map((file, index) => ({
    id: `read-evidence:${context.engineId}:${index + 1}`,
    path: file.path,
    reason: file.reason,
    source: file.source,
  }));
}

function hasVerificationIntent(
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

function summarizeVerificationIntent(
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

function collectVerificationEvidenceIds(
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

function isReadOnlyPlanningTask(taskKind: ContextEngineResult["workflowPlan"]["taskKind"]): boolean {
  return taskKind === "read-file" ||
    taskKind === "inspect-files" ||
    taskKind === "repo-explain";
}

function selectEditTargets(
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

function buildBlockingFacts(input: {
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
  const sufficiencyBlocks = sufficiency.state === "needs-required-context" ||
    sufficiency.state === "stale-context" ||
    sufficiency.state === "budget-limited" ||
    sufficiency.state === "unsupported";
  const calibrationBlocks = calibration.readiness === "missing-facts" ||
    calibration.readiness === "stale-context" ||
    calibration.readiness === "unsupported";
  return unique([
    ...input.context.repo.missingFacts,
    ...sufficiency.missingRequiredFacts,
    ...(sufficiencyBlocks ? [sufficiency.readinessDowngrade] : []),
    ...(calibrationBlocks ? calibration.missingFacts : []),
  ]);
}

function buildPlanningWarnings(input: {
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

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function hash(input: object): string {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 12);
}
