import type { WorkflowTaskPlan } from "./workflowTaskPlanner.js";
import type { PlanningRuntimeTaskKindHint } from "./planningRuntime.js";

export type PlanningRuntimeProductTaskKind = PlanningRuntimeTaskKindHint;

export type PlanningRuntimeProductRouteKind =
  | "blocked-vague-edit"
  | "blocked-vague-write"
  | "blocked-vague-read"
  | "vague-inspect"
  | "vague-repo-explain";

export type PlanningRuntimeProductRouteDecision =
  | {
      readonly shouldRun: true;
      readonly routeKind: PlanningRuntimeProductRouteKind;
      readonly taskKind: PlanningRuntimeProductTaskKind;
      readonly routeReason: string;
      readonly evidence: readonly string[];
    }
  | {
      readonly shouldRun: false;
      readonly evidence: readonly string[];
    };

export function shouldRunPlanningRuntimeForBlockedVagueTask(
  plan: WorkflowTaskPlan,
): plan is WorkflowTaskPlan & {
  readonly taskKind: "edit-file";
  readonly blockedReason: string;
} {
  return plan.taskKind === "edit-file" &&
    plan.targetMissing === true &&
    !plan.targetPath &&
    Boolean(plan.blockedReason);
}

export function selectPlanningRuntimeProductRoute(
  plan: WorkflowTaskPlan,
  context?: { readonly prompt?: string },
): PlanningRuntimeProductRouteDecision {
  if (plan.taskKind === "run-command" || plan.taskKind === "browser" || plan.taskKind === "chat") {
    return reject("non-planning-product-task");
  }
  if (plan.targetPath) {
    return reject("explicit-target-preserved");
  }
  if (plan.directCommand) {
    return reject("command-dispatch-preserved");
  }
  const existingRuntimePrompt = context?.prompt
    ? classifyExistingRuntimePrompt(context.prompt)
    : undefined;
  if (existingRuntimePrompt) {
    return reject(`existing-${existingRuntimePrompt}-preserved`);
  }

  if (plan.blockedReason && plan.targetMissing === true) {
    switch (plan.taskKind) {
      case "edit-file":
        return accept("blocked-vague-edit", plan.taskKind, plan.blockedReason);
      case "write-file":
        return accept("blocked-vague-write", plan.taskKind, plan.blockedReason);
      case "read-file":
        return accept("blocked-vague-read", plan.taskKind, plan.blockedReason);
      default:
        break;
    }
  }

  if (plan.taskKind === "inspect-files") {
    return accept(
      "vague-inspect",
      plan.taskKind,
      "Read/inspect task has no explicit target; Planning Runtime will rank bounded repository context before read-only handoff.",
    );
  }
  if (plan.taskKind === "repo-explain") {
    return accept(
      "vague-repo-explain",
      plan.taskKind,
      "Repository analysis task has no explicit evidence target; Planning Runtime will rank bounded repository context before explanation handoff.",
    );
  }

  return reject("unsupported-product-route");
}

function accept(
  routeKind: PlanningRuntimeProductRouteKind,
  taskKind: PlanningRuntimeProductTaskKind,
  routeReason: string,
): PlanningRuntimeProductRouteDecision {
  return {
    shouldRun: true,
    routeKind,
    taskKind,
    routeReason,
    evidence: [
      `planning-runtime-product:route:${routeKind}`,
      `planning-runtime-product:task:${taskKind}`,
      "planning-runtime-product:product-path-consumed",
      "planning-runtime-product:no-write-default",
    ],
  };
}

function reject(reason: string): PlanningRuntimeProductRouteDecision {
  return {
    shouldRun: false,
    evidence: [`planning-runtime-product:route-rejected:${reason}`],
  };
}

function classifyExistingRuntimePrompt(prompt: string):
  | "anchored-proposal-runtime"
  | "discovery-edit-runtime"
  | "fenced-edit-runtime"
  | undefined {
  if (looksLikeAnchoredProposalRuntimePrompt(prompt)) {
    return "anchored-proposal-runtime";
  }
  if (looksLikeDiscoveryEditRuntimePrompt(prompt)) {
    return "discovery-edit-runtime";
  }
  if (looksLikeFencedEditRuntimePrompt(prompt)) {
    return "fenced-edit-runtime";
  }
  return undefined;
}

function looksLikeAnchoredProposalRuntimePrompt(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return /\b(?:anchored|anchor)\b/.test(normalized) &&
    /\b(?:proposal|dry-run|dry run|provider)\b/.test(normalized) &&
    /\b(?:fake|eval|evaluate|runtime)\b/.test(normalized);
}

function looksLikeDiscoveryEditRuntimePrompt(prompt: string): boolean {
  const hasDiscoveryCue = /\b(?:find|discover|search|locate)\b/i.test(prompt);
  const hasEditCue = /\b(?:edit|replace|update|change)\b/i.test(prompt);
  const hasFencedCue =
    /```[\s\S]*?```/.test(prompt) ||
    /\b(?:fenced|block|old\/new|old\s+and\s+new)\b/i.test(prompt);
  const hasTargetSelectionCue = /\b(?:target|file|place|location)\b/i.test(prompt);
  return hasDiscoveryCue && hasEditCue && (hasFencedCue || hasTargetSelectionCue);
}

function looksLikeFencedEditRuntimePrompt(prompt: string): boolean {
  const fenceCount = Array.from(prompt.matchAll(/```[\s\S]*?```/g)).length;
  const mentionsFencedRegion =
    /\bfenced?\s+(?:block|blocks|region|regions|replacement|edit)\b|\bcode\s+block\b/i.test(
      prompt,
    );
  const hasEditVerb = /\b(?:edit|replace|update|change|swap)\b/i.test(prompt);
  const hasUnsupportedCue =
    /\b(?:find|discover|search|locate|similar|fuzzy|closest|nearest|all|every|each|matching|matches|broad|refactor|generate|generated|rewrite|implement|rollback|undo|snapshot|restore)\b/i.test(
      prompt,
    );
  return (
    (hasEditVerb || hasUnsupportedCue) &&
    (fenceCount > 0 || mentionsFencedRegion)
  );
}
