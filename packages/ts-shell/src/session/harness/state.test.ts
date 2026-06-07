import { describe, expect, it } from "vitest";
import {
  createQueryRuntimeHarnessState,
  settleHarnessBatch,
} from "../../core/query/runtime/harness.js";
import {
  decodeSessionHarnessState,
  encodeSessionHarnessState,
} from "./state.js";

describe("session harness state", () => {
  it("serializes and restores save points, ledger, and pending queues", () => {
    const harness = settleHarnessBatch({
      harness: createQueryRuntimeHarnessState({
        pendingVerification: [
          {
            queueId: "verify-total",
            targetFiles: ["src/total.ts"],
            command: "npm test total",
          },
        ],
        pendingRepair: [
          {
            queueId: "repair-total",
            failureClass: "command-failed",
            failureSummary: "expected total 42 got 41",
            hypothesis: "repair total",
            priorAttempt: "repair-old",
            targetFiles: ["src/total.ts"],
          },
        ],
      }),
      batch: {
        batchId: "batch-total",
        turn: 2,
        role: "coder",
        items: [],
        terminalSuccessClaim: false,
      },
      result: {
        batchId: "batch-total",
        terminalSuccessClaim: false,
        results: [
          {
            toolId: "verify-total",
            actionKind: "verify",
            coveredFiles: ["src/total.ts"],
            affectedPaths: ["src/total.ts"],
            exitStatusClass: "failure",
            failureClass: "command-failed",
            diagnosticSummary: "expected total 42 got 41",
            truncated: false,
            redactionStatus: "redacted",
            terminalSuccessClaim: false,
          },
        ],
      },
    });

    const decoded = decodeSessionHarnessState(encodeSessionHarnessState(harness));

    expect(decoded.status).toBe("accepted");
    if (decoded.status !== "accepted") return;
    expect(decoded.harness.savePoints[0]?.phase).toBe("restore");
    expect(decoded.harness.ledger.map((entry) => entry.sequence)).toEqual([1]);
    expect(decoded.harness.pendingRepair[0]).toMatchObject({
      failureClass: "command-failed",
      targetFiles: ["src/total.ts"],
    });
  });

  it("serializes and restores append-only verification trajectory entries", () => {
    const harness = settleHarnessBatch({
      harness: createQueryRuntimeHarnessState({
        pendingVerification: [
          {
            queueId: "verify-ledger-total",
            targetFiles: ["src/ledger-total.ts"],
            command: "npm test ledger-total",
          },
        ],
      }),
      batch: {
        batchId: "batch-ledger-total",
        turn: 3,
        role: "reviewer",
        actionKind: "verify",
        items: [
          {
            order: 1,
            toolId: "verify-ledger-total",
            actionKind: "verify",
            targetPaths: ["src/ledger-total.ts"],
            coveredFiles: ["src/ledger-total.ts"],
            terminalSuccessClaim: false,
          },
        ],
        terminalSuccessClaim: false,
      },
      result: {
        batchId: "batch-ledger-total",
        terminalSuccessClaim: false,
        results: [
          {
            toolId: "verify-ledger-total",
            actionKind: "verify",
            coveredFiles: ["src/ledger-total.ts"],
            affectedPaths: ["src/ledger-total.ts"],
            exitStatusClass: "failure",
            failureClass: "command-failed",
            diagnosticSummary: "ledger total mismatch",
            truncated: false,
            redactionStatus: "redacted",
            terminalSuccessClaim: false,
          },
        ],
      },
    });

    const decoded = decodeSessionHarnessState(encodeSessionHarnessState(harness));

    expect(decoded.status).toBe("accepted");
    if (decoded.status !== "accepted") return;
    expect((decoded.harness as any).trajectory.map((entry: { phase: string }) => entry.phase)).toEqual([
      "tool:planned",
      "tool:started",
      "verification:targeted",
      "verification:started",
      "tool:failed",
      "verification:failed",
      "repair:classified",
      "repair:hypothesis",
      "repair:context-needed",
    ]);
  });

  it("rejects contradictory compact harness state before it can affect runtime", () => {
    const harness = encodeSessionHarnessState(createQueryRuntimeHarnessState({
      ledger: [
        {
          sequence: 2,
          turn: 1,
          role: "coder",
          actionKind: "verify",
          toolId: "verify-stale",
          targetFiles: ["src/stale.ts"],
          affectedPaths: ["src/stale.ts"],
          exitStatusClass: "success",
          failureClass: "command-failed",
          truncated: false,
          redactionStatus: "raw",
        },
      ],
    }));

    const decoded = decodeSessionHarnessState(harness);

    expect(decoded.status).toBe("rejected");
    expect(decoded.reasons).toEqual(
      expect.arrayContaining([
        "ledger sequence is not ordered",
        "ledger entry is not redacted",
      ]),
    );
  });
});
