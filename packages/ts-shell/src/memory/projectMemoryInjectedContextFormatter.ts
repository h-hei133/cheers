import type { ProjectMemoryFutureTurnCandidateContext } from "./projectMemoryFutureTurnAdapter.js";

export function formatProjectMemoryInjectedContext(
  candidate: ProjectMemoryFutureTurnCandidateContext,
): string {
  return formatProjectMemoryContextDocument(candidate).context;
}

export function formatProjectMemoryContextDocument(candidate: ProjectMemoryFutureTurnCandidateContext): {
  readonly context: string;
  readonly recordLines: ReadonlyMap<number, readonly string[]>;
} {
  const facts = candidate.structuredFacts;
  const sourceIds = new Map((candidate.factSources ?? []).map(source => [safeLine(source.summary), source.recordId]));
  const segments = [
    "<project_memory_context>",
    `Source: explicit /memory use`,
    `Injection: ${candidate.injectionId}`,
    `Mode: ${candidate.mode}`,
    ...(candidate.query ? [`Query: ${safeLine(candidate.query)}`] : []),
    `Records selected: ${candidate.recordIds.length}`,
    "",
    "Selected records",
    list(candidate.recordIds),
    "",
    "Stable project facts",
    { text: list(facts.stableProjectFacts), sources: facts.stableProjectFacts },
    "",
    "User preferences",
    { text: list(facts.userPreferenceFacts), sources: facts.userPreferenceFacts },
    "",
    "Relevant recalled facts",
    { text: list([
      ...facts.capabilityStateFacts,
      ...facts.routeDecisions,
      ...facts.validationPatterns,
      ...facts.blockedByDesignDecisions,
    ]), sources: [...facts.capabilityStateFacts, ...facts.routeDecisions, ...facts.validationPatterns, ...facts.blockedByDesignDecisions] },
    "",
    "Constraints / caveats",
    "- Use this memory as user-approved project context for this turn only.",
    "- Invalidated and deleted memory records are excluded.",
    "- Automatic memory injection: no.",
    "- Startup auto-load: no.",
    "- Provider retrieval: no.",
    "- Vector search, embeddings, and ChromaDB are not enabled.",
    "",
    "Next action",
    "- Use this context for the current normal prompt only; run /memory use again for fresh memory.",
    "",
    "Evidence references",
    list(facts.evidenceReferences),
    "",
    "Redactions / warnings",
    list([
      ...candidate.redactions.map((redaction) => `redaction:${redaction}`),
      ...candidate.warnings.map((warning) => `${warning.id}: ${warning.message}`),
    ]),
    "",
    "Safety",
    "- Raw file content, raw recovery content, secrets, provider credentials, and hidden reasoning are excluded.",
    "- This context does not grant write authorization, recovery execution, automatic recovery, atomic rollback, or persistence.",
    "</project_memory_context>",
  ];
  // Only fact bodies admit a record. The selected-ID list and evidence alone do not.
  const lines: string[] = [];
  const recordLines = new Map<number, readonly string[]>();
  segments.forEach(segment => {
    const sources = typeof segment === 'string' ? undefined : segment.sources;
    const text = typeof segment === 'string' ? segment : segment.text;
    for (const [offset, line] of text.split('\n').entries()) {
      const recordId = sources?.[offset] === undefined ? undefined : sourceIds.get(safeLine(sources[offset]!));
      if (recordId) recordLines.set(lines.length, [recordId]);
      lines.push(line);
    }
  });
  return { context: lines.join('\n'), recordLines };
}

function list(values: readonly string[]): string {
  if (values.length === 0) {
    return "- none";
  }
  return values.map((value) => `- ${safeLine(value)}`).join("\n");
}

function safeLine(value: string): string {
  return value
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[REDACTED]")
    .replace(/\bRAW_[A-Z0-9_]+\b/g, "[REDACTED_RAW]")
    .replace(/\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/gi, "[REDACTED_REASONING]")
    .replace(/\s+/g, " ")
    .trim();
}
