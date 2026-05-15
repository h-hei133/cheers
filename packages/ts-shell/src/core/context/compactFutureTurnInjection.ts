import { adaptCompactCheckpointForFutureTurn } from "./compactFutureTurnAdapter.js";
import { formatCompactInjectedContext } from "./compactInjectedContextFormatter.js";
import type { CompactInjectionState } from "./compactInjectionState.js";
import type { CompactLiveCheckpoint } from "./compactLiveCheckpoint.js";

export interface CompactFutureTurnInjectionPlan {
  readonly shouldInject: boolean;
  readonly injectedContext?: string;
  readonly updatedInjectionState: CompactInjectionState;
  readonly warnings: readonly {
    readonly id: string;
    readonly message: string;
  }[];
  readonly evidence: readonly string[];
}

export interface PlanCompactFutureTurnInjectionInput {
  readonly checkpoint?: CompactLiveCheckpoint;
  readonly injectionState: CompactInjectionState;
  readonly markInjected?: (input: {
    readonly sessionScopeId: string;
    readonly checkpointId: string;
  }) => CompactInjectionState;
  readonly markConsumed: (input: {
    readonly sessionScopeId: string;
    readonly checkpointId: string;
  }) => CompactInjectionState;
  readonly markInvalid?: (input: {
    readonly sessionScopeId: string;
    readonly checkpointId?: string;
    readonly reason: string;
  }) => CompactInjectionState;
}

export function planCompactFutureTurnInjection(
  input: PlanCompactFutureTurnInjectionInput,
): CompactFutureTurnInjectionPlan {
  const baseEvidence = [
    "compact-future-turn-injection:planner",
    "compact-future-turn-injection:no-persistence",
    "compact-future-turn-injection:no-provider-call",
    "compact-future-turn-injection:no-edit-mutation",
    "compact-future-turn-injection:no-memory-write",
  ];
  if (!input.checkpoint) {
    return skip(input.injectionState, "no-checkpoint", "No compact checkpoint exists.", baseEvidence);
  }
  if (input.checkpoint.status !== "created") {
    const updated =
      input.markInvalid?.({
        sessionScopeId: input.injectionState.sessionScopeId,
        checkpointId: input.checkpoint.checkpointId,
        reason: `Checkpoint status is ${input.checkpoint.status}.`,
      }) ?? input.injectionState;
    return skip(updated, "checkpoint-not-created", "Compact checkpoint is not active.", baseEvidence);
  }
  if (
    input.injectionState.injectionStatus !== "pending" ||
    input.injectionState.checkpointId !== input.checkpoint.checkpointId
  ) {
    return skip(
      input.injectionState,
      "checkpoint-not-pending",
      "Compact checkpoint is not pending injection.",
      baseEvidence,
    );
  }

  const candidate = adaptCompactCheckpointForFutureTurn(input.checkpoint);
  const serialized = JSON.stringify(candidate);
  if (containsUnsafeContent(serialized)) {
    const updated =
      input.markInvalid?.({
        sessionScopeId: input.injectionState.sessionScopeId,
        checkpointId: input.checkpoint.checkpointId,
        reason: "Adapter payload contained unsafe raw-looking content.",
      }) ?? input.injectionState;
    return skip(updated, "unsafe-adapter-payload", "Adapter payload was rejected.", baseEvidence);
  }

  const injectedContext = formatCompactInjectedContext(candidate);
  input.markInjected?.({
    sessionScopeId: input.injectionState.sessionScopeId,
    checkpointId: input.checkpoint.checkpointId,
  });
  const updatedInjectionState = input.markConsumed({
    sessionScopeId: input.injectionState.sessionScopeId,
    checkpointId: input.checkpoint.checkpointId,
  });

  return {
    shouldInject: true,
    injectedContext,
    updatedInjectionState,
    warnings: candidate.warnings,
    evidence: [
      ...baseEvidence,
      ...candidate.evidence,
      "compact-future-turn-injection:injected-once",
      "compact-future-turn-injection:consumed",
    ],
  };
}

function skip(
  state: CompactInjectionState,
  id: string,
  message: string,
  evidence: readonly string[],
): CompactFutureTurnInjectionPlan {
  return {
    shouldInject: false,
    updatedInjectionState: state,
    warnings: [{ id, message }],
    evidence: [...evidence, `compact-future-turn-injection:skip:${id}`],
  };
}

function containsUnsafeContent(serialized: string): boolean {
  return /\bRAW_[A-Z0-9_]+\b/.test(serialized) || /\bsk-[A-Za-z0-9_-]{8,}\b/.test(serialized);
}
