import type { WorkflowTaskPlan } from "../../orchestration/workflowTaskPlanner.js";

export type WorkflowActionKind =
  | "context"
  | "edit"
  | "write"
  | "verify"
  | "diagnose"
  | "repair";

export interface WorkflowActionNode {
  readonly id: string;
  readonly kind: WorkflowActionKind;
  readonly target?: string;
  readonly dependsOn: readonly string[];
  readonly reason: string;
}

export interface WorkflowActionGraph {
  readonly graphId: string;
  readonly nodes: readonly WorkflowActionNode[];
  readonly orderedNodeIds: readonly string[];
  readonly changedFileIntents: readonly string[];
  readonly dependencyReasons: readonly string[];
}

export function buildWorkflowActionGraph(plan: WorkflowTaskPlan): WorkflowActionGraph | undefined {
  if (plan.taskKind !== "edit-file" && plan.taskKind !== "write-file") {
    return undefined;
  }

  const changedFileIntents = uniquePaths([
    ...(plan.targetPath ? [plan.targetPath] : []),
    ...(plan.additionalTargetPaths ?? []),
  ]);
  const nodes: WorkflowActionNode[] = [];

  if (plan.inspectFirst) {
    nodes.push({
      id: "inspect-target",
      kind: "context",
      ...(plan.targetPath ? { target: plan.targetPath } : {}),
      dependsOn: [],
      reason: "Read target context before mutation.",
    });
  }

  const primaryId = plan.taskKind === "write-file" ? "write-primary" : "edit-primary";
  nodes.push({
    id: primaryId,
    kind: plan.taskKind === "write-file" ? "write" : "edit",
    ...(plan.targetPath ? { target: plan.targetPath } : {}),
    dependsOn: plan.inspectFirst ? ["inspect-target"] : [],
    reason: plan.taskKind === "write-file"
      ? "Create or replace the primary target."
      : "Apply the primary target mutation.",
  });

  for (const target of plan.additionalTargetPaths ?? []) {
    nodes.push({
      id: `write-related-${stableId(target)}`,
      kind: "write",
      target,
      dependsOn: [primaryId],
      reason: "Apply related file update after the primary target mutation.",
    });
  }

  const mutationIds = nodes
    .filter((node) => node.kind === "edit" || node.kind === "write")
    .map((node) => node.id);
  if (plan.verifyAfterEdit || plan.verifyCommand) {
    nodes.push({
      id: "verify-changes",
      kind: "verify",
      dependsOn: mutationIds,
      reason: "Verify the changed files after all planned mutations.",
    });
  }

  if (plan.continuationRepairReplan || plan.crossFileRepair) {
    nodes.push({
      id: "diagnose-failure",
      kind: "diagnose",
      dependsOn: nodes.some((node) => node.id === "verify-changes")
        ? ["verify-changes"]
        : mutationIds,
      reason: "Use failed verification or failed mutation facts before repair.",
    });
    nodes.push({
      id: "repair-from-diagnosis",
      kind: "repair",
      dependsOn: ["diagnose-failure"],
      reason: "Generate a bounded repair action from diagnosis evidence.",
    });
    nodes.push({
      id: "reverify-repair",
      kind: "verify",
      dependsOn: ["repair-from-diagnosis"],
      reason: "Rerun relevant verification after the repair action.",
    });
  }

  return {
    graphId: `workflow_action_graph_${stableId(
      [plan.taskKind, plan.targetPath ?? "none", ...changedFileIntents].join("_"),
    )}`,
    nodes,
    orderedNodeIds: nodes.map((node) => node.id),
    changedFileIntents,
    dependencyReasons: nodes
      .filter((node) => node.dependsOn.length > 0)
      .map((node) => `${node.id}<-${node.dependsOn.join("+")}: ${node.reason}`),
  };
}

function uniquePaths(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const path of paths) {
    const normalized = path.replace(/\\/g, "/").replace(/^\.\/+/g, "").trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function stableId(value: string): string {
  return value.replace(/[^a-zA-Z0-9._:-]+/g, "_").slice(0, 96) || "unknown";
}
