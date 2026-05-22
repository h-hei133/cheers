import crypto from "node:crypto";

import type { CodeGraphImpact } from "./codeGraphImpact.js";
import type { ContextGraph } from "./contextGraph.js";
import type { TargetedContextPacket } from "./contextPacket.js";
import type { TaskIntent } from "./taskIntent.js";
import type { TestImpactPlan } from "./testImpactPlan.js";

export interface TaskReadPlan {
  readonly readPlanId: string;
  readonly taskId: string;
  readonly requiredReads: readonly string[];
  readonly optionalReads: readonly string[];
  readonly suggestedNextReads: readonly string[];
  readonly contextSufficiencyTarget: string;
  readonly likelyTestReads: readonly string[];
  readonly likelyDocsReads: readonly string[];
  readonly likelyCallSiteReads: readonly string[];
  readonly omittedReasons: readonly string[];
  readonly noWriteEvidence: readonly string[];
  readonly redactionStatus: "redacted-and-budgeted";
  readonly mutationAuthority: "not-granted";
  readonly replaySafeSummary: string;
  readonly evidence: readonly string[];
}

export function buildTaskReadPlan(input: {
  readonly intent: TaskIntent;
  readonly contextPacket?: TargetedContextPacket;
  readonly contextGraph?: ContextGraph;
  readonly testImpactPlan?: TestImpactPlan;
  readonly codeGraphImpact?: CodeGraphImpact;
}): TaskReadPlan {
  const requiredReads = unique([
    ...input.intent.explicitTargets,
    ...(input.contextPacket ? [input.contextPacket.targetSafeLabel] : []),
  ]);
  const likelyTestReads = unique([
    ...(input.testImpactPlan?.likelyTestFiles ?? []),
    ...(input.codeGraphImpact?.likelyTests ?? []),
  ]);
  const likelyDocsReads = unique([
    ...(input.contextGraph?.nodes
      .filter((node) => node.kind === "docs-readme")
      .map((node) => node.pathLabel) ?? []),
    ...(input.codeGraphImpact?.docsReferences ?? []),
  ]);
  const likelyCallSiteReads = unique(input.codeGraphImpact?.likelyCallSites ?? []);
  const optionalReads = unique([
    ...(input.contextPacket?.selectedCandidateSummaries
      .filter((source) => source.kind !== "target-file-summary")
      .map((source) => source.pathLabel) ?? []),
    ...likelyTestReads,
    ...likelyDocsReads,
    ...likelyCallSiteReads,
  ]);
  const suggestedNextReads = unique([
    ...input.intent.missingTargetFacts,
    ...(input.testImpactPlan?.suggestedReads ?? []),
    ...(input.codeGraphImpact?.suggestedReads ?? []),
  ]);
  const omittedReasons = unique([
    ...(input.contextPacket?.omittedCandidateSummaries.map(
      (source) => source.reason ?? source.kind,
    ) ?? []),
    ...(input.contextGraph?.omittedCandidates.map((candidate) => candidate.reason) ?? []),
    ...(input.codeGraphImpact?.omittedContext ?? []),
  ]);
  const contextSufficiencyTarget =
    input.contextPacket?.completenessStatus === "complete" &&
    input.codeGraphImpact?.readiness === "impact-ready"
      ? "target, graph, impact, tests, docs, and call-site reads are sufficient for planning"
      : "read explicit target plus missing tests, docs, or call-sites before proposal/edit handoff";
  const readPlanId = buildReadPlanId({
    taskId: input.intent.taskId,
    requiredReads,
    optionalReads,
    suggestedNextReads,
    omittedReasons,
  });
  const noWriteEvidence = [
    "task-read-plan:mutation-authority:not-granted",
    "task-read-plan:no-provider-call",
    "task-read-plan:no-command-dispatch",
  ];
  const replaySafeSummary = [
    `task-read-plan ${readPlanId}`,
    `task=${input.intent.taskId}`,
    `required=${requiredReads.length}`,
    `optional=${optionalReads.length}`,
    `suggested=${suggestedNextReads.length}`,
    `tests=${likelyTestReads.length}`,
    `docs=${likelyDocsReads.length}`,
    `callSites=${likelyCallSiteReads.length}`,
    `omitted=${omittedReasons.length}`,
    "mutationAuthority=not-granted",
  ].join("; ");

  return {
    readPlanId,
    taskId: input.intent.taskId,
    requiredReads,
    optionalReads,
    suggestedNextReads,
    contextSufficiencyTarget,
    likelyTestReads,
    likelyDocsReads,
    likelyCallSiteReads,
    omittedReasons,
    noWriteEvidence,
    redactionStatus: "redacted-and-budgeted",
    mutationAuthority: "not-granted",
    replaySafeSummary,
    evidence: [
      `task-read-plan:id:${readPlanId}`,
      `task-read-plan:task:${input.intent.taskId}`,
      ...(input.contextPacket ? [`task-read-plan:context-packet:${input.contextPacket.packetId}`] : []),
      ...(input.contextGraph ? [`task-read-plan:context-graph:${input.contextGraph.graphId}`] : []),
      ...(input.testImpactPlan ? [`task-read-plan:test-impact:${input.testImpactPlan.impactPlanId}`] : []),
      ...(input.codeGraphImpact ? [`task-read-plan:impact-query:${input.codeGraphImpact.impactQueryId}`] : []),
      ...noWriteEvidence,
      "task-read-plan:redacted-and-budgeted",
      "task-read-plan:raw-content-excluded",
    ],
  };
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => Boolean(value.trim()))));
}

function buildReadPlanId(input: object): string {
  return `task_read_plan_${crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 12)}`;
}
