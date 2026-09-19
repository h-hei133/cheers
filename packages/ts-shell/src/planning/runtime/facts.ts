import crypto from "node:crypto";

import { buildVerificationCommandPlan } from "../../verification/command/plan.js";
import type { ContextWorkingMemory } from "../../context/memory/model.js";
import type { ContextEngineResult } from "../../context/acquisition/engine.js";
import type {
  PlanningMutationHandoffContextReceiptInput,
  PlanningMutationHandoffReadEvidenceInput,
  PlanningMutationHandoffProjection,
} from "../handoff/mutation.js";
import {
  collectVerificationEvidenceIds,
  hash,
  unique,
} from "./support.js";
import type {
  EvidenceBoundPlanStep,
  PlanningEditHandoffFacts,
  PlanningOwnerBoundaryFacts,
  PlanningRuntimeEditTarget,
  PlanningRuntimePlanQualityFacts,
  PlanningRuntimeResult,
  PlanningUnsupportedClassification,
  PlanningVerificationHandoffFacts,
} from "./types.js";

/**
 * Planning runtime fact construction.
 *
 * These functions derive the facts `runPlanningRuntime` assembles a plan from:
 * owner boundaries, plan quality, edit and verification handoffs, assumptions,
 * constraints, blocking facts, and warnings. They read context and build frozen
 * descriptions; `./engine.js` performs the assembly and dispatch.
 */

export function buildPlanningOwnerBoundaryFacts(): PlanningOwnerBoundaryFacts {
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

export function buildPlanningRuntimePlanQualityFacts(input: {
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
    contextSufficiencyInput:
      bundle?.taskContextSufficiency.state ??
      input.context.memory.contextSufficiencyState ??
      "unknown",
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

export function buildEvidenceBoundPlanSteps(input: {
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

export function buildPlanningEditHandoffFacts(input: {
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

export function buildPlanningVerificationHandoffFacts(input: {
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

export function buildPlanningAssumptions(input: {
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

export function buildPlanningConstraints(input: {
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

