import type { ContextEngineResult } from "../../context/acquisition/engine.js";
import type {
  PlanningMutationHandoffContextReceiptInput,
  PlanningMutationHandoffReadEvidenceInput,
} from "../handoff/mutation.js";
import type {
  EvidenceBoundPlanStep,
  PlanningRuntimeEditTarget,
} from "./types.js";

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

export function buildEvidenceBoundPlanSteps(input: {
  readonly context: ContextEngineResult;
  readonly editTargets: readonly PlanningRuntimeEditTarget[];
}): readonly EvidenceBoundPlanStep[] {
  const steps: EvidenceBoundPlanStep[] = [];

  steps.push({
    stepId: "step-1:understand-task",
    stepKind: "understand-task",
    safeTargetLabel: input.context.selectedCandidate?.safeLabel ?? "workspace",
    evidenceSourceIds: input.context.filesRead.map((f) => f.path),
    contextPacketIds: input.context.bundle ? [input.context.bundle.packet.packetId] : [],
    candidateIds: input.context.selectedCandidate ? [input.context.selectedCandidate.candidateId] : [],
    missingFactsReferenced: input.context.missingFacts,
    expectedResult: "Understand task context and constraints.",
    riskLevel: "low",
    executionStatus: "review-only",
    notProvenClaims: ["task-understanding-unverified"],
  });

  if (input.editTargets.length > 0) {
    steps.push({
      stepId: "step-2:prepare-edit-handoff",
      stepKind: "prepare-edit-handoff",
      targetFile: input.editTargets[0]?.path,
      safeTargetLabel: input.editTargets[0]?.path ?? "target",
      evidenceSourceIds: [],
      contextPacketIds: [],
      candidateIds: [],
      missingFactsReferenced: [],
      expectedResult: "Prepare bounded edit intent for downstream mutation runtime.",
      riskLevel: "medium",
      executionStatus: "review-only",
      notProvenClaims: ["edit-intent-unverified"],
    });
  }

  return steps;
}
