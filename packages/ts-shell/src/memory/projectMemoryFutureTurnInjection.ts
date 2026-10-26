import {
  adaptProjectMemoryRecallForFutureTurn,
  adaptProjectMemoryWakeupForFutureTurn,
  type ProjectMemoryFutureTurnCandidateContext,
} from "./projectMemoryFutureTurnAdapter.js";
import { applyProjectMemoryInjectedContextBudget } from "./projectMemoryInjectedContextBudget.js";
import { formatProjectMemoryContextDocument } from "./projectMemoryInjectedContextFormatter.js";
import {
  planProjectMemoryInjectionMerge,
  type ProjectMemoryPendingRecordLifecycle,
} from "./projectMemoryInjectionMergePolicy.js";
import type { ProjectMemoryInjectionState } from "./projectMemoryInjectionState.js";
import { evaluateProjectMemoryInjectionQuality } from "./projectMemoryInjectionQuality.js";
import { detectProjectMemoryConflicts } from "./projectMemoryConflictDetection.js";
import { retrieveProjectMemoryRecords } from "./projectMemoryRetrieval.js";
import type {
  ProjectMemoryRecord,
  ProjectMemoryStore,
  ProjectMemoryReadOptions,
} from "./projectMemoryStoreContract.js";
import { buildProjectMemoryWakeupPreview } from "./projectMemoryWakeup.js";
import { memoryRecordIsInjectable } from "./memoryValidation.js";
import { injectionProvenance, type MemoryInjectionProvenance } from "./knowledge/provenance.js";

export interface ProjectMemoryFutureTurnInjectionPlan {
  readonly shouldInject: boolean;
  readonly injectedContext?: string;
  readonly provenance?: MemoryInjectionProvenance;
  readonly updatedInjectionState: ProjectMemoryInjectionState;
  readonly invalidationReason?: string;
  readonly warnings: readonly { readonly id: string; readonly message: string }[];
  readonly evidence: readonly string[];
}

export interface PlanProjectMemoryFutureTurnInjectionInput {
  /** Prepare context and dispositions without changing injection state. */
  readonly mode?: "prepare";
  readonly memoryStore?: ProjectMemoryStore;
  readonly readOptions?: ProjectMemoryReadOptions;
  readonly injectionState: ProjectMemoryInjectionState;
  readonly markInjected?: (input: {
    readonly sessionScopeId: string;
    readonly memoryInjectionId: string;
  }) => ProjectMemoryInjectionState;
  readonly markConsumed: (input: {
    readonly sessionScopeId: string;
    readonly memoryInjectionId: string;
    readonly provenance?: MemoryInjectionProvenance;
  }) => ProjectMemoryInjectionState;
  readonly markInvalid?: (input: {
    readonly sessionScopeId: string;
    readonly memoryInjectionId?: string;
    readonly reason: string;
  }) => ProjectMemoryInjectionState;
  readonly maxInjectedContextChars?: number;
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
  const health = await input.memoryStore.health(input.readOptions);
  if (!(health.readable ?? health.writable)) {
    return invalid(input, "memory-store-not-writable", "Explicit local memory store is not writable.", [
      ...baseEvidence,
      ...health.evidence,
    ]);
  }

  const { candidate, selectedRecords } = await buildCurrentCandidate({
    memoryStore: input.memoryStore,
    state,
    readOptions: input.readOptions,
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

  const lifecycle = await resolvePendingRecordLifecycle(input.memoryStore, state.recordIds, input.readOptions);
  const conflicts = detectProjectMemoryConflicts({ records: selectedRecords });
  const merge = planProjectMemoryInjectionMerge({
    injectionState: state,
    candidate,
    pendingRecordLifecycle: lifecycle,
    conflictDetection: conflicts,
  });
  if (merge.mergeStatus === "fail") {
    return invalid(
      input,
      "memory-injection-merge-failed",
      merge.blockers.map((blocker) => blocker.message).join("; "),
      [...baseEvidence, ...candidate.evidence, ...merge.evidence],
      [...merge.warnings, ...merge.blockers],
    );
  }

  const formatted = formatProjectMemoryContextDocument(merge.candidate);
  const formattedContext = formatted.context;
  const quality = evaluateProjectMemoryInjectionQuality({
    candidate: merge.candidate,
    injectedContext: formattedContext,
    conflictDetection: conflicts,
    maxInjectedContextChars: input.maxInjectedContextChars,
  });
  if (quality.qualityStatus === "fail") {
    return invalid(
      input,
      "memory-injection-quality-failed",
      quality.blockers.map((blocker) => blocker.message).join("; "),
      [...baseEvidence, ...candidate.evidence, ...merge.evidence, ...quality.evidence],
      [...merge.warnings, ...quality.warnings, ...quality.blockers],
    );
  }

  const budget = applyProjectMemoryInjectedContextBudget(formattedContext, {
    maxChars: input.maxInjectedContextChars,
    recordLines: formatted.recordLines,
  });
  if (!budget.fits) {
    return skip(state, "memory-injection-budget-insufficient",
      "Memory context cannot fit the budget with its required safety content; it remains pending.",
      [...baseEvidence, ...budget.evidence], budget.warnings);
  }
  if (containsUnsafeContent(budget.context)) {
    return invalid(input, "unsafe-injected-context", "Formatted project memory context contained unsafe raw-looking content.", [
      ...baseEvidence,
      ...candidate.evidence,
      ...merge.evidence,
      ...quality.evidence,
      ...budget.evidence,
    ]);
  }

  const provenance = injectionProvenance(budget.context, selectedRecords, budget.admittedRecordIds);
  let updatedInjectionState = state;
  if (input.mode !== "prepare") {
    const injected = input.markInjected?.({
      sessionScopeId: state.sessionScopeId,
      memoryInjectionId: state.memoryInjectionId,
    });
    if (injected && (injected.memoryInjectionId !== state.memoryInjectionId || injected.injectionStatus !== "injected")) {
      return skip(injected, "memory-injection-state-changed", "Pending memory injection changed or was evicted during retrieval.", baseEvidence);
    }
    updatedInjectionState = input.markConsumed({
      sessionScopeId: state.sessionScopeId,
      memoryInjectionId: state.memoryInjectionId,
      provenance,
    });
    if (updatedInjectionState.memoryInjectionId !== state.memoryInjectionId || updatedInjectionState.injectionStatus !== "consumed") {
      return skip(updatedInjectionState, "memory-injection-state-changed", "Pending memory injection changed or was evicted during retrieval.", baseEvidence);
    }
  }
  return {
    shouldInject: true,
    injectedContext: budget.context,
    provenance,
    updatedInjectionState,
    warnings: [
      ...merge.candidate.warnings,
      ...quality.warnings,
      ...budget.warnings,
    ],
    evidence: [
      ...baseEvidence,
      ...merge.candidate.evidence,
      ...merge.evidence,
      ...quality.evidence,
      ...budget.evidence,
      ...(input.mode === "prepare" ? ["project-memory-future-turn-injection:prepared"] : [
        "project-memory-future-turn-injection:injected-once",
        "project-memory-future-turn-injection:consumed",
      ]),
    ],
  };
}

function invalid(
  input: PlanProjectMemoryFutureTurnInjectionInput,
  id: string,
  message: string,
  evidence: readonly string[],
  extraWarnings: readonly { readonly id: string; readonly message: string }[] = [],
): ProjectMemoryFutureTurnInjectionPlan {
  const updated = input.mode === "prepare" ? input.injectionState :
    input.markInvalid?.({
      sessionScopeId: input.injectionState.sessionScopeId,
      memoryInjectionId: input.injectionState.memoryInjectionId,
      reason: message,
    }) ?? input.injectionState;
  return { ...skip(updated, id, message, evidence, extraWarnings),
    ...(input.mode === "prepare" ? { invalidationReason: message } : {}),
  };
}

function skip(
  state: ProjectMemoryInjectionState,
  id: string,
  message: string,
  evidence: readonly string[],
  extraWarnings: readonly { readonly id: string; readonly message: string }[] = [],
): ProjectMemoryFutureTurnInjectionPlan {
  return {
    shouldInject: false,
    updatedInjectionState: state,
    warnings: [{ id, message }, ...extraWarnings],
    evidence: [...evidence, `project-memory-future-turn-injection:skip:${id}`],
  };
}

function containsUnsafeContent(value: string): boolean {
  return value
    .split(/\r?\n/)
    .filter((line) => !/\b(excluded|redacted|redactions?)\b/i.test(line))
    .some((line) =>
      /\bRAW_[A-Z0-9_]+\b/.test(line) ||
      /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(line) ||
      /\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/i.test(line),
    );
}

async function buildCurrentCandidate(input: {
  readonly memoryStore: ProjectMemoryStore;
  readonly state: ProjectMemoryInjectionState;
  readonly readOptions?: ProjectMemoryReadOptions;
}): Promise<{
  readonly candidate: ProjectMemoryFutureTurnCandidateContext;
  readonly selectedRecords: readonly ProjectMemoryRecord[];
}> {
  if (input.state.mode === "wake") {
    const wakeup = await buildProjectMemoryWakeupPreview(input.memoryStore, input.readOptions);
    return {
      candidate: adaptProjectMemoryWakeupForFutureTurn({
        injectionId: input.state.memoryInjectionId ?? "project-memory-pending",
        wakeup,
      }),
      selectedRecords: [...wakeup.l0.records, ...wakeup.l1.records].filter(memoryRecordIsInjectable),
    };
  }
  const retrieval = await retrieveProjectMemoryRecords(input.memoryStore, {
    query: input.state.query,
    maxResults: 5,
  }, input.readOptions);
  return {
    candidate: adaptProjectMemoryRecallForFutureTurn({
      injectionId: input.state.memoryInjectionId ?? "project-memory-pending",
      retrieval,
    }),
    selectedRecords: retrieval.matches
      .map((match) => match.record)
      .filter(memoryRecordIsInjectable),
  };
}

async function resolvePendingRecordLifecycle(
  memoryStore: ProjectMemoryStore,
  recordIds: readonly string[],
  readOptions?: ProjectMemoryReadOptions,
): Promise<readonly ProjectMemoryPendingRecordLifecycle[]> {
  const result: ProjectMemoryPendingRecordLifecycle[] = [];
  for (const recordId of Array.from(new Set(recordIds))) {
    readOptions?.signal?.throwIfAborted();
    const record = await memoryStore.get(recordId, readOptions);
    result.push({
      recordId,
      status: !record ? "deleted" : record.invalidatedAt ? "invalidated" : "active",
    });
  }
  return result;
}
