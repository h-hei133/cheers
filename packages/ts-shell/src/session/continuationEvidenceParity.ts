import type { CodingResultSummary } from "../orchestration/types.js";

export interface ContinuationEvidenceParityDetail {
  readonly label: string;
  readonly summary: string;
}

const CONTINUATION_EVIDENCE_PREFIXES: ReadonlyArray<{
  readonly label: string;
  readonly prefixes: readonly string[];
}> = [
  { label: "discovery", prefixes: ["discovery-edit manifest="] },
  {
    label: "generated",
    prefixes: ["generated-edit proposal=", "generated-edit handoff="],
  },
  { label: "provider-edit", prefixes: ["provider-edit proposal="] },
  {
    label: "context-aware-provider",
    prefixes: ["context-aware-provider proposal="],
  },
  { label: "edit-repair-context", prefixes: ["edit-repair-context id="] },
  { label: "edit-repair-proposal", prefixes: ["edit-repair-proposal id="] },
  { label: "verification-repair-loop", prefixes: ["verification-repair-loop id="] },
  { label: "verification-repair-prompt", prefixes: ["verification-repair-prompt loop="] },
  { label: "context-packet", prefixes: ["context-packet ", "context-packet:id:"] },
  { label: "context-plan", prefixes: ["context-plan ", "context-plan:readiness:"] },
  { label: "agent-plan", prefixes: ["agent-plan ", "agent-plan:readiness:"] },
  { label: "proposal-review", prefixes: ["edit-proposal-review proposal="] },
  { label: "proposal-apply", prefixes: ["edit-proposal-apply proposal="] },
  {
    label: "proposal-hunk-set",
    prefixes: [
      "proposal-hunk-set-apply proposal=",
      "proposal-hunk-set proposal=",
      "proposal-hunk-set changed=",
    ],
  },
  {
    label: "target-set",
    prefixes: ["target-set-edit transaction=", "target-set-edit manifest="],
  },
  { label: "edit-recovery", prefixes: ["edit-recovery-apply plan="] },
];

export function collectContinuationEvidenceParityDetails(
  codingResult: CodingResultSummary | undefined,
): readonly ContinuationEvidenceParityDetail[] {
  if (!codingResult) {
    return [];
  }
  const details: ContinuationEvidenceParityDetail[] = [];
  for (const item of CONTINUATION_EVIDENCE_PREFIXES) {
    const summary = findContinuationEvidenceSummary(
      codingResult.continuation.evidence,
      item.prefixes,
    );
    if (summary) {
      details.push({
        label: item.label,
        summary: compactText(summary, 300),
      });
    }
  }
  return details;
}

export function formatContinuationEvidenceParityDetails(
  codingResult: CodingResultSummary | undefined,
): readonly string[] {
  return collectContinuationEvidenceParityDetails(codingResult).map(
    (detail) => `${detail.label}=${detail.summary}`,
  );
}

function findContinuationEvidenceSummary(
  evidence: readonly string[],
  prefixes: readonly string[],
): string | undefined {
  return evidence.find((entry) =>
    prefixes.some((prefix) => entry.startsWith(prefix)),
  );
}

function compactText(input: string, max: number): string {
  const normalized = input.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) {
    return normalized;
  }
  return `${normalized.slice(0, max)}...`;
}
