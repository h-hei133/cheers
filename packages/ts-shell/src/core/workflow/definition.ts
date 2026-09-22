import fs from "node:fs";
import path from "node:path";

/**
 * Workflow definitions, read from the repository.
 *
 * A workflow is a list of steps with dependencies between them, written down in
 * the project rather than built in. Built-in "templates" were what made the
 * command a facade: three topologies were described in prose, none of them had an
 * implementation, and running one produced sample tasks with their statuses
 * already filled in. A workflow that lives in the repository is one whose steps
 * are real commands, and whose result can therefore be true or false.
 */

export interface WorkflowStep {
  readonly id: string;
  /** Shell command to run. */
  readonly run: string;
  /** Step ids that must pass first. */
  readonly needs: readonly string[];
  /** Seconds this step may take before it is killed. */
  readonly timeoutSeconds: number;
}

export interface WorkflowFile {
  readonly name: string;
  readonly description?: string;
  readonly maxConcurrency: number;
  readonly steps: readonly WorkflowStep[];
  /** Where it was read from, for reporting. */
  readonly source: string;
}

const DEFAULT_TIMEOUT_SECONDS = 600;
const DEFAULT_CONCURRENCY = 4;

/** Where this project keeps its workflows. */
export function workflowsDir(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".agents", "workflows");
}

/** Names of the workflows present, in alphabetical order. */
export function listWorkflowNames(workspaceRoot: string): readonly string[] {
  try {
    return fs
      .readdirSync(workflowsDir(workspaceRoot))
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => entry.slice(0, -".json".length))
      .sort();
  } catch {
    return [];
  }
}

/**
 * One workflow, or why it could not be read.
 *
 * A malformed definition is reported rather than skipped: a workflow the user
 * believes exists and that silently does not run is worse than an error.
 */
export function readWorkflow(
  workspaceRoot: string,
  name: string,
): { readonly workflow: WorkflowFile } | { readonly error: string } {
  const source = path.join(workflowsDir(workspaceRoot), `${name}.json`);
  let raw: string;
  try {
    raw = fs.readFileSync(source, "utf8");
  } catch {
    return { error: `No workflow named "${name}" in ${path.relative(workspaceRoot, workflowsDir(workspaceRoot))}.` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { error: `${name}.json is not valid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
  return build(parsed, name, source);
}

/** A validated workflow from parsed JSON, or the first thing wrong with it. */
function build(
  parsed: unknown,
  name: string,
  source: string,
): { readonly workflow: WorkflowFile } | { readonly error: string } {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: `${name}.json must hold an object.` };
  }
  const record = parsed as Record<string, unknown>;
  const rawSteps = record.steps;
  if (!Array.isArray(rawSteps) || rawSteps.length === 0) {
    return { error: `${name}.json needs a non-empty "steps" array.` };
  }
  const steps: WorkflowStep[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of rawSteps.entries()) {
    const step = readStep(entry, index);
    if ("error" in step) return { error: `${name}.json: ${step.error}` };
    if (seen.has(step.step.id)) return { error: `${name}.json: two steps share the id "${step.step.id}".` };
    seen.add(step.step.id);
    steps.push(step.step);
  }
  const concurrency = record.maxConcurrency;
  return {
    workflow: {
      name: typeof record.name === "string" && record.name.length > 0 ? record.name : name,
      ...(typeof record.description === "string" ? { description: record.description } : {}),
      maxConcurrency:
        typeof concurrency === "number" && concurrency >= 1 ? Math.floor(concurrency) : DEFAULT_CONCURRENCY,
      steps,
      source,
    },
  };
}

/** One step, or what is wrong with it. */
function readStep(
  entry: unknown,
  index: number,
): { readonly step: WorkflowStep } | { readonly error: string } {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    return { error: `step ${index + 1} must be an object.` };
  }
  const record = entry as Record<string, unknown>;
  const id = record.id;
  if (typeof id !== "string" || id.trim().length === 0) {
    return { error: `step ${index + 1} needs an "id".` };
  }
  const run = record.run;
  if (typeof run !== "string" || run.trim().length === 0) {
    return { error: `step "${id}" needs a "run" command.` };
  }
  const needs = record.needs;
  if (needs !== undefined && !(Array.isArray(needs) && needs.every((value) => typeof value === "string"))) {
    return { error: `step "${id}" has a "needs" that is not a list of step ids.` };
  }
  const timeout = record.timeoutSeconds;
  return {
    step: {
      id: id.trim(),
      run: run.trim(),
      needs: (needs as string[] | undefined) ?? [],
      timeoutSeconds:
        typeof timeout === "number" && timeout > 0 ? Math.floor(timeout) : DEFAULT_TIMEOUT_SECONDS,
    },
  };
}

/** The shape a definition file takes, for an error message to point at. */
export function definitionExample(): string {
  return [
    "```json",
    JSON.stringify(
      {
        name: "verify",
        description: "build first, then tests and types together",
        maxConcurrency: 2,
        steps: [
          { id: "build", run: "npm run build" },
          { id: "test", run: "npm test", needs: ["build"] },
          { id: "types", run: "npx tsc --noEmit", needs: ["build"], timeoutSeconds: 300 },
        ],
      },
      null,
      2,
    ),
    "```",
  ].join("\n");
}
