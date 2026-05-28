import { describe, expect, it } from "vitest";
import { createEmptyLifecycleIndex } from "../../core/tools/toolResultLifecycle.js";
import type { RecoverySnapshot } from "./sessionRecoverySnapshot.js";
import { reconcileSessionPendingLifecycle } from "./sessionLifecycleReconciliation.js";

describe("session lifecycle reconciliation", () => {
  it("reuses existing direct resolutions before appending compensated cleanup", () => {
    const appended: string[] = [];
    const applied: string[] = [];
    const snapshot: RecoverySnapshot = {
      pendingLifecycle: {
        ...createEmptyLifecycleIndex(),
        pendingApprovals: {
          "approval-1": { taskId: "approval-1", toolName: "bash" },
          "approval-2": { taskId: "approval-2", toolName: "python" },
        },
      },
      repairSummary: {
        insertedPromptMessage: false,
        insertedQueryStarted: false,
        strippedInterruptedTerminalEvents: 0,
        insertedRunInterrupted: false,
        ignoredDuplicateTurnStarts: 0,
        ignoredUnpairedTurnCompletions: 0,
        ignoredRoleMismatchedTurnCompletions: 0,
      },
      transcriptEvents: [],
    };

    reconcileSessionPendingLifecycle({
      snapshot,
      findCompensatedLifecycleEvent: (input) =>
        input.taskId === "approval-1"
          ? {
              type: "approval.resolved",
              taskId: input.taskId,
              toolName: input.toolName,
              outcome: "denied",
            }
          : undefined,
      applyQueryEventToState: (event) => applied.push(event.taskId),
      appendQueryEvent: (event) => appended.push(event.taskId),
      readPendingLifecycle: createEmptyLifecycleIndex,
    });

    expect(applied).toEqual(["approval-1"]);
    expect(appended).toEqual(["approval-2"]);
  });
});
