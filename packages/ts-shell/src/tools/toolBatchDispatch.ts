export * from "./dispatch/types.js";
export * from "./dispatch/planner.js";
export * from "./dispatch/executor.js";
export * from "./dispatch/projector.js";

import type { SanctionedToolDispatcher, ToolBatchDispatchSeam } from "./dispatch/types.js";

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
    return dispatcher.dispatch(
      call.name,
      { ...call.reportSafeArguments },
      context,
    );
  };
}
