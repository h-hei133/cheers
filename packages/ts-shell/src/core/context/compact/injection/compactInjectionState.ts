import type { CompactCheckpointSourceCommand } from "../checkpoint/compactLiveCheckpoint.js";

export type CompactInjectionStatus =
  | "none"
  | "pending"
  | "injected"
  | "consumed"
  | "invalid";

export interface CompactInjectionState {
  readonly sessionScopeId: string;
  readonly injectionStatus: CompactInjectionStatus;
  readonly checkpointId?: string;
  readonly createdAt?: string;
  readonly injectedAt?: string;
  readonly consumedAt?: string;
  readonly injectionCount: number;
  readonly sourceCommand?: CompactCheckpointSourceCommand;
  readonly supersededCheckpointIds: readonly string[];
  readonly warnings: readonly {
    readonly id: string;
    readonly message: string;
  }[];
  readonly persistence: "none";
  readonly providerCall: "none";
  readonly evidence: readonly string[];
}

export interface CompactInjectionStateStore {
  get(sessionScopeId: string): CompactInjectionState;
  markPending(input: MarkCompactInjectionPendingInput): CompactInjectionState;
  markInjected(input: MarkCompactInjectionInjectedInput): CompactInjectionState;
  markConsumed(input: MarkCompactInjectionConsumedInput): CompactInjectionState;
  markInvalid(input: MarkCompactInjectionInvalidInput): CompactInjectionState;
  clear(sessionScopeId: string): CompactInjectionState;
}

export interface CompactInjectionStateStoreOptions {
  readonly now?: () => string;
}

export interface MarkCompactInjectionPendingInput {
  readonly sessionScopeId: string;
  readonly checkpointId: string;
  readonly sourceCommand: CompactCheckpointSourceCommand;
  readonly createdAt?: string;
}

export interface MarkCompactInjectionInjectedInput {
  readonly sessionScopeId: string;
  readonly checkpointId: string;
  readonly injectedAt?: string;
}

export interface MarkCompactInjectionConsumedInput {
  readonly sessionScopeId: string;
  readonly checkpointId: string;
  readonly consumedAt?: string;
}

export interface MarkCompactInjectionInvalidInput {
  readonly sessionScopeId: string;
  readonly checkpointId?: string;
  readonly reason: string;
}

export function createCompactInjectionStateStore(
  options: CompactInjectionStateStoreOptions = {},
): CompactInjectionStateStore {
  const states = new Map<string, CompactInjectionState>();
  const now = options.now ?? (() => new Date().toISOString());
  const get = (sessionScopeId: string): CompactInjectionState =>
    states.get(sessionScopeId) ?? emptyState(sessionScopeId);
  const set = (state: CompactInjectionState): CompactInjectionState => {
    states.set(state.sessionScopeId, state);
    return state;
  };

  return {
    get,
    markPending(input) {
      const previous = get(input.sessionScopeId);
      const warnings =
        previous.checkpointId && previous.checkpointId !== input.checkpointId
          ? [
              {
                id: "pending-checkpoint-superseded",
                message: `Pending checkpoint ${previous.checkpointId} was superseded by ${input.checkpointId}.`,
              },
            ]
          : [];
      return set({
        sessionScopeId: input.sessionScopeId,
        injectionStatus: "pending",
        checkpointId: input.checkpointId,
        createdAt: input.createdAt ?? now(),
        injectionCount: 0,
        sourceCommand: input.sourceCommand,
        supersededCheckpointIds:
          previous.checkpointId && previous.checkpointId !== input.checkpointId
            ? [previous.checkpointId, ...previous.supersededCheckpointIds]
            : previous.supersededCheckpointIds,
        warnings,
        persistence: "none",
        providerCall: "none",
        evidence: [
          "compact-injection-state:pending",
          "compact-injection-state:in-memory",
          "compact-injection-state:no-persistence",
          "compact-injection-state:no-provider-call",
        ],
      });
    },
    markInjected(input) {
      const previous = get(input.sessionScopeId);
      if (
        previous.checkpointId !== input.checkpointId ||
        previous.injectionStatus !== "pending"
      ) {
        return previous;
      }
      return set({
        ...previous,
        injectionStatus: "injected",
        injectedAt: input.injectedAt ?? now(),
        injectionCount: previous.injectionCount + 1,
        evidence: [
          ...previous.evidence,
          "compact-injection-state:injected",
        ],
      });
    },
    markConsumed(input) {
      const previous = get(input.sessionScopeId);
      if (
        previous.checkpointId !== input.checkpointId ||
        (previous.injectionStatus !== "injected" &&
          previous.injectionStatus !== "pending")
      ) {
        return previous;
      }
      const injected =
        previous.injectionStatus === "pending"
          ? {
              ...previous,
              injectedAt: input.consumedAt ?? now(),
              injectionCount: previous.injectionCount + 1,
            }
          : previous;
      return set({
        ...injected,
        injectionStatus: "consumed",
        consumedAt: input.consumedAt ?? now(),
        evidence: [
          ...injected.evidence,
          "compact-injection-state:consumed",
        ],
      });
    },
    markInvalid(input) {
      const previous = get(input.sessionScopeId);
      return set({
        ...previous,
        sessionScopeId: input.sessionScopeId,
        injectionStatus: "invalid",
        checkpointId: input.checkpointId ?? previous.checkpointId,
        warnings: [
          ...previous.warnings,
          {
            id: "compact-injection-invalid",
            message: input.reason,
          },
        ],
        evidence: [
          ...previous.evidence,
          "compact-injection-state:invalid",
        ],
      });
    },
    clear(sessionScopeId) {
      const state = emptyState(sessionScopeId);
      states.set(sessionScopeId, state);
      return state;
    },
  };
}

export const DEFAULT_COMPACT_INJECTION_STATE_STORE =
  createCompactInjectionStateStore();

export function markCompactCheckpointPendingInjection(
  store: CompactInjectionStateStore,
  input: MarkCompactInjectionPendingInput,
): CompactInjectionState {
  return store.markPending(input);
}

export function getCompactInjectionState(
  store: CompactInjectionStateStore,
  sessionScopeId: string,
): CompactInjectionState {
  return store.get(sessionScopeId);
}

function emptyState(sessionScopeId: string): CompactInjectionState {
  return {
    sessionScopeId,
    injectionStatus: "none",
    injectionCount: 0,
    supersededCheckpointIds: [],
    warnings: [],
    persistence: "none",
    providerCall: "none",
    evidence: [
      "compact-injection-state:none",
      "compact-injection-state:in-memory",
      "compact-injection-state:no-persistence",
      "compact-injection-state:no-provider-call",
    ],
  };
}
