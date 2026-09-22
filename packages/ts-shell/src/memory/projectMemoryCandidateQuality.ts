import type { ProjectMemoryCandidate } from "./projectMemoryCandidate.js";

export type ProjectMemoryCandidateQualityStatus = "pass" | "warn" | "reject";

export interface ProjectMemoryCandidateQualityCheck {
  readonly id: string;
  readonly status: "pass" | "warn" | "reject";
  readonly message: string;
  readonly candidateId?: string;
}

export interface ProjectMemoryCandidateQualityResult {
  readonly qualityStatus: ProjectMemoryCandidateQualityStatus;
  readonly warnings: readonly ProjectMemoryCandidateQualityCheck[];
  readonly blockers: readonly ProjectMemoryCandidateQualityCheck[];
  readonly evidence: readonly string[];
  readonly checks: readonly ProjectMemoryCandidateQualityCheck[];
}

export function evaluateProjectMemoryCandidateQuality(
  candidates: readonly ProjectMemoryCandidate[],
): ProjectMemoryCandidateQualityResult {
  const checks = candidates.flatMap((candidate) => checksForCandidate(candidate));
  const blockers = checks.filter((check) => check.status === "reject");
  const warnings = checks.filter((check) => check.status === "warn");

  return {
    qualityStatus: blockers.length > 0 ? "reject" : warnings.length > 0 ? "warn" : "pass",
    warnings,
    blockers,
    checks,
    evidence: [
      "project-memory-candidate-quality:checked",
      "project-memory-candidate-quality:no-persistence",
      "project-memory-candidate-quality:no-provider-call",
      blockers.length > 0
        ? "project-memory-candidate-quality:reject"
        : warnings.length > 0
          ? "project-memory-candidate-quality:warn"
          : "project-memory-candidate-quality:pass",
    ],
  };
}

function checksForCandidate(
  candidate: ProjectMemoryCandidate,
): readonly ProjectMemoryCandidateQualityCheck[] {
  return [
    check(
      Boolean(candidate.source && candidate.evidence.length > 0),
      "has-source-evidence",
      "Candidate has source and evidence.",
      candidate.candidateId,
    ),
    check(
      candidate.candidateKind === "rejected" ||
        (!containsRawContent(candidate.summary) && !containsRawContent(candidate.reason)),
      "no-raw-content",
      "Candidate does not contain raw file or recovery content.",
      candidate.candidateId,
    ),
    check(
      candidate.candidateKind === "rejected" ||
        (!containsSecret(candidate.summary) && !containsSecret(candidate.reason)),
      "no-secret",
      "Candidate does not contain secret-looking values or provider credentials.",
      candidate.candidateId,
    ),
    check(
      candidate.candidateKind === "rejected" ||
        (!containsHiddenReasoning(candidate.summary) && !containsHiddenReasoning(candidate.reason)),
      "no-hidden-reasoning",
      "Candidate does not contain hidden reasoning markers.",
      candidate.candidateId,
    ),
    check(
      candidate.candidateKind !== "transient-session-fact" ||
        candidate.retentionClass === "session-scoped-only" ||
        candidate.retentionClass === "never-remember",
      "transient-is-session-only",
      "Transient facts are session-only or never-remember.",
      candidate.candidateId,
    ),
    check(
      candidate.candidateKind !== "user-preference-candidate" ||
        (candidate.source === "user-stated-preference" &&
          candidate.retentionClass === "user-memory-candidate" &&
          candidate.safety === "needs-review"),
      "user-preference-explicit",
      "User preference candidates require explicit user evidence and review.",
      candidate.candidateId,
      "warn",
    ),
    check(
      candidate.candidateKind !== "blocked-by-design-decision" ||
        candidate.reason.length > 0,
      "blocked-decision-has-reason",
      "Blocked-by-design decisions include a reason.",
      candidate.candidateId,
    ),
    check(
      candidate.candidateKind !== "capability-state" ||
        candidate.evidence.some((entry) => /route|compact|edit|closeout|manifest|context/i.test(entry)),
      "capability-state-has-route-evidence",
      "Capability-state facts include route, compact, edit, closeout, manifest, or context evidence.",
      candidate.candidateId,
      "warn",
    ),
    check(
      candidate.safety !== "unsafe" ||
        (candidate.candidateKind === "rejected" &&
          candidate.retentionClass === "never-remember"),
      "unsafe-is-rejected",
      "Unsafe candidates are rejected and marked never-remember.",
      candidate.candidateId,
    ),
  ];
}

function check(
  passed: boolean,
  id: string,
  message: string,
  candidateId: string,
  missingSeverity: "warn" | "reject" = "reject",
): ProjectMemoryCandidateQualityCheck {
  return {
    id,
    status: passed ? "pass" : missingSeverity,
    message,
    candidateId,
  };
}

function containsRawContent(value: string): boolean {
  return /\bRAW_[A-Z0-9_]+\b/.test(value) || /\braw (file|recovery|content)\b/i.test(value);
}

function containsSecret(value: string): boolean {
  return (
    /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(value) ||
    /\b(provider credential|provider config|authorization|api key|token)\b/i.test(value)
  );
}

function containsHiddenReasoning(value: string): boolean {
  return /\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/i.test(value);
}
