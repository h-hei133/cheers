import type {
  ProjectMemoryRecord,
  ProjectMemoryStoreHealth,
  ProjectMemoryWriteResult,
} from "./projectMemoryStoreContract.js";

export interface ProjectMemoryStoreSurfaceInput {
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
    `- Store mode: ${input.health.mode}`,
    `- Store writable: ${input.health.writable ? "yes" : "no"}`,
    ...(input.health.storeRoot ? [`- Store root: ${input.health.storeRoot}`] : []),
    ...(input.health.recordsFile ? [`- Records file: ${input.health.recordsFile}`] : []),
    ...(typeof input.health.recordCount === "number"
      ? [`- Existing records: ${input.health.recordCount}`]
      : []),
    `- Memory written: ${written ? "yes" : "no"}`,
    `- Records saved: ${input.savedRecords.length}`,
    `- Skipped candidates: ${input.skipped.length}`,
    ...(blockers.length > 0 ? [`- Blockers: ${blockers.join("; ")}`] : []),
    "- Auto-load: no",
    "- Retrieval / wake-up / recall: not enabled",
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
      : "- DoNext: Configure an explicit local memory store in the test/dev harness before saving.";
  }
  if (written) {
    return "- DoNext: Keep using /memory for review. Retrieval and auto-load remain disabled.";
  }
  return "- DoNext: Approve a safe candidate first, then rerun /memory save <candidate-id> or /memory save approved.";
}
