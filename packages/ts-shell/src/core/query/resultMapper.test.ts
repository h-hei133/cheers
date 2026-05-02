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

  it("uses structured provenance before legacy evidence for approved bash execution failures", () => {
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
            provenance: {
              approvalDecisions: [
                {
                  kind: "approved",
                  source: "not-required",
                  legacyOutcome: "approved",
                  toolName: "bash",
                  taskId: "task_mapper_bash",
                },
              ],
              toolExecutions: [
                {
                  kind: "executed-failed",
                  source: "tool-runtime",
                  legacySuccess: false,
                  toolName: "bash",
                  taskId: "task_mapper_bash",
                  failureBoundary: "tool-execution-failed",
                },
              ],
            },
          }),
        },
      ],
      sharedContext: {
        sessionId: "sess_mapper_structured_bash_failure",
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
    expect(result.codingResult?.evidence).not.toContain(
      "current-permission-request-tool:bash",
    );
  });

  it("does not treat structured approval denial as approved bash execution failure", () => {
    const fakeState = {
      transcript: [
        {
          role: "assistant",
          content: "Bash approval denied.",
          codingResult: buildCodingResult({
            changedFiles: [],
            failedFiles: [
              {
                path: "(command)",
                reason: "Approval denied by user for bash",
              },
            ],
            verification: {
              status: "blocked",
              reason: "Approval denied by user for bash",
              blockerKind: "approval-denied",
              nextAction: "Re-run and approve escalation.",
            },
            verdict: "completed-with-caveats",
            reasons: ["Workflow stopped on blocker/failure."],
            provenance: {
              approvalDecisions: [
                {
                  kind: "escalation-denied",
                  source: "sandbox-enforcer",
                  legacyOutcome: "denied",
                  toolName: "bash",
                  taskId: "task_mapper_bash",
                  wasEscalated: true,
                },
              ],
              toolExecutions: [
                {
                  kind: "approval-denied",
                  source: "approval-flow",
                  legacySuccess: false,
                  toolName: "bash",
                  taskId: "task_mapper_bash",
                  failureBoundary: "approval-denied",
                },
              ],
            },
          }),
        },
      ],
      sharedContext: {
        sessionId: "sess_mapper_structured_approval_denied",
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
    expect(result.stopReason).toBe("Re-run and approve escalation.");
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

  it("maps partial mutation blockers to a stopped terminal result", () => {
    const reason =
      "partial-mutation-failed: One or more file mutations failed, so the mutation set cannot be reported as successfully applied. Next action: Review the failed files, re-read current content, and retry only the unresolved mutation.";
    const fakeState = {
      transcript: [
        {
          role: "assistant",
          content: "Partial mutation failed.",
          codingResult: buildCodingResult({
            changedFiles: ["src/partial-ok.txt"],
            failedFiles: [
              {
                path: "docs/partial-denied.txt",
                reason: "write failed: EISDIR",
              },
            ],
            patches: [
              {
                path: "src/partial-ok.txt",
                operation: "replace",
                status: "applied",
              },
              {
                path: "docs/partial-denied.txt",
                operation: "append",
                status: "failed",
                failureCode: "write-failed",
                reason: "write failed: EISDIR",
              },
            ],
            verification: {
              status: "not-run",
              reason,
            },
            verdict: "completed-with-caveats",
            reasons: [reason],
            evidence: [
              "mutation-summary-blocker:partial-mutation-failed",
              "mutation-summary-next-action:Review the failed files, re-read current content, and retry only the unresolved mutation.",
              "edit/write applied on src/partial-ok.txt",
            ],
          }),
        },
      ],
      sharedContext: {
        sessionId: "sess_mapper_partial_mutation_failed",
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
    expect(result.codingResult?.changedFiles).toEqual(["src/partial-ok.txt"]);
    expect(result.codingResult?.failedFiles).toEqual([
      expect.objectContaining({ path: "docs/partial-denied.txt" }),
    ]);
    expect(result.codingResult?.patches).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "src/partial-ok.txt",
          status: "applied",
        }),
        expect.objectContaining({
          path: "docs/partial-denied.txt",
          status: "failed",
        }),
      ]),
    );
    expect(result.codingResult?.evidence).toEqual(
      expect.arrayContaining([
        "mutation-summary-blocker:partial-mutation-failed",
      ]),
    );
  });

  it.each([
    {
      name: "patch-target-missing",
      reason:
        "patch-target-missing: Patch target is missing or was not readable before applying replace.",
      evidence: ["actionable-blocker-kind:patch-target-missing"],
    },
    {
      name: "patch-from-not-found",
      reason:
        "patch-from-not-found: Patch source text was not found in the target file.",
      evidence: ["actionable-blocker-kind:patch-from-not-found"],
    },
    {
      name: "patch-ambiguous",
      reason: "patch-ambiguous: Patch source text matched 2 times.",
      evidence: ["actionable-blocker-kind:ambiguous-target"],
    },
    {
      name: "patch-generation-failed",
      reason:
        "patch-generation-failed: unified diff/apply_patch syntax is not supported.",
      evidence: ["actionable-blocker-kind:patch-generation-failed"],
    },
    {
      name: "stale-read",
      reason:
        "stale-read: Target file changed since it was read for this edit.",
      evidence: [
        "stale-read-blocker:src/edit-target.txt",
        "actionable-blocker-kind:stale-read",
      ],
    },
    {
      name: "partial-mutation-failed",
      reason:
        "partial-mutation-failed: One or more file mutations failed, so the mutation set cannot be reported as successfully applied.",
      evidence: ["mutation-summary-blocker:partial-mutation-failed"],
    },
  ])(
    "maps edit/patch failure evidence matrix item $name to stopped",
    ({ reason, evidence }) => {
      const fakeState = {
        transcript: [
          {
            role: "assistant",
            content: "Recoverable edit failure.",
            codingResult: buildCodingResult({
              changedFiles: [],
              failedFiles: [
                {
                  path: "src/edit-target.txt",
                  reason,
                },
              ],
              patches: [
                {
                  path: "src/edit-target.txt",
                  operation: "replace",
                  status: "failed",
                  reason,
                },
              ],
              verification: {
                status: "not-run",
                reason,
              },
              verdict: "completed-with-caveats",
              reasons: [reason],
              evidence,
            }),
          },
        ],
        sharedContext: {
          sessionId: "sess_mapper_edit_patch_failure_matrix",
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
        expect.arrayContaining(evidence),
      );
    },
  );

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
  patches?: Array<Record<string, unknown>>;
  verification: {
    status: "blocked" | "failed" | "not-run";
    reason: string;
    blockerKind?: "approval-denied" | "no-verify-strategy";
    nextAction?: string;
  };
  verdict: "completed-with-caveats" | "failed" | "insufficient-evidence";
  reasons: string[];
  evidence?: string[];
  provenance?: Record<string, unknown>;
}) {
  return {
    taskKind: "edit-file",
    changedFiles: input.changedFiles,
    failedFiles: input.failedFiles ?? [],
    patches: input.patches ?? [],
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
    ...(input.provenance ? { provenance: input.provenance } : {}),
  };
}
