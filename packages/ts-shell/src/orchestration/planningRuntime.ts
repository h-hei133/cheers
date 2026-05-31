import crypto from "node:crypto";

import { buildVerificationCommandPlan, type VerificationCommandPlan } from "../verification/verificationCommandPlan.js";
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

export interface PlanningOwnerBoundaryFacts {
  readonly ownerDomain: "orchestration/planning-runtime";
  readonly owns: readonly string[];
  readonly doesNotOwn: readonly string[];
  readonly terminalSuccessClaim: false;
  readonly mutationAuthority: "not-granted";
  readonly applyAuthority: "not-granted";
  readonly verificationExecutionTruth: "not-owned";
  readonly repairExecutionTruth: "not-owned";
  readonly providerTruth: "not-owned";
  readonly evidence: readonly string[];
}

export interface PlanningRuntimePlanQualityFacts {
  readonly qualityFactsId: string;
  readonly planId: string;
  readonly taskKind: string;
  readonly planningMode: "context-built" | "memory-reuse" | "insufficient-context";
  readonly contextSufficiencyInput: string;
  readonly contextSourceIds: readonly string[];
  readonly discoveryHandoffIds: readonly string[];
  readonly stagedContextIds: readonly string[];
  readonly assumptions: readonly string[];
  readonly constraints: readonly string[];
  readonly uncertaintyNotes: readonly string[];
  readonly planConfidence: "high" | "medium" | "low";
  readonly planRiskLevel: "low" | "medium" | "high";
  readonly unsupportedReasons: readonly string[];
  readonly requiredMissingFacts: readonly string[];
  readonly optionalMissingFacts: readonly string[];
  readonly nextAction: string;
  readonly notProvenClaims: readonly string[];
  readonly evidence: readonly string[];
}

export interface EvidenceBoundPlanStep {
  readonly stepId: string;
  readonly stepKind:
    | "understand-task"
    | "consume-context"
    | "prepare-edit-handoff"
    | "prepare-verification-handoff"
    | "classify-unsupported";
  readonly targetFile?: string;
  readonly safeTargetLabel: string;
  readonly evidenceSourceIds: readonly string[];
  readonly contextPacketIds: readonly string[];
  readonly candidateIds: readonly string[];
  readonly missingFactsReferenced: readonly string[];
  readonly expectedResult: string;
  readonly riskLevel: "low" | "medium" | "high";
  readonly executionStatus: "review-only" | "unsupported";
  readonly notProvenClaims: readonly string[];
}

export interface PlanningEditHandoffFacts {
  readonly editIntentId: string;
  readonly candidateTargetIds: readonly string[];
  readonly selectedTargetIds: readonly string[];
  readonly targetConfidence: PlanningMutationHandoffProjection["targetConfidence"];
  readonly targetAmbiguity: PlanningMutationHandoffProjection["targetAmbiguity"];
  readonly contextPacketIds: readonly string[];
  readonly planStepIds: readonly string[];
  readonly proposedEditScope: PlanningMutationHandoffProjection["proposedEditScope"];
  readonly exactProposalReadiness: PlanningMutationHandoffProjection["exactProposalReadiness"];
  readonly unsupportedEditReasons: readonly string[];
  readonly authorityRequirement: PlanningMutationHandoffProjection["authorityRequirement"];
  readonly noWriteStatus: PlanningMutationHandoffProjection["noWriteStatus"];
  readonly notProvenClaims: readonly string[];
  readonly evidence: readonly string[];
}

export interface PlanningVerificationHandoffFacts {
  readonly verificationIntentId: string;
  readonly verificationPurpose: string;
  readonly targetedFiles: readonly string[];
  readonly commandCandidates: readonly string[];
  readonly confidence: "high" | "medium" | "low";
  readonly missingVerificationFacts: readonly string[];
  readonly selectedNotRunStatus: "selected-not-run" | "not-selected";
  readonly taskRelevanceStatus: "candidate-relevant" | "missing-evidence" | "unsupported";
  readonly expectedVerificationEvidence: readonly string[];
  readonly notProvenClaims: readonly string[];
  readonly evidence: readonly string[];
}

export interface PlanningUnsupportedClassification {
  readonly classificationId: string;
  readonly reasons: readonly string[];
  readonly unsafeReasons: readonly string[];
  readonly unsupportedReasons: readonly string[];
  readonly commandOnlyBypassesMutationHandoff: boolean;
  readonly terminalSuccessClaim: false;
  readonly evidence: readonly string[];
}

export interface PlanningRuntimeResult {
  readonly runtimeId: string;
  readonly status: "ready-for-handoff" | "needs-more-context" | "unsupported";
  readonly context: ContextEngineResult;
  readonly ownerBoundary: PlanningOwnerBoundaryFacts;
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
  readonly planQualityFacts: PlanningRuntimePlanQualityFacts;
  readonly planSteps: readonly EvidenceBoundPlanStep[];
  readonly assumptions: readonly string[];
  readonly constraints: readonly string[];
  readonly editTargets: readonly PlanningRuntimeEditTarget[];
  readonly verificationIntent: VerificationCommandPlan | {
    readonly state: "memory-reused" | "context-not-ready";
    readonly commands: readonly string[];
    readonly evidence: readonly string[];
  };
  readonly mutationHandoff: PlanningMutationHandoffProjection;
  readonly editHandoff: PlanningEditHandoffFacts;
  readonly verificationHandoff: PlanningVerificationHandoffFacts;
  readonly unsupportedClassification: PlanningUnsupportedClassification;
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

function buildPlanningOwnerBoundaryFacts(): PlanningOwnerBoundaryFacts {
  return {
    ownerDomain: "orchestration/planning-runtime",
    owns: [
      "task-understanding",
      "context-sufficiency-consumption",
      "plan-step-construction",
      "assumptions",
      "constraints",
      "uncertainty",
      "edit-target-intent",
      "verification-intent",
      "unsupported-classification",
      "next-action-suggestion",
    ],
    doesNotOwn: [
      "mutation-authority",
      "apply-authority",
      "exact-anchor-truth",
      "verification-execution-truth",
      "repair-execution-truth",
      "terminal-success",
      "provider-truth",
      "file-write-behavior",
    ],
    terminalSuccessClaim: false,
    mutationAuthority: "not-granted",
    applyAuthority: "not-granted",
    verificationExecutionTruth: "not-owned",
    repairExecutionTruth: "not-owned",
    providerTruth: "not-owned",
    evidence: [
      "planning-owner-boundary:owner-domain:orchestration-planning-runtime",
      "planning-owner-boundary:mutation-authority:not-granted",
      "planning-owner-boundary:apply-authority:not-granted",
      "planning-owner-boundary:verification-execution:not-owned",
      "planning-owner-boundary:repair-execution:not-owned",
      "planning-owner-boundary:terminal-success-claim:false",
    ],
  };
}

function buildPlanningRuntimePlanQualityFacts(input: {
  readonly runtimeId: string;
  readonly context: ContextEngineResult;
  readonly missingFacts: readonly string[];
  readonly planningWarnings: readonly string[];
  readonly assumptions: readonly string[];
  readonly constraints: readonly string[];
  readonly mutationHandoff: PlanningMutationHandoffProjection;
  readonly unsupportedClassification: PlanningUnsupportedClassification;
}): PlanningRuntimePlanQualityFacts {
  const bundle = input.context.bundle;
  const planId = bundle?.agentPlan.planId ?? input.runtimeId;
  const requiredMissingFacts = bundle?.stagedContextAcquisition.requiredMissingFacts ?? input.missingFacts;
  const optionalMissingFacts = bundle?.stagedContextAcquisition.optionalMissingFacts ?? [];
  const qualityFactsId = `planning_quality_facts_${hash({
    planId,
    runtimeId: input.runtimeId,
    status: input.context.status,
    missingFacts: input.missingFacts,
  })}`;
  const planningMode =
    input.context.status === "context-built"
      ? "context-built"
      : input.context.status === "reused-memory"
        ? "memory-reuse"
        : "insufficient-context";

  return {
    qualityFactsId,
    planId,
    taskKind: input.context.workflowPlan.taskKind,
    planningMode,
    contextSufficiencyInput: bundle?.taskContextSufficiency.state ?? input.context.memory.contextSufficiencyState,
    contextSourceIds: unique([
      input.context.engineId,
      input.context.repo.snapshot.snapshotId,
      input.context.memory.memoryId,
      ...(bundle ? [
        bundle.packet.packetId,
        bundle.graph.graphId,
        bundle.taskContextSufficiency.sufficiencyId,
        bundle.planQuality.qualityId,
      ] : []),
    ]),
    discoveryHandoffIds: input.context.discoveryHandoff ? [input.context.discoveryHandoff.handoffId] : [],
    stagedContextIds: bundle ? [
      bundle.stagedContextAcquisition.acquisitionFactsId,
      bundle.taskContextSufficiency.sufficiencyId,
    ] : [],
    assumptions: input.assumptions,
    constraints: input.constraints,
    uncertaintyNotes: unique([
      ...input.planningWarnings,
      ...input.context.repo.targetRanking.missingDiscoveryFacts,
      ...(bundle?.planQuality.missingFacts ?? []),
    ]),
    planConfidence: bundle?.analysisCalibration.confidence ?? (input.context.status === "reused-memory" ? "medium" : "low"),
    planRiskLevel: bundle?.analysisCalibration.riskLevel ?? (input.missingFacts.length > 0 ? "high" : "medium"),
    unsupportedReasons: input.unsupportedClassification.reasons,
    requiredMissingFacts,
    optionalMissingFacts,
    nextAction: input.mutationHandoff.nextAction,
    notProvenClaims: [
      "plan-generated-is-not-executable-work",
      "target-selected-is-not-correct-target-proof",
      "edit-handoff-ready-is-not-mutation-authority",
      "verification-intent-is-not-verification-run-or-pass",
      "unsupported-classification-is-not-success",
      "planning-quality-facts-are-not-terminal-success",
    ],
    evidence: [
      `planning-quality-facts:id:${qualityFactsId}`,
      `planning-quality-facts:plan:${planId}`,
      `planning-quality-facts:context-sufficiency:${bundle?.taskContextSufficiency.state ?? input.context.memory.contextSufficiencyState}`,
      `planning-quality-facts:confidence:${bundle?.analysisCalibration.confidence ?? "low"}`,
      `planning-quality-facts:risk:${bundle?.analysisCalibration.riskLevel ?? "medium"}`,
      `planning-quality-facts:required-missing:${requiredMissingFacts.length}`,
      `planning-quality-facts:optional-missing:${optionalMissingFacts.length}`,
      "planning-quality-facts:terminal-success-claim:false",
      "planning-quality-facts:raw-content-excluded",
    ],
  };
}

function buildEvidenceBoundPlanSteps(input: {
  readonly runtimeId: string;
  readonly context: ContextEngineResult;
  readonly editTargets: readonly PlanningRuntimeEditTarget[];
  readonly missingFacts: readonly string[];
  readonly mutationHandoff: PlanningMutationHandoffProjection;
  readonly verificationIntent: PlanningRuntimeResult["verificationIntent"];
  readonly unsupportedClassification: PlanningUnsupportedClassification;
}): readonly EvidenceBoundPlanStep[] {
  const bundle = input.context.bundle;
  const selectedTargetIds = input.editTargets.map((target) => target.path);
  const candidateIds = input.context.repo.candidates.map((candidate) => candidate.candidateId);
  const packetIds = bundle ? [bundle.packet.packetId] : [];
  const baseEvidence = unique([
    input.context.engineId,
    input.context.repo.snapshot.snapshotId,
    input.context.discoveryHandoff?.handoffId ?? "",
    bundle?.stagedContextAcquisition.acquisitionFactsId ?? "",
    bundle?.planQuality.qualityId ?? "",
  ]);
  const executionStatus: EvidenceBoundPlanStep["executionStatus"] =
    input.unsupportedClassification.reasons.length > 0 ? "unsupported" : "review-only";
  const riskLevel: EvidenceBoundPlanStep["riskLevel"] =
    input.missingFacts.length > 0 || input.unsupportedClassification.reasons.length > 0 ? "high" : "medium";
  const notProvenClaims = [
    "plan-step-exists-is-not-step-correctness-proof",
    "review-only-step-is-not-execution",
    "verification-step-is-not-verification-pass",
  ];

  return [
    {
      stepId: `planning_step_${hash({ runtimeId: input.runtimeId, step: "understand" })}`,
      stepKind: "understand-task",
      safeTargetLabel: input.context.selectedCandidate?.safeLabel ?? "(no-selected-target)",
      evidenceSourceIds: baseEvidence,
      contextPacketIds: packetIds,
      candidateIds,
      missingFactsReferenced: input.missingFacts,
      expectedResult: "Ground task understanding in discovery, context, and sufficiency facts.",
      riskLevel,
      executionStatus,
      notProvenClaims,
    },
    {
      stepId: `planning_step_${hash({ runtimeId: input.runtimeId, step: "context" })}`,
      stepKind: "consume-context",
      safeTargetLabel: input.context.selectedCandidate?.safeLabel ?? "(no-selected-target)",
      evidenceSourceIds: unique([...baseEvidence, ...(bundle?.stagedContextAcquisition.evidence ?? [])]),
      contextPacketIds: packetIds,
      candidateIds,
      missingFactsReferenced: [
        ...(bundle?.stagedContextAcquisition.requiredMissingFacts ?? input.missingFacts),
        ...(bundle?.stagedContextAcquisition.optionalMissingFacts ?? []),
      ],
      expectedResult: "Use context sufficiency facts without treating context as repository understanding or task success.",
      riskLevel,
      executionStatus,
      notProvenClaims,
    },
    {
      stepId: `planning_step_${hash({ runtimeId: input.runtimeId, step: "edit" })}`,
      stepKind: "prepare-edit-handoff",
      targetFile: selectedTargetIds[0],
      safeTargetLabel: selectedTargetIds.join(", ") || "(no-edit-target)",
      evidenceSourceIds: unique([...baseEvidence, input.mutationHandoff.handoffId]),
      contextPacketIds: packetIds,
      candidateIds,
      missingFactsReferenced: input.missingFacts,
      expectedResult: "Prepare review-only edit handoff facts for existing mutation owners.",
      riskLevel,
      executionStatus,
      notProvenClaims: [
        ...notProvenClaims,
        "edit-handoff-ready-is-not-mutation-authority",
      ],
    },
    {
      stepId: `planning_step_${hash({ runtimeId: input.runtimeId, step: "verification" })}`,
      stepKind: "prepare-verification-handoff",
      safeTargetLabel: selectedTargetIds.join(", ") || "(no-edit-target)",
      evidenceSourceIds: unique([
        ...baseEvidence,
        ...collectVerificationEvidenceIds(input.verificationIntent),
      ]),
      contextPacketIds: packetIds,
      candidateIds,
      missingFactsReferenced: input.missingFacts,
      expectedResult: "Prepare verification intent facts while command dispatch remains not-run.",
      riskLevel,
      executionStatus,
      notProvenClaims: [
        ...notProvenClaims,
        "verification-intent-is-not-verification-run-or-pass",
      ],
    },
  ];
}

function buildPlanningEditHandoffFacts(input: {
  readonly mutationHandoff: PlanningMutationHandoffProjection;
  readonly context: ContextEngineResult;
  readonly planSteps: readonly EvidenceBoundPlanStep[];
}): PlanningEditHandoffFacts {
  return {
    editIntentId: `planning_edit_intent_${hash({
      handoffId: input.mutationHandoff.handoffId,
      targets: input.mutationHandoff.targetPaths,
    })}`,
    candidateTargetIds: input.context.repo.candidates.map((candidate) => candidate.candidateId),
    selectedTargetIds: input.mutationHandoff.targetPaths,
    targetConfidence: input.mutationHandoff.targetConfidence,
    targetAmbiguity: input.mutationHandoff.targetAmbiguity,
    contextPacketIds: input.context.bundle ? [input.context.bundle.packet.packetId] : [],
    planStepIds: input.planSteps.map((step) => step.stepId),
    proposedEditScope: input.mutationHandoff.proposedEditScope,
    exactProposalReadiness: input.mutationHandoff.exactProposalReadiness,
    unsupportedEditReasons: input.mutationHandoff.unsupportedReasons,
    authorityRequirement: input.mutationHandoff.authorityRequirement,
    noWriteStatus: input.mutationHandoff.noWriteStatus,
    notProvenClaims: input.mutationHandoff.notProvenClaims,
    evidence: [
      `planning-edit-handoff:intent:${input.mutationHandoff.handoffId}`,
      `planning-edit-handoff:target-confidence:${input.mutationHandoff.targetConfidence}`,
      `planning-edit-handoff:target-ambiguity:${input.mutationHandoff.targetAmbiguity}`,
      `planning-edit-handoff:scope:${input.mutationHandoff.proposedEditScope}`,
      "planning-edit-handoff:mutation-authority:not-granted",
      "planning-edit-handoff:exact-proposal-readiness:delegated-to-existing-backend",
      "planning-edit-handoff:no-write-status:no-write-authority-granted",
    ],
  };
}

function buildPlanningVerificationHandoffFacts(input: {
  readonly runtimeId: string;
  readonly context: ContextEngineResult;
  readonly verificationIntent: PlanningRuntimeResult["verificationIntent"];
  readonly planQualityFacts: PlanningRuntimePlanQualityFacts;
  readonly editTargets: readonly PlanningRuntimeEditTarget[];
}): PlanningVerificationHandoffFacts {
  const commandCandidates = "verificationPlanId" in input.verificationIntent
    ? input.verificationIntent.command
      ? [input.verificationIntent.commandSafeLabel ?? input.verificationIntent.command]
      : []
    : input.verificationIntent.commands;
  const state = input.verificationIntent.state;
  const expectedEvidence = "expectedEvidence" in input.verificationIntent
    ? input.verificationIntent.expectedEvidence
    : ["verification command outcome", "runtime receipt marker"];
  const evidenceIds = collectVerificationEvidenceIds(input.verificationIntent);
  const missingVerificationFacts = state === "ready"
    ? []
    : [
      `verification intent state ${state}`,
      ...input.planQualityFacts.requiredMissingFacts,
    ];

  return {
    verificationIntentId: "verificationPlanId" in input.verificationIntent
      ? input.verificationIntent.verificationPlanId
      : `planning_verification_intent_${hash({ runtimeId: input.runtimeId, state })}`,
    verificationPurpose: "Select task-relevant verification evidence for the existing verification owner.",
    targetedFiles: input.editTargets.map((target) => target.path),
    commandCandidates,
    confidence: state === "ready" ? "medium" : "low",
    missingVerificationFacts,
    selectedNotRunStatus: commandCandidates.length > 0 ? "selected-not-run" : "not-selected",
    taskRelevanceStatus:
      state === "ready"
        ? "candidate-relevant"
        : state === "unsupported" || input.context.workflowPlan.taskKind === "run-command"
          ? "unsupported"
          : "missing-evidence",
    expectedVerificationEvidence: expectedEvidence,
    notProvenClaims: [
      "verification-intent-is-not-verification-run-or-pass",
      "selected-command-is-not-verification-passed",
      "selected-not-run-is-not-success",
    ],
    evidence: [
      ...evidenceIds,
      `planning-verification-handoff:state:${state}`,
      `planning-verification-handoff:selected-not-run:${commandCandidates.length > 0 ? "true" : "false"}`,
      "planning-verification-handoff:command-dispatch:not-run",
      "planning-verification-handoff:verification-success:not-claimed",
    ],
  };
}

function buildPlanningAssumptions(input: {
  readonly context: ContextEngineResult;
  readonly editTargets: readonly PlanningRuntimeEditTarget[];
}): readonly string[] {
  return unique([
    input.context.selectedCandidate
      ? `assumes selected candidate ${input.context.selectedCandidate.safeLabel} is relevant`
      : "assumes no selected candidate is available",
    input.context.bundle
      ? `assumes context packet ${input.context.bundle.packet.packetId} remains fresh until downstream owners re-check`
      : `assumes memory ${input.context.memory.memoryId} is acceptable only for review-only planning`,
    input.editTargets.length === 1
      ? "assumes single selected target is enough for a review-only handoff"
      : "assumes multiple or missing targets require downstream review before mutation",
    "assumes verification intent still needs execution evidence from verification owner",
  ]);
}

function buildPlanningConstraints(input: {
  readonly context: ContextEngineResult;
  readonly missingFacts: readonly string[];
  readonly mutationHandoff: PlanningMutationHandoffProjection;
  readonly unsupportedClassification: PlanningUnsupportedClassification;
}): readonly string[] {
  return unique([
    "constraint no mutation authority",
    "constraint no apply authority",
    "constraint verification command dispatch not run",
    "constraint provider call not run",
    "constraint exact proposal readiness delegated to existing proposal backend",
    ...(input.missingFacts.length > 0 ? ["constraint missing required planning facts"] : []),
    ...(input.context.bundle?.stagedContextAcquisition.staleContext.sufficiencyDowngrade ? ["constraint stale context downgrades sufficiency"] : []),
    ...(input.mutationHandoff.targetAmbiguity !== "single-selected-target" ? ["constraint target ambiguity remains visible"] : []),
    ...input.unsupportedClassification.reasons.map((reason) => `constraint ${reason}`),
  ]);
}

function buildUnsupportedClassification(input: {
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
