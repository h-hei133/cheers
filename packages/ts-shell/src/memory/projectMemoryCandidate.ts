import { createHash } from "node:crypto";

export const PROJECT_MEMORY_KINDS = [
  "project-fact",
  "project-structure",
  "capability-state",
  "route-decision",
  "user-preference-candidate",
  "validation-pattern",
  "restore/recovery-boundary",
  "blocked-by-design-decision",
  "transient-session-fact",
  "rejected",
] as const;
export type ProjectMemoryCandidateKind = typeof PROJECT_MEMORY_KINDS[number];

export const PROJECT_MEMORY_RETENTIONS = [
  "project-scoped-candidate",
  "session-scoped-only",
  "user-memory-candidate",
  "never-remember",
] as const;
export type ProjectMemoryRetentionClass = typeof PROJECT_MEMORY_RETENTIONS[number];

export type ProjectMemoryCandidateConfidence = "high" | "medium" | "low";

export const PROJECT_MEMORY_SOURCES = [
  "compact-packet",
  "context-projection",
  "route-handoff",
  "validation-evidence",
  "user-stated-preference",
  "system-derived",
] as const;
export type ProjectMemoryCandidateSource = typeof PROJECT_MEMORY_SOURCES[number];

export type ProjectMemoryCandidateSafety = "safe" | "needs-review" | "unsafe";

export interface ProjectMemoryStructuredFact {
  readonly subject: string;
  readonly predicate: string;
  readonly object: string;
}

export interface ProjectMemoryCandidate {
  readonly candidateId: string;
  readonly candidateKind: ProjectMemoryCandidateKind;
  readonly retentionClass: ProjectMemoryRetentionClass;
  readonly confidence: ProjectMemoryCandidateConfidence;
  readonly source: ProjectMemoryCandidateSource;
  readonly safety: ProjectMemoryCandidateSafety;
  readonly summary: string;
  readonly structuredFact?: ProjectMemoryStructuredFact;
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
  readonly structuredFact?: ProjectMemoryStructuredFact;
  readonly reason: string;
  readonly evidence: readonly string[];
  readonly redactions?: readonly string[];
}

export function createProjectMemoryCandidate(
  input: CreateProjectMemoryCandidateInput,
): ProjectMemoryCandidate {
  const structuredFact = input.structuredFact && Object.freeze({
    subject: input.structuredFact.subject.trim(),
    predicate: input.structuredFact.predicate.trim(),
    object: input.structuredFact.object.trim(),
  });
  return {
    candidateId: projectMemoryCandidateId(
      input.candidateKind,
      input.source,
      input.summary,
      structuredFact,
    ),
    candidateKind: input.candidateKind,
    retentionClass: input.retentionClass,
    confidence: input.confidence,
    source: input.source,
    safety: input.safety ?? "safe",
    summary: input.summary.trim(),
    ...(structuredFact ? { structuredFact } : {}),
    reason: input.reason.trim(),
    evidence: unique(input.evidence),
    redactions: unique(input.redactions ?? []),
  };
}

export function projectMemoryCandidateId(
  kind: ProjectMemoryCandidateKind,
  source: ProjectMemoryCandidateSource,
  summary: string,
  structuredFact?: ProjectMemoryStructuredFact,
): string {
  return [
    "pmc",
    kind,
    source,
    createHash("sha256").update(structuredFact ? JSON.stringify([summary.trim(),
      structuredFact.subject, structuredFact.predicate, structuredFact.object]) : summary.trim()).digest("hex").slice(0, 24),
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

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
