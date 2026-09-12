import { describe, expect, it } from "vitest";
import { runCompactCommand } from "../context/compact/command/compactCommandRunner.js";
import { createCompactInjectionStateStore } from "../context/compact/injection/compactInjectionState.js";
import {
  createCompactLiveCheckpointStore,
  updateLatestCompactCheckpoint,
} from "../context/compact/checkpoint/compactLiveCheckpoint.js";
import {
  createRuntimeEventDigest,
  renderExecutionSummaryBlock,
  renderSessionQueryEventSurface,
  updateRuntimeEventDigest,
} from "./sessionEventSurface.js";
import { buildPromptWithFutureTurnInjections } from "./sessionFutureTurnProjection.js";
import {
  projectCompletedSessionSave,
  projectErrorSessionSave,
  projectRuntimeFailureSessionSave,
} from "./sessionPersistenceProjection.js";
import {
  applyTerminalQueryEvent,
  createSessionTerminalState,
  renderSessionTerminalSurface,
} from "./sessionTerminalState.js";

describe("session runtime boundary facades", () => {
  it("renders QueryEvent display facts without changing compact retry or verbose event text", () => {
    const renderedLines: string[] = [];
    const renderedChunks: string[] = [];
    const renderer = {
      renderLine(line: string) {
        renderedLines.push(line);
      },
      renderChunk(chunk: string) {
        renderedChunks.push(chunk);
      },
    };
    const digest = createRuntimeEventDigest();
    let startedRendering = false;

    const events = [
      { type: "tool.started", toolName: "bash", taskId: "task_1" },
      {
        type: "approval.requested",
        toolName: "bash",
        taskId: "task_1",
      },
      {
        type: "query.retrying",
        role: "coder",
        turn: 1,
        attempt: 1,
        reason: "network-failure",
      },
      { type: "message.delta", role: "reviewer", delta: "done" },
    ] as const;

    for (const event of events) {
      updateRuntimeEventDigest(digest, event);
      startedRendering = renderSessionQueryEventSurface({
        renderer,
        event,
        digest,
        printMode: false,
        viewMode: "compact",
        startedRendering,
      }).startedRendering;
    }

    expect(renderedLines).toContain(
      "\nWorking through a temporary provider retry...",
    );
    expect(renderedLines).toContain("\nAssistant:");
    expect(renderedChunks).toEqual(["done"]);

    renderExecutionSummaryBlock(renderer, digest, "minimal");
    expect(renderedLines).toContain("\nExecution summary");
    expect(renderedLines).toContain("- Actions: bash (1 run)");
    expect(renderedLines).toContain("- Approvals: 0/1 approved");
    expect(renderedLines).toContain("- Provider retries: 1");
  });

  it("accumulates terminal status and renders stopped result surface from terminal facade", () => {
    const terminalState = createSessionTerminalState();
    applyTerminalQueryEvent(terminalState, {
      type: "query.completed",
      result: {
        status: "stopped_error",
        terminalReason: "stopped_error",
        terminalClassification: "stopped",
        stopReason: "npm test failed with exit code 1",
        transcript: [],
        sharedContext: {
          sessionId: "sess_boundary",
          initialPrompt: "edit and verify",
          notes: [],
          handoffs: [],
        },
        finalOutput: "partial result",
        codingResult: {
          taskKind: "edit-file",
          changedFiles: ["notes.txt"],
          failedFiles: [],
          patches: [],
          repair: {
            status: "not-needed",
            attempts: 0,
            recoveredItems: [],
            failedItems: [],
            notes: [],
          },
          continuation: {
            status: "first-pass-success",
            attempts: 0,
            evidence: [],
          },
          changeSet: {
            gitAware: false,
            preExistingDirtyFiles: [],
            postRunDirtyFiles: ["notes.txt"],
            attemptedFiles: ["notes.txt"],
            changedFiles: ["notes.txt"],
            unchangedAttemptedFiles: [],
          },
          taskSatisfaction: {
            verdict: "insufficient-evidence",
            reasons: ["Verification failed after edit."],
            requiredEvidence: ["changed-files", "verification"],
            observedEvidence: ["changed-files:notes.txt"],
          },
          verifiedFiles: [],
          unverifiedFiles: [
            {
              path: "notes.txt",
              reason: "npm test failed with exit code 1",
            },
          ],
          verification: {
            status: "failed",
            command: "npm test -- --help",
            reason: "npm test failed with exit code 1",
          },
          evidence: [],
        },
      },
    });

    expect(terminalState.sawTerminalEvent).toBe(true);
    expect(terminalState.terminalStatus).toBe("stopped_error");
    expect(terminalState.terminalClassification).toBe("stopped");

    const renderedLines: string[] = [];
    renderSessionTerminalSurface({
      renderer: {
        renderLine(line: string) {
          renderedLines.push(line);
        },
        renderChunk() {},
      },
      terminalState,
      eventDigest: createRuntimeEventDigest(),
      printMode: false,
      viewMode: "compact",
      startedRendering: false,
    });

    expect(renderedLines).toContain("Result");
    expect(renderedLines).toContain("- Outcome: stopped");
    expect(renderedLines).toContain("- BlockerKind: verification-failed");
    expect(renderedLines).toContain("Action result");
    expect(renderedLines).toContain("- Changed: 1 file(s)");
    expect(renderedLines).toContain("- Verification: failed");
    expect(renderedLines).toContain("Next steps");
  });

  it("renders shared Result Surface blocker details for provider browser and edit markers", () => {
    const scenarios = [
      {
        name: "provider",
        reason:
          "Provider readiness failed (provider-readiness:missing-key): provider key is missing.",
        evidence: ["provider-readiness:missing-key"],
        expectedKind: "provider-not-configured",
        expectedDoNext: "approved readiness path",
      },
      {
        name: "provider opt-in",
        reason: "real-provider opt-in required before using live credentials",
        evidence: ["actionable-blocker-kind:provider-opt-in-required"],
        expectedKind: "provider-opt-in-required",
        expectedDoNext: "explicit real-provider opt-in gate",
      },
      {
        name: "provider unsupported",
        reason:
          "Provider readiness failed (provider-readiness:unsupported-provider): unsupported provider mode.",
        evidence: ["provider-readiness:unsupported-provider"],
        expectedKind: "provider-unsupported",
        expectedDoNext: "supported provider/model mode",
      },
      {
        name: "browser unavailable",
        reason: "runtime-package-missing: direct Playwright runtime disabled",
        evidence: ["actionable-blocker-kind:browser-unavailable"],
        expectedKind: "browser-unavailable",
        expectedDoNext: "browser runtime status",
      },
      {
        name: "browser policy",
        reason: "policy-blocked: public web automation is blocked",
        evidence: ["actionable-blocker-kind:browser-policy-blocked"],
        expectedKind: "browser-policy-blocked",
        expectedDoNext: "controlled local fixture",
      },
      {
        name: "browser cleanup",
        reason: "cleanup-failed after closing the controlled local fixture",
        evidence: [
          "actionable-blocker-kind:browser-cleanup-failed",
          "browser-dom:<html>token=secret document.cookie</html>",
        ],
        expectedKind: "browser-cleanup-failed",
        expectedDoNext: "cleanup failure",
      },
      {
        name: "browser timeout",
        reason: "navigation-timeout while waiting for controlled fixture",
        evidence: ["actionable-blocker-kind:browser-timeout"],
        expectedKind: "browser-timeout",
        expectedDoNext: "narrower target",
      },
      {
        name: "edit missing content",
        reason:
          "edit-patch-content-or-transform-missing: concrete content or exact mapping is missing.",
        evidence: ["actionable-blocker-kind:patch-content-missing"],
        expectedKind: "patch-content-missing",
        expectedDoNext: "concrete content",
      },
      {
        name: "edit stale read",
        reason: "stale-read: target changed since it was read",
        evidence: ["actionable-blocker-kind:stale-read"],
        expectedKind: "stale-read",
        expectedDoNext: "Re-read the latest target file content",
      },
      {
        name: "unsupported future edit",
        reason:
          "Edit/Patch module produced a preview-only future edit plan; execution is not enabled.",
        evidence: ["actionable-blocker-kind:unsupported-future-edit"],
        expectedKind: "unsupported-future-edit",
        expectedDoNext: "preview/planning",
      },
    ] as const;

    for (const scenario of scenarios) {
      const rendered = renderTerminalFor({
        stopReason: scenario.reason,
        terminalClassification: "stopped",
        codingResult: buildBoundaryCodingResult({
          reason: scenario.reason,
          verificationStatus: "blocked",
          evidence: scenario.evidence,
        }),
      });

      expect(rendered, scenario.name).toContain("- Outcome: stopped");
      expect(rendered, scenario.name).toContain(
        `- BlockerKind: ${scenario.expectedKind}`,
      );
      expect(rendered.join("\n"), scenario.name).toContain(
        scenario.expectedDoNext,
      );
      expect(rendered.join("\n"), scenario.name).not.toContain(
        "/home/wang/.private-agents-real",
      );
      expect(rendered.join("\n"), scenario.name).not.toContain("<html>");
      expect(rendered.join("\n"), scenario.name).not.toContain(
        "document.cookie",
      );
    }
  });

  it("keeps unknown failures and completed paths out of actionable blocker detail rendering", () => {
    const unknown = renderTerminalFor({
      stopReason: "unexpected adapter exception failed after execution",
      terminalClassification: "error",
      codingResult: undefined,
    });
    expect(unknown).toContain("- Outcome: error");
    expect(unknown.some((line) => line.includes("BlockerKind"))).toBe(false);

    const completed = renderTerminalFor({
      status: "completed",
      terminalReason: "completed",
      terminalClassification: "success",
      stopReason: undefined,
      codingResult: buildBoundaryCodingResult({
        reason: "completed",
        verificationStatus: "passed",
        evidence: [],
      }),
    });
    expect(completed).toContain("- Outcome: success");
    expect(completed.some((line) => line.includes("BlockerKind"))).toBe(false);
  });

  it("renders approval-denied compact reason and do-next without collapsing them", () => {
    const rendered = renderTerminalFor({
      stopReason: "Re-run and approve escalation for verify command execution.",
      terminalClassification: "stopped",
      codingResult: buildBoundaryCodingResult({
        reason: "Approval denied by user for bash",
        verificationStatus: "blocked",
        evidence: ["actionable-blocker-kind:approval-denied"],
        nextAction: "Re-run and approve escalation for verify command execution.",
      }),
    });

    expect(rendered).toContain("- BlockerKind: approval-denied");
    expect(rendered).toContain("- Reason: Approval denied by user for bash");
    expect(rendered).toContain(
      "- DoNext: Re-run and approve escalation for verify command execution.",
    );
  });

  it("renders context and agent-plan parity details from safe result evidence", () => {
    const rendered = renderTerminalFor({
      stopReason: "Read the suggested candidates before planning mutation.",
      terminalClassification: "stopped",
      codingResult: buildBoundaryCodingResult({
        reason: "Context packet needs more related reads before planning.",
        verificationStatus: "blocked",
        evidence: [
          "context-packet ctx_abc; target=src/target.ts; included=2; omitted=1; mutationAuthority=not-granted; raw-full-content-excluded",
          "agent-plan plan_abc; readiness=needs-more-context; confidence=medium; missingFacts=1; suggestedReads=1; mutationAuthority=not-granted; redaction=redacted-and-budgeted",
          "actionable-blocker-kind:unsupported-future-edit",
        ],
        nextAction: "Read the suggested candidates before planning mutation.",
      }),
    }).join("\n");

    expect(rendered).toContain("- Outcome: stopped");
    expect(rendered).toContain(
      "- Reason: Context packet needs more related reads before planning.",
    );
    expect(rendered).toContain(
      "- DoNext: Read the suggested candidates before planning mutation.",
    );
    expect(rendered).not.toContain("RAW_SECRET_FILE_CONTENT");
  });

  it("projects SessionManager persistence payloads without changing shape", () => {
    const completed = createSessionTerminalState();
    completed.finalOutput = "done";
    completed.terminalReason = "completed";
    completed.terminalClassification = "success";
    completed.lastContinuationReason = "handoff";

    expect(projectCompletedSessionSave(completed)).toEqual({
      terminalReason: "completed",
      terminalClassification: "success",
      lastContinuationReason: "handoff",
    });

    const stopped = createSessionTerminalState();
    stopped.terminalStatus = "stopped_error";
    stopped.terminalStopReason = "Retry budget exhausted";
    stopped.terminalReason = "stopped_error";
    stopped.terminalClassification = "stopped";
    expect(projectErrorSessionSave(stopped)).toEqual({
      error: "Retry budget exhausted",
      options: {
        terminalReason: "stopped_error",
        terminalClassification: "stopped",
        lastContinuationReason: undefined,
      },
    });
    expect(
      projectRuntimeFailureSessionSave({
        error: new Error("daemon panic"),
        lastContinuationReason: "retryable-error",
      }),
    ).toEqual({
      error: "daemon panic",
      options: {
        terminalReason: "stopped_error",
        terminalClassification: "error",
        lastContinuationReason: "retryable-error",
      },
    });
  });

  it("projects future-turn compact injection once and keeps raw evidence redacted", async () => {
    const compactCheckpointStore = createCompactLiveCheckpointStore({
      now: () => "2026-05-20T00:00:00.000Z",
      nextId: () => "checkpoint-boundary",
    });
    const compactInjectionStateStore = createCompactInjectionStateStore({
      now: () => "2026-05-20T00:00:00.000Z",
    });
    const compactResult = runCompactCommand({
      mode: "render",
      source: "route",
      generatedAt: "2026-05-20T00:00:00.000Z",
      routeInfo: {
        routeId: "156",
        name: "Session runtime boundary",
        nextAction: "Continue facade validation.",
      },
      taskGoal: {
        objective: "Prove future-turn facade redaction.",
      },
      mutationEvidence: {
        changedFiles: ["src/sessionRuntime.ts"],
        rawOriginalContent: "RAW_SECRET_FILE_CONTENT",
      },
      validationEvidence: {
        testsRun: ["sessionRuntimeBoundary.test.ts"],
        fullCommandOutput: "sk-secret-output",
      },
      secretValues: ["sk-secret-output"],
    });
    const checkpoint = updateLatestCompactCheckpoint(compactCheckpointStore, {
      sessionScopeId: "session:sess_future_boundary",
      sourceCommand: "/compact",
      result: compactResult,
    });
    compactInjectionStateStore.markPending({
      sessionScopeId: "session:sess_future_boundary",
      checkpointId: checkpoint.checkpointId,
      sourceCommand: "/compact",
    });

    const injectedPrompt = await buildPromptWithFutureTurnInjections({
      deps: {
        compactCheckpointStore,
        compactInjectionStateStore,
      },
      sessionId: "sess_future_boundary",
      prompt: "continue work",
    });
    const secondPrompt = await buildPromptWithFutureTurnInjections({
      deps: {
        compactCheckpointStore,
        compactInjectionStateStore,
      },
      sessionId: "sess_future_boundary",
      prompt: "continue again",
    });

    expect(injectedPrompt).toContain("<compact_v2_injected_context>");
    expect(injectedPrompt).toContain("<user_request>\ncontinue work");
    expect(injectedPrompt).not.toContain("RAW_SECRET_FILE_CONTENT");
    expect(injectedPrompt).not.toContain("sk-secret-output");
    expect(secondPrompt).toBe("continue again");
    expect(
      compactInjectionStateStore.get("session:sess_future_boundary"),
    ).toEqual(
      expect.objectContaining({
        injectionStatus: "consumed",
        injectionCount: 1,
      }),
    );
  });
});

function renderTerminalFor(input: {
  readonly status?: "completed" | "stopped_error";
  readonly terminalReason?: "completed" | "stopped_error";
  readonly terminalClassification: "success" | "stopped" | "error";
  readonly stopReason?: string;
  readonly codingResult?: ReturnType<typeof buildBoundaryCodingResult>;
}): string[] {
  const terminalState = createSessionTerminalState();
  applyTerminalQueryEvent(terminalState, {
    type: "query.completed",
    result: {
      status: input.status ?? "stopped_error",
      terminalReason: input.terminalReason ?? "stopped_error",
      terminalClassification: input.terminalClassification,
      stopReason: input.stopReason,
      transcript: [],
      sharedContext: {
        sessionId: "sess_blocker_parity",
        initialPrompt: "render terminal",
        notes: [],
        handoffs: [],
      },
      finalOutput: input.status === "completed" ? "done" : "",
      codingResult: input.codingResult,
    },
  });

  const renderedLines: string[] = [];
  renderSessionTerminalSurface({
    renderer: {
      renderLine(line: string) {
        renderedLines.push(line);
      },
      renderChunk() {},
    },
    terminalState,
    eventDigest: createRuntimeEventDigest(),
    printMode: false,
    viewMode: "compact",
    startedRendering: false,
  });
  return renderedLines;
}

function buildBoundaryCodingResult(input: {
  readonly reason: string;
  readonly verificationStatus: "passed" | "failed" | "blocked";
  readonly evidence: readonly string[];
  readonly nextAction?: string;
}) {
  return {
    taskKind: "edit-file",
    changedFiles: [],
    failedFiles:
      input.verificationStatus === "passed"
        ? []
        : [{ path: "(capability)", reason: input.reason }],
    patches: [],
    repair: {
      status: "not-needed",
      attempts: 0,
      recoveredItems: [],
      failedItems: [],
      notes: [],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 0,
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
      verdict:
        input.verificationStatus === "passed"
          ? "satisfied"
          : "insufficient-evidence",
      reasons: input.verificationStatus === "passed" ? [] : [input.reason],
      requiredEvidence: ["terminal blocker detail"],
      observedEvidence: input.evidence,
    },
    verifiedFiles: [],
    unverifiedFiles: [],
    verification: {
      status: input.verificationStatus,
      reason: input.reason,
      ...(input.nextAction ? { nextAction: input.nextAction } : {}),
    },
    evidence: input.evidence,
  } as const;
}
