import type { ProjectMemoryCandidateQualityResult } from "./projectMemoryCandidateQuality.js";
import type {
  ProjectMemoryReviewDecision,
  ProjectMemoryReviewEntry,
  ProjectMemoryReviewState,
} from "./projectMemoryReviewState.js";

export interface RenderProjectMemoryReviewSurfaceInput {
  readonly state: ProjectMemoryReviewState;
  readonly quality: ProjectMemoryCandidateQualityResult;
  readonly outcome?: "listed" | "approved" | "rejected" | "blocked";
  readonly blocker?: string;
}

export function renderProjectMemoryReviewSurface(
  input: RenderProjectMemoryReviewSurfaceInput,
): string {
  const entries = input.state.decisions;
  const pending = entries.filter((entry) => entry.decision === "pending");
  const needsReview = entries.filter((entry) => entry.decision === "needs-review");
  const approved = input.state.approvedCandidates;
  const rejected = input.state.rejectedCandidates;
  const unsafe = input.state.unsafeCandidates;
  const projectScoped = entries.filter(
    (entry) => entry.candidate.retentionClass === "project-scoped-candidate",
  );
  const sessionOnly = entries.filter(
    (entry) => entry.candidate.retentionClass === "session-scoped-only",
  );
  const redactions = Array.from(
    new Set(entries.flatMap((entry) => entry.candidate.redactions)),
  );

  return [
    "Project memory review",
    "Result",
    `- Outcome: ${input.outcome ?? "listed"}`,
    ...(input.blocker ? [`- BlockerKind: memory-review-blocked`, `- Reason: ${input.blocker}`] : []),
    "- Memory written: no",
    "- Persistence: not enabled",
    "- Cross-session loading: none",
    "- Retrieval / wake-up / recall: not enabled",
    "- Provider/model call: none",
    `- Review session: ${input.state.reviewSessionId}`,
    `- Quality: ${input.quality.qualityStatus}`,
    `- Total candidates: ${input.state.latestCandidates.length}`,
    `- Pending candidates: ${pending.length}`,
    `- Approved session-scoped candidates: ${approved.length}`,
    `- Rejected session-scoped candidates: ${rejected.length}`,
    `- Unsafe candidates: ${unsafe.length}`,
    `- User-preference candidates needing review: ${needsReview.length}`,
    `- Project-scoped candidates: ${projectScoped.length}`,
    `- Session-only facts: ${sessionOnly.length}`,
    `- Redactions: ${redactions.length}`,
    "",
    "Candidates",
    ...entryLines("Pending", pending),
    ...entryLines("Needs explicit review", needsReview),
    ...entryLines("Approved this session", approved),
    ...entryLines("Rejected this session", rejected),
    ...entryLines("Unsafe / policy rejected", unsafe),
    ...redactionLines(redactions),
    "",
    "Next action",
    nextAction(input),
  ].join("\n");
}

function entryLines(
  label: string,
  entries: readonly ProjectMemoryReviewEntry[],
): readonly string[] {
  if (entries.length === 0) {
    return [`- ${label}: none`];
  }
  return [
    `- ${label}:`,
    ...entries.slice(0, 8).map((entry) => formatEntry(entry)),
    ...(entries.length > 8 ? [`  - ... ${entries.length - 8} more`] : []),
  ];
}

function formatEntry(entry: ProjectMemoryReviewEntry): string {
  return [
    `  - ${entry.candidateId}`,
    `[${entry.candidate.candidateKind}; ${entry.candidate.retentionClass}; ${entry.candidate.safety}]`,
    entry.candidate.summary,
  ].join(" ");
}

function redactionLines(redactions: readonly string[]): readonly string[] {
  if (redactions.length === 0) {
    return ["- Redaction details: none"];
  }
  return [
    "- Redaction details:",
    ...redactions.map((redaction) => `  - ${redaction}`),
  ];
}

function nextAction(input: RenderProjectMemoryReviewSurfaceInput): string {
  if (input.blocker) {
    return "- Retry with /memory, /memory approve <candidate-id>, or /memory reject <candidate-id>.";
  }
  if (input.state.decisions.length === 0) {
    return "- Run /compact first to generate memory candidates, then rerun /memory.";
  }
  if (input.state.decisions.some((entry) => entry.decision === "pending")) {
    return "- Review candidates, then use /memory approve <candidate-id> or /memory reject <candidate-id>.";
  }
  if (input.state.decisions.some((entry) => entry.decision === "needs-review")) {
    return "- Explicitly review user-preference candidates before approving them.";
  }
  return "- Continue the session. Approved/rejected decisions remain session-scoped only.";
}

export function reviewDecisionCounts(
  state: ProjectMemoryReviewState,
): Record<ProjectMemoryReviewDecision, number> {
  return {
    pending: state.decisions.filter((entry) => entry.decision === "pending").length,
    approved: state.approvedCandidates.length,
    rejected: state.rejectedCandidates.length,
    "needs-review": state.decisions.filter((entry) => entry.decision === "needs-review").length,
    unsafe: state.unsafeCandidates.length,
    superseded: state.supersededCandidates.length,
  };
}
