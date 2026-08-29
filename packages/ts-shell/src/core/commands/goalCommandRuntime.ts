import type { CommandContext, LocalCommandResult } from "./types.js";

export type GoalPhase = "active" | "paused" | "complete";

export interface GoalState {
  objective: string;
  phase: GoalPhase;
  updatedAt: string;
}

// In-memory session goal state
let currentSessionGoal: GoalState | null = null;

export function getActiveSessionGoal(): GoalState | null {
  return currentSessionGoal;
}

export function setActiveSessionGoal(goal: GoalState | null): void {
  currentSessionGoal = goal;
}

/**
 * /goal (aliases: /objective, /target)
 * Goal state machine management (active / paused / complete) to prevent goal drift in long sessions.
 */
export async function runGoalCommand(
  args: string[],
  _context: CommandContext,
): Promise<LocalCommandResult> {
  const isSingleWord = args.length === 1;
  const subCommand = isSingleWord ? args[0]?.toLowerCase() : undefined;

  if (args.length === 0) {
    if (!currentSessionGoal) {
      return {
        kind: "local",
        output: "No active goal set for this session.\nUsage: /goal <objective> | /goal pause | /goal resume | /goal complete | /goal clear",
      };
    }
    return {
      kind: "local",
      output: [
        "# Current Session Goal (/goal)",
        "",
        `- **Objective**: ${currentSessionGoal.objective}`,
        `- **Status**: \`${currentSessionGoal.phase.toUpperCase()}\``,
        `- **Last Updated**: ${currentSessionGoal.updatedAt}`,
        "",
        "Goal is actively injected into agent system prompt to prevent drift.",
      ].join("\n"),
    };
  }
  if (subCommand === "clear") {
    currentSessionGoal = null;
    return {
      kind: "local",
      output: "Session goal cleared.",
    };
  }

  if (subCommand === "pause") {
    if (!currentSessionGoal) {
      return { kind: "local", output: "No active goal to pause." };
    }
    currentSessionGoal.phase = "paused";
    currentSessionGoal.updatedAt = new Date().toISOString();
    return {
      kind: "local",
      output: `Goal paused: "${currentSessionGoal.objective}"`,
    };
  }

  if (subCommand === "resume") {
    if (!currentSessionGoal) {
      return { kind: "local", output: "No goal to resume. Use /goal <objective> to set one." };
    }
    currentSessionGoal.phase = "active";
    currentSessionGoal.updatedAt = new Date().toISOString();
    return {
      kind: "local",
      output: `Goal resumed (active): "${currentSessionGoal.objective}"`,
    };
  }

  if (subCommand === "complete" || subCommand === "done") {
    if (!currentSessionGoal) {
      return { kind: "local", output: "No active goal to complete." };
    }
    currentSessionGoal.phase = "complete";
    currentSessionGoal.updatedAt = new Date().toISOString();
    return {
      kind: "local",
      output: `Goal marked as COMPLETE: "${currentSessionGoal.objective}"`,
    };
  }

  // Setting a new goal objective
  const objective = args.join(" ").trim();
  currentSessionGoal = {
    objective,
    phase: "active",
    updatedAt: new Date().toISOString(),
  };

  return {
    kind: "local",
    output: [
      "# Goal Established & Armed (/goal)",
      "",
      `- **Objective**: ${objective}`,
      "- **Status**: `ACTIVE`",
      "",
      "This goal will be pinned to agent reasoning context across turns.",
    ].join("\n"),
  };
}
