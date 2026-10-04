import type {
  ProjectMemoryRecord,
  ProjectMemoryStore,
} from "./projectMemoryStoreContract.js";
import type {
  ProjectMemoryCandidateKind,
  ProjectMemoryCandidateSource,
  ProjectMemoryRetentionClass,
} from "./projectMemoryCandidate.js";

export interface ProjectMemoryRetrievalFilters {
  readonly candidateKind?: ProjectMemoryCandidateKind;
  readonly retentionClass?: ProjectMemoryRetentionClass;
  readonly source?: ProjectMemoryCandidateSource;
}

export interface ProjectMemoryRetrievalRequest {
  readonly query?: string;
  readonly filters?: ProjectMemoryRetrievalFilters;
  readonly maxResults?: number;
  readonly includeInvalidated?: boolean;
}

export interface ProjectMemoryRetrievalMatch {
  readonly record: ProjectMemoryRecord;
  readonly score: number;
  readonly reasons: readonly string[];
}

export interface ProjectMemoryRetrievalResult {
  readonly query?: string;
  readonly matches: readonly ProjectMemoryRetrievalMatch[];
  readonly totalRecords: number;
  readonly filters: ProjectMemoryRetrievalFilters;
  readonly maxResults: number;
  readonly providerCall: "none";
  readonly autoInjected: false;
  readonly evidence: readonly string[];
}

const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULT_LIMIT = 20;

export async function retrieveProjectMemoryRecords(
  store: ProjectMemoryStore,
  request: ProjectMemoryRetrievalRequest = {},
): Promise<ProjectMemoryRetrievalResult> {
  const list = await store.list({
    includeInvalidated: request.includeInvalidated === true,
  });
  const query = normalizeQuery(request.query);
  const filters = request.filters ?? {};
  const maxResults = boundedMaxResults(request.maxResults);
  const records = list.records.filter((record) => recordSafety(record) !== "unsafe");
  const filtered = records.filter((record) => recordMatchesFilters(record, filters));
  const scored = filtered
    .map((record) => scoreRecord(record, query, filters))
    .filter((match) => !query || hasQueryMatch(match))
    .sort(compareMatches)
    .slice(0, maxResults);

  return {
    query,
    matches: scored,
    totalRecords: records.length,
    filters,
    maxResults,
    providerCall: "none",
    autoInjected: false,
    evidence: [
      ...list.evidence,
      "project-memory-retrieval:deterministic-local",
      "project-memory-retrieval:no-vector-db",
      "project-memory-retrieval:no-provider-call",
      "project-memory-retrieval:no-auto-injection",
      request.includeInvalidated === true
        ? "project-memory-retrieval:include-invalidated-explicit"
        : "project-memory-retrieval:exclude-invalidated-default",
    ],
  };
}

export function scoreProjectMemoryRecord(
  record: ProjectMemoryRecord,
  query: string | undefined,
  filters: ProjectMemoryRetrievalFilters = {},
): ProjectMemoryRetrievalMatch {
  return scoreRecord(record, normalizeQuery(query), filters);
}

function scoreRecord(
  record: ProjectMemoryRecord,
  query: string | undefined,
  filters: ProjectMemoryRetrievalFilters,
): ProjectMemoryRetrievalMatch {
  const reasons: string[] = [];
  let score = 0;
  const haystack = searchableText(record);
  const terms = tokenize(query ?? "");
  if (query && haystack.includes(query.toLowerCase())) {
    score += 20;
    reasons.push("exact-query");
  }
  for (const term of terms) {
    const count = countOccurrences(haystack, term);
    if (count > 0) {
      score += count * 5;
      reasons.push(`term:${term}`);
    }
  }
  if (filters.candidateKind && record.candidateKind === filters.candidateKind) {
    score += 8;
    reasons.push("candidate-kind-filter");
  }
  if (filters.retentionClass && record.retentionClass === filters.retentionClass) {
    score += 6;
    reasons.push("retention-class-filter");
  }
  if (filters.source && record.source === filters.source) {
    score += 6;
    reasons.push("source-filter");
  }
  if (record.safety === "safe") {
    score += 2;
    reasons.push("safe-record");
  }
  return { record, score, reasons: unique(reasons) };
}

function recordMatchesFilters(
  record: ProjectMemoryRecord,
  filters: ProjectMemoryRetrievalFilters,
): boolean {
  return (
    (!filters.candidateKind || record.candidateKind === filters.candidateKind) &&
    (!filters.retentionClass || record.retentionClass === filters.retentionClass) &&
    (!filters.source || record.source === filters.source)
  );
}

function recordSafety(record: ProjectMemoryRecord): string {
  return (record as { readonly safety?: string }).safety ?? "unknown";
}

function compareMatches(
  left: ProjectMemoryRetrievalMatch,
  right: ProjectMemoryRetrievalMatch,
): number {
  if (right.score !== left.score) {
    return right.score - left.score;
  }
  return compareMemoryRecordRecency(left.record, right.record);
}

export function compareMemoryRecordRecency(left: ProjectMemoryRecord, right: ProjectMemoryRecord): number {
  const leftTime = Date.parse(left.createdAt);
  const rightTime = Date.parse(right.createdAt);
  const created = (Number.isFinite(rightTime) ? rightTime : -Infinity) - (Number.isFinite(leftTime) ? leftTime : -Infinity);
  if (created) {
    return created;
  }
  return left.id.localeCompare(right.id);
}

function hasQueryMatch(match: ProjectMemoryRetrievalMatch): boolean {
  return match.reasons.some(
    (reason) => reason === "exact-query" || reason.startsWith("term:"),
  );
}

function searchableText(record: ProjectMemoryRecord): string {
  return [
    record.memoryText,
    record.candidateKind,
    record.retentionClass,
    record.source,
    record.structuredFact?.subject ?? "",
    record.structuredFact?.predicate ?? "",
    record.structuredFact?.object ?? "",
    ...record.evidence,
    ...record.routeReferences,
  ].join(" ").toLowerCase();
}

function normalizeQuery(query: string | undefined): string | undefined {
  const normalized = query?.trim().replace(/\s+/g, " ");
  return normalized ? normalized : undefined;
}

function tokenize(query: string): readonly string[] {
  return unique(query.toLowerCase().match(/[a-z0-9][a-z0-9_-]{1,}/g) ?? []);
}

function countOccurrences(value: string, term: string): number {
  let count = 0;
  let index = value.indexOf(term);
  while (index >= 0) {
    count += 1;
    index = value.indexOf(term, index + term.length);
  }
  return count;
}

function boundedMaxResults(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_MAX_RESULTS;
  }
  return Math.max(1, Math.min(MAX_RESULT_LIMIT, Math.trunc(value ?? DEFAULT_MAX_RESULTS)));
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}
