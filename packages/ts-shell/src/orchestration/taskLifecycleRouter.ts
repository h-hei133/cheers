import type { TaskIntentKind } from "./taskIntent.js";
import type { WorkflowTaskPlan } from "./workflowTaskPlanner.js";

export type TaskLifecycleRuntimeRouteKind =
  | "read-analyze-surface"
  | "analysis-brief-surface"
  | "execution-plan-surface"
  | "proposal-readiness"
  | "verification-readiness"
  | "repair-readiness"
  | "stopped-missing-context"
  | "not-lifecycle-routed";

export interface TaskLifecycleRuntimeRoute {
  readonly kind: TaskLifecycleRuntimeRouteKind;
  readonly intentKind: TaskIntentKind;
  readonly shouldActivate: boolean;
  readonly surface:
    | "read"
    | "analyze"
    | "plan"
    | "proposal"
    | "verification"
    | "repair"
    | "stopped"
    | "none";
  readonly reason: string;
  readonly missingFacts: readonly string[];
  readonly evidence: readonly string[];
}

export function routeTaskLifecycleRuntime(input: {
  readonly prompt: string;
  readonly workflowPlan: WorkflowTaskPlan;
}): TaskLifecycleRuntimeRoute {
  const prompt = input.prompt.toLowerCase();
  const intentKind = classifyIntentKind(input.workflowPlan);
  const missingFacts = classifyMissingFacts(input.workflowPlan);
  const lifecycleSurfaceRequested = hasLifecycleSurfaceCue(prompt);

  if (
    input.workflowPlan.taskKind === "edit-file" &&
    input.workflowPlan.targetPath &&
    input.workflowPlan.replaceFrom &&
    input.workflowPlan.replaceTo
  ) {
    return {
      kind: "not-lifecycle-routed",
      intentKind,
      shouldActivate: false,
      surface: "none",
      reason: "Existing explicit edit route remains authoritative.",
      missingFacts,
      evidence: [
        "task-lifecycle-router:not-activated",
        `task-lifecycle-router:intent:${intentKind}`,
        "task-lifecycle-router:explicit-edit-preserved",
        "task-lifecycle-router:mutation-authority:not-granted",
      ],
    };
  }

  if (
    (input.workflowPlan.taskKind === "edit-file" ||
      input.workflowPlan.taskKind === "write-file" ||
      input.workflowPlan.taskKind === "run-command") &&
    (input.workflowPlan.blockedReason || input.workflowPlan.targetMissing) &&
    !input.workflowPlan.contextPlanningRequested
  ) {
    return {
      kind: "not-lifecycle-routed",
      intentKind,
      shouldActivate: false,
      surface: "none",
      reason: "Existing edit stopped route remains authoritative.",
      missingFacts,
      evidence: [
        "task-lifecycle-router:not-activated",
        `task-lifecycle-router:intent:${intentKind}`,
        "task-lifecycle-router:edit-stopped-route-preserved",
        "task-lifecycle-router:mutation-authority:not-granted",
      ],
    };
  }

  if (
    lifecycleSurfaceRequested &&
    (input.workflowPlan.repairContextUsed || input.workflowPlan.continuationRepairReplan)
  ) {
    return route({
      kind: "repair-readiness",
      intentKind,
      surface: "repair",
      reason: "Repair prompt can use lifecycle failure state before repair handoff.",
      missingFacts,
    });
  }

  if (
    lifecycleSurfaceRequested &&
    (input.workflowPlan.verifyAfterEdit || input.workflowPlan.verifyCommand)
  ) {
    return route({
      kind: "verification-readiness",
      intentKind,
      surface: "verification",
      reason: "Verification prompt can use lifecycle verification intent.",
      missingFacts,
    });
  }

  if (input.workflowPlan.contextPlanningRequested) {
    return route({
      kind:
        input.workflowPlan.contextPlanningReason === "missing-edit-context"
          ? "proposal-readiness"
          : "execution-plan-surface",
      intentKind,
      surface:
        input.workflowPlan.contextPlanningReason === "missing-edit-context"
          ? "proposal"
          : "plan",
      reason: "Prompt requested lifecycle-backed context planning.",
      missingFacts,
    });
  }

  if (input.workflowPlan.blockedReason || input.workflowPlan.targetMissing) {
    return route({
      kind: "stopped-missing-context",
      intentKind,
      surface: "stopped",
      reason: input.workflowPlan.blockedReason ?? "Lifecycle route needs missing task facts.",
      missingFacts,
    });
  }

  if (input.workflowPlan.taskKind === "read-file" || input.workflowPlan.taskKind === "repo-explain") {
    if (/\b(?:analy[sz]e|analysis|investigate|diagnos(?:e|is)|why)\b/.test(prompt)) {
      return route({
        kind: "analysis-brief-surface",
        intentKind,
        surface: "analyze",
        reason: "Read-like prompt asks for analysis surface.",
        missingFacts,
      });
    }
    if (/\b(?:plan|strategy|approach|next steps?|proposal)\b/.test(prompt)) {
      return route({
        kind: "execution-plan-surface",
        intentKind,
        surface: "plan",
        reason: "Read-like prompt asks for planning surface.",
        missingFacts,
      });
    }
    if (/\b(?:context|related files?|related tests?|suggested reads?)\b/.test(prompt)) {
      return route({
        kind: "read-analyze-surface",
        intentKind,
        surface: "read",
        reason: "Read-like prompt asks for lifecycle context surface.",
        missingFacts,
      });
    }
  }

  return {
    kind: "not-lifecycle-routed",
    intentKind,
    shouldActivate: false,
    surface: "none",
    reason: "Existing runtime route remains authoritative.",
    missingFacts,
    evidence: [
      "task-lifecycle-router:not-activated",
      `task-lifecycle-router:intent:${intentKind}`,
      "task-lifecycle-router:mutation-authority:not-granted",
    ],
  };
}

function hasLifecycleSurfaceCue(prompt: string): boolean {
  return /\b(?:task lifecycle|lifecycle|readiness|analysis brief|execution plan|plan quality|context packet|context graph|related files?|related tests?|suggested reads?|suggested verification|repair handoff|verification readiness)\b/.test(
    prompt,
  );
}

function route(input: {
  readonly kind: Exclude<TaskLifecycleRuntimeRouteKind, "not-lifecycle-routed">;
  readonly intentKind: TaskIntentKind;
  readonly surface: TaskLifecycleRuntimeRoute["surface"];
  readonly reason: string;
  readonly missingFacts: readonly string[];
}): TaskLifecycleRuntimeRoute {
  return {
    kind: input.kind,
    intentKind: input.intentKind,
    shouldActivate: true,
    surface: input.surface,
    reason: input.reason,
    missingFacts: input.missingFacts,
    evidence: [
      `task-lifecycle-router:route:${input.kind}`,
      `task-lifecycle-router:intent:${input.intentKind}`,
      `task-lifecycle-router:surface:${input.surface}`,
      "task-lifecycle-router:mutation-authority:not-granted",
      "task-lifecycle-router:provider-call:not-run",
      "task-lifecycle-router:command-dispatch:not-run",
    ],
  };
}

function classifyIntentKind(plan: WorkflowTaskPlan): TaskIntentKind {
  if (plan.repairContextUsed || plan.continuationRepairReplan || plan.repairedFailureReason) {
    return "repair";
  }
  if (plan.verifyAfterEdit || plan.verifyCommand) {
    return "verification";
  }
  if (plan.taskKind === "read-file" || plan.taskKind === "repo-explain") {
    return plan.groundedDeliverableMode === "explain" ? "read-explain" : "analyze";
  }
  if (plan.contextPlanningRequested) {
    return "plan-only";
  }
  if (plan.taskKind === "edit-file" && plan.targetPath && plan.replaceFrom && plan.replaceTo) {
    return "edit-apply-request";
  }
  if (plan.taskKind === "edit-file" || plan.taskKind === "write-file") {
    return "edit-proposal";
  }
  if (plan.blockedReason || plan.targetMissing) {
    return "ambiguous";
  }
  return "broad-unsupported";
}

function classifyMissingFacts(plan: WorkflowTaskPlan): readonly string[] {
  return [
    ...(plan.targetMissing || !plan.targetPath ? ["explicit in-workspace target not resolved"] : []),
    ...(plan.blockedReason ? [plan.blockedReason] : []),
    ...(plan.contextPlanningReason === "missing-edit-context"
      ? ["concrete edit transform not provided"]
      : []),
  ];
}
