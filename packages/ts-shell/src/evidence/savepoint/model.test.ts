import { describe, expect, it } from "vitest";

import { createRuntimeTurnSnapshot } from "../../turn/turnSnapshot.js";
import { createCommandExecutionReceipt } from "../../runtime/execution/receipt.js";
import { createEvidenceOnlySavePoint } from "./model.js";

describe("runtime evidence save point", () => {
  it("redacts unsafe evidence content and remains evidence-only", () => {
    const snapshot = createRuntimeTurnSnapshot({
      sessionId: "sess-save-point",
      turn: 1,
      phase: "turn",
      workspaceRoot: "/tmp/workspace",
      providerOptIn: false,
    });
    const savePoint = createEvidenceOnlySavePoint({
      turnSnapshot: snapshot,
      phase: "save_point",
      evidenceIds: [
        "provider-called:false",
        "oldText: raw before",
        "newText: raw after",
        "stdout token=secret-value raw output",
        "raw provider output: hidden text",
      ],
      resultProjection: {
        status: "completed-with-caveats",
        terminalClassification: "stopped",
        terminalReason: "stopped_error",
      },
    });
    const serialized = JSON.stringify(savePoint);

    expect(serialized).not.toContain("raw before");
    expect(serialized).not.toContain("raw after");
    expect(serialized).not.toContain("secret-value");
    expect(serialized).not.toContain("hidden text");
    expect(savePoint.redaction.status).toBe("redacted");
    expect(savePoint.terminalSuccessClaim).toBe(false);
    expect(savePoint.resultProjectionStatus).toBe("observed-not-verdict");
  });

  it("does not upgrade stopped, blocked, partial, not-run, or not-proven facts into success", () => {
    const snapshot = createRuntimeTurnSnapshot({
      sessionId: "sess-truth",
      turn: 3,
      phase: "turn",
      workspaceRoot: "/tmp/workspace",
      providerOptIn: false,
    });
    const savePoint = createEvidenceOnlySavePoint({
      turnSnapshot: snapshot,
      phase: "save_point",
      evidenceIds: [
        "stopped",
        "blocked",
        "partial",
        "verification:not-run",
        "claim:not-proven",
      ],
      notProvenClaims: ["selected-not-run"],
      resultProjection: {
        status: "insufficient-evidence",
        terminalClassification: "stopped",
        terminalReason: "stopped_error",
      },
    });

    expect(savePoint.terminalSuccessClaim).toBe(false);
    expect(savePoint.notProvenClaims).toEqual(
      expect.arrayContaining([
        "provider-success",
        "proposal-success",
        "apply-success",
        "verification-success",
        "repair-success",
        "selected-not-run",
      ]),
    );
    expect(JSON.stringify(savePoint)).not.toContain('"success":true');
  });

  it("references execution receipts without turning observed facts into verdict success", () => {
    const snapshot = createRuntimeTurnSnapshot({
      sessionId: "sess-receipt-save-point",
      turn: 4,
      phase: "turn",
      workspaceRoot: "/tmp/workspace",
      providerOptIn: false,
    });
    const receipt = createCommandExecutionReceipt({
      request: {
        operationKind: "command.run",
        command: "sh",
        args: ["-c", "printf ok"],
        cwd: "/tmp/workspace",
        workspaceRoot: "/tmp/workspace",
        authority: {
          mode: "command-allowlisted",
          source: "tool-runtime-approval",
          reason: "test authority",
        },
        caller: "core-tool:bash",
        reason: "test save point receipt",
        reportSafeCommand: "printf ok",
      },
      result: {
        status: "completed",
        exitCode: 0,
        stdout: "ok",
        stderr: "",
      },
    });

    const savePoint = createEvidenceOnlySavePoint({
      turnSnapshot: snapshot,
      phase: "save_point",
      evidenceIds: ["verification:not-run"],
      executionReceipts: [receipt],
    });

    expect(savePoint.executionReceipts).toEqual([
      expect.objectContaining({
        receiptId: receipt.receiptId,
        executionStatus: "success",
        errorClass: "success",
        evidenceCorrelationId: "execution-receipt:success:completed",
      }),
    ]);
    expect(savePoint.terminalSuccessClaim).toBe(false);
    expect(savePoint.notProvenClaims).toContain("verification-success");
  });

  it("captures post-tool next-turn references without implying execution or success", () => {
    const snapshot = createRuntimeTurnSnapshot({
      sessionId: "sess-post-tool-save-point",
      turn: 5,
      phase: "turn",
      workspaceRoot: "/tmp/workspace",
      providerOptIn: false,
    });
    const savePoint = createEvidenceOnlySavePoint({
      turnSnapshot: snapshot,
      phase: "save_point",
      evidenceIds: ["tool-result-batch:batch-a"],
      toolResultMessageIds: ["tool-result-message:call-a"],
      toolResultDetailIds: ["tool-result-detail:call-a"],
      beforeToolDecisionIds: ["before-tool:call-a"],
      afterToolAnnotationIds: ["after-tool:call-a"],
      nextTurnBundleId: "bundle-a",
      pendingNextTurnFacts: ["next-turn:not-executed"],
      notProvenClaims: ["next-turn-execution"],
    });

    expect(savePoint.toolResultMessageIds).toEqual(["tool-result-message:call-a"]);
    expect(savePoint.nextTurnBundleId).toBe("bundle-a");
    expect(savePoint.pendingNextTurnFacts).toContain("next-turn:not-executed");
    expect(savePoint.terminalSuccessClaim).toBe(false);
    expect(savePoint.notProvenClaims).toContain("next-turn-execution");
    expect(JSON.stringify(savePoint)).not.toContain('"success":true');
  });
});
