import type { RuntimeExecutionReceiptProjection } from "../../runtime/execution/receipt.js";
import type { ToolExecutionResult } from "../types.js";
import type {
  ToolBatchDispatchPlan,
  ToolDispatchPlanCall,
  ToolResultDetail,
  ToolResultDetailStatus,
  ToolSchedulingExecutionState,
} from "./types.js";

export function projectToolExecutionResult(
  result: ToolExecutionResult,
): ToolExecutionResult {
  return {
    ...result,
    reportSafe: {
      ...result.reportSafe,
      redactionStatus: result.reportSafe?.redactionStatus ?? "report-safe",
      notProvenClaims: Array.from(
        new Set([
          "terminal-success",
          "task-success",
          "verification-success",
          ...(result.reportSafe?.notProvenClaims ?? []),
        ]),
      ),
    },
  };
}

export function detailStatusFromResult(
  planned: ToolDispatchPlanCall,
  result: ToolExecutionResult,
): ToolResultDetailStatus {
  if (result.metadata?.executionStatus === "cancelled") {
    return "cancelled";
  }
  if (result.metadata?.executionStatus === "not-executed") {
    if (planned.dispatchStatus === "blocked") return "blocked_by_policy";
    if (planned.dispatchStatus === "authority_required")
      return "authority_required";
    if (planned.dispatchStatus === "unsupported") return "unsupported_tool";
    return "not_dispatched";
  }
  if (result.success) {
    return "executed_success";
  }
  return "executed_failed";
}

export function stateFromResultStatus(
  status: ToolResultDetailStatus,
  result: ToolExecutionResult,
): ToolSchedulingExecutionState {
  if (status === "executed_success") return "completed";
  if (status === "cancelled") return "cancelled";
  if (status === "blocked_by_policy") return "blocked";
  if (result.success) return "completed";
  return "failed";
}

export function createToolResultDetail(input: {
  readonly planned: ToolDispatchPlanCall;
  readonly result: ToolExecutionResult;
  readonly resultStatus: ToolResultDetailStatus;
  readonly executionReceipt?: RuntimeExecutionReceiptProjection;
}): ToolResultDetail {
  const summary = input.result.content || input.result.error || "no output";
  return {
    resultDetailsId: `tool-result-detail:${input.planned.toolCallId}`,
    toolCallId: input.planned.toolCallId,
    toolName: input.planned.toolName,
    resultStatus: input.resultStatus,
    contentSummary: summary.slice(0, 300),
    systemDetails: {
      dispatchStatus: input.planned.dispatchStatus,
      executionReceiptId: input.executionReceipt?.receiptId,
      policyDecisionId: input.planned.policyDecisionId,
      terminalSuccessClaim: false,
    },
    reportSafe: {
      summary: summary.slice(0, 300),
      redactionStatus: input.planned.redactionStatus,
      notProvenClaims: Array.from(
        new Set([
          "terminal-success",
          "task-success",
          "verification-success",
          ...input.planned.notProvenClaims,
        ]),
      ),
      terminalSuccessClaim: false,
    },
    redactionStatus: input.planned.redactionStatus,
    notProvenClaims: Array.from(
      new Set([
        "terminal-success",
        "task-success",
        "verification-success",
        ...input.planned.notProvenClaims,
      ]),
    ),
    terminalSuccessClaim: false,
  };
}

export function createNonExecutedToolResultDetails(input: {
  readonly dispatchPlan: ToolBatchDispatchPlan;
}): readonly ToolResultDetail[] {
  return input.dispatchPlan.calls.map((planned) => {
    const resultStatus = nonExecutedDetailStatus(planned);
    const summary = nonExecutedSummary(planned);
    return {
      resultDetailsId: `tool-result-detail:${planned.toolCallId}`,
      toolCallId: planned.toolCallId,
      toolName: planned.toolName,
      resultStatus,
      contentSummary: summary,
      systemDetails: {
        dispatchStatus: planned.dispatchStatus,
        policyDecisionId: planned.policyDecisionId,
        terminalSuccessClaim: false,
      },
      reportSafe: {
        summary,
        redactionStatus: planned.redactionStatus,
        notProvenClaims: Array.from(
          new Set([
            "terminal-success",
            "task-success",
            "verification-success",
            "tool-success",
            "tool-execution-not-run",
            ...planned.notProvenClaims,
          ]),
        ),
        terminalSuccessClaim: false,
      },
      redactionStatus: planned.redactionStatus,
      notProvenClaims: Array.from(
        new Set([
          "terminal-success",
          "task-success",
          "verification-success",
          "tool-success",
          "tool-execution-not-run",
          ...planned.notProvenClaims,
        ]),
      ),
      terminalSuccessClaim: false,
    };
  });
}

export function nonExecutedDetailStatus(
  planned: ToolDispatchPlanCall,
): ToolResultDetailStatus {
  if (planned.dispatchStatus === "authority_required") {
    return "authority_required";
  }
  if (planned.dispatchStatus === "blocked") {
    return "blocked_by_policy";
  }
  if (planned.dispatchStatus === "unsupported") {
    return "unsupported_tool";
  }
  return "not_dispatched";
}

export function nonExecutedSummary(planned: ToolDispatchPlanCall): string {
  if (planned.dispatchStatus === "authority_required") {
    return `tool '${planned.toolName}' requires authority approval before dispatch`;
  }
  if (planned.dispatchStatus === "blocked") {
    return `tool '${planned.toolName}' dispatch was blocked by policy`;
  }
  if (planned.dispatchStatus === "unsupported") {
    return `tool '${planned.toolName}' is unsupported in the current environment`;
  }
  return `tool '${planned.toolName}' was not dispatched`;
}

export function runtimeReceiptFromMetadata(
  metadata?: Record<string, unknown>,
): RuntimeExecutionReceiptProjection | undefined {
  if (!metadata || typeof metadata !== "object") {
    return undefined;
  }
  const candidate = metadata.executionReceipt;
  if (
    candidate &&
    typeof candidate === "object" &&
    "receiptId" in candidate &&
    typeof (candidate as { receiptId: unknown }).receiptId === "string"
  ) {
    return candidate as RuntimeExecutionReceiptProjection;
  }
  return undefined;
}

export function uniqueReceipts(
  receipts: readonly RuntimeExecutionReceiptProjection[],
): readonly RuntimeExecutionReceiptProjection[] {
  const seen = new Set<string>();
  const result: RuntimeExecutionReceiptProjection[] = [];
  for (const receipt of receipts) {
    if (!seen.has(receipt.receiptId)) {
      seen.add(receipt.receiptId);
      result.push(receipt);
    }
  }
  return result;
}
