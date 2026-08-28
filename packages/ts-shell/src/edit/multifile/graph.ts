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
    groups.push({
      groupId: `${input.laneId}:group:1`,
      mode: "sequential",
      targetIds: dependentNodes.map((n) => n.targetId),
      status: "created",
      reason: "Dependent targets require ordered sequential application.",
    });
  }

  return groups;
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

  const hasParallelGroup = groups.some((g) => g.mode === "parallel");
  return {
    status: hasParallelGroup ? "eligible" : "forced_sequential",
    allowed: hasParallelGroup,
    reasons: hasParallelGroup
      ? ["Targets without overlapping paths or dependencies are eligible for parallel execution."]
      : ["Targets have sequential ordering constraints."],
  };
}
