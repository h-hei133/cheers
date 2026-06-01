import type { ModelResponseBoundary } from "../provider/response/boundary.js";
import type { AssistantResponseState } from "../turn/assistantResponse.js";
import type { ToolResultMessageBatch } from "../turn/toolResultMessage.js";
import type { NormalizedToolCallBatch } from "./toolCallBatch.js";
import {
  createNonExecutedToolResultDetails,
  planToolBatchDispatch,
  type ToolBatchDispatchPlan,
  type ToolBatchPolicy,
  type ToolResultDetail,
} from "./toolBatchDispatch.js";

export interface ToolBatchHandoffProjection {
  readonly handoffId: string;
  readonly sourceModelBoundaryId: string;
  readonly sourceAssistantResponseId: string;
  readonly turnId?: string;
  readonly extractionStatus: NormalizedToolCallBatch["extractionStatus"];
  readonly batchId: string;
  readonly dispatchPlanId: string;
  readonly normalizedToolCallIds: readonly string[];
  readonly malformedCallIds: readonly string[];
  readonly unsupportedCallIds: readonly string[];
  readonly unknownToolCallIds: readonly string[];
  readonly argumentRedactionStatus: "report-safe" | "redacted";
  readonly dispatchEligibility: ToolBatchDispatchPlan["dispatchStatus"];
  readonly policyRequirement:
    | "allowed"
    | "blocked"
    | "authority_required"
    | "redaction_required"
    | "unsupported"
    | "rejected"
    | "not_evaluated";
  readonly authorityRequirement: "none" | "required";
  readonly executionStatus: "not_dispatched";
  readonly nonExecutedResultDetailIds: readonly string[];
  readonly nonExecutedMessageIds: readonly string[];
  readonly savePointInputId?: string;
  readonly savePointInputAbsentReason?: string;
  readonly nextTurnInputId?: string;
  readonly nextTurnInputAbsentReason?: string;
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export function createToolBatchHandoff(input: {
  readonly responseBoundary: ModelResponseBoundary;
  readonly assistantResponse: AssistantResponseState;
  readonly toolCallBatch: NormalizedToolCallBatch;
  readonly dispatchPlan?: ToolBatchDispatchPlan;
  readonly resultDetails?: readonly ToolResultDetail[];
  readonly resultMessages?: ToolResultMessageBatch;
  readonly savePointInputId?: string;
  readonly savePointInputAbsentReason?: string;
  readonly nextTurnInputId?: string;
  readonly nextTurnInputAbsentReason?: string;
  readonly notProvenClaims?: readonly string[];
}): ToolBatchHandoffProjection {
  const dispatchPlan = input.dispatchPlan ??
    planToolBatchDispatch({ batch: input.toolCallBatch });
  const resultDetails = input.resultDetails ??
    createNonExecutedToolResultDetails({ dispatchPlan });

  return freeze({
    handoffId: sanitizeId(`tool-handoff:${input.toolCallBatch.batchId}`),
    sourceModelBoundaryId: sanitizeId(input.responseBoundary.responseId),
    sourceAssistantResponseId: sanitizeId(input.assistantResponse.responseId),
    ...(input.toolCallBatch.turnId ||
        input.responseBoundary.turnId ||
        input.assistantResponse.turnId
      ? {
          turnId: sanitizeText(
            input.toolCallBatch.turnId ??
              input.responseBoundary.turnId ??
              input.assistantResponse.turnId ??
              "",
            160,
          ),
        }
      : {}),
    extractionStatus: input.toolCallBatch.extractionStatus,
    batchId: sanitizeId(input.toolCallBatch.batchId),
    dispatchPlanId: sanitizeId(dispatchPlan.planId),
    normalizedToolCallIds: freeze(input.toolCallBatch.calls.map((call) => sanitizeId(call.id))),
    malformedCallIds: freeze(dispatchPlan.malformedCallIds.map(sanitizeId)),
    unsupportedCallIds: freeze(dispatchPlan.unsupportedCallIds.map(sanitizeId)),
    unknownToolCallIds: freeze(dispatchPlan.unknownCallIds.map(sanitizeId)),
    argumentRedactionStatus:
      input.toolCallBatch.redaction.status === "redacted" ||
        dispatchPlan.redactionStatus === "redacted" ||
        resultDetails.some((detail) => detail.redactionStatus === "redacted") ||
        input.resultMessages?.messages.some((message) => message.redactionStatus === "redacted")
        ? "redacted"
        : "report-safe",
    dispatchEligibility: dispatchPlan.dispatchStatus,
    policyRequirement: policyRequirement(dispatchPlan),
    authorityRequirement: dispatchPlan.authorityRequiredCallIds.length > 0 ? "required" : "none",
    executionStatus: "not_dispatched",
    nonExecutedResultDetailIds: freeze(resultDetails.map((detail) =>
      sanitizeId(detail.resultDetailsId)
    )),
    nonExecutedMessageIds: freeze(
      input.resultMessages?.messages.map((message) => sanitizeId(message.messageId)) ?? [],
    ),
    ...(input.savePointInputId
      ? { savePointInputId: sanitizeId(input.savePointInputId) }
      : { savePointInputAbsentReason: input.savePointInputAbsentReason ?? "not-prepared" }),
    ...(input.nextTurnInputId
      ? { nextTurnInputId: sanitizeId(input.nextTurnInputId) }
      : { nextTurnInputAbsentReason: input.nextTurnInputAbsentReason ?? "not-prepared" }),
    notProvenClaims: unique([
      "tool-call-extracted-is-not-tool-executed",
      "tool-batch-planned-is-not-tool-result",
      "policy-allowed-is-not-authority-granted",
      "authority-requested-is-not-authority-granted",
      "non-executed-message-is-not-tool-success",
      "save-point-is-not-success",
      "product-surface-is-not-success",
      "terminal-success",
      "task-success",
      "verification-success",
      ...input.responseBoundary.notProvenClaims,
      ...input.assistantResponse.notProvenClaims,
      ...input.toolCallBatch.notProvenClaims,
      ...dispatchPlan.notProvenClaims,
      ...resultDetails.flatMap((detail) => detail.notProvenClaims),
      ...(input.resultMessages?.notProvenClaims ?? []),
      ...(input.notProvenClaims ?? []),
    ]),
    terminalSuccessClaim: false,
  });
}

export function prepareSafeToolBatchHandoff(input: {
  readonly responseBoundary: ModelResponseBoundary;
  readonly assistantResponse: AssistantResponseState;
  readonly toolCallBatch: NormalizedToolCallBatch;
  readonly policy?: ToolBatchPolicy;
  readonly caller?: string;
}): {
  readonly dispatchPlan: ToolBatchDispatchPlan;
  readonly resultDetails: readonly ToolResultDetail[];
  readonly handoff: ToolBatchHandoffProjection;
} {
  const dispatchPlan = planToolBatchDispatch({
    batch: input.toolCallBatch,
    dispatchPolicy: "metadata-only",
    policy: input.policy,
    caller: input.caller,
  });
  const resultDetails = createNonExecutedToolResultDetails({ dispatchPlan });
  const handoff = createToolBatchHandoff({
    responseBoundary: input.responseBoundary,
    assistantResponse: input.assistantResponse,
    toolCallBatch: input.toolCallBatch,
    dispatchPlan,
    resultDetails,
  });

  return freeze({ dispatchPlan, resultDetails, handoff });
}

function policyRequirement(
  dispatchPlan: ToolBatchDispatchPlan,
): ToolBatchHandoffProjection["policyRequirement"] {
  if (dispatchPlan.calls.length === 0) {
    return "not_evaluated";
  }
  if (dispatchPlan.calls.some((call) => call.redactionStatus === "redacted")) {
    return "redaction_required";
  }
  if (dispatchPlan.calls.some((call) => call.beforePolicyDecision.status === "request_authority")) {
    return "authority_required";
  }
  if (dispatchPlan.calls.some((call) => call.beforePolicyDecision.status === "rejected")) {
    return "rejected";
  }
  if (dispatchPlan.calls.some((call) => call.beforePolicyDecision.status === "block")) {
    return "blocked";
  }
  if (dispatchPlan.calls.some((call) => call.beforePolicyDecision.status === "unsupported")) {
    return "unsupported";
  }
  if (dispatchPlan.calls.every((call) => call.beforePolicyDecision.status === "allow")) {
    return "allowed";
  }
  return "not_evaluated";
}

function unique(values: readonly string[]): readonly string[] {
  return freeze(Array.from(new Set(values.map((value) => sanitizeText(value, 120)))).sort());
}

function sanitizeId(value: string): string {
  return sanitizeText(value, 180)
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
    .replace(/\bprovider\.env\b[^\n\r]*/gi, "provider-config=[redacted]")
    .replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]")
    .replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]")
    .replace(/\braw provider output[:=][^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]")
    .replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]")
    .trim()
    .slice(0, maxLength);
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
  }
  return value;
}
