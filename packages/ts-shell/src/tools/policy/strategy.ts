import type { ExecutionPlan } from "../../planning/execution/model.js";
import type { TaskRequestPacket } from "../../provider/request/packet.js";

export type ToolStrategyState = "ready" | "blocked";

export interface ToolStrategyInput {
  readonly allowedTools: readonly string[];
  readonly plan: ExecutionPlan;
  readonly request: TaskRequestPacket;
}

export interface ToolStrategy {
  readonly state: ToolStrategyState;
  readonly actions: readonly string[];
  readonly blockers: readonly string[];
  readonly terminalSuccessClaim: false;
}

export function chooseToolStrategy(input: ToolStrategyInput): ToolStrategy {
  const missingTools = input.plan.requiredTools.filter((tool) => !input.allowedTools.includes(tool));
  const blockers = [
    ...input.request.blockers,
    ...missingTools.map((tool) => `tool unavailable: ${tool}`),
  ];

  return freeze({
    state: blockers.length > 0 ? "blocked" : "ready",
    actions: input.plan.steps.map((step) => actionFor(step)),
    blockers,
    terminalSuccessClaim: false,
  });
}

function actionFor(step: string): string {
  if (step.includes("repair")) {
    return "repair";
  }
  if (step.includes("artifact") || step.includes("sources")) {
    return "artifact";
  }
  if (step.includes("continuation")) {
    return "continue";
  }
  if (step.includes("verify") || step.includes("check")) {
    return "verify";
  }
  if (step.includes("rank") || step.includes("select")) {
    return "search";
  }
  return "read";
}

function freeze<T>(value: T): Readonly<T> {
  return Object.freeze(value);
}
