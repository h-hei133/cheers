import { freezeDeep } from "../../core/values/freeze.js";
import type {
  MultiTargetAuthorityObservation,
  MultiTargetClassification,
  MultiTargetConflict,
  MultiTargetExecutionGroup,
  MultiTargetMutationInput,
  MultiTargetMutationTargetInput,
  MultiTargetParallelEligibilityStatus,
  MultiTargetQueueObservation,
  MultiTargetQueueState,
  MultiTargetRepairEligibility,
  MultiTargetRepairEligibilityStatus,
  MultiTargetSettlementObservation,
  MultiTargetSettlementStatus,
  MultiTargetSnapshotObservation,
  MultiTargetStaleReadObservation,
} from "./types.js";

import type { VerificationResultObservation } from "../../verification/result/boundary.js";
import { redactReportText } from "../../core/security/redaction.js";
import { sanitizeId, unique } from "../sanitize.js";


/**
 * Multi-target lane settlement.
 *
 * Summarises a lane once its groups have run: settlement observations, parallel
 * and repair eligibility, target-reached and applied counts.
 */

export function settlementObservation(input: {
  readonly laneId: string;
  readonly groupId: string;
  readonly target: MultiTargetMutationTargetInput;
  readonly status: MultiTargetSettlementStatus;
  readonly order: number;
  readonly targetSummary: string;
  readonly originalFailure?: string;
  readonly contentFingerprint?: string;
  readonly notProvenClaims: readonly string[];
}): MultiTargetSettlementObservation {
  return freezeDeep({
    settlementId: `${input.laneId}:settlement:${sanitizeId(input.target.targetId)}:${input.order}`,
    groupId: input.groupId,
    targetId: sanitizeId(input.target.targetId),
    status: input.status,
    order: input.order,
    targetSummary: input.targetSummary,
    ...(input.originalFailure ? { originalFailure: redactReportText(input.originalFailure, 120) } : {}),
    ...(input.contentFingerprint ? { contentFingerprint: input.contentFingerprint } : {}),
    terminalSuccessClaim: false,
    notProvenClaims: unique([`settlement-${input.status}-is-not-success`, ...input.notProvenClaims]),
  });
}
export function boundedGroupSize(value: number | undefined): number {
  if (!Number.isFinite(value)) return 2;
  return Math.max(1, Math.min(8, Math.floor(value ?? 2)));
}
export function observeRepairEligibility(input: {
  readonly laneId: string;
  readonly verificationResults: readonly VerificationResultObservation[];
  readonly wholeTaskVerificationResult: VerificationResultObservation;
  readonly repairTargetIds: readonly string[];
  readonly notProvenClaims: readonly string[];
}): MultiTargetRepairEligibility {
  const originalFailureIds = [
    ...input.verificationResults.filter((item) => item.status === "failed").map((item) => item.verificationId),
    ...(input.wholeTaskVerificationResult.status === "failed"
      ? [input.wholeTaskVerificationResult.verificationId]
      : []),
  ];
  const status: MultiTargetRepairEligibilityStatus = originalFailureIds.length === 0
    ? "not_needed"
    : input.repairTargetIds.length > 0
      ? "eligible"
      : "not_eligible";
  return freezeDeep({
    eligibilityId: `${input.laneId}:repair-eligibility`,
    status,
    targetIds: input.repairTargetIds.map(sanitizeId),
    originalFailureIds,
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "repair-eligibility-is-not-success",
      "original-failures-preserved",
      ...input.notProvenClaims,
    ]),
  });
}
export function targetReachedState(
  queue: readonly MultiTargetQueueObservation[],
  targetId: string,
  state: MultiTargetQueueState,
): boolean {
  return queue.some((item) => item.targetId === sanitizeId(targetId) && item.state === state);
}
export function allReadyTargetsApplied(
  queue: readonly MultiTargetQueueObservation[],
  targets: readonly MultiTargetMutationTargetInput[],
): boolean {
  const readyTargetIds = new Set(
    queue.filter((item) => item.state === "ready").map((item) => item.targetId),
  );
  if (readyTargetIds.size === 0) {
    return false;
  }
  return targets.every((target) => {
    const targetId = sanitizeId(target.targetId);
    return !readyTargetIds.has(targetId) || targetReachedState(queue, targetId, "applied");
  });
}
export function groupTargetsApplied(
  queue: readonly MultiTargetQueueObservation[],
  group: MultiTargetExecutionGroup,
): boolean {
  return group.targetIds.length > 0 &&
    group.targetIds.every((targetId) => targetReachedState(queue, targetId, "applied"));
}
export function deterministicSettlementOrder(input: {
  readonly input: MultiTargetMutationInput;
  readonly settlements: readonly MultiTargetSettlementObservation[];
}): boolean {
  const finalTargetOrder = input.settlements
    .filter((item) => item.status === "applied" || item.status === "failed" || item.status === "skipped")
    .map((item) => item.targetId);
  const expectedOrder = input.input.targets
    .map((target) => sanitizeId(target.targetId))
    .filter((targetId) => finalTargetOrder.includes(targetId));
  return finalTargetOrder.every((targetId, index) => targetId === expectedOrder[index]);
}
export function countState(
  queue: readonly MultiTargetQueueObservation[],
  state: MultiTargetQueueState,
): number {
  return queue.filter((item) => item.state === state).length;
}
