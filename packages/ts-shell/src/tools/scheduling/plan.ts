import type { NormalizedToolCall } from "../toolCallBatch.js";
import type { ToolEffectFacts } from "../policy/effects.js";

export type ToolDependencyKind =
  | "independent"
  | "ordered_after"
  | "conflicts_with"
  | "unknown";

export type ToolSchedulingDecision =
  | "parallel_allowed"
  | "forced_sequential"
  | "blocked"
  | "authority_required"
  | "unsupported";

export type ToolSchedulingGroupMode = "parallel" | "sequential" | "blocked";
export type ToolSchedulingExecutionState =
  | "not_started"
  | "started"
  | "completed"
  | "failed"
  | "cancelled"
  | "timed_out"
  | "skipped"
  | "blocked"
  | "partial";

export interface ToolDependencyFacts {
  readonly kind: ToolDependencyKind;
  readonly afterCallIds: readonly string[];
  readonly conflictCallIds: readonly string[];
  readonly reason: string;
  readonly terminalSuccessClaim: false;
}

export interface ToolSchedulingCallFacts {
  readonly toolCallId: string;
  readonly effect: ToolEffectFacts["effect"];
  readonly dependency: ToolDependencyFacts;
  readonly decision: ToolSchedulingDecision;
  readonly groupId?: string;
  readonly groupMode: ToolSchedulingGroupMode;
  readonly executionState: ToolSchedulingExecutionState;
  readonly reason: string;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface ToolSchedulingGroup {
  readonly groupId: string;
  readonly mode: ToolSchedulingGroupMode;
  readonly toolCallIds: readonly string[];
  readonly dependsOnGroupIds: readonly string[];
  readonly executionState: ToolSchedulingExecutionState;
  readonly terminalSuccessClaim: false;
}

export interface ToolSchedulingPlan {
  readonly scheduleId: string;
  readonly batchId: string;
  readonly requestedPolicy: "sequential" | "parallel" | "metadata-only";
  readonly executionMode: "metadata_only" | "sequential" | "parallel_read_only" | "blocked";
  readonly calls: readonly ToolSchedulingCallFacts[];
  readonly groups: readonly ToolSchedulingGroup[];
  readonly parallelGroupIds: readonly string[];
  readonly sequentialGroupIds: readonly string[];
  readonly blockedCallIds: readonly string[];
  readonly skippedCallIds: readonly string[];
  readonly deterministicOrder: readonly string[];
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export function planToolScheduling(input: {
  readonly batchId: string;
  readonly requestedPolicy: "sequential" | "parallel" | "metadata-only";
  readonly calls: readonly {
    readonly call: NormalizedToolCall;
    readonly effect: ToolEffectFacts;
  }[];
}): ToolSchedulingPlan {
  const dependencyById = new Map(input.calls.map(({ call }) => [
    call.id,
    dependencyFacts(call),
  ]));
  const calls: ToolSchedulingCallFacts[] = [];
  const groups: ToolSchedulingGroup[] = [];
  const parallelCandidates: string[] = [];
  const blockedCallIds: string[] = [];
  const skippedCallIds: string[] = [];
  const groupByCallId = new Map<string, string>();

  for (const { call, effect } of input.calls) {
    const dependency = dependencyById.get(call.id) ?? dependencyFacts(call);
    const decision = schedulingDecision(input.requestedPolicy, effect, dependency);
    const groupMode = decision === "parallel_allowed"
      ? "parallel"
      : decision === "forced_sequential"
        ? "sequential"
        : "blocked";
    let groupId: string | undefined;
    if (groupMode === "sequential") {
      groupId = `tool-schedule-group:${input.batchId}:${groups.length + 1}`;
      groupByCallId.set(call.id, groupId);
      groups.push(group({
        groupId,
        mode: "sequential",
        toolCallIds: [call.id],
        dependsOnGroupIds: dependency.afterCallIds
          .map((id) => groupByCallId.get(id))
          .filter((id): id is string => Boolean(id)),
      }));
    } else if (groupMode === "parallel") {
      parallelCandidates.push(call.id);
    } else {
      blockedCallIds.push(call.id);
      if (dependency.afterCallIds.length > 0) {
        skippedCallIds.push(call.id);
      }
    }
    calls.push(callFacts({
      toolCallId: call.id,
      effect,
      dependency,
      decision,
      groupId,
      groupMode,
      reason: reasonFor(decision, effect.reason, dependency.reason),
    }));
  }

  if (parallelCandidates.length > 0) {
    const groupId = `tool-schedule-group:${input.batchId}:parallel-read-only`;
    for (const callId of parallelCandidates) {
      groupByCallId.set(callId, groupId);
    }
    groups.unshift(group({
      groupId,
      mode: "parallel",
      toolCallIds: parallelCandidates,
      dependsOnGroupIds: [],
    }));
  }

  const plannedCalls = calls.map((call) => {
    if (call.groupId || call.groupMode !== "parallel") {
      return call;
    }
    return Object.freeze({
      ...call,
      groupId: groupByCallId.get(call.toolCallId),
    });
  });
  const parallelGroupIds = groups.filter((item) => item.mode === "parallel").map((item) => item.groupId);
  const sequentialGroupIds = groups.filter((item) => item.mode === "sequential").map((item) => item.groupId);
  const executionMode = input.requestedPolicy === "metadata-only"
    ? "metadata_only"
    : groups.length === 0
      ? "blocked"
      : parallelGroupIds.length > 0
        ? "parallel_read_only"
        : "sequential";

  return Object.freeze({
    scheduleId: `tool-schedule:${input.batchId}`,
    batchId: input.batchId,
    requestedPolicy: input.requestedPolicy,
    executionMode,
    calls: Object.freeze(plannedCalls),
    groups: Object.freeze(groups),
    parallelGroupIds: Object.freeze(parallelGroupIds),
    sequentialGroupIds: Object.freeze(sequentialGroupIds),
    blockedCallIds: Object.freeze(blockedCallIds),
    skippedCallIds: Object.freeze(skippedCallIds),
    deterministicOrder: Object.freeze(input.calls.map(({ call }) => call.id)),
    terminalSuccessClaim: false,
    notProvenClaims: Object.freeze(Array.from(new Set([
      "terminal-success",
      "task-success",
      "verification-success",
      "tool-scheduling-is-not-success",
      ...input.calls.flatMap(({ effect }) => effect.notProvenClaims),
    ]))),
  });
}

function dependencyFacts(call: NormalizedToolCall): ToolDependencyFacts {
  const args = call.reportSafeArguments;
  if (!args) {
    return dependency("unknown", [], [], "report-safe dependency facts are unavailable");
  }
  const afterCallIds = stringList(args.afterCallIds ?? args.dependsOnCallIds ?? args.dependsOn);
  const conflictCallIds = stringList(args.conflictsWithCallIds ?? args.conflictsWith);
  if (conflictCallIds.length > 0) {
    return dependency("conflicts_with", [], conflictCallIds, "tool declares conflicting dependency facts");
  }
  if (afterCallIds.length > 0) {
    return dependency("ordered_after", afterCallIds, [], "tool declares ordered dependency facts");
  }
  if (args.dependency === "unknown") {
    return dependency("unknown", [], [], "tool declares unknown dependency facts");
  }
  return dependency("independent", [], [], "tool has no declared dependency constraints");
}

function schedulingDecision(
  requestedPolicy: ToolSchedulingPlan["requestedPolicy"],
  effect: ToolEffectFacts,
  dependency: ToolDependencyFacts,
): ToolSchedulingDecision {
  if (effect.effect === "unsupported") return "unsupported";
  if (effect.effect === "blocked" || effect.effect === "unknown") return "blocked";
  if (requestedPolicy === "metadata-only") return "blocked";
  if (requestedPolicy === "sequential") return "forced_sequential";
  if (effect.effect === "authority_required") return "authority_required";
  if (effect.effect !== "read_only") return "blocked";
  if (dependency.kind === "conflicts_with" || dependency.kind === "unknown") return "blocked";
  if (dependency.kind === "ordered_after") return "forced_sequential";
  return "parallel_allowed";
}

function dependency(
  kind: ToolDependencyKind,
  afterCallIds: readonly string[],
  conflictCallIds: readonly string[],
  reason: string,
): ToolDependencyFacts {
  return Object.freeze({
    kind,
    afterCallIds: Object.freeze(afterCallIds),
    conflictCallIds: Object.freeze(conflictCallIds),
    reason,
    terminalSuccessClaim: false,
  });
}

function callFacts(input: {
  readonly toolCallId: string;
  readonly effect: ToolEffectFacts;
  readonly dependency: ToolDependencyFacts;
  readonly decision: ToolSchedulingDecision;
  readonly groupId?: string;
  readonly groupMode: ToolSchedulingGroupMode;
  readonly reason: string;
}): ToolSchedulingCallFacts {
  return Object.freeze({
    toolCallId: input.toolCallId,
    effect: input.effect.effect,
    dependency: input.dependency,
    decision: input.decision,
    ...(input.groupId ? { groupId: input.groupId } : {}),
    groupMode: input.groupMode,
    executionState: input.groupMode === "blocked" ? "blocked" : "not_started",
    reason: input.reason,
    terminalSuccessClaim: false,
    notProvenClaims: Object.freeze(Array.from(new Set([
      ...input.effect.notProvenClaims,
      "tool-scheduling-call-is-not-success",
    ]))),
  });
}

function group(input: {
  readonly groupId: string;
  readonly mode: ToolSchedulingGroupMode;
  readonly toolCallIds: readonly string[];
  readonly dependsOnGroupIds: readonly string[];
}): ToolSchedulingGroup {
  return Object.freeze({
    groupId: input.groupId,
    mode: input.mode,
    toolCallIds: Object.freeze(input.toolCallIds),
    dependsOnGroupIds: Object.freeze(input.dependsOnGroupIds),
    executionState: "not_started",
    terminalSuccessClaim: false,
  });
}

function reasonFor(
  decision: ToolSchedulingDecision,
  effectReason: string,
  dependencyReason: string,
): string {
  return `${decision}: ${effectReason}; ${dependencyReason}`;
}

function stringList(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return Object.freeze([value]);
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.filter((item): item is string => typeof item === "string"));
  }
  return Object.freeze([]);
}
