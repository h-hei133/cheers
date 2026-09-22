import type { RuntimeExecutionReceiptProjection } from "../../runtime/execution/receipt.js";
import type { ToolExecutionContext, ToolExecutionResult } from "../types.js";
import type { NormalizedToolCallBatch } from "../toolCallBatch.js";
import {
  createBlockedToolInterceptionResult,
  createToolAfterObservationAnnotation,
  shouldPreventToolExecution,
  type ToolAfterObservationAnnotation,
} from "../policy/interception.js";
import type {
  ToolBatchDispatchResult,
  ToolBatchDispatchSeam,
  ToolBatchPolicy,
  ToolDispatchPlanCall,
  ToolResultDetail,
  ToolSchedulingExecutionState,
} from "./types.js";
import { planToolBatchDispatch } from "./planner.js";
import {
  createToolResultDetail,
  detailStatusFromResult,
  projectToolExecutionResult,
  runtimeReceiptFromMetadata,
  stateFromResultStatus,
  uniqueReceipts,
} from "./projector.js";
import { withFileMutationQueue } from "../concurrency/fileMutationQueue.js";

export async function dispatchToolBatch(input: {
  readonly batch: NormalizedToolCallBatch;
  readonly context: ToolExecutionContext;
  readonly dispatchPolicy?: "sequential" | "parallel" | "metadata-only";
  readonly policy?: ToolBatchPolicy;
  readonly dispatch?: ToolBatchDispatchSeam;
  readonly caller?: string;
}): Promise<ToolBatchDispatchResult> {
  const dispatchPlan = planToolBatchDispatch(input);
  const byCallId = new Map<
    string,
    {
      readonly result: ToolExecutionResult;
      readonly detail: ToolResultDetail;
      readonly annotation: ToolAfterObservationAnnotation;
      readonly receipt?: RuntimeExecutionReceiptProjection;
    }
  >();
  const executionReceipts: RuntimeExecutionReceiptProjection[] = [];
  const failedToolCallIds: string[] = [];
  const notDispatchedToolCallIds: string[] = [];
  const schedulingStates = new Map<string, ToolSchedulingExecutionState>();
  const callById = new Map(input.batch.calls.map((call) => [call.id, call]));

  const executePlanned = async (
    planned: ToolDispatchPlanCall,
  ): Promise<void> => {
    if (byCallId.has(planned.toolCallId)) {
      return;
    }
    const call = callById.get(planned.toolCallId);
    if (!call) {
      return;
    }
    let result: ToolExecutionResult;
    if (shouldPreventToolExecution(planned.beforePolicyDecision)) {
      result = createBlockedToolInterceptionResult(
        planned.beforePolicyDecision,
      );
      notDispatchedToolCallIds.push(call.id);
      schedulingStates.set(call.id, "blocked");
    } else if (
      !input.dispatch ||
      planned.dispatchStatus !== "dispatched" ||
      (dispatchPlan.dispatchPolicy === "parallel" &&
        planned.schedulingDecision !== "parallel_allowed" &&
        planned.schedulingDecision !== "forced_sequential")
    ) {
      result = createNotDispatchedResult(planned);
      notDispatchedToolCallIds.push(call.id);
      schedulingStates.set(
        call.id,
        planned.schedulingDecision === "blocked" ? "blocked" : "skipped",
      );
    } else if (input.context.abortSignal?.aborted) {
      result = createCancelledResult(planned);
      failedToolCallIds.push(call.id);
      schedulingStates.set(call.id, "cancelled");
    } else {
      try {
        schedulingStates.set(call.id, "started");
        // Safe concurrency: protect file mutations via withFileMutationQueue if target path exists
        const filePath =
          typeof call.reportSafeArguments?.path === "string"
            ? (call.reportSafeArguments.path as string)
            : undefined;

        if (filePath && (call.name === "write" || call.name === "edit")) {
          result = await withFileMutationQueue(filePath, () =>
            input.dispatch!(call, planned.beforePolicyDecision, input.context),
          );
        } else {
          result = await input.dispatch(
            call,
            planned.beforePolicyDecision,
            input.context,
          );
        }
      } catch (error) {
        result = createDispatchFailedResult(planned, error);
      }
    }
    result = projectToolExecutionResult(result);

    const receipt =
      result.details?.executionReceipt ??
      result.reportSafe?.executionReceipt ??
      runtimeReceiptFromMetadata(result.metadata);
    if (receipt) {
      executionReceipts.push(receipt);
    }
    const resultStatus = detailStatusFromResult(planned, result);
    if (!result.success) {
      failedToolCallIds.push(call.id);
    }
    schedulingStates.set(call.id, stateFromResultStatus(resultStatus, result));
    const detail = createToolResultDetail({
      planned,
      result,
      resultStatus,
      executionReceipt: receipt,
    });
    const annotation =
      result.details?.toolInterception?.afterAnnotation ??
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

    byCallId.set(call.id, {
      result,
      detail,
      annotation,
      ...(receipt ? { receipt } : {}),
    });
  };

  if (dispatchPlan.dispatchPolicy === "parallel") {
    for (const group of dispatchPlan.schedulingPlan.groups) {
      const plannedGroup = group.toolCallIds
        .map((toolCallId) =>
          dispatchPlan.calls.find(
            (planned) => planned.toolCallId === toolCallId,
          ),
        )
        .filter((planned): planned is ToolDispatchPlanCall => Boolean(planned));
      if (input.context.abortSignal?.aborted) {
        await Promise.all(
          plannedGroup.map(async (planned) => executePlanned(planned)),
        );
        continue;
      }
      if (group.mode === "parallel") {
        await Promise.allSettled(
          plannedGroup.map(async (planned) => executePlanned(planned)),
        );
      } else {
        for (const planned of plannedGroup) {
          await executePlanned(planned);
        }
      }
    }
  } else {
    for (const planned of dispatchPlan.calls) {
      await executePlanned(planned);
    }
  }

  for (const planned of dispatchPlan.calls) {
    await executePlanned(planned);
  }

  const ordered = dispatchPlan.calls
    .map((planned) => byCallId.get(planned.toolCallId))
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
  const results = ordered.map((item) => item.result);
  const resultDetails = ordered.map((item) => item.detail);
  const afterAnnotations = ordered.map((item) => item.annotation);

  return {
    resultBatchId: `tool-result-batch:${dispatchPlan.batchId}`,
    dispatchPlan,
    results,
    resultDetails,
    schedulingPlan: dispatchPlan.schedulingPlan,
    schedulingStates: dispatchPlan.calls.map((planned) => ({
      toolCallId: planned.toolCallId,
      executionState: schedulingStates.get(planned.toolCallId) ?? "skipped",
      terminalSuccessClaim: false as const,
    })),
    executionReceipts: uniqueReceipts(executionReceipts),
    afterAnnotations,
    failedToolCallIds: Array.from(new Set(failedToolCallIds)),
    notDispatchedToolCallIds: Array.from(new Set(notDispatchedToolCallIds)),
    terminalSuccessClaim: false,
    notProvenClaims: Array.from(
      new Set([
        ...dispatchPlan.notProvenClaims,
        ...resultDetails.flatMap((detail) => detail.notProvenClaims),
        ...afterAnnotations.flatMap((annotation) => annotation.notProvenClaims),
      ]),
    ),
  };
}

export function createNotDispatchedResult(
  planned: ToolDispatchPlanCall,
): ToolExecutionResult {
  return {
    success: false,
    content: planned.notDispatchedReason ?? "tool dispatch was skipped",
    error: planned.notDispatchedReason ?? "not-dispatched",
    metadata: {
      executionStatus: "not-executed",
      dispatchStatus: planned.dispatchStatus,
    },
    reportSafe: {
      redactionStatus: planned.redactionStatus,
      notProvenClaims: [
        "tool-execution-not-run",
        "terminal-success",
        ...planned.notProvenClaims,
      ],
    },
  };
}

export function createCancelledResult(
  planned: ToolDispatchPlanCall,
): ToolExecutionResult {
  return {
    success: false,
    content: "tool execution was cancelled by abort signal",
    error: "execution-cancelled",
    metadata: {
      executionStatus: "cancelled",
      dispatchStatus: "dispatch_failed",
    },
    reportSafe: {
      redactionStatus: planned.redactionStatus,
      notProvenClaims: [
        "tool-execution-cancelled",
        "terminal-success",
        ...planned.notProvenClaims,
      ],
    },
  };
}

export function createDispatchFailedResult(
  planned: ToolDispatchPlanCall,
  error: unknown,
): ToolExecutionResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    success: false,
    content: `tool execution failed to dispatch: ${message}`,
    error: message,
    metadata: {
      executionStatus: "failed",
      dispatchStatus: "dispatch_failed",
    },
    reportSafe: {
      redactionStatus: planned.redactionStatus,
      notProvenClaims: [
        "tool-execution-failed",
        "terminal-success",
        ...planned.notProvenClaims,
      ],
    },
  };
}
