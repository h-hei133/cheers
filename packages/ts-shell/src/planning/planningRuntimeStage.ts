import type { QueryEvent } from "../core/query/events.js";
import type { ToolDispatcher } from "../tools/dispatcher.js";
import type {
  CodingResultSummary,
} from "../orchestration/types.js";
import { runPlanningRuntime } from "../orchestration/readInspectModule.js";
import { projectPlanningRuntimeProductOutcome } from "./runtime/projection.js";
import type { PlanningRuntimeProductExecutionOptions } from "../orchestration/planningRuntimeProductExecution.js";
import { selectPlanningRuntimeProductRoute } from "../orchestration/planningRuntimeProductRoute.js";
import type { WorkflowTaskPlan } from "../orchestration/workflowTaskPlanner.js";

export interface PlanningRuntimeStageResult {
  readonly events: QueryEvent[];
  readonly notes: string[];
  readonly codingResult: CodingResultSummary;
  readonly userFacingOutput: string;
}

export async function runPlanningRuntimeStage(input: {
  readonly plan: WorkflowTaskPlan;
  readonly prompt: string;
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly turn: number;
  readonly dispatcher: ToolDispatcher;
  readonly events: QueryEvent[];
  readonly baseNotes: readonly string[];
  readonly abortSignal?: AbortSignal;
  readonly planningMutationExecution?: PlanningRuntimeProductExecutionOptions;
}): Promise<PlanningRuntimeStageResult | undefined> {
  const route = selectPlanningRuntimeProductRoute(input.plan, {
    prompt: input.prompt,
  });
  if (!route.shouldRun) {
    return undefined;
  }

  const planning = await runPlanningRuntime({
    workspaceRoot: input.workspaceRoot,
    userTask: input.prompt,
    taskKindHint: route.taskKind,
  });
  const projected = await projectPlanningRuntimeProductOutcome({
    result: planning,
    taskKind: route.taskKind,
    routeReason: route.routeReason,
    routeEvidence: route.evidence,
    productPath: "runMvpIntegratedFlow",
    workspaceRoot: input.workspaceRoot,
    sessionId: input.sessionId,
    prompt: input.prompt,
    execution: input.planningMutationExecution,
    verificationRuntime: {
      dispatcher: input.dispatcher,
      events: input.events,
      taskId: `planning_runtime_product_verify_${input.turn}`,
      sessionId: input.sessionId,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    },
  });

  return {
    events: input.events,
    notes: [
      ...input.baseNotes,
      `planning-runtime: ${planning.runtimeId}`,
      `context-engine: ${planning.context.engineId}`,
      `planning-runtime-status: ${planning.status}`,
      "planning-runtime-product:path:runMvpIntegratedFlow",
      ...route.evidence,
      "planning-runtime-product:review-only-no-write-handoff",
    ],
    ...projected,
  };
}
