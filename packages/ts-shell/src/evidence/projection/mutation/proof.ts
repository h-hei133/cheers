import { freezeDeep } from "../../../core/values/freeze.js";

export type MultiTargetMutationProofStatus =
  | "complete"
  | "blocked"
  | "failed"
  | "partial"
  | "not_proven";

export interface MultiTargetMutationProofInput {
  readonly proofInputId: string;
  readonly laneId: string;
  readonly proofStatus: MultiTargetMutationProofStatus;
  readonly targetCount: number;
  readonly appliedCount: number;
  readonly failedCount: number;
  readonly revertedCount: number;
  readonly perTargetVerificationPassed: boolean;
  readonly perGroupVerificationPassed: boolean;
  readonly wholeTaskVerificationPassed: boolean;
  readonly boundedGroupProof: boolean;
  readonly deterministicSettlementProof: boolean;
  readonly missingProofItems: readonly string[];
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export function buildMultiTargetMutationProofInput(input: {
  readonly laneId: string;
  readonly targetCount: number;
  readonly appliedCount: number;
  readonly failedCount: number;
  readonly revertedCount: number;
  readonly blockedCount: number;
  readonly perTargetVerificationPassed: boolean;
  readonly perGroupVerificationPassed?: boolean;
  readonly wholeTaskVerificationPassed: boolean;
  readonly boundedGroupProof?: boolean;
  readonly deterministicSettlementProof?: boolean;
  readonly repairSatisfied: boolean;
  readonly notProvenClaims?: readonly string[];
}): MultiTargetMutationProofInput {
  const missingProofItems = [
    input.targetCount === 0 ? "mutation-targets" : undefined,
    input.blockedCount > 0 ? "unblocked-targets" : undefined,
    input.failedCount > 0 ? "successful-apply-for-every-ready-target" : undefined,
    input.appliedCount < input.targetCount ? "applied-target-count" : undefined,
    !input.perTargetVerificationPassed ? "per-target-verification" : undefined,
    input.perGroupVerificationPassed === false ? "per-group-verification" : undefined,
    !input.wholeTaskVerificationPassed ? "whole-task-verification" : undefined,
    input.boundedGroupProof === false ? "bounded-group-proof" : undefined,
    input.deterministicSettlementProof === false ? "deterministic-settlement-proof" : undefined,
    !input.repairSatisfied ? "repair-facts" : undefined,
  ].filter((item): item is string => Boolean(item));
  const proofStatus: MultiTargetMutationProofStatus = missingProofItems.length === 0
    ? "complete"
    : input.blockedCount > 0
      ? "blocked"
      : input.failedCount > 0
        ? "failed"
        : input.appliedCount > 0 || input.revertedCount > 0
          ? "partial"
          : "not_proven";
  return freezeDeep({
    proofInputId: `${sanitizeId(input.laneId)}:proof-input`,
    laneId: sanitizeId(input.laneId),
    proofStatus,
    targetCount: input.targetCount,
    appliedCount: input.appliedCount,
    failedCount: input.failedCount,
    revertedCount: input.revertedCount,
    perTargetVerificationPassed: input.perTargetVerificationPassed,
    perGroupVerificationPassed: input.perGroupVerificationPassed ?? true,
    wholeTaskVerificationPassed: input.wholeTaskVerificationPassed,
    boundedGroupProof: input.boundedGroupProof ?? true,
    deterministicSettlementProof: input.deterministicSettlementProof ?? true,
    missingProofItems,
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "mutation-proof-input-is-not-success",
      "evidence-input-is-not-terminal-verdict",
      ...missingProofItems.map((item) => `missing-proof:${item}`),
      ...(input.notProvenClaims ?? []),
    ]),
  });
}

function sanitizeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 160);
}

function unique(values: readonly string[]): readonly string[] {
  return Object.freeze(Array.from(new Set(values)).sort());
}
