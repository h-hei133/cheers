export type ProjectMemoryCandidateKind =
  | "project-fact"
  | "project-structure"
  | "capability-state"
  | "route-decision"
  | "user-preference-candidate"
  | "validation-pattern"
  | "restore/recovery-boundary"
  | "blocked-by-design-decision"
  | "transient-session-fact"
  | "rejected";

export type ProjectMemoryRetentionClass =
  | "project-scoped-candidate"
  | "session-scoped-only"
  | "user-memory-candidate"
  | "never-remember";

export type ProjectMemoryCandidateConfidence = "high" | "medium" | "low";

export type ProjectMemoryCandidateSource =
  | "compact-packet"
  | "context-projection"
  | "route-handoff"
  | "validation-evidence"
  | "user-stated-preference"
  | "system-derived";

export type ProjectMemoryCandidateSafety = "safe" | "needs-review" | "unsafe";

export interface ProjectMemoryCandidate {
  readonly candidateId: string;
  readonly candidateKind: ProjectMemoryCandidateKind;
  readonly retentionClass: ProjectMemoryRetentionClass;
  readonly confidence: ProjectMemoryCandidateConfidence;
  readonly source: ProjectMemoryCandidateSource;
  readonly safety: ProjectMemoryCandidateSafety;
  readonly summary: string;
  readonly reason: string;
  readonly evidence: readonly string[];
  readonly redactions: readonly string[];
}

export interface CreateProjectMemoryCandidateInput {
  readonly candidateKind: ProjectMemoryCandidateKind;
  readonly retentionClass: ProjectMemoryRetentionClass;
  readonly confidence: ProjectMemoryCandidateConfidence;
  readonly source: ProjectMemoryCandidateSource;
  readonly safety?: ProjectMemoryCandidateSafety;
  readonly summary: string;
  readonly reason: string;
  readonly evidence: readonly string[];
  readonly redactions?: readonly string[];
}

export function createProjectMemoryCandidate(
  input: CreateProjectMemoryCandidateInput,
): ProjectMemoryCandidate {
  return {
    candidateId: projectMemoryCandidateId(
      input.candidateKind,
      input.source,
      input.summary,
    ),
    candidateKind: input.candidateKind,
    retentionClass: input.retentionClass,
    confidence: input.confidence,
    source: input.source,
    safety: input.safety ?? "safe",
    summary: input.summary.trim(),
    reason: input.reason.trim(),
    evidence: unique(input.evidence),
    redactions: unique(input.redactions ?? []),
  };
}

export function projectMemoryCandidateId(
  kind: ProjectMemoryCandidateKind,
  source: ProjectMemoryCandidateSource,
  summary: string,
): string {
  return [
    "pmc",
    kind,
    source,
    slug(summary).slice(0, 72) || "candidate",
  ].join(":");
}

export function dedupeProjectMemoryCandidates(
  candidates: readonly ProjectMemoryCandidate[],
): readonly ProjectMemoryCandidate[] {
  const seen = new Set<string>();
  const result: ProjectMemoryCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.candidateId)) {
      continue;
    }
    seen.add(candidate.candidateId);
    result.push(candidate);
  }
  return result;
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
