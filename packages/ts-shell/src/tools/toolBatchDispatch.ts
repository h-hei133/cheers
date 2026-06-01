import type { RuntimeExecutionReceiptProjection } from "../runtime/execution/receipt.js";
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
} from "./policy/interception.js";

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
  | "executed_success"
  | "executed_failed"
  | "blocked_by_policy"
  | "authority_required"
  | "authority_denied"
  | "unsupported_tool"
  | "unknown_tool"
  | "malformed_arguments"
  | "execution_unavailable"
  | "not_dispatched"
  | "redacted";

export type ToolArgumentSafetyState = "report-safe" | "redacted";

export type ToolExecutionState =
  | "not_dispatched"
  | "blocked"
  | "authority_required"
  | "unsupported"
  | "unknown"
  | "malformed"
  | "execution_unavailable";

export interface ToolDispatchPlanCall {
  readonly toolCallId: string;
  readonly toolName: string;
  readonly callKind: NormalizedToolCall["kind"];
  readonly safeToolLabel: string;
  readonly callStatus: NormalizedToolCall["status"];
  readonly knownToolStatus: "known" | "unknown";
  readonly supportedStatus: "supported" | "unsupported";
  readonly dispatchStatus: ToolCallDispatchStatus;
  readonly dispatchEligibility: ToolCallDispatchStatus;
  readonly authorityGrantStatus: "granted" | "required" | "denied" | "not-required" | "unknown";
  readonly notDispatchedReason?: string;
  readonly beforePolicyDecision: ToolBeforePolicyDecision;
  readonly policyDecisionId: string;
  readonly authorityRequirement: ToolBeforePolicyDecision["authorityRequirement"];
  readonly argumentSafety: ToolArgumentSafetyState;
  readonly redactionStatus: "report-safe" | "redacted";
  readonly malformed: boolean;
  readonly unsupported: boolean;
  readonly unknownTool: boolean;
  readonly executionState: ToolExecutionState;
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
  readonly malformedCallIds: readonly string[];
  readonly unsupportedCallIds: readonly string[];
  readonly unknownCallIds: readonly string[];
  readonly notDispatchedCallIds: readonly string[];
  readonly dispatchedCallIds: readonly string[];
  readonly executionStatus: "not_dispatched" | "partially_dispatched" | "dispatched";
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

export interface SanctionedToolDispatcher {
  dispatch(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult>;
}

export function createToolDispatcherBatchDispatch(
  dispatcher: SanctionedToolDispatcher,
): ToolBatchDispatchSeam {
  return (call, _decision, context) => {
    if (!call.reportSafeArguments) {
      return Promise.resolve({
        success: false,
        content: call.argumentSummary,
        error: "tool arguments are not report-safe",
        reportSafe: {
          redactionStatus: call.redaction.status,
          notProvenClaims: [
            "tool-execution-not-run",
            "tool-arguments-not-report-safe",
            "terminal-success",
            "task-success",
            "verification-success",
          ],
        },
        metadata: {
          executionStatus: "not-executed",
          dispatchStatus: "not_dispatched",
        },
      });
    }
    return dispatcher.dispatch(call.name, { ...call.reportSafeArguments }, context);
  };
}

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
    const dispatchStatus = statusFromPolicy(call, beforePolicyDecision, dispatchPolicy);
    const knownToolStatus: ToolDispatchPlanCall["knownToolStatus"] =
      call.status === "unknown" || call.kind === "unknown" ? "unknown" : "known";
    const supportedStatus: ToolDispatchPlanCall["supportedStatus"] =
      call.kind === "allowlisted" ? "supported" : "unsupported";
    return freeze({
      toolCallId: call.id,
      toolName: call.name,
      callKind: call.kind,
      safeToolLabel: call.name,
      callStatus: call.status,
      knownToolStatus,
      supportedStatus,
      dispatchStatus,
      dispatchEligibility: dispatchStatus,
      authorityGrantStatus: authorityGrantStatus(beforePolicyDecision, dispatchStatus),
      ...(dispatchStatus === "dispatched"
        ? {}
        : { notDispatchedReason: notDispatchedReason(call, beforePolicyDecision, dispatchStatus, dispatchPolicy) }),
      beforePolicyDecision,
      policyDecisionId: beforePolicyDecision.decisionId,
      authorityRequirement: beforePolicyDecision.authorityRequirement,
      argumentSafety: call.redaction.status,
      redactionStatus,
      malformed: call.status === "malformed",
      unsupported: call.status === "unsupported",
      unknownTool: call.status !== "malformed" && (call.status === "unknown" || call.kind === "unknown"),
      executionState: executionStateFromPlan(call, dispatchStatus, input.dispatchPolicy),
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
    malformedCallIds: freeze(calls.filter((call) =>
      call.malformed
    ).map((call) => call.toolCallId)),
    unsupportedCallIds: freeze(calls.filter((call) =>
      call.unsupported
    ).map((call) => call.toolCallId)),
    unknownCallIds: freeze(calls.filter((call) =>
      call.unknownTool && !call.malformed
    ).map((call) => call.toolCallId)),
    notDispatchedCallIds: freeze(calls.filter((call) =>
      call.dispatchStatus === "not_dispatched"
    ).map((call) => call.toolCallId)),
    dispatchedCallIds: freeze(calls.filter((call) =>
      call.dispatchStatus === "dispatched"
    ).map((call) => call.toolCallId)),
    executionStatus: calls.some((call) => call.dispatchStatus === "dispatched")
      ? calls.every((call) => call.dispatchStatus === "dispatched")
        ? "dispatched"
        : "partially_dispatched"
      : "not_dispatched",
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
          : resultStatus === "not_dispatched" ||
              resultStatus === "blocked_by_policy" ||
              resultStatus === "authority_required" ||
              resultStatus === "authority_denied" ||
              resultStatus === "unsupported_tool" ||
              resultStatus === "unknown_tool" ||
              resultStatus === "malformed_arguments" ||
              resultStatus === "execution_unavailable"
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
          resultStatus === "blocked_by_policy" ||
            resultStatus === "authority_required" ||
            resultStatus === "authority_denied"
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

export function createNonExecutedToolResultDetails(input: {
  readonly dispatchPlan: ToolBatchDispatchPlan;
}): readonly ToolResultDetail[] {
  return freeze(input.dispatchPlan.calls.map((planned) => {
    const resultStatus = nonExecutedDetailStatus(planned);
    const summary = nonExecutedSummary(planned);
    const notProvenClaims = unique([
      "terminal-success",
      "task-success",
      "verification-success",
      "tool-success",
      "tool-execution-not-run",
      ...planned.notProvenClaims,
    ]);
    return freeze({
      resultDetailsId: sanitizeId(`tool-result-detail:${planned.toolCallId}`),
      toolCallId: planned.toolCallId,
      toolName: planned.toolName,
      resultStatus,
      contentSummary: summary,
      systemDetails: {
        dispatchStatus: planned.dispatchStatus,
        policyDecisionId: planned.beforePolicyDecision.decisionId,
        terminalSuccessClaim: false,
      },
      reportSafe: {
        summary,
        redactionStatus: planned.redactionStatus,
        notProvenClaims,
        terminalSuccessClaim: false,
      },
      redactionStatus: planned.redactionStatus,
      notProvenClaims,
      terminalSuccessClaim: false,
    });
  }));
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
  if (call.status === "unknown" || call.kind === "unknown") {
    return createToolBeforePolicyDecision({
      intent,
      status: "unsupported",
      reason: "tool call name is not recognized by the current sanctioned dispatch set",
      policySource: "tool-batch-dispatch",
      reportSafeSummary: call.argumentSummary,
      notProvenClaims: ["tool-dispatch-unknown"],
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
  if (call.redaction.status === "redacted" || !call.reportSafeArguments) {
    return "not_dispatched";
  }
  if (dispatchPolicy !== "sequential" || decision.status === "observe_only") {
    return "not_dispatched";
  }
  return "dispatched";
}

function authorityGrantStatus(
  decision: ToolBeforePolicyDecision,
  dispatchStatus: ToolCallDispatchStatus,
): ToolDispatchPlanCall["authorityGrantStatus"] {
  if (decision.authorityRequirement === "denied" || decision.status === "block") {
    return "denied";
  }
  if (decision.status === "request_authority") {
    return "required";
  }
  if (dispatchStatus === "dispatched") {
    return "granted";
  }
  if (decision.authorityRequirement === "none-required") {
    return "not-required";
  }
  return "unknown";
}

function notDispatchedReason(
  call: NormalizedToolCall,
  decision: ToolBeforePolicyDecision,
  dispatchStatus: ToolCallDispatchStatus,
  dispatchPolicy: ToolBatchDispatchPlan["dispatchPolicy"],
): string {
  if (call.status === "malformed") return "malformed_arguments";
  if (call.status === "unknown" || call.kind === "unknown") return "unknown_tool";
  if (call.status === "unsupported" || call.kind !== "allowlisted") return "unsupported_tool";
  if (decision.status === "request_authority") return "authority_required";
  if (decision.authorityRequirement === "denied") return "authority_denied";
  if (decision.status === "block" || decision.status === "rejected") return "blocked_by_policy";
  if (call.redaction.status === "redacted" || !call.reportSafeArguments) {
    return "arguments_not_report_safe";
  }
  if (dispatchPolicy !== "sequential" || decision.status === "observe_only") {
    return "dispatch_not_requested";
  }
  if (dispatchStatus === "unsupported") return "unsupported_tool";
  return "not_dispatched";
}

function executionStateFromPlan(
  call: NormalizedToolCall,
  dispatchStatus: ToolCallDispatchStatus,
  requestedDispatchPolicy: "sequential" | "parallel" | "metadata-only" | undefined,
): ToolExecutionState {
  if (call.status === "malformed") {
    return "malformed";
  }
  if (call.status === "unknown" || call.kind === "unknown") {
    return "unknown";
  }
  if (dispatchStatus === "blocked") {
    return "blocked";
  }
  if (dispatchStatus === "authority_required") {
    return "authority_required";
  }
  if (dispatchStatus === "unsupported") {
    return "unsupported";
  }
  if (dispatchStatus === "dispatched") {
    return requestedDispatchPolicy === "sequential" ? "execution_unavailable" : "not_dispatched";
  }
  return "not_dispatched";
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

function nonExecutedDetailStatus(planned: ToolDispatchPlanCall): ToolResultDetailStatus {
  if (planned.malformed) {
    return "malformed_arguments";
  }
  if (planned.unknownTool) {
    return "unknown_tool";
  }
  if (planned.dispatchStatus === "blocked") {
    return planned.beforePolicyDecision.authorityRequirement === "denied"
      ? "authority_denied"
      : "blocked_by_policy";
  }
  if (planned.dispatchStatus === "authority_required") {
    return "authority_required";
  }
  if (planned.dispatchStatus === "unsupported" || planned.unknownTool || planned.unsupported) {
    return "unsupported_tool";
  }
  if (planned.executionState === "execution_unavailable") {
    return "execution_unavailable";
  }
  return "not_dispatched";
}

function nonExecutedSummary(planned: ToolDispatchPlanCall): string {
  if (planned.malformed) {
    return `malformed arguments for ${planned.safeToolLabel}; execution not run`;
  }
  if (planned.unknownTool) {
    return `unknown tool ${planned.safeToolLabel}; execution not run`;
  }
  if (planned.dispatchStatus === "blocked") {
    return `blocked by policy for ${planned.safeToolLabel}; execution not run`;
  }
  if (planned.dispatchStatus === "authority_required") {
    return `authority required for ${planned.safeToolLabel}; execution not run`;
  }
  if (planned.dispatchStatus === "unsupported" || planned.unsupported) {
    return `unsupported tool ${planned.safeToolLabel}; execution not run`;
  }
  if (planned.executionState === "execution_unavailable") {
    return `execution unavailable for ${planned.safeToolLabel}; execution not run`;
  }
  return `${planned.safeToolLabel} not dispatched; execution not run`;
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
    resultStatus: redactionStatus === "redacted" && input.resultStatus === "executed_success"
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
    return planned.unknownTool ? "unknown_tool" : "unsupported_tool";
  }
  if (planned.beforePolicyDecision.status === "rejected") {
    return planned.beforePolicyDecision.authorityRequirement === "denied"
      ? "authority_denied"
      : "malformed_arguments";
  }
  if (planned.beforePolicyDecision.status === "block") {
    return planned.beforePolicyDecision.authorityRequirement === "denied"
      ? "authority_denied"
      : "blocked_by_policy";
  }
  if (planned.dispatchStatus === "not_dispatched") {
    return "not_dispatched";
  }
  if (
    planned.dispatchStatus === "dispatched" &&
    inputMetadataExecutionStatus(result) === "not-executed"
  ) {
    return "execution_unavailable";
  }
  return result.success ? "executed_success" : "executed_failed";
}

function inputMetadataExecutionStatus(result: ToolExecutionResult): string | undefined {
  return typeof result.metadata?.executionStatus === "string"
    ? result.metadata.executionStatus
    : undefined;
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
