import path from "node:path";
import { projectStateDir } from "../state/projectState.js";
import { readTextFile } from '../workspace/files.js';
import type { WorkflowRun } from "./runner.js";

/**
 * The last workflow run, kept on disk.
 *
 * `/workflow status` has to answer after the process that ran the workflow is
 * gone, which is the normal case: a run finishes, the user reads something else,
 * and comes back. Holding the record in memory meant status could only ever
 * describe the current process, and the previous implementation filled that gap
 * by displaying progress it had never observed.
 */

const RUN_FILE = "workflow.json";

/** Where the record lives, beside the project's other durable state. */
export function runRecordPath(workspaceRoot: string): string {
  return path.join(projectStateDir(workspaceRoot), RUN_FILE);
}

/** The last recorded run, or none. Never throws. */
export function readLastRun(workspaceRoot: string): WorkflowRun | undefined {
  try {
    const content = readTextFile(runRecordPath(workspaceRoot), 512 * 1024);
    if (content === undefined) return undefined;
    const parsed = JSON.parse(content) as unknown;
    return isRun(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Whether a parsed record is shaped the way this version writes them. */
function isRun(value: unknown): value is WorkflowRun {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.name === "string" && record.name.length <= 256 &&
    typeof record.startedAt === "string" && record.startedAt.length <= 64 &&
    typeof record.finishedAt === "string" && record.finishedAt.length <= 64 &&
    (record.status === "passed" || record.status === "failed") &&
    Array.isArray(record.steps) && record.steps.length <= 32 && record.steps.every(isStep) &&
    Array.isArray(record.batches) && record.batches.length <= 32 && record.batches.every(batch =>
      Array.isArray(batch) && batch.length <= 32 && batch.every(id => typeof id === 'string' && id.length <= 64))
  );
}

function isStep(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const step = value as Record<string, unknown>;
  return typeof step.id === 'string' && step.id.length <= 64 && ['passed', 'failed', 'skipped'].includes(String(step.status))
    && (step.output === undefined || typeof step.output === 'string' && step.output.length <= 65536)
    && (step.exitCode === undefined || Number.isSafeInteger(step.exitCode))
    && (step.durationMs === undefined || typeof step.durationMs === 'number' && Number.isFinite(step.durationMs) && step.durationMs >= 0)
    && (step.timedOut === undefined || typeof step.timedOut === 'boolean');
}
