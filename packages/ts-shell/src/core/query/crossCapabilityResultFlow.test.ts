import { describe, expect, it } from "vitest";
import { createBrowserRuntimeStatusReceipt } from "../runtime/runtimeReceipt.js";
import { projectRuntimeReceipt } from "../runtime/runtimeReceiptProjection.js";
import { buildEditPatchModuleState } from "../../orchestration/editPatchModule.js";
import { mapTerminalToOrchestrationResult } from "./resultMapper.js";

describe("cross capability stopped/result flow calibration", () => {
  it("maps provider readiness preconditions through provider-specific stopped markers", () => {
    const result = mapTerminalToOrchestrationResult(
      stateWithCodingResult(
        buildCodingResult({
          reason:
            "Provider readiness failed (provider-readiness:missing-key): OPENAI_API_KEY is not set for real provider mode.",
          verification: {
            status: "blocked",
            reason:
              "Provider readiness failed (provider-readiness:missing-key): OPENAI_API_KEY is not set for real provider mode.",
          },
          evidence: ["provider-readiness:missing-key"],
        }),
      ),
      completedTerminal(),
    );

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.stopReason).toContain("provider-readiness:missing-key");
    expect(result.codingResult?.evidence).toContain("provider-readiness:missing-key");
    expect(JSON.stringify(result)).not.toContain("/home/wang/.private-agents-real");
  });

  it("keeps browser timeout and cleanup facts transcript-safe before result mapping", () => {
    const receipt = createBrowserRuntimeStatusReceipt({
      status: "not-ready",
      reasonCode: "cleanup-failed",
      reason:
        "cleanup-failed: <html><body>token=secret document.cookie=abc</body></html>",
      nextAction: "Retry against a controlled local fixture after cleanup is clean.",
      cleanup: "failed",
      evidence: ["actionable-blocker-kind:browser-cleanup-failed"],
      targetSummary: "local-fixture://pw/timeout",
    });
    const projection = projectRuntimeReceipt(receipt);
    const result = mapTerminalToOrchestrationResult(
      stateWithCodingResult(
        buildCodingResult({
          reason: projection.resultSummary,
          verification: {
            status: "blocked",
            reason: projection.resultSummary,
            nextAction: projection.cleanupSummary,
          },
          evidence: [
            ...projection.evidenceSummary,
            "actionable-blocker-kind:browser-cleanup-failed",
          ],
        }),
      ),
      completedTerminal(),
    );

    expect(projection.cleanupSummary).toBe("cleanup:failed");
    expect(projection.redactionStatus).toBe("redacted");
    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.stopReason).toContain("cleanup-failed");
    expect(result.stopReason).not.toContain("<html>");
    expect(result.stopReason).not.toContain("token=secret");
    expect(result.stopReason).not.toContain("document.cookie");
  });

  it("projects edit precondition and future-edit stopped facts without write capability", () => {
    const missingTarget = buildEditPatchModuleState({
      request: {
        prompt: "Write a script in the current directory",
        hasCreateIntent: true,
      },
    });
    const missingContent = buildEditPatchModuleState({
      request: {
        prompt: "Write src/new-widget.test.tsx",
        targetPath: "src/new-widget.test.tsx",
        hasCreateIntent: true,
      },
    });
    const futureEdit = buildEditPatchModuleState({
      request: {
        prompt: "Refactor all modules",
        hasEditIntent: true,
      },
    });

    expect(missingTarget.result.writerInvoked).toBe(false);
    expect(missingTarget.result.changedFiles).toEqual([]);
    expect(missingTarget.result.evidence).toContain(
      "actionable-blocker-kind:patch-target-missing",
    );
    expect(missingContent.result.evidence).toContain(
      "actionable-blocker-kind:patch-content-missing",
    );
    expect(futureEdit.result.evidence).toContain(
      "actionable-blocker-kind:unsupported-future-edit",
    );

    const result = mapTerminalToOrchestrationResult(
      stateWithCodingResult(
        buildCodingResult({
          reason: missingContent.result.resultSummary,
          verification: {
            status: "blocked",
            reason: missingContent.result.resultSummary,
            nextAction: missingContent.result.continueSummary,
          },
          evidence: missingContent.result.evidence,
        }),
      ),
      completedTerminal(),
    );

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.stopReason).toContain("content-or-transform");
    expect(result.codingResult?.changedFiles).toEqual([]);
  });

  it("does not turn unknown hard failures into completed or actionable stopped", () => {
    const result = mapTerminalToOrchestrationResult(
      stateWithCodingResult(
        buildCodingResult({
          reason: "unexpected adapter exception failed after execution",
          verification: {
            status: "failed",
            reason: "unexpected adapter exception failed after execution",
          },
          evidence: [],
        }),
      ),
      completedTerminal(),
    );

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("error");
    expect(result.stopReason).toBe(
      "unexpected adapter exception failed after execution",
    );
  });
});

function completedTerminal() {
  return {
    terminalReason: "completed",
    terminalClassification: "success",
    stopReason: undefined,
  } as never;
}

function stateWithCodingResult(
  codingResult: ReturnType<typeof buildCodingResult>,
) {
  return {
    transcript: [
      {
        role: "assistant",
        content: "Capability result.",
        codingResult,
      },
    ],
    sharedContext: {
      sessionId: "sess_cross_capability_result_flow",
      initialPrompt: "prompt",
      notes: [],
      handoffs: [],
    },
    lastContinuationReason: undefined,
  } as never;
}

function buildCodingResult(input: {
  reason: string;
  verification: {
    status: "failed" | "blocked" | "not-run";
    reason?: string;
    nextAction?: string;
  };
  evidence: readonly string[];
}) {
  return {
    taskKind: "edit-file",
    changedFiles: [],
    failedFiles: [{ path: "(capability)", reason: input.reason }],
    patches: [],
    repair: {
      status: "not-needed",
      attempts: 1,
      recoveredItems: [],
      failedItems: [],
      notes: [],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 1,
      evidence: [],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles: ["(capability)"],
      changedFiles: [],
      unchangedAttemptedFiles: ["(capability)"],
    },
    taskSatisfaction: {
      verdict: "insufficient-evidence",
      reasons: [input.reason],
      requiredEvidence: ["cross capability result flow"],
      observedEvidence: input.evidence,
    },
    verifiedFiles: [],
    unverifiedFiles: [],
    verification: input.verification,
    evidence: input.evidence,
  };
}
