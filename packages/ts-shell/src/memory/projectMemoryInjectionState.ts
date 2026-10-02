import { RetainedMap, retainHistory, retentionCapacity, type RetentionState, type RetentionStatus } from "../core/state/retention.js";

export const MEMORY_INJECTION_LIMITS = { sessions: 128, history: 256, diagnostics: 256 } as const;

export type ProjectMemoryInjectionStatus =
  | "none"
  | "pending"
  | "injected"
  | "consumed"
  | "invalid"
  | "superseded";

export type ProjectMemoryInjectionSourceCommand = "/memory use" | "internal";
export type ProjectMemoryInjectionMode = "wake" | "recall";

export interface ProjectMemoryInjectionWarning {
  readonly id: string;
  readonly message: string;
}

export interface ProjectMemoryInjectionState extends RetentionState {
  readonly sessionScopeId: string;
  readonly injectionStatus: ProjectMemoryInjectionStatus;
  readonly memoryInjectionId?: string;
  readonly sourceCommand?: ProjectMemoryInjectionSourceCommand;
  readonly mode?: ProjectMemoryInjectionMode;
  readonly query?: string;
  readonly recordIds: readonly string[];
  readonly createdAt?: string;
  readonly injectedAt?: string;
  readonly consumedAt?: string;
  readonly supersededInjectionIds: readonly string[];
  readonly warnings: readonly ProjectMemoryInjectionWarning[];
  readonly redactions: readonly string[];
  readonly persistence: "none";
  readonly providerCall: "none";
  readonly evidence: readonly string[];
}

export interface ProjectMemoryInjectionStateStore {
  retention(): RetentionStatus;
  get(sessionScopeId: string): ProjectMemoryInjectionState;
  markPending(input: MarkProjectMemoryInjectionPendingInput): ProjectMemoryInjectionState;
  markInjected(input: MarkProjectMemoryInjectionInjectedInput): ProjectMemoryInjectionState;
  markConsumed(input: MarkProjectMemoryInjectionConsumedInput): ProjectMemoryInjectionState;
  markInvalid(input: MarkProjectMemoryInjectionInvalidInput): ProjectMemoryInjectionState;
  clear(sessionScopeId: string): ProjectMemoryInjectionState;
}

export interface ProjectMemoryInjectionStateStoreOptions {
  readonly sessionCapacity?: number;
  readonly historyCapacity?: number;
  readonly now?: () => string;
  readonly nextId?: () => string;
}

export interface MarkProjectMemoryInjectionPendingInput {
  readonly sessionScopeId: string;
  readonly sourceCommand: ProjectMemoryInjectionSourceCommand;
  readonly mode: ProjectMemoryInjectionMode;
  readonly query?: string;
  readonly recordIds: readonly string[];
  readonly warnings?: readonly ProjectMemoryInjectionWarning[];
  readonly redactions?: readonly string[];
  readonly createdAt?: string;
}

export interface MarkProjectMemoryInjectionInjectedInput {
  readonly sessionScopeId: string;
  readonly memoryInjectionId: string;
  readonly injectedAt?: string;
}

export interface MarkProjectMemoryInjectionConsumedInput {
  readonly sessionScopeId: string;
  readonly memoryInjectionId: string;
  readonly consumedAt?: string;
}

export interface MarkProjectMemoryInjectionInvalidInput {
  readonly sessionScopeId: string;
  readonly memoryInjectionId?: string;
  readonly reason: string;
}

export function createProjectMemoryInjectionStateStore(
  options: ProjectMemoryInjectionStateStoreOptions = {},
): ProjectMemoryInjectionStateStore {
  const states = new RetainedMap<string, ProjectMemoryInjectionState>(options.sessionCapacity ?? MEMORY_INJECTION_LIMITS.sessions);
  const historyCapacity = retentionCapacity(options.historyCapacity ?? MEMORY_INJECTION_LIMITS.history);
  const now = options.now ?? (() => new Date().toISOString());
  const nextId = options.nextId ?? (() => `pmi:${cryptoRandomId()}`);
  const get = (sessionScopeId: string): ProjectMemoryInjectionState =>
    states.get(sessionScopeId) ?? { ...emptyState(sessionScopeId), incomplete: states.retention().incomplete };
  const set = (state: ProjectMemoryInjectionState): ProjectMemoryInjectionState => {
    const history = retainHistory(state.supersededInjectionIds, historyCapacity, state.dropped);
    const warnings = retainHistory([...state.warnings].reverse(), MEMORY_INJECTION_LIMITS.diagnostics, history.dropped);
    const evidence = retainHistory([...state.evidence].reverse(), MEMORY_INJECTION_LIMITS.diagnostics, warnings.dropped);
    const retained = { ...state, supersededInjectionIds: history.items,
      warnings: [...warnings.items].reverse(), evidence: [...evidence.items].reverse(),
      dropped: evidence.dropped, incomplete: state.incomplete || evidence.incomplete };
    states.set(state.sessionScopeId, retained);
    return retained;
  };

  return {
    retention: () => states.retention(),
    get,
    markPending(input) {
      const previous = get(input.sessionScopeId);
      const memoryInjectionId = nextId();
      const superseded =
        previous.injectionStatus === "pending" && previous.memoryInjectionId
          ? [previous.memoryInjectionId, ...previous.supersededInjectionIds]
          : previous.supersededInjectionIds;
      const warnings = [
        ...(input.warnings ?? []),
        ...(previous.injectionStatus === "pending" && previous.memoryInjectionId
          ? [{
              id: "pending-memory-injection-superseded",
              message: `Pending memory injection ${previous.memoryInjectionId} was superseded by ${memoryInjectionId}.`,
            }]
          : []),
      ];
      return set({
        sessionScopeId: input.sessionScopeId,
        injectionStatus: "pending",
        dropped: previous.dropped,
        incomplete: previous.incomplete,
        memoryInjectionId,
        sourceCommand: input.sourceCommand,
        mode: input.mode,
        query: normalizeQuery(input.query),
        recordIds: [...input.recordIds],
        createdAt: input.createdAt ?? now(),
        supersededInjectionIds: superseded,
        warnings,
        redactions: [...(input.redactions ?? [])],
        persistence: "none",
        providerCall: "none",
        evidence: [
          "project-memory-injection-state:pending",
          "project-memory-injection-state:in-memory",
          "project-memory-injection-state:no-persistence",
          "project-memory-injection-state:no-provider-call",
        ],
      });
    },
    markInjected(input) {
      const previous = get(input.sessionScopeId);
      if (
        previous.injectionStatus !== "pending" ||
        previous.memoryInjectionId !== input.memoryInjectionId
      ) {
        return previous;
      }
      return set({
        ...previous,
        injectionStatus: "injected",
        injectedAt: input.injectedAt ?? now(),
        evidence: [...previous.evidence, "project-memory-injection-state:injected"],
      });
    },
    markConsumed(input) {
      const previous = get(input.sessionScopeId);
      if (
        previous.memoryInjectionId !== input.memoryInjectionId ||
        (previous.injectionStatus !== "pending" && previous.injectionStatus !== "injected")
      ) {
        return previous;
      }
      const injected =
        previous.injectionStatus === "pending"
          ? {
              ...previous,
              injectionStatus: "injected" as const,
              injectedAt: input.consumedAt ?? now(),
              evidence: [...previous.evidence, "project-memory-injection-state:injected"],
            }
          : previous;
      return set({
        ...injected,
        injectionStatus: "consumed",
        consumedAt: input.consumedAt ?? now(),
        evidence: [...injected.evidence, "project-memory-injection-state:consumed"],
      });
    },
    markInvalid(input) {
      const previous = get(input.sessionScopeId);
      if (input.memoryInjectionId && previous.memoryInjectionId !== input.memoryInjectionId) return previous;
      return set({
        ...previous,
        sessionScopeId: input.sessionScopeId,
        injectionStatus: "invalid",
        memoryInjectionId: input.memoryInjectionId ?? previous.memoryInjectionId,
        warnings: [
          ...previous.warnings,
          { id: "project-memory-injection-invalid", message: input.reason },
        ],
        evidence: [...previous.evidence, "project-memory-injection-state:invalid"],
      });
    },
    clear(sessionScopeId) {
      const state = emptyState(sessionScopeId);
      states.delete(sessionScopeId);
      return state;
    },
  };
}

export const DEFAULT_PROJECT_MEMORY_INJECTION_STATE_STORE =
  createProjectMemoryInjectionStateStore();

function emptyState(sessionScopeId: string): ProjectMemoryInjectionState {
  return {
    sessionScopeId,
    injectionStatus: "none",
    dropped: 0,
    incomplete: false,
    recordIds: [],
    supersededInjectionIds: [],
    warnings: [],
    redactions: [],
    persistence: "none",
    providerCall: "none",
    evidence: [
      "project-memory-injection-state:none",
      "project-memory-injection-state:in-memory",
      "project-memory-injection-state:no-persistence",
      "project-memory-injection-state:no-provider-call",
    ],
  };
}

function normalizeQuery(query: string | undefined): string | undefined {
  const normalized = query?.replace(/\s+/g, " ").trim();
  return normalized ? normalized : undefined;
}

function cryptoRandomId(): string {
  return Math.random().toString(16).slice(2, 14);
}
