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

export interface WorkflowActionCursor {
  readonly graphId: string;
  readonly nextAction?: WorkflowActionNode;
  readonly completedNodeIds: readonly string[];
  readonly blockedNodeIds: readonly string[];
  readonly pendingNodeIds: readonly string[];
  readonly changedFileIntents: readonly string[];
  readonly dependencyReasons: readonly string[];
  readonly evidence: readonly string[];
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

export function projectWorkflowActionCursor(input: {
  readonly graph: WorkflowActionGraph;
  readonly completedNodeIds?: readonly string[];
}): WorkflowActionCursor {
  const completed = new Set(input.completedNodeIds ?? []);
  const pending: string[] = [];
  const blocked: string[] = [];
  let nextAction: WorkflowActionNode | undefined;

  for (const id of input.graph.orderedNodeIds) {
    const node = input.graph.nodes.find((candidate) => candidate.id === id);
    if (!node || completed.has(node.id)) {
      continue;
    }
    const dependenciesMet = node.dependsOn.every((dependency) =>
      completed.has(dependency)
    );
    if (dependenciesMet && !nextAction) {
      nextAction = node;
      pending.push(node.id);
      continue;
    }
    if (dependenciesMet) {
      pending.push(node.id);
    } else {
      blocked.push(node.id);
    }
  }

  return {
    graphId: input.graph.graphId,
    ...(nextAction ? { nextAction } : {}),
    completedNodeIds: [...completed],
    blockedNodeIds: blocked,
    pendingNodeIds: pending,
    changedFileIntents: input.graph.changedFileIntents,
    dependencyReasons: input.graph.dependencyReasons,
    evidence: [
      `workflow-action-graph:${input.graph.graphId}`,
      ...(nextAction
        ? [`workflow-action-next:${nextAction.id}:${nextAction.kind}`]
        : ["workflow-action-next:none"]),
      `workflow-action-completed:${[...completed].join(",") || "none"}`,
      `workflow-action-pending:${pending.join(",") || "none"}`,
      `workflow-action-blocked:${blocked.join(",") || "none"}`,
      `workflow-action-changed-file-intents:${input.graph.changedFileIntents.join(",") || "none"}`,
      ...input.graph.dependencyReasons.map((reason) =>
        `workflow-action-dependency:${reason}`
      ),
    ],
  };
}

export function orderedMutationTargetsFromGraph(
  graph: WorkflowActionGraph | undefined,
): string[] {
  if (!graph) {
    return [];
  }
  const targets: string[] = [];
  for (const id of graph.orderedNodeIds) {
    const node = graph.nodes.find((candidate) => candidate.id === id);
    if (!node || (node.kind !== "edit" && node.kind !== "write") || !node.target) {
      continue;
    }
    if (!targets.includes(node.target)) {
      targets.push(node.target);
    }
  }
  return targets;
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
