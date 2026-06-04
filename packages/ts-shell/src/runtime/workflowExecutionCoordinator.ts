import type {
  GoogleAccountAuthConfig,
  OpenAIAccountAuthConfig,
  RuntimeProvider,
} from "../config/runtimeConfig.js";
import type { PwRuntimeStatus } from "../core/context/pwRuntime.js";
import type { QueryEvent } from "../core/query/runtime/events.js";
import type { QueryRuntimeStateSeed } from "../core/query/runtime/state.js";
import { buildLoopContextRebuildInput } from "../context/rebuildInput.js";
import { projectSessionContextRebuild } from "../context/sessionContextRebuildProjection.js";
import { createComponentLogger, recordCount } from "../observability/index.js";
import type {
  EscalationDecision,
  EscalationPrompt,
  EscalationResponse,
} from "../sandbox/index.js";
import type { SandboxEnforcer } from "../sandbox/index.js";
import type { ToolDispatcher } from "../tools/dispatch/dispatcher.js";
import {
  buildIntegratedFlowEnvironment,
  type IntegratedFlowEnvironment,
} from "./integratedFlowEnvironment.js";
import {
  buildFreshnessObservability,
  type FreshnessObservability,
} from "../evidence/freshnessEvidence.js";
import {
  createEvidenceOnlySavePoint,
  type RuntimeEvidenceSavePoint,
} from "../evidence/savepoint/model.js";
import type { RuntimeExecutionReceiptProjection } from "./execution/receipt.js";
import type { AgentLoopContractProjection } from "./loop/contract.js";
import { projectProductLoopAdapter } from "./loop/adapter.js";
import {
  projectLoopTrajectory,
  type LoopTrajectoryProjection,
} from "./loop/trajectory.js";
import { appendSingleFileEditRepairObservability } from "../evidence/turnEvidenceLedger.js";
import { createModelResponseBoundary } from "../provider/response/boundary.js";
import {
  createModelRequestBoundary,
  prepareNextTurnModelRequest,
} from "../provider/request/boundary.js";
import { projectProviderRegistry } from "../provider/registry/provider.js";
import { projectWorkflowExecutionResultContract } from "../result/projection/workflow/runtime.js";
import { evaluateContinuationReadiness } from "../session/continuation/readiness.js";
import { summarizeReplaySafeLoopState } from "../session/replay/state.js";
import { projectSessionTree } from "../session/sessionTreeProjection.js";
import { accumulateAssistantResponse } from "../turn/assistantResponse.js";
import { evaluateNextTurnDeliveryPolicy } from "../turn/deliveryPolicy.js";
import { projectFollowUpQueue } from "../turn/followUpQueue.js";
import { prepareNextTurnBundle } from "../turn/nextTurnBundle.js";
import { projectSteeringQueue } from "../turn/steeringQueue.js";
import {
  observeRepairApply,
  observeRepairProposal,
  projectRepairRequiredHandoff,
} from "../repair/handoff/boundary.js";
import {
  observeVerificationResult,
  projectVerificationIntent,
} from "../verification/result/boundary.js";
import { transitionRuntimePhase } from "./runtimePhase.js";
import {
  notifyRuntimeEvidenceSavePoint,
  notifyRuntimeTurnSnapshot,
  type RuntimeTurnBoundaryObserver,
} from "./turnBoundary.js";
import { createRuntimeTurnSnapshot } from "../turn/turnSnapshot.js";
import type { RuntimeTurnSnapshot } from "../turn/turnSnapshot.js";
import { extractToolCallBatch } from "../tools/toolCallBatch.js";
import {
  runApplyPatchRuntimeBridgeIfRequested,
  type ApplyPatchRuntimeRouteOptions,
} from "../edit/applyPatchRuntimeBridge.js";
import { computeFragmentFingerprint } from "../context/readWindowContinuation.js";
import { runInspectFilesStage } from "../context/inspectFilesStage.js";
import { runReadRuntimeStage } from "../context/readRuntimeStage.js";
import { runRepoExplainRuntimeStage } from "../context/repoExplainRuntimeStage.js";
import { runProviderDraftStage } from "../provider/request/draft.js";
import { runPlanningRuntimeStage } from "../planning/planningRuntimeStage.js";
import {
  buildWorkflowTaskPlan,
  extractInlineContinuityContext,
} from "../planning/workflowTaskPlan.js";
import { isVerifyLikeCommand } from "../policy/commandIntentPolicy.js";
import { runDirectCommandStage } from "../verification/command/stage.js";
import { runWorkflowMutationRuntime } from "../edit/runtime/workflow.js";
import { runAnchoredProposalStage } from "../proposal/anchoredProposalStage.js";
import {
  executeBrowserModulePlan,
} from "../orchestration/browserModule.js";
import { extractFileConstraintAssertions } from "../orchestration/fileConstraintAssertions.js";
import { snapshotGitChangeSet } from "../orchestration/gitChangeSetAttribution.js";
import { buildReflectiveStateQueryResponse } from "../orchestration/continuationPlanning.js";
import { MultiAgentOrchestrator } from "../orchestration/MultiAgentOrchestrator.js";
import { summarizeFileMutationResults } from "../orchestration/mutationExecution.js";
import type { FileMutationExecutionResult } from "../orchestration/mutationExecution.js";
import { reconcileFileMutationSummary } from "../orchestration/mutationResultAggregation.js";
import {
  projectWorkflowBlockedOutcome,
} from "../orchestration/resultSurfaceModule.js";
import {
  buildContextGraphPlanningBundle,
  projectReadOutOfWorkspaceTargetStop,
} from "../orchestration/readInspectModule.js";
import type { PlanningRuntimeProductExecutionOptions } from "../orchestration/planningRuntimeProductExecution.js";
import {
  projectAgentPlanRuntimeOutcome,
} from "../orchestration/agentPlanResult.js";
import { runWorkflowVerificationStage } from "../verification/verificationStage.js";
import { runDiscoveryEditRuntimeStage } from "../edit/discoveryEditRuntimeStage.js";
import { runFencedEditRuntimeStage } from "../edit/fencedEditRuntimeStage.js";
import {
  buildActionResultSeedDecisionTrace,
  mergeContinuationState,
  type ContinuityStateLike,
} from "../orchestration/runtimeHandoffProjection.js";
import {
  createToolRuntimeProvenanceCollector,
  dispatchRuntimeTool,
  summarizeToolRuntimeProvenance,
  type ToolLifecycleResult,
} from "../orchestration/toolRuntimeModule.js";
import {
  buildWorkflowDecisionTrace,
  type WorkflowTaskPlan,
} from "../orchestration/workflowTaskPlanner.js";
import type {
  AgentExecutionInput,
  AgentExecutionOutput,
  CodingPatchRecord,
  CodingResultSummary,
  CodingVerificationSummary,
  OrchestrationResult,
} from "../orchestration/types.js";

export type { ApplyPatchRuntimeRouteOptions } from "../orchestration/mutationRoutingProjection.js";

export interface MvpIntegratedFlowOptions {
  readonly sessionId: string;
  readonly prompt: string;
  readonly workspaceRoot: string;
  readonly abortSignal?: AbortSignal;
  readonly continuityState?: unknown;
  readonly maxTurns?: number;
  readonly escalationDecision?: EscalationDecision;
  readonly escalationPromptHandler?: (
    prompt: EscalationPrompt,
  ) => Promise<EscalationResponse>;
  readonly providerMode?: "synthetic" | "real";
  readonly agentMode?: "plan" | "build";
  readonly realProvider?: {
    readonly provider: RuntimeProvider;
    readonly apiKey?: string;
    readonly accountAuth?: OpenAIAccountAuthConfig | GoogleAccountAuthConfig;
    readonly baseUrl?: string;
    readonly model?: string;
  };
  readonly runtimeSeed?: QueryRuntimeStateSeed;
  readonly applyPatchRuntimeRoute?: ApplyPatchRuntimeRouteOptions;
  readonly browserRuntimeStatus?: PwRuntimeStatus;
  readonly planningMutationExecution?: PlanningRuntimeProductExecutionOptions;
  readonly runtimeTurnBoundary?: RuntimeTurnBoundaryObserver;
}

export async function runMvpIntegratedFlow(
  options: MvpIntegratedFlowOptions,
): Promise<OrchestrationResult> {
  const applyPatchRuntimeResult =
    await runApplyPatchRuntimeBridgeIfRequested({
      sessionId: options.sessionId,
      prompt: options.prompt,
      workspaceRoot: options.workspaceRoot,
      routeOptions: options.applyPatchRuntimeRoute,
      ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
    });
  if (applyPatchRuntimeResult) {
    return applyPatchRuntimeResult;
  }

  const logger = createComponentLogger("orchestration");
  const environment = await buildIntegratedFlowEnvironment({
    workspaceRoot: options.workspaceRoot,
    sessionId: options.sessionId,
    ...(options.escalationPromptHandler
      ? { escalationPromptHandler: options.escalationPromptHandler }
      : {}),
    ...(options.escalationDecision
      ? { escalationDecision: options.escalationDecision }
      : {}),
    ...(options.browserRuntimeStatus
      ? { browserRuntimeStatus: options.browserRuntimeStatus }
      : {}),
    escalationDecisionUserComment: (decision) =>
      `Decision from runtime config: ${decision}`,
  });
  const runner = createIntegratedRunner(
    options.workspaceRoot,
    environment.dispatcher,
    environment.enforcer,
    environment.workflowContext,
    environment.mcpSnapshot,
    environment.browserRuntimeStatus,
    options.providerMode ?? "synthetic",
    options.realProvider,
    options.agentMode ?? "build",
    options.abortSignal,
    options.continuityState,
    options.planningMutationExecution,
    options.runtimeTurnBoundary,
  );

  try {
    const orchestrator = new MultiAgentOrchestrator(runner);
    logger.info("Integrated flow started", { sessionId: options.sessionId });
    const result = await orchestrator.run(options.sessionId, options.prompt, {
      maxTurns: options.maxTurns ?? 6,
      runtimeSeed: options.runtimeSeed,
    });
    logger.info("Integrated flow finished", {
      sessionId: options.sessionId,
      status: result.status,
    });
    recordCount("orchestration.runs", 1, { status: result.status });
    return result;
  } finally {
    environment.close();
  }
}

export async function* streamMvpIntegratedFlow(
  options: MvpIntegratedFlowOptions,
): AsyncIterable<QueryEvent> {
  const applyPatchRuntimeResult =
    await runApplyPatchRuntimeBridgeIfRequested({
      sessionId: options.sessionId,
      prompt: options.prompt,
      workspaceRoot: options.workspaceRoot,
      routeOptions: options.applyPatchRuntimeRoute,
      ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
    });
  if (applyPatchRuntimeResult) {
    yield {
      type: "query.started",
      sessionId: options.sessionId,
      prompt: options.prompt,
    };
    yield { type: "query.completed", result: applyPatchRuntimeResult };
    return;
  }

  const environment = await buildIntegratedFlowEnvironment({
    workspaceRoot: options.workspaceRoot,
    sessionId: options.sessionId,
    ...(options.escalationPromptHandler
      ? { escalationPromptHandler: options.escalationPromptHandler }
      : {}),
    ...(options.escalationDecision
      ? { escalationDecision: options.escalationDecision }
      : {}),
    ...(options.browserRuntimeStatus
      ? { browserRuntimeStatus: options.browserRuntimeStatus }
      : {}),
    escalationDecisionUserComment: (decision) =>
      `Synthetic ${decision} for integration flow`,
  });
  const runner = createIntegratedRunner(
    options.workspaceRoot,
    environment.dispatcher,
    environment.enforcer,
    environment.workflowContext,
    environment.mcpSnapshot,
    environment.browserRuntimeStatus,
    options.providerMode ?? "synthetic",
    options.realProvider,
    options.agentMode ?? "build",
    options.abortSignal,
    options.continuityState,
    options.planningMutationExecution,
  );

  try {
    const orchestrator = new MultiAgentOrchestrator(runner);
    yield* orchestrator.stream(options.sessionId, options.prompt, {
      maxTurns: options.maxTurns ?? 6,
      runtimeSeed: options.runtimeSeed,
    });
  } finally {
    environment.close();
  }
}

function createIntegratedRunner(
  workspaceRoot: string,
  dispatcher: ToolDispatcher,
  enforcer: SandboxEnforcer,
  workflowContext: IntegratedFlowEnvironment["workflowContext"],
  mcpSnapshot: IntegratedFlowEnvironment["mcpSnapshot"],
  browserRuntimeStatus: PwRuntimeStatus,
  providerMode: "synthetic" | "real",
  realProvider?: MvpIntegratedFlowOptions["realProvider"],
  agentMode: "plan" | "build" = "build",
  abortSignal?: AbortSignal,
  continuityState?: unknown,
  planningMutationExecution?: PlanningRuntimeProductExecutionOptions,
  runtimeTurnBoundary?: RuntimeTurnBoundaryObserver,
): (input: AgentExecutionInput) => Promise<AgentExecutionOutput> {
  return async ({ role, sharedContext, turn }) => {
    if (role === "planner") {
      const content = `Plan accepted for prompt: ${sharedContext.initialPrompt}. Proceed to coding and respect sandbox policy.`;

      return {
        role,
        content,
        handoffTo: "coder",
        handoffReason: "Plan validated and ready",
        events: [
          {
            type: "mcp.snapshot",
            clients: mcpSnapshot.clients.length,
            tools: mcpSnapshot.tools.length,
          },
        ],
        notes: [
          `planner: turn=${turn}`,
          `workflow: branch=${workflowContext.branch ?? "unknown"} clean=${workflowContext.isClean === true ? "yes" : "no"}`,
          `mcp: clients=${mcpSnapshot.clients.length} tools=${mcpSnapshot.tools.length}`,
          `visible-tools: ${dispatcher.listVisibleTools().join(", ") || "none"}`,
          ...(workflowContext.branch === "main" &&
          workflowContext.isClean === false
            ? [
                "workflow: recommend using an isolated worktree before heavy implementation on a dirty main branch",
              ]
            : []),
        ],
      };
    }

    if (role === "coder") {
      const { cleanPrompt, inlineState } = extractInlineContinuityContext(
        sharedContext.initialPrompt,
      );
      const mergedContinuityState = mergeContinuationState(
        continuityState,
        inlineState,
      );
      const workflowPlan = buildWorkflowTaskPlan(
        cleanPrompt,
        workspaceRoot,
        mergedContinuityState,
      );
      const freshnessObservability = buildFreshnessObservability({
        prompt: cleanPrompt,
        continuity: mergedContinuityState,
        plan: workflowPlan,
      });
      const decisionTrace = [
        ...buildWorkflowDecisionTrace(workflowPlan),
        ...buildActionResultSeedDecisionTrace(mergedContinuityState),
      ];
      const turnPhase = transitionRuntimePhase("prompt", "turn");
      const turnSnapshot = createRuntimeTurnSnapshot({
        sessionId: sharedContext.sessionId,
        turn,
        phase: turnPhase.status === "accepted" ? turnPhase.to : "aborted",
        workspaceRoot,
        providerMode,
        providerOptIn: providerMode === "real",
        ...(realProvider?.model ? { modelLabel: realProvider.model } : {}),
        agentMode,
        capabilityFlags: [
          `task-kind:${workflowPlan.taskKind}`,
          `browser-runtime:${browserRuntimeStatus.status}`,
          ...(workflowPlan.verifyAfterEdit ? ["verify-after-edit"] : []),
          ...(workflowPlan.inspectFirst ? ["inspect-first"] : []),
        ],
        planningMutationExecution: planningMutationExecution
          ? "provided"
          : "not-provided",
        executionBoundaryMode: "ExecutionService",
        ...(workflowPlan.usedRestoredState
          ? { continuationIdentity: "restored-session-state" }
          : {}),
        evidenceCorrelationIds: freshnessObservability.evidence,
      });
      notifyRuntimeTurnSnapshot(runtimeTurnBoundary, turnSnapshot);
      if (workflowPlan.taskKind === "chat") {
        const reflectiveOutput = workflowPlan.reflectiveStateQueryKind
          ? buildReflectiveStateQueryResponse({
              kind: workflowPlan.reflectiveStateQueryKind,
              continuity: mergedContinuityState,
              workspaceRoot,
            })
          : undefined;
        const content =
          reflectiveOutput ??
          (await runProviderDraftStage({
            role,
            draft: cleanPrompt,
            providerMode,
            realProvider,
          }));

        if (agentMode === "plan") {
          return {
            role,
            content,
            handoffTo: "reviewer",
            handoffReason: "Chat response drafted; reviewer final pass",
            notes: [
              `plan: intent=${workflowPlan.taskKind} reason=${workflowPlan.reason}`,
              "tool: skipped (chat intent)",
              ...decisionTrace,
              ...(workflowPlan.reflectiveStateQueryKind
                ? [
                    `reflective-state-query: ${workflowPlan.reflectiveStateQueryKind}`,
                  ]
                : []),
              ...freshnessObservability.notes,
            ],
          };
        }

        return {
          role,
          content,
          notes: [
            `plan: intent=${workflowPlan.taskKind} reason=${workflowPlan.reason}`,
            "tool: skipped (chat intent)",
            ...decisionTrace,
            ...(workflowPlan.reflectiveStateQueryKind
              ? [
                  `reflective-state-query: ${workflowPlan.reflectiveStateQueryKind}`,
                ]
              : []),
            ...freshnessObservability.notes,
          ],
        };
      }
      const execution = await executeWorkflowTaskPlan({
        plan: workflowPlan,
        freshnessObservability,
        prompt: cleanPrompt,
        dispatcher,
        browserRuntimeStatus,
        sessionId: sharedContext.sessionId,
        turn,
        workspaceRoot,
        enforcer,
        providerMode,
        abortSignal,
        planningMutationExecution,
      });
      const toolResultBatchPhase = transitionRuntimePhase(
        turnSnapshot.phase,
        "tool_result_batch",
      );
      const savePointPhase = transitionRuntimePhase(
        toolResultBatchPhase.status === "accepted"
          ? toolResultBatchPhase.to
          : turnSnapshot.phase,
        "save_point",
      );
      const nextTurnBundleId =
        `workflow-next-turn-${hashStableId(`${sharedContext.sessionId}:${turn}`)}`;
      const savePoint = createEvidenceOnlySavePoint({
        turnSnapshot,
        phase: savePointPhase.status === "accepted" ? savePointPhase.to : "aborted",
        evidenceIds: execution.codingResult?.evidence ?? [],
        sessionPersistenceStatus: "not-recorded",
        resultProjection: {
          status: execution.codingResult?.taskSatisfaction.verdict,
          terminalClassification: execution.codingResult?.verification.status,
          terminalReason: execution.codingResult?.taskKind,
        },
        executionReceipts: execution.executionReceipts ?? [],
        nextTurnBundleId,
        pendingNextTurnFacts: [
          workflowPlan.usedRestoredState
            ? "continuation-state-consumed"
            : "continuation-state-not-consumed",
        ],
      });
      notifyRuntimeEvidenceSavePoint(runtimeTurnBoundary, savePoint);
      const loopTrajectory = projectProductPathLoopTrajectory({
        sessionId: sharedContext.sessionId,
        prompt: cleanPrompt,
        turn,
        turnSnapshot,
        savePoint,
        providerMode,
        realProvider,
        execution,
      });
      const productLoopAdapter = projectProductLoopAdapter({
        adapterId: `product-path-adapter:${sharedContext.sessionId}`,
        promptSummary: cleanPrompt,
        loopTrajectory,
        nextAction:
          "connect future capability blocks through the feature integration contract",
      });
      const notes = [
        `plan: intent=${workflowPlan.taskKind} reason=${workflowPlan.reason}`,
        ...decisionTrace,
        ...execution.notes,
      ];
      const content = execution.userFacingOutput;

      if (agentMode === "plan") {
        return {
          role,
          content,
          handoffTo: "reviewer",
          handoffReason: "Coding pass complete",
          events: execution.events,
          notes,
          codingResult: execution.codingResult,
          loopTrajectory,
          productLoopAdapter,
        };
      }

      return {
        role,
        content,
        events: execution.events,
        notes: [
          ...notes,
          ...(workflowPlan.usedRestoredState
            ? ["continuation: restored-session-state-consumed"]
            : []),
        ],
        codingResult: execution.codingResult,
        loopTrajectory,
        productLoopAdapter,
      };
    }

    const content = await runProviderDraftStage({
      role,
      draft:
        "Review complete. Delivering streamed result and preserving safety guardrails.",
      providerMode,
      realProvider,
    });
    return {
      role,
      content,
      notes: [`reviewer: handoffs=${sharedContext.handoffs.length}`],
    };
  };
}

function projectProductPathLoopTrajectory(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly turn: number;
  readonly turnSnapshot: RuntimeTurnSnapshot;
  readonly savePoint: RuntimeEvidenceSavePoint;
  readonly providerMode: "synthetic" | "real";
  readonly realProvider?: MvpIntegratedFlowOptions["realProvider"];
  readonly execution: WorkflowExecutionResult;
}): LoopTrajectoryProjection {
  const executionReceipts = input.execution.executionReceipts ?? [];
  const responseBoundary = createModelResponseBoundary({
    responseId: `workflow-response-${hashStableId(`${input.sessionId}:${input.turn}`)}`,
    turnId: `${input.sessionId}:turn:${input.turn}`,
    providerMode: input.providerMode,
    providerSafeLabel: input.providerMode === "real"
      ? input.realProvider?.provider ?? "real-provider"
      : "synthetic-provider",
    modelSafeLabel: input.realProvider?.model,
    source: "existing_safe_projection",
    status: input.execution.codingResult ? "observed" : "failed",
    assistantContent: input.execution.userFacingOutput,
    toolCallCount: 0,
    notProvenClaims: [
      "provider-success",
      "tool-success",
      "task-success",
      "terminal-success",
    ],
  });
  const assistantResponse = accumulateAssistantResponse({
    responseBoundary,
    turnId: `${input.sessionId}:turn:${input.turn}`,
    chunks: [{ textDelta: input.execution.userFacingOutput }],
    notProvenClaims: ["existing-product-output-is-observation-only"],
  });
  const normalizedToolCallBatch = extractToolCallBatch({
    responseBoundary,
    assistantResponse,
    turnId: `${input.sessionId}:turn:${input.turn}`,
    batchId: `workflow-tool-calls-${hashStableId(`${input.sessionId}:${input.turn}`)}`,
  });
  const nextTurnBundleId = input.savePoint.nextTurnBundleId ??
    `workflow-next-turn-${hashStableId(`${input.sessionId}:${input.turn}`)}`;
  const steeringQueue = projectSteeringQueue({
    turnId: `${input.sessionId}:turn:${input.turn}`,
    messages: [],
  });
  const followUpQueue = projectFollowUpQueue({
    turnId: `${input.sessionId}:turn:${input.turn}`,
    pendingBundleId: nextTurnBundleId,
    messages: [],
  });
  const deliveryPolicy = evaluateNextTurnDeliveryPolicy({
    bundleId: nextTurnBundleId,
    steeringQueue,
    followUpQueue,
    modelResponseIds: [responseBoundary.responseId],
    deliveryStatus: "waiting",
  });
  const nextTurnBundle = prepareNextTurnBundle({
    bundleId: nextTurnBundleId,
    turnId: `${input.sessionId}:turn:${input.turn}`,
    assistantResponse,
    steeringQueue,
    followUpQueue,
    savePointId: input.savePoint.id,
    deliveryPolicy,
    deliveryStatus: "waiting",
  });
  const verificationIntent = projectVerificationIntent({
    sourceTurnId: `${input.sessionId}:turn:${input.turn}`,
    targetSummary: input.execution.codingResult
      ? `taskKind=${input.execution.codingResult.taskKind}`
      : "coding result unavailable",
    verificationKind: "owner_projection",
    commandCandidateSummary: input.execution.codingResult?.verification.command,
    dispatchStatus: verificationDispatchStatus(input.execution),
    relevanceStatus: verificationRelevanceStatus(input.execution),
    authorityRequirement: input.execution.codingResult?.verification.command
      ? "granted"
      : "unknown",
    notProvenClaims: ["workflow-verification-observation-only"],
  });
  const verificationResult = observeVerificationResult({
    intent: verificationIntent,
    status: verificationResultStatus(input.execution),
    executionReceiptId: executionReceipts[0]?.receiptId,
    failureClass: input.execution.codingResult?.verification.blockerKind,
    safeSummary: input.execution.codingResult
      ? `verification=${input.execution.codingResult.verification.status}; taskKind=${input.execution.codingResult.taskKind}`
      : "verification unavailable",
    notProvenClaims: ["workflow-verification-result-is-not-terminal-success"],
  });
  const repairRequired = verificationResult.status === "failed" ||
      verificationResult.status === "blocked"
    ? projectRepairRequiredHandoff({
        verification: verificationResult,
        repairabilityStatus: "repair_required",
        suggestedRepairMode: "existing_owner",
        authorityRequirement: "required",
      })
    : undefined;
  const repairProposal = repairRequired
    ? observeRepairProposal({
        handoff: repairRequired,
        proposalSource:
          (input.execution.codingResult?.repair.notes.length ?? 0) > 0
            ? "existing_repair_owner_projection"
            : "unavailable",
        targetSummary:
          input.execution.codingResult?.repair.notes.join("; ") ??
            "repair proposal unavailable",
        readinessStatus: "unknown",
        applyStatus: "not_applied",
      })
    : undefined;
  const repairApply = repairProposal
    ? observeRepairApply({
        proposal: repairProposal,
        repairApplyStatus: "not_applied",
        postRepairVerificationStatus: "not_run",
      })
    : undefined;
  const sessionProjection = projectSessionTree({
    session: {
      id: input.sessionId,
      projectRoot: input.turnSnapshot.workspace.identity,
      createdAt: "1970-01-01T00:00:00.000Z",
      updatedAt: "1970-01-01T00:00:00.000Z",
      status: input.execution.codingResult ? "completed" : "error",
      turns: [{ role: "user", content: input.prompt }],
    },
    stateSnapshot: {
      status: input.execution.codingResult ? "completed" : "error",
      terminalClassification: input.execution.codingResult ? "stopped" : "error",
      terminalReason: input.execution.codingResult ? "completed" : "stopped_error",
    },
  });
  const contextRebuildProjection = projectSessionContextRebuild({
    sessionProjection,
    optionalFacts: ["storage-backed-branch-navigation", "storage-backed-compaction"],
  });
  const contextRebuildInput = buildLoopContextRebuildInput({
    sessionProjection,
    contextRebuildProjection,
    nextTurnBundle,
    savePoint: input.savePoint,
    verificationIntents: [verificationIntent],
    verificationResults: [verificationResult],
    repairRequiredHandoffs: repairRequired ? [repairRequired] : [],
    repairProposals: repairProposal ? [repairProposal] : [],
    repairApplyObservations: repairApply ? [repairApply] : [],
    providerMetadataIds: [
      input.providerMode === "real"
        ? input.realProvider?.provider ?? "real-provider"
        : "synthetic",
    ],
  });
  const continuationReadiness = evaluateContinuationReadiness({
    sessionProjection,
    contextRebuildProjection,
    rebuildInput: contextRebuildInput,
    optionalFacts: ["storage-backed-branch-navigation", "storage-backed-compaction"],
  });
  const providerRegistry = projectProviderRegistry({
    providers: [
      {
        providerId: input.providerMode === "real"
          ? input.realProvider?.provider ?? "real-provider"
          : "synthetic",
        safeLabel: input.providerMode === "real"
          ? input.realProvider?.provider ?? "real-provider"
          : "synthetic-provider",
        providerKind:
          input.realProvider?.provider === "openai" ||
            input.realProvider?.provider === "anthropic" ||
            input.realProvider?.provider === "google" ||
            input.realProvider?.provider === "openai-compatible"
            ? input.realProvider.provider
            : "unknown",
        endpointClass: input.realProvider?.provider === "openai-compatible"
          ? "openai-compatible"
          : input.providerMode === "real"
            ? "default"
            : "unknown",
        authMode: input.providerMode === "real"
          ? input.realProvider?.accountAuth
            ? "account-auth"
            : input.realProvider?.apiKey
              ? "api-key"
              : "unknown"
          : "none",
        defaultEnabled: false,
        requiresExplicitOptIn: true,
        supportsFallback: "unknown",
        compatibility: providerCompatibilityNotProven(),
        riskLevel: input.providerMode === "real" ? "medium" : "low",
      },
    ],
    models: input.realProvider?.model
      ? [
          {
            modelId: input.realProvider.model,
            safeLabel: input.realProvider.model,
            providerId: input.realProvider.provider,
            family: input.realProvider.provider,
            compatibility: providerCompatibilityNotProven(),
            knownLimitations: ["model-compatibility-not-proven-by-loop-observation"],
          },
        ]
      : [],
  });
  const modelRequestBoundary = createModelRequestBoundary({
    requestId: `workflow-request:${hashStableId(`${input.sessionId}:${input.turn}`)}`,
    turnId: `${input.sessionId}:turn:${input.turn}:next`,
    loopId: input.sessionId,
    providerId: input.providerMode === "real"
      ? input.realProvider?.provider ?? "real-provider"
      : "synthetic",
    providerMode: input.providerMode,
    providerSafeLabel: input.providerMode === "real"
      ? input.realProvider?.provider ?? "real-provider"
      : "synthetic-provider",
    modelSafeLabel: input.realProvider?.model ?? "model-not-selected",
    providerReadinessStatus: input.realProvider ? "ready" : "missing",
    providerRegistry,
    continuationReadiness,
    planningConstraints: nextTurnBundle.blockingFacts,
    notProvenClaims: nextTurnBundle.notProvenClaims,
  });
  const requestPreparation = prepareNextTurnModelRequest({
    nextTurnBundle,
    modelRequestBoundary,
    providerRegistry,
    providerId: input.providerMode === "real"
      ? input.realProvider?.provider ?? "real-provider"
      : "synthetic",
    modelId: input.realProvider?.model,
    continuationReadiness,
    instructionSummary: "safe continuation request facts prepared",
    taskSummary: input.prompt,
    contextConstraintIds: contextRebuildInput.missingFacts,
    planningConstraintIds: modelRequestBoundary.planningConstraints,
  });
  const resultFacts = input.execution.codingResult
    ? {
        status: input.execution.codingResult.taskSatisfaction.verdict,
        terminalClassification: input.execution.codingResult.verification.status,
        terminalReason: input.execution.codingResult.taskKind,
        verdictSource: "result" as const,
      }
    : {
        status: "unsupported",
        terminalClassification: "unsupported",
        terminalReason: "missing-coding-result",
        verdictSource: "unknown" as const,
      };
  const replaySafeLoopStateSummary = summarizeReplaySafeLoopState({
    sessionProjection,
    contextRebuildProjection,
    continuationReadiness,
    rebuildInput: contextRebuildInput,
    savePoint: input.savePoint,
    nextTurnBundle,
    requestPreparation,
    verificationIntents: [verificationIntent],
    verificationResults: [verificationResult],
    repairRequiredHandoffs: repairRequired ? [repairRequired] : [],
    repairProposals: repairProposal ? [repairProposal] : [],
    repairApplyObservations: repairApply ? [repairApply] : [],
    terminalResultFacts: resultFacts,
  });
  const loop: AgentLoopContractProjection = {
    state: input.execution.codingResult ? "stopped" : "failed",
    stopReason: "model-stop",
    turns: [
      {
        turn: input.turn,
        snapshot: input.turnSnapshot,
        modelBoundary: {
          responseId: responseBoundary.responseId,
          stopReason: input.execution.codingResult ? "stop" : "failed",
          toolCallCount: normalizedToolCallBatch.calls.length,
          responseStatus: responseBoundary.status,
          responseSource: responseBoundary.source,
          assistantAccumulationStatus: assistantResponse.accumulationStatus,
        },
        normalizedToolCallBatch,
        ...(executionReceipts.length > 0
          ? {
              toolResultBatch: {
                id: `workflow-tool-results-${hashStableId(`${input.sessionId}:${input.turn}`)}`,
                callBatchId: `workflow-tool-calls-${hashStableId(`${input.sessionId}:${input.turn}`)}`,
                results: [],
                executionReceipts,
                failedToolCallIds: [],
                terminate: true,
              },
            }
          : {}),
        savePoint: input.savePoint,
        nextTurn: {
          prepared: true,
          pendingFacts: input.savePoint.pendingNextTurnFacts,
          bundle: nextTurnBundle,
          requestPreparation,
          steeringQueue,
          followUpQueue,
          deliveryPolicy,
          executed: false,
        },
        verification: {
          intent: verificationIntent,
          result: verificationResult,
          ...(repairRequired ? { repairRequired } : {}),
          ...(repairProposal ? { repairProposal } : {}),
          ...(repairApply ? { repairApply } : {}),
        },
        terminalSuccessClaim: false,
        notProvenClaims: [
          "terminal-success",
          "provider-success",
          "tool-success",
          "execution-success",
          "next-turn-success",
        ],
      },
    ],
    pendingDelivery: {
      steer: 0,
      followUp: 0,
      nextTurn: input.savePoint.pendingNextTurnFacts.length,
    },
    events: [],
    terminalSuccessClaim: false,
    notProvenClaims: [
      "terminal-success",
      "provider-success",
      "tool-success",
      "execution-success",
    ],
  };

  return projectLoopTrajectory({
    loopId: `product-path:${input.sessionId}`,
    prompt: input.prompt,
    loop,
    sessionProjection,
    contextRebuildProjection,
    contextRebuildInput,
    continuationReadiness,
    replaySafeLoopStateSummary,
    providerRegistry,
    resultFacts,
  });
}

function providerCompatibilityNotProven() {
  return {
    developerRole: "unknown" as const,
    systemRole: "unknown" as const,
    toolCalls: "unknown" as const,
    parallelToolCalls: "unknown" as const,
    structuredJsonOutput: "unknown" as const,
    streaming: "unknown" as const,
    reasoningEffort: "unknown" as const,
    strictMessageRoles: "unknown" as const,
    openAICompatibleShape: "unknown" as const,
    customHeaders: "unknown" as const,
    providerSpecificQuirks: [],
    notProvenClaims: [
      "provider-called",
      "model-compatibility-proven",
      "provider-success",
      "terminal-success",
    ],
  };
}

function verificationDispatchStatus(
  execution: WorkflowExecutionResult,
): Parameters<typeof projectVerificationIntent>[0]["dispatchStatus"] {
  const status = execution.codingResult?.verification.status;
  if (!status || status === "not-requested") return "not_run";
  if (status === "passed") return "passed";
  if (status === "failed") return "failed";
  if (status === "blocked") return "blocked";
  if (status === "skipped") return "selected";
  return "not_run";
}

function verificationRelevanceStatus(
  execution: WorkflowExecutionResult,
): Parameters<typeof projectVerificationIntent>[0]["relevanceStatus"] {
  const scope = execution.codingResult?.verification.selectionScope;
  if (scope === "focused" || scope === "explicit") return "task_relevant";
  if (scope === "broader") return "probably_relevant";
  if (scope === "none") return "not_proven";
  return execution.codingResult?.verification.command ? "probably_relevant" : "not_proven";
}

function verificationResultStatus(
  execution: WorkflowExecutionResult,
): Parameters<typeof observeVerificationResult>[0]["status"] {
  const status = execution.codingResult?.verification.status;
  if (status === "passed") return "passed";
  if (status === "failed") return "failed";
  if (status === "blocked") return "blocked";
  if (status === "skipped") return "selected_not_run";
  return "not_run";
}

interface WorkflowExecutionResult {
  readonly events: QueryEvent[];
  readonly notes: string[];
  readonly codingResult: CodingResultSummary;
  readonly userFacingOutput: string;
  readonly executionReceipts?: readonly RuntimeExecutionReceiptProjection[];
}

async function executeWorkflowTaskPlan(input: {
  readonly plan: WorkflowTaskPlan;
  readonly freshnessObservability: FreshnessObservability;
  readonly prompt: string;
  readonly dispatcher: ToolDispatcher;
  readonly browserRuntimeStatus: PwRuntimeStatus;
  readonly sessionId: string;
  readonly turn: number;
  readonly workspaceRoot: string;
  readonly enforcer: SandboxEnforcer;
  readonly providerMode: "synthetic" | "real";
  readonly abortSignal?: AbortSignal;
  readonly planningMutationExecution?: PlanningRuntimeProductExecutionOptions;
}): Promise<WorkflowExecutionResult> {
  const notes: string[] = [];
  const events: QueryEvent[] = [];
  const changedFiles: string[] = [];
  const failedFiles: Array<{ path: string; reason: string }> = [];
  const patches: CodingPatchRecord[] = [];
  const verifiedFiles: string[] = [];
  const unverifiedFiles: Array<{ path: string; reason: string }> = [];
  const repairNotes: string[] = [];
  const evidence: string[] = [];
  const executionReceipts: RuntimeExecutionReceiptProjection[] = [];
  const provenanceCollector = createToolRuntimeProvenanceCollector();
  const preRunGitChangeSet = snapshotGitChangeSet(input.workspaceRoot);
  const appliedContentByPath = new Map<string, string>();
  const mutationResults: FileMutationExecutionResult[] = [];
  notes.push(...input.freshnessObservability.notes);
  evidence.push(...input.freshnessObservability.evidence);
  if ((input.plan.continuationLineage?.length ?? 0) > 0) {
    evidence.push(...input.plan.continuationLineage!);
  }
  appendSingleFileEditRepairObservability(evidence, input.plan);
  const planningRuntimeStage = await runPlanningRuntimeStage({
    plan: input.plan,
    prompt: input.prompt,
    workspaceRoot: input.workspaceRoot,
    sessionId: input.sessionId,
    turn: input.turn,
    dispatcher: input.dispatcher,
    events,
    baseNotes: input.plan.blockedReason
      ? [...notes, `blocker: ${input.plan.blockedReason}`]
      : notes,
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    ...(input.planningMutationExecution
      ? { planningMutationExecution: input.planningMutationExecution }
      : {}),
  });
  if (planningRuntimeStage) {
    return planningRuntimeStage;
  }
  const anchoredProposalStage = await runAnchoredProposalStage({
    workspaceRoot: input.workspaceRoot,
    prompt: input.prompt,
    workflowPlan: input.plan,
    providerMode: input.providerMode,
    sessionId: input.sessionId,
    turn: input.turn,
    events,
    baseNotes: notes,
  });
  if (anchoredProposalStage) {
    return anchoredProposalStage;
  }
  const discoveryEditStage = await runDiscoveryEditRuntimeStage({
    plan: input.plan,
    prompt: input.prompt,
    workspaceRoot: input.workspaceRoot,
    sessionId: input.sessionId,
    enforcer: input.enforcer,
    events,
    baseNotes: notes,
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
  });
  if (discoveryEditStage) {
    return discoveryEditStage;
  }

  const fencedEditStage = await runFencedEditRuntimeStage({
    plan: input.plan,
    prompt: input.prompt,
    workspaceRoot: input.workspaceRoot,
    sessionId: input.sessionId,
    enforcer: input.enforcer,
    events,
    baseNotes: notes,
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
  });
  if (fencedEditStage) {
    return fencedEditStage;
  }
  let crossFileRemainingTargets: string[] = [];
  let crossFileFailedByReason: Array<{
    path: string;
    failureCode: "read-failed" | "patch-generation-failed" | "write-failed";
    reason: string;
  }> = [];
  let crossFileSkippedFiles: Array<{ path: string; reason: string }> = [];
  let degradedCrossFileTargets: string[] = [];
  let crossFileDegradationReason: string | undefined;
  let verification: CodingVerificationSummary = {
    status: "not-requested",
  };
  let dispatchedRunCommand: string | undefined;

  if (input.plan.blockedReason) {
    notes.push(`blocker: ${input.plan.blockedReason}`);
    if (input.plan.contextPlanningRequested && input.plan.targetPath) {
      const planning = await buildContextGraphPlanningBundle({
        workspaceRoot: input.workspaceRoot,
        targetPath: input.plan.targetPath,
        workflowPlan: input.plan,
      });
      const projected = projectAgentPlanRuntimeOutcome({
        plan: planning.agentPlan,
        reason: input.plan.blockedReason,
        baseOutput: [planning.packetResult.output, "", planning.graphResult.output].join("\n"),
      });
      return {
        events,
        notes: [
          ...notes,
          `context-packet: ${planning.packet.packetId}`,
          `context-graph: ${planning.graph.graphId}`,
          `test-impact: ${planning.testImpact.impactPlanId}`,
          planning.packet.replaySafeSummary,
          planning.graph.replaySafeSummary,
          planning.testImpact.replaySafeSummary,
          planning.agentPlan.replaySafeSummary,
        ],
        ...projected,
      };
    }
    return {
      events,
      notes,
      ...projectWorkflowBlockedOutcome({
        taskKind: input.plan.taskKind,
        blockedReason: input.plan.blockedReason,
        targetPath: input.plan.targetPath,
        freshnessEvidence: [
          ...input.freshnessObservability.evidence,
          ...(input.plan.continuationLineage ?? []),
        ],
        previousRemainingTargets: input.plan.previousRemainingTargets,
        previousFailedEntries: input.plan.previousFailedEntries,
        degradedReopenReason: input.plan.degradedReopenReason,
        degradedReopenCandidates: input.plan.degradedReopenCandidates,
        degradedReopenCandidateSource: input.plan.degradedReopenCandidateSource,
        degradedReopenCandidatePruned: input.plan.degradedReopenCandidatePruned,
      }),
    };
  }

  if (input.plan.taskKind === "browser" && input.plan.browserPlan) {
    return executeBrowserModulePlan({
      plan: input.plan.browserPlan,
      freshnessObservability: input.freshnessObservability,
      dispatcher: input.dispatcher,
      browserRuntimeStatus: input.browserRuntimeStatus,
      sessionId: input.sessionId,
      turn: input.turn,
      workspaceRoot: input.workspaceRoot,
      abortSignal: input.abortSignal,
    });
  }

  if (input.plan.degradedReopen) {
    notes.push(
      `reopen: degraded-session target recovery ${
        input.plan.targetPath ? `-> ${input.plan.targetPath}` : "blocked"
      }`,
    );
    if (input.plan.degradedReopenReason) {
      evidence.push(`reopen-reason:${input.plan.degradedReopenReason}`);
    }
    if ((input.plan.degradedReopenCandidates?.length ?? 0) > 0) {
      evidence.push(
        `reopen-candidates:${input.plan.degradedReopenCandidates!.join(",")}`,
      );
    }
    if (input.plan.degradedReopenCandidateSource) {
      evidence.push(
        `reopen-candidate-source:${input.plan.degradedReopenCandidateSource}`,
      );
    }
    if ((input.plan.degradedReopenCandidatePruned?.length ?? 0) > 0) {
      evidence.push(
        `reopen-candidate-pruned:${input.plan.degradedReopenCandidatePruned!.join("|")}`,
      );
    }
    if (input.plan.targetPath) {
      evidence.push(`reopen-target:${input.plan.targetPath}`);
    }
  }

  if (
    input.plan.taskKind === "edit-file" &&
    input.plan.verifyCommand &&
    input.plan.verifyAfterEdit
  ) {
    evidence.push(`verify-command-hint:${input.plan.verifyCommand}`);
    if (input.plan.targetPath) {
      evidence.push(`verify-target-hint:${input.plan.targetPath}`);
    }
  }
  if (
    input.plan.taskKind === "run-command" &&
    input.plan.directCommand &&
    isVerifyLikeCommand(input.plan.directCommand)
  ) {
    evidence.push(`verify-command-hint:${input.plan.directCommand}`);
    if (input.plan.targetPath) {
      evidence.push(`verify-target-hint:${input.plan.targetPath}`);
    }
  }

  let originalContent: string | undefined;
  const fileConstraints = extractFileConstraintAssertions(input.prompt);
  const unchangedAssertions = fileConstraints.unchangedAssertions;
  const protectedSnapshots = new Map<string, string>();
  const readRuntimeStage = await runReadRuntimeStage({
    plan: input.plan,
    prompt: input.prompt,
    dispatcher: input.dispatcher,
    events,
    notes,
    changedFiles,
    failedFiles,
    patches,
    verifiedFiles,
    unverifiedFiles,
    repairNotes,
    evidence,
    unchangedAssertions,
    sessionId: input.sessionId,
    turn: input.turn,
    workspaceRoot: input.workspaceRoot,
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
  });
  if (readRuntimeStage?.kind === "terminal") {
    return readRuntimeStage.result;
  }
  if (readRuntimeStage?.kind === "continue") {
    originalContent = readRuntimeStage.originalContent;
    for (const [snapshotPath, snapshotContent] of readRuntimeStage.protectedSnapshots) {
      protectedSnapshots.set(snapshotPath, snapshotContent);
    }
  }
  if (input.plan.taskKind === "write-file" && unchangedAssertions.length > 0) {
    for (const assertion of unchangedAssertions) {
      const readProtected = await dispatchRuntimeTool({
        dispatcher: input.dispatcher,
        events,
        toolName: "read",
        taskId: `task_${input.sessionId}_${input.turn}_protected_read_${hashStableId(assertion.path)}`,
        args: { path: assertion.path },
        workspaceRoot: input.workspaceRoot,
        sessionId: input.sessionId,
        abortSignal: input.abortSignal,
        requireApprovalEvent: false,
      });
      if (readProtected.success) {
        protectedSnapshots.set(assertion.path, readProtected.output ?? "");
        notes.push(`protected snapshot captured: ${assertion.path}`);
        evidence.push(`verify-unchanged-snapshot:${assertion.path}`);
      } else {
        notes.push(
          `protected snapshot unavailable: ${assertion.path} (${readProtected.error ?? "read failed"})`,
        );
      }
    }
  }

  const inspectFilesStage = await runInspectFilesStage({
    plan: input.plan,
    dispatcher: input.dispatcher,
    events,
    notes,
    changedFiles,
    failedFiles,
    patches,
    verifiedFiles,
    unverifiedFiles,
    repairNotes,
    evidence,
    sessionId: input.sessionId,
    turn: input.turn,
    workspaceRoot: input.workspaceRoot,
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
  });
  if (inspectFilesStage) {
    return inspectFilesStage;
  }

  const repoExplainStage = await runRepoExplainRuntimeStage({
    plan: input.plan,
    prompt: input.prompt,
    dispatcher: input.dispatcher,
    events,
    notes,
    changedFiles,
    failedFiles,
    patches,
    verifiedFiles,
    unverifiedFiles,
    repairNotes,
    evidence,
    sessionId: input.sessionId,
    turn: input.turn,
    workspaceRoot: input.workspaceRoot,
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
  });
  if (repoExplainStage) {
    return repoExplainStage;
  }

  const mutationRuntime = await runWorkflowMutationRuntime({
    plan: input.plan,
    prompt: input.prompt,
    originalContent,
    workspaceRoot: input.workspaceRoot,
    sessionId: input.sessionId,
    turn: input.turn,
    dispatcher: input.dispatcher,
    aggregate: {
      events,
      notes,
      changedFiles,
      failedFiles,
      patches,
      verifiedFiles,
      unverifiedFiles,
      repairNotes,
      evidence,
      mutationResults,
      appliedContentByPath,
    },
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
  });
  if (mutationRuntime?.terminal) {
    return mutationRuntime.terminal;
  }
  if (mutationRuntime) {
    crossFileRemainingTargets = mutationRuntime.crossFileRemainingTargets;
    crossFileFailedByReason = mutationRuntime.crossFileFailedByReason;
    crossFileSkippedFiles = mutationRuntime.crossFileSkippedFiles;
    degradedCrossFileTargets = mutationRuntime.degradedCrossFileTargets;
    crossFileDegradationReason = mutationRuntime.crossFileDegradationReason;
  }

  if (mutationResults.length > 0) {
    reconcileFileMutationSummary(
      summarizeFileMutationResults(mutationResults),
      {
        changedFiles,
        failedFiles,
        patches,
        evidence,
        repairNotes,
      },
    );
  }

  if (input.plan.taskKind === "run-command") {
    const commandStage = await runDirectCommandStage({
      plan: input.plan,
      dispatcher: input.dispatcher,
      events,
      sessionId: input.sessionId,
      turn: input.turn,
      workspaceRoot: input.workspaceRoot,
      abortSignal: input.abortSignal,
      provenanceCollector,
      notes,
      evidence,
      failedFiles,
    });
    dispatchedRunCommand = commandStage.dispatchedRunCommand;
    verification = commandStage.verification;
    executionReceipts.push(...commandStage.executionReceipts);
  }

  const verificationStage = await runWorkflowVerificationStage({
    taskKind: input.plan.taskKind,
    prompt: input.prompt,
    targetPath: input.plan.targetPath,
    changedFiles,
    actionGraph: input.plan.actionGraph,
    explicitVerifyRequested: input.plan.verifyAfterEdit,
    explicitVerifyCommand: input.plan.verifyCommand,
    initialVerification: verification,
    unchangedAssertions,
    appliedContentByPath,
    protectedSnapshots,
    patches,
    dispatcher: input.dispatcher,
    events,
    sessionId: input.sessionId,
    turn: input.turn,
    workspaceRoot: input.workspaceRoot,
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    provenanceCollector,
  });
  verification = verificationStage.verification;
  verifiedFiles.push(...verificationStage.verifiedFiles);
  unverifiedFiles.push(...verificationStage.unverifiedFiles);
  notes.push(...verificationStage.notes);
  repairNotes.push(...verificationStage.repairNotes);
  evidence.push(...verificationStage.evidence);

  const resultContract = projectWorkflowExecutionResultContract({
    plan: input.plan,
    workspaceRoot: input.workspaceRoot,
    preRunGitChangeSet,
    dispatchedRunCommand,
    changedFiles,
    failedFiles,
    patches,
    verifiedFiles,
    unverifiedFiles,
    verification,
    repairNotes,
    evidence,
    crossFileDegradationReason,
    degradedCrossFileTargets,
    crossFileRemainingTargets,
    crossFileFailedByReason,
    crossFileSkippedFiles,
    provenance: summarizeToolRuntimeProvenance(provenanceCollector),
  });

  return {
    events,
    notes,
    codingResult: resultContract.codingResult,
    userFacingOutput: resultContract.userFacingOutput,
    executionReceipts,
  };
}

function hashStableId(value: string): string {
  return computeFragmentFingerprint(value).slice(0, 12);
}
