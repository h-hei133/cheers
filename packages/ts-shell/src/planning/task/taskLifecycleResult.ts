import type { AnalysisBrief } from "./analysisBrief.js";
import type { TaskExecutionPlan } from "./taskExecutionPlan.js";
import type { TaskLifecycle } from "./taskLifecycle.js";
import type { TaskReadPlan } from "./taskReadPlan.js";
import { projectRuntimeCodingOutcome, type RuntimeOutcomeProjection } from "../../orchestration/runtimeOutcomeProjection.js";

export type TaskLifecycleTerminalOutcome =
  | "task-lifecycle-created"
  | "read-stage-required"
  | "analysis-brief-created"
  | "plan-ready"
  | "plan-stopped-missing-context"
  | "proposal-ready"
  | "review-required"
  | "edit-not-ready"
  | "verification-ready"
  | "repair-ready"
  | "task-complete"
  | "task-stopped";

export interface TaskLifecycleResultProjection {
  readonly outcome: TaskLifecycleTerminalOutcome;
  readonly lifecycle: TaskLifecycle;
  readonly output: string;
  readonly evidence: readonly string[];
}

export function buildTaskLifecycleResult(input: {
  readonly lifecycle: TaskLifecycle;
  readonly readPlan?: TaskReadPlan;
  readonly analysisBrief?: AnalysisBrief;
  readonly executionPlan?: TaskExecutionPlan;
}): TaskLifecycleResultProjection {
  const outcome = classifyOutcome(input);
  const output = [
    `Task lifecycle: ${outcome}`,
    `Task id: ${input.lifecycle.taskId}`,
    `Lifecycle id: ${input.lifecycle.lifecycleId}`,
    `Current stage: ${input.lifecycle.currentStage}`,
    `Stopped at: ${input.lifecycle.blockedStage ?? "none"}`,
    `Next stage: ${input.lifecycle.nextRecommendedStage ?? "none"}`,
    `Missing facts: ${input.lifecycle.missingFacts.join(", ") || "none"}`,
    `Suggested reads: ${input.readPlan?.suggestedNextReads.join(", ") || "none"}`,
    `Suggested verification: ${input.executionPlan?.verificationReadiness === "ready" ? input.analysisBrief?.verificationExpectation ?? "ready" : "none"}`,
    `Proposal readiness: ${input.executionPlan?.proposalReadiness ?? "not-planned"}`,
    `Review/apply readiness: ${input.executionPlan?.editReadiness ?? "not-planned"}`,
    `Verification readiness: ${input.executionPlan?.verificationReadiness ?? "not-planned"}`,
    `Repair readiness: ${input.executionPlan?.repairReadiness ?? "not-planned"}`,
    `Why stopped: ${input.lifecycle.stopConditions.join("; ") || "not stopped"}`,
    "No-write status: mutation authority not granted by lifecycle",
  ].join("\n");

  return {
    outcome,
    lifecycle: input.lifecycle,
    output,
    evidence: [
      input.lifecycle.replaySafeSummary,
      ...(input.readPlan ? [input.readPlan.replaySafeSummary] : []),
      ...(input.analysisBrief ? [input.analysisBrief.replaySafeSummary] : []),
      ...(input.executionPlan ? [input.executionPlan.replaySafeSummary] : []),
      ...input.lifecycle.evidence,
      ...(input.readPlan?.evidence ?? []),
      ...(input.analysisBrief?.evidence ?? []),
      ...(input.executionPlan?.evidence ?? []),
      `task-lifecycle-result:${outcome}`,
      "task-lifecycle-result:mutation-authority:not-granted",
      "task-lifecycle-result:raw-content-excluded",
    ],
  };
}

export function projectTaskLifecycleRuntimeOutcome(input: {
  readonly lifecycle: TaskLifecycle;
  readonly readPlan?: TaskReadPlan;
  readonly analysisBrief?: AnalysisBrief;
  readonly executionPlan?: TaskExecutionPlan;
}): RuntimeOutcomeProjection {
  const result = buildTaskLifecycleResult(input);
  const stopped = input.lifecycle.overallStatus === "stopped";
  return projectRuntimeCodingOutcome({
    taskKind: "repo-explain",
    changedFiles: [],
    failedFiles: stopped
      ? [{ path: input.lifecycle.taskId, reason: input.lifecycle.stopConditions[0] ?? result.outcome }]
      : [],
    patches: [],
    verifiedFiles: [],
    unverifiedFiles: [],
    verification: {
      status: "not-requested",
      reason: input.analysisBrief?.verificationExpectation ?? "task lifecycle projection",
      selectionScope: "none",
      selectionSource: "not-requested",
      ...(stopped ? { nextAction: input.executionPlan?.fallbackPath ?? "Resume at stopped lifecycle stage." } : {}),
    },
    repairNotes: [input.executionPlan?.recoveryExpectation ?? "No repair executed by lifecycle."],
    evidence: [...result.evidence],
    taskVerdict: stopped ? "insufficient-evidence" : "completed-with-caveats",
    taskReasons: [result.outcome],
    userFacingOutput: result.output,
  });
}

function classifyOutcome(input: {
  readonly lifecycle: TaskLifecycle;
  readonly readPlan?: TaskReadPlan;
  readonly analysisBrief?: AnalysisBrief;
  readonly executionPlan?: TaskExecutionPlan;
}): TaskLifecycleTerminalOutcome {
  if (input.lifecycle.overallStatus === "complete") return "task-complete";
  if (input.lifecycle.overallStatus === "created") return "task-lifecycle-created";
  if (input.lifecycle.currentStage === "read") return "read-stage-required";
  if (input.lifecycle.currentStage === "analyze" && input.analysisBrief) return "analysis-brief-created";
  if (input.executionPlan?.proposalReadiness === "ready") return "proposal-ready";
  if (input.executionPlan?.editReadiness === "review-only") return "review-required";
  if (input.executionPlan?.editReadiness === "needs-evidence" || input.executionPlan?.editReadiness === "blocked") return "edit-not-ready";
  if (input.executionPlan?.verificationReadiness === "ready") return "verification-ready";
  if (input.executionPlan?.repairReadiness === "review-only") return "repair-ready";
  if (input.lifecycle.currentStage === "plan" && input.lifecycle.missingFacts.length === 0) return "plan-ready";
  if (input.lifecycle.currentStage === "plan" || input.lifecycle.missingFacts.length > 0) return "plan-stopped-missing-context";
  return "task-stopped";
}
