import { describe, expect, it } from "vitest";

import { createRuntimeTurnSnapshot } from "../turn/turnSnapshot.js";
import { createEvidenceOnlySavePoint } from "./runtimeSavePoint.js";

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
});

