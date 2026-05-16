import {
  adaptProjectMemoryRecallForFutureTurn,
  adaptProjectMemoryWakeupForFutureTurn,
} from "./projectMemoryFutureTurnAdapter.js";
import { formatProjectMemoryInjectedContext } from "./projectMemoryInjectedContextFormatter.js";
import type { ProjectMemoryInjectionState } from "./projectMemoryInjectionState.js";
import { retrieveProjectMemoryRecords } from "./projectMemoryRetrieval.js";
import type { ProjectMemoryStore } from "./projectMemoryStoreContract.js";
import { buildProjectMemoryWakeupPreview } from "./projectMemoryWakeup.js";

export interface ProjectMemoryFutureTurnInjectionPlan {
  readonly shouldInject: boolean;
  readonly injectedContext?: string;
  readonly updatedInjectionState: ProjectMemoryInjectionState;
  readonly warnings: readonly { readonly id: string; readonly message: string }[];
  readonly evidence: readonly string[];
}

export interface PlanProjectMemoryFutureTurnInjectionInput {
  readonly memoryStore?: ProjectMemoryStore;
  readonly injectionState: ProjectMemoryInjectionState;
  readonly markInjected?: (input: {
    readonly sessionScopeId: string;
    readonly memoryInjectionId: string;
  }) => ProjectMemoryInjectionState;
  readonly markConsumed: (input: {
    readonly sessionScopeId: string;
    readonly memoryInjectionId: string;
  }) => ProjectMemoryInjectionState;
  readonly markInvalid?: (input: {
    readonly sessionScopeId: string;
    readonly memoryInjectionId?: string;
    readonly reason: string;
  }) => ProjectMemoryInjectionState;
}

export async function planProjectMemoryFutureTurnInjection(
  input: PlanProjectMemoryFutureTurnInjectionInput,
): Promise<ProjectMemoryFutureTurnInjectionPlan> {
  const baseEvidence = [
    "project-memory-future-turn-injection:planner",
    "project-memory-future-turn-injection:no-persistence",
    "project-memory-future-turn-injection:no-provider-call",
    "project-memory-future-turn-injection:no-store-write",
    "project-memory-future-turn-injection:no-edit-mutation",
  ];
  const state = input.injectionState;
  if (state.injectionStatus !== "pending" || !state.memoryInjectionId || !state.mode) {
    return skip(state, "memory-injection-not-pending", "No pending project memory injection.", baseEvidence);
  }
  if (!input.memoryStore) {
    return invalid(input, "memory-store-missing", "Explicit local memory store is required.", baseEvidence);
  }
  const health = await input.memoryStore.health();
  if (!health.writable) {
    return invalid(input, "memory-store-not-writable", "Explicit local memory store is not writable.", [
      ...baseEvidence,
      ...health.evidence,
    ]);
  }

  const candidate =
    state.mode === "wake"
      ? adaptProjectMemoryWakeupForFutureTurn({
          injectionId: state.memoryInjectionId,
          wakeup: await buildProjectMemoryWakeupPreview(input.memoryStore),
        })
      : adaptProjectMemoryRecallForFutureTurn({
          injectionId: state.memoryInjectionId,
          retrieval: await retrieveProjectMemoryRecords(input.memoryStore, {
            query: state.query,
            maxResults: 5,
          }),
        });

  if (candidate.recordIds.length === 0) {
    return invalid(input, "memory-records-empty", "No injectable project memory records were found.", [
      ...baseEvidence,
      ...candidate.evidence,
    ]);
  }
  if (candidate.injectionStatus === "blocked") {
    return invalid(input, "memory-adapter-blocked", "Project memory adapter rejected unsafe content.", [
      ...baseEvidence,
      ...candidate.evidence,
    ]);
  }

  const injectedContext = formatProjectMemoryInjectedContext(candidate);
  if (containsUnsafeContent(injectedContext)) {
    return invalid(input, "unsafe-injected-context", "Formatted project memory context contained unsafe raw-looking content.", [
      ...baseEvidence,
      ...candidate.evidence,
    ]);
  }

  input.markInjected?.({
    sessionScopeId: state.sessionScopeId,
    memoryInjectionId: state.memoryInjectionId,
  });
  const updatedInjectionState = input.markConsumed({
    sessionScopeId: state.sessionScopeId,
    memoryInjectionId: state.memoryInjectionId,
  });
  return {
    shouldInject: true,
    injectedContext,
    updatedInjectionState,
    warnings: candidate.warnings,
    evidence: [
      ...baseEvidence,
      ...candidate.evidence,
      "project-memory-future-turn-injection:injected-once",
      "project-memory-future-turn-injection:consumed",
    ],
  };
}

function invalid(
  input: PlanProjectMemoryFutureTurnInjectionInput,
  id: string,
  message: string,
  evidence: readonly string[],
): ProjectMemoryFutureTurnInjectionPlan {
  const updated =
    input.markInvalid?.({
      sessionScopeId: input.injectionState.sessionScopeId,
      memoryInjectionId: input.injectionState.memoryInjectionId,
      reason: message,
    }) ?? input.injectionState;
  return skip(updated, id, message, evidence);
}

function skip(
  state: ProjectMemoryInjectionState,
  id: string,
  message: string,
  evidence: readonly string[],
): ProjectMemoryFutureTurnInjectionPlan {
  return {
    shouldInject: false,
    updatedInjectionState: state,
    warnings: [{ id, message }],
    evidence: [...evidence, `project-memory-future-turn-injection:skip:${id}`],
  };
}

function containsUnsafeContent(value: string): boolean {
  return /\bRAW_[A-Z0-9_]+\b/.test(value) ||
    /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(value);
}
