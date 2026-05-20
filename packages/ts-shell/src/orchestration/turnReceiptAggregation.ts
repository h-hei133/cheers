import type { RuntimeReceipt } from "../core/runtime/runtimeReceipt.js";
import { sanitizeRuntimeText } from "../core/runtime/runtimeReceiptProjection.js";
import type { ToolPolicyResultReceipt } from "../core/tools/toolPolicyResult.js";
import type { CodingVerificationSummary } from "./types.js";
import type { TurnCapabilityPlan } from "./turnCapabilityPlan.js";

export interface TurnReceiptAggregationInput {
  readonly plan: TurnCapabilityPlan;
  readonly toolReceipts?: readonly ToolPolicyResultReceipt[];
  readonly runtimeReceipts?: readonly RuntimeReceipt[];
  readonly evidence?: readonly string[];
  readonly continuationEvidence?: readonly string[];
  readonly verification?: CodingVerificationSummary;
  readonly observations?: readonly string[];
  readonly doNext?: string;
}

export interface TurnReceiptAggregation {
  readonly resultHandoffSummary: string;
  readonly transcriptSafeTurnSummary: string;
  readonly evidenceIds: readonly string[];
  readonly redaction: "clean" | "redacted";
  readonly doNextSummary?: string;
  readonly resultState: "completed" | "stopped" | "failed";
}

export function aggregateTurnReceipts(
  input: TurnReceiptAggregationInput,
): TurnReceiptAggregation {
  const rawEvidence = [
    ...(input.evidence ?? []),
    ...(input.continuationEvidence ?? []),
    ...(input.toolReceipts ?? []).flatMap((receipt) => receipt.evidence),
    ...(input.runtimeReceipts ?? []).flatMap((receipt) => receipt.evidence),
    ...(input.verification?.status
      ? [`turn-verification:${input.verification.status}`]
      : []),
  ];
  const sanitizedEvidence = uniqueStable(rawEvidence.map(sanitizeTurnText)).filter(
    (entry) => entry.length > 0,
  );
  const redaction =
    sanitizedEvidence.join("\n") === rawEvidence.join("\n") ? "clean" : "redacted";
  const resultState = deriveResultState(input);
  const doNextSummary = input.doNext
    ? sanitizeTurnText(input.doNext)
    : firstStoppedDoNext(input.toolReceipts) ??
      firstRuntimeDoNext(input.runtimeReceipts);
  const observationSummary = uniqueStable(
    (input.observations ?? []).map(sanitizeTurnText).filter(Boolean),
  );
  const target = input.plan.targetSummary
    ? ` target=${input.plan.targetSummary};`
    : "";

  return {
    resultHandoffSummary: `turn=${input.plan.turnKind}; area=${input.plan.capabilityArea}; result=${resultState}; owner=${input.plan.selectedModuleOwner}`,
    transcriptSafeTurnSummary: [
      `turn ${input.plan.turnKind}; area=${input.plan.capabilityArea};${target} mutation=${input.plan.mutationClassification}; result=${resultState}`,
      ...observationSummary,
    ].join(" | "),
    evidenceIds: sanitizedEvidence,
    redaction,
    ...(doNextSummary ? { doNextSummary } : {}),
    resultState,
  };
}

function deriveResultState(
  input: TurnReceiptAggregationInput,
): TurnReceiptAggregation["resultState"] {
  if (input.plan.stoppedBeforeExecutionReason) {
    return "stopped";
  }
  if (input.verification?.status === "failed") {
    return "failed";
  }
  if (input.verification?.status === "blocked") {
    return "stopped";
  }
  const receiptStates = [
    ...(input.toolReceipts ?? []).map((receipt) => receipt.result),
    ...(input.runtimeReceipts ?? []).map((receipt) => receipt.result),
  ];
  if (receiptStates.includes("failed")) {
    return "failed";
  }
  if (receiptStates.includes("stopped")) {
    return "stopped";
  }
  return "completed";
}

function firstStoppedDoNext(
  receipts: readonly ToolPolicyResultReceipt[] | undefined,
): string | undefined {
  return receipts?.find((receipt) => receipt.result !== "completed")?.doNext;
}

function firstRuntimeDoNext(
  receipts: readonly RuntimeReceipt[] | undefined,
): string | undefined {
  return receipts?.find((receipt) => receipt.result !== "completed")?.doNext;
}

function sanitizeTurnText(value: string): string {
  return sanitizeRuntimeText(value, 240);
}

function uniqueStable(values: readonly string[]): string[] {
  return Array.from(new Set(values));
}
