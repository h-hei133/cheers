import type { ProjectMemoryFutureTurnCandidateContext } from "./projectMemoryFutureTurnAdapter.js";

export function formatProjectMemoryInjectedContext(
  candidate: ProjectMemoryFutureTurnCandidateContext,
): string {
  const facts = candidate.structuredFacts;
  return [
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
    list(facts.stableProjectFacts),
    "",
    "User preferences",
    list(facts.userPreferenceFacts),
    "",
    "Relevant recalled facts",
    list([
      ...facts.capabilityStateFacts,
      ...facts.routeDecisions,
      ...facts.validationPatterns,
      ...facts.blockedByDesignDecisions,
    ]),
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
  ].join("\n");
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
