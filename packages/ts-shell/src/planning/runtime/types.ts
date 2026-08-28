import type {
  ContextEngineTaskKindHint,
} from "../../context/acquisition/engine.js";
import type { PlanningMutationHandoffProjection } from "../handoff/mutation.js";

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
