import type { QueryEvent } from "../../core/query/runtime/events.js";
import { deriveQueryRuntimeObservationState } from "../../core/query/runtime/observation.js";
import type {
  ContinuationEvidenceToken,
  ContinuationPolicyEvidence,
  ContinuationSafety,
  QueryRuntimeRecoveryBoundary,
  QueryRuntimeRepairSummary,
  QueryRuntimeStateSeed,
} from "../../core/query/runtime/state.js";
import {
  buildContinuationPolicyEvidence,
  CONTINUATION_SAFETY_POLICY,
  resolveContinuationSafety,
} from "../../core/query/runtime/state.js";
import type {
  AgentExecutionOutput,
  AgentRole,
  ContinuationReason,
} from "../../orchestration/types.js";
import type { RecoverySnapshot } from "../recovery/sessionRecoverySnapshot.js";
import type { ReplayPlan } from "./sessionReplayFacade.js";
import type { SessionMessage } from "../schema/sessionMessage.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";

export interface ReplayTranscriptState {
  readonly status: "active" | "interrupted" | "completed" | "error" | "terminated";
  readonly runPhase?: "idle" | "prompt-persisted" | "turn-active";
}

export interface ReplayTranscriptRepairContext {
  readonly sessionId: string;
  readonly state: ReplayTranscriptState;
  readonly pendingPrompt?: string;
  readonly updatedAt: string;
}

export interface ReplayPreparation {
  readonly transcriptEvents: TranscriptEvent[];
  readonly repairSummary: QueryRuntimeRepairSummary;
}

export interface RuntimeSeedOptions {
  readonly maxTurns?: number;
  readonly fallbackStartingRole?: AgentRole;
}

type TurnStartedQueryEvent = Extract<QueryEvent, { type: "turn.started" }>;

export interface TurnPairingState {
  readonly pairedTurns: Array<{
    readonly started: TurnStartedQueryEvent;
    readonly output: AgentExecutionOutput;
  }>;
  readonly openTurn?: TurnStartedQueryEvent;
  readonly ignoredDuplicateTurnStarts: number;
  readonly ignoredUnpairedTurnCompletions: number;
  readonly ignoredRoleMismatchedTurnCompletions: number;
}

export function normalizeReplayTranscriptEvents(
  events: readonly TranscriptEvent[],
): TranscriptEvent[] {
  return events.filter((event) => {
    if (
      event.type === "message" &&
      event.role === "assistant" &&
      event.content.trim().length === 0
    ) {
      return false;
    }

    return true;
  });
}

export function prepareReplayTranscript(
  events: readonly TranscriptEvent[],
  context: ReplayTranscriptRepairContext,
): ReplayPreparation {
  const repaired = [...events];
  const baseTimestamp = new Date(context.updatedAt).getTime();
  let syntheticOffset = 0;
  let insertedPromptMessage = false;
  let insertedQueryStarted = false;
  let insertedRunInterrupted = false;

  const nextSyntheticTimestamp = (): string => {
    syntheticOffset += 1;
    return new Date(baseTimestamp + syntheticOffset).toISOString();
  };

  if (context.pendingPrompt) {
    const normalizedPrompt = context.pendingPrompt.trim();
    const hasPromptMessage = repaired.some(
      (event): event is Extract<TranscriptEvent, { type: "message" }> =>
        event.type === "message" &&
        event.role === "user" &&
        event.content.trim() === normalizedPrompt,
    );

    if (!hasPromptMessage && context.state.runPhase !== "idle") {
      const runStartedIndex = repaired.findIndex(
        (event): event is Extract<TranscriptEvent, { type: "lifecycle" }> =>
          event.type === "lifecycle" && event.event === "run-started",
      );
      const insertionIndex = runStartedIndex === -1 ? 0 : runStartedIndex + 1;
      repaired.splice(insertionIndex, 0, {
        type: "message",
        role: "user",
        content: context.pendingPrompt,
        timestamp: nextSyntheticTimestamp(),
      });
      insertedPromptMessage = true;
    }
  }

  const hasQueryStarted = repaired.some(
    (event): event is Extract<TranscriptEvent, { type: "query-event" }> =>
      event.type === "query-event" && event.event.type === "query.started",
  );
  const firstQueryEventIndex = repaired.findIndex(
    (event) => event.type === "query-event",
  );
  const hasQueryPhaseEvents = repaired.some(
    (event): event is Extract<TranscriptEvent, { type: "query-event" }> =>
      event.type === "query-event" && event.event.type !== "query.started",
  );

  if (
    context.state.runPhase === "turn-active" &&
    context.pendingPrompt &&
    hasQueryPhaseEvents &&
    !hasQueryStarted
  ) {
    repaired.splice(
      firstQueryEventIndex === -1 ? repaired.length : firstQueryEventIndex,
      0,
      {
        type: "query-event",
        event: {
          type: "query.started",
          sessionId: context.sessionId,
          prompt: context.pendingPrompt,
        },
        timestamp: nextSyntheticTimestamp(),
      },
    );
    insertedQueryStarted = true;
  }

  const interruptedTerminalQueries = repaired.filter(
    (event): boolean =>
      event.type === "query-event" &&
      (event.event.type === "query.completed" ||
        event.event.type === "query.failed"),
  ).length;

  const withoutInterruptedTerminalQueries =
    context.state.status === "interrupted"
      ? repaired.filter(
          (event): boolean =>
            event.type !== "query-event" ||
            (event.event.type !== "query.completed" &&
              event.event.type !== "query.failed"),
        )
      : repaired;

  const hasRunInterrupted = withoutInterruptedTerminalQueries.some(
    (event): event is Extract<TranscriptEvent, { type: "lifecycle" }> =>
      event.type === "lifecycle" && event.event === "run-interrupted",
  );

  if (context.state.status === "interrupted" && !hasRunInterrupted) {
    withoutInterruptedTerminalQueries.push({
      type: "lifecycle",
      event: "run-interrupted",
      timestamp: nextSyntheticTimestamp(),
      detail: context.pendingPrompt,
    });
    insertedRunInterrupted = true;
  }

  return {
    transcriptEvents: withoutInterruptedTerminalQueries,
    repairSummary: {
      insertedPromptMessage,
      insertedQueryStarted,
      strippedInterruptedTerminalEvents:
        context.state.status === "interrupted" ? interruptedTerminalQueries : 0,
      insertedRunInterrupted,
      ignoredDuplicateTurnStarts: 0,
      ignoredUnpairedTurnCompletions: 0,
      ignoredRoleMismatchedTurnCompletions: 0,
    },
  };
}

export function buildReplayTurnPairingState(
  transcriptEvents: readonly TranscriptEvent[],
): TurnPairingState {
  const pairedTurns: Array<{
    started: TurnStartedQueryEvent;
    output: AgentExecutionOutput;
  }> = [];
  let openTurn: TurnStartedQueryEvent | undefined;
  let ignoredDuplicateTurnStarts = 0;
  let ignoredUnpairedTurnCompletions = 0;
  let ignoredRoleMismatchedTurnCompletions = 0;

  for (const event of transcriptEvents) {
    if (event.type !== "query-event") {
      continue;
    }

    if (event.event.type === "turn.started") {
      if (!openTurn) {
        openTurn = event.event;
      } else if (
        openTurn.role !== event.event.role ||
        openTurn.turn !== event.event.turn
      ) {
        ignoredDuplicateTurnStarts += 1;
      }
      continue;
    }

    if (event.event.type === "turn.completed") {
      if (openTurn && openTurn.role === event.event.output.role) {
        pairedTurns.push({ started: openTurn, output: event.event.output });
        openTurn = undefined;
      } else if (openTurn) {
        ignoredRoleMismatchedTurnCompletions += 1;
      } else {
        ignoredUnpairedTurnCompletions += 1;
      }
    }
  }

  return {
    pairedTurns,
    openTurn,
    ignoredDuplicateTurnStarts,
    ignoredUnpairedTurnCompletions,
    ignoredRoleMismatchedTurnCompletions,
  };
}

export function buildSessionReplayPlan(
  snapshot: RecoverySnapshot,
): ReplayPlan {
  const replayMessages = projectReplayMessages(snapshot.transcriptEvents);
  const lastReplayMessage = replayMessages[replayMessages.length - 1];
  const continuationPrompt =
    snapshot.interruptedKind === "turn"
      ? "Continue from where you left off."
      : snapshot.interruptedKind === "prompt"
        ? snapshot.pendingPrompt
        : undefined;
  const turnPairing = buildReplayTurnPairingState(snapshot.transcriptEvents);

  return {
    normalizedTranscriptEvents: snapshot.transcriptEvents,
    replayMessages,
    continuationPrompt,
    requiresAssistantSentinel: lastReplayMessage?.role === "user",
    repairSummary: buildReplayRepairSummary(snapshot.repairSummary, turnPairing),
  };
}

export function buildResumeReplayInput(input: {
  readonly sessionId: string;
  readonly snapshot: RecoverySnapshot;
  readonly options?: RuntimeSeedOptions;
}): QueryRuntimeStateSeed {
  const turnPairing = buildReplayTurnPairingState(input.snapshot.transcriptEvents);
  const turnCompletedOutputs = turnPairing.pairedTurns.map((turn) => turn.output);

  const initialPrompt =
    input.snapshot.pendingPrompt ??
    input.snapshot.lastUserMessage?.content ??
    "";
  const startingRole =
    turnPairing.pairedTurns[0]?.started.role ??
    turnPairing.openTurn?.role ??
    turnCompletedOutputs[0]?.role ??
    input.options?.fallbackStartingRole ??
    "planner";
  const lastCompletedOutput =
    turnCompletedOutputs[turnCompletedOutputs.length - 1];
  const lastPairedTurn =
    turnPairing.pairedTurns[turnPairing.pairedTurns.length - 1]?.started;
  const driftSummary = buildReplayRepairSummary(
    input.snapshot.repairSummary,
    turnPairing,
  );
  const driftCount =
    driftSummary.ignoredDuplicateTurnStarts +
    driftSummary.ignoredUnpairedTurnCompletions +
    driftSummary.ignoredRoleMismatchedTurnCompletions;

  const computedBoundary: QueryRuntimeRecoveryBoundary = turnPairing.openTurn
    ? "mid-turn-reentry"
    : turnPairing.pairedTurns.length > 0
      ? "completed-turn-reentry"
      : "fresh-entry";
  const hasPendingLifecycle =
    Object.keys(input.snapshot.pendingLifecycle.pendingApprovals).length > 0 ||
    Object.keys(input.snapshot.pendingLifecycle.pendingTools).length > 0;
  const policyEvidenceTokens: ContinuationEvidenceToken[] = [];
  if (computedBoundary === "mid-turn-reentry") {
    policyEvidenceTokens.push("open-turn");
  }
  if (turnPairing.pairedTurns.length > 0) {
    policyEvidenceTokens.push("paired-turns");
  }
  if (hasPendingLifecycle) {
    policyEvidenceTokens.push("pending-lifecycle");
  }
  if (driftCount > 0) {
    policyEvidenceTokens.push("repair-drift");
  }
  const policyEvidence: ContinuationPolicyEvidence =
    buildContinuationPolicyEvidence(policyEvidenceTokens);
  const continuationSafety: ContinuationSafety = resolveContinuationSafety({
    evidence: policyEvidence,
  });
  const continuationPolicy = CONTINUATION_SAFETY_POLICY[continuationSafety];
  const recoveryBoundary: QueryRuntimeRecoveryBoundary =
    continuationPolicy.runtimeRecoveryBoundary;

  const currentRole = continuationPolicy.resetToStartingRole
    ? startingRole
    : recoveryBoundary === "mid-turn-reentry"
      ? turnPairing.openTurn!.role
      : (lastCompletedOutput?.handoffTo ?? startingRole);
  const turn = continuationPolicy.resetToStartingRole
    ? 1
    : recoveryBoundary === "mid-turn-reentry"
      ? turnPairing.openTurn!.turn
      : (lastPairedTurn?.turn ?? 0) + 1;

  return {
    config: {
      sessionId: input.sessionId,
      initialPrompt,
      maxTurns: input.options?.maxTurns ?? 12,
      startingRole,
    },
    currentRole,
    turn,
    lastContinuationReason: input.snapshot.lastContinuationReason,
    pendingLifecycle: input.snapshot.pendingLifecycle,
    recoveryBoundary,
    truthBoundary: {
      source: "durable-replay",
      normalizedEventCount: input.snapshot.transcriptEvents.length,
      pairedTurnCount: turnPairing.pairedTurns.length,
      policyEvidence,
      repairSummary: driftSummary,
      continuationSafety,
      openTurn:
        recoveryBoundary === "mid-turn-reentry" && turnPairing.openTurn
          ? {
              role: turnPairing.openTurn.role,
              turn: turnPairing.openTurn.turn,
            }
          : undefined,
    },
    derivedState: {
      transcript: continuationPolicy.allowDerivedContext
        ? turnCompletedOutputs
        : [],
    },
    ...(continuationPolicy.allowDerivedContext
      ? { observations: deriveQueryRuntimeObservationState(turnCompletedOutputs) }
      : {}),
  };
}

export function projectReplayMessages(
  transcriptEvents: readonly TranscriptEvent[],
): SessionMessage[] {
  return transcriptEvents
    .filter(
      (event): event is Extract<TranscriptEvent, { type: "message" }> =>
        event.type === "message",
    )
    .map((event) => ({
      role: event.role,
      content: event.content,
      timestamp: event.timestamp,
    }));
}

function buildReplayRepairSummary(
  repairSummary: QueryRuntimeRepairSummary,
  turnPairing: TurnPairingState,
): QueryRuntimeRepairSummary {
  return {
    ...repairSummary,
    ignoredDuplicateTurnStarts: turnPairing.ignoredDuplicateTurnStarts,
    ignoredUnpairedTurnCompletions:
      turnPairing.ignoredUnpairedTurnCompletions,
    ignoredRoleMismatchedTurnCompletions:
      turnPairing.ignoredRoleMismatchedTurnCompletions,
  };
}
