import {
  buildAgentPlan,
  type AgentPlan,
} from "./agentPlan.js";
import { buildAgentPlanResult } from "./agentPlanResult.js";
import {
  projectWorkflowTaskPlanToAgentPlan,
} from "./agentPlanProjection.js";
import { buildAnalysisBrief, type AnalysisBrief } from "./analysisBrief.js";
import {
  buildContextGraphPlanningBundle,
  type ContextGraphPlanningBundle,
} from "./contextGraphPlanning.js";
import { buildHarnessScorecard, type HarnessScorecard } from "./harnessScorecard.js";
import { buildHarnessTrace, type HarnessTrace } from "./harnessTrace.js";
import { attachPlanQualityToAgentPlan, buildPlanQuality, type PlanQuality } from "./planQuality.js";
import {
  buildTaskLifecycleResult,
  projectTaskLifecycleRuntimeOutcome,
  type TaskLifecycleResultProjection,
} from "./taskLifecycleResult.js";
import { routeTaskLifecycleRuntime, type TaskLifecycleRuntimeRoute } from "./taskLifecycleRouter.js";
import { buildTaskExecutionPlan, type TaskExecutionPlan } from "./taskExecutionPlan.js";
import { buildTaskIntent, type TaskIntent } from "./taskIntent.js";
import { buildTaskLifecycle, type TaskLifecycle } from "./taskLifecycle.js";
import { buildTaskLifecycleTrace, type TaskLifecycleTrace } from "./taskLifecycleTrace.js";
import { buildTaskReadPlan, type TaskReadPlan } from "./taskReadPlan.js";
import { buildTaskStage } from "./taskStage.js";
import type { RuntimeOutcomeProjection } from "./runtimeOutcomeProjection.js";
import type { WorkflowTaskPlan } from "./workflowTaskPlanner.js";

export interface TaskLifecycleActivation {
  readonly route: TaskLifecycleRuntimeRoute;
  readonly taskIntent: TaskIntent;
  readonly readPlan: TaskReadPlan;
  readonly analysisBrief: AnalysisBrief;
  readonly taskLifecycle: TaskLifecycle;
  readonly taskExecutionPlan: TaskExecutionPlan;
  readonly taskLifecycleResult: TaskLifecycleResultProjection;
  readonly taskLifecycleTrace: TaskLifecycleTrace;
  readonly planQuality: PlanQuality;
  readonly harnessTrace: HarnessTrace;
  readonly harnessScorecard: HarnessScorecard;
  readonly agentPlan: AgentPlan;
  readonly contextBundle?: ContextGraphPlanningBundle;
  readonly runtimeOutcome: RuntimeOutcomeProjection;
  readonly notes: readonly string[];
  readonly evidence: readonly string[];
}

export async function activateTaskLifecycle(input: {
  readonly workspaceRoot: string;
  readonly prompt: string;
  readonly workflowPlan: WorkflowTaskPlan;
}): Promise<TaskLifecycleActivation | undefined> {
  const route = routeTaskLifecycleRuntime({
    prompt: input.prompt,
    workflowPlan: input.workflowPlan,
  });
  if (!route.shouldActivate) {
    return undefined;
  }

  if (input.workflowPlan.targetPath) {
    const contextBundle = await buildContextGraphPlanningBundle({
      workspaceRoot: input.workspaceRoot,
      targetPath: input.workflowPlan.targetPath,
      workflowPlan: input.workflowPlan,
    });
    return fromContextBundle({ route, contextBundle });
  }

  return buildStoppedActivation({
    route,
    prompt: input.prompt,
    workflowPlan: input.workflowPlan,
  });
}

export function formatTaskLifecycleActivationOutput(input: {
  readonly activation: TaskLifecycleActivation;
  readonly baseOutput?: string;
}): string {
  const sections = [
    input.baseOutput,
    input.activation.contextBundle
      ? buildAgentPlanResult(input.activation.contextBundle.agentPlan).output
      : undefined,
    input.activation.taskLifecycleResult.output,
    `Analysis brief: ${input.activation.analysisBrief.briefId}`,
    `Execution plan: ${input.activation.taskExecutionPlan.executionPlanId}`,
    `Plan quality: ${input.activation.planQuality.qualityId}`,
    `Harness trace: ${input.activation.harnessTrace.traceId}`,
    `Harness scorecard: ${input.activation.harnessScorecard.scorecardId}`,
  ].filter((section): section is string => Boolean(section?.trim()));
  return sections.join("\n\n");
}

function fromContextBundle(input: {
  readonly route: TaskLifecycleRuntimeRoute;
  readonly contextBundle: ContextGraphPlanningBundle;
}): TaskLifecycleActivation {
  const agentPlanResult = buildAgentPlanResult(input.contextBundle.agentPlan);
  const runtimeOutcome = projectTaskLifecycleRuntimeOutcome({
    lifecycle: input.contextBundle.taskLifecycle,
    readPlan: input.contextBundle.taskReadPlan,
    analysisBrief: input.contextBundle.analysisBrief,
    executionPlan: input.contextBundle.taskExecutionPlan,
  });
  const evidence = [
    ...input.route.evidence,
    ...input.contextBundle.packetResult.evidence,
    ...input.contextBundle.graphResult.evidence,
    ...agentPlanResult.evidence,
    ...input.contextBundle.taskLifecycleResult.evidence,
    input.contextBundle.packet.replaySafeSummary,
    input.contextBundle.graph.replaySafeSummary,
    input.contextBundle.agentPlan.replaySafeSummary,
    input.contextBundle.taskLifecycleTrace.replaySafeSummary,
    input.contextBundle.harnessTrace.replaySafeSummary,
    input.contextBundle.harnessScorecard.replaySafeSummary,
    "task-lifecycle-activation:context-bundle",
    "task-lifecycle-activation:mutation-authority:not-granted",
    "task-lifecycle-activation:provider-call:not-run",
    "task-lifecycle-activation:command-dispatch:not-run",
  ];
  return {
    route: input.route,
    taskIntent: input.contextBundle.taskIntent,
    readPlan: input.contextBundle.taskReadPlan,
    analysisBrief: input.contextBundle.analysisBrief,
    taskLifecycle: input.contextBundle.taskLifecycle,
    taskExecutionPlan: input.contextBundle.taskExecutionPlan,
    taskLifecycleResult: input.contextBundle.taskLifecycleResult,
    taskLifecycleTrace: input.contextBundle.taskLifecycleTrace,
    planQuality: input.contextBundle.planQuality,
    harnessTrace: input.contextBundle.harnessTrace,
    harnessScorecard: input.contextBundle.harnessScorecard,
    agentPlan: input.contextBundle.agentPlan,
    contextBundle: input.contextBundle,
    runtimeOutcome: {
      codingResult: {
        ...runtimeOutcome.codingResult,
        evidence,
        continuation: {
          ...runtimeOutcome.codingResult.continuation,
          evidence,
        },
        taskSatisfaction: {
          ...runtimeOutcome.codingResult.taskSatisfaction,
          observedEvidence: evidence,
        },
      },
      userFacingOutput: runtimeOutcome.userFacingOutput,
    },
    notes: [
      `task-lifecycle: route=${input.route.kind}`,
      input.contextBundle.taskLifecycle.replaySafeSummary,
      input.contextBundle.analysisBrief.replaySafeSummary,
      input.contextBundle.taskExecutionPlan.replaySafeSummary,
      input.contextBundle.taskLifecycleTrace.replaySafeSummary,
      input.contextBundle.harnessTrace.replaySafeSummary,
      input.contextBundle.harnessScorecard.replaySafeSummary,
    ],
    evidence,
  };
}

function buildStoppedActivation(input: {
  readonly route: TaskLifecycleRuntimeRoute;
  readonly prompt: string;
  readonly workflowPlan: WorkflowTaskPlan;
}): TaskLifecycleActivation {
  const baseAgentPlan = projectWorkflowTaskPlanToAgentPlan({
    workflowPlan: input.workflowPlan,
  });
  const taskIntent = buildTaskIntent({
    userRequest: input.prompt,
    workflowPlan: input.workflowPlan,
    requestedActionKind: baseAgentPlan.requestedActionKind,
  });
  const readPlan = buildTaskReadPlan({ intent: taskIntent });
  const analysisBrief = buildAnalysisBrief({
    intent: taskIntent,
    readPlan,
    agentPlan: baseAgentPlan,
    missingFacts: input.route.missingFacts,
    confidence: "low",
  });
  const taskLifecycle = buildTaskLifecycle({
    intent: taskIntent,
    stages: [
      buildTaskStage({
        kind: "read",
        readiness: "needs-evidence",
        outputEvidenceIds: [readPlan.readPlanId],
        missingFacts: analysisBrief.missingFacts,
        stopReason: input.route.reason,
        verifierMarker: "task-stage:read:missing-context",
      }),
      buildTaskStage({
        kind: "analyze",
        readiness: "needs-evidence",
        inputEvidenceIds: [readPlan.readPlanId],
        outputEvidenceIds: [analysisBrief.briefId],
        missingFacts: analysisBrief.missingFacts,
        stopReason: "analysis brief requires missing read evidence",
        verifierMarker: "task-stage:analyze:missing-context",
      }),
    ],
  });
  const executionPlanWithoutQuality = buildTaskExecutionPlan({
    brief: analysisBrief,
    readPlan,
    lifecycle: taskLifecycle,
    agentPlan: baseAgentPlan,
  });
  const planQuality = buildPlanQuality({
    agentPlan: baseAgentPlan,
    taskLifecycle,
    analysisBrief,
    taskExecutionPlan: executionPlanWithoutQuality,
  });
  const taskExecutionPlan = buildTaskExecutionPlan({
    brief: analysisBrief,
    readPlan,
    lifecycle: taskLifecycle,
    agentPlan: baseAgentPlan,
    planQuality,
  });
  const agentPlan = attachPlanQualityToAgentPlan({
    agentPlan: buildAgentPlan({
      ...baseAgentPlan,
      taskLifecycleId: taskLifecycle.lifecycleId,
      taskLifecycleCurrentStage: taskLifecycle.currentStage,
      analysisBriefId: analysisBrief.briefId,
      taskExecutionPlanId: taskExecutionPlan.executionPlanId,
      taskLifecycleReadiness: taskLifecycle.overallStatus,
      taskLifecycleMissingFacts: taskLifecycle.missingFacts,
      suggestedNextTaskStage: taskLifecycle.nextRecommendedStage,
      safeEvidenceMarkers: [
        ...baseAgentPlan.safeEvidenceMarkers,
        taskLifecycle.replaySafeSummary,
        analysisBrief.replaySafeSummary,
        taskExecutionPlan.replaySafeSummary,
      ],
    }),
    planQuality,
  });
  const taskLifecycleRuntimeOutcome = projectTaskLifecycleRuntimeOutcome({
    lifecycle: taskLifecycle,
    readPlan,
    analysisBrief,
    executionPlan: taskExecutionPlan,
  });
  const harnessTrace = buildHarnessTrace({
    routeId: "route191-task-lifecycle-activation",
    taskId: taskIntent.taskId,
    taskLifecycleId: taskLifecycle.lifecycleId,
    analysisBriefId: analysisBrief.briefId,
    taskExecutionPlanId: taskExecutionPlan.executionPlanId,
    agentPlanId: agentPlan.planId,
    planQualityId: planQuality.qualityId,
    status: planQuality.level,
    reason: input.route.reason,
    evidence: planQuality.evidence,
  });
  const taskLifecycleTrace = buildTaskLifecycleTrace({
    lifecycle: taskLifecycle,
    readPlan,
    analysisBrief,
    executionPlan: taskExecutionPlan,
    harnessTrace,
    planQualityId: planQuality.qualityId,
  });
  const harnessScorecard = buildHarnessScorecard({
    planQuality,
    trace: harnessTrace,
    resultTruthful: true,
    continuationReady: true,
  });
  const result = buildTaskLifecycleResult({
    lifecycle: taskLifecycle,
    readPlan,
    analysisBrief,
    executionPlan: taskExecutionPlan,
  });
  const evidence = [
    ...input.route.evidence,
    ...result.evidence,
    taskLifecycleTrace.replaySafeSummary,
    harnessTrace.replaySafeSummary,
    harnessScorecard.replaySafeSummary,
    "task-lifecycle-activation:stopped-missing-context",
    "task-lifecycle-activation:mutation-authority:not-granted",
    "task-lifecycle-activation:provider-call:not-run",
    "task-lifecycle-activation:command-dispatch:not-run",
  ];

  return {
    route: input.route,
    taskIntent,
    readPlan,
    analysisBrief,
    taskLifecycle,
    taskExecutionPlan,
    taskLifecycleResult: result,
    taskLifecycleTrace,
    planQuality,
    harnessTrace,
    harnessScorecard,
    agentPlan,
    runtimeOutcome: {
      codingResult: {
        ...taskLifecycleRuntimeOutcome.codingResult,
        evidence,
        continuation: {
          ...taskLifecycleRuntimeOutcome.codingResult.continuation,
          evidence,
        },
        taskSatisfaction: {
          ...taskLifecycleRuntimeOutcome.codingResult.taskSatisfaction,
          observedEvidence: evidence,
        },
      },
      userFacingOutput: taskLifecycleRuntimeOutcome.userFacingOutput,
    },
    notes: [
      `task-lifecycle: route=${input.route.kind}`,
      taskLifecycle.replaySafeSummary,
      analysisBrief.replaySafeSummary,
      taskExecutionPlan.replaySafeSummary,
      taskLifecycleTrace.replaySafeSummary,
      harnessTrace.replaySafeSummary,
      harnessScorecard.replaySafeSummary,
    ],
    evidence,
  };
}
