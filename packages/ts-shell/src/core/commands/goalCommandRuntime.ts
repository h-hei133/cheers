import type { CommandContext, LocalCommandResult } from "./types.js";
import {
  readProjectState,
  writeProjectState,
  type GoalPhase,
  type StoredGoal,
} from "../state/projectState.js";

/**
 * /goal — the objective this project is working towards.
 *
 * The objective is kept on disk per project rather than in memory. It exists to
 * stop a long piece of work from drifting, and long work spans restarts: an
 * objective that only lasts as long as the process is gone exactly when it was
 * supposed to be doing its job.
 */

export type { GoalPhase };
export type GoalState = StoredGoal;

/** The objective recorded for this project, or none. */
export function getActiveSessionGoal(workspaceRoot: string): GoalState | null {
  return readProjectState(workspaceRoot).goal ?? null;
}

/** Record `goal`, returning the file it was written to, or undefined if it was not. */
export function setActiveSessionGoal(
  workspaceRoot: string,
  goal: GoalState | null,
): string | undefined {
  return writeProjectState(workspaceRoot, { goal });
}

export async function runGoalCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const root = context.cwd;
  const current = getActiveSessionGoal(root);
  const subCommand = args.length === 1 ? args[0]?.toLowerCase() : undefined;

  if (args.length === 0) {
    if (!current) {
      return {
        kind: "local",
        output: [
          "No objective set for this project.",
          "",
          "Usage: `/goal <objective>` · `/goal pause` · `/goal resume` · `/goal complete` · `/goal clear`",
        ].join("\n"),
      };
    }
    return {
      kind: "local",
      output: [
        "### Objective",
        "",
        `- ${current.objective}`,
        `- Status: \`${current.phase}\`${current.updatedAt ? ` · set ${current.updatedAt}` : ""}`,
        "",
        current.phase === "active"
          ? "Every turn carries this objective in its environment line, so the model sees it again each time."
          : "A paused or completed objective is kept but not carried into turns. `/goal resume` puts it back.",
      ].join("\n"),
    };
  }

  if (subCommand === "clear") {
    if (!current) return { kind: "local", output: "No objective to clear." };
    return { kind: "local", output: report(setActiveSessionGoal(root, null), "Objective cleared.") };
  }

  const moved = movePhase(subCommand);
  if (moved) {
    if (!current) {
      return {
        kind: "local",
        output: "No objective yet. `/goal <objective>` sets one.",
      };
    }
    const next: GoalState = { ...current, phase: moved, updatedAt: new Date().toISOString() };
    return {
      kind: "local",
      output: report(
        setActiveSessionGoal(root, next),
        `Objective ${moved === "active" ? "resumed" : moved}: "${current.objective}"`,
      ),
    };
  }

  const objective = args.join(" ").trim();
  if (!objective) return { kind: "local", output: "An objective needs some words." };
  const written = setActiveSessionGoal(root, {
    objective,
    phase: "active",
    updatedAt: new Date().toISOString(),
  });
  return {
    kind: "local",
    output: report(
      written,
      ["### Objective set", "", `- ${objective}`, "- Status: `active`", "", "Every turn from here carries it."].join("\n"),
    ),
  };
}

/** The phase a subcommand asks for, or undefined when it is not one. */
function movePhase(subCommand: string | undefined): GoalPhase | undefined {
  if (subCommand === "pause") return "paused";
  if (subCommand === "resume") return "active";
  if (subCommand === "complete" || subCommand === "done") return "complete";
  return undefined;
}

/**
 * The outcome, with the failure named when there was one.
 *
 * An objective that could not be written down has not survived anything, and
 * saying "set" would be claiming a durability the file system just refused.
 */
function report(written: string | undefined, success: string): string {
  if (written) return success;
  return [
    success.split("\n")[0],
    "",
    "It could not be written to disk, so it will be lost when this process ends.",
  ].join("\n");
}
