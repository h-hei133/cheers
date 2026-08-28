import type {
  MultiTargetConflict,
  MultiTargetExecutionGroup,
  MultiTargetGraphNode,
  MultiTargetMutationInput,
  MultiTargetParallelEligibility,
} from "./types.js";

export function buildGraph(input: {
  readonly laneId: string;
  readonly input: MultiTargetMutationInput;
  readonly conflicts: readonly MultiTargetConflict[];
}): readonly MultiTargetGraphNode[] {
  const nodes: MultiTargetGraphNode[] = [];

  for (const target of input.input.targets) {
    const dependencies = target.dependsOnTargetIds ?? [];
    const targetConflicts = input.conflicts
      .filter(
        (c) =>
          c.leftTargetId === target.targetId ||
          c.rightTargetId === target.targetId,
      )
      .map((c) =>
        c.leftTargetId === target.targetId ? c.rightTargetId : c.leftTargetId,
      );

    const relationKind =
      targetConflicts.length > 0
        ? "conflict"
        : dependencies.length > 0
          ? "dependency"
          : "independent";

    nodes.push({
      targetId: target.targetId,
      relativePath: target.relativePath,
      dependencies,
      conflicts: targetConflicts,
      relationKind,
    });
  }

  return nodes;
}

export function createExecutionGroups(input: {
  readonly laneId: string;
  readonly nodes: readonly MultiTargetGraphNode[];
  readonly conflicts: readonly MultiTargetConflict[];
}): readonly MultiTargetExecutionGroup[] {
  if (input.conflicts.length > 0) {
    return [
      {
        groupId: `${input.laneId}:group:blocked`,
        mode: "blocked",
        targetIds: input.nodes.map((n) => n.targetId),
        status: "blocked",
        reason: "Execution groups blocked due to unresolved conflicts.",
      },
    ];
  }

  const independentNodes = input.nodes.filter(
    (n) => n.relationKind === "independent",
  );
  const dependentNodes = input.nodes.filter(
    (n) => n.relationKind === "dependency",
  );

  const groups: MultiTargetExecutionGroup[] = [];

  if (independentNodes.length > 0) {
    groups.push({
      groupId: `${input.laneId}:group:0`,
      mode: "parallel",
      targetIds: independentNodes.map((n) => n.targetId),
      status: "ready",
      reason: "Independent targets can be safely applied in parallel.",
    });
  }

  if (dependentNodes.length > 0) {
    const sortedDependentIds = topologicalSortNodes(dependentNodes);
    groups.push({
      groupId: `${input.laneId}:group:1`,
      mode: "sequential",
      targetIds: sortedDependentIds,
      status: "created",
      reason: "Dependent targets require ordered sequential application.",
    });
  }

  return groups;
}

export function topologicalSortNodes(
  nodes: readonly MultiTargetGraphNode[],
): readonly string[] {
  const result: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const nodeMap = new Map(nodes.map((n) => [n.targetId, n]));

  function visit(nodeId: string): void {
    if (visited.has(nodeId)) return;
    if (visiting.has(nodeId)) {
      // Cycle fallback: push to avoid infinite recursion
      result.push(nodeId);
      visited.add(nodeId);
      return;
    }

    visiting.add(nodeId);
    const node = nodeMap.get(nodeId);
    if (node) {
      for (const depId of node.dependencies) {
        if (nodeMap.has(depId)) {
          visit(depId);
        }
      }
    }
    visiting.delete(nodeId);
    visited.add(nodeId);
    result.push(nodeId);
  }

  for (const node of nodes) {
    visit(node.targetId);
  }

  return result;
}

export function evaluateParallelEligibility(
  groups: readonly MultiTargetExecutionGroup[],
  conflicts: readonly MultiTargetConflict[],
): MultiTargetParallelEligibility {
  if (conflicts.length > 0) {
    return {
      status: "conflict",
      allowed: false,
      reasons: conflicts.map((c) => c.reason),
    };
  }

  const allParallel =
    groups.length > 0 && groups.every((g) => g.mode === "parallel");
  const hasParallel = groups.some((g) => g.mode === "parallel");

  if (allParallel) {
    return {
      status: "eligible",
      allowed: true,
      reasons: [
        "All targets are independent and eligible for full parallel execution.",
      ],
    };
  }

  if (hasParallel) {
    return {
      status: "forced_sequential",
      allowed: false,
      reasons: [
        "Batch contains mixed independent and dependent targets; execution will proceed with grouped ordering.",
      ],
    };
  }

  return {
    status: "forced_sequential",
    allowed: false,
    reasons: ["Targets have sequential ordering constraints."],
  };
}
