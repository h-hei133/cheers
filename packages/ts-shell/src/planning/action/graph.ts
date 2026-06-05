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

export interface WorkflowActionFeedback {
  readonly source: "context-renarrowing" | "verification";
  readonly refinedTargetPath?: string;
  readonly additionalTargetPaths?: readonly string[];
  readonly failedChangedFiles?: readonly string[];
  readonly verificationFailureSummary?: string;
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
    const verificationTarget = verificationTargetFromCommand(plan.verifyCommand);
    nodes.push({
      id: "verify-changes",
      kind: "verify",
      ...(verificationTarget ? { target: verificationTarget } : {}),
      dependsOn: mutationIds,
      reason: verificationTarget
        ? "Verify the changed files and impacted tests after all planned mutations."
        : "Verify the changed files after all planned mutations.",
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

export function updateWorkflowActionGraphFromFeedback(input: {
  readonly graph: WorkflowActionGraph;
  readonly feedback: WorkflowActionFeedback;
}): WorkflowActionGraph {
  const changedFileIntents = uniquePaths([
    ...(input.feedback.refinedTargetPath ? [input.feedback.refinedTargetPath] : []),
    ...input.graph.changedFileIntents,
    ...(input.feedback.additionalTargetPaths ?? []),
    ...(input.feedback.failedChangedFiles ?? []),
  ]);
  const nodes = input.graph.nodes.map((node) => {
    if (
      input.feedback.source === "context-renarrowing" &&
      input.feedback.refinedTargetPath &&
      (node.kind === "edit" || node.kind === "write" || node.kind === "context") &&
      input.graph.changedFileIntents.includes(node.target ?? "")
    ) {
      return {
        ...node,
        target: input.feedback.refinedTargetPath,
        reason: `${node.reason} Refined by renewed owner context.`,
      };
    }
    return node;
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const verifyNodeId = nodes.find((node) => node.kind === "verify")?.id;
  const mutationNodeIds = nodes
    .filter((node) => node.kind === "edit" || node.kind === "write")
    .map((node) => node.id);
  const extraNodes: WorkflowActionNode[] = [];

  for (const target of input.feedback.additionalTargetPaths ?? []) {
    const id = `write-related-${stableId(target)}`;
    if (nodeIds.has(id)) continue;
    extraNodes.push({
      id,
      kind: "write",
      target,
      dependsOn: mutationNodeIds.length > 0 ? [mutationNodeIds[mutationNodeIds.length - 1] as string] : [],
      reason: "Apply related file update discovered after renewed context.",
    });
    nodeIds.add(id);
  }

  if (input.feedback.source === "verification" && input.feedback.verificationFailureSummary) {
    if (!nodeIds.has("diagnose-failure")) {
      extraNodes.push({
        id: "diagnose-failure",
        kind: "diagnose",
        dependsOn: verifyNodeId ? [verifyNodeId] : mutationNodeIds,
        reason: "Use failed verification output before repair.",
      });
      nodeIds.add("diagnose-failure");
    }
    if (!nodeIds.has("repair-from-diagnosis")) {
      extraNodes.push({
        id: "repair-from-diagnosis",
        kind: "repair",
        dependsOn: ["diagnose-failure"],
        reason: "Generate a bounded repair action from verification feedback.",
      });
      nodeIds.add("repair-from-diagnosis");
    }
    if (!nodeIds.has("reverify-repair")) {
      extraNodes.push({
        id: "reverify-repair",
        kind: "verify",
        dependsOn: ["repair-from-diagnosis"],
        reason: "Rerun relevant verification after the feedback repair.",
      });
      nodeIds.add("reverify-repair");
    }
  }

  const updatedNodes = [...nodes, ...extraNodes];
  const feedbackId = stableId([
    input.graph.graphId,
    input.feedback.source,
    input.feedback.refinedTargetPath ?? "",
    ...(input.feedback.additionalTargetPaths ?? []),
    ...(input.feedback.failedChangedFiles ?? []),
    input.feedback.verificationFailureSummary ?? "",
  ].join("_"));

  return {
    graphId: `${input.graph.graphId}_updated_${feedbackId}`,
    nodes: updatedNodes,
    orderedNodeIds: updatedNodes.map((node) => node.id),
    changedFileIntents,
    dependencyReasons: [
      ...updatedNodes
        .filter((node) => node.dependsOn.length > 0)
        .map((node) => `${node.id}<-${node.dependsOn.join("+")}: ${node.reason}`),
      ...input.graph.dependencyReasons.filter((reason) => reason.startsWith("feedback:")),
      `feedback:${input.feedback.source}:${input.feedback.verificationFailureSummary ? "verification-failure" : "context-update"}`,
    ],
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

function verificationTargetFromCommand(command: string | undefined): string | undefined {
  return command?.match(/([\w./-]+\.(?:test|spec)\.(?:ts|tsx|js|jsx))(?:\s|$)/)?.[1];
}
