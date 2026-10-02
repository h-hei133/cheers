import {
  evaluateProjectMemoryCandidateQuality,
  type ProjectMemoryCandidateQualityResult,
} from "./projectMemoryCandidateQuality.js";
import type { ProjectMemoryCandidate } from "./projectMemoryCandidate.js";
import {
  type ProjectMemoryReviewCommandRequest,
} from "./projectMemoryReviewCommandContract.js";
import {
  DEFAULT_PROJECT_MEMORY_REVIEW_STATE_STORE,
  type ProjectMemoryReviewEntry,
  type ProjectMemoryReviewSourceCommand,
  type ProjectMemoryReviewState,
  type ProjectMemoryReviewStateStore,
} from "./projectMemoryReviewState.js";
import { renderProjectMemoryReviewSurface } from "./projectMemoryReviewSurface.js";
import type { ProjectMemoryStoreHealth } from "./projectMemoryStoreContract.js";

export type ProjectMemoryReviewCommandOutcome =
  | "listed"
  | "approved"
  | "rejected"
  | "blocked";

export interface RunProjectMemoryReviewCommandInput {
  readonly request: ProjectMemoryReviewCommandRequest;
  readonly reviewSessionId: string;
  readonly candidates: readonly ProjectMemoryCandidate[];
  readonly store?: ProjectMemoryReviewStateStore;
  readonly sourceCommand?: ProjectMemoryReviewSourceCommand;
  readonly health?: ProjectMemoryStoreHealth;
}

export interface ProjectMemoryReviewCommandResult {
  readonly outcome: ProjectMemoryReviewCommandOutcome;
  readonly state: ProjectMemoryReviewState;
  readonly quality: ProjectMemoryCandidateQualityResult;
  readonly output: string;
  readonly persistence: "none";
  readonly providerCall: "none";
  readonly evidence: readonly string[];
}

export function runProjectMemoryReviewCommand(
  input: RunProjectMemoryReviewCommandInput,
): ProjectMemoryReviewCommandResult {
  const store = input.store ?? DEFAULT_PROJECT_MEMORY_REVIEW_STATE_STORE;
  const sourceCommand = input.sourceCommand ?? "/memory";
  const quality = evaluateProjectMemoryCandidateQuality(input.candidates);
  let state = store.updateCandidates({
    reviewSessionId: input.reviewSessionId,
    candidates: input.candidates,
    sourceCommand,
  });
  let outcome: ProjectMemoryReviewCommandOutcome = "listed";
  let blocker: string | undefined;

  if (input.request.mode === "approve") {
    const result = approveCandidates({ input, state, store, sourceCommand });
    state = result.state;
    outcome = result.outcome;
    blocker = result.blocker;
  } else if (input.request.mode === "reject") {
    const result = rejectCandidates({ input, state, store, sourceCommand });
    state = result.state;
    outcome = result.outcome;
    blocker = result.blocker;
  }

  return {
    outcome,
    state,
    quality,
    output: renderProjectMemoryReviewSurface({
      state,
      quality,
      outcome,
      blocker,
      health: input.health,
    }),
    persistence: "none",
    providerCall: "none",
    evidence: [
      ...input.request.evidence,
      ...quality.evidence,
      ...state.evidence,
      "project-memory-review-command-runner:session-scoped-only",
      "project-memory-review-command-runner:no-persistence",
      "project-memory-review-command-runner:no-provider-call",
      "project-memory-review-command-runner:no-memory-store-write",
    ],
  };
}

function approveCandidates(input: {
  readonly input: RunProjectMemoryReviewCommandInput;
  readonly state: ProjectMemoryReviewState;
  readonly store: ProjectMemoryReviewStateStore;
  readonly sourceCommand: ProjectMemoryReviewSourceCommand;
}): {
  readonly state: ProjectMemoryReviewState;
  readonly outcome: ProjectMemoryReviewCommandOutcome;
  readonly blocker?: string;
} {
  if (input.input.request.allSafe) {
    let state = input.state;
    for (const entry of state.decisions.filter(isSafePendingApproval)) {
      state = input.store.approve({
        reviewSessionId: input.input.reviewSessionId,
        candidateId: entry.candidateId,
        reason: "Approved safe candidate for this session only.",
        sourceCommand: input.sourceCommand,
      });
    }
    return { state, outcome: "approved" };
  }
  const entry = findEntry(input.state, input.input.request.candidateId);
  if (!entry) {
    return {
      state: input.state,
      outcome: "blocked",
      blocker: `Unknown memory candidate id: ${input.input.request.candidateId ?? "not provided"}`,
    };
  }
  if (entry.decision === "unsafe" || entry.candidate.safety === "unsafe") {
    return {
      state: input.state,
      outcome: "blocked",
      blocker: "Unsafe memory candidates cannot be approved.",
    };
  }
  const state = input.store.approve({
    reviewSessionId: input.input.reviewSessionId,
    candidateId: entry.candidateId,
    reason: input.input.request.reason ?? "Approved for this session only; memory was not written.",
    sourceCommand: input.sourceCommand,
  });
  return { state, outcome: "approved" };
}

function rejectCandidates(input: {
  readonly input: RunProjectMemoryReviewCommandInput;
  readonly state: ProjectMemoryReviewState;
  readonly store: ProjectMemoryReviewStateStore;
  readonly sourceCommand: ProjectMemoryReviewSourceCommand;
}): {
  readonly state: ProjectMemoryReviewState;
  readonly outcome: ProjectMemoryReviewCommandOutcome;
  readonly blocker?: string;
} {
  if (input.input.request.rejectUnsafe) {
    let state = input.state;
    for (const entry of state.unsafeCandidates) {
      state = input.store.reject({
        reviewSessionId: input.input.reviewSessionId,
        candidateId: entry.candidateId,
        reason: "Rejected unsafe candidate for this session only.",
        sourceCommand: input.sourceCommand,
      });
    }
    return { state, outcome: "rejected" };
  }
  const entry = findEntry(input.state, input.input.request.candidateId);
  if (!entry) {
    return {
      state: input.state,
      outcome: "blocked",
      blocker: `Unknown memory candidate id: ${input.input.request.candidateId ?? "not provided"}`,
    };
  }
  const state = input.store.reject({
    reviewSessionId: input.input.reviewSessionId,
    candidateId: entry.candidateId,
    reason: input.input.request.reason ?? "Rejected for this session only; no persistent memory was deleted.",
    sourceCommand: input.sourceCommand,
  });
  return { state, outcome: "rejected" };
}

function findEntry(
  state: ProjectMemoryReviewState,
  candidateId: string | undefined,
): ProjectMemoryReviewEntry | undefined {
  return state.decisions.find((entry) => entry.candidateId === candidateId);
}

function isSafePendingApproval(entry: ProjectMemoryReviewEntry): boolean {
  return (
    entry.decision === "pending" &&
    entry.candidate.safety === "safe" &&
    entry.candidate.retentionClass !== "never-remember"
  );
}
