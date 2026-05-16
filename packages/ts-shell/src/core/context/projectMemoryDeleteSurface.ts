import type { ProjectMemoryDeleteCommandRequest } from "./projectMemoryDeleteCommandContract.js";
import type {
  ProjectMemoryDeleteResult,
  ProjectMemoryInvalidateResult,
  ProjectMemoryStoreHealth,
} from "./projectMemoryStoreContract.js";

export interface ProjectMemoryDeleteSurfaceInput {
  readonly request: ProjectMemoryDeleteCommandRequest;
  readonly outcome: "invalidated" | "deleted" | "blocked";
  readonly health: ProjectMemoryStoreHealth;
  readonly invalidateResult?: ProjectMemoryInvalidateResult;
  readonly deleteResult?: ProjectMemoryDeleteResult;
  readonly blocker?: string;
}

export function renderProjectMemoryDeleteSurface(
  input: ProjectMemoryDeleteSurfaceInput,
): string {
  const reason =
    input.request.reason ??
    input.invalidateResult?.record?.invalidationReason ??
    input.deleteResult?.blocker ??
    input.invalidateResult?.blocker ??
    "none";
  return [
    input.request.mode === "delete"
      ? "Project memory delete"
      : "Project memory invalidate",
    "Result",
    `- Outcome: ${input.outcome}`,
    ...(input.blocker ? [`- BlockerKind: memory-lifecycle-blocked`, `- Reason: ${safeSnippet(input.blocker, 180)}`] : []),
    `- Record id: ${safeSnippet(input.request.recordId, 180)}`,
    `- Operation: ${input.request.mode}`,
    `- Reason: ${safeSnippet(reason, 180)}`,
    ...(input.invalidateResult?.record?.invalidatedAt
      ? [`- Invalidated at: ${input.invalidateResult.record.invalidatedAt}`]
      : []),
    ...(input.deleteResult?.deletedAt ? [`- Deleted at: ${input.deleteResult.deletedAt}`] : []),
    `- Store mode: ${input.health.mode}`,
    `- Store writable: ${input.health.writable ? "yes" : "no"}`,
    "- Provider/model call: none",
    "- Auto-cleanup: no",
    "- Auto-injected: no",
    "- Startup cache: not enabled",
    "- Future-turn injection: not enabled",
    "",
    "Recall / wake-up effect",
    effectLine(input),
    "",
    "Next action",
    nextAction(input),
  ].join("\n");
}

function effectLine(input: ProjectMemoryDeleteSurfaceInput): string {
  if (input.outcome === "invalidated") {
    return "- Record is excluded from normal /memory recall, /memory search, and /memory wake.";
  }
  if (input.outcome === "deleted") {
    return "- Record content was removed from the local JSONL store and will not appear in recall or wake-up.";
  }
  return "- No lifecycle change was applied.";
}

function nextAction(input: ProjectMemoryDeleteSurfaceInput): string {
  if (input.outcome === "blocked") {
    return "- Retry with /memory invalidate <record-id> or /memory delete <record-id> after confirming the id.";
  }
  return "- Use /memory recall <query> or /memory wake to confirm the lifecycle filter.";
}

function safeSnippet(value: string, maxLength: number): string {
  const redacted = value
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[REDACTED]")
    .replace(/\bRAW_[A-Z0-9_]+\b/g, "[REDACTED_RAW]")
    .replace(/\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/gi, "[REDACTED_REASONING]")
    .replace(/\s+/g, " ")
    .trim();
  return redacted.length > maxLength ? `${redacted.slice(0, maxLength - 3)}...` : redacted;
}
