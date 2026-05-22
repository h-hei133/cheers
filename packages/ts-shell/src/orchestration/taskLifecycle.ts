import crypto from "node:crypto";

import type { TaskIntent } from "./taskIntent.js";
import type { TaskLifecycleStageKind, TaskStage } from "./taskStage.js";

export type TaskLifecycleOverallStatus =
  | "created"
  | "in-progress"
  | "ready"
  | "stopped"
  | "complete";

export interface TaskLifecycle {
  readonly lifecycleId: string;
  readonly taskId: string;
  readonly stages: readonly TaskStage[];
  readonly currentStage: TaskLifecycleStageKind;
  readonly stageReadiness: Readonly<Record<string, string>>;
  readonly stageEvidenceIds: Readonly<Record<string, readonly string[]>>;
  readonly blockedStage?: TaskLifecycleStageKind;
  readonly nextRecommendedStage?: TaskLifecycleStageKind;
  readonly overallStatus: TaskLifecycleOverallStatus;
  readonly redactionStatus: "redacted-and-budgeted";
  readonly mutationAuthority: "not-granted";
  readonly missingFacts: readonly string[];
  readonly stopConditions: readonly string[];
  readonly replaySafeSummary: string;
  readonly evidence: readonly string[];
}

export function buildTaskLifecycle(input: {
  readonly intent: TaskIntent;
  readonly stages: readonly TaskStage[];
}): TaskLifecycle {
  const blockedStage = input.stages.find((stage) =>
    stage.readiness === "blocked" || stage.readiness === "needs-evidence"
  )?.kind;
  const currentStage =
    blockedStage ??
    input.stages.find((stage) => stage.readiness !== "complete")?.kind ??
    "complete";
  const nextRecommendedStage = selectNextRecommendedStage(input.stages, currentStage);
  const missingFacts = Array.from(
    new Set(input.stages.flatMap((stage) => stage.missingFacts)),
  );
  const stopConditions = Array.from(
    new Set(input.stages.map((stage) => stage.stopReason).filter((value): value is string => Boolean(value))),
  );
  const overallStatus = classifyOverallStatus({
    stages: input.stages,
    blockedStage,
    missingFacts,
  });
  const lifecycleId = buildLifecycleId({
    taskId: input.intent.taskId,
    stageIds: input.stages.map((stage) => stage.stageId),
    currentStage,
    overallStatus,
    missingFacts,
  });
  const stageReadiness = Object.fromEntries(
    input.stages.map((stage) => [stage.kind, stage.readiness]),
  );
  const stageEvidenceIds = Object.fromEntries(
    input.stages.map((stage) => [
      stage.kind,
      Array.from(new Set([...stage.inputEvidenceIds, ...stage.outputEvidenceIds])),
    ]),
  );
  const replaySafeSummary = [
    `task-lifecycle ${lifecycleId}`,
    `task=${input.intent.taskId}`,
    `current=${currentStage}`,
    blockedStage ? `blocked=${blockedStage}` : undefined,
    nextRecommendedStage ? `next=${nextRecommendedStage}` : undefined,
    `status=${overallStatus}`,
    `stages=${input.stages.map((stage) => stage.kind).join(",")}`,
    `missingFacts=${missingFacts.length}`,
    "mutationAuthority=not-granted",
    "redaction=redacted-and-budgeted",
  ].filter(Boolean).join("; ");

  return {
    lifecycleId,
    taskId: input.intent.taskId,
    stages: input.stages,
    currentStage,
    stageReadiness,
    stageEvidenceIds,
    ...(blockedStage ? { blockedStage } : {}),
    ...(nextRecommendedStage ? { nextRecommendedStage } : {}),
    overallStatus,
    redactionStatus: "redacted-and-budgeted",
    mutationAuthority: "not-granted",
    missingFacts,
    stopConditions,
    replaySafeSummary,
    evidence: [
      input.intent.replaySafeSummary,
      ...input.intent.evidence,
      ...input.stages.map((stage) => stage.replaySafeSummary),
      ...input.stages.map((stage) => stage.verifierMarker),
      `task-lifecycle:id:${lifecycleId}`,
      `task-lifecycle:current-stage:${currentStage}`,
      `task-lifecycle:status:${overallStatus}`,
      ...(blockedStage ? [`task-lifecycle:blocked-stage:${blockedStage}`] : []),
      "task-lifecycle:mutation-authority:not-granted",
      "task-lifecycle:redacted-and-budgeted",
      "task-lifecycle:raw-content-excluded",
    ],
  };
}

function selectNextRecommendedStage(
  stages: readonly TaskStage[],
  currentStage: TaskLifecycleStageKind,
): TaskLifecycleStageKind | undefined {
  const currentIndex = stages.findIndex((stage) => stage.kind === currentStage);
  if (currentIndex < 0) {
    return stages[0]?.kind;
  }
  return stages[currentIndex + 1]?.kind;
}

function classifyOverallStatus(input: {
  readonly stages: readonly TaskStage[];
  readonly blockedStage?: TaskLifecycleStageKind;
  readonly missingFacts: readonly string[];
}): TaskLifecycleOverallStatus {
  if (input.stages.every((stage) => stage.readiness === "complete")) {
    return "complete";
  }
  if (input.blockedStage || input.missingFacts.length > 0) {
    return "stopped";
  }
  if (input.stages.some((stage) => stage.readiness === "ready" || stage.readiness === "review-required")) {
    return "ready";
  }
  return input.stages.length > 0 ? "in-progress" : "created";
}

function buildLifecycleId(input: object): string {
  return `task_lifecycle_${crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 12)}`;
}
