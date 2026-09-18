import crypto from "node:crypto";

import type { CodeGraphImpact } from "../../context/acquisition/code/impact.js";
import type { ContextGraph } from "../../context/graph/contextGraph.js";
import type { TargetedContextPacket } from "../../context/graph/contextPacket.js";
import type { TaskContextNeed, TaskContextNeedSet } from "./taskContextNeed.js";
import type { TestImpactPlan } from "../../orchestration/testImpactPlan.js";

export type TaskContextAcquisitionStage =
  | "context-packet"
  | "context-graph"
  | "code-graph-impact"
  | "verification-evidence"
  | "prior-evidence"
  | "suggested-read";

export interface TaskContextAcquisition {
  readonly acquisitionId: string;
  readonly taskId: string;
  readonly needSetId: string;
  readonly stages: readonly TaskContextAcquisitionStage[];
  readonly acquiredNeedIds: readonly string[];
  readonly missingNeedIds: readonly string[];
  readonly acquiredSummaries: readonly string[];
  readonly suggestedReads: readonly string[];
  readonly suggestedVerification: readonly string[];
  readonly policy: "bounded-existing-facts-only";
  readonly mutationAuthority: "not-granted";
  readonly providerCall: "not-run";
  readonly commandDispatch: "not-run";
  readonly replaySafeSummary: string;
  readonly evidence: readonly string[];
}

export function buildTaskContextAcquisition(input: {
  readonly needSet: TaskContextNeedSet;
  readonly contextPacket?: TargetedContextPacket;
  readonly contextGraph?: ContextGraph;
  readonly testImpactPlan?: TestImpactPlan;
  readonly codeGraphImpact?: CodeGraphImpact;
  readonly verificationEvidenceIds?: readonly string[];
  readonly priorEvidenceIds?: readonly string[];
}): TaskContextAcquisition {
  const acquiredNeedIds = input.needSet.needs
    .filter((need) => need.readiness === "available")
    .map((need) => need.needId);
  const missingNeedIds = input.needSet.needs
    .filter((need) => need.readiness !== "available")
    .map((need) => need.needId);
  const stages = Array.from(new Set(input.needSet.needs.flatMap((need) => stagesForNeed(need))));
  const suggestedReads = Array.from(new Set([
    ...(input.contextPacket?.omittedCandidateSummaries.map((candidate) => candidate.pathLabel) ?? []),
    ...(input.testImpactPlan?.suggestedReads ?? []),
    ...(input.codeGraphImpact?.suggestedReads ?? []),
    ...input.needSet.needs
      .filter((need) => need.readiness !== "available")
      .map((need) => `${need.kind}: ${need.omittedReason ?? "not acquired"}`),
  ]));
  const suggestedVerification = Array.from(new Set([
    ...(input.testImpactPlan?.likelyVerificationCommandCandidates
      .filter((candidate) => candidate.readiness === "ready")
      .map((candidate) => candidate.command) ?? []),
    ...(input.codeGraphImpact?.suggestedVerification ?? []),
  ]));
  const acquiredSummaries = [
    input.contextPacket ? `context packet ${input.contextPacket.packetId}` : undefined,
    input.contextGraph ? `context graph ${input.contextGraph.graphId}` : undefined,
    input.testImpactPlan ? `test impact ${input.testImpactPlan.impactPlanId}` : undefined,
    input.codeGraphImpact ? `impact query ${input.codeGraphImpact.impactQueryId}` : undefined,
    input.verificationEvidenceIds?.length ? `verification evidence ${input.verificationEvidenceIds.length}` : undefined,
    input.priorEvidenceIds?.length ? `prior evidence ${input.priorEvidenceIds.length}` : undefined,
  ].filter((entry): entry is string => Boolean(entry));
  const acquisitionId = `task_context_acquisition_${hash({
    needSetId: input.needSet.needSetId,
    acquiredNeedIds,
    missingNeedIds,
    stages,
  })}`;
  const replaySafeSummary = [
    `task-context-acquisition ${acquisitionId}`,
    `task=${input.needSet.taskId}`,
    `needSet=${input.needSet.needSetId}`,
    `stages=${stages.join(",")}`,
    `acquired=${acquiredNeedIds.length}`,
    `missing=${missingNeedIds.length}`,
    `suggestedReads=${suggestedReads.length}`,
    `suggestedVerification=${suggestedVerification.length}`,
    "mutationAuthority=not-granted",
  ].join("; ");

  return {
    acquisitionId,
    taskId: input.needSet.taskId,
    needSetId: input.needSet.needSetId,
    stages,
    acquiredNeedIds,
    missingNeedIds,
    acquiredSummaries,
    suggestedReads,
    suggestedVerification,
    policy: "bounded-existing-facts-only",
    mutationAuthority: "not-granted",
    providerCall: "not-run",
    commandDispatch: "not-run",
    replaySafeSummary,
    evidence: [
      `task-context-acquisition:id:${acquisitionId}`,
      `task-context-acquisition:need-set:${input.needSet.needSetId}`,
      `task-context-acquisition:stages:${stages.join(",")}`,
      `task-context-acquisition:acquired:${acquiredNeedIds.length}`,
      `task-context-acquisition:missing:${missingNeedIds.length}`,
      "task-context-acquisition:policy:bounded-existing-facts-only",
      "task-context-acquisition:mutation-authority:not-granted",
      "task-context-acquisition:provider-call:not-run",
      "task-context-acquisition:command-dispatch:not-run",
      "task-context-acquisition:raw-content-excluded",
    ],
  };
}

function stagesForNeed(need: TaskContextNeed): readonly TaskContextAcquisitionStage[] {
  switch (need.kind) {
    case "root-target":
      return ["context-packet"];
    case "direct-imports":
    case "docs-readme":
      return ["context-packet", "context-graph"];
    case "reverse-call-sites":
    case "sibling-tests":
    case "affected-tests":
    case "config-package-scripts":
      return ["context-graph", "code-graph-impact"];
    case "verification-output":
    case "runtime-receipt":
      return ["verification-evidence"];
    case "prior-proposal-edit-evidence":
    case "repair-evidence":
      return ["prior-evidence"];
  }
}

function hash(input: object): string {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 12);
}
