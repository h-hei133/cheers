import { describe, expect, it } from "vitest";
import { createEmptyLifecycleIndex } from "../../core/tools/toolResultLifecycle.js";
import {
  createQueryRuntimeStateFromSeed,
  ensureQueryRuntimeObservationState,
} from "../../core/query/runtime/state.js";
import { decideQueryRuntimeAction } from "../../core/query/runtime/policy.js";
import { createQueryRuntimeHarnessState } from "../../core/query/runtime/harness.js";
import type { AgentExecutionOutput } from "../../result/types.js";
import type { RecoverySnapshot, TranscriptEvent } from "../SessionManager.js";
import {
  buildReplayTurnPairingState,
  buildResumeReplayInput,
  buildSessionReplayPlan,
  normalizeReplayTranscriptEvents,
  prepareReplayTranscript,
  projectReplayMessages,
} from "./builder.js";

describe("session replay builder", () => {
  it("repairs interrupted replay transcript without changing event order", () => {
    const events: TranscriptEvent[] = [
      {
        type: "lifecycle",
        event: "run-started",
        timestamp: "2026-05-13T00:00:00.000Z",
      },
      {
        type: "query-event",
        event: {
          type: "turn.started",
          role: "planner",
          turn: 1,
        },
        timestamp: "2026-05-13T00:00:02.000Z",
      },
      {
        type: "query-event",
        event: {
          type: "query.completed",
          result: {
            status: "completed",
            terminalReason: "completed",
            terminalClassification: "success",
            transcript: [],
            sharedContext: {
              sessionId: "sess_replay",
              initialPrompt: "update src/a.ts",
              notes: [],
              handoffs: [],
            },
            finalOutput: "done",
          },
        },
        timestamp: "2026-05-13T00:00:03.000Z",
      },
    ];

    const repaired = prepareReplayTranscript(events, {
      sessionId: "sess_replay",
      state: { status: "interrupted", runPhase: "turn-active" },
      pendingPrompt: "update src/a.ts",
      updatedAt: "2026-05-13T00:01:00.000Z",
    });

    expect(repaired.repairSummary).toMatchObject({
      insertedPromptMessage: true,
      insertedQueryStarted: true,
      strippedInterruptedTerminalEvents: 1,
      insertedRunInterrupted: true,
    });
    expect(
      repaired.transcriptEvents.map((event) =>
        event.type === "query-event" ? event.event.type : event.type,
      ),
    ).toEqual(["lifecycle", "message", "query.started", "turn.started", "lifecycle"]);
    expect(projectReplayMessages(repaired.transcriptEvents)).toEqual([
      {
        role: "user",
        content: "update src/a.ts",
        timestamp: "2026-05-13T00:01:00.001Z",
      },
    ]);
  });

  it("builds completed-turn resume input with derived transcript in replay order", () => {
    const plannerOutput = makeOutput("planner", "plan", "coder");
    const coderOutput = makeOutput("coder", "patch ready");
    const snapshot = makeSnapshot([
      turnStarted("planner", 1),
      turnCompleted(plannerOutput),
      turnStarted("coder", 2),
      turnCompleted(coderOutput),
    ]);

    const seed = buildResumeReplayInput({
      sessionId: "sess_replay",
      snapshot,
      options: { maxTurns: 6 },
    });

    expect(seed.config).toMatchObject({
      sessionId: "sess_replay",
      initialPrompt: "update src/a.ts",
      maxTurns: 6,
      startingRole: "planner",
    });
    expect(seed.recoveryBoundary).toBe("completed-turn-reentry");
    expect(seed.currentRole).toBe("planner");
    expect(seed.turn).toBe(3);
    expect(seed.derivedState.transcript).toEqual([plannerOutput, coderOutput]);
    expect(seed.truthBoundary.pairedTurnCount).toBe(2);
  });

  it("restores reason-qualified transition identity from completed replay turns", () => {
    const plannerOutput = makeOutput("planner", "plan", "coder", "inspect contract");
    const coderOutput = makeOutput("coder", "patch ready", "reviewer", "verify target");
    const snapshot = makeSnapshot([
      turnStarted("planner", 1),
      turnCompleted(plannerOutput),
      turnStarted("coder", 2),
      turnCompleted(coderOutput),
    ]);

    const seed = buildResumeReplayInput({
      sessionId: "sess_replay_transitions",
      snapshot,
    });
    const state = createQueryRuntimeStateFromSeed(seed);

    expect([...state.visitedTransitions]).toEqual([
      "planner->coder:inspect contract",
      "coder->reviewer:verify target",
    ]);
  });

  it("downgrades unsafe replay to fresh entry when turn pairing drifts", () => {
    const snapshot = makeSnapshot([
      turnStarted("planner", 1),
      turnStarted("coder", 1),
      turnCompleted(makeOutput("planner", "plan")),
    ]);

    const seed = buildResumeReplayInput({
      sessionId: "sess_replay",
      snapshot,
    });

    expect(seed.recoveryBoundary).toBe("fresh-entry");
    expect(seed.currentRole).toBe("planner");
    expect(seed.turn).toBe(1);
    expect(seed.derivedState.transcript).toEqual([]);
    expect(seed.truthBoundary.repairSummary.ignoredDuplicateTurnStarts).toBe(1);
  });

  it("does not continue stale pending lifecycle after unsafe replay downgrades to fresh entry", () => {
    const pendingLifecycle = createEmptyLifecycleIndex();
    pendingLifecycle.pendingTools.verify_old_turn = {
      toolName: "verify",
      startedAt: "2026-05-13T00:00:01.000Z",
    };
    const snapshot = {
      ...makeSnapshot([
        turnStarted("planner", 1),
        turnStarted("coder", 1),
        turnCompleted(makeOutput("planner", "plan")),
      ]),
      pendingLifecycle,
    };

    const seed = buildResumeReplayInput({
      sessionId: "sess_replay_stale_pending",
      snapshot,
    });
    const state = createQueryRuntimeStateFromSeed(seed);
    const decision = decideQueryRuntimeAction(state);

    expect(seed.recoveryBoundary).toBe("fresh-entry");
    expect(seed.truthBoundary.continuationSafety).toBe("fresh-only");
    expect(state.pendingLifecycle.pendingTools).toEqual({});
    expect(state.pendingLifecycle.pendingApprovals).toEqual({});
    expect(decision.nextAction).not.toBe("continue");
  });

  it("projects replay plan messages and repair counters from the same pairing logic", () => {
    const snapshot = makeSnapshot([
      {
        type: "message",
        role: "assistant",
        content: "",
        timestamp: "2026-05-13T00:00:00.000Z",
      },
      {
        type: "message",
        role: "user",
        content: "continue",
        timestamp: "2026-05-13T00:00:01.000Z",
      },
      turnCompleted(makeOutput("coder", "orphan")),
    ]);
    const normalized = normalizeReplayTranscriptEvents(snapshot.transcriptEvents);

    const plan = buildSessionReplayPlan({
      ...snapshot,
      transcriptEvents: normalized,
    });
    const pairing = buildReplayTurnPairingState(normalized);

    expect(plan.replayMessages).toEqual([
      {
        role: "user",
        content: "continue",
        timestamp: "2026-05-13T00:00:01.000Z",
      },
    ]);
    expect(plan.requiresAssistantSentinel).toBe(true);
    expect(plan.repairSummary.ignoredUnpairedTurnCompletions).toBe(1);
    expect(pairing.ignoredUnpairedTurnCompletions).toBe(1);
  });

  it("restores pending proof facts from persisted replay outputs into runtime observations", () => {
    const pendingArtifactOutput: AgentExecutionOutput = {
      role: "coder",
      content: "artifact proof still pending",
      codingResult: {
        taskKind: "write-file",
        changedFiles: ["src/report.ts"],
        changeSet: { changedFiles: ["src/report.ts"], summary: "updated report" },
        verifiedFiles: [],
        unverifiedFiles: [{ path: "src/report.test.ts", reason: "not rerun after continuation" }],
        failedFiles: [],
        verification: {
          status: "not-requested",
          reason: "pending continuation verification",
        },
        repair: { status: "not-needed", attempts: 0, notes: [] },
        diagnosis: undefined,
        evidence: ["artifact-source:src/report.ts"],
        taskSatisfaction: {
          verdict: "partial",
          requiredEvidence: ["report claim matches source"],
          observedEvidence: [],
          reasons: ["missing proof: artifact claim evidence"],
        },
        continuation: {
          status: "failed-after-bounded-continuation",
          evidence: ["pending artifact verification"],
        },
      },
    };
    const snapshot = makeSnapshot([
      turnStarted("coder", 1),
      turnCompleted(pendingArtifactOutput),
    ]);

    const seed = buildResumeReplayInput({
      sessionId: "sess_replay_proof_facts",
      snapshot,
      options: { maxTurns: 4 },
    });
    const state = createQueryRuntimeStateFromSeed(seed);
    const observations = ensureQueryRuntimeObservationState(state);

    expect(seed.observations).toBeDefined();
    expect(observations.changedFiles).toEqual(["src/report.ts"]);
    expect(observations.verificationTargets).toEqual([
      "src/report.ts",
      "src/report.test.ts",
    ]);
    expect(observations.artifactClaims).toContain("report claim matches source");
    expect(observations.continuationFacts).toContain(
      "pending artifact verification",
    );
    expect(observations.pendingAction).toBe("continue");
  });

  it("restores durable task state from replay and lets normal runtime choose repair", () => {
    const failedOutput: AgentExecutionOutput = {
      role: "coder",
      content: "edited order rules but focused verification failed",
      codingResult: {
        taskKind: "edit-file",
        changedFiles: ["src/order/rules.ts"],
        changeSet: {
          changedFiles: ["src/order/rules.ts"],
          summary: "updated order rules",
        },
        verifiedFiles: [],
        unverifiedFiles: [
          {
            path: "src/order/rules.ts",
            reason: "focused verification failed",
          },
        ],
        failedFiles: [
          {
            path: "src/order/rules.test.ts",
            reason: "expected discounted status",
          },
        ],
        verification: {
          status: "failed",
          command: "npm test -- src/order/rules.test.ts",
          reason: "expected discounted status",
          blockerKind: "test-failed",
          nextAction: "repair order rules and rerun focused verification",
        },
        repair: {
          status: "not-needed",
          attempts: 0,
          notes: [],
        },
        diagnosis: {
          disposition: "grounded-explanation",
          candidateFiles: ["src/order/rules.ts"],
          evidenceFiles: ["src/order/rules.ts", "src/order/rules.test.ts"],
          searchPattern: "discounted status",
          reason: "focused failure points at order rules",
          evidenceNodes: [],
          evidenceLinks: [],
        },
        evidence: ["focused failure receipt"],
        taskSatisfaction: {
          verdict: "partial",
          requiredEvidence: ["focused verification"],
          observedEvidence: [],
          reasons: ["focused verification failed"],
        },
        continuation: {
          status: "failed-after-bounded-continuation",
          evidence: ["pending repair after focused verification failure"],
        },
      },
    };
    const snapshot = makeSnapshot([
      turnStarted("coder", 1),
      turnCompleted(failedOutput),
    ]);

    const seed = buildResumeReplayInput({
      sessionId: "sess_replay_task_state_repair",
      snapshot,
      options: { maxTurns: 4 },
    });
    const state = createQueryRuntimeStateFromSeed(seed);
    const decision = decideQueryRuntimeAction(state);

    expect(seed.taskState).toMatchObject({
      source: "replay",
      pendingAction: "repair",
      changedFiles: ["src/order/rules.ts"],
      unverifiedFiles: ["src/order/rules.ts"],
      originalFailureClassification: "test-failed",
      nextVerificationPlan: {
        command: "npm test -- src/order/rules.test.ts",
        targetFiles: ["src/order/rules.ts", "src/order/rules.test.ts"],
      },
      continuationSafety: { status: "safe" },
    });
    expect(seed.taskState?.proofGap).toContain("verification failed");
    expect(decision.nextAction).toBe("repair");
    expect(decision.changedFiles).toEqual(["src/order/rules.ts"]);
    expect(decision.verificationTargets).toContain("src/order/rules.test.ts");
  });

  it("rejects stale replay task state before it can restore changed-file facts", () => {
    const snapshot = {
      ...makeSnapshot([
        turnStarted("coder", 1),
        turnStarted("reviewer", 1),
        turnCompleted(makeOutput("coder", "drifted output")),
      ]),
      taskState: {
        source: "replay" as const,
        pendingAction: "verify" as const,
        proofGap: ["verification proof missing for changed files"],
        changedFiles: ["src/stale.ts"],
        verifiedFiles: [],
        unverifiedFiles: ["src/stale.ts"],
        failureCategories: ["verification failed"],
        originalFailureClassification: "test-failed",
        repairAttempts: [],
        nextVerificationPlan: {
          command: "npm test -- src/stale.test.ts",
          targetFiles: ["src/stale.ts"],
        },
        artifactPendingState: {
          claims: [],
          evidenceIds: [],
          missingClaims: [],
        },
        continuationSafety: {
          status: "stale" as const,
          reasons: ["turn pairing drift"],
        },
      },
    };

    const seed = buildResumeReplayInput({
      sessionId: "sess_replay_stale_task_state",
      snapshot,
    });
    const state = createQueryRuntimeStateFromSeed(seed);
    const observations = ensureQueryRuntimeObservationState(state);
    const decision = decideQueryRuntimeAction(state);

    expect(seed.recoveryBoundary).toBe("fresh-entry");
    expect(seed.taskState?.continuationSafety.status).toBe("stale");
    expect(observations.changedFiles).toEqual([]);
    expect(decision.nextAction).toBe("search");
    expect(decision.changedFiles).toEqual([]);
  });

  it("restores durable harness queues from replay and lets normal runtime choose targeted verification", () => {
    const snapshot = {
      ...makeSnapshot([
        turnStarted("coder", 1),
        turnCompleted(makeOutput("coder", "write pending verification")),
      ]),
      harness: createQueryRuntimeHarnessState({
        pendingVerification: [
          {
            queueId: "verify-replay-harness",
            targetFiles: ["src/replayHarness.ts"],
            command: "npm test replay-harness",
          },
        ],
      }),
    };

    const seed = buildResumeReplayInput({
      sessionId: "sess_replay_harness_queue",
      snapshot,
    });
    const state = createQueryRuntimeStateFromSeed(seed);
    const decision = decideQueryRuntimeAction(state);

    expect(seed.harness?.pendingVerification).toHaveLength(1);
    expect(decision.nextAction).toBe("verify");
    expect(decision.verificationTargets).toContain("src/replayHarness.ts");
  });

  it("drops stale replay harness queues before normal runtime can act on them", () => {
    const snapshot = {
      ...makeSnapshot([
        turnStarted("coder", 1),
        turnStarted("reviewer", 1),
        turnCompleted(makeOutput("coder", "drifted output")),
      ]),
      harness: createQueryRuntimeHarnessState({
        pendingVerification: [
          {
            queueId: "verify-stale-harness",
            targetFiles: ["src/staleHarness.ts"],
            command: "npm test stale-harness",
          },
        ],
      }),
    };

    const seed = buildResumeReplayInput({
      sessionId: "sess_replay_stale_harness",
      snapshot,
    });
    const state = createQueryRuntimeStateFromSeed(seed);
    const decision = decideQueryRuntimeAction(state);

    expect(seed.recoveryBoundary).toBe("fresh-entry");
    expect(seed.harness).toBeUndefined();
    expect(decision.verificationTargets).not.toContain("src/staleHarness.ts");
  });
});

function makeSnapshot(
  transcriptEvents: readonly TranscriptEvent[],
): RecoverySnapshot {
  return {
    pendingPrompt: "update src/a.ts",
    runPhase: "turn-active",
    interruptedKind: "turn",
    pendingLifecycle: createEmptyLifecycleIndex(),
    repairSummary: {
      insertedPromptMessage: false,
      insertedQueryStarted: false,
      strippedInterruptedTerminalEvents: 0,
      insertedRunInterrupted: false,
      ignoredDuplicateTurnStarts: 0,
      ignoredUnpairedTurnCompletions: 0,
      ignoredRoleMismatchedTurnCompletions: 0,
    },
    lastUserMessage: {
      role: "user",
      content: "update src/a.ts",
      timestamp: "2026-05-13T00:00:00.000Z",
    },
    transcriptEvents: [...transcriptEvents],
  };
}

function turnStarted(
  role: "planner" | "coder" | "reviewer",
  turn: number,
): TranscriptEvent {
  return {
    type: "query-event",
    event: { type: "turn.started", role, turn },
    timestamp: "2026-05-13T00:00:01.000Z",
  };
}

function turnCompleted(output: AgentExecutionOutput): TranscriptEvent {
  return {
    type: "query-event",
    event: { type: "turn.completed", output },
    timestamp: "2026-05-13T00:00:02.000Z",
  };
}

function makeOutput(
  role: "planner" | "coder" | "reviewer",
  content: string,
  handoffTo?: "planner" | "coder" | "reviewer",
  handoffReason = "next",
): AgentExecutionOutput {
  return {
    role,
    content,
    ...(handoffTo ? { handoffTo, handoffReason } : {}),
  };
}
