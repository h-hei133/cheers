import type { ProjectMemoryCandidate } from "./projectMemoryCandidate.js";
import type { ProjectMemoryCandidateQualityResult } from "./projectMemoryCandidateQuality.js";

export interface RenderProjectMemoryCandidateSurfaceInput {
  readonly candidates: readonly ProjectMemoryCandidate[];
  readonly quality?: ProjectMemoryCandidateQualityResult;
}

export function renderProjectMemoryCandidateSurface(
  input: RenderProjectMemoryCandidateSurfaceInput,
): string {
  const candidates = input.candidates;
  const projectScoped = candidates.filter(
    (candidate) => candidate.retentionClass === "project-scoped-candidate",
  );
  const sessionOnly = candidates.filter(
    (candidate) => candidate.retentionClass === "session-scoped-only",
  );
  const userPreference = candidates.filter(
    (candidate) => candidate.retentionClass === "user-memory-candidate",
  );
  const rejected = candidates.filter(
    (candidate) =>
      candidate.retentionClass === "never-remember" ||
      candidate.candidateKind === "rejected" ||
      candidate.safety === "unsafe",
  );
  const redactions = Array.from(
    new Set(candidates.flatMap((candidate) => candidate.redactions)),
  );

  return [
    "Memory candidates",
    "- Candidate preview: yes",
    "- Memory written: no",
    "- Persistence: none",
    "- Cross-session loading: none",
    "- Future route must decide review and persistence UX before anything is stored.",
    `- Quality: ${input.quality?.qualityStatus ?? "not evaluated"}`,
    `- Total candidates: ${candidates.length}`,
    `- Project-scoped candidates: ${projectScoped.length}`,
    `- Session-only facts: ${sessionOnly.length}`,
    `- User-preference candidates needing review: ${userPreference.length}`,
    `- Rejected/unsafe candidates: ${rejected.length}`,
    `- Redactions: ${redactions.length}`,
    ...candidateLines("Project-scoped", projectScoped),
    ...candidateLines("Session-only", sessionOnly),
    ...candidateLines("User-preference review", userPreference),
    ...candidateLines("Rejected / unsafe", rejected),
    ...redactionLines(redactions),
  ].join("\n");
}

export function summarizeProjectMemoryCandidates(
  candidates: readonly ProjectMemoryCandidate[],
): string {
  const projectScoped = candidates.filter(
    (candidate) => candidate.retentionClass === "project-scoped-candidate",
  ).length;
  const sessionOnly = candidates.filter(
    (candidate) => candidate.retentionClass === "session-scoped-only",
  ).length;
  const userPreference = candidates.filter(
    (candidate) => candidate.retentionClass === "user-memory-candidate",
  ).length;
  const rejected = candidates.filter(
    (candidate) =>
      candidate.retentionClass === "never-remember" ||
      candidate.candidateKind === "rejected" ||
      candidate.safety === "unsafe",
  ).length;
  return `${candidates.length} candidate(s): ${projectScoped} project-scoped, ${sessionOnly} session-only, ${userPreference} user-preference review, ${rejected} rejected/unsafe; memory written: no`;
}

function candidateLines(
  label: string,
  candidates: readonly ProjectMemoryCandidate[],
): readonly string[] {
  if (candidates.length === 0) {
    return [`- ${label}: none`];
  }
  return [
    `- ${label}:`,
    ...candidates.slice(0, 6).map(
      (candidate) =>
        `  - ${candidate.candidateKind} (${candidate.confidence}, ${candidate.safety}): ${candidate.summary}`,
    ),
    ...(candidates.length > 6 ? [`  - ... ${candidates.length - 6} more`] : []),
  ];
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
