import type { ProjectMemoryRecord } from "../projectMemoryStoreContract.js";

export interface EpisodicMemoryEntry {
  readonly id: string;
  readonly candidateId: string;
  readonly summary: string;
  readonly decisions: readonly string[];
  readonly createdAt: string;
}

export function extractEpisodicMemories(
  records: readonly ProjectMemoryRecord[],
): readonly EpisodicMemoryEntry[] {
  return records
    .filter((record) => !record.invalidatedAt)
    .map((record) => ({
      id: record.id,
      candidateId: record.candidateId,
      summary: record.memoryText,
      decisions: record.evidence,
      createdAt: record.approvedAt,
    }));
}

export function searchEpisodicMemories(
  entries: readonly EpisodicMemoryEntry[],
  query: string,
): readonly EpisodicMemoryEntry[] {
  const queryTerms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (queryTerms.length === 0) {
    return entries;
  }
  return entries.filter((entry) => {
    const text = `${entry.summary} ${entry.decisions.join(" ")}`.toLowerCase();
    return queryTerms.some((term) => text.includes(term));
  });
}
