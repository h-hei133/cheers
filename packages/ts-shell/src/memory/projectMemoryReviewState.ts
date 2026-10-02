import type { ProjectMemoryCandidate } from "./projectMemoryCandidate.js";
import { RetainedMap, retainHistory, retentionCapacity, type RetentionState, type RetentionStatus } from "../core/state/retention.js";

export const MEMORY_REVIEW_LIMITS = { sessions: 128, decisions: 256 } as const;

export type ProjectMemoryReviewDecision =
  | "pending"
  | "approved"
  | "rejected"
  | "needs-review"
  | "unsafe"
  | "superseded";

export type ProjectMemoryReviewSourceCommand = "/compact" | "/memory" | "internal";

export interface ProjectMemoryReviewEntry {
  readonly candidateId: string;
  readonly decision: ProjectMemoryReviewDecision;
  readonly candidate: ProjectMemoryCandidate;
  readonly decidedAt?: string;
  readonly reason?: string;
  readonly sourceCommand: ProjectMemoryReviewSourceCommand;
  readonly evidence: readonly string[];
}

export interface ProjectMemoryReviewState extends RetentionState {
  readonly reviewSessionId: string;
  readonly latestCandidates: readonly ProjectMemoryCandidate[];
  readonly approvedCandidates: readonly ProjectMemoryReviewEntry[];
  readonly rejectedCandidates: readonly ProjectMemoryReviewEntry[];
  readonly unsafeCandidates: readonly ProjectMemoryReviewEntry[];
  readonly supersededCandidates: readonly ProjectMemoryReviewEntry[];
  readonly decisions: readonly ProjectMemoryReviewEntry[];
  readonly persistence: "none";
  readonly providerCall: "none";
  readonly evidence: readonly string[];
}

export interface ProjectMemoryReviewStateStore {
  retention(): RetentionStatus;
  get(reviewSessionId: string): ProjectMemoryReviewState;
  updateCandidates(input: UpdateProjectMemoryReviewCandidatesInput): ProjectMemoryReviewState;
  approve(input: DecideProjectMemoryCandidateInput): ProjectMemoryReviewState;
  reject(input: DecideProjectMemoryCandidateInput): ProjectMemoryReviewState;
}

export interface ProjectMemoryReviewStateStoreOptions {
  readonly sessionCapacity?: number;
  readonly decisionCapacity?: number;
  readonly now?: () => string;
}

export interface UpdateProjectMemoryReviewCandidatesInput {
  readonly reviewSessionId: string;
  readonly candidates: readonly ProjectMemoryCandidate[];
  readonly sourceCommand: ProjectMemoryReviewSourceCommand;
}

export interface DecideProjectMemoryCandidateInput {
  readonly reviewSessionId: string;
  readonly candidateId: string;
  readonly reason?: string;
  readonly sourceCommand: ProjectMemoryReviewSourceCommand;
  readonly decidedAt?: string;
}

export function createProjectMemoryReviewStateStore(
  options: ProjectMemoryReviewStateStoreOptions = {},
): ProjectMemoryReviewStateStore {
  const states = new RetainedMap<string, ProjectMemoryReviewState>(options.sessionCapacity ?? MEMORY_REVIEW_LIMITS.sessions);
  const capacity = retentionCapacity(options.decisionCapacity ?? MEMORY_REVIEW_LIMITS.decisions);
  const now = options.now ?? (() => new Date().toISOString());

  const set = (state: ProjectMemoryReviewState): ProjectMemoryReviewState => {
    const history = retainHistory(state.decisions, capacity, state.dropped);
    const ids = new Set(history.items.map((entry) => entry.candidateId));
    const retained = buildState(state.reviewSessionId,
      state.latestCandidates.filter((candidate) => ids.has(candidate.candidateId)).slice(0, capacity),
      history.items, history.dropped, state.incomplete || history.incomplete);
    states.set(state.reviewSessionId, retained);
    return retained;
  };

  const get = (reviewSessionId: string): ProjectMemoryReviewState =>
    states.get(reviewSessionId) ?? { ...emptyProjectMemoryReviewState(reviewSessionId), incomplete: states.retention().incomplete };

  return {
    retention: () => states.retention(),
    get,
    updateCandidates(input) {
      const previous = get(input.reviewSessionId);
      const nextIds = new Set(input.candidates.map((candidate) => candidate.candidateId));
      const carried = previous.decisions
        .filter((entry) => !nextIds.has(entry.candidateId))
        .map((entry) =>
          entry.decision === "superseded"
            ? entry
            : {
                ...entry,
                decision: "superseded" as const,
                decidedAt: entry.decidedAt ?? now(),
                reason: entry.reason ?? "Candidate no longer appears in the latest session review set.",
                evidence: [
                  ...entry.evidence,
                  "project-memory-review-state:superseded",
                ],
              },
        );
      const byId = new Map(previous.decisions.map((entry) => [entry.candidateId, entry]));
      const current = input.candidates.map((candidate) => {
        const existing = byId.get(candidate.candidateId);
        if (
          existing &&
          existing.decision !== "superseded" &&
          existing.candidate.summary === candidate.summary
        ) {
          return {
            ...existing,
            candidate,
            evidence: unique([
              ...existing.evidence,
              "project-memory-review-state:candidate-refreshed",
            ]),
          };
        }
        return entryForCandidate(candidate, input.sourceCommand);
      });
      return set(buildState(input.reviewSessionId, input.candidates, [...current, ...carried], previous.dropped, previous.incomplete));
    },
    approve(input) {
      return set(applyDecision(get(input.reviewSessionId), input, "approved", now));
    },
    reject(input) {
      return set(applyDecision(get(input.reviewSessionId), input, "rejected", now));
    },
  };
}

export const DEFAULT_PROJECT_MEMORY_REVIEW_STATE_STORE =
  createProjectMemoryReviewStateStore();

export function emptyProjectMemoryReviewState(
  reviewSessionId: string,
): ProjectMemoryReviewState {
  return buildState(reviewSessionId, [], []);
}

function applyDecision(
  state: ProjectMemoryReviewState,
  input: DecideProjectMemoryCandidateInput,
  decision: "approved" | "rejected",
  now: () => string,
): ProjectMemoryReviewState {
  const entries = state.decisions.map((entry) => {
    if (entry.candidateId !== input.candidateId) {
      return entry;
    }
    return {
      ...entry,
      decision,
      decidedAt: input.decidedAt ?? now(),
      reason: input.reason ?? (decision === "approved" ? "Approved for session review only." : "Rejected for session review only."),
      sourceCommand: input.sourceCommand,
      evidence: unique([
        ...entry.evidence,
        `project-memory-review-state:${decision}`,
        "project-memory-review-state:session-scoped-only",
        "project-memory-review-state:no-persistence",
      ]),
    };
  });
  return buildState(state.reviewSessionId, state.latestCandidates, entries, state.dropped, state.incomplete);
}

function entryForCandidate(
  candidate: ProjectMemoryCandidate,
  sourceCommand: ProjectMemoryReviewSourceCommand,
): ProjectMemoryReviewEntry {
  const decision = initialDecision(candidate);
  return {
    candidateId: candidate.candidateId,
    decision,
    candidate,
    reason: initialReason(candidate, decision),
    sourceCommand,
    evidence: [
      "project-memory-review-state:candidate-loaded",
      "project-memory-review-state:session-scoped-only",
      "project-memory-review-state:no-persistence",
      ...candidate.evidence,
    ],
  };
}

function initialDecision(candidate: ProjectMemoryCandidate): ProjectMemoryReviewDecision {
  if (
    candidate.safety === "unsafe" ||
    candidate.retentionClass === "never-remember" ||
    candidate.candidateKind === "rejected"
  ) {
    return "unsafe";
  }
  if (
    candidate.safety === "needs-review" ||
    candidate.candidateKind === "user-preference-candidate"
  ) {
    return "needs-review";
  }
  return "pending";
}

function initialReason(
  candidate: ProjectMemoryCandidate,
  decision: ProjectMemoryReviewDecision,
): string {
  if (decision === "unsafe") {
    return "Candidate is unsafe or never-remember and cannot be approved by default.";
  }
  if (decision === "needs-review") {
    return "Candidate requires explicit review before any session approval.";
  }
  return candidate.reason;
}

function buildState(
  reviewSessionId: string,
  latestCandidates: readonly ProjectMemoryCandidate[],
  decisions: readonly ProjectMemoryReviewEntry[],
  dropped = 0,
  incomplete = false,
): ProjectMemoryReviewState {
  return {
    dropped,
    incomplete,
    reviewSessionId,
    latestCandidates,
    approvedCandidates: decisions.filter((entry) => entry.decision === "approved"),
    rejectedCandidates: decisions.filter((entry) => entry.decision === "rejected"),
    unsafeCandidates: decisions.filter((entry) => entry.decision === "unsafe"),
    supersededCandidates: decisions.filter((entry) => entry.decision === "superseded"),
    decisions,
    persistence: "none",
    providerCall: "none",
    evidence: [
      "project-memory-review-state:in-memory",
      "project-memory-review-state:session-scoped-only",
      "project-memory-review-state:no-persistence",
      "project-memory-review-state:no-provider-call",
      "project-memory-review-state:no-memory-store",
    ],
  };
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
