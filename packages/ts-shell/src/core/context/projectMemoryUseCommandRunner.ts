import {
  DEFAULT_PROJECT_MEMORY_INJECTION_STATE_STORE,
  type ProjectMemoryInjectionState,
  type ProjectMemoryInjectionStateStore,
} from "./projectMemoryInjectionState.js";
import { renderProjectMemoryInjectionSurface } from "./projectMemoryInjectionSurface.js";
import type { ProjectMemoryUseCommandRequest } from "./projectMemoryUseCommandContract.js";
import { retrieveProjectMemoryRecords } from "./projectMemoryRetrieval.js";
import type { ProjectMemoryStore } from "./projectMemoryStoreContract.js";
import { buildProjectMemoryWakeupPreview } from "./projectMemoryWakeup.js";

export type ProjectMemoryUseCommandOutcome = "staged" | "blocked";

export interface RunProjectMemoryUseCommandInput {
  readonly request: ProjectMemoryUseCommandRequest;
  readonly sessionScopeId: string;
  readonly memoryStore?: ProjectMemoryStore;
  readonly injectionStateStore?: ProjectMemoryInjectionStateStore;
}

export interface ProjectMemoryUseCommandResult {
  readonly outcome: ProjectMemoryUseCommandOutcome;
  readonly state: ProjectMemoryInjectionState;
  readonly output: string;
  readonly providerCall: "none";
  readonly persistence: "none";
  readonly autoInjected: false;
  readonly evidence: readonly string[];
}

export async function runProjectMemoryUseCommand(
  input: RunProjectMemoryUseCommandInput,
): Promise<ProjectMemoryUseCommandResult> {
  const injectionStateStore =
    input.injectionStateStore ?? DEFAULT_PROJECT_MEMORY_INJECTION_STATE_STORE;
  if (!input.memoryStore) {
    return blocked(input, injectionStateStore.get(input.sessionScopeId), "Explicit local memory store root is required.");
  }
  const health = await input.memoryStore.health();
  if (!health.writable) {
    return blocked(input, injectionStateStore.get(input.sessionScopeId), "Explicit local memory store root is not writable.");
  }

  const selected =
    input.request.mode === "wake"
      ? await selectWakeRecords(input.memoryStore)
      : await selectRecallRecords(input.memoryStore, input.request.query);
  if (selected.recordIds.length === 0) {
    return blocked(input, injectionStateStore.get(input.sessionScopeId), "No saved project memory records matched this /memory use request.");
  }

  const state = injectionStateStore.markPending({
    sessionScopeId: input.sessionScopeId,
    sourceCommand: "/memory use",
    mode: input.request.mode,
    query: input.request.query,
    recordIds: selected.recordIds,
    warnings: selected.warnings,
    redactions: selected.redactions,
  });
  return {
    outcome: "staged",
    state,
    output: renderProjectMemoryInjectionSurface({
      outcome: "staged",
      state,
    }),
    providerCall: "none",
    persistence: "none",
    autoInjected: false,
    evidence: [
      ...input.request.evidence,
      ...health.evidence,
      ...selected.evidence,
      ...state.evidence,
      "project-memory-use-command-runner:explicit-opt-in",
      "project-memory-use-command-runner:staged-for-next-normal-turn",
      "project-memory-use-command-runner:no-provider-call",
      "project-memory-use-command-runner:no-persistence",
    ],
  };
}

async function selectWakeRecords(store: ProjectMemoryStore): Promise<{
  readonly recordIds: readonly string[];
  readonly redactions: readonly string[];
  readonly warnings: readonly { readonly id: string; readonly message: string }[];
  readonly evidence: readonly string[];
}> {
  const wakeup = await buildProjectMemoryWakeupPreview(store);
  const records = [...wakeup.l0.records, ...wakeup.l1.records];
  return {
    recordIds: records.map((record) => record.id),
    redactions: unique(records.flatMap((record) => record.redactions)),
    warnings: wakeup.warnings.map((message) => ({ id: message, message })),
    evidence: wakeup.evidence,
  };
}

async function selectRecallRecords(
  store: ProjectMemoryStore,
  query: string | undefined,
): Promise<{
  readonly recordIds: readonly string[];
  readonly redactions: readonly string[];
  readonly warnings: readonly { readonly id: string; readonly message: string }[];
  readonly evidence: readonly string[];
}> {
  const retrieval = await retrieveProjectMemoryRecords(store, {
    query,
    maxResults: 5,
  });
  return {
    recordIds: retrieval.matches.map((match) => match.record.id),
    redactions: unique(retrieval.matches.flatMap((match) => match.record.redactions)),
    warnings: retrieval.matches.map((match) => ({
      id: `match:${match.record.id}`,
      message: `score=${match.score}; reasons=${match.reasons.join(",") || "none"}`,
    })),
    evidence: retrieval.evidence,
  };
}

function blocked(
  input: RunProjectMemoryUseCommandInput,
  state: ProjectMemoryInjectionState,
  blocker: string,
): ProjectMemoryUseCommandResult {
  return {
    outcome: "blocked",
    state,
    output: renderProjectMemoryInjectionSurface({
      outcome: "blocked",
      state,
      blocker,
    }),
    providerCall: "none",
    persistence: "none",
    autoInjected: false,
    evidence: [
      ...input.request.evidence,
      "project-memory-use-command-runner:blocked",
      "project-memory-use-command-runner:no-provider-call",
      "project-memory-use-command-runner:no-persistence",
    ],
  };
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
