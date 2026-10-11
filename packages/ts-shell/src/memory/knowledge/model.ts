import { createHash } from "node:crypto";
import { isMemoryRecord } from "../memoryPersistence.js";
import { recordHasForbiddenContent, containsRawContent, containsSecret, containsHiddenReasoning } from "../memoryValidation.js";
import { createProjectMemoryCandidate, type ProjectMemoryCandidate } from "../projectMemoryCandidate.js";
import type { ProjectMemoryRecord } from "../projectMemoryStoreContract.js";

export const KNOWLEDGE_LIMITS = { bytes: 256 * 1024, records: 256, text: 4096, references: 64, reference: 512 } as const;
export const QUEUED_MEMORY_EVIDENCE = "memory-maintenance:explicit-candidate";

export interface KnowledgeView {
  readonly kind: "project-memory-view";
  readonly version: 1;
  readonly revision: string;
  readonly records: readonly ProjectMemoryRecord[];
}

export function knowledgeView(records: readonly ProjectMemoryRecord[]): KnowledgeView {
  return { kind: "project-memory-view", version: 1,
    revision: createHash("sha256").update(JSON.stringify(records)).digest("hex"), records };
}

export function serializeKnowledge(records: readonly ProjectMemoryRecord[]): string {
  if (records.length > KNOWLEDGE_LIMITS.records || !records.every(boundedRecord)) throw new Error("Knowledge export exceeds the version 1 schema bounds.");
  const content = `${JSON.stringify(knowledgeView(records), null, 2)}\n`;
  if (Buffer.byteLength(content, "utf8") > KNOWLEDGE_LIMITS.bytes) throw new Error("Knowledge export exceeds 256 KiB.");
  return content;
}

export function importKnowledge(content: string): readonly ProjectMemoryCandidate[] {
  if (Buffer.byteLength(content, "utf8") > KNOWLEDGE_LIMITS.bytes) throw new Error("Knowledge import exceeds 256 KiB.");
  let value: unknown;
  try { value = JSON.parse(content); } catch { throw new Error("Knowledge import must be valid JSON."); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid knowledge document.");
  const document = value as Record<string, unknown>;
  if (document.kind !== "project-memory-view" || document.version !== 1
    || typeof document.revision !== "string" || !/^[a-f0-9]{64}$/.test(document.revision)
    || Object.keys(document).some((key) => !["kind", "version", "revision", "records"].includes(key))
    || !Array.isArray(document.records) || document.records.length > KNOWLEDGE_LIMITS.records
    || !document.records.every(boundedRecord)) throw new Error("Knowledge import requires bounded project-memory-view version 1 records.");
  const records = document.records as ProjectMemoryRecord[];
  if (new Set(records.map((record) => record.id)).size !== records.length
    || knowledgeView(records).revision !== document.revision) throw new Error("Knowledge import has duplicate IDs or a mismatched revision.");
  if (records.some((record) => record.invalidatedAt || record.safety !== "safe" || record.retentionClass === "never-remember" || record.candidateKind === "rejected")) {
    throw new Error("Invalidated or unsafe knowledge cannot enter the approval queue.");
  }
  return records.map((record) => createProjectMemoryCandidate({
    candidateKind: record.candidateKind, retentionClass: record.retentionClass, confidence: "medium",
    source: record.source, safety: "safe", summary: record.memoryText,
    reason: "Imported knowledge requires a fresh local approval and separate save.",
    evidence: [QUEUED_MEMORY_EVIDENCE, `memory-import:revision:${document.revision}`, `memory-import:record:${record.id}`, ...record.evidence],
    redactions: record.redactions,
  }));
}

function boundedRecord(value: unknown): value is ProjectMemoryRecord {
  if (!isMemoryRecord(value) || recordHasForbiddenContent(value)) return false;
  const permitted = ["id", "version", "createdAt", "candidateId", "candidateKind", "retentionClass", "approvedAt", "approvedBySourceCommand", "memoryText", "structuredFact", "evidence", "source", "sourcePacket", "routeReferences", "safety", "redactions", "invalidatedAt", "invalidationReason", "invalidatedBySourceCommand"];
  if (Object.keys(value).some((key) => !permitted.includes(key)) || !value.memoryText.trim()
    || value.memoryText.length > KNOWLEDGE_LIMITS.text) return false;
  for (const entry of Object.values(value)) {
    if (typeof entry === "string" && (entry.length > KNOWLEDGE_LIMITS.text || containsRawContent(entry) || containsSecret(entry) || containsHiddenReasoning(entry))) return false;
    if (Array.isArray(entry) && (entry.length > KNOWLEDGE_LIMITS.references || entry.some((reference) => typeof reference !== "string" || reference.length > KNOWLEDGE_LIMITS.reference))) return false;
  }
  if (value.structuredFact && (Object.keys(value.structuredFact).some((key) => !["subject", "predicate", "object"].includes(key))
    || Object.values(value.structuredFact).some((entry) => typeof entry !== "string" || entry.length > KNOWLEDGE_LIMITS.text))) return false;
  return true;
}
