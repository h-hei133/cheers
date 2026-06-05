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
  readonly actionContracts: readonly ActionContract[];
  readonly requiredTools: readonly string[];
  readonly writeRequired: boolean;
  readonly blockers: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface ActionContract {
  readonly action: string;
  readonly preconditions: readonly string[];
  readonly expectedObservations: readonly string[];
  readonly proofContribution: string;
  readonly fallbackAction: string;
  readonly budgetImpact: "low" | "medium" | "high";
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
    actionContracts: actionContractsFor(input),
    requiredTools,
    writeRequired,
    blockers,
    terminalSuccessClaim: false,
  });
}

function actionContractsFor(input: ExecutionPlanInput): readonly ActionContract[] {
  return freeze(stepsFor(input).map((step) => contractFor(step, input)));
}

function contractFor(step: string, input: ExecutionPlanInput): ActionContract {
  const action = actionForStep(step);
  return freeze({
    action,
    preconditions: preconditionsFor(action, input),
    expectedObservations: expectedObservationsFor(action, input),
    proofContribution: proofContributionFor(action),
    fallbackAction: fallbackActionFor(action),
    budgetImpact: budgetImpactFor(action),
  });
}

function actionForStep(step: string): string {
  if (step.includes("verify") || step.includes("verification") || step.includes("check") || step.includes("validation")) return "verify";
  if (step.includes("repair")) return "repair";
  if (step.includes("artifact") || step.includes("sources")) return "artifact";
  if (step.includes("continuation")) return "continue";
  if (step.includes("rank") || step.includes("select")) return "search";
  if (step.includes("act") || step.includes("correct")) return "edit";
  return "read";
}

function preconditionsFor(action: string, input: ExecutionPlanInput): readonly string[] {
  if (action === "edit" || action === "repair" || action === "artifact") {
    return freeze(["context ready", "write authority available"]);
  }
  if (action === "verify") {
    return freeze(input.context.verificationPaths.length > 0 ? ["verification target selected"] : ["verification target needed"]);
  }
  if (action === "continue") {
    return freeze(["continuation facts available"]);
  }
  return freeze(["task context available"]);
}

function expectedObservationsFor(action: string, input: ExecutionPlanInput): readonly string[] {
  if (action === "verify") {
    return freeze(input.context.verificationPaths.length > 0 ? input.context.verificationPaths : ["task-relevant check result"]);
  }
  if (action === "edit" || action === "repair") {
    return freeze(input.allowedWrites.length > 0 ? input.allowedWrites : ["changed target accounting"]);
  }
  if (action === "artifact") {
    return freeze(input.allowedWrites.length > 0 ? input.allowedWrites : ["artifact validation receipt"]);
  }
  return freeze(input.context.selectedPaths.length > 0 ? input.context.selectedPaths : ["context evidence"]);
}

function proofContributionFor(action: string): string {
  if (action === "verify") return "closes task-relevant proof gap";
  if (action === "repair") return "addresses preserved failure before recheck";
  if (action === "artifact") return "connects artifact claims to evidence";
  if (action === "continue") return "restores pending work with proof gap";
  if (action === "edit") return "changes task target";
  return "adds grounded context";
}

function fallbackActionFor(action: string): string {
  if (action === "repair") return "search";
  if (action === "verify") return "repair";
  if (action === "artifact") return "verify";
  if (action === "continue") return "read";
  if (action === "edit") return "verify";
  return "stop-not-proven";
}

function budgetImpactFor(action: string): "low" | "medium" | "high" {
  if (action === "repair" || action === "artifact") return "high";
  if (action === "edit" || action === "verify" || action === "search") return "medium";
  return "low";
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
  if (input.outputKind === "diff") {
    return ["read", "edit", "verify"];
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
    return ["rank workspace targets", "narrow owner context", "check context sufficiency"];
  }
  return ["inspect target", "act", "verify"];
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
