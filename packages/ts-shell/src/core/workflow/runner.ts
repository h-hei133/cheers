import type { WorkflowFile } from "./definition.js";
import { DAGResolver } from './dagResolver.js';

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

/** Compatibility admission: executable workflows require the bound native jobs owner. */
export async function runWorkflow(workflow: WorkflowFile, _cwd: string): Promise<{ readonly error: string }> {
  const graph = DAGResolver.resolve(workflow.steps.map(step => ({ id: step.id, name: step.id, dependencies: step.needs, status: 'pending' })));
  if (!graph.isValid) return { error: graph.errorMessage ?? 'Workflow graph is invalid.' };
  return { error: 'Workflow execution requires the current bound session runtime and ordinary command approval.' };
}
