import { freezeDeep } from "../core/values/freeze.js";
import type { ToolBatchDispatchPlan, ToolResultDetail } from "../tools/toolBatchDispatch.js";

export type ToolResultMessageDeliveryStatus =
  | "prepared"
  | "blocked"
  | "not_prepared"
  | "unsupported"
  | "redacted";

export type ToolResultMessageCategory =
  | "executed_tool_fact"
  | "not_dispatched"
  | "blocked_by_policy"
  | "authority_required"
  | "unsupported_tool"
  | "unknown_tool"
  | "malformed_arguments"
  | "execution_unavailable"
  | "execution_failed"
  | "execution_receipt_observed";

export interface ToolResultMessageProjection {
  readonly messageId: string;
  readonly role: "tool";
  readonly toolCallId: string;
  readonly toolName: string;
  readonly safeContentSummary: string;
  readonly category: ToolResultMessageCategory;
  readonly deliveryStatus: ToolResultMessageDeliveryStatus;
  readonly redactionStatus: "report-safe" | "redacted";
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface ToolResultMessageBatch {
  readonly batchId: string;
  readonly dispatchPlanId: string;
  readonly messages: readonly ToolResultMessageProjection[];
  readonly preparedCount: number;
  readonly blockedCount: number;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export function prepareToolResultMessages(input: {
  readonly dispatchPlan: ToolBatchDispatchPlan;
  readonly resultDetails: readonly ToolResultDetail[];
}): ToolResultMessageBatch {
  const messages = input.dispatchPlan.calls.map((call, index): ToolResultMessageProjection => {
    const detail = input.resultDetails[index] ??
      input.resultDetails.find((candidate) => candidate.toolCallId === call.toolCallId);
    const deliveryStatus = messageDeliveryStatus(call.dispatchStatus, detail?.resultStatus);
    const category = messageCategory(call, detail);
    const notProvenClaims = unique([
      "terminal-success",
      "task-success",
      "verification-success",
      "next-turn-success",
      "tool-result-message-is-not-delivery",
      ...call.notProvenClaims,
      ...(detail?.notProvenClaims ?? []),
    ]);
    return freezeDeep({
      messageId: sanitizeId(`tool-result-message:${call.toolCallId}`),
      role: "tool",
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      safeContentSummary: detail?.reportSafe.summary ??
        call.beforePolicyDecision.reportSafeSummary,
      category,
      deliveryStatus,
      redactionStatus:
        call.redactionStatus === "redacted" ||
        detail?.redactionStatus === "redacted"
          ? "redacted"
          : "report-safe",
      notProvenClaims,
      terminalSuccessClaim: false,
    });
  });

  return freezeDeep({
    batchId: sanitizeId(`tool-result-message-batch:${input.dispatchPlan.batchId}`),
    dispatchPlanId: input.dispatchPlan.planId,
    messages: freezeDeep(messages),
    preparedCount: messages.filter((message) => message.deliveryStatus === "prepared").length,
    blockedCount: messages.filter((message) =>
      message.deliveryStatus === "blocked" ||
      message.deliveryStatus === "unsupported"
    ).length,
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "terminal-success",
      "task-success",
      "verification-success",
      "next-turn-success",
      ...input.dispatchPlan.notProvenClaims,
      ...messages.flatMap((message) => message.notProvenClaims),
    ]),
  });
}

function messageDeliveryStatus(
  dispatchStatus: ToolBatchDispatchPlan["calls"][number]["dispatchStatus"],
  resultStatus?: ToolResultDetail["resultStatus"],
): ToolResultMessageDeliveryStatus {
  if (!resultStatus) {
    return "not_prepared";
  }
  if (resultStatus === "redacted") {
    return "redacted";
  }
  if (
    resultStatus === "blocked_by_policy" ||
    resultStatus === "authority_required" ||
    resultStatus === "authority_denied" ||
    resultStatus === "malformed_arguments"
  ) {
    return "blocked";
  }
  if (
    resultStatus === "unsupported_tool" ||
    resultStatus === "unknown_tool" ||
    dispatchStatus === "unsupported"
  ) {
    return "unsupported";
  }
  if (resultStatus === "not_dispatched" || resultStatus === "execution_unavailable") {
    return "not_prepared";
  }
  return "prepared";
}

function messageCategory(
  call: ToolBatchDispatchPlan["calls"][number],
  detail?: ToolResultDetail,
): ToolResultMessageCategory {
  if (detail?.systemDetails.executionReceiptId) {
    return detail.resultStatus === "executed_success"
      ? "execution_receipt_observed"
      : "execution_failed";
  }
  if (call.malformed || detail?.resultStatus === "malformed_arguments") {
    return "malformed_arguments";
  }
  if (call.unknownTool) {
    return "unknown_tool";
  }
  if (
    call.dispatchStatus === "blocked" ||
    detail?.resultStatus === "blocked_by_policy" ||
    detail?.resultStatus === "authority_denied"
  ) {
    return "blocked_by_policy";
  }
  if (
    call.dispatchStatus === "authority_required" ||
    detail?.resultStatus === "authority_required"
  ) {
    return "authority_required";
  }
  if (call.dispatchStatus === "unsupported" || detail?.resultStatus === "unsupported_tool") {
    return "unsupported_tool";
  }
  if (call.executionState === "execution_unavailable") {
    return "execution_unavailable";
  }
  if (detail?.resultStatus === "executed_failed") {
    return "execution_failed";
  }
  if (detail?.resultStatus === "executed_success") {
    return "executed_tool_fact";
  }
  return "not_dispatched";
}

function unique(values: readonly string[]): readonly string[] {
  return freezeDeep(Array.from(new Set(values.map((value) => sanitizeText(value, 120)))).sort());
}

function sanitizeId(value: string): string {
  return sanitizeText(value, 160)
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeText(value: string, maxLength: number): string {
  return value
    .replace(/\/home\/wang\/\.private-agents-real[^\s"']*/g, "[redacted-real-provider-home]")
    .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[secret-redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "Bearer [secret-redacted]")
    .replace(/\btoken=[^\s;,)]+/gi, "token=[secret-redacted]")
    .replace(/\bauthorization[:=][^\s;,)]+/gi, "authorization=[secret-redacted]")
    .replace(/\bapi[_-]?key[:=][^\s;,)]+/gi, "apiKey=[secret-redacted]")
    .replace(/\bauth(?:orization)?[_-]?header[:=][^\n\r]*/gi, "authHeader=[secret-redacted]")
    .replace(/\bprovider\.env\b[^\n\r]*/gi, "provider-config=[redacted]")
    .replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]")
    .replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]")
    .replace(/\braw provider output[:=][^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]")
    .replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]")
    .replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}
