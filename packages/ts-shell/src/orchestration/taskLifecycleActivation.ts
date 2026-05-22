import {
  buildAgentPlan,
  type AgentPlan,
} from "./agentPlan.js";
import { buildAgentPlanResult } from "./agentPlanResult.js";
import {
  projectWorkflowTaskPlanToAgentPlan,
} from "./agentPlanProjection.js";
import { buildAnalysisBrief, type AnalysisBrief } from "./analysisBrief.js";
import { calibrateAnalysisBrief, type AnalysisBriefCalibration } from "./analysisBriefCalibration.js";
import { evaluateAnalysisQualityGate, type AnalysisQualityGateResult } from "./analysisQualityGate.js";
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
import { buildTaskContextAcquisition, type TaskContextAcquisition } from "./taskContextAcquisition.js";
import { buildTaskContextNeeds, type TaskContextNeedSet } from "./taskContextNeed.js";
import { buildTaskContextResult, type TaskContextResult } from "./taskContextResult.js";
import { evaluateTaskContextSufficiency, type TaskContextSufficiency } from "./taskContextSufficiency.js";
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
  readonly taskContextNeeds: TaskContextNeedSet;
  readonly taskContextAcquisition: TaskContextAcquisition;
  readonly taskContextSufficiency: TaskContextSufficiency;
  readonly analysisBrief: AnalysisBrief;
  readonly analysisCalibration: AnalysisBriefCalibration;
  readonly analysisQualityGate: AnalysisQualityGateResult;
  readonly taskContextResult: TaskContextResult;
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
    input.activation.taskContextResult.output,
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
    ...input.contextBundle.taskContextResult.evidence,
    ...input.contextBundle.taskLifecycleResult.evidence,
    input.contextBundle.packet.replaySafeSummary,
    input.contextBundle.graph.replaySafeSummary,
    input.contextBundle.taskContextNeeds.replaySafeSummary,
    input.contextBundle.taskContextAcquisition.replaySafeSummary,
    input.contextBundle.taskContextSufficiency.replaySafeSummary,
    input.contextBundle.analysisCalibration.replaySafeSummary,
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
    taskContextNeeds: input.contextBundle.taskContextNeeds,
    taskContextAcquisition: input.contextBundle.taskContextAcquisition,
    taskContextSufficiency: input.contextBundle.taskContextSufficiency,
    analysisBrief: input.contextBundle.analysisBrief,
    analysisCalibration: input.contextBundle.analysisCalibration,
    analysisQualityGate: input.contextBundle.analysisQualityGate,
    taskContextResult: input.contextBundle.taskContextResult,
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
      input.contextBundle.taskContextResult.output,
      input.contextBundle.taskLifecycle.replaySafeSummary,
      input.contextBundle.analysisBrief.replaySafeSummary,
      input.contextBundle.analysisCalibration.replaySafeSummary,
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
  const taskContextNeeds = buildTaskContextNeeds({ intent: taskIntent });
  const taskContextAcquisition = buildTaskContextAcquisition({ needSet: taskContextNeeds });
  const taskContextSufficiency = evaluateTaskContextSufficiency({
    needSet: taskContextNeeds,
    acquisition: taskContextAcquisition,
  });
  const analysisBrief = buildAnalysisBrief({
    intent: taskIntent,
    readPlan,
    agentPlan: baseAgentPlan,
    missingFacts: [...input.route.missingFacts, ...taskContextSufficiency.missingRequiredFacts],
    confidence: "low",
  });
  const analysisCalibration = calibrateAnalysisBrief({
    analysisBrief,
    contextSufficiency: taskContextSufficiency,
    additionalEvidenceIds: [
      taskContextNeeds.needSetId,
      taskContextAcquisition.acquisitionId,
      taskContextSufficiency.sufficiencyId,
    ],
  });
  const analysisQualityGate = evaluateAnalysisQualityGate({
    action: "plan",
    calibration: analysisCalibration,
    contextSufficiency: taskContextSufficiency,
  });
  const taskLifecycle = buildTaskLifecycle({
    intent: taskIntent,
    stages: [
      buildTaskStage({
        kind: "read",
        readiness: "needs-evidence",
        outputEvidenceIds: [readPlan.readPlanId, taskContextNeeds.needSetId, taskContextSufficiency.sufficiencyId],
        missingFacts: taskContextSufficiency.missingRequiredFacts,
        stopReason: input.route.reason,
        verifierMarker: "task-stage:read:missing-context",
      }),
      buildTaskStage({
        kind: "analyze",
        readiness: "needs-evidence",
        inputEvidenceIds: [readPlan.readPlanId, taskContextSufficiency.sufficiencyId],
        outputEvidenceIds: [analysisBrief.briefId, analysisCalibration.calibrationId, analysisQualityGate.gateId],
        missingFacts: analysisCalibration.missingFacts,
        stopReason: analysisQualityGate.reason,
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
    contextSufficiency: taskContextSufficiency,
    analysisCalibration,
    analysisQualityGate,
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
      taskContextNeedIds: taskContextNeeds.needs.map((need) => need.needId),
      taskContextSufficiencyState: taskContextSufficiency.state,
      analysisConfidence: analysisCalibration.confidence,
      analysisMissingFacts: analysisCalibration.missingFacts,
      analysisRiskLevel: analysisCalibration.riskLevel,
      analysisQualityGateId: analysisQualityGate.gateId,
      safeEvidenceMarkers: [
        ...baseAgentPlan.safeEvidenceMarkers,
        taskContextNeeds.replaySafeSummary,
        taskContextAcquisition.replaySafeSummary,
        taskContextSufficiency.replaySafeSummary,
        taskLifecycle.replaySafeSummary,
        analysisBrief.replaySafeSummary,
        analysisCalibration.replaySafeSummary,
        taskExecutionPlan.replaySafeSummary,
        ...taskContextNeeds.evidence,
        ...taskContextAcquisition.evidence,
        ...taskContextSufficiency.evidence,
        ...analysisCalibration.evidence,
        ...analysisQualityGate.evidence,
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
  const taskContextResult = buildTaskContextResult({
    needSet: taskContextNeeds,
    acquisition: taskContextAcquisition,
    sufficiency: taskContextSufficiency,
    calibration: analysisCalibration,
    analysisQualityGate,
  });
  const harnessTrace = buildHarnessTrace({
    routeId: "route191-task-lifecycle-activation",
    taskId: taskIntent.taskId,
    taskLifecycleId: taskLifecycle.lifecycleId,
    analysisBriefId: analysisBrief.briefId,
    taskExecutionPlanId: taskExecutionPlan.executionPlanId,
    agentPlanId: agentPlan.planId,
    planQualityId: planQuality.qualityId,
    contextSufficiencyState: taskContextSufficiency.state,
    analysisConfidence: analysisCalibration.confidence,
    underEvidencedClaimsCount: analysisCalibration.underEvidencedClaims.length,
    missingRequiredContextCount: taskContextSufficiency.missingRequiredFacts.length,
    staleContext: taskContextSufficiency.state === "stale-context",
    budgetLimitedContext: taskContextSufficiency.state === "budget-limited",
    downstreamReadiness: `provider=${taskContextSufficiency.providerProposalReadiness}; verification=${taskContextSufficiency.verificationPlanningReadiness}; repair=${taskContextSufficiency.repairProposalReadiness}`,
    status: planQuality.level,
    reason: input.route.reason,
    evidence: [
      ...planQuality.evidence,
      ...taskContextSufficiency.evidence,
      ...analysisCalibration.evidence,
      ...analysisQualityGate.evidence,
    ],
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
    ...taskContextResult.evidence,
    ...result.evidence,
    taskContextNeeds.replaySafeSummary,
    taskContextAcquisition.replaySafeSummary,
    taskContextSufficiency.replaySafeSummary,
    analysisCalibration.replaySafeSummary,
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
    taskContextNeeds,
    taskContextAcquisition,
    taskContextSufficiency,
    analysisBrief,
    analysisCalibration,
    analysisQualityGate,
    taskContextResult,
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
      taskContextResult.output,
      taskLifecycle.replaySafeSummary,
      analysisBrief.replaySafeSummary,
      analysisCalibration.replaySafeSummary,
      taskExecutionPlan.replaySafeSummary,
      taskLifecycleTrace.replaySafeSummary,
      harnessTrace.replaySafeSummary,
      harnessScorecard.replaySafeSummary,
    ],
    evidence,
  };
}
