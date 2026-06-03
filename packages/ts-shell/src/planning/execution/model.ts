import type { ContextSelection } from "../../context/selection/model.js";

export type ExecutionPlanState = "ready" | "partial" | "blocked";

export interface ExecutionPlanInput {
  readonly taskKind: string;
  readonly outputKind: string;
  readonly allowedTools: readonly string[];
  readonly allowedWrites: readonly string[];
  readonly successRubric: readonly string[];
  readonly context: ContextSelection;
}

export interface ExecutionPlan {
  readonly state: ExecutionPlanState;
  readonly steps: readonly string[];
  readonly requiredTools: readonly string[];
  readonly writeRequired: boolean;
  readonly blockers: readonly string[];
  readonly terminalSuccessClaim: false;
}

export function buildExecutionPlan(input: ExecutionPlanInput): ExecutionPlan {
  const requiredTools = requiredToolsFor(input);
  const missingTools = requiredTools.filter((tool) => !input.allowedTools.includes(tool));
  const writeRequired = input.outputKind === "diff" || input.outputKind === "artifact";
  const missingWriteAuthority = writeRequired && input.allowedWrites.length === 0 && input.taskKind !== "workspace-understanding";
  const blockers = [
    ...input.context.blockers,
    ...missingTools.map((tool) => `missing tool: ${tool}`),
    ...(missingWriteAuthority ? ["write authority missing"] : []),
  ];
  const state: ExecutionPlanState = blockers.length > 0
    ? "blocked"
    : input.context.state === "ready"
      ? "ready"
      : "partial";

  return freeze({
    state,
    steps: stepsFor(input),
    requiredTools,
    writeRequired,
    blockers,
    terminalSuccessClaim: false,
  });
}

function requiredToolsFor(input: ExecutionPlanInput): readonly string[] {
  if (input.taskKind === "debug-repair") {
    return ["read", "repair", "verify"];
  }
  if (input.outputKind === "artifact") {
    return ["read", "write", "verify"];
  }
  if (input.taskKind === "continuation") {
    return ["read", "continue", "verify"];
  }
  if (input.taskKind === "workspace-understanding") {
    return ["read", "search", "verify"];
  }
  return ["read", "verify"];
}

function stepsFor(input: ExecutionPlanInput): readonly string[] {
  if (input.taskKind === "debug-repair") {
    return ["inspect failure", "apply bounded repair", "rerun verification"];
  }
  if (input.outputKind === "artifact") {
    return ["inspect sources", "correct artifact", "validate artifact"];
  }
  if (input.taskKind === "continuation") {
    return ["refresh retained context", "check continuation freshness", "report remaining proof"];
  }
  if (input.taskKind === "workspace-understanding") {
    return ["rank workspace targets", "select context packet", "check context sufficiency"];
  }
  return ["inspect target", "act", "verify"];
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
