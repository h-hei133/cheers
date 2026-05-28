import { detectWorkflowBrowserPlan } from "../orchestration/browserModule.js";
import type { ContinuityStateLike } from "../orchestration/runtimeHandoffProjection.js";
import type { WorkflowTaskPlan } from "../orchestration/workflowTaskPlanner.js";

export function buildBrowserIntentPlan(input: {
  readonly prompt: string;
  readonly continuity: ContinuityStateLike;
}): WorkflowTaskPlan | undefined {
  const browserPlan = detectWorkflowBrowserPlan({
    prompt: input.prompt,
    continuityState: input.continuity,
  });
  if (!browserPlan) {
    return undefined;
  }
  return {
    taskKind: "browser",
    reason: browserPlan.reason,
    browserPlan,
    inspectFirst: false,
    verifyAfterEdit: false,
    usedRestoredState: Boolean(browserPlan.continuationSummary),
  };
}
