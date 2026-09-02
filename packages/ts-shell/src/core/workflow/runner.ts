import { exec } from "node:child_process";
import { DAGResolver } from "./dagResolver.js";
import { ParallelDispatcher } from "./parallelDispatcher.js";
import type { WorkflowFile, WorkflowStep } from "./definition.js";

/**
 * Running a workflow.
 *
 * The dependency graph decides the order and the parallelism: steps with no
 * unmet dependency run together, and the next group does not start until the
 * previous one has finished. A batch with a failure stops the run, and everything
 * that depended on it is reported as skipped rather than as passed or as pending
 * — those are three different facts and only one of them is true.
 *
 * Nothing here reports a status it did not observe. A step's verdict is its exit
 * code; a step that never ran says so.
 */

export type StepStatus = "passed" | "failed" | "skipped";

export interface StepOutcome {
  readonly id: string;
  readonly status: StepStatus;
  readonly exitCode?: number;
  readonly durationMs?: number;
  /** Combined output, kept short enough to read and long enough to act on. */
  readonly output?: string;
  /** Set when the step was killed for running too long. */
  readonly timedOut?: boolean;
}

export interface WorkflowRun {
  readonly name: string;
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly status: "passed" | "failed";
  readonly batches: readonly (readonly string[])[];
  readonly steps: readonly StepOutcome[];
}

/** How much of a step's output is kept in the record. */
const OUTPUT_LIMIT = 4_000;

/** Resolve the graph and run it, batch by batch. */
export async function runWorkflow(
  workflow: WorkflowFile,
  cwd: string,
): Promise<{ readonly run: WorkflowRun } | { readonly error: string }> {
  const resolution = DAGResolver.resolve(
    workflow.steps.map((step) => ({
      id: step.id,
      name: step.id,
      dependencies: step.needs,
      status: "pending" as const,
    })),
  );
  if (!resolution.isValid) {
    return { error: resolution.errorMessage ?? "The workflow graph could not be resolved." };
  }

  const byId = new Map(workflow.steps.map((step) => [step.id, step]));
  const outcomes: StepOutcome[] = [];
  const startedAt = new Date().toISOString();
  let halted = false;

  for (const batch of resolution.executionBatches) {
    if (halted) {
      for (const id of batch) outcomes.push({ id, status: "skipped" });
      continue;
    }
    const results = await ParallelDispatcher.run(
      batch.map((id) => () => runStep(byId.get(id)!, cwd)),
      { maxConcurrency: workflow.maxConcurrency },
    );
    outcomes.push(...results);
    if (results.some((result) => result.status === "failed")) halted = true;
  }

  return {
    run: {
      name: workflow.name,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: halted ? "failed" : "passed",
      batches: resolution.executionBatches,
      steps: outcomes,
    },
  };
}

/**
 * One step.
 *
 * A non-zero exit is a failure and its output is kept, because that output is the
 * only thing that makes the failure actionable. A timeout is recorded as such:
 * "killed after 600s" and "exited 1" call for different next moves.
 */
async function runStep(step: WorkflowStep, cwd: string): Promise<StepOutcome> {
  const began = Date.now();
  return new Promise((resolve) => {
    exec(
      step.run,
      { cwd, timeout: step.timeoutSeconds * 1_000, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - began;
        const output = trim([stdout, stderr].filter(Boolean).join("\n"));
        if (!error) {
          resolve({ id: step.id, status: "passed", exitCode: 0, durationMs, ...(output ? { output } : {}) });
          return;
        }
        const killed = (error as { killed?: boolean }).killed === true;
        const code = typeof error.code === "number" ? error.code : undefined;
        resolve({
          id: step.id,
          status: "failed",
          ...(code !== undefined ? { exitCode: code } : {}),
          durationMs,
          output: output || error.message,
          ...(killed ? { timedOut: true } : {}),
        });
      },
    );
  });
}

/** The tail of the output, which is where a failure says what happened. */
function trim(text: string): string {
  const clean = text.replace(/\s+$/, "");
  if (clean.length <= OUTPUT_LIMIT) return clean;
  return `...[earlier output omitted]\n${clean.slice(clean.length - OUTPUT_LIMIT)}`;
}
