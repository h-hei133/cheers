import { describe, expect, it } from "vitest";
import { mapTerminalToOrchestrationResult } from "./resultMapper.js";

describe("mapTerminalToOrchestrationResult", () => {
  it("preserves explicit terminalClassification when provided", () => {
    const fakeState = {
      transcript: [],
      sharedContext: {
        sessionId: "sess_mapper",
        initialPrompt: "prompt",
        notes: [],
        handoffs: [],
      },
      lastContinuationReason: undefined,
    } as never;

    const terminal = {
      terminalReason: "stopped_error",
      terminalClassification: "error",
      stopReason: "Transport exploded",
    } as never;

    const result = mapTerminalToOrchestrationResult(fakeState, terminal);
    expect(result.terminalClassification).toBe("error");
    expect(result.status).toBe("stopped_error");
    expect(result.stopReason).toBe("Transport exploded");
  });

  it("falls back to reason-based classification when terminalClassification is missing", () => {
    const fakeState = {
      transcript: [],
      sharedContext: {
        sessionId: "sess_mapper",
        initialPrompt: "prompt",
        notes: [],
        handoffs: [],
      },
      lastContinuationReason: undefined,
    } as never;

    const terminal = {
      terminalReason: "completed",
      terminalClassification: undefined,
      stopReason: undefined,
    } as never;

    const result = mapTerminalToOrchestrationResult(fakeState, terminal);
    expect(result.terminalClassification).toBe("success");
  });

  it("keeps successful edits successful when verification is blocked", () => {
    const fakeState = {
      transcript: [
        {
          role: "assistant",
          content:
            "Edit completed for plan.txt. Verification blocked (no-verify-strategy).",
          codingResult: buildCodingResult({
            changedFiles: ["plan.txt"],
            verification: {
              status: "blocked",
              reason:
                "Verify intent was detected, but no verify strategy could be resolved from the prompt.",
              blockerKind: "no-verify-strategy",
              nextAction:
                "Specify verify intent explicitly with test/build/check keywords so a concrete verify command can be selected.",
            },
            verdict: "completed-with-caveats",
            reasons: [
              "Edit applied but verify was blocked (no-verify-strategy); follow next action before continuing.",
            ],
          }),
        },
      ],
      sharedContext: {
        sessionId: "sess_mapper",
        initialPrompt: "prompt",
        notes: [],
        handoffs: [],
      },
      lastContinuationReason: undefined,
    } as never;

    const result = mapTerminalToOrchestrationResult(fakeState, {
      terminalReason: "completed",
      terminalClassification: "success",
      stopReason: undefined,
    } as never);

    expect(result.terminalClassification).toBe("success");
    expect(result.status).toBe("completed");
    expect(result.stopReason).toBeUndefined();
    expect(result.codingResult?.verification.status).toBe("blocked");
    expect(result.codingResult?.verification.blockerKind).toBe(
      "no-verify-strategy",
    );
  });

  it("still stops when verification is blocked without an applied edit", () => {
    const fakeState = {
      transcript: [
        {
          role: "assistant",
          content: "Verification blocked.",
          codingResult: buildCodingResult({
            changedFiles: [],
            verification: {
              status: "blocked",
              reason: "Verification command requires approval.",
              blockerKind: "approval-denied",
              nextAction:
                "Re-run and approve escalation for verify command execution.",
            },
            verdict: "completed-with-caveats",
            reasons: ["Verification command requires approval."],
          }),
        },
      ],
      sharedContext: {
        sessionId: "sess_mapper",
        initialPrompt: "prompt",
        notes: [],
        handoffs: [],
      },
      lastContinuationReason: undefined,
    } as never;

    const result = mapTerminalToOrchestrationResult(fakeState, {
      terminalReason: "completed",
      terminalClassification: "success",
      stopReason: undefined,
    } as never);

    expect(result.terminalClassification).toBe("stopped");
    expect(result.status).toBe("stopped_error");
    expect(result.stopReason).toBe(
      "Re-run and approve escalation for verify command execution.",
    );
  });

  it("maps verification failure to a stopped terminal result with actionable retry", () => {
    const fakeState = {
      transcript: [
        {
          role: "assistant",
          content: "Verification failed.",
          codingResult: buildCodingResult({
            changedFiles: ["plan.txt"],
            verification: {
              status: "failed",
              reason: "Unit tests did not pass after the edit.",
            },
            verdict: "completed-with-caveats",
            reasons: ["Verification did not pass after the edit."],
          }),
        },
      ],
      sharedContext: {
        sessionId: "sess_mapper",
        initialPrompt: "prompt",
        notes: [],
        handoffs: [],
      },
      lastContinuationReason: undefined,
    } as never;

    const result = mapTerminalToOrchestrationResult(fakeState, {
      terminalReason: "completed",
      terminalClassification: "success",
      stopReason: undefined,
    } as never);

    expect(result.terminalClassification).toBe("stopped");
    expect(result.status).toBe("stopped_error");
    expect(result.stopReason).toBe("Unit tests did not pass after the edit.");
    expect(result.codingResult?.verification.status).toBe("failed");
  });

  it("lets verification failure with a hard execution failure classify as error", () => {
    const fakeState = {
      transcript: [
        {
          role: "assistant",
          content: "Build execution failed after approval.",
          codingResult: buildCodingResult({
            changedFiles: [],
            failedFiles: [
              {
                path: "(command)",
                reason: "npm run build failed with exit code 1",
              },
            ],
            verification: {
              status: "failed",
              reason: "Verification failed: npm run build failed.",
            },
            verdict: "completed-with-caveats",
            reasons: ["bash execution failed after approval."],
            evidence: ["current-permission-request-tool:bash"],
          }),
        },
      ],
      sharedContext: {
        sessionId: "sess_mapper",
        initialPrompt: "prompt",
        notes: [],
        handoffs: [],
      },
      lastContinuationReason: undefined,
    } as never;

    const result = mapTerminalToOrchestrationResult(fakeState, {
      terminalReason: "completed",
      terminalClassification: "success",
      stopReason: undefined,
    } as never);

    expect(result.terminalClassification).toBe("error");
    expect(result.status).toBe("stopped_error");
    expect(result.stopReason).toBe(
      "Bash execution failed after approval: npm run build failed with exit code 1",
    );
  });

  it("keeps non-verification actionable blockers stopped even with hard failure text", () => {
    const fakeState = {
      transcript: [
        {
          role: "assistant",
          content: "Target file missing.",
          codingResult: buildCodingResult({
            changedFiles: [],
            failedFiles: [
              {
                path: "missing.txt",
                reason: "patch-target-missing: read failed for missing.txt",
              },
            ],
            verification: {
              status: "not-run",
              reason: "Patch target was missing.",
            },
            verdict: "completed-with-caveats",
            reasons: ["patch-target-missing: read failed for missing.txt"],
            evidence: ["actionable-blocker-kind:patch-target-missing"],
          }),
        },
      ],
      sharedContext: {
        sessionId: "sess_mapper",
        initialPrompt: "prompt",
        notes: [],
        handoffs: [],
      },
      lastContinuationReason: undefined,
    } as never;

    const result = mapTerminalToOrchestrationResult(fakeState, {
      terminalReason: "completed",
      terminalClassification: "success",
      stopReason: undefined,
    } as never);

    expect(result.terminalClassification).toBe("stopped");
    expect(result.status).toBe("stopped_error");
    expect(result.stopReason).toBe(
      "Patch target was missing.",
    );
  });

  it("maps unsupported patch shape failures to a stopped terminal result", () => {
    const reason =
      "patch-generation-failed: unsupported patch shape; unified diff/apply_patch syntax is not supported. Next action: rerun with exact replace-from and replace-to text.";
    const fakeState = {
      transcript: [
        {
          role: "assistant",
          content: "Patch generation failed.",
          codingResult: buildCodingResult({
            changedFiles: [],
            failedFiles: [
              {
                path: "patch_shape_note.txt",
                reason,
              },
            ],
            verification: {
              status: "not-run",
              reason,
            },
            verdict: "completed-with-caveats",
            reasons: [reason],
            evidence: [
              "actionable-blocker-kind:patch-generation-failed",
              "actionable-blocker-next:Rerun with one explicit target file plus exact replace-from and replace-to text; do not pass unified diff or apply_patch syntax.",
            ],
          }),
        },
      ],
      sharedContext: {
        sessionId: "sess_mapper_patch_generation_failed",
        initialPrompt: "prompt",
        notes: [],
        handoffs: [],
      },
      lastContinuationReason: undefined,
    } as never;

    const result = mapTerminalToOrchestrationResult(fakeState, {
      terminalReason: "completed",
      terminalClassification: "success",
      stopReason: undefined,
    } as never);

    expect(result.terminalClassification).toBe("stopped");
    expect(result.status).toBe("stopped_error");
    expect(result.stopReason).toBe(reason);
    expect(result.codingResult?.evidence).toEqual(
      expect.arrayContaining([
        "actionable-blocker-kind:patch-generation-failed",
      ]),
    );
  });

  it("maps stale-read edit blockers to a stopped terminal result", () => {
    const reason =
      "stale-read: Target file changed since it was read for this edit. Re-read the latest file content and rerun the mutation.";
    const fakeState = {
      transcript: [
        {
          role: "assistant",
          content: "Edit blocked by stale read.",
          codingResult: buildCodingResult({
            changedFiles: [],
            failedFiles: [
              {
                path: "src/stale-read.txt",
                reason,
              },
            ],
            verification: {
              status: "not-run",
              reason,
            },
            verdict: "completed-with-caveats",
            reasons: [reason],
            evidence: [
              "stale-read-blocker:src/stale-read.txt",
              "actionable-blocker-kind:stale-read",
            ],
          }),
        },
      ],
      sharedContext: {
        sessionId: "sess_mapper_stale_read",
        initialPrompt: "prompt",
        notes: [],
        handoffs: [],
      },
      lastContinuationReason: undefined,
    } as never;

    const result = mapTerminalToOrchestrationResult(fakeState, {
      terminalReason: "completed",
      terminalClassification: "success",
      stopReason: undefined,
    } as never);

    expect(result.terminalClassification).toBe("stopped");
    expect(result.status).toBe("stopped_error");
    expect(result.stopReason).toBe(reason);
    expect(result.codingResult?.evidence).toEqual(
      expect.arrayContaining([
        "stale-read-blocker:src/stale-read.txt",
        "actionable-blocker-kind:stale-read",
      ]),
    );
  });

  it("maps hard tool failures to an error terminal result", () => {
    const fakeState = {
      transcript: [
        {
          role: "assistant",
          content: "Edit failed.",
          codingResult: buildCodingResult({
            changedFiles: [],
            failedFiles: [
              { path: "src/app.ts", reason: "write failed: permission denied" },
            ],
            verification: {
              status: "not-run",
              reason: "Edit failed before verification could run.",
            },
            verdict: "failed",
            reasons: ["write failed: permission denied"],
          }),
        },
      ],
      sharedContext: {
        sessionId: "sess_mapper",
        initialPrompt: "prompt",
        notes: [],
        handoffs: [],
      },
      lastContinuationReason: undefined,
    } as never;

    const result = mapTerminalToOrchestrationResult(fakeState, {
      terminalReason: "completed",
      terminalClassification: "success",
      stopReason: undefined,
    } as never);

    expect(result.terminalClassification).toBe("error");
    expect(result.status).toBe("stopped_error");
    expect(result.stopReason).toBe("write failed: permission denied");
    expect(result.codingResult?.failedFiles).toHaveLength(1);
  });

  it("maps insufficient evidence without mutation to a stopped terminal result", () => {
    const fakeState = {
      transcript: [
        {
          role: "assistant",
          content: "Insufficient evidence.",
          codingResult: buildCodingResult({
            changedFiles: [],
            verification: {
              status: "not-run",
              reason: "No verification evidence was produced.",
            },
            verdict: "insufficient-evidence",
            reasons: ["Missing required verification evidence."],
          }),
        },
      ],
      sharedContext: {
        sessionId: "sess_mapper",
        initialPrompt: "prompt",
        notes: [],
        handoffs: [],
      },
      lastContinuationReason: undefined,
    } as never;

    const result = mapTerminalToOrchestrationResult(fakeState, {
      terminalReason: "completed",
      terminalClassification: "success",
      stopReason: undefined,
    } as never);

    expect(result.terminalClassification).toBe("stopped");
    expect(result.status).toBe("stopped_error");
    expect(result.stopReason).toBe("Missing required verification evidence.");
    expect(result.codingResult?.taskSatisfaction.verdict).toBe(
      "insufficient-evidence",
    );
  });
});

function buildCodingResult(input: {
  changedFiles: string[];
  failedFiles?: { path: string; reason: string }[];
  verification: {
    status: "blocked" | "failed" | "not-run";
    reason: string;
    blockerKind?: "approval-denied" | "no-verify-strategy";
    nextAction?: string;
  };
  verdict: "completed-with-caveats" | "failed" | "insufficient-evidence";
  reasons: string[];
  evidence?: string[];
}) {
  return {
    taskKind: "edit-file",
    changedFiles: input.changedFiles,
    failedFiles: input.failedFiles ?? [],
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
      postRunDirtyFiles: input.changedFiles,
      attemptedFiles: [
        ...input.changedFiles,
        ...(input.failedFiles ?? []).map((file) => file.path),
      ],
      changedFiles: input.changedFiles,
      unchangedAttemptedFiles: [],
    },
    taskSatisfaction: {
      verdict: input.verdict,
      reasons: input.reasons,
      requiredEvidence: ["inspect->edit->verify contract execution"],
      observedEvidence: [],
    },
    verifiedFiles: [],
    unverifiedFiles: input.changedFiles.map((path) => ({
      path,
      reason: input.verification.reason,
    })),
    verification: input.verification,
    evidence: input.evidence ?? [],
  };
}
