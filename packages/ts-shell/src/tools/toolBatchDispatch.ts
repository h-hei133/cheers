import type { RuntimeExecutionReceiptProjection } from "../runtime/execution/executionReceipt.js";
import type { ToolExecutionContext, ToolExecutionResult } from "./types.js";
import type { NormalizedToolCall, NormalizedToolCallBatch } from "./toolCallBatch.js";
import {
  createBlockedToolInterceptionResult,
  createToolAfterObservationAnnotation,
  createToolBeforePolicyDecision,
  createToolInterceptionIntent,
  shouldPreventToolExecution,
  type ToolAfterObservationAnnotation,
  type ToolBeforePolicyDecision,
} from "./interception.js";

export type ToolBatchDispatchStatus =
  | "planned"
  | "blocked"
  | "authority_required"
  | "partially_dispatchable"
  | "dispatched"
  | "dispatch_failed"
  | "unsupported"
  | "not_dispatched";

export type ToolCallDispatchStatus =
  | "planned"
  | "blocked"
  | "authority_required"
  | "dispatched"
  | "dispatch_failed"
  | "unsupported"
  | "not_dispatched";

export type ToolResultDetailStatus =
  | "not_executed"
  | "blocked"
  | "authority_required"
  | "succeeded"
  | "failed"
  | "unsupported"
  | "rejected"
  | "redacted";

export interface ToolDispatchPlanCall {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly callStatus: NormalizedToolCall["status"];
  readonly dispatchStatus: ToolCallDispatchStatus;
  readonly beforePolicyDecision: ToolBeforePolicyDecision;
  readonly authorityRequirement: ToolBeforePolicyDecision["authorityRequirement"];
  readonly redactionStatus: "report-safe" | "redacted";
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface ToolBatchDispatchPlan {
  readonly planId: string;
  readonly batchId: string;
  readonly responseId: string;
  readonly turnId?: string;
  readonly dispatchPolicy: "sequential" | "parallel-unsupported" | "metadata-only";
  readonly dispatchStatus: ToolBatchDispatchStatus;
  readonly calls: readonly ToolDispatchPlanCall[];
  readonly authorityRequiredCallIds: readonly string[];
  readonly blockedCallIds: readonly string[];
  readonly unsupportedCallIds: readonly string[];
  readonly dispatchedCallIds: readonly string[];
  readonly redactionStatus: "report-safe" | "redacted";
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface ToolResultDetail {
  readonly resultDetailsId: string;
  readonly toolCallId: string;
  readonly toolName: string;
  readonly resultStatus: ToolResultDetailStatus;
  readonly contentSummary: string;
  readonly systemDetails: {
    readonly dispatchStatus: ToolCallDispatchStatus;
    readonly executionReceiptId?: string;
    readonly policyDecisionId: string;
    readonly terminalSuccessClaim: false;
  };
  readonly reportSafe: {
    readonly summary: string;
    readonly redactionStatus: "report-safe" | "redacted";
    readonly notProvenClaims: readonly string[];
    readonly terminalSuccessClaim: false;
  };
  readonly redactionStatus: "report-safe" | "redacted";
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface ToolBatchDispatchResult {
  readonly resultBatchId: string;
  readonly dispatchPlan: ToolBatchDispatchPlan;
  readonly results: readonly ToolExecutionResult[];
  readonly resultDetails: readonly ToolResultDetail[];
  readonly executionReceipts: readonly RuntimeExecutionReceiptProjection[];
  readonly afterAnnotations: readonly ToolAfterObservationAnnotation[];
  readonly failedToolCallIds: readonly string[];
  readonly notDispatchedToolCallIds: readonly string[];
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export type ToolBatchPolicy = (
  call: NormalizedToolCall,
  intent: ReturnType<typeof createToolInterceptionIntent>,
) => ToolBeforePolicyDecision | undefined;

export type ToolBatchDispatchSeam = (
  call: NormalizedToolCall,
  decision: ToolBeforePolicyDecision,
  context: ToolExecutionContext,
) => Promise<ToolExecutionResult>;

export function planToolBatchDispatch(input: {
  readonly batch: NormalizedToolCallBatch;
  readonly dispatchPolicy?: "sequential" | "parallel" | "metadata-only";
  readonly policy?: ToolBatchPolicy;
  readonly caller?: string;
}): ToolBatchDispatchPlan {
  const dispatchPolicy = input.dispatchPolicy === "parallel"
    ? "parallel-unsupported"
    : input.dispatchPolicy ?? "metadata-only";
  const calls = input.batch.calls.map((call) => {
    const intent = createToolInterceptionIntent({
      toolId: call.id,
      toolKind: call.name,
      caller: input.caller ?? "tool-batch-dispatch",
      operationKind: `tool.${call.name}`,
      requestedActionSummary: `${call.name}: ${call.argumentSummary}`,
      authorityMode: call.name === "bash" ? "command-allowlisted" : "unknown-transitional",
      riskLevel: call.riskLevel,
      notProvenClaims: call.notProvenClaims,
    });
    const beforePolicyDecision = input.policy?.(call, intent) ??
      defaultPolicyDecision(call, intent, dispatchPolicy);
    const redactionStatus: "report-safe" | "redacted" =
      call.redaction.status === "redacted" ||
      beforePolicyDecision.redactionStatus === "redacted"
        ? "redacted"
        : "report-safe";
    return freeze({
      toolCallId: call.id,
      toolName: call.name,
      callStatus: call.status,
      dispatchStatus: statusFromPolicy(call, beforePolicyDecision, dispatchPolicy),
      beforePolicyDecision,
      authorityRequirement: beforePolicyDecision.authorityRequirement,
      redactionStatus,
      notProvenClaims: unique([
        ...call.notProvenClaims,
        ...beforePolicyDecision.notProvenClaims,
      ]),
      terminalSuccessClaim: false as const,
    });
  });
  const dispatchStatus = summarizePlanStatus(calls);

  return freeze({
    planId: sanitizeId(`tool-dispatch-plan:${input.batch.batchId}`),
    batchId: input.batch.batchId,
    responseId: input.batch.responseId,
    ...(input.batch.turnId ? { turnId: input.batch.turnId } : {}),
    dispatchPolicy,
    dispatchStatus,
    calls: freeze(calls),
    authorityRequiredCallIds: freeze(calls.filter((call) =>
      call.dispatchStatus === "authority_required"
    ).map((call) => call.toolCallId)),
    blockedCallIds: freeze(calls.filter((call) =>
      call.dispatchStatus === "blocked"
    ).map((call) => call.toolCallId)),
    unsupportedCallIds: freeze(calls.filter((call) =>
      call.dispatchStatus === "unsupported"
    ).map((call) => call.toolCallId)),
    dispatchedCallIds: freeze(calls.filter((call) =>
      call.dispatchStatus === "dispatched"
    ).map((call) => call.toolCallId)),
    redactionStatus:
      input.batch.redaction.status === "redacted" ||
      calls.some((call) => call.redactionStatus === "redacted")
        ? "redacted"
        : "report-safe",
    notProvenClaims: unique([
      "terminal-success",
      "task-success",
      "verification-success",
      "tool-success",
      ...(dispatchStatus === "not_dispatched" ? ["tool-dispatch-not-run"] : []),
      ...input.batch.notProvenClaims,
      ...calls.flatMap((call) => call.notProvenClaims),
    ]),
    terminalSuccessClaim: false,
  });
}

export async function dispatchToolBatch(input: {
  readonly batch: NormalizedToolCallBatch;
  readonly context: ToolExecutionContext;
  readonly dispatchPolicy?: "sequential" | "parallel" | "metadata-only";
  readonly policy?: ToolBatchPolicy;
  readonly dispatch?: ToolBatchDispatchSeam;
  readonly caller?: string;
}): Promise<ToolBatchDispatchResult> {
  const dispatchPlan = planToolBatchDispatch(input);
  const results: ToolExecutionResult[] = [];
  const resultDetails: ToolResultDetail[] = [];
  const executionReceipts: RuntimeExecutionReceiptProjection[] = [];
  const afterAnnotations: ToolAfterObservationAnnotation[] = [];
  const failedToolCallIds: string[] = [];
  const notDispatchedToolCallIds: string[] = [];

  for (const planned of dispatchPlan.calls) {
    const call = input.batch.calls.find((candidate) => candidate.id === planned.toolCallId);
    if (!call) {
      continue;
    }
    let result: ToolExecutionResult;
    if (shouldPreventToolExecution(planned.beforePolicyDecision)) {
      result = createBlockedToolInterceptionResult(planned.beforePolicyDecision);
      notDispatchedToolCallIds.push(call.id);
    } else if (!input.dispatch || planned.dispatchStatus !== "dispatched") {
      result = createNotDispatchedResult(planned);
      notDispatchedToolCallIds.push(call.id);
    } else {
      try {
        result = await input.dispatch(call, planned.beforePolicyDecision, input.context);
      } catch (error) {
        result = createDispatchFailedResult(planned, error);
      }
    }
    result = projectToolExecutionResult(result);

    const receipt = result.details?.executionReceipt ??
      result.reportSafe?.executionReceipt ??
      runtimeReceiptFromMetadata(result.metadata);
    if (receipt) {
      executionReceipts.push(receipt);
    }
    const resultStatus = detailStatusFromResult(planned, result);
    if (!result.success) {
      failedToolCallIds.push(call.id);
    }
    const detail = createToolResultDetail({
      planned,
      result,
      resultStatus,
      executionReceipt: receipt,
    });
    const annotation = result.details?.toolInterception?.afterAnnotation ??
      result.reportSafe?.toolInterception?.afterAnnotation ??
      createToolAfterObservationAnnotation({
        decision: planned.beforePolicyDecision,
        toolId: call.id,
        resultStatus: result.success
          ? "tool-success-observed"
          : resultStatus === "not_executed" ||
              resultStatus === "blocked" ||
              resultStatus === "authority_required" ||
              resultStatus === "unsupported" ||
              resultStatus === "rejected"
            ? "not-executed"
            : "tool-failure-observed",
        executionReceipt: receipt,
        resultDetailsId: detail.resultDetailsId,
        annotations: [`tool-dispatch:${planned.dispatchStatus}`],
        nextActionSuggestions: [
          result.success
            ? "Prepare report-safe tool result message for a future turn."
            : "Keep the failure visible without claiming task success.",
        ],
        blockedFollowUp:
          resultStatus === "blocked" || resultStatus === "authority_required"
            ? planned.beforePolicyDecision.reason
            : undefined,
        reportSafeSummary: detail.reportSafe.summary,
      });

    results.push(result);
    resultDetails.push(detail);
    afterAnnotations.push(annotation);
  }

  return freeze({
    resultBatchId: sanitizeId(`tool-result-batch:${dispatchPlan.batchId}`),
    dispatchPlan,
    results: freeze(results),
    resultDetails: freeze(resultDetails),
    executionReceipts: freeze(uniqueReceipts(executionReceipts)),
    afterAnnotations: freeze(afterAnnotations),
    failedToolCallIds: freeze(Array.from(new Set(failedToolCallIds))),
    notDispatchedToolCallIds: freeze(Array.from(new Set(notDispatchedToolCallIds))),
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      ...dispatchPlan.notProvenClaims,
      ...resultDetails.flatMap((detail) => detail.notProvenClaims),
      ...afterAnnotations.flatMap((annotation) => annotation.notProvenClaims),
    ]),
  });
}

function projectToolExecutionResult(result: ToolExecutionResult): ToolExecutionResult {
  return freeze({
    success: result.success,
    ...(result.output ? { output: sanitizeText(result.output, 240) } : {}),
    ...(result.error ? { error: sanitizeText(result.error, 240) } : {}),
    ...(result.content ? { content: sanitizeText(result.content, 240) } : {}),
    ...(result.details ? { details: {
      ...(result.details.executionReceipt
        ? { executionReceipt: result.details.executionReceipt }
        : {}),
      ...(result.details.runtimeFacts
        ? { runtimeFacts: sanitizeMetadata(result.details.runtimeFacts) }
        : {}),
      ...(result.details.toolInterception
        ? { toolInterception: result.details.toolInterception }
        : {}),
    } } : {}),
    ...(result.reportSafe ? { reportSafe: {
      ...(result.reportSafe.executionReceipt
        ? { executionReceipt: result.reportSafe.executionReceipt }
        : {}),
      redactionStatus: result.reportSafe.redactionStatus,
      notProvenClaims: result.reportSafe.notProvenClaims,
      ...(result.reportSafe.toolInterception
        ? { toolInterception: result.reportSafe.toolInterception }
        : {}),
    } } : {}),
    ...(result.metadata ? { metadata: sanitizeMetadata(result.metadata) } : {}),
  });
}

function sanitizeMetadata(metadata: Record<string, unknown>): Record<string, unknown> {
  const projected: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    projected[sanitizeText(key, 100)] = sanitizeUnknown(value);
  }
  return projected;
}

function sanitizeUnknown(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeText(value, 200);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeUnknown(item));
  }
  if (value && typeof value === "object") {
    const projected: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      projected[sanitizeText(key, 100)] = sanitizeUnknown(child);
    }
    return projected;
  }
  return value;
}

function defaultPolicyDecision(
  call: NormalizedToolCall,
  intent: ReturnType<typeof createToolInterceptionIntent>,
  dispatchPolicy: ToolBatchDispatchPlan["dispatchPolicy"],
): ToolBeforePolicyDecision {
  if (call.status === "malformed") {
    return createToolBeforePolicyDecision({
      intent,
      status: "rejected",
      reason: "tool call is malformed",
      policySource: "tool-batch-dispatch",
      reportSafeSummary: call.argumentSummary,
      notProvenClaims: ["tool-call-malformed"],
    });
  }
  if (call.status === "unsupported" || call.kind !== "allowlisted") {
    return createToolBeforePolicyDecision({
      intent,
      status: "unsupported",
      reason: "tool call is outside the current sanctioned dispatch set",
      policySource: "tool-batch-dispatch",
      reportSafeSummary: call.argumentSummary,
      notProvenClaims: ["tool-dispatch-unsupported"],
    });
  }
  if (dispatchPolicy !== "sequential") {
    return createToolBeforePolicyDecision({
      intent,
      status: "observe_only",
      reason: "tool batch dispatch is observation-only without an explicit boundary",
      policySource: "tool-batch-dispatch",
      reportSafeSummary: call.argumentSummary,
      notProvenClaims: ["tool-dispatch-not-run"],
    });
  }
  return createToolBeforePolicyDecision({
    intent,
    status: "allow",
    reason: "sanctioned sequential dispatch boundary required",
    policySource: "tool-batch-dispatch",
    reportSafeSummary: call.argumentSummary,
    notProvenClaims: ["task-success", "verification-success"],
  });
}

function statusFromPolicy(
  call: NormalizedToolCall,
  decision: ToolBeforePolicyDecision,
  dispatchPolicy: ToolBatchDispatchPlan["dispatchPolicy"],
): ToolCallDispatchStatus {
  if (call.status === "malformed" || decision.status === "rejected") {
    return "blocked";
  }
  if (decision.status === "unsupported") {
    return "unsupported";
  }
  if (decision.status === "request_authority") {
    return "authority_required";
  }
  if (decision.status === "block") {
    return "blocked";
  }
  if (dispatchPolicy !== "sequential" || decision.status === "observe_only") {
    return "not_dispatched";
  }
  return "dispatched";
}

function summarizePlanStatus(calls: readonly ToolDispatchPlanCall[]): ToolBatchDispatchStatus {
  if (calls.length === 0) {
    return "planned";
  }
  const statuses = new Set(calls.map((call) => call.dispatchStatus));
  if (statuses.size === 1) {
    const only = calls[0]?.dispatchStatus;
    if (only === "authority_required") return "authority_required";
    if (only === "dispatched") return "dispatched";
    if (only === "blocked") return "blocked";
    if (only === "unsupported") return "unsupported";
    if (only === "not_dispatched") return "not_dispatched";
    if (only === "dispatch_failed") return "dispatch_failed";
  }
  if (statuses.has("dispatched")) {
    return "partially_dispatchable";
  }
  if (statuses.has("authority_required")) {
    return "authority_required";
  }
  if (statuses.has("blocked")) {
    return "blocked";
  }
  if (statuses.has("unsupported")) {
    return "unsupported";
  }
  return "not_dispatched";
}

function createNotDispatchedResult(planned: ToolDispatchPlanCall): ToolExecutionResult {
  return {
    success: false,
    content: planned.beforePolicyDecision.reportSafeSummary,
    error: "tool dispatch not run",
    reportSafe: {
      redactionStatus: planned.redactionStatus,
      notProvenClaims: planned.notProvenClaims,
      toolInterception: {
        beforeDecision: planned.beforePolicyDecision,
      },
    },
    metadata: {
      executionStatus: "not-executed",
      dispatchStatus: planned.dispatchStatus,
    },
  };
}

function createDispatchFailedResult(
  planned: ToolDispatchPlanCall,
  error: unknown,
): ToolExecutionResult {
  const message = error instanceof Error ? error.name : "unknown";
  return {
    success: false,
    content: planned.beforePolicyDecision.reportSafeSummary,
    error: `tool dispatch failed: ${sanitizeText(message, 120)}`,
    reportSafe: {
      redactionStatus: planned.redactionStatus,
      notProvenClaims: unique([
        ...planned.notProvenClaims,
        "tool-dispatch-failed",
      ]),
      toolInterception: {
        beforeDecision: planned.beforePolicyDecision,
      },
    },
    metadata: {
      executionStatus: "failed",
      dispatchStatus: "dispatch_failed",
    },
  };
}

function createToolResultDetail(input: {
  readonly planned: ToolDispatchPlanCall;
  readonly result: ToolExecutionResult;
  readonly resultStatus: ToolResultDetailStatus;
  readonly executionReceipt?: RuntimeExecutionReceiptProjection;
}): ToolResultDetail {
  const summary = summarizeResult(input.result);
  const redactionStatus =
    input.result.reportSafe?.redactionStatus === "redacted" ||
    input.executionReceipt?.redaction.status === "redacted" ||
    input.planned.redactionStatus === "redacted"
      ? "redacted"
      : "report-safe";
  const notProvenClaims = unique([
    "terminal-success",
    "task-success",
    "verification-success",
    "tool-success",
    ...input.planned.notProvenClaims,
    ...(input.result.reportSafe?.notProvenClaims ?? []),
    ...(input.executionReceipt?.notProvenClaims ?? []),
  ]);
  return freeze({
    resultDetailsId: sanitizeId(`tool-result-detail:${input.planned.toolCallId}`),
    toolCallId: input.planned.toolCallId,
    toolName: input.planned.toolName,
    resultStatus: redactionStatus === "redacted" && input.resultStatus === "succeeded"
      ? "redacted"
      : input.resultStatus,
    contentSummary: summary,
    systemDetails: {
      dispatchStatus: input.planned.dispatchStatus,
      ...(input.executionReceipt ? { executionReceiptId: input.executionReceipt.receiptId } : {}),
      policyDecisionId: input.planned.beforePolicyDecision.decisionId,
      terminalSuccessClaim: false,
    },
    reportSafe: {
      summary,
      redactionStatus,
      notProvenClaims,
      terminalSuccessClaim: false,
    },
    redactionStatus,
    notProvenClaims,
    terminalSuccessClaim: false,
  });
}

function detailStatusFromResult(
  planned: ToolDispatchPlanCall,
  result: ToolExecutionResult,
): ToolResultDetailStatus {
  if (planned.beforePolicyDecision.status === "request_authority") {
    return "authority_required";
  }
  if (planned.beforePolicyDecision.status === "unsupported") {
    return "unsupported";
  }
  if (planned.beforePolicyDecision.status === "rejected") {
    return "rejected";
  }
  if (planned.beforePolicyDecision.status === "block") {
    return "blocked";
  }
  if (planned.dispatchStatus === "not_dispatched") {
    return "not_executed";
  }
  return result.success ? "succeeded" : "failed";
}

function runtimeReceiptFromMetadata(
  metadata: Record<string, unknown> | undefined,
): RuntimeExecutionReceiptProjection | undefined {
  const receipt = metadata?.runtimeExecutionReceipt ?? metadata?.executionReceipt;
  if (receipt && typeof receipt === "object" && "receiptId" in receipt) {
    return receipt as RuntimeExecutionReceiptProjection;
  }
  return undefined;
}

function summarizeResult(result: ToolExecutionResult): string {
  const value = result.reportSafe?.executionReceipt?.outputSummary ??
    result.content ??
    result.error ??
    result.output ??
    (result.success ? "tool result observed" : "tool result not executed");
  return sanitizeText(value, 180);
}

function uniqueReceipts(
  receipts: readonly RuntimeExecutionReceiptProjection[],
): readonly RuntimeExecutionReceiptProjection[] {
  const seen = new Set<string>();
  return receipts.filter((receipt) => {
    if (seen.has(receipt.receiptId)) {
      return false;
    }
    seen.add(receipt.receiptId);
    return true;
  });
}

function unique(values: readonly string[]): readonly string[] {
  return freeze(Array.from(new Set(values.map((value) => sanitizeText(value, 120)))).sort());
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

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freeze(child);
    }
  }
  return value;
}
