import fs from "node:fs";
import path from "node:path";
import { projectStateDir } from "../state/projectState.js";
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
    const parsed = JSON.parse(fs.readFileSync(runRecordPath(workspaceRoot), "utf8")) as unknown;
    return isRun(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Record `run`, returning the path written, or undefined when it could not be. */
export function writeRun(workspaceRoot: string, run: WorkflowRun): string | undefined {
  const target = runRecordPath(workspaceRoot);
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, `${JSON.stringify(run, null, 2)}\n`, "utf8");
    return target;
  } catch {
    return undefined;
  }
}

/** Whether a parsed record is shaped the way this version writes them. */
function isRun(value: unknown): value is WorkflowRun {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.name === "string" &&
    typeof record.startedAt === "string" &&
    (record.status === "passed" || record.status === "failed") &&
    Array.isArray(record.steps) &&
    Array.isArray(record.batches)
  );
}
