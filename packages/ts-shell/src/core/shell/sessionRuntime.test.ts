import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SessionManager } from "../../session/SessionManager.js";
import { ShellSessionRuntime } from "./sessionRuntime.js";

describe("shell session runtime (W5)", () => {
  it("moves through a successful prompt execution lifecycle", async () => {
    const calls: string[] = [];
    const runtime = new ShellSessionRuntime({
      sessionManager: {
        markRunStarted(sessionId: string, prompt: string) {
          calls.push(`started:${sessionId}:${prompt}`);
        },
        persistUserPromptBarrier(sessionId: string, prompt: string) {
          calls.push(`barrier:${sessionId}:${prompt}`);
        },
        markTurnActive(_sessionId: string) {},
        appendQueryEvent(_sessionId: string, _event: unknown) {},
        addTurn(sessionId: string, turn: { role: string; content: string }) {
          calls.push(`turn:${sessionId}:${turn.role}:${turn.content}`);
        },
        saveCompleted(sessionId: string) {
          calls.push(`completed:${sessionId}`);
        },
        saveInterrupted(sessionId: string) {
          calls.push(`interrupted:${sessionId}`);
        },
        saveError(sessionId: string, error: string) {
          calls.push(`error:${sessionId}:${error}`);
        },
        saveTerminated(sessionId: string) {
          calls.push(`terminated:${sessionId}`);
        },
      } as never,
      renderer: {
        renderLine() {},
        renderChunk() {},
      } as never,
      runPrompt: async function* (prompt) {
        yield { type: "message.delta", role: "reviewer", delta: "partial " };
        yield {
          type: "query.completed",
          result: {
            status: "completed",
            terminalReason: "completed",
            terminalClassification: "success",
            transcript: [],
            sharedContext: {
              sessionId: "sess_1",
              initialPrompt: prompt,
              notes: [],
              handoffs: [],
            },
            finalOutput: `done:${prompt}`,
          },
        };
      },
    });

    const output = await runtime.executePrompt("sess_1", "hello");
    expect(output).toBe("done:hello");
    expect(runtime.getState()).toBe("idle");
    expect(calls).toEqual([
      "barrier:sess_1:hello",
      "turn:sess_1:assistant:done:hello",
      "completed:sess_1",
    ]);
  });

  it("builds follow-up continuity context before persisting the current prompt barrier", async () => {
    const calls: string[] = [];
    const runtime = new ShellSessionRuntime({
      sessionManager: {
        buildPromptContinuitySnapshot(sessionId: string, prompt: string) {
          calls.push(`continuity:${sessionId}:${prompt}`);
          return {
            projectRoot: "D:/Test/continuity",
            trustBoundary: "session-boundary",
            sessionFocusSummary: "recent-target-files: ./continuity_demo.py",
          };
        },
        markRunStarted() {},
        persistUserPromptBarrier(sessionId: string, prompt: string) {
          calls.push(`barrier:${sessionId}:${prompt}`);
        },
        markTurnActive() {},
        appendQueryEvent() {},
        addTurn(sessionId: string, turn: { role: string; content: string }) {
          calls.push(`turn:${sessionId}:${turn.role}:${turn.content}`);
        },
        saveCompleted(sessionId: string) {
          calls.push(`completed:${sessionId}`);
        },
        saveInterrupted() {},
        saveError() {},
        saveTerminated() {},
      } as never,
      renderer: {
        renderLine() {},
        renderChunk() {},
      } as never,
      runPrompt: async function* () {
        yield {
          type: "query.completed",
          result: {
            status: "completed",
            terminalReason: "completed",
            terminalClassification: "success",
            transcript: [],
            sharedContext: {
              sessionId: "sess_followup",
              initialPrompt: "continue previous issue and read first 2 lines",
              notes: [],
              handoffs: [],
            },
            finalOutput: "ok",
          },
        };
      },
    });

    const output = await runtime.executePrompt(
      "sess_followup",
      "continue previous issue and read first 2 lines",
    );

    expect(output).toBe("ok");
    expect(calls.slice(0, 2)).toEqual([
      "continuity:sess_followup:continue previous issue and read first 2 lines",
      "barrier:sess_followup:continue previous issue and read first 2 lines",
    ]);
  });

  it("uses compact mode by default and only prints final assistant output", async () => {
    const renderedLines: string[] = [];
    const renderedChunks: string[] = [];

    const runtime = new ShellSessionRuntime({
      sessionManager: {
        markRunStarted() {},
        persistUserPromptBarrier() {},
        markTurnActive() {},
        appendQueryEvent() {},
        addTurn() {},
        saveCompleted() {},
        saveInterrupted() {},
        saveError() {},
        saveTerminated() {},
      } as never,
      renderer: {
        renderLine(line: string) {
          renderedLines.push(line);
        },
        renderChunk(chunk: string) {
          renderedChunks.push(chunk);
        },
      } as never,
      runPrompt: async function* () {
        yield { type: "mcp.snapshot", clients: 0, tools: 0 };
        yield { type: "tool.started", toolName: "bash", taskId: "task_1" };
        yield {
          type: "approval.requested",
          toolName: "bash",
          taskId: "task_1",
        };
        yield {
          type: "query.retrying",
          role: "coder",
          turn: 1,
          attempt: 1,
          reason: "network-failure",
        };
        yield { type: "message.delta", role: "reviewer", delta: "final answer" };
        yield {
          type: "query.completed",
          result: {
            status: "completed",
            terminalReason: "completed",
            terminalClassification: "success",
            transcript: [],
            sharedContext: {
              sessionId: "sess_compact",
              initialPrompt: "hello",
              notes: [],
              handoffs: [],
            },
            finalOutput: "final answer",
            codingResult: {
              taskKind: "edit-file",
              changedFiles: ["src/app.ts"],
              failedFiles: [],
              patches: [
                {
                  path: "src/app.ts",
                  operation: "replace",
                  status: "applied",
                  changedLines: 2,
                  addedLines: 1,
                  removedLines: 1,
                },
              ],
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
                gitAware: true,
                preExistingDirtyFiles: ["src/legacy.ts"],
                postRunDirtyFiles: ["src/legacy.ts", "src/app.ts"],
                attemptedFiles: ["src/app.ts"],
                changedFiles: ["src/app.ts"],
                unchangedAttemptedFiles: [],
              },
              taskSatisfaction: {
                verdict: "satisfied",
                reasons: [],
                requiredEvidence: ["changed-files"],
                observedEvidence: ["verify=passed(node --version)"],
              },
              verifiedFiles: ["src/app.ts"],
              unverifiedFiles: [],
              verification: {
                status: "passed",
                command: "node --version",
                reason: "verify request mapped to allowlisted command",
              },
              evidence: ["readback:export const ok = true;"],
            },
          },
        };
      },
    });

    await runtime.executePrompt("sess_compact", "hello");

    expect(runtime.getViewMode()).toBe("compact");
    expect(renderedChunks).toEqual(["final answer"]);
    expect(renderedLines).toContain("\nAssistant:");
    expect(renderedLines).not.toContain("final answer");
    expect(
      renderedLines.some((line) => line.includes("[tool:start]")),
    ).toBe(false);
    expect(
      renderedLines.some((line) => line.includes("[approval] requested")),
    ).toBe(false);
    expect(
      renderedLines.some((line) => line.includes("[query:retry]")),
    ).toBe(false);
    expect(
      renderedLines.some((line) =>
        line.includes("Working through a temporary provider retry"),
      ),
    ).toBe(true);
    expect(
      renderedLines.some((line) =>
        line.includes("Execution summary"),
      ),
    ).toBe(true);
    expect(
      renderedLines.some((line) =>
        line.includes("- Actions: bash (1 run)"),
      ),
    ).toBe(true);
    expect(
      renderedLines.some((line) =>
        line.includes("- Approvals: 0/1 approved"),
      ),
    ).toBe(true);
    expect(renderedLines).toContain("Result");
    expect(
      renderedLines.some((line) => line.includes("- Outcome: success")),
    ).toBe(true);
    expect(renderedLines).toContain("Action result");
    expect(
      renderedLines.some((line) => line.includes("- Changed: 1 file(s)")),
    ).toBe(true);
    expect(
      renderedLines.some((line) => line.includes("- Verification: passed")),
    ).toBe(true);
  });

  it("prints streaming details in verbose mode", async () => {
    const renderedLines: string[] = [];
    const renderedChunks: string[] = [];

    const runtime = new ShellSessionRuntime({
      sessionManager: {
        markRunStarted() {},
        persistUserPromptBarrier() {},
        markTurnActive() {},
        appendQueryEvent() {},
        addTurn() {},
        saveCompleted() {},
        saveInterrupted() {},
        saveError() {},
        saveTerminated() {},
      } as never,
      renderer: {
        renderLine(line: string) {
          renderedLines.push(line);
        },
        renderChunk(chunk: string) {
          renderedChunks.push(chunk);
        },
      } as never,
      runPrompt: async function* () {
        yield { type: "tool.started", toolName: "bash", taskId: "task_2" };
        yield {
          type: "query.retrying",
          role: "coder",
          turn: 1,
          attempt: 1,
          reason: "network-failure",
        };
        yield { type: "message.delta", role: "reviewer", delta: "hello " };
        yield {
          type: "query.completed",
          result: {
            status: "completed",
            terminalReason: "completed",
            terminalClassification: "success",
            transcript: [],
            sharedContext: {
              sessionId: "sess_verbose",
              initialPrompt: "hello",
              notes: [],
              handoffs: [],
            },
            finalOutput: "final answer",
          },
        };
      },
    });

    runtime.setViewMode("verbose");
    await runtime.executePrompt("sess_verbose", "hello");

    expect(renderedChunks).toEqual(["hello "]);
    expect(
      renderedLines.some((line) => line.includes("[tool:start] bash")),
    ).toBe(true);
    expect(
      renderedLines.some((line) => line.includes("[query:retry] role=coder")),
    ).toBe(true);
    expect(
      renderedLines.some((line) => line.includes("[tool:start] bash")),
    ).toBe(true);
    expect(
      renderedLines.some((line) => line.includes("Execution trace summary")),
    ).toBe(true);
    expect(renderedLines).toContain("Final result");
    expect(renderedLines).toContain("\nAssistant:");
  });

  it("does not persist prompt barrier again for resumed runs with a non-fresh runtime seed", async () => {
    const calls: string[] = [];
    const runtime = new ShellSessionRuntime({
      sessionManager: {
        markRunStarted() {},
        persistUserPromptBarrier(sessionId: string, prompt: string) {
          calls.push(`barrier:${sessionId}:${prompt}`);
        },
        markRecoveryReentry(sessionId: string, boundary: string) {
          calls.push(`reentry:${sessionId}:${boundary}`);
        },
        markTurnActive() {},
        appendQueryEvent() {},
        addTurn(sessionId: string, turn: { role: string; content: string }) {
          calls.push(`turn:${sessionId}:${turn.role}:${turn.content}`);
        },
        saveCompleted(sessionId: string) {
          calls.push(`completed:${sessionId}`);
        },
        saveInterrupted() {},
        saveError() {},
        saveTerminated() {},
      } as never,
      renderer: {
        renderLine() {},
        renderChunk() {},
      } as never,
      runPrompt: async function* (prompt) {
        yield {
          type: "query.completed",
          result: {
            status: "completed",
            terminalReason: "completed",
            terminalClassification: "success",
            transcript: [],
            sharedContext: {
              sessionId: "sess_resume",
              initialPrompt: prompt,
              notes: [],
              handoffs: [],
            },
            finalOutput: `done:${prompt}`,
          },
        };
      },
    });

    const output = await runtime.executePrompt("sess_resume", "resume me", {
      runtimeSeed: {
        config: {
          sessionId: "sess_resume",
          initialPrompt: "resume me",
          maxTurns: 6,
          startingRole: "planner",
        },
        currentRole: "coder",
        turn: 2,
        pendingLifecycle: {
          pendingApprovals: {},
          pendingTools: {},
          taskStates: {},
        },
        recoveryBoundary: "mid-turn-reentry",
        truthBoundary: {
          source: "durable-replay",
          normalizedEventCount: 0,
          pairedTurnCount: 1,
          policyEvidence: new Set(["open-turn"]),
          repairSummary: {
            insertedPromptMessage: false,
            insertedQueryStarted: false,
            strippedInterruptedTerminalEvents: 0,
            insertedRunInterrupted: false,
            ignoredDuplicateTurnStarts: 0,
            ignoredUnpairedTurnCompletions: 0,
            ignoredRoleMismatchedTurnCompletions: 0,
          },
          continuationSafety: "mid-turn-safe",
          openTurn: { role: "coder", turn: 2 },
        },
        derivedState: { transcript: [] },
      },
    });

    expect(output).toBe("done:resume me");
    expect(calls).toEqual([
      "reentry:sess_resume:mid-turn-reentry",
      "turn:sess_resume:assistant:done:resume me",
      "completed:sess_resume",
    ]);
  });

  it("maps non-completed terminal query results to session error state", async () => {
    const calls: string[] = [];
    const renderedLines: string[] = [];
    const runtime = new ShellSessionRuntime({
      sessionManager: {
        markRunStarted() {},
        persistUserPromptBarrier(sessionId: string, prompt: string) {
          calls.push(`barrier:${sessionId}:${prompt}`);
        },
        markTurnActive() {},
        appendQueryEvent() {},
        addTurn(sessionId: string, turn: { role: string; content: string }) {
          calls.push(`turn:${sessionId}:${turn.role}:${turn.content}`);
        },
        saveCompleted(sessionId: string) {
          calls.push(`completed:${sessionId}`);
        },
        saveInterrupted(sessionId: string) {
          calls.push(`interrupted:${sessionId}`);
        },
        saveError(sessionId: string, error: string) {
          calls.push(`error:${sessionId}:${error}`);
        },
        saveTerminated() {},
      } as never,
      renderer: {
        renderLine(line: string) {
          renderedLines.push(line);
        },
        renderChunk() {},
      } as never,
      runPrompt: async function* () {
        yield {
          type: "query.completed",
          result: {
            status: "stopped_error",
            terminalReason: "stopped_error",
            terminalClassification: "stopped",
            stopReason: "Retry budget exhausted",
            transcript: [],
            sharedContext: {
              sessionId: "sess_stop",
              initialPrompt: "hello",
              notes: [],
              handoffs: [],
            },
            finalOutput: "partial result",
          },
        };
      },
    });

    const output = await runtime.executePrompt("sess_stop", "hello");

    expect(output).toBe("partial result");
    expect(calls).toEqual([
      "barrier:sess_stop:hello",
      "turn:sess_stop:assistant:partial result",
      "error:sess_stop:Retry budget exhausted",
    ]);
    expect(
      renderedLines.some((line) =>
        line.includes("- Detail: Retry budget exhausted"),
      ),
    ).toBe(true);
    expect(renderedLines).toContain("Next steps");
  });

  it("prints actionable hint when real provider key is missing", async () => {
    const renderedLines: string[] = [];
    const runtime = new ShellSessionRuntime({
      sessionManager: {
        markRunStarted() {},
        persistUserPromptBarrier() {},
        markTurnActive() {},
        appendQueryEvent() {},
        addTurn() {},
        saveCompleted() {},
        saveInterrupted() {},
        saveError() {},
        saveTerminated() {},
      } as never,
      renderer: {
        renderLine(line: string) {
          renderedLines.push(line);
        },
        renderChunk() {},
      } as never,
      runPrompt: async function* () {
        yield {
          type: "query.completed",
          result: {
            status: "stopped_error",
            terminalReason: "stopped_error",
            terminalClassification: "error",
            stopReason:
              "OPENAI_API_KEY is required for the real provider path. Set it before running the CLI.",
            transcript: [],
            sharedContext: {
              sessionId: "sess_provider",
              initialPrompt: "hello",
              notes: [],
              handoffs: [],
            },
            finalOutput: "",
          },
        };
      },
    });

    await runtime.executePrompt("sess_provider", "hello");

    expect(
      renderedLines.some((line) =>
        line.includes(
          "- Detail: OPENAI_API_KEY is required for the real provider path",
        ),
      ),
    ).toBe(true);
    expect(renderedLines).toContain(
      "- Configure credential via /connect set <provider> <api-key> (or export env var).",
    );
  });

  it("prints actionable allowlist block guidance for non-allowlisted command intent", async () => {
    const renderedLines: string[] = [];
    const calls: string[] = [];
    const blockedReason =
      "Run-command intent is not allowed in the MVP allowlist: npm publish Allowed commands: node --version, npm test -- --help, npm run build -- --help Please rephrase your request to one of the allowed command intents.";

    const runtime = new ShellSessionRuntime({
      sessionManager: {
        markRunStarted() {},
        persistUserPromptBarrier(sessionId: string, prompt: string) {
          calls.push(`barrier:${sessionId}:${prompt}`);
        },
        markTurnActive() {},
        appendQueryEvent() {},
        addTurn() {},
        saveCompleted() {},
        saveInterrupted() {},
        saveError(sessionId: string, error: string) {
          calls.push(`error:${sessionId}:${error}`);
        },
        saveTerminated() {},
      } as never,
      renderer: {
        renderLine(line: string) {
          renderedLines.push(line);
        },
        renderChunk() {},
      } as never,
      runPrompt: async function* () {
        yield {
          type: "query.completed",
          result: {
            status: "stopped_error",
            terminalReason: "stopped_error",
            terminalClassification: "error",
            stopReason: blockedReason,
            transcript: [],
            sharedContext: {
              sessionId: "sess_blocked",
              initialPrompt: "please publish this package",
              notes: [],
              handoffs: [],
            },
            finalOutput: "",
          },
        };
      },
    });

    await runtime.executePrompt("sess_blocked", "please publish this package");

    expect(
      renderedLines.some((line) =>
        line.includes("Run-command intent is not allowed in the MVP allowlist"),
      ),
    ).toBe(true);
    expect(renderedLines).toContain("Next steps");
    expect(renderedLines).toContain(
      "- Run-command intent was blocked by the MVP allowlist.",
    );
    expect(renderedLines).toContain(
      "- Allowed commands: node --version, npm test -- --help, npm run build -- --help",
    );
    expect(renderedLines).toContain(
      '- Rephrase with one allowed command, for example: "Run node --version".',
    );
    expect(calls).toContain(`error:sess_blocked:${blockedReason}`);
  });

  it("prints actionable hints for provider readiness auth/network failures and keeps error persistence", async () => {
    for (const scenario of [
      {
        sessionId: "sess_provider_auth",
        stopReason:
          "Provider readiness failed (provider-readiness:auth): OpenAI authentication was rejected (401/403). Verify OPENAI_API_KEY validity and access scope, then retry.",
        expectedHint:
          "Hint: check provider API key validity/permissions, then submit another prompt.",
      },
      {
        sessionId: "sess_provider_network",
        stopReason:
          "Provider readiness failed (provider-readiness:network): Unable to reach the OpenAI endpoint. Check network/proxy/firewall settings and retry.",
        expectedHint:
          "Hint: check network/proxy/firewall reachability to the provider endpoint, then submit another prompt.",
      },
    ]) {
      const renderedLines: string[] = [];
      const calls: string[] = [];

      const runtime = new ShellSessionRuntime({
        sessionManager: {
          markRunStarted() {},
          persistUserPromptBarrier(sessionId: string, prompt: string) {
            calls.push(`barrier:${sessionId}:${prompt}`);
          },
          markTurnActive() {},
          appendQueryEvent() {},
          addTurn() {},
          saveCompleted() {},
          saveInterrupted() {},
          saveError(sessionId: string, error: string) {
            calls.push(`error:${sessionId}:${error}`);
          },
          saveTerminated() {},
        } as never,
        renderer: {
          renderLine(line: string) {
            renderedLines.push(line);
          },
          renderChunk() {},
        } as never,
        runPrompt: async function* () {
          yield {
            type: "query.completed",
            result: {
              status: "stopped_error",
              terminalReason: "stopped_error",
              terminalClassification: "error",
              stopReason: scenario.stopReason,
              transcript: [],
              sharedContext: {
                sessionId: scenario.sessionId,
                initialPrompt: "run real task",
                notes: [],
                handoffs: [],
              },
              finalOutput: "",
            },
          };
        },
      });

      await runtime.executePrompt(scenario.sessionId, "run real task");

      expect(
        renderedLines.some((line) =>
          line.includes("- Detail: Provider readiness failed"),
        ),
      ).toBe(true);
      const expectedHintCore = scenario.expectedHint
        .replace(/^Hint:\s*/i, "")
        .replace(/, then submit another prompt\.$/i, "")
        .toLowerCase();
      expect(
        renderedLines.some((line) =>
          line.toLowerCase().includes(expectedHintCore),
        ),
      ).toBe(true);
      expect(calls).toContain(
        `error:${scenario.sessionId}:${scenario.stopReason}`,
      );
    }
  });

  it("marks interrupted state when aborted", async () => {
    const calls: string[] = [];
    const runtime = new ShellSessionRuntime({
      sessionManager: {
        markRunStarted() {},
        persistUserPromptBarrier() {},
        markTurnActive() {},
        appendQueryEvent() {},
        addTurn() {},
        saveCompleted() {},
        saveInterrupted(sessionId: string) {
          calls.push(`interrupted:${sessionId}`);
        },
        saveError() {},
        saveTerminated() {},
      } as never,
      renderer: {
        renderLine() {},
        renderChunk() {},
      } as never,
      runPrompt: async function* (_prompt, signal) {
        runtime.cancelCurrentRun();
        if (signal.aborted) {
          throw new Error("Aborted");
        }
        yield {
          type: "query.completed",
          result: {
            status: "completed",
            terminalReason: "completed",
            terminalClassification: "success",
            transcript: [],
            sharedContext: {
              sessionId: "sess_abort",
              initialPrompt: "stop",
              notes: [],
              handoffs: [],
            },
            finalOutput: "never",
          },
        };
      },
    });

    await expect(runtime.executePrompt("sess_abort", "stop")).rejects.toThrow(
      "Aborted",
    );
    expect(runtime.getState()).toBe("interrupted");
    expect(calls).toEqual(["interrupted:sess_abort"]);
  });

  it("terminates independently from prompt execution lifecycle", () => {
    const calls: string[] = [];
    const runtime = new ShellSessionRuntime({
      sessionManager: {
        markRunStarted() {},
        persistUserPromptBarrier() {},
        markTurnActive() {},
        appendQueryEvent() {},
        addTurn() {},
        saveCompleted() {},
        saveInterrupted() {},
        saveError() {},
        saveTerminated(sessionId: string) {
          calls.push(`terminated:${sessionId}`);
        },
      } as never,
      renderer: {
        renderLine() {},
        renderChunk() {},
      } as never,
      runPrompt: async function* (prompt) {
        yield {
          type: "query.completed",
          result: {
            status: "completed",
            terminalReason: "completed",
            terminalClassification: "success",
            transcript: [],
            sharedContext: {
              sessionId: "sess_term",
              initialPrompt: prompt,
              notes: [],
              handoffs: [],
            },
            finalOutput: prompt,
          },
        };
      },
    });

    runtime.terminate("sess_term");
    expect(runtime.getState()).toBe("terminated");
    expect(calls).toEqual(["terminated:sess_term"]);
  });

  it("records interrupted prompt vs interrupted turn differently", async () => {
    const originalUserProfile = process.env.USERPROFILE;
    const fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "private-agents-interrupt-kind-"),
    );
    process.env.USERPROFILE = fakeHome;

    try {
      const manager = new SessionManager();
      const session = manager.createNew();

      const promptInterruptedRuntime = new ShellSessionRuntime({
        sessionManager: manager,
        renderer: { renderLine() {}, renderChunk() {} } as never,
        runPrompt: async function* (_prompt, signal) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          for await (const event of [] as import("../query/events.js").QueryEvent[]) {
            yield event;
          }
          if (signal.aborted) {
            throw new Error("Aborted");
          }
          throw new Error("Aborted");
        },
      });

      const promptRun = promptInterruptedRuntime.executePrompt(
        session.id,
        "prompt-only",
      );
      promptInterruptedRuntime.cancelCurrentRun();
      await expect(promptRun).rejects.toThrow();
      let snapshot = manager.getRecoverySnapshot(session.id);
      expect(snapshot.interruptedKind).toBe("prompt");

      const resumed = manager.resume(session.id);
      const turnInterruptedRuntime = new ShellSessionRuntime({
        sessionManager: manager,
        renderer: { renderLine() {}, renderChunk() {} } as never,
        runPrompt: async function* (_prompt, signal) {
          yield {
            type: "query.started",
            sessionId: resumed.id,
            prompt: "turn-phase",
          };
          turnInterruptedRuntime.cancelCurrentRun();
          if (signal.aborted) {
            throw new Error("Aborted");
          }
          throw new Error("Aborted");
        },
      });

      await expect(
        turnInterruptedRuntime.executePrompt(resumed.id, "turn-phase"),
      ).rejects.toThrow();
      snapshot = manager.getRecoverySnapshot(resumed.id);
      expect(snapshot.interruptedKind).toBe("turn");
    } finally {
      process.env.USERPROFILE = originalUserProfile;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("persists terminal classification from query.completed into state.json", async () => {
    const originalUserProfile = process.env.USERPROFILE;
    const originalHome = process.env.HOME;
    const fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "private-agents-terminal-state-"),
    );
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;

    try {
      const manager = new SessionManager();
      const session = manager.createNew();
      const runtime = new ShellSessionRuntime({
        sessionManager: manager,
        renderer: { renderLine() {}, renderChunk() {} } as never,
        runPrompt: async function* () {
          yield {
            type: "query.completed",
            result: {
              status: "stopped_error",
              terminalReason: "stopped_error",
              terminalClassification: "stopped",
              lastContinuationReason: "retryable-error",
              stopReason: "Retry budget exhausted",
              transcript: [],
              sharedContext: {
                sessionId: session.id,
                initialPrompt: "hello",
                notes: [],
                handoffs: [],
              },
              finalOutput: "partial result",
            },
          };
        },
      });

      await runtime.executePrompt(session.id, "hello");

      const statePath = path.join(
        manager.getSessionDirPath(session.id),
        "state.json",
      );
      const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
        status: string;
        terminalReason?: string;
        lastContinuationReason?: string;
        lastError?: string;
      };

      expect(state.status).toBe("error");
      expect(state.terminalReason).toBe("stopped_error");
      expect(state.lastContinuationReason).toBe("retryable-error");
      expect(state.lastError).toBeUndefined();
    } finally {
      process.env.USERPROFILE = originalUserProfile;
      process.env.HOME = originalHome;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("persists true error terminal envelope when query.failed is emitted", async () => {
    const originalUserProfile = process.env.USERPROFILE;
    const originalHome = process.env.HOME;
    const fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "private-agents-query-failed-state-"),
    );
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;

    try {
      const manager = new SessionManager();
      const session = manager.createNew();
      const runtime = new ShellSessionRuntime({
        sessionManager: manager,
        renderer: { renderLine() {}, renderChunk() {} } as never,
        runPrompt: async function* () {
          yield { type: "query.failed", error: "daemon panic" };
        },
      });

      await expect(runtime.executePrompt(session.id, "hello")).rejects.toThrow(
        "daemon panic",
      );

      const statePath = path.join(
        manager.getSessionDirPath(session.id),
        "state.json",
      );
      const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as {
        status: string;
        terminalReason?: string;
        terminalClassification?: string;
        lastError?: string;
      };

      expect(state.status).toBe("error");
      expect(state.terminalReason).toBe("stopped_error");
      expect(state.terminalClassification).toBe("error");
      expect(state.lastError).toBe("daemon panic");
    } finally {
      process.env.USERPROFILE = originalUserProfile;
      process.env.HOME = originalHome;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("fails defensively when the prompt stream ends without a terminal event", async () => {
    const calls: string[] = [];
    const runtime = new ShellSessionRuntime({
      sessionManager: {
        markRunStarted() {},
        persistUserPromptBarrier(sessionId: string, prompt: string) {
          calls.push(`barrier:${sessionId}:${prompt}`);
        },
        markTurnActive() {},
        appendQueryEvent() {},
        addTurn() {},
        saveCompleted(sessionId: string) {
          calls.push(`completed:${sessionId}`);
        },
        saveInterrupted() {},
        saveError(sessionId: string, error: string) {
          calls.push(`error:${sessionId}:${error}`);
        },
        saveTerminated() {},
      } as never,
      renderer: { renderLine() {}, renderChunk() {} } as never,
      runPrompt: async function* () {
        yield {
          type: "query.started",
          sessionId: "sess_missing_terminal",
          prompt: "hello",
        };
        yield { type: "turn.started", role: "planner", turn: 1 };
      },
    });

    await expect(
      runtime.executePrompt("sess_missing_terminal", "hello"),
    ).rejects.toThrow("Query runtime ended without a terminal event");
    expect(calls).toEqual([
      "barrier:sess_missing_terminal:hello",
      "error:sess_missing_terminal:Query runtime ended without a terminal event",
    ]);
  });
});
