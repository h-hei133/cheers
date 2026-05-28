import type { QueryEvent } from "../../core/query/events.js";
import type { DurableLifecycleIndex } from "../../core/tools/toolResultLifecycle.js";
import type { RecoverySnapshot } from "./sessionRecoverySnapshot.js";

export function reconcileSessionPendingLifecycle(input: {
  readonly snapshot: RecoverySnapshot;
  readonly findCompensatedLifecycleEvent: (
    input:
      | { readonly type: "approval.resolved"; readonly taskId: string; readonly toolName: string }
      | { readonly type: "tool.result"; readonly taskId: string; readonly toolName: string },
  ) =>
    | Extract<QueryEvent, { type: "approval.resolved" | "tool.result" }>
    | undefined;
  readonly applyQueryEventToState: (event: QueryEvent) => void;
  readonly appendQueryEvent: (event: QueryEvent) => void;
  readonly readPendingLifecycle: () => DurableLifecycleIndex;
}): DurableLifecycleIndex {
  for (const pendingApproval of Object.values(
    input.snapshot.pendingLifecycle.pendingApprovals,
  )) {
    const compensatedApproval = input.findCompensatedLifecycleEvent({
      type: "approval.resolved",
      toolName: pendingApproval.toolName,
      taskId: pendingApproval.taskId,
    });

    if (compensatedApproval) {
      input.applyQueryEventToState(compensatedApproval);
      continue;
    }

    input.appendQueryEvent({
      type: "approval.resolved",
      toolName: pendingApproval.toolName,
      taskId: pendingApproval.taskId,
      outcome: "denied",
      compensated: true,
    });
  }
  for (const pendingTool of Object.values(
    input.snapshot.pendingLifecycle.pendingTools,
  )) {
    const compensatedTool = input.findCompensatedLifecycleEvent({
      type: "tool.result",
      toolName: pendingTool.toolName,
      taskId: pendingTool.taskId,
    });

    if (compensatedTool) {
      input.applyQueryEventToState(compensatedTool);
      continue;
    }

    input.appendQueryEvent({
      type: "tool.result",
      toolName: pendingTool.toolName,
      taskId: pendingTool.taskId,
      success: false,
      compensated: true,
    });
  }

  return input.readPendingLifecycle();
}
