import type {
  ProjectMemoryRecord,
  ProjectMemoryStoreHealth,
  ProjectMemoryWriteResult,
} from "./projectMemoryStoreContract.js";
import { renderProjectMemoryHealth } from "./store/health.js";
import type { RetentionState } from "../core/state/retention.js";

export interface ProjectMemoryStoreSurfaceInput {
  readonly reviewRetention?: RetentionState;
  readonly outcome: "saved" | "blocked" | "status";
  readonly health: ProjectMemoryStoreHealth;
  readonly savedRecords: readonly ProjectMemoryRecord[];
  readonly skipped: readonly string[];
  readonly writeResults: readonly ProjectMemoryWriteResult[];
  readonly blocker?: string;
}

export function renderProjectMemoryStoreSurface(
  input: ProjectMemoryStoreSurfaceInput,
): string {
  const written = input.savedRecords.length > 0;
  const blockers = [
    input.blocker,
    ...input.writeResults.map((result) => result.blocker),
  ].filter((value): value is string => Boolean(value));

  return [
    "Project memory store",
    "Result",
    `- Outcome: ${input.outcome}`,
    ...renderProjectMemoryHealth(input.health),
    ...(input.health.storeRoot ? [`- Store root: ${input.health.storeRoot}`] : []),
    ...(input.health.recordsFile ? [`- Records file: ${input.health.recordsFile}`] : []),
    ...(typeof input.health.recordCount === "number"
      ? [`- Existing records: ${input.health.recordCount}`]
      : []),
    `- Memory written: ${written ? "yes" : "no"}`,
    `- Records saved: ${input.savedRecords.length}`,
    `- Skipped candidates: ${input.skipped.length}`,
    ...(input.reviewRetention?.incomplete ? [`- Review history: incomplete (${input.reviewRetention.dropped} entries dropped; counts cover retained candidates only)`] : []),
    ...(blockers.length > 0 ? [`- Blockers: ${blockers.join("; ")}`] : []),
    "- Auto-load: no",
    "- Provider/model call: none",
    nextAction(input, written),
  ].join("\n");
}

function nextAction(
  input: ProjectMemoryStoreSurfaceInput,
  written: boolean,
): string {
  if (input.outcome === "status") {
    return input.health.writable
      ? "- DoNext: Review candidates with /memory, approve safe candidates, then run /memory save <candidate-id> or /memory save approved."
      : "- DoNext: Resolve the reported store issue before saving.";
  }
  if (written) {
    return "- DoNext: Use /memory recall <query> or /memory use to select the saved records.";
  }
  return "- DoNext: Approve a safe candidate first, then rerun /memory save <candidate-id> or /memory save approved.";
}
