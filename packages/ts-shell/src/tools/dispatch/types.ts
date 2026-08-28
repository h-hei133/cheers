import type { RuntimeExecutionReceiptProjection } from "../../runtime/execution/receipt.js";
import type { ToolExecutionContext, ToolExecutionResult } from "../types.js";
import type { NormalizedToolCall } from "../toolCallBatch.js";
import type {
  ToolAfterObservationAnnotation,
  ToolBeforePolicyDecision,
  ToolInterceptionIntent,
} from "../policy/interception.js";
import type { ToolEffectFacts } from "../policy/effects.js";
import type {
  ToolDependencyFacts,
  ToolSchedulingCallFacts,
  ToolSchedulingExecutionState,
  ToolSchedulingPlan,
} from "../scheduling/plan.js";

export type { ToolSchedulingExecutionState } from "../scheduling/plan.js";

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
  | "cancelled"
  | "timed_out"
  | "skipped"
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
  | "scheduled"
  | "started"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out"
  | "skipped"
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
  readonly authorityGrantStatus:
    | "granted"
    | "required"
    | "denied"
    | "not-required"
    | "unknown";
  readonly notDispatchedReason?: string;
  readonly beforePolicyDecision: ToolBeforePolicyDecision;
  readonly policyDecisionId: string;
  readonly authorityRequirement: ToolBeforePolicyDecision["authorityRequirement"];
  readonly effect: ToolEffectFacts["effect"];
  readonly effectReason: string;
  readonly dependency: ToolDependencyFacts;
  readonly schedulingDecision: ToolSchedulingCallFacts["decision"];
  readonly schedulingGroupId?: string;
  readonly schedulingGroupMode: ToolSchedulingCallFacts["groupMode"];
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
  readonly dispatchPolicy: "sequential" | "parallel" | "metadata-only";
  readonly requestedDispatchPolicy: "sequential" | "parallel" | "metadata-only";
  readonly schedulingPlan: ToolSchedulingPlan;
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
  readonly schedulingStatus: ToolSchedulingPlan["executionMode"];
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
  readonly schedulingPlan: ToolSchedulingPlan;
  readonly schedulingStates: readonly {
    readonly toolCallId: string;
    readonly executionState: ToolSchedulingExecutionState;
    readonly terminalSuccessClaim: false;
  }[];
  readonly executionReceipts: readonly RuntimeExecutionReceiptProjection[];
  readonly afterAnnotations: readonly ToolAfterObservationAnnotation[];
  readonly failedToolCallIds: readonly string[];
  readonly notDispatchedToolCallIds: readonly string[];
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export type ToolBatchPolicy = (
  call: NormalizedToolCall,
  intent: ToolInterceptionIntent,
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
