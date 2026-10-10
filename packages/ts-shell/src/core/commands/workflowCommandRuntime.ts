import { workflowSyntax } from "../workflow/syntax.js";
import { parseSyntax } from "./syntax/parse.js";
import { syntaxHelp } from "./syntax/projection.js";
import path from "node:path";
import type { CommandContext, LocalCommandResult } from "./types.js";
import { definitionExample, listWorkflowNames, readWorkflow, workflowsDir } from "../workflow/definition.js";
import { projectTrust } from "../security/projectTrust.js";
import { runWorkflow } from '../workflow/runner.js';
import type { StepOutcome, WorkflowRun } from "../workflow/runner.js";
import { readLastRun } from "../workflow/runStore.js";
import { redactReportText } from '../security/redaction.js';

/**
 * /workflow — run a dependency graph of commands declared in this project.
 *
 * The graph is resolved into batches, each batch runs together, and a failing
 * batch stops the run. What is reported is what happened: exit codes, durations,
 * and the output of whatever failed.
 *
 * The previous implementation is worth naming, because the shape of the fix
 * follows from it. `run` built four sample tasks with their statuses already set
 * to "completed" and "in_progress", pointed `currentBatchIndex` at the second
 * batch, and answered "initiated successfully"; `status` then drew ticks against
 * batches nothing had executed. It resolved a real graph over invented nodes and
 * displayed invented progress.
 */

export async function runWorkflowCommand(
  args: string[],
  context: CommandContext,
  /** Whether this project may supply commands. Defaults to reading the trust store. */
  projectAllowed?: boolean,
): Promise<LocalCommandResult> {
  if (context.workflowCommand) return context.workflowCommand(args, context);
  const parsed = parseSyntax(workflowSyntax, args);
  if (!parsed.ok) return { kind: "local", output: `Invalid /workflow arguments: ${parsed.reason}${parsed.reason === "Missing name." ? " Which workflow?" : ""}\n${syntaxHelp(workflowSyntax)}` };
  const root = context.cwd;
  const allowed = projectAllowed ?? !projectTrust.isProjectUntrusted(root);
  const subCommand = parsed.action.name;

  if (subCommand === "list") {
    return { kind: "local", output: renderList(root) };
  }

  if (subCommand === "run") {
    const name = parsed.args[0]!;
    return { kind: "local", output: await execute(root, name, allowed) };
  }

  if (!subCommand || subCommand === "status") {
    const last = readLastRun(root);
    if (!last) {
      return {
        kind: "local",
        output: ["No workflow has run in this project yet.", "", renderList(root)].join("\n"),
      };
    }
    return { kind: "local", output: redactReportText(renderRun(last, { finished: true }), 48000, { preserveLines: true }) };
  }

  return {
    kind: "local",
    output: syntaxHelp(workflowSyntax),
  };
}

/** Load, run, and record one workflow. */
async function execute(root: string, name: string, projectAllowed: boolean): Promise<string> {
  const loaded = readWorkflow(root, name);
  if ("error" in loaded) return [loaded.error, "", definitionExample()].join("\n");

  // A workflow is a list of commands this process will run. Asking for one by
  // name is a deliberate act, but the name says nothing about the commands inside
  // it — so a project explicitly marked untrusted does not get to supply them.
  if (!projectAllowed) {
    return [
      `Refusing to run \`${name}\`: this project is marked untrusted and its workflows contain commands.`,
      "",
      `Inspect it with \`/workflow status\`, then allow the project with \`/trust on\` if the commands are acceptable.`,
    ].join("\n");
  }

  return (await runWorkflow(loaded.workflow, root)).error;
}

/** The workflows this project has, or how to add one. */
export function renderList(root: string, assertFileAccess?: (absolutePath: string) => void): string {
  const names = listWorkflowNames(root);
  const where = path.relative(root, workflowsDir(root)) || workflowsDir(root);
  if (names.length === 0) {
    return [
      `No workflows in \`${where}\`.`,
      "",
      "A workflow is a list of commands with dependencies between them. Steps that do not depend on each other run together; a failing step stops the run.",
      "",
      definitionExample(),
      "",
      `Save that as \`${path.join(where, "verify.json")}\` and run it with \`/workflow run verify\`.`,
    ].join("\n");
  }
  const rows = names.map((name) => {
    const loaded = readWorkflow(root, name, assertFileAccess);
    if ("error" in loaded) return `- \`${name}\` — unreadable: ${loaded.error}`;
    const summary = loaded.workflow.description ? ` — ${loaded.workflow.description}` : "";
    return `- \`${name}\` (${loaded.workflow.steps.length} steps)${summary}`;
  });
  return [`### Workflows in \`${where}\``, "", ...rows, "", "`/workflow run <name>` runs one."].join("\n");
}

/**
 * A run, step by step.
 *
 * The failing step's output is included in full-enough form to act on, because a
 * report that says only "failed" sends the reader back to run it again by hand.
 */
function renderRun(run: WorkflowRun, options: { readonly finished: boolean }): string {
  const passed = run.steps.filter((step) => step.status === "passed").length;
  const failed = run.steps.filter((step) => step.status === "failed");
  const skipped = run.steps.filter((step) => step.status === "skipped").length;
  const lines = [
    `### Workflow \`${run.name}\` — ${run.status}`,
    "",
    `- ${passed} passed${failed.length > 0 ? `, ${failed.length} failed` : ""}${skipped > 0 ? `, ${skipped} skipped` : ""}`,
    `- ${run.batches.length} ${run.batches.length === 1 ? "batch" : "batches"}, ran ${run.startedAt}`,
    "",
  ];

  for (const [index, batch] of run.batches.entries()) {
    lines.push(`**Batch ${index + 1}**`);
    for (const id of batch) {
      const outcome = run.steps.find((step) => step.id === id);
      lines.push(outcome ? `- ${describe(outcome)}` : `- \`${id}\` — no result recorded`);
    }
    lines.push("");
  }

  if (failed.length > 0) {
    for (const step of failed) {
      lines.push(`#### \`${step.id}\` failed`, "", "```text", step.output ?? "(no output)", "```", "");
    }
    if (skipped > 0) {
      lines.push(`${skipped} later ${skipped === 1 ? "step" : "steps"} never ran, because what they depend on failed.`, "");
    }
  } else if (options.finished) {
    lines.push("Every step passed.");
  }

  return lines.join("\n").replace(/\n+$/, "");
}

/** One step in a line: what happened, how long it took, and why if it failed. */
function describe(step: StepOutcome): string {
  const took = step.durationMs === undefined ? "" : ` · ${(step.durationMs / 1000).toFixed(1)}s`;
  if (step.status === "passed") return `\`${step.id}\` passed${took}`;
  if (step.status === "skipped") return `\`${step.id}\` skipped — a step it needs failed`;
  if (step.timedOut) return `\`${step.id}\` killed for running too long${took}`;
  return `\`${step.id}\` failed${step.exitCode === undefined ? "" : ` (exit ${step.exitCode})`}${took}`;
}
