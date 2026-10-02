import {
  deriveActionableBlockerContract,
  projectActionableBlockerTerminalDetail,
  type ActionableBlockerKind,
} from "../core/query/actionableBlockerModule.js";
import type {
  CodingResultSummary,
  TerminalClassification,
} from "../result/types.js";
import { deriveActionableFailureContinuity } from "./actionableFailureContinuity.js";

export interface SessionResultParityProjection {
  readonly terminalClassification: TerminalClassification;
  readonly blockerKind?: ActionableBlockerKind | string;
  readonly reason?: string;
  readonly doNext?: string;
}

export function projectSessionResultParity(input: {
  readonly terminalClassification: TerminalClassification;
  readonly stopReason?: string;
  readonly codingResult?: CodingResultSummary;
}): SessionResultParityProjection {
  const contract = deriveActionableBlockerContract({
    stopReason: input.stopReason,
    codingResult: input.codingResult,
  });
  const terminalDetail = contract
    ? projectActionableBlockerTerminalDetail(contract)
    : undefined;
  const continuity = deriveActionableFailureContinuity(input.codingResult);
  const reason = selectSafeReason(input.stopReason, input.codingResult);
  const doNext =
    normalizeText(input.codingResult?.verification.nextAction) ??
    terminalDetail?.doNext ??
    continuity?.nextAction;

  return {
    terminalClassification: input.terminalClassification,
    ...(terminalDetail?.kind ?? continuity?.blockerKind
      ? { blockerKind: terminalDetail?.kind ?? continuity?.blockerKind }
      : {}),
    ...(reason ? { reason } : {}),
    ...(doNext ? { doNext } : {}),
  };
}

function selectSafeReason(
  stopReason: string | undefined,
  codingResult: CodingResultSummary | undefined,
): string | undefined {
  return (
    normalizeText(codingResult?.verification.reason) ??
    normalizeText(codingResult?.failedFiles.find((entry) => entry.reason.trim())?.reason) ??
    normalizeText(codingResult?.taskSatisfaction.reasons.find((entry) => entry.trim())) ??
    normalizeText(codingResult?.failureBoundary) ??
    normalizeText(stopReason)
  );
}

function normalizeText(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  return normalized ? normalized : undefined;
}
