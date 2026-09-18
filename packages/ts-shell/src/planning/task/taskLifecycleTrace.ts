import crypto from "node:crypto";

import type { AnalysisBrief } from "./analysisBrief.js";
import type { HarnessTrace } from "../../evidence/harness/harnessTrace.js";
import type { TaskExecutionPlan } from "./taskExecutionPlan.js";
import type { TaskLifecycle } from "./taskLifecycle.js";
import type { TaskReadPlan } from "./taskReadPlan.js";

export interface TaskLifecycleTrace {
  readonly traceId: string;
  readonly taskId: string;
  readonly lifecycleId: string;
  readonly stageIds: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly planQualityId?: string;
  readonly codeGraphTraceId?: string;
  readonly proposalId?: string;
  readonly verificationId?: string;
  readonly repairId?: string;
  readonly failureClass?: string;
  readonly stageDurationsMs: Readonly<Record<string, number>>;
  readonly redactionStatus: "redacted-and-budgeted";
  readonly mutationAuthority: "not-granted";
  readonly replaySafeSummary: string;
  readonly evidence: readonly string[];
}

export function buildTaskLifecycleTrace(input: {
  readonly lifecycle: TaskLifecycle;
  readonly readPlan?: TaskReadPlan;
  readonly analysisBrief?: AnalysisBrief;
  readonly executionPlan?: TaskExecutionPlan;
  readonly harnessTrace?: HarnessTrace;
  readonly planQualityId?: string;
  readonly codeGraphTraceId?: string;
  readonly proposalId?: string;
  readonly verificationId?: string;
  readonly repairId?: string;
  readonly stageDurationsMs?: Readonly<Record<string, number>>;
}): TaskLifecycleTrace {
  const evidenceIds = unique([
    ...input.lifecycle.evidence,
    ...(input.readPlan?.evidence ?? []),
    ...(input.analysisBrief?.evidence ?? []),
    ...(input.executionPlan?.evidence ?? []),
    ...(input.harnessTrace?.evidence ?? []),
  ]);
  const planQualityId = input.planQualityId ?? input.executionPlan?.qualityGateId ?? input.harnessTrace?.planQualityId;
  const failureClass = input.harnessTrace?.failureTaxonomy.failureClass;
  const traceId = buildTraceId({
    lifecycleId: input.lifecycle.lifecycleId,
    stageIds: input.lifecycle.stages.map((stage) => stage.stageId),
    planQualityId,
    codeGraphTraceId: input.codeGraphTraceId,
    proposalId: input.proposalId,
    verificationId: input.verificationId,
    repairId: input.repairId,
    failureClass,
  });
  const replaySafeSummary = [
    `task-lifecycle-trace ${traceId}`,
    `task=${input.lifecycle.taskId}`,
    `lifecycle=${input.lifecycle.lifecycleId}`,
    `stages=${input.lifecycle.stages.map((stage) => stage.kind).join(",")}`,
    planQualityId ? `planQuality=${planQualityId}` : undefined,
    input.codeGraphTraceId ? `codeGraphTrace=${input.codeGraphTraceId}` : undefined,
    input.proposalId ? `proposal=${input.proposalId}` : undefined,
    input.verificationId ? `verification=${input.verificationId}` : undefined,
    input.repairId ? `repair=${input.repairId}` : undefined,
    failureClass ? `failureClass=${failureClass}` : undefined,
    "mutationAuthority=not-granted",
    "raw-content-excluded",
  ].filter(Boolean).join("; ");

  return {
    traceId,
    taskId: input.lifecycle.taskId,
    lifecycleId: input.lifecycle.lifecycleId,
    stageIds: input.lifecycle.stages.map((stage) => stage.stageId),
    evidenceIds,
    ...(planQualityId ? { planQualityId } : {}),
    ...(input.codeGraphTraceId ? { codeGraphTraceId: input.codeGraphTraceId } : {}),
    ...(input.proposalId ? { proposalId: input.proposalId } : {}),
    ...(input.verificationId ? { verificationId: input.verificationId } : {}),
    ...(input.repairId ? { repairId: input.repairId } : {}),
    ...(failureClass ? { failureClass } : {}),
    stageDurationsMs: input.stageDurationsMs ?? {},
    redactionStatus: "redacted-and-budgeted",
    mutationAuthority: "not-granted",
    replaySafeSummary,
    evidence: [
      `task-lifecycle-trace:id:${traceId}`,
      `task-lifecycle-trace:lifecycle:${input.lifecycle.lifecycleId}`,
      ...(planQualityId ? [`task-lifecycle-trace:plan-quality:${planQualityId}`] : []),
      ...(input.codeGraphTraceId ? [`task-lifecycle-trace:code-graph-trace:${input.codeGraphTraceId}`] : []),
      ...(input.proposalId ? [`task-lifecycle-trace:proposal:${input.proposalId}`] : []),
      ...(input.verificationId ? [`task-lifecycle-trace:verification:${input.verificationId}`] : []),
      ...(input.repairId ? [`task-lifecycle-trace:repair:${input.repairId}`] : []),
      ...(failureClass ? [`task-lifecycle-trace:failure-class:${failureClass}`] : []),
      "task-lifecycle-trace:mutation-authority:not-granted",
      "task-lifecycle-trace:redacted-and-budgeted",
      "task-lifecycle-trace:raw-content-excluded",
    ],
  };
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => Boolean(value.trim()))));
}

function buildTraceId(input: object): string {
  return `task_lifecycle_trace_${crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 12)}`;
}
