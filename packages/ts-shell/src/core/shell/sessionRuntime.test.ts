import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createLongSessionContinuityFixture } from "../../test-utils/longSessionContinuityFixtures.js";
import { SessionManager } from "../../session/SessionManager.js";
import { seedWriterStartedStoppedRecoveryContextSession } from "../../test-utils/stoppedRecoveryFixture.js";
import { runCompactCommand } from "../../context/compact/command/compactCommandRunner.js";
import { createCompactInjectionStateStore } from "../../context/compact/injection/compactInjectionState.js";
import {
  createCompactLiveCheckpointStore,
  updateLatestCompactCheckpoint,
} from "../../context/compact/checkpoint/compactLiveCheckpoint.js";
import { createProjectMemoryInjectionStateStore } from "../../memory/projectMemoryInjectionState.js";
import { createProjectMemoryLocalStore } from "../../memory/projectMemoryLocalStore.js";
import { ShellSessionRuntime } from "./sessionRuntime.js";

describe("shell session runtime (W5)", () => {
  it('uses the configured agent default until the user explicitly chooses a mode', () => {
    let configured: 'plan' | 'build' = 'plan';
    const runtime = new ShellSessionRuntime({ configuredAgentMode: () => configured } as never);
    expect(runtime.getAgentMode()).toBe('plan');
    configured = 'build'; expect(runtime.getAgentMode()).toBe('build');
    runtime.setAgentMode('plan');
    expect(runtime.getAgentMode()).toBe('plan');
  });
  it.each([false, true])("publishes one cancellation terminal event after settlement (entered turn=%s)", async enteredTurn => {
    const recorded: unknown[] = [];
    const observed: unknown[] = [];
    const settled: string[] = [];
    const runtime = new ShellSessionRuntime({
      sessionManager: {
        persistUserPromptBarrier() {}, markTurnActive() {},
        appendQueryEvent(_id: string, event: unknown) { recorded.push(event); },
        saveInterrupted(_id: string, kind: string) { settled.push(kind); },
      } as never,
      renderer: { renderLine() {}, renderChunk() {} } as never,
      runPrompt: async function* () {
        if (enteredTurn) yield { type: "message.delta" as const, role: "coder" as const, delta: "partial" };
        runtime.cancelCurrentRun();
      },
    });
    runtime.observeEvents(event => {
      observed.push(event);
      if (event.type === "lifecycle.cancelled") {
        expect(settled).toEqual([enteredTurn ? "turn" : "prompt"]);
        expect(runtime.getState()).toBe("interrupted");
      }
    });
    await expect(runtime.executePrompt("cancelled", "request")).rejects.toThrow("without a terminal event");
    expect(observed).toEqual(recorded);
    expect(observed.at(-1)).toEqual({ type: "lifecycle.cancelled", reason: "AbortSignal triggered during shell session runtime" });
    expect(observed).toHaveLength(enteredTurn ? 2 : 1);
  });

  it.each([false, true])("keeps runtime failure attribution explicit (run exists=%s)", async (runExists) => {
    const recorded: unknown[] = [];
    const runtime = new ShellSessionRuntime({
      sessionManager: {
        persistUserPromptBarrier() {}, markTurnActive() {}, saveError() {},
        appendQueryEvent(_sessionId: string, _event: unknown, source: unknown) { recorded.push(source); },
      } as never,
      renderer: { renderLine() {}, renderChunk() {} } as never,
      runPrompt: () => {
        if (!runExists) throw new Error("setup failed before producer exists");
        return {
          sourceEntryId: () => "producing-message",
          events: (async function* () { yield { type: "query.failed" as const, error: "producer failed" }; })(),
        };
      },
    });
    await expect(runtime.executePrompt("session", "request")).rejects.toThrow(runExists ? "producer failed" : "setup failed");
    expect(recorded).toEqual(runExists
      ? [{ entryId: "producing-message" }, { entryId: "producing-message" }]
      : [{ entryId: undefined }]);
  });

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
      "completed:sess_1",
    ]);
  });

  it.each(["continue task", "next", "calculate 7 plus 3"])("injects compact context once and selects continuity from the raw request (%s)", async (firstPrompt) => {
    const calls: string[] = [];
    const promptsSeenByModel: string[] = [];
    const contextsSeenByModel: Array<string | undefined> = [];
    const compactCheckpointStore = createCompactLiveCheckpointStore({
      now: () => "2026-05-15T00:00:00.000Z",
      nextId: () => "checkpoint-runtime",
    });
    const compactInjectionStateStore = createCompactInjectionStateStore({
      now: () => "2026-05-15T00:00:00.000Z",
    });
    const compactResult = runCompactCommand({
      mode: "render",
      source: "route",
      generatedAt: "2026-05-15T00:00:00.000Z",
      routeInfo: {
        routeId: "78",
        name: "Compact v2 future-turn injection",
        nextAction: "Continue runtime integration.",
        forbiddenScope: ["provider/MCP", "SessionManager schema"],
      },
      taskGoal: {
        objective: "Inject compact context once.",
        constraints: ["no persistence"],
      },
      mutationEvidence: {
        changedFiles: ["src/changed.ts"],
        rawOriginalContent: "RAW_MUTATION_CONTENT",
      },
      recoverySummary: {
        recoveryAvailable: true,
        explicitRestoreAvailable: true,
        recoveryAuthorityId: "authority-runtime",
        rawOriginalContent: "RAW_RECOVERY_CONTENT",
      },
      validationEvidence: {
        testsRun: ["sessionRuntime.test.ts"],
        resultContractStatus: "passed",
        fullCommandOutput: "sk-secret-output",
      },
      secretValues: ["sk-secret-output"],
    });
    const checkpoint = updateLatestCompactCheckpoint(compactCheckpointStore, {
      sessionScopeId: "session:sess_runtime_compact",
      sourceCommand: "/compact",
      result: compactResult,
    });
    compactInjectionStateStore.markPending({
      sessionScopeId: "session:sess_runtime_compact",
      checkpointId: checkpoint.checkpointId,
      sourceCommand: "/compact",
    });
    const runtime = new ShellSessionRuntime({
      compactCheckpointStore,
      compactInjectionStateStore,
      sessionManager: {
        buildContinuitySnapshot() {
          return {
            sessionId: "sess_runtime_compact", projectRoot: process.cwd(), lastTaskKind: "edit-file",
            lastUserIntent: "inspect current.txt",
            lastWriteEffect: "unknown", lastWriteRequiresUserInspection: true,
            recentChangedFiles: [], recentTargetFiles: [], recentVerifiedFiles: [], recentFailedFiles: [],
            lastRepairNotes: [], lastContinuationEvidence: [], lastTaskSatisfactionReasons: [], unresolvedItems: [],
          };
        },
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
        saveError() {},
        saveTerminated() {},
      } as never,
      renderer: {
        renderLine() {},
        renderChunk() {},
      } as never,
      runPrompt: async function* (prompt, _signal, _seed, _snapshot, _attachments, context, accept) {
        accept?.();
        promptsSeenByModel.push(prompt);
        contextsSeenByModel.push(context);
        yield {
          type: "query.completed",
          result: {
            status: "completed",
            terminalReason: "completed",
            terminalClassification: "success",
            transcript: [],
            sharedContext: {
              sessionId: "sess_runtime_compact",
              initialPrompt: prompt,
              notes: [],
              handoffs: [],
            },
            finalOutput: "done",
          },
        };
      },
    });

    await runtime.executePrompt("sess_runtime_compact", firstPrompt);
    await runtime.executePrompt("sess_runtime_compact", "continue again");

    expect(calls).toEqual([
      `barrier:sess_runtime_compact:${firstPrompt}`,
      "completed:sess_runtime_compact",
      "barrier:sess_runtime_compact:continue again",
      "completed:sess_runtime_compact",
    ]);
    expect(promptsSeenByModel[0]).toContain("<compact_v2_injected_context>");
    expect(promptsSeenByModel[0]).toContain("authority-runtime");
    expect(promptsSeenByModel[0]).toContain("arbitrary-broad-apply-patch");
    expect(promptsSeenByModel[0]).toContain(`<user_request>\n${firstPrompt}`);
    expect(promptsSeenByModel[0]).toContain("Continue runtime integration.");
    if (firstPrompt === "continue task" || firstPrompt === "next") expect(contextsSeenByModel[0]).toContain("last-write-effect: unknown");
    else expect(contextsSeenByModel[0]).toBeUndefined();
    expect(contextsSeenByModel[1]).toContain("last-write-effect: unknown");
    expect(promptsSeenByModel[0]).not.toContain("RAW_MUTATION_CONTENT");
    expect(promptsSeenByModel[0]).not.toContain("RAW_RECOVERY_CONTENT");
    expect(promptsSeenByModel[0]).not.toContain("sk-secret-output");
    expect(promptsSeenByModel[1]).toBe("continue again");
    expect(
      compactInjectionStateStore.get("session:sess_runtime_compact"),
    ).toEqual(
      expect.objectContaining({
        injectionStatus: "consumed",
        injectionCount: 1,
      }),
    );
  });

  it("injects explicit project memory after compact context and only once", async () => {
    const calls: string[] = [];
    const promptsSeenByModel: string[] = [];
    const compactCheckpointStore = createCompactLiveCheckpointStore({
      now: () => "2026-05-16T04:00:00.000Z",
      nextId: () => "checkpoint-memory-coexist",
    });
    const compactInjectionStateStore = createCompactInjectionStateStore({
      now: () => "2026-05-16T04:00:00.000Z",
    });
    const compactResult = runCompactCommand({
      mode: "render",
      source: "route",
      generatedAt: "2026-05-16T04:00:00.000Z",
      routeInfo: {
        routeId: "85",
        name: "Memory injection coexistence",
        nextAction: "Inject memory after compact.",
      },
      taskGoal: {
        objective: "Prove deterministic injection order.",
      },
      validationEvidence: {
        testsRun: ["sessionRuntime.test.ts"],
      },
    });
    const checkpoint = updateLatestCompactCheckpoint(compactCheckpointStore, {
      sessionScopeId: "session:sess_memory_coexist",
      sourceCommand: "/compact",
      result: compactResult,
    });
    compactInjectionStateStore.markPending({
      sessionScopeId: "session:sess_memory_coexist",
      checkpointId: checkpoint.checkpointId,
      sourceCommand: "/compact",
    });

    const memoryStoreRoot = fs.mkdtempSync(path.join(os.tmpdir(), "project-memory-runtime-"));
    const projectMemoryStore = createProjectMemoryLocalStore({
      ref: { mode: "test-only", root: memoryStoreRoot },
    });
    await projectMemoryStore.write({
      storeRef: projectMemoryStore.ref,
      record: {
        id: "pmr:runtime-memory",
        version: 1,
        createdAt: "2026-05-16T04:00:00.000Z",
        candidateId: "pmc:runtime-memory",
        candidateKind: "project-fact",
        retentionClass: "project-scoped-candidate",
        approvedAt: "2026-05-16T04:00:00.000Z",
        approvedBySourceCommand: "/memory",
        memoryText: "Runtime memory injection is explicit and one-shot.",
        evidence: ["route85:runtime"],
        source: "system-derived",
        sourcePacket: "route85-test",
        routeReferences: ["route85"],
        safety: "safe",
        redactions: [],
      },
    });
    const projectMemoryInjectionStateStore = createProjectMemoryInjectionStateStore({
      nextId: () => "pmi:runtime-memory",
    });
    projectMemoryInjectionStateStore.markPending({
      sessionScopeId: "session:sess_memory_coexist",
      sourceCommand: "/memory use",
      mode: "recall",
      query: "runtime memory",
      recordIds: ["pmr:runtime-memory"],
    });

    const runtime = new ShellSessionRuntime({
      compactCheckpointStore,
      compactInjectionStateStore,
      projectMemoryStore,
      projectMemoryInjectionStateStore,
      sessionManager: {
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
        saveError() {},
        saveTerminated() {},
      } as never,
      renderer: {
        renderLine() {},
        renderChunk() {},
      } as never,
      runPrompt: async function* (prompt, _signal, _seed, _snapshot, _attachments, _context, accept) {
        accept?.();
        promptsSeenByModel.push(prompt);
        yield {
          type: "query.completed",
          result: {
            status: "completed",
            terminalReason: "completed",
            terminalClassification: "success",
            transcript: [],
            sharedContext: {
              sessionId: "sess_memory_coexist",
              initialPrompt: prompt,
              notes: [],
              handoffs: [],
            },
            finalOutput: "done",
          },
        };
      },
    });

    try {
      await runtime.executePrompt("sess_memory_coexist", "continue with memory");
      await runtime.executePrompt("sess_memory_coexist", "second prompt");
    } finally {
      fs.rmSync(memoryStoreRoot, { recursive: true, force: true });
    }

    expect(promptsSeenByModel[0]).toContain("<compact_v2_injected_context>");
    expect(promptsSeenByModel[0]).toContain("<project_memory_context>");
    expect(
      promptsSeenByModel[0].indexOf("<compact_v2_injected_context>"),
    ).toBeLessThan(promptsSeenByModel[0].indexOf("<project_memory_context>"));
    expect(promptsSeenByModel[0]).toContain("Runtime memory injection is explicit and one-shot.");
    expect(promptsSeenByModel[0]).toContain("<user_request>\ncontinue with memory");
    expect(promptsSeenByModel[1]).toBe("second prompt");
    expect(calls).toEqual([
      "barrier:sess_memory_coexist:continue with memory",
      "completed:sess_memory_coexist",
      "barrier:sess_memory_coexist:second prompt",
      "completed:sess_memory_coexist",
    ]);
    expect(projectMemoryInjectionStateStore.get("session:sess_memory_coexist")).toEqual(
      expect.objectContaining({ injectionStatus: "consumed" }),
    );
  });

  it("injects only the latest repeated compact checkpoint and can inject a fresh checkpoint after consumption", async () => {
    const promptsSeenByModel: string[] = [];
    const compactCheckpointStore = createCompactLiveCheckpointStore({
      now: () => "2026-05-16T00:00:00.000Z",
      nextId: (() => {
        let id = 0;
        return () => {
          id += 1;
          return `checkpoint-repeat-${id}`;
        };
      })(),
    });
    const compactInjectionStateStore = createCompactInjectionStateStore({
      now: () => "2026-05-16T00:00:00.000Z",
    });
    const makeCheckpoint = (routeId: string, changedFile: string) =>
      updateLatestCompactCheckpoint(compactCheckpointStore, {
        sessionScopeId: "session:sess_runtime_repeat",
        sourceCommand: "/compact",
        result: runCompactCommand({
          mode: "render",
          source: "route",
          generatedAt: "2026-05-16T00:00:00.000Z",
          routeInfo: {
            routeId,
            name: `Route ${routeId}`,
            nextAction: `Continue ${routeId}.`,
          },
          taskGoal: {
            objective: `Objective ${routeId}.`,
          },
          mutationEvidence: {
            changedFiles: [changedFile],
          },
          validationEvidence: {
            resultContractStatus: "passed",
          },
        }),
      });
    const first = makeCheckpoint("78", "src/old.ts");
    compactInjectionStateStore.markPending({
      sessionScopeId: "session:sess_runtime_repeat",
      checkpointId: first.checkpointId,
      sourceCommand: "/compact",
    });
    const second = makeCheckpoint("79", "src/new.ts");
    compactInjectionStateStore.markPending({
      sessionScopeId: "session:sess_runtime_repeat",
      checkpointId: second.checkpointId,
      sourceCommand: "/compact",
    });
    const runtime = new ShellSessionRuntime({
      compactCheckpointStore,
      compactInjectionStateStore,
      sessionManager: {
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
        renderLine() {},
        renderChunk() {},
      } as never,
      runPrompt: async function* (prompt, _signal, _seed, _snapshot, _attachments, _context, accept) {
        accept?.();
        promptsSeenByModel.push(prompt);
        yield {
          type: "query.completed",
          result: {
            status: "completed",
            terminalReason: "completed",
            terminalClassification: "success",
            transcript: [],
            sharedContext: {
              sessionId: "sess_runtime_repeat",
              initialPrompt: prompt,
              notes: [],
              handoffs: [],
            },
            finalOutput: "done",
          },
        };
      },
    });

    await runtime.executePrompt("sess_runtime_repeat", "first normal turn");
    await runtime.executePrompt("sess_runtime_repeat", "second normal turn");
    const third = makeCheckpoint("80", "src/fresh.ts");
    compactInjectionStateStore.markPending({
      sessionScopeId: "session:sess_runtime_repeat",
      checkpointId: third.checkpointId,
      sourceCommand: "/compact",
    });
    await runtime.executePrompt("sess_runtime_repeat", "third normal turn");

    expect(promptsSeenByModel[0]).toContain("Route: 79 Route 79");
    expect(promptsSeenByModel[0]).toContain("src/new.ts");
    expect(promptsSeenByModel[0]).not.toContain("src/old.ts");
    expect(promptsSeenByModel[1]).toBe("second normal turn");
    expect(promptsSeenByModel[2]).toContain("Route: 80 Route 80");
    expect(promptsSeenByModel[2]).toContain("src/fresh.ts");
    expect(
      compactInjectionStateStore.get("session:sess_runtime_repeat"),
    ).toEqual(
      expect.objectContaining({
        injectionStatus: "consumed",
        checkpointId: third.checkpointId,
        injectionCount: 1,
      }),
    );
  });

  it("renders print mode answer before compact result boundary", async () => {
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
        yield { type: "tool.started", toolName: "read" };
        yield {
          type: "query.completed",
          result: {
            status: "completed",
            terminalReason: "completed",
            terminalClassification: "success",
            transcript: [],
            sharedContext: {
              sessionId: "sess_print",
              initialPrompt: "inspect sample.txt",
              notes: [],
              handoffs: [],
            },
            finalOutput: "Read result for sample.txt:\n```text\nstatus_new\n```",
            codingResult: {
              taskKind: "read-file",
              changedFiles: [],
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
              verification: {
                status: "not-requested",
                reason: "read-only task",
                nextAction:
                  "Use the observed file context to request a specific edit.",
              },
              taskSatisfaction: {
                verdict: "satisfied",
                reasons: ["Read/summarize task delivered requested content."],
                requiredEvidence: ["requested file content"],
                observedEvidence: ["read:sample.txt:1"],
              },
              evidence: ["read:sample.txt:1"],
              changeSet: {
                gitAware: false,
                preExistingDirtyFiles: [],
                postRunDirtyFiles: [],
                attemptedFiles: ["sample.txt"],
                changedFiles: [],
                unchangedAttemptedFiles: ["sample.txt"],
              },
            },
          },
        };
      },
    });

    await runtime.executePrompt("sess_print", "inspect sample.txt", {
      outputMode: "print",
    });

    const answerIndex = renderedLines.findIndex((line) =>
      line.includes("Read result for sample.txt"),
    );
    const resultIndex = renderedLines.indexOf("Result");
    const actionResultIndex = renderedLines.indexOf("Action result");
    const summaryIndex = renderedLines.findIndex((line) =>
      line.includes("Execution summary"),
    );

    expect(answerIndex).toBeGreaterThanOrEqual(0);
    expect(resultIndex).toBeGreaterThan(answerIndex);
    expect(actionResultIndex).toBeGreaterThan(resultIndex);
    expect(summaryIndex).toBeGreaterThan(actionResultIndex);
    expect(renderedLines).not.toContain("Continuation");
  });

  it("renders a seed-driven continuation summary without changing the result boundary", async () => {
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
            status: "completed",
            terminalReason: "completed",
            terminalClassification: "success",
            transcript: [],
            sharedContext: {
              sessionId: "sess_seed_summary",
              initialPrompt: "continue and check the previous change",
              notes: [
                "decision-trace: seed=action-result seedAction=edit-file seedTarget=src/app.ts seedVerifyStatus=passed seedVerifyCommandInherited=yes",
              ],
              handoffs: [],
            },
            finalOutput: "Checked the previous change.",
            codingResult: {
              taskKind: "read-file",
              changedFiles: [],
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
                status: "not-needed",
                attempts: 0,
                evidence: [],
              },
              changeSet: {
                gitAware: false,
                preExistingDirtyFiles: [],
                postRunDirtyFiles: [],
                attemptedFiles: ["src/app.ts"],
                changedFiles: [],
                unchangedAttemptedFiles: ["src/app.ts"],
              },
              taskSatisfaction: {
                verdict: "satisfied",
                reasons: ["Continuation checked the previous target."],
                requiredEvidence: ["read-file"],
                observedEvidence: ["seed=action-result"],
              },
              verifiedFiles: ["src/app.ts"],
              unverifiedFiles: [],
              verification: {
                status: "not-requested",
                reason: "read-only continuation",
              },
              evidence: ["inspect: read src/app.ts"],
            },
          },
        };
      },
    });

    await runtime.executePrompt(
      "sess_seed_summary",
      "continue and check the previous change",
      {
        outputMode: "print",
        runtimeSeed: {
          config: {
            sessionId: "sess_seed_summary",
            initialPrompt: "continue and check the previous change",
            maxTurns: 6,
            startingRole: "planner",
          },
          currentRole: "planner",
          turn: 1,
          pendingLifecycle: {
            pendingApprovals: {},
            pendingTools: {},
            taskStates: {},
          },
          recoveryBoundary: "fresh-entry",
          truthBoundary: {
            source: "durable-replay",
            normalizedEventCount: 0,
            pairedTurnCount: 0,
            policyEvidence: new Set(),
            repairSummary: {
              insertedPromptMessage: false,
              insertedQueryStarted: false,
              strippedInterruptedTerminalEvents: 0,
              insertedRunInterrupted: false,
              ignoredDuplicateTurnStarts: 0,
              ignoredUnpairedTurnCompletions: 0,
              ignoredRoleMismatchedTurnCompletions: 0,
            },
            continuationSafety: "fresh-only",
          },
          derivedState: { transcript: [] },
        },
        continuityState: {
          sessionId: "sess_seed_summary",
          projectRoot: "D:/Test/seed-summary",
          lastActionHandoffSummary:
            "Resumed from edit-file on src/app.ts; verification status: passed; next focus is the same target.",
          lastFailureHandoffDiagnostic:
            "Failure handoff: status=failed; target=src/app.ts; command=npm test -- src/app.test.ts; reason=assertion failed; next=rerun the focused verification.",
          lastSuccessHandoffDiagnostic:
            "Success handoff: status=passed; target=src/app.ts; command=npm test -- src/app.test.ts; verified=src/app.ts; next=keep the next turn focused on the same target; do not repeat this verification unless the target changes.",
          recentChangedFiles: [],
          recentTargetFiles: [],
          recentFailedFiles: [],
          recentVerifiedFiles: [],
          lastRepairNotes: [],
          lastContinuationEvidence: [],
          lastTaskSatisfactionReasons: [],
          unresolvedItems: [],
        },
      },
    );

    expect(renderedLines).toContain("Result");
    expect(renderedLines).toContain("Action result");
    expect(renderedLines).toContain("Continuation");
    expect(renderedLines).toContain(
      "- Resumed from edit-file on src/app.ts; verification status: passed; next focus is the same target. Failure handoff: status=failed; target=src/app.ts; command=npm test -- src/app.test.ts; reason=assertion failed; next=rerun the focused verification.",
    );
    expect(
      renderedLines.some((line) => line.includes("Success handoff")),
    ).toBe(false);
  });

  it("renders success provenance continuation summary when no failure is present", async () => {
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
            status: "completed",
            terminalReason: "completed",
            terminalClassification: "success",
            transcript: [],
            sharedContext: {
              sessionId: "sess_success_provenance",
              initialPrompt: "continue from verified target",
              notes: [],
              handoffs: [],
            },
            finalOutput: "Continued from the verified target.",
          },
        };
      },
    });

    await runtime.executePrompt("sess_success_provenance", "continue", {
      outputMode: "print",
      runtimeSeed: {
        config: {
          sessionId: "sess_success_provenance",
          initialPrompt: "continue",
          maxTurns: 6,
          startingRole: "planner",
        },
        currentRole: "planner",
        turn: 1,
        pendingLifecycle: {
          pendingApprovals: {},
          pendingTools: {},
          taskStates: {},
        },
        recoveryBoundary: "fresh-entry",
        truthBoundary: {
          source: "durable-replay",
          normalizedEventCount: 0,
          pairedTurnCount: 0,
          policyEvidence: new Set(),
          repairSummary: {
            insertedPromptMessage: false,
            insertedQueryStarted: false,
            strippedInterruptedTerminalEvents: 0,
            insertedRunInterrupted: false,
            ignoredDuplicateTurnStarts: 0,
            ignoredUnpairedTurnCompletions: 0,
            ignoredRoleMismatchedTurnCompletions: 0,
          },
          continuationSafety: "fresh-only",
        },
        derivedState: { transcript: [] },
      },
      continuityState: {
        sessionId: "sess_success_provenance",
        projectRoot: "D:/Test/success-provenance",
        lastSuccessHandoffDiagnostic:
          "Success handoff: status=passed; target=src/app.ts; command=npm test -- src/app.test.ts; verified=src/app.ts; next=keep the next turn focused on the same target; do not repeat this verification unless the target changes.",
        recentChangedFiles: [],
        recentTargetFiles: [],
        recentFailedFiles: [],
        recentVerifiedFiles: [],
        lastRepairNotes: [],
        lastContinuationEvidence: [],
        lastTaskSatisfactionReasons: [],
        unresolvedItems: [],
      },
    });

    expect(renderedLines).toContain("Continuation");
    expect(renderedLines).toContain(
      "- Success handoff: status=passed; target=src/app.ts; command=npm test -- src/app.test.ts; verified=src/app.ts; next=keep the next turn focused on the same target; do not repeat this verification unless the target changes.",
    );
  });

  it("builds follow-up continuity context before persisting the current prompt barrier", async () => {
    const calls: string[] = [];
    const runtime = new ShellSessionRuntime({
      sessionManager: {
        buildPromptContinuitySnapshot(sessionId: string, prompt: string) {
          calls.push(`continuity:${sessionId}:${prompt}`);
          return {
            sessionId,
            projectRoot: "D:/Test/continuity",
            recentChangedFiles: [], recentTargetFiles: ["./continuity_demo.py"],
            recentVerifiedFiles: [], recentFailedFiles: [], lastRepairNotes: [],
            lastContinuationEvidence: [], lastTaskSatisfactionReasons: [], unresolvedItems: [],
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

  it("passes edit patch stopped recovery context into the next prompt run", async () => {
    const originalUserProfile = process.env.USERPROFILE;
    const originalHome = process.env.HOME;
    const fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-edit-patch-continuity-"),
    );
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;

    try {
      const manager = new SessionManager();
      const session = manager.createNew();
      const stopReason =
        "patch-from-not-found: Source text was not found in docs/failed-edit.md.";
      const nextAction =
        "Re-read docs/failed-edit.md, then rerun with the exact current text to replace.";
      let capturedContinuity:
        | import("../../session/SessionManager.js").SessionContinuitySnapshot
        | undefined;

      manager.markRunStarted(session.id, "replace old text");
      manager.addTurn(session.id, {
        role: "user",
        content: "replace old text in docs/failed-edit.md",
      });
      manager.appendQueryEvent(session.id, {
        type: "query.completed",
        result: {
          status: "stopped_error",
          terminalReason: "stopped_error",
          terminalClassification: "stopped",
          stopReason,
          transcript: [],
          sharedContext: {
            sessionId: session.id,
            initialPrompt: "replace old text in docs/failed-edit.md",
            notes: [],
            handoffs: [],
          },
          finalOutput: "",
          codingResult: {
            taskKind: "edit-file",
            changedFiles: [],
            failedFiles: [
              {
                path: "docs/failed-edit.md",
                reason: stopReason,
              },
            ],
            patches: [
              {
                path: "docs/failed-edit.md",
                operation: "replace",
                status: "failed",
                failureCode: "patch-from-not-found",
                reason: stopReason,
              },
            ],
            repair: {
              status: "failed",
              attempts: 1,
              recoveredItems: [],
              failedItems: ["docs/failed-edit.md"],
              notes: [`${stopReason} Next action: ${nextAction}`],
            },
            continuation: {
              status: "failed-after-bounded-continuation",
              attempts: 1,
              evidence: ["actionable-blocker-kind:patch-from-not-found"],
            },
            changeSet: {
              gitAware: false,
              preExistingDirtyFiles: [],
              postRunDirtyFiles: [],
              attemptedFiles: ["docs/failed-edit.md"],
              changedFiles: [],
              unchangedAttemptedFiles: ["docs/failed-edit.md"],
            },
            taskSatisfaction: {
              verdict: "completed-with-caveats",
              reasons: [stopReason],
              requiredEvidence: ["inspect->edit->verify contract execution"],
              observedEvidence: [
                "actionable-blocker-kind:patch-from-not-found",
              ],
            },
            verifiedFiles: [],
            unverifiedFiles: [
              {
                path: "docs/failed-edit.md",
                reason: stopReason,
              },
            ],
            verification: {
              status: "blocked",
              reason: stopReason,
              blockerKind: "patch-from-not-found",
              nextAction,
            },
            evidence: [
              "actionable-blocker-kind:patch-from-not-found",
              `mutation-summary-next-action:${nextAction}`,
            ],
            failureBoundary: stopReason,
          },
        },
      });
      manager.saveError(session.id, stopReason, {
        terminalReason: "stopped_error",
        terminalClassification: "stopped",
      });

      const runtime = new ShellSessionRuntime({
        sessionManager: manager,
        renderer: {
          renderLine() {},
          renderChunk() {},
        } as never,
        runPrompt: async function* (_prompt, _signal, _runtimeSeed, continuityState) {
          capturedContinuity = continuityState;
          yield {
            type: "query.completed",
            result: {
              status: "completed",
              terminalReason: "completed",
              terminalClassification: "success",
              transcript: [],
              sharedContext: {
                sessionId: session.id,
                initialPrompt: "continue with the same failed edit",
                notes: [],
                handoffs: [],
              },
              finalOutput: "continued",
            },
          };
        },
      });

      await runtime.executePrompt(
        session.id,
        "continue with the same failed edit",
      );

      expect(capturedContinuity?.lastTerminalClassification).toBe("stopped");
      expect(capturedContinuity?.lastFailure).toBe(stopReason);
      expect(capturedContinuity?.recentChangedFiles).toEqual([]);
      expect(capturedContinuity?.recentFailedFiles).toEqual([
        {
          path: "docs/failed-edit.md",
          reason: stopReason,
        },
      ]);
      expect(capturedContinuity?.lastVerificationBlockerKind).toBe(
        "patch-from-not-found",
      );
      expect(capturedContinuity?.lastVerificationReason).toBe(stopReason);
      expect(capturedContinuity?.lastVerificationNextAction).toBe(nextAction);
      expect(capturedContinuity?.lastFailureHandoffDiagnostic).toContain(
        "Failure handoff: status=blocked; target=docs/failed-edit.md;",
      );
      expect(capturedContinuity?.lastFailureHandoffDiagnostic).toContain(
        "blocker=patch-from-not-found",
      );
      expect(capturedContinuity?.lastFailureHandoffDiagnostic).toContain(
        `next=${nextAction.replace(/[.]+$/, "")}.`,
      );
    } finally {
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it.each(["unknown", "unverified"] as const)(
    "passes writer-started stopped %s write effect into the next prompt run",
    async (writeEffect) => {
      const originalUserProfile = process.env.USERPROFILE;
      const originalHome = process.env.HOME;
      const fakeHome = fs.mkdtempSync(
        path.join(os.tmpdir(), "cheers-writer-started-continuity-"),
      );
      process.env.USERPROFILE = fakeHome;
      process.env.HOME = fakeHome;

      try {
        const sessionsDir = path.join(fakeHome, ".cheers", "sessions");
        const {
          projectRoot,
          sessionId,
          stopReason,
          nextAction,
          targetPath,
        } = seedWriterStartedStoppedRecoveryContextSession({
          fakeHomeDir: fakeHome,
          sessionsDir,
          writeEffect,
        });
        const manager = new SessionManager({ projectRoot });
        const renderedLines: string[] = [];
        let capturedContinuity:
          | import("../../session/SessionManager.js").SessionContinuitySnapshot
          | undefined;

        const runtime = new ShellSessionRuntime({
          sessionManager: manager,
          renderer: {
            renderLine(line?: string) {
              renderedLines.push(line ?? "");
            },
            renderChunk() {},
          } as never,
          runPrompt: async function* (
            _prompt,
            _signal,
            _runtimeSeed,
            continuityState,
          ) {
            capturedContinuity = continuityState;
            yield {
              type: "query.completed",
              result: {
                status: "completed",
                terminalReason: "completed",
                terminalClassification: "success",
                transcript: [],
                sharedContext: {
                  sessionId,
                  initialPrompt: "continue uncertain writer state",
                  notes: [],
                  handoffs: [],
                },
                finalOutput: "continued",
              },
            };
          },
        });

        // The continuation summary is rendered by the terminal surface's print
        // branch; the interactive branch gates it behind verbose view mode.
        await runtime.executePrompt(sessionId, "continue uncertain writer state", {
          outputMode: "print",
        });

        expect(capturedContinuity?.lastWriterStarted).toBe(true);
        expect(capturedContinuity?.lastWriteEffect).toBe(writeEffect);
        expect(capturedContinuity?.lastWriteRequiresUserInspection).toBe(true);
        expect(capturedContinuity?.lastWriteEffectTarget).toBe(targetPath);
        expect(capturedContinuity?.recentChangedFiles).toEqual([]);
        expect(capturedContinuity?.lastFailureHandoffDiagnostic).toContain(
          "Failure handoff: status=blocked",
        );
        expect(capturedContinuity?.lastFailureHandoffDiagnostic).toContain(
          `target=${targetPath}`,
        );
        expect(capturedContinuity?.lastFailureHandoffDiagnostic).toContain(
          "writer-started=yes",
        );
        expect(capturedContinuity?.lastFailureHandoffDiagnostic).toContain(
          `write-effect=${writeEffect}`,
        );
        expect(capturedContinuity?.lastFailureHandoffDiagnostic).toContain(
          `next=${nextAction.replace(/[.]+$/, "")}.`,
        );
        expect(capturedContinuity?.lastSuccessHandoffDiagnostic).toBeUndefined();
        expect(capturedContinuity?.lastFailure).toBe(stopReason);
        const rendered = renderedLines.join("\n");
        expect(rendered).toContain("Continuation");
        expect(rendered).toContain("writer-started=yes");
        expect(rendered).toContain(`write-effect=${writeEffect}`);
        expect(rendered).toContain(`target=${targetPath}`);
        expect(rendered).not.toContain(`Changed files: ${targetPath}`);
        expect(rendered).not.toContain("Success handoff: status=passed");
      } finally {
        if (originalUserProfile === undefined) delete process.env.USERPROFILE;
        else process.env.USERPROFILE = originalUserProfile;
        if (originalHome === undefined) delete process.env.HOME;
        else process.env.HOME = originalHome;
        fs.rmSync(fakeHome, { recursive: true, force: true });
      }
    },
  );

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
        yield {
          type: "message.delta",
          role: "reviewer",
          delta: "final answer",
        };
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
              evidence: [
                "repairContextUsed:true",
                "repairedFailureReason:patch-from-not-found",
                "repairedTargetFile:src/app.ts",
                "repairPayloadKind:replace-directive",
                "transform:src/app.ts:return false;=>return true;",
                "verify-unchanged:README.md|LOCKED.md",
              ],
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
    expect(renderedLines.some((line) => line.includes("[tool:start]"))).toBe(
      false,
    );
    expect(
      renderedLines.some((line) => line.includes("[approval] requested")),
    ).toBe(false);
    expect(renderedLines.some((line) => line.includes("[query:retry]"))).toBe(
      false,
    );
    expect(
      renderedLines.some((line) =>
        line.includes("Working through a temporary provider retry"),
      ),
    ).toBe(true);
    expect(
      renderedLines.some((line) => line.includes("Execution summary")),
    ).toBe(true);
    expect(
      renderedLines.some((line) => line.includes("- Actions: bash (1 run)")),
    ).toBe(true);
    expect(
      renderedLines.some((line) => line.includes("- Approvals: 0/1 approved")),
    ).toBe(true);
    expect(renderedLines).toContain("Result");
    expect(
      renderedLines.some((line) => line.includes("- Outcome: success")),
    ).toBe(true);
    expect(renderedLines).toContain("Action result");
    expect(
      renderedLines.some((line) => line.includes("- Changed: 1 file(s)")),
    ).toBe(true);
    expect(renderedLines).toContain("- Changed files: src/app.ts");
    expect(renderedLines).toContain(
      "- Change summary: src/app.ts: replaced `return false;` with `return true;`",
    );
    expect(renderedLines).toContain("- Repair context: repairContextUsed:true");
    expect(renderedLines).toContain(
      "- Repaired failure reason: repairedFailureReason:patch-from-not-found",
    );
    expect(renderedLines).toContain(
      "- Repaired target file: repairedTargetFile:src/app.ts",
    );
    expect(renderedLines).toContain(
      "- Repair payload kind: repairPayloadKind:replace-directive",
    );
    expect(renderedLines).toContain(
      "- Verification evidence: verify request mapped to allowlisted command",
    );
    expect(renderedLines).toContain(
      "- Confirmed unchanged: README.md, LOCKED.md",
    );
    expect(
      renderedLines.some((line) => line.includes("- Verification: passed")),
    ).toBe(true);
    expect(renderedLines).toContain(
      "- Next action: Review the changed file, then run the project test suite before committing if one exists.",
    );
  });

  it("prints read-only file context evidence in compact output", async () => {
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
            status: "completed",
            terminalReason: "completed",
            terminalClassification: "success",
            transcript: [],
            sharedContext: {
              sessionId: "sess_read",
              initialPrompt: "inspect math.js",
              notes: [],
              handoffs: [],
            },
            finalOutput:
              "Read result for math.js:\n```text\nreturn n + 2;\n```",
            codingResult: {
              taskKind: "read-file",
              changedFiles: [],
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
                postRunDirtyFiles: [],
                attemptedFiles: ["math.js"],
                changedFiles: [],
                unchangedAttemptedFiles: ["math.js"],
              },
              taskSatisfaction: {
                verdict: "satisfied",
                reasons: ["Read/summarize task delivered requested content."],
                requiredEvidence: ["read-file"],
                observedEvidence: ["inspect: read math.js"],
              },
              verifiedFiles: [],
              unverifiedFiles: [],
              verification: {
                status: "not-requested",
                reason: "read-only task",
              },
              evidence: [
                "inspect: read math.js",
                "deliverable-mode:read",
                "read-delivered-lines:3",
              ],
            },
          },
        };
      },
    });

    await runtime.executePrompt("sess_read", "inspect math.js");

    expect(renderedLines).toContain("Action result");
    expect(renderedLines).toContain("- Task: read-file");
    expect(renderedLines).toContain("- Changed: none");
    expect(renderedLines).toContain("- Read files: math.js");
    expect(renderedLines).toContain(
      "- Observed context: delivered 3 line(s) from math.js.",
    );
    expect(renderedLines).toContain("- No files changed: read/inspect only.");
    expect(renderedLines).toContain(
      "- Verification detail: No verification was requested for this turn. Reason: read-only task",
    );
    expect(renderedLines).toContain(
      "- Next action: Use the observed file context to request a specific edit, ask for more lines, or run an explicit verification.",
    );
  });

  it("prints repair context abandoned diagnostics without marking repair success", async () => {
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
            status: "completed",
            terminalReason: "completed",
            terminalClassification: "success",
            transcript: [],
            sharedContext: {
              sessionId: "sess_repair_abandoned",
              initialPrompt: "replace first = duplicate with first = fixed",
              notes: [],
              handoffs: [],
            },
            finalOutput: "Edit completed for src/a.ts.",
            codingResult: {
              taskKind: "edit-file",
              changedFiles: ["src/a.ts"],
              failedFiles: [],
              patches: [
                {
                  path: "src/a.ts",
                  operation: "replace",
                  status: "applied",
                  changedLines: 1,
                  addedLines: 0,
                  removedLines: 0,
                },
              ],
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
                attemptedFiles: ["src/a.ts"],
                changedFiles: ["src/a.ts"],
                unchangedAttemptedFiles: [],
              },
              taskSatisfaction: {
                verdict: "satisfied",
                reasons: [],
                requiredEvidence: ["changed-files"],
                observedEvidence: [],
              },
              verifiedFiles: [],
              unverifiedFiles: [],
              verification: {
                status: "not-requested",
                reason: "mutation completed without explicit verify intent",
              },
              evidence: [
                "repairContextUsed:false",
                "repairContextAbandoned:true",
                "repairContextAbandonedReason:multiple-failed-targets",
                "repairContextAbandonedFailureReason:patch-ambiguous",
                "repairContextAbandonedTargetCount:2",
                "transform:src/a.ts:first = duplicate=>first = fixed",
              ],
            },
          },
        };
      },
    });

    await runtime.executePrompt("sess_repair_abandoned", "repair it");

    expect(renderedLines).toContain(
      "- Repair context: repairContextUsed:false",
    );
    expect(renderedLines).toContain(
      "- Repair context abandoned: repairContextAbandoned:true",
    );
    expect(renderedLines).toContain(
      "- Repair context abandoned reason: repairContextAbandonedReason:multiple-failed-targets",
    );
    expect(renderedLines).toContain(
      "- Repair context abandoned failure reason: repairContextAbandonedFailureReason:patch-ambiguous",
    );
    expect(renderedLines).toContain(
      "- Repair context failed target candidates: 2",
    );
    expect(renderedLines).toContain(
      "- Repair context next action: specify the exact target file, or rerun as a fresh single-file edit.",
    );
    expect(renderedLines).not.toContain(
      "- Repair context: repairContextUsed:true",
    );
  });

  it("distinguishes changed-but-not-requested verification from blocked verification", async () => {
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
            status: "completed",
            terminalReason: "completed",
            terminalClassification: "success",
            transcript: [],
            sharedContext: {
              sessionId: "sess_write_no_verify",
              initialPrompt: "create notes",
              notes: [],
              handoffs: [],
            },
            finalOutput: "Write completed for notes.txt.",
            codingResult: {
              taskKind: "write-file",
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
                verdict: "satisfied",
                reasons: [],
                requiredEvidence: ["changed-files"],
                observedEvidence: ["changed-files:notes.txt"],
              },
              verifiedFiles: [],
              unverifiedFiles: [],
              verification: {
                status: "not-requested",
                reason: "mutation completed without explicit verify intent",
              },
              evidence: [],
            },
          },
        };
      },
    });

    await runtime.executePrompt("sess_write_no_verify", "create notes");

    expect(renderedLines).toContain("- Verification: not-requested");
    expect(renderedLines).toContain(
      "- Verification detail: No verification was requested; changed files were not checked. Reason: mutation completed without explicit verify intent",
    );
    expect(renderedLines).toContain(
      "- Next action: Ask for an explicit low-risk verification if you want the changed files checked.",
    );
  });

  it("renders verification failure as stopped recovery guidance in compact output", async () => {
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
            terminalClassification: "stopped",
            stopReason: "npm test failed with exit code 1",
            transcript: [],
            sharedContext: {
              sessionId: "sess_write_verify_failed",
              initialPrompt: "edit notes and verify",
              notes: [],
              handoffs: [],
            },
            finalOutput:
              "Edit completed for notes.txt. Verification failed.",
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
        };
      },
    });

    await runtime.executePrompt(
      "sess_write_verify_failed",
      "edit notes and verify",
    );

    expect(renderedLines).toContain("Result");
    expect(renderedLines).toContain("- Outcome: stopped");
    expect(renderedLines).not.toContain("- Outcome: success");
    expect(renderedLines).not.toContain("- Detail: completed");
    expect(renderedLines).toContain("- BlockerKind: verification-failed");
    expect(renderedLines).toContain(
      "- Reason: npm test failed with exit code 1",
    );
    expect(renderedLines).toContain(
      "- DoNext: Fix the verification failure, then rerun the verification step.",
    );
    expect(renderedLines).toContain("Action result");
    expect(renderedLines).toContain("- Changed files: notes.txt");
    expect(renderedLines).toContain("- Verification: failed");
    expect(renderedLines).toContain(
      "- Verification detail: Verification failed (npm test -- --help). Reason: npm test failed with exit code 1",
    );
    expect(renderedLines).toContain(
      "- Next action: Inspect the verification failure, adjust the requested edit, and rerun.",
    );
    expect(renderedLines).not.toContain("- Verification evidence: passed");
  });

  it("explains successful edits with blocked verification as a caveat", async () => {
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
            status: "completed",
            terminalReason: "completed",
            terminalClassification: "success",
            transcript: [],
            sharedContext: {
              sessionId: "sess_write_verify_blocked",
              initialPrompt: "create notes and verify",
              notes: [],
              handoffs: [],
            },
            finalOutput:
              "Write completed for notes.txt. Verification blocked (no-verify-strategy).",
            codingResult: {
              taskKind: "write-file",
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
                verdict: "completed-with-caveats",
                reasons: [
                  "Edit applied but verify was blocked (no-verify-strategy); follow next action before continuing.",
                ],
                requiredEvidence: ["changed-files", "verification"],
                observedEvidence: ["changed-files:notes.txt"],
              },
              verifiedFiles: [],
              unverifiedFiles: [
                {
                  path: "notes.txt",
                  reason:
                    "Verify intent was detected, but no verify strategy could be resolved from the prompt.",
                },
              ],
              verification: {
                status: "blocked",
                reason:
                  "Verify intent was detected, but no verify strategy could be resolved from the prompt.",
                blockerKind: "no-verify-strategy",
                nextAction:
                  "Specify verify intent explicitly with test/build/check keywords so a concrete verify command can be selected.",
              },
              evidence: [],
            },
          },
        };
      },
    });

    await runtime.executePrompt(
      "sess_write_verify_blocked",
      "create notes and verify",
    );

    expect(renderedLines).toContain("- Verification: blocked");
    expect(renderedLines).toContain(
      "- Verification detail: Edit succeeded, but verification could not run (no-verify-strategy). Reason: Verify intent was detected, but no verify strategy could be resolved from the prompt.",
    );
    expect(renderedLines).toContain(
      "- Next action: Specify verify intent explicitly with test/build/check keywords so a concrete verify command can be selected.",
    );
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
      renderedLines.some((line) => line.includes("[tool: bash]")),
    ).toBe(true);
    expect(
      renderedLines.some((line) => line.includes("[query:retry] role=coder")),
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
      "completed:sess_resume",
    ]);
  });

  it("passes compacted continuity state into resumed follow-up prompts", async () => {
    const originalUserProfile = process.env.USERPROFILE;
    const originalHome = process.env.HOME;
    const fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-compact-resume-"),
    );
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;

    try {
      const manager = new SessionManager();
      const fixture = createLongSessionContinuityFixture(
        manager,
        "verification-failed",
      );
      const restoredManager = fixture.restoreManager();
      const resumed = restoredManager.resume(fixture.session.id);
      let observedContinuity:
        | Parameters<
            ConstructorParameters<typeof ShellSessionRuntime>[0]["runPrompt"]
          >[3]
        | undefined;

      const runtime = new ShellSessionRuntime({
        sessionManager: restoredManager,
        renderer: {
          renderLine() {},
          renderChunk() {},
        } as never,
        runPrompt: async function* (_prompt, _signal, _runtimeSeed, continuity) {
          observedContinuity = continuity;
          yield {
            type: "query.completed",
            result: {
              status: "completed",
              terminalReason: "completed",
              terminalClassification: "success",
              transcript: [],
              sharedContext: {
                sessionId: resumed.id,
                initialPrompt: "continue after compact",
                notes: [],
                handoffs: [],
              },
              finalOutput: `continued:${continuity?.lastVerificationNextAction ?? "missing-continuity"}`,
            },
          };
        },
      });

      const output = await runtime.executePrompt(
        resumed.id,
        "continue after compact",
      );

      expect(fixture.readWorkingMemory()?.compacted).toBe(true);
      expect(output).toBe(`continued:${fixture.nextAction}`);
      expect(observedContinuity?.lastTerminalClassification).toBe("error");
      expect(observedContinuity?.lastFailure).toBe(fixture.failureReason);
      expect(observedContinuity?.recentChangedFiles).toEqual([
        fixture.targetFile,
      ]);
      expect(observedContinuity?.lastVerificationStatus).toBe("failed");
      expect(observedContinuity?.lastVerificationCommand).toBe(
        "npm test -- src/long-session.test.ts",
      );
      expect(observedContinuity?.lastVerificationNextAction).toBe(
        fixture.nextAction,
      );
    } finally {
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
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
      "Run-command intent is not allowed in the controlled allowlist: npm publish Allowed commands: node --version, npm test -- --help, npm run build -- --help Please rephrase your request to one of the allowed command intents.";

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
        line.includes("Run-command intent is not allowed in the controlled allowlist"),
      ),
    ).toBe(true);
    expect(renderedLines).toContain("Next steps");
    expect(renderedLines).toContain(
      "- Run-command intent was blocked by the controlled allowlist.",
    );
    expect(renderedLines).toContain(
      "- Allowed commands: node --version, npm test -- --help, npm run build -- --help",
    );
    expect(renderedLines).toContain(
      '- Rephrase with one allowed command, for example: "Run node --version".',
    );
    expect(renderedLines).toContain("- BlockerKind: command-not-allowlisted");
    expect(renderedLines).toContain(
      "- Reason: Run-command intent is not allowed in the controlled allowlist: npm publish Allowed commands: node --version, npm test -- --help, npm run build -- --help Please rephrase your request to one of the allowed command intents.",
    );
    expect(renderedLines).toContain(
      "- DoNext: Rephrase the request with an allowlisted command: node --version, npm test -- --help, or npm run build -- --help.",
    );
    expect(calls).toContain(`error:sess_blocked:${blockedReason}`);
  });

  it("prints coding failure reason and next action for unexecutable edit results", async () => {
    const renderedLines: string[] = [];
    const stopReason =
      "Edit instruction is ambiguous: replacement not safely derivable from the prompt. No files were changed and unrelated files were not modified. Rerun with a safe explicit rewrite such as: \"In plan.txt, replace '<current text>' with '<desired text>'. Only modify plan.txt.\" Alternatively, provide a fenced full replacement for the target file.";

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
            terminalClassification: "stopped",
            stopReason,
            transcript: [],
            sharedContext: {
              sessionId: "sess_edit_blocked",
              initialPrompt: "update plan",
              notes: [],
              handoffs: [],
            },
            finalOutput: stopReason,
            codingResult: {
              taskKind: "edit-file",
              changedFiles: [],
              failedFiles: [{ path: "plan.txt", reason: stopReason }],
              patches: [],
              repair: {
                status: "failed",
                attempts: 0,
                recoveredItems: [],
                failedItems: ["plan.txt"],
                notes: [],
              },
              continuation: {
                status: "failed-after-bounded-continuation",
                attempts: 0,
                evidence: [],
              },
              changeSet: {
                gitAware: false,
                preExistingDirtyFiles: [],
                postRunDirtyFiles: [],
                attemptedFiles: ["plan.txt"],
                changedFiles: [],
                unchangedAttemptedFiles: ["plan.txt"],
              },
              taskSatisfaction: {
                verdict: "insufficient-evidence",
                reasons: [stopReason],
                requiredEvidence: ["changed-files"],
                observedEvidence: [],
              },
              verifiedFiles: [],
              unverifiedFiles: [{ path: "plan.txt", reason: stopReason }],
              verification: {
                status: "skipped",
                reason: stopReason,
              },
              evidence: [
                "inspect: read plan.txt",
                "transform:plan.txt:missing text=>desired text",
              ],
              failureBoundary: stopReason,
            },
          },
        };
      },
    });

    await runtime.executePrompt("sess_edit_blocked", "update plan");

    expect(renderedLines).toContain("Action result");
    expect(
      renderedLines.some((line) => line.startsWith("- Change summary:")),
    ).toBe(false);
    expect(
      renderedLines.some((line) =>
        line.includes(
          "- Failure reason: plan.txt: Edit instruction is ambiguous",
        ),
      ),
    ).toBe(true);
    expect(renderedLines).toContain(
      "- Next action: Rerun with an explicit replace-from/to instruction or a fenced replacement; include the exact current text, desired text, and target file.",
    );
    expect(renderedLines).toContain("Next steps");
    expect(renderedLines).toContain(
      "- Rerun with an explicit replace-from/to instruction or fenced replacement, including the exact current text, desired text, and target file.",
    );
  });

  it("renders edit patch stopped failures with recovery evidence in verbose output", async () => {
    const renderedLines: string[] = [];
    const stopReason =
      "partial-mutation-failed: One or more file mutations failed, so the mutation set cannot be reported as successfully applied.";
    const nextAction =
      "Review the failed files, re-read current content, inspect any writer-started target before retrying, and retry only the unresolved mutation.";

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
            terminalClassification: "stopped",
            stopReason,
            transcript: [],
            sharedContext: {
              sessionId: "sess_edit_patch_stopped_surface",
              initialPrompt: "edit two files",
              notes: [],
              handoffs: [],
            },
            finalOutput: "",
            codingResult: {
              taskKind: "edit-file",
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
                  changedLines: 1,
                  addedLines: 0,
                  removedLines: 0,
                },
                {
                  path: "docs/partial-denied.txt",
                  operation: "append",
                  status: "failed",
                  failureCode: "write-failed",
                  reason: "write failed: EISDIR",
                },
              ],
              repair: {
                status: "failed",
                attempts: 1,
                recoveredItems: [],
                failedItems: ["docs/partial-denied.txt"],
                notes: [`${stopReason} Next action: ${nextAction}`],
              },
              continuation: {
                status: "failed-after-bounded-continuation",
                attempts: 1,
                evidence: ["mutation-summary-blocker:partial-mutation-failed"],
              },
              changeSet: {
                gitAware: false,
                preExistingDirtyFiles: [],
                postRunDirtyFiles: ["src/partial-ok.txt"],
                attemptedFiles: [
                  "src/partial-ok.txt",
                  "docs/partial-denied.txt",
                ],
                changedFiles: ["src/partial-ok.txt"],
                unchangedAttemptedFiles: ["docs/partial-denied.txt"],
              },
              taskSatisfaction: {
                verdict: "completed-with-caveats",
                reasons: [stopReason],
                requiredEvidence: ["inspect->edit->verify contract execution"],
                observedEvidence: [
                  "mutation-summary-blocker:partial-mutation-failed",
                  `mutation-summary-next-action:${nextAction}`,
                ],
              },
              verifiedFiles: [],
              unverifiedFiles: [
                {
                  path: "src/partial-ok.txt",
                  reason: stopReason,
                },
                {
                  path: "docs/partial-denied.txt",
                  reason: "write failed: EISDIR",
                },
              ],
              verification: {
                status: "not-requested",
                reason: stopReason,
                nextAction,
              },
              evidence: [
                "mutation-summary-blocker:partial-mutation-failed",
                `mutation-summary-next-action:${nextAction}`,
                "edit/write applied on src/partial-ok.txt",
              ],
              failureBoundary: stopReason,
            },
          },
        };
      },
    });
    runtime.setViewMode("verbose");

    await runtime.executePrompt(
      "sess_edit_patch_stopped_surface",
      "edit two files",
    );

    expect(renderedLines).toContain("Final result");
    expect(renderedLines).toContain("- Classification: stopped");
    expect(renderedLines).toContain(
      "- Blocker kind: partial-mutation-failed",
    );
    expect(renderedLines).toContain(`- Blocker reason: ${stopReason}`);
    expect(renderedLines).toContain(`- Blocker do next: ${nextAction}`);
    expect(renderedLines).toContain("Coding result");
    expect(renderedLines).toContain("- Changed files: src/partial-ok.txt");
    expect(renderedLines).toContain(
      "- Failed files: docs/partial-denied.txt (write failed: EISDIR)",
    );
    expect(renderedLines).toContain(
      "- Patch results: src/partial-ok.txt [replace] applied (changed=1, added=0, removed=0); docs/partial-denied.txt [append] failed (write-failed: write failed: EISDIR)",
    );
    expect(renderedLines).toContain(
      `- Verify next action: ${nextAction}`,
    );
    expect(renderedLines).toContain(
      `- Repair notes: ${stopReason} Next action: ${nextAction}`,
    );
    expect(renderedLines).toContain(
      `- Evidence: mutation-summary-blocker:partial-mutation-failed | mutation-summary-next-action:${nextAction} | edit/write applied on src/partial-ok.txt`,
    );
  });

  it("renders edit patch stopped failures with recovery hints in compact output", async () => {
    const renderedLines: string[] = [];
    const stopReason =
      "partial-mutation-failed: One or more file mutations failed, so the mutation set cannot be reported as successfully applied.";
    const nextAction =
      "Review the failed files, re-read current content, inspect any writer-started target before retrying, and retry only the unresolved mutation.";

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
            terminalClassification: "stopped",
            stopReason,
            transcript: [],
            sharedContext: {
              sessionId: "sess_edit_patch_stopped_compact_surface",
              initialPrompt: "edit two files",
              notes: [],
              handoffs: [],
            },
            finalOutput: "",
            codingResult: {
              taskKind: "edit-file",
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
                  changedLines: 1,
                  addedLines: 0,
                  removedLines: 0,
                },
                {
                  path: "docs/partial-denied.txt",
                  operation: "append",
                  status: "failed",
                  failureCode: "write-failed",
                  reason: "write failed: EISDIR",
                },
              ],
              repair: {
                status: "failed",
                attempts: 1,
                recoveredItems: [],
                failedItems: ["docs/partial-denied.txt"],
                notes: [`${stopReason} Next action: ${nextAction}`],
              },
              continuation: {
                status: "failed-after-bounded-continuation",
                attempts: 1,
                evidence: ["mutation-summary-blocker:partial-mutation-failed"],
              },
              changeSet: {
                gitAware: false,
                preExistingDirtyFiles: [],
                postRunDirtyFiles: ["src/partial-ok.txt"],
                attemptedFiles: [
                  "src/partial-ok.txt",
                  "docs/partial-denied.txt",
                ],
                changedFiles: ["src/partial-ok.txt"],
                unchangedAttemptedFiles: ["docs/partial-denied.txt"],
              },
              taskSatisfaction: {
                verdict: "completed-with-caveats",
                reasons: [stopReason],
                requiredEvidence: ["inspect->edit->verify contract execution"],
                observedEvidence: [
                  "mutation-summary-blocker:partial-mutation-failed",
                  `mutation-summary-next-action:${nextAction}`,
                ],
              },
              verifiedFiles: [],
              unverifiedFiles: [
                {
                  path: "src/partial-ok.txt",
                  reason: stopReason,
                },
                {
                  path: "docs/partial-denied.txt",
                  reason: "write failed: EISDIR",
                },
              ],
              verification: {
                status: "not-requested",
                reason: stopReason,
                nextAction,
              },
              evidence: [
                "mutation-summary-blocker:partial-mutation-failed",
                `mutation-summary-next-action:${nextAction}`,
                "edit/write applied on src/partial-ok.txt",
              ],
              failureBoundary: stopReason,
            },
          },
        };
      },
    });

    await runtime.executePrompt(
      "sess_edit_patch_stopped_compact_surface",
      "edit two files",
    );

    expect(renderedLines).toContain("Result");
    expect(renderedLines).toContain("- Outcome: stopped");
    expect(renderedLines).not.toContain("- Outcome: success");
    expect(renderedLines).not.toContain("- Detail: completed");
    expect(renderedLines).toContain(
      "- BlockerKind: partial-mutation-failed",
    );
    expect(renderedLines).toContain(`- Reason: ${stopReason}`);
    expect(renderedLines).toContain(`- DoNext: ${nextAction}`);
    expect(renderedLines).toContain("Action result");
    expect(renderedLines).toContain("- Changed: 1 file(s)");
    expect(renderedLines).toContain(
      "- Failed files: docs/partial-denied.txt (write failed: EISDIR)",
    );
    expect(renderedLines).toContain(
      "- Failure reason: docs/partial-denied.txt: write failed: EISDIR",
    );
    expect(renderedLines).toContain(`- Next action: ${nextAction}`);
    expect(renderedLines.some((line) => line.startsWith("- Evidence:"))).toBe(
      false,
    );
  });

  it("renders approved execution failures as command failures in compact output", async () => {
    const renderedLines: string[] = [];
    const executionError =
      "Approval denied by user appeared in stderr after execution";
    const stopReason = `Bash execution failed after approval: ${executionError}`;

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
        yield { type: "tool.started", toolName: "bash", taskId: "task_1" };
        yield {
          type: "approval.requested",
          toolName: "bash",
          taskId: "task_1",
        };
        yield {
          type: "approval.resolved",
          toolName: "bash",
          taskId: "task_1",
          outcome: "approved",
        };
        yield {
          type: "tool.result",
          toolName: "bash",
          taskId: "task_1",
          success: false,
        };
        yield {
          type: "query.completed",
          result: {
            status: "stopped_error",
            terminalReason: "stopped_error",
            terminalClassification: "error",
            stopReason,
            transcript: [],
            sharedContext: {
              sessionId: "sess_approved_execution_failure_surface",
              initialPrompt: "run node --version",
              notes: [],
              handoffs: [],
            },
            finalOutput: "",
            codingResult: {
              taskKind: "run-command",
              changedFiles: [],
              failedFiles: [{ path: "(command)", reason: executionError }],
              patches: [],
              repair: {
                status: "failed",
                attempts: 1,
                recoveredItems: [],
                failedItems: ["(command)"],
                notes: [stopReason],
              },
              continuation: {
                status: "failed-after-bounded-continuation",
                attempts: 1,
                evidence: [],
              },
              changeSet: {
                gitAware: false,
                preExistingDirtyFiles: [],
                postRunDirtyFiles: [],
                attemptedFiles: ["(command)"],
                changedFiles: [],
                unchangedAttemptedFiles: ["(command)"],
              },
              taskSatisfaction: {
                verdict: "insufficient-evidence",
                reasons: [stopReason],
                requiredEvidence: ["approved tool execution result"],
                observedEvidence: [],
              },
              verifiedFiles: [],
              unverifiedFiles: [{ path: "(command)", reason: executionError }],
              verification: {
                status: "failed",
                reason: executionError,
                command: "node --version",
                nextAction: undefined,
              },
              evidence: [],
              failureBoundary: stopReason,
              provenance: {
                approvalDecisions: [
                  {
                    kind: "approved",
                    source: "not-required",
                    legacyOutcome: "approved",
                    toolName: "bash",
                    taskId: "task_1",
                  },
                ],
                toolExecutions: [
                  {
                    kind: "executed-failed",
                    source: "tool-runtime",
                    legacySuccess: false,
                    toolName: "bash",
                    taskId: "task_1",
                    failureBoundary: "tool-execution-failed",
                  },
                ],
              },
            },
          },
        };
      },
    });

    await runtime.executePrompt(
      "sess_approved_execution_failure_surface",
      "run node --version",
    );

    expect(
      renderedLines.some((line) => line.includes("Execution summary")),
    ).toBe(true);
    expect(renderedLines.some((line) => line.includes("- Actions: bash"))).toBe(
      true,
    );
    expect(
      renderedLines.some((line) => line.includes("1 failed")),
    ).toBe(true);
    expect(renderedLines).toContain("- Approvals: 1/1 approved");
    expect(renderedLines).toContain("Result");
    expect(renderedLines).toContain("- Outcome: error");
    expect(renderedLines).toContain("Action result");
    expect(renderedLines).toContain(
      `- Failed files: (command) (${executionError})`,
    );
    expect(renderedLines).toContain(
      "- Next action: Inspect the command output/error, fix the execution failure, and rerun the command after approval if still needed.",
    );
    expect(renderedLines).toContain("Next steps");
    expect(renderedLines).toContain(
      "- Tool execution failed after approval; inspect the command output/error.",
    );
    expect(renderedLines).toContain(
      "- Fix the command or environment issue, then rerun the command if still needed.",
    );
    expect(renderedLines).not.toContain(
      "- Submit the prompt again and approve escalation when requested.",
    );
  });

  it("renders explicit approval denial as user-declined in compact output", async () => {
    const renderedLines: string[] = [];
    const stopReason = "Approval denied by user for bash";
    const nextAction =
      "Re-run and approve escalation for verify command execution.";

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
        yield { type: "tool.started", toolName: "bash", taskId: "task_1" };
        yield {
          type: "approval.requested",
          toolName: "bash",
          taskId: "task_1",
        };
        yield {
          type: "approval.resolved",
          toolName: "bash",
          taskId: "task_1",
          outcome: "denied",
        };
        yield {
          type: "query.completed",
          result: {
            status: "stopped_error",
            terminalReason: "stopped_error",
            terminalClassification: "stopped",
            stopReason,
            transcript: [],
            sharedContext: {
              sessionId: "sess_explicit_approval_denied_surface",
              initialPrompt: "run node --version",
              notes: [],
              handoffs: [],
            },
            finalOutput: "",
            codingResult: {
              taskKind: "run-command",
              changedFiles: [],
              failedFiles: [],
              patches: [],
              repair: {
                status: "failed",
                attempts: 1,
                recoveredItems: [],
                failedItems: [],
                notes: [stopReason],
              },
              continuation: {
                status: "failed-after-bounded-continuation",
                attempts: 1,
                evidence: ["verify-blocker-kind:approval-denied"],
              },
              changeSet: {
                gitAware: false,
                preExistingDirtyFiles: [],
                postRunDirtyFiles: [],
                attemptedFiles: [],
                changedFiles: [],
                unchangedAttemptedFiles: [],
              },
              taskSatisfaction: {
                verdict: "not-completed",
                reasons: [stopReason],
                requiredEvidence: ["explicit approval result"],
                observedEvidence: ["verify-blocker-kind:approval-denied"],
              },
              verifiedFiles: [],
              unverifiedFiles: [],
              verification: {
                status: "blocked",
                reason: stopReason,
                blockerKind: "approval-denied",
                command: "node --version",
                nextAction,
              },
              evidence: [
                "verify-blocker-kind:approval-denied",
                `verify-next-action:${nextAction}`,
              ],
              failureBoundary: stopReason,
            },
          },
        };
      },
    });

    await runtime.executePrompt(
      "sess_explicit_approval_denied_surface",
      "run node --version",
    );

    expect(renderedLines).toContain("- Approvals: 0/1 approved");
    expect(renderedLines).toContain("Result");
    expect(renderedLines).toContain("- Outcome: stopped");
    expect(renderedLines).toContain("- BlockerKind: approval-denied");
    expect(renderedLines).toContain(`- Reason: ${stopReason}`);
    expect(renderedLines).toContain(`- DoNext: ${nextAction}`);
    expect(renderedLines).toContain("Action result");
    expect(renderedLines).toContain(`- Next action: ${nextAction}`);
    expect(renderedLines).toContain("Next steps");
    expect(renderedLines).toContain(
      "- Submit the prompt again and approve escalation when requested.",
    );
    expect(renderedLines).not.toContain(
      "- Tool execution failed after approval; inspect the command output/error.",
    );
    expect(renderedLines).not.toContain(
      "- Fix the command or environment issue, then rerun the command if still needed.",
    );
    expect(
      renderedLines.some((line) =>
        line.includes("Bash execution failed after approval"),
      ),
    ).toBe(false);
  });

  it("renders MCP unavailable tool results as stopped without changed files", async () => {
    const renderedLines: string[] = [];
    const reason = "MCP server localSdk requires authentication";
    const nextAction =
      "Run /mcp status and /mcp refresh for the affected server, then retry with a visible executable MCP tool.";

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
          type: "tool.started",
          toolName: "mcp__localSdk__search",
          taskId: "task_mcp_1",
        };
        yield {
          type: "tool.result",
          toolName: "mcp__localSdk__search",
          taskId: "task_mcp_1",
          success: false,
        };
        yield {
          type: "query.completed",
          result: {
            status: "stopped_error",
            terminalReason: "stopped_error",
            terminalClassification: "stopped",
            stopReason: reason,
            transcript: [],
            sharedContext: {
              sessionId: "sess_mcp_unavailable_surface",
              initialPrompt: "use mcp search",
              notes: [],
              handoffs: [],
            },
            finalOutput: "",
            codingResult: {
              taskKind: "run-command",
              changedFiles: [],
              failedFiles: [],
              patches: [],
              repair: {
                status: "failed",
                attempts: 1,
                recoveredItems: [],
                failedItems: [],
                notes: [reason],
              },
              continuation: {
                status: "failed-after-bounded-continuation",
                attempts: 1,
                evidence: ["actionable-blocker-kind:mcp-unavailable"],
              },
              changeSet: {
                gitAware: false,
                preExistingDirtyFiles: [],
                postRunDirtyFiles: [],
                attemptedFiles: [],
                changedFiles: [],
                unchangedAttemptedFiles: [],
              },
              taskSatisfaction: {
                verdict: "insufficient-evidence",
                reasons: [reason],
                requiredEvidence: ["mcp tool execution result"],
                observedEvidence: ["actionable-blocker-kind:mcp-unavailable"],
              },
              verifiedFiles: [],
              unverifiedFiles: [],
              verification: {
                status: "blocked",
                reason,
                blockerKind: "unknown",
                nextAction,
              },
              evidence: ["actionable-blocker-kind:mcp-unavailable"],
              failureBoundary: "unavailable-tool",
              provenance: {
                toolExecutions: [
                  {
                    kind: "unavailable-tool",
                    source: "mcp-registry",
                    legacySuccess: false,
                    toolName: "mcp__localSdk__search",
                    taskId: "task_mcp_1",
                    failureBoundary: "unavailable-tool",
                  },
                ],
              },
            },
          },
        };
      },
    });

    await runtime.executePrompt("sess_mcp_unavailable_surface", "use mcp search");

    expect(renderedLines).toContain("Result");
    expect(renderedLines).toContain("- Outcome: stopped");
    expect(renderedLines).toContain("- BlockerKind: mcp-unavailable");
    expect(renderedLines).toContain(`- Reason: ${reason}`);
    expect(renderedLines).toContain(`- DoNext: ${nextAction}`);
    expect(renderedLines).toContain("Action result");
    expect(renderedLines).toContain("- Changed: none");
    expect(renderedLines).not.toContain(`- Failed files: (tool) (${reason})`);
    expect(renderedLines).toContain(`- Next action: ${nextAction}`);
    expect(renderedLines).not.toContain("- Outcome: success");
  });

  it("prints actionable hints for provider readiness auth/network failures and keeps error persistence", async () => {
    for (const scenario of [
      {
        sessionId: "sess_provider_auth",
        stopReason:
          "Provider readiness failed (provider-readiness:auth): OpenAI authentication was rejected (401/403). Verify OPENAI_API_KEY validity and access scope, then retry.",
        expectedHint:
          "Hint: check provider API key validity/permissions, then submit another prompt.",
        unexpectedDetail: "reconnecting",
      },
      {
        sessionId: "sess_provider_network",
        stopReason:
          "Provider readiness failed (provider-readiness:network): Unable to reach the OpenAI endpoint after 5 reconnect attempts (reconnecting 1/5; reconnecting 2/5; reconnecting 3/5; reconnecting 4/5; reconnecting 5/5). Check network/proxy/firewall settings and retry.",
        expectedHint:
          "Hint: check network/proxy/firewall reachability to the provider endpoint, then submit another prompt.",
        expectedDetail: "reconnecting 1/5; reconnecting 2/5; reconnecting 3/5; reconnecting 4/5; reconnecting 5/5",
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
      if (scenario.expectedDetail) {
        expect(
          renderedLines.some((line) => line.includes(scenario.expectedDetail)),
        ).toBe(true);
      }
      if (scenario.unexpectedDetail) {
        expect(
          renderedLines.some((line) =>
            line.includes(scenario.unexpectedDetail),
          ),
        ).toBe(false);
      }
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
    const originalHome = process.env.HOME;
    const fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-interrupt-kind-"),
    );
    process.env.USERPROFILE = fakeHome;
    process.env.HOME = fakeHome;

    try {
      const manager = new SessionManager();
      const session = manager.createNew();

      const promptInterruptedRuntime = new ShellSessionRuntime({
        sessionManager: manager,
        renderer: { renderLine() {}, renderChunk() {} } as never,
        runPrompt: async function* (_prompt, signal) {
          await new Promise((resolve) => setTimeout(resolve, 0));
          for await (const event of [] as import("../query/runtime/events.js").QueryEvent[]) {
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
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("persists terminal classification from query.completed into state.json", async () => {
    const originalUserProfile = process.env.USERPROFILE;
    const originalHome = process.env.HOME;
    const fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-terminal-state-"),
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
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it("persists true error terminal envelope when query.failed is emitted", async () => {
    const originalUserProfile = process.env.USERPROFILE;
    const originalHome = process.env.HOME;
    const fakeHome = fs.mkdtempSync(
      path.join(os.tmpdir(), "cheers-query-failed-state-"),
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
      if (originalUserProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = originalUserProfile;
      if (originalHome === undefined) delete process.env.HOME;
      else process.env.HOME = originalHome;
      fs.rmSync(fakeHome, { recursive: true, force: true });
    }
  });

  it.each(["empty", "nonterminal", "cancelled"])("never renders success when a %s stream ends without a terminal event", async (kind) => {
    const calls: string[] = [];
    const rendered: string[] = [];
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
        saveInterrupted(sessionId: string) {
          calls.push(`interrupted:${sessionId}`);
        },
        saveError(sessionId: string, error: string) {
          calls.push(`error:${sessionId}:${error}`);
        },
        saveTerminated() {},
      } as never,
      renderer: {
        renderLine(line: string) { rendered.push(line); },
        renderChunk(chunk: string) { rendered.push(chunk); },
      } as never,
      runPrompt: async function* () {
        if (kind === "empty") return;
        yield {
          type: "query.started",
          sessionId: "sess_missing_terminal",
          prompt: "hello",
        };
        yield { type: "turn.started", role: "planner", turn: 1 };
        if (kind === "cancelled") runtime.cancelCurrentRun();
      },
    });

    await expect(
      runtime.executePrompt("sess_missing_terminal", "hello"),
    ).rejects.toThrow("Query runtime ended without a terminal event");
    expect(calls).toEqual([
      "barrier:sess_missing_terminal:hello",
      kind === "cancelled"
        ? "interrupted:sess_missing_terminal"
        : "error:sess_missing_terminal:Query runtime ended without a terminal event",
    ]);
    expect(rendered.join("\n")).not.toMatch(/Outcome: success|Result\n|completed successfully/);
    expect(runtime.getState()).toBe(kind === "cancelled" ? "interrupted" : "error");
  });
});
