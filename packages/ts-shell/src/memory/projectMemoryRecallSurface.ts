import type { ProjectMemoryRecallCommandRequest } from "./projectMemoryRecallCommandContract.js";
import type {
  ProjectMemoryRetrievalMatch,
  ProjectMemoryRetrievalResult,
} from "./projectMemoryRetrieval.js";
import type { ProjectMemoryWakeupPreview } from "./projectMemoryWakeup.js";
import type { ProjectMemoryStoreHealth } from "./projectMemoryStoreContract.js";
import { renderProjectMemoryHealth } from "./store/health.js";

export interface ProjectMemoryRecallSurfaceInput {
  readonly request: ProjectMemoryRecallCommandRequest;
  readonly outcome: "recalled" | "wakeup-preview" | "blocked";
  readonly health: ProjectMemoryStoreHealth;
  readonly retrieval?: ProjectMemoryRetrievalResult;
  readonly wakeup?: ProjectMemoryWakeupPreview;
  readonly blocker?: string;
}

export function renderProjectMemoryRecallSurface(
  input: ProjectMemoryRecallSurfaceInput,
): string {
  if (input.request.mode === "wake") {
    return renderWakeSurface(input);
  }
  return renderRecallSurface(input);
}

function renderRecallSurface(input: ProjectMemoryRecallSurfaceInput): string {
  const matches = input.retrieval?.matches ?? [];
  return [
    "Project memory recall",
    "Result",
    `- Outcome: ${input.outcome}`,
    ...(input.blocker ? [`- BlockerKind: memory-recall-blocked`, `- Reason: ${input.blocker}`] : []),
    `- Query: ${safeSnippet(input.request.query ?? "", 180)}`,
    `- Result count: ${matches.length}`,
    ...renderProjectMemoryHealth(input.health),
    "- Provider/model call: none",
    "- Auto-injected: no",
    "- Startup cache changed: no",
    "",
    "Matches",
    ...matchLines(matches),
    "",
    "Next action",
    nextAction(input, matches.length),
  ].join("\n");
}

function renderWakeSurface(input: ProjectMemoryRecallSurfaceInput): string {
  const wakeup = input.wakeup;
  return [
    "Project memory wake-up preview",
    "Result",
    `- Outcome: ${input.outcome}`,
    ...(input.blocker ? [`- BlockerKind: memory-wakeup-blocked`, `- Reason: ${input.blocker}`] : []),
    ...renderProjectMemoryHealth(input.health),
    `- Total records scanned: ${wakeup?.totalRecords ?? 0}`,
    "- Provider/model call: none",
    "- Auto-injected: no",
    "- Startup cache changed: no",
    "",
    wakeup?.l0.title ?? "L0-like stable project facts and explicit preferences",
    ...recordLines(wakeup?.l0.records ?? []),
    "",
    wakeup?.l1.title ?? "L1-like essential project story",
    ...recordLines(wakeup?.l1.records ?? []),
    "",
    "Warnings",
    ...(wakeup?.warnings ?? ["project-memory-wakeup:not-generated"]).map((warning) => `- ${warning}`),
    "",
    "Next action",
    input.blocker
      ? "- Configure an explicit local memory store, then rerun /memory wake."
      : "- Use /memory recall <query> for on-demand details. Auto-injection remains disabled.",
  ].join("\n");
}

function matchLines(matches: readonly ProjectMemoryRetrievalMatch[]): readonly string[] {
  if (matches.length === 0) {
    return ["- none"];
  }
  return matches.map((match, index) => {
    const record = match.record;
    return [
      `- ${index + 1}. ${safeSnippet(record.memoryText, 180)}`,
      `  id=${record.id}`,
      `kind=${record.candidateKind}`,
      `retention=${record.retentionClass}`,
      `source=${record.source}`,
      `safety=${record.safety}`,
      `createdAt=${record.createdAt}`,
      `score=${match.score}`,
      `reasons=${match.reasons.join(",") || "none"}`,
      `evidence=${record.evidence.slice(0, 3).join(",") || "none"}`,
    ].join(" ");
  });
}

function recordLines(records: readonly { readonly memoryText: string; readonly id: string; readonly candidateKind: string }[]): readonly string[] {
  if (records.length === 0) {
    return ["- none"];
  }
  return records.map(
    (record) => `- ${safeSnippet(record.memoryText, 180)} [${record.candidateKind}; ${record.id}]`,
  );
}

function nextAction(
  input: ProjectMemoryRecallSurfaceInput,
  matchCount: number,
): string {
  if (input.blocker) {
    return "- Configure an explicit local memory store, then rerun /memory recall <query>.";
  }
  if (matchCount === 0) {
    return "- Try a different query or save approved memories first.";
  }
  return "- Use the recalled references manually or stage them with /memory use <query>. This recall did not inject them.";
}

function safeSnippet(value: string, maxLength: number): string {
  const compact = value.replace(/\s+/g, " ").trim();
  const redacted = compact
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[REDACTED]")
    .replace(/\bRAW_[A-Z0-9_]+\b/g, "[REDACTED_RAW]")
    .replace(/\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/gi, "[REDACTED_REASONING]");
  return redacted.length > maxLength ? `${redacted.slice(0, maxLength - 3)}...` : redacted;
}
