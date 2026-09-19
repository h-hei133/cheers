import {
  buildPlanningMutationHandoffProjection,
  type PlanningMutationHandoffContextReceiptInput,
  type PlanningMutationHandoffReadEvidenceInput,
  type PlanningMutationHandoffProjection,
} from "../handoff/mutation.js";
import {
  runContextEngine,
  type ContextEngineResult,
  type ContextEngineTaskKindHint,
} from "../../context/acquisition/engine.js";
import type { ContextWorkingMemory } from "../../context/memory/model.js";

import { buildGroundedPlanningProjection } from "../grounded/projection.js";
import { buildVerificationCommandPlan } from "../../verification/command/plan.js";
import {
  buildEvidenceBoundPlanSteps,
  buildPlanningAssumptions,
  buildPlanningConstraints,
  buildPlanningEditHandoffFacts,
  buildPlanningOwnerBoundaryFacts,
  buildPlanningRuntimePlanQualityFacts,
  buildPlanningVerificationHandoffFacts,
} from "./facts.js";
import {
  buildBlockingFacts,
  buildHandoffContextReceipts,
  buildHandoffReadEvidence,
  buildPlanningWarnings,
  buildUnsupportedClassification,
  collectVerificationEvidenceIds,
  hasVerificationIntent,
  hash,
  isReadOnlyPlanningTask,
  selectEditTargets,
  summarizeVerificationIntent,
} from "./support.js";
import type {
  EvidenceBoundPlanStep,
  PlanningEditHandoffFacts,
  PlanningOwnerBoundaryFacts,
  PlanningRuntimePlanQualityFacts,
  PlanningRuntimeResult,
  PlanningUnsupportedClassification,
  PlanningVerificationHandoffFacts,
} from "./types.js";

export type {
  EvidenceBoundPlanStep,
  PlanningEditHandoffFacts,
  PlanningOwnerBoundaryFacts,
  PlanningRuntimeEditTarget,
  PlanningRuntimePlanQualityFacts,
  PlanningRuntimeResult,
  PlanningUnsupportedClassification,
  PlanningVerificationHandoffFacts,
} from "./types.js";

export type PlanningRuntimeTaskKindHint = ContextEngineTaskKindHint;


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
  const ownerBoundary = buildPlanningOwnerBoundaryFacts();
  const unsupportedClassification = buildUnsupportedClassification({
    runtimeId,
    context,
    status,
    missingFacts,
    editTargets,
  });
  const assumptions = buildPlanningAssumptions({ context, editTargets });
  const constraints = buildPlanningConstraints({
    context,
    missingFacts,
    mutationHandoff,
    unsupportedClassification,
  });
  const planQualityFacts = buildPlanningRuntimePlanQualityFacts({
    runtimeId,
    context,
    missingFacts,
    planningWarnings,
    assumptions,
    constraints,
    mutationHandoff,
    unsupportedClassification,
  });
  const planSteps = buildEvidenceBoundPlanSteps({
    runtimeId,
    context,
    editTargets,
    missingFacts,
    mutationHandoff,
    verificationIntent,
    unsupportedClassification,
  });
  const editHandoff = buildPlanningEditHandoffFacts({
    mutationHandoff,
    context,
    planSteps,
  });
  const verificationHandoff = buildPlanningVerificationHandoffFacts({
    runtimeId,
    context,
    verificationIntent,
    planQualityFacts,
    editTargets,
  });

  return {
    runtimeId,
    status,
    context,
    ownerBoundary,
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
    planQualityFacts,
    planSteps,
    assumptions,
    constraints,
    editTargets,
    verificationIntent,
    mutationHandoff,
    editHandoff,
    verificationHandoff,
    unsupportedClassification,
    continuationMemory: context.memory,
    evidence: [
      ...context.evidence,
      ...(context.bundle?.agentPlan.safeEvidenceMarkers ?? []),
      ...(context.bundle?.planQuality.evidence ?? []),
      ...(Array.isArray(verificationIntent.evidence) ? verificationIntent.evidence : []),
      ...groundedPlanning.evidence,
      ...mutationHandoff.evidence,
      ...ownerBoundary.evidence,
      ...planQualityFacts.evidence,
      ...planSteps.flatMap((step) => step.evidenceSourceIds),
      ...editHandoff.evidence,
      ...verificationHandoff.evidence,
      ...unsupportedClassification.evidence,
      `planning-runtime:id:${runtimeId}`,
      `planning-runtime:status:${status}`,
      `planning-runtime:edit-targets:${editTargets.length}`,
      "planning-runtime:terminal-success-claim:false",
      "planning-runtime:mutation-authority:not-granted",
      "planning-runtime:provider-call:not-run",
      "planning-runtime:command-dispatch:not-run",
    ],
  };
}

