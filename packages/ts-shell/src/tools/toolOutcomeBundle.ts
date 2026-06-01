import type { RuntimeExecutionReceiptProjection } from "../runtime/execution/receipt.js";
import type { ToolResultMessageBatch } from "../turn/toolResultMessage.js";
import type {
  ToolBatchDispatchPlan,
  ToolBatchDispatchResult,
  ToolResultDetail,
} from "./toolBatchDispatch.js";

export type ToolOutcomeMixedStatus =
  | "all_success"
  | "single_success"
  | "single_non_success"
  | "mixed_success_and_non_success"
  | "all_non_success"
  | "empty";

export type ToolOutcomeNextAction =
  | "prepare_next_turn"
  | "await_authority"
  | "surface_blocked_result"
  | "review_failed_result"
  | "no_tool_result";

export interface ToolOutcomeBundleProjection {
  readonly bundleId: string;
  readonly sourceBatchId: string;
  readonly sourceModelBoundaryId?: string;
  readonly resultMessageIds: readonly string[];
  readonly receiptIds: readonly string[];
  readonly executedCount: number;
  readonly failedCount: number;
  readonly blockedCount: number;
  readonly authorityRequiredCount: number;
  readonly unsupportedCount: number;
  readonly malformedCount: number;
  readonly unknownCount: number;
  readonly notDispatchedCount: number;
  readonly mixedOutcomeStatus: ToolOutcomeMixedStatus;
  readonly nextAction: ToolOutcomeNextAction;
  readonly nextActionReason: string;
  readonly redactionStatus: "report-safe" | "redacted";
  readonly detailStatuses: readonly {
    readonly toolCallId: string;
    readonly toolName: string;
    readonly resultStatus: ToolResultDetail["resultStatus"];
    readonly terminalSuccessClaim: false;
  }[];
  readonly carryForwardFacts: {
    readonly status: ToolOutcomeMixedStatus;
    readonly nextAction: ToolOutcomeNextAction;
    readonly resultMessageIds: readonly string[];
    readonly blockedReasons: readonly string[];
    readonly terminalSuccessClaim: false;
  };
  readonly blockingFacts: readonly string[];
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export function createToolOutcomeBundle(input: {
  readonly dispatchResult: ToolBatchDispatchResult;
  readonly resultMessages?: ToolResultMessageBatch;
  readonly sourceModelBoundaryId?: string;
}): ToolOutcomeBundleProjection {
  const plan = input.dispatchResult.dispatchPlan;
  const details = input.dispatchResult.resultDetails;
  const resultMessages = input.resultMessages?.messages ?? [];
  const executedCount = details.filter((detail) =>
    detail.resultStatus === "executed_success" ||
    detail.resultStatus === "executed_failed"
  ).length;
  const executedSuccessCount = details.filter((detail) =>
    detail.resultStatus === "executed_success"
  ).length;
  const failedCount = details.filter((detail) => detail.resultStatus === "executed_failed").length;
  const blockedCount = details.filter((detail) =>
    detail.resultStatus === "blocked_by_policy" ||
    detail.resultStatus === "authority_denied"
  ).length;
  const authorityRequiredCount = details.filter((detail) =>
    detail.resultStatus === "authority_required"
  ).length;
  const unsupportedCount = details.filter((detail) =>
    detail.resultStatus === "unsupported_tool"
  ).length;
  const malformedCount = details.filter((detail) =>
    detail.resultStatus === "malformed_arguments"
  ).length;
  const unknownCount = details.filter((detail) =>
    detail.resultStatus === "unknown_tool"
  ).length;
  const notDispatchedCount = details.filter((detail) =>
    detail.resultStatus === "not_dispatched" ||
    detail.resultStatus === "execution_unavailable"
  ).length;
  const nonSuccessCount =
    failedCount +
    blockedCount +
    authorityRequiredCount +
    unsupportedCount +
    malformedCount +
    unknownCount +
    notDispatchedCount;
  const nextAction = nextActionFor({
    executedCount,
    failedCount,
    blockedCount,
    authorityRequiredCount,
    unsupportedCount,
    malformedCount,
    unknownCount,
    notDispatchedCount,
    resultMessageCount: resultMessages.length,
  });

  const resultMessageIds = freeze(unique(resultMessages.map((message) => message.messageId)));
  const blockedReasons = freeze(blockingFacts(details));
  const outcomeStatus = mixedStatus({
    callCount: plan.calls.length,
    executedSuccessCount,
    nonSuccessCount,
  });

  return freeze({
    bundleId: sanitizeId(`tool-outcome-bundle:${input.dispatchResult.resultBatchId}`),
    sourceBatchId: sanitizeId(input.dispatchResult.resultBatchId),
    ...(input.sourceModelBoundaryId ?? plan.responseId
      ? { sourceModelBoundaryId: sanitizeText(input.sourceModelBoundaryId ?? plan.responseId, 160) }
      : {}),
    resultMessageIds,
    receiptIds: freeze(unique(input.dispatchResult.executionReceipts.map(receiptId))),
    executedCount,
    failedCount,
    blockedCount,
    authorityRequiredCount,
    unsupportedCount,
    malformedCount,
    unknownCount,
    notDispatchedCount,
    mixedOutcomeStatus: outcomeStatus,
    nextAction: nextAction.action,
    nextActionReason: nextAction.reason,
    redactionStatus: redactionStatus(plan, details, input.dispatchResult.executionReceipts),
    detailStatuses: freeze(details.map((detail) =>
      freeze({
        toolCallId: sanitizeText(detail.toolCallId, 160),
        toolName: sanitizeText(detail.toolName, 120),
        resultStatus: detail.resultStatus,
        terminalSuccessClaim: false as const,
      })
    )),
    carryForwardFacts: freeze({
      status: outcomeStatus,
      nextAction: nextAction.action,
      resultMessageIds,
      blockedReasons,
      terminalSuccessClaim: false,
    }),
    blockingFacts: blockedReasons,
    notProvenClaims: unique([
      "terminal-success",
      "task-success",
      "verification-success",
      "provider-success",
      "save-point-success",
      "next-turn-success",
      "tool-outcome-bundle-is-not-task-success",
      "tool-outcome-next-action-is-not-task-success",
      ...plan.notProvenClaims,
      ...input.dispatchResult.notProvenClaims,
      ...(input.resultMessages?.notProvenClaims ?? []),
    ]),
    terminalSuccessClaim: false,
  });
}

function nextActionFor(input: {
  readonly executedCount: number;
  readonly failedCount: number;
  readonly blockedCount: number;
  readonly authorityRequiredCount: number;
  readonly unsupportedCount: number;
  readonly malformedCount: number;
  readonly unknownCount: number;
  readonly notDispatchedCount: number;
  readonly resultMessageCount: number;
}): {
  readonly action: ToolOutcomeNextAction;
  readonly reason: string;
} {
  if (input.authorityRequiredCount > 0) {
    return {
      action: "await_authority",
      reason: "tool execution requires explicit authority before a future turn",
    };
  }
  if (input.blockedCount > 0 || input.unsupportedCount > 0 || input.malformedCount > 0 || input.unknownCount > 0) {
    return {
      action: "surface_blocked_result",
      reason: "blocked or unsupported tool results must stay visible before continuing",
    };
  }
  if (input.failedCount > 0 || input.notDispatchedCount > 0) {
    return {
      action: "review_failed_result",
      reason: "failed or unavailable tool execution needs review before continuing",
    };
  }
  if (input.executedCount > 0 && input.resultMessageCount > 0) {
    return {
      action: "prepare_next_turn",
      reason: "report-safe tool result messages are ready for a future turn",
    };
  }
  return {
    action: "no_tool_result",
    reason: "no tool result requires a next-turn action",
  };
}

function receiptId(receipt: RuntimeExecutionReceiptProjection): string {
  return receipt.receiptId;
}

function mixedStatus(input: {
  readonly callCount: number;
  readonly executedSuccessCount: number;
  readonly nonSuccessCount: number;
}): ToolOutcomeMixedStatus {
  if (input.callCount === 0) {
    return "empty";
  }
  if (input.executedSuccessCount > 0 && input.nonSuccessCount > 0) {
    return "mixed_success_and_non_success";
  }
  if (input.executedSuccessCount > 0) {
    return input.callCount === 1 ? "single_success" : "all_success";
  }
  return input.callCount === 1 ? "single_non_success" : "all_non_success";
}

function redactionStatus(
  plan: ToolBatchDispatchPlan,
  details: readonly ToolResultDetail[],
  receipts: readonly RuntimeExecutionReceiptProjection[],
): "report-safe" | "redacted" {
  return plan.redactionStatus === "redacted" ||
      details.some((detail) => detail.redactionStatus === "redacted") ||
      receipts.some((receipt) => receipt.redaction.status === "redacted")
    ? "redacted"
    : "report-safe";
}

function blockingFacts(details: readonly ToolResultDetail[]): readonly string[] {
  return unique(details
    .filter((detail) => detail.resultStatus !== "executed_success")
    .map((detail) => `${detail.toolCallId}:${detail.resultStatus}`));
}

function unique(values: readonly string[]): readonly string[] {
  return freeze(Array.from(new Set(values.map((value) => sanitizeText(value, 160)))).sort());
}

function sanitizeId(value: string): string {
  return sanitizeText(value, 180)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeText(value: string, maxLength: number): string {
  return value
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[redacted-real-provider-home]")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(/\b(api[_-]?key|token|secret|cookie|authorization|password)\b\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[secret-redacted]")
    .replace(/\bprovider\.env\b[^\n\r]*/gi, "provider.env=[redacted]")
    .replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]")
    .replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]")
    .replace(/\braw provider output[:=][^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]")
    .replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]")
    .replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freeze(child);
    }
  }
  return value;
}
