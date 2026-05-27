import fs from "node:fs";
import path from "node:path";
import type {
  GoogleAccountAuthConfig,
  OpenAIAccountAuthConfig,
  RuntimeProvider,
} from "../config/runtimeConfig.js";
import type { PwRuntimeStatus } from "../core/context/pwRuntime.js";
import {
  rebindPathLikeToWorkspace,
} from "../core/paths/legacyRootRebase.js";
import type { QueryEvent } from "../core/query/events.js";
import type { QueryRuntimeStateSeed } from "../core/query/runtimeState.js";
import { createComponentLogger, recordCount } from "../observability/index.js";
import type {
  EscalationDecision,
  EscalationPrompt,
  EscalationResponse,
} from "../sandbox/index.js";
import type { SandboxEnforcer } from "../sandbox/index.js";
import type { ToolDispatcher } from "../tools/dispatcher.js";
import {
  buildIntegratedFlowEnvironment,
  type IntegratedFlowEnvironment,
} from "../runtime/integratedFlowEnvironment.js";
import {
  buildFreshnessObservability,
  type FreshnessObservability,
} from "../evidence/freshnessEvidence.js";
import { appendSingleFileEditRepairObservability } from "../evidence/turnEvidenceLedger.js";
import {
  projectWorkflowRuntimeResultContract,
  truncateText,
} from "../result/workflowRuntimeProjection.js";
import {
  runApplyPatchRuntimeBridgeIfRequested,
  type ApplyPatchRuntimeRouteOptions,
} from "../edit/applyPatchRuntimeBridge.js";
import { buildReadTaskDelivery } from "../context/readDeliveryProjection.js";
import {
  computeFragmentFingerprint,
  computeFragmentFingerprintFromIndexes,
  extractLastReadDeliveredFragmentFromContinuity,
  extractLastReadWindowFromContinuity,
  hasLocalSliceExplainCue,
  normalizeReadFragmentLineIndexes,
  resolveReadWindowDirectiveForWorkflow,
  type ReadWindowDirective,
} from "../context/readWindowContinuation.js";
import {
  buildExplainTaskDelivery,
  buildInspectFilesDelivery,
} from "../context/repoExplainStage.js";
import { runProviderDraftStage } from "../provider/providerDraftStage.js";
import { runPlanningRuntimeStage } from "../planning/planningRuntimeStage.js";
import {
  derivePromptPathTarget,
  hasExplicitExecutionIntent,
  hasPathLikeReference,
  stripPathTokensForIntent,
} from "../planning/promptTargetProjection.js";
import {
  detectVerifyCommand,
  hasExternalVerifyOptOut,
  isVerifyLikeCommand,
} from "../policy/commandIntentPolicy.js";
import { runDirectCommandStage } from "../verification/commandStage.js";
import {
  applyWholeWordRename,
  computeLineDelta,
  extractFencedContent,
  extractInlineWriteContent,
  extractLowRiskRenameRefactor,
  extractReplaceDirective,
  extractSecondaryFileWrites,
  inferAlternativeReplaceDirective,
  isSafeGeneratedAlternativeDirective,
  isSafeReboundDirective,
  resolveMutationInstruction,
} from "../edit/mutationInstructionPlanner.js";
import { runAnchoredProposalStage } from "../proposal/anchoredProposalStage.js";
import {
  detectGroundedDeliverableMode,
  inferGroundedDeliverableModeFromContinuity,
  normalizeGroundedRepairInstruction,
  parseGroundedRepairConstraints,
} from "../repair/groundedAnswerRepair.js";
import {
  shouldDegradeCrossFileRemaining,
  shouldRetainCrossFileFailureInRemaining,
} from "../repair/crossFileRepairPlanning.js";
import {
  detectWorkflowBrowserPlan,
  executeBrowserModulePlan,
  type BrowserAgentPlan,
} from "./browserModule.js";
import {
  blockedCommandReason,
  detectCommand,
  detectUnsupportedCommandIntent,
  isAllowlistedRunCommand,
} from "./capabilityBoundaryProjection.js";
import {
  extractFileConstraintAssertions,
  type FileConstraintAssertions,
} from "./fileConstraintAssertions.js";
import { snapshotGitChangeSet } from "./gitChangeSetAttribution.js";
import {
  buildWorkflowContinuationLineage,
  buildWorkflowRepairContinuation,
  buildWorkflowVerifyContinuation,
  classifyWorkflowContinuationIntent,
  deriveWorkflowContinuationTarget,
  hasWorkflowLocalExplainEvidence,
  hasWorkflowReadFragmentEvidence,
  inferWorkflowVerifyCommand,
  isWorkflowVerifyResumeEligible,
  projectWorkflowLineageActivation,
  type RepairContinuationObject,
  type VerifyContinuationObject,
} from "./continuationModule.js";
import { buildReflectiveStateQueryResponse } from "./continuationPlanning.js";
import {
  formatEditExecutionFailure,
  formatTargetResolutionBlockerReason,
} from "./doNextProjection.js";
import {
  extractConsistencyItems,
  findMissingConsistencyItems,
  normalizeComparableText,
  planLowRiskVerification,
} from "./lowRiskVerificationPlanning.js";
import { MultiAgentOrchestrator } from "./MultiAgentOrchestrator.js";
import {
  executeFileMutationBranch,
  summarizeFileMutationResults,
} from "./mutationExecution.js";
import type { FileMutationExecutionResult } from "./mutationExecution.js";
import { selectMutationTargetFromPrompt } from "../edit/mutationTargetSelection.js";
import {
  appendCurrentRequestScopeEvidence,
  deriveCurrentPermissionRequestFromToolInput,
} from "./approvalAuthorityProjection.js";
import { projectProviderDiagnosticHandoff } from "./providerModule.js";
import { reconcileFileMutationSummary } from "./mutationResultAggregation.js";
import { formatPatchFailureReason } from "./patchMutationLane.js";
import { createWorkspaceWriteAuthority } from "./patchResult/workspaceAuthority.js";
import {
  projectWorkflowBlockedOutcome,
  projectWorkflowRuntimeOutcome,
} from "./resultSurfaceModule.js";
import {
  classifyReadInspectRequest,
  inferRepoDiagnosis,
  inferRepoEvidenceRole,
  isPathOnlyReadRequest,
  parseRepoCandidateFiles,
  buildContextGraphPlanningBundle,
  projectReadAmbiguousTargetStop,
  projectReadMissingTargetStop,
  projectReadOutOfWorkspaceTargetStop,
  recoverReadContinuationTarget,
  selectRepoExplainTarget,
} from "./readInspectModule.js";
import type { PlanningRuntimeProductExecutionOptions } from "./planningRuntimeProductExecution.js";
import {
  buildAgentPlanResult,
  projectAgentPlanRuntimeOutcome,
} from "./agentPlanResult.js";
import {
  planWorkflowVerification,
  planWorkflowVerificationRetry,
  projectNotRequestedWorkflowVerification,
  projectSkippedWorkflowVerification,
  projectWorkflowCommandVerification,
  stripVerificationTailForTarget,
} from "./verificationModule.js";
import {
  classifyEditExpectationContract,
  isWriteExpectationPrompt,
} from "./editExpectationContract.js";
import {
  buildDiscoveryEditPlanResult,
  buildFencedEditReplacementRouteResult,
  buildTargetSetEditRouteResult,
  planDiscoveryEdit,
  runFencedEditReplacementRoute,
  runTargetSetEditRoute,
  selectFencedEditReplacementActivation,
} from "./editPatchModule.js";
import { buildDiscoveryEditRuntimeRequest } from "./discoveryEditRuntime.js";
import {
  buildActionResultSeedDecisionTrace,
  buildPostEditVerifyContinuationLineage,
  continuityStateAsObject,
  hasPassedVerificationLineage,
  mergeContinuationState,
  type ContinuityStateLike,
  type GroundedDeliverableMode,
} from "./runtimeHandoffProjection.js";
import { resolveTaskTargets } from "./targetResolution.js";
import {
  createToolRuntimeProvenanceCollector,
  dispatchRuntimeTool,
  summarizeToolRuntimeProvenance,
  type ToolLifecycleResult,
} from "./toolRuntimeModule.js";
import type {
  ResolvedTarget,
  TargetResolutionBlocker,
} from "./targetResolution.js";
import { classifyVerificationFailure } from "./toolExecutionOutcomeProjection.js";
import {
  buildWorkflowDecisionTrace,
  type ContinuationTransform,
  type GroundedDeliverableConstraints,
  type GroundedRepairInstruction,
  type GroundedRepairStage,
  type ReflectiveStateQueryKind,
  type SingleFileEditFailureReason,
  type SingleFileEditRepairPayloadKind,
  type WorkflowTaskPlan,
} from "./workflowTaskPlanner.js";
import { projectWorkflowIntent } from "./workflowIntentProjection.js";
import type {
  AgentExecutionInput,
  AgentExecutionOutput,
  CodingPatchRecord,
  CodingResultSummary,
  CodingTaskKind,
  CodingVerificationSummary,
  OrchestrationResult,
} from "./types.js";

export type { ApplyPatchRuntimeRouteOptions } from "./mutationRoutingProjection.js";

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

interface WorkflowTaskIntentSignals {
  readonly normalized: string;
  readonly intentPrompt: string;
  readonly groundedIntentPrompt: string;
  readonly hasContextSeedPrefix: boolean;
  readonly hasExplicitBoundaryResetPrompt: boolean;
  readonly hasFileReadIntent: boolean;
  readonly hasTargetedFileReadIntent: boolean;
  readonly hasRepositoryInspectIntent: boolean;
  readonly hasSummarizeIntent: boolean;
  readonly hasExplainIntent: boolean;
  readonly hasReflectiveExplainStateQuestion: boolean;
  readonly hasReflectiveExplainContinuation: boolean;
  readonly hasReflectiveExplainQuery: boolean;
  readonly detectedReflectiveStateQueryKind?: ReflectiveStateQueryKind;
  readonly reflectiveStateQueryKind?: ReflectiveStateQueryKind;
  readonly hasReflectiveActionCue: boolean;
  readonly hasPriorLocalExplainEvidence: boolean;
  readonly hasRecoverableReadFragmentEvidence: boolean;
  readonly hasLocalExplainCue: boolean;
  readonly hasGroundedReadLikeIntent: boolean;
  readonly hasGroundedConstraintCue: boolean;
  readonly hasCreateIntent: boolean;
  readonly hasEditIntentRaw: boolean;
  readonly hasEditIntent: boolean;
  readonly hasVerifyIntent: boolean;
  readonly hasCorrectionCue: boolean;
  readonly hasExecutionCorrectionCue: boolean;
  readonly hasAnswerRepairCue: boolean;
  readonly isAmbiguousRepairFollowUp: boolean;
  readonly hasDiagnosisIntent: boolean;
  readonly hasWeakRepairFollowUp: boolean;
  readonly avoidPreviousDirection: boolean;
  readonly hasCrossFileCue: boolean;
  readonly hasVerifyContinuationCue: boolean;
  readonly verifyCommand?: string;
  readonly preferTestOverBuild: boolean;
  readonly effectiveVerifyCommand?: string;
  readonly effectiveReplaceDirectiveFromPrompt?: { from: string; to: string };
  readonly hasExecutionIntent: boolean;
  readonly unsupportedCommand?: string;
}

interface WorkflowExecutionResult {
  readonly events: QueryEvent[];
  readonly notes: string[];
  readonly codingResult: CodingResultSummary;
  readonly userFacingOutput: string;
}


function buildWorkflowTaskPlan(
  prompt: string,
  workspaceRoot: string,
  continuityState?: unknown,
): WorkflowTaskPlan {
  const continuity = continuityStateAsObject(continuityState);
  const continuationIntent = classifyWorkflowContinuationIntent({
    prompt,
    continuity,
  });
  const replaySafeLineage = buildWorkflowContinuationLineage({ continuity });
  const {
    normalized,
    intentPrompt,
    groundedIntentPrompt,
    hasContextSeedPrefix,
    hasExplicitBoundaryResetPrompt,
    hasFileReadIntent,
    hasTargetedFileReadIntent,
    hasRepositoryInspectIntent,
    hasSummarizeIntent,
    hasExplainIntent,
    hasReflectiveExplainStateQuestion,
    hasReflectiveExplainContinuation,
    hasReflectiveExplainQuery,
    detectedReflectiveStateQueryKind,
    reflectiveStateQueryKind,
    hasReflectiveActionCue,
    hasPriorLocalExplainEvidence,
    hasRecoverableReadFragmentEvidence,
    hasLocalExplainCue,
    hasGroundedReadLikeIntent,
    hasGroundedConstraintCue,
    hasCreateIntent,
    hasEditIntentRaw,
    hasEditIntent,
    hasVerifyIntent,
    hasCorrectionCue,
    hasExecutionCorrectionCue,
    hasAnswerRepairCue,
    isAmbiguousRepairFollowUp,
    hasDiagnosisIntent,
    hasWeakRepairFollowUp,
    avoidPreviousDirection,
    hasCrossFileCue,
    hasVerifyContinuationCue,
    verifyCommand,
    preferTestOverBuild,
    effectiveVerifyCommand,
    effectiveReplaceDirectiveFromPrompt,
    hasExecutionIntent,
    unsupportedCommand,
  } = extractWorkflowTaskIntentSignals(prompt, continuity);
  let targetResolution = resolveTaskTargets(prompt, workspaceRoot);
  if (targetResolution.blocker && hasVerifyIntent) {
    const mutationTargetPrompt = stripVerificationTailForTarget(prompt);
    if (mutationTargetPrompt && mutationTargetPrompt !== prompt.trim()) {
      const mutationTargetResolution = resolveTaskTargets(
        mutationTargetPrompt,
        workspaceRoot,
      );
      if (!mutationTargetResolution.blocker && mutationTargetResolution.primaryTarget) {
        targetResolution = mutationTargetResolution;
      }
    }
  }
  const browserPlan = detectWorkflowBrowserPlan({
    prompt,
    continuityState: continuity,
  });
  if (browserPlan) {
    return {
      taskKind: "browser",
      reason: browserPlan.reason,
      browserPlan,
      inspectFirst: false,
      verifyAfterEdit: false,
      usedRestoredState: Boolean(browserPlan.continuationSummary),
    };
  }
  if (
    targetResolution.blocker &&
    shouldBlockMutationForTargetResolution({
      blocker: targetResolution.blocker,
      hasCorrectionCue,
      hasCreateIntent,
      hasEditIntent,
      hasExecutionCorrectionCue,
      hasFencedContent: Boolean(extractFencedContent(prompt)),
      hasReplaceDirective: Boolean(effectiveReplaceDirectiveFromPrompt),
    })
  ) {
    return {
      taskKind: "edit-file",
      reason: "target resolution blocked mutation planning",
      inspectFirst: false,
      verifyAfterEdit: false,
      blockedReason: formatTargetResolutionBlockerReason(
        targetResolution.blocker,
      ),
      targetMissing: true,
    };
  }
  const rawContinuityTargetPath = deriveWorkflowContinuationTarget({
    continuity,
    workspaceRoot,
  });
  const promptPathTarget = derivePromptPathTarget(prompt, workspaceRoot);
  const explicitPrimaryTarget = targetResolution.primaryTarget;
  const hasExplicitPathReference =
    Boolean(promptPathTarget || explicitPrimaryTarget) ||
    targetResolution.targets.length > 0 ||
    hasPathLikeReference(prompt);
  const hasImplicitPathOnlyReadIntent =
    !hasFileReadIntent &&
    !hasSummarizeIntent &&
    !hasExplainIntent &&
    hasExplicitPathReference &&
    isPathOnlyReadRequest(prompt);
  const seedActionKind = continuity.lastActionResultSeed?.actionKind;
  const hasActionResultSeed = Boolean(continuity.lastActionResultSeed);
  const seedIgnoredExplicitTargetLineage =
    hasActionResultSeed && hasExplicitPathReference
      ? ["seedInfluence=ignored-explicit-target"]
      : undefined;
  const diagnosticHandoffProjection = projectProviderDiagnosticHandoff(continuity);
  const diagnosticHandoffEvidence =
    diagnosticHandoffProjection.diagnosticHandoff;
  const hasDiagnosticVerifyHandoffCue =
    Boolean(diagnosticHandoffEvidence?.command) &&
    hasVerifyIntent &&
    !hasExplicitPathReference;
  const hasWeakDiagnosticHandoffCue =
    Boolean(diagnosticHandoffEvidence) &&
    isWeakSeedTargetCarryoverPrompt(prompt) &&
    !hasExplicitPathReference;
  const diagnosticHandoffLineage =
    (hasWeakDiagnosticHandoffCue || hasDiagnosticVerifyHandoffCue) &&
    diagnosticHandoffEvidence
      ? diagnosticHandoffProjection.lineage
      : undefined;
  const ignoredExplicitTargetLineage = [
    ...(seedIgnoredExplicitTargetLineage ?? []),
    ...(diagnosticHandoffEvidence && hasExplicitPathReference
      ? ["diagnosticHandoff=ignored-explicit-target"]
      : []),
  ];
  const ignoredExplicitTargetLineageOrUndefined =
    ignoredExplicitTargetLineage.length > 0
      ? ignoredExplicitTargetLineage
      : undefined;
  const seedWasReadLike =
    seedActionKind === "read-file" ||
    seedActionKind === "repo-explain" ||
    seedActionKind === "inspect-files";
  const lastTaskWasReadLike =
    continuity.lastTaskKind === "read-file" ||
    continuity.lastTaskKind === "repo-explain" ||
    continuity.lastTaskKind === "inspect-files" ||
    seedWasReadLike;
  const lastTaskWasMutationLike =
    continuity.lastTaskKind === "edit-file" ||
    continuity.lastTaskKind === "write-file" ||
    continuity.lastMutationVerificationLineage?.actionKind === "edit-file" ||
    continuity.lastMutationVerificationLineage?.actionKind === "write-file";
  const hasPostEditReadOnlyVerifyPrompt =
    isPostEditReadOnlyVerifyFollowUp(prompt);
  const hasWeakSeedTargetCarryoverCue =
    isWeakSeedTargetCarryoverPrompt(prompt) && !hasExplicitPathReference;
  const hasPostEditReadOnlyVerifyCue =
    hasPostEditReadOnlyVerifyPrompt &&
    lastTaskWasMutationLike &&
    !hasCorrectionCue &&
    !hasCreateIntent &&
    !hasExecutionIntent &&
    !effectiveReplaceDirectiveFromPrompt &&
    !extractFencedContent(prompt);
  const hasSeedReadOnlyCheckCue =
    (hasPostEditReadOnlyVerifyPrompt || hasWeakSeedTargetCarryoverCue) &&
    seedWasReadLike &&
    !hasEditIntent &&
    !hasCorrectionCue &&
    !hasCreateIntent &&
    !hasExecutionIntent &&
    !effectiveReplaceDirectiveFromPrompt &&
    !extractFencedContent(prompt);
  const seedVerificationStatus =
    continuity.lastActionResultSeed?.verification?.status?.trim().toLowerCase();
  const seedVerifySignalLineage =
    seedVerificationStatus && seedVerificationStatus !== "not-requested"
      ? ["seedInfluence=verify-signal"]
      : undefined;
  const diagnosticVerifyStatus =
    diagnosticHandoffEvidence?.status?.trim().toLowerCase();
  const diagnosticHasVerifySignal = Boolean(
    diagnosticHandoffEvidence?.command &&
      diagnosticVerifyStatus &&
      diagnosticVerifyStatus !== "not-requested",
  );
  const verifyContinuationLineage = [
    ...(seedVerifySignalLineage ?? []),
    ...(diagnosticHandoffLineage ?? []),
  ];
  const verifyContinuationLineageOrUndefined =
    verifyContinuationLineage.length > 0
      ? verifyContinuationLineage
      : undefined;
  const lastTaskHadVerifySignal =
    continuity.lastVerificationStatus === "failed" ||
    continuity.lastVerificationStatus === "blocked" ||
    continuity.lastVerificationStatus === "skipped" ||
    Boolean(seedVerificationStatus && seedVerificationStatus !== "not-requested") ||
    diagnosticHasVerifySignal ||
    (continuity.unresolvedItems ?? []).some(
      (entry) =>
        entry.toLowerCase().startsWith("verify:") &&
        !entry.toLowerCase().includes("not-requested"),
    );
  const mutationVerificationLineage =
    buildPostEditVerifyContinuationLineage(continuity);
  const previousRemainingTargets =
    extractCrossFileStateListFromContinuityEvidence(
      continuity,
      "repair-remaining-files:",
    );
  const previousFailedEntries =
    extractCrossFileFailureEntriesFromContinuity(continuity);
  const hasFailureRecoverySignals =
    previousRemainingTargets.length > 0 ||
    previousFailedEntries.length > 0 ||
    (continuity.recentFailedFiles?.length ?? 0) > 0;
  const hasTaskTruthAnchor =
    Boolean(continuity.lastUserIntent?.trim()) ||
    Boolean(continuity.lastAssistantOutput?.trim()) ||
    Boolean(continuity.lastTaskSatisfactionVerdict) ||
    Boolean(continuity.lastContinuationStatus) ||
    Boolean(continuity.lastFailure);
  const hasContinuationStateSignals =
    previousRemainingTargets.length > 0 ||
    previousFailedEntries.length > 0 ||
    (continuity.recentTargetFiles?.length ?? 0) > 0 ||
    (continuity.recentFailedFiles?.length ?? 0) > 0 ||
    (continuity.lastContinuationEvidence?.length ?? 0) > 0 ||
    Boolean(diagnosticHandoffEvidence) ||
    hasTaskTruthAnchor;
  const editFailureRepairContext = resolveSingleFileEditFailureRepairContext(
    continuity,
    workspaceRoot,
  );
  const editFailureRepairContextAbandonment = editFailureRepairContext
    ? undefined
    : resolveSingleFileEditFailureRepairContextAbandonment(
        continuity,
        workspaceRoot,
      );
  const hasEditFailureRepairLikePayload = Boolean(
    !hasGroundedReadLikeIntent &&
    !hasVerifyIntent &&
    !hasDiagnosisIntent &&
    !hasExecutionIntent &&
    (effectiveReplaceDirectiveFromPrompt ||
      extractFencedContent(prompt) ||
      ((editFailureRepairContext?.failureReason === "edit-target-missing" ||
        editFailureRepairContextAbandonment?.failureReason ===
          "edit-target-missing") &&
        hasPathLikeReference(prompt) &&
        (hasEditIntent ||
          Boolean(effectiveReplaceDirectiveFromPrompt) ||
          Boolean(extractFencedContent(prompt))))),
  );
  const hasEditFailureRepairPayload = Boolean(
    editFailureRepairContext && hasEditFailureRepairLikePayload,
  );
  const editFailureRepairPayloadKind =
    hasEditFailureRepairPayload && editFailureRepairContext
      ? resolveSingleFileEditRepairPayloadKind({
          failureReason: editFailureRepairContext.failureReason,
          prompt,
          hasEditIntent,
          replaceDirective: effectiveReplaceDirectiveFromPrompt,
          fencedContent: extractFencedContent(prompt),
        })
      : undefined;
  const hasTemporalSuccessorContextSignal =
    hasContinuationStateSignals ||
    hasContextSeedPrefix ||
    continuity.lastTerminalClassification === "stopped" ||
    continuity.lastTerminalReason === "stopped_error";
  const hasAtypicalReopenCue = isAtypicalReopenFollowUpPrompt(prompt);
  const hasUltraWeakContinuationCue =
    isUltraWeakContinuationFollowUpPrompt(prompt);
  const hasTemporalSuccessorCue =
    isTemporalSuccessorCuePrompt(prompt) &&
    hasTemporalSuccessorContextSignal &&
    !hasDiagnosisIntent &&
    !hasExecutionIntent &&
    !hasGroundedReadLikeIntent &&
    !hasVerifyIntent &&
    !hasCreateIntent;
  const hasResumeTaskContinuityCue =
    /\b(?:after\s+resume|resume\s+check|same\s+task|exact\s+task|keep\s+the\s+exact\s+task|continue\s+the\s+same\s+task)\b/i.test(
      prompt,
    ) &&
    hasContinuationStateSignals &&
    !hasDiagnosisIntent &&
    !hasExecutionIntent &&
    !hasGroundedReadLikeIntent &&
    (!hasVerifyIntent ||
      detectedReflectiveStateQueryKind === "task-continuity") &&
    !hasCreateIntent;
  const hasAmbiguousUltraWeakContinuationCue =
    isAmbiguousGroundedRepairFollowUp(prompt) &&
    !hasDiagnosisIntent &&
    !hasExecutionIntent &&
    !hasGroundedReadLikeIntent &&
    !hasVerifyIntent &&
    !hasCreateIntent;
  const hasUltraWeakContinuationEquivalentCue =
    hasUltraWeakContinuationCue ||
    hasAmbiguousUltraWeakContinuationCue ||
    hasTemporalSuccessorCue;
  const hasContinuationCueRaw =
    /(?:continue|same file|use the failure above|wrong direction|not the right fix|\u7ee7\u7eed|\u63a5\u7740|\u4e0a\u4e00\u8f6e|\u5931\u8d25)/i.test(
      prompt,
    ) ||
    (hasUltraWeakContinuationEquivalentCue &&
      hasContinuationStateSignals &&
      !hasDiagnosisIntent &&
      !hasExecutionIntent &&
      !hasGroundedReadLikeIntent &&
      !hasVerifyIntent &&
      !hasCreateIntent) ||
    (Boolean(reflectiveStateQueryKind) && hasReflectiveActionCue) ||
    (hasAtypicalReopenCue &&
      hasContinuationStateSignals &&
      !hasDiagnosisIntent &&
      !hasExecutionIntent &&
      !hasGroundedReadLikeIntent);
  const hasContinuationCue =
    hasContinuationCueRaw &&
    !hasExplicitBoundaryResetPrompt &&
    !hasContextSeedPrefix;
  const hasWeakNextStepContinuationCue =
    hasUltraWeakContinuationEquivalentCue ||
    /\b(?:now\s+)?(?:continue|proceed|do\s+(?:the\s+)?next\s+step)\b/i.test(
      prompt,
    );
  const hasDegradedContinuationEvidence =
    hasDegradedContinuationEvidenceInState(continuity);
  const hasDegradedReopenCue = isDegradedReopenFollowUpPrompt(prompt);
  const continuationReopenDecision = resolveContinuationReopenTarget({
    continuity,
    prompt,
    workspaceRoot,
    enabled:
      (hasFailureRecoverySignals || hasDegradedContinuationEvidence) &&
      (hasDegradedReopenCue ||
        hasAtypicalReopenCue ||
        hasCrossFileCue ||
        hasUltraWeakContinuationEquivalentCue ||
        hasContinuationCue) &&
      !explicitPrimaryTarget &&
      !promptPathTarget,
    degradedOnly: hasDegradedContinuationEvidence && hasDegradedReopenCue,
  });
  const hasContinuationExecutionIntent =
    hasContinuationCue ||
    hasEditFailureRepairPayload ||
    hasEditIntent ||
    hasCreateIntent ||
    (continuationReopenDecision.enabled &&
      (Boolean(continuationReopenDecision.selectedTarget) ||
        continuationReopenDecision.candidates.length > 0));
  const readContinuityRecovery = recoverReadContinuationTarget({
    candidatePath: rawContinuityTargetPath,
    continuity,
    workspaceRoot,
  });
  const continuityCandidateForIntent =
    hasGroundedReadLikeIntent || hasImplicitPathOnlyReadIntent
      ? readContinuityRecovery.targetPath
      : rawContinuityTargetPath;
  const hasPathlessReadTargetCarryoverCue =
    hasFileReadIntent &&
    !hasExplicitPathReference &&
    !hasEditIntent &&
    !hasCreateIntent &&
    !hasExecutionIntent &&
    !hasVerifyIntent;
  const shouldUseContinuationTarget = Boolean(
    !explicitPrimaryTarget &&
    continuityCandidateForIntent &&
    (hasContinuationCue ||
      hasCorrectionCue ||
      hasExecutionCorrectionCue ||
      hasAnswerRepairCue ||
      hasGroundedConstraintCue ||
      hasEditFailureRepairPayload ||
      isAmbiguousRepairFollowUp ||
      hasWeakRepairFollowUp ||
      hasPostEditReadOnlyVerifyCue ||
      hasSeedReadOnlyCheckCue ||
      hasWeakDiagnosticHandoffCue ||
      hasDiagnosticVerifyHandoffCue ||
      hasPathlessReadTargetCarryoverCue ||
      (hasGroundedReadLikeIntent && lastTaskWasReadLike) ||
      hasEditIntent ||
      hasCreateIntent ||
      (hasVerifyIntent && lastTaskHadVerifySignal) ||
      (hasWeakNextStepContinuationCue &&
        Boolean(mutationVerificationLineage?.length) &&
        hasPassedVerificationLineage(continuity))),
  );
  const continuityTargetPath =
    continuationReopenDecision.selectedTarget ??
    (shouldUseContinuationTarget ? continuityCandidateForIntent : undefined);
  const explicitHasExtension = Boolean(
    explicitPrimaryTarget?.cleaned &&
    /\/[^/]+\.[A-Za-z0-9._-]+$/.test(
      normalizePathLike(explicitPrimaryTarget.cleaned),
    ),
  );
  const hasWriteExpectationIntent =
    !hasCreateIntent && isWriteExpectationPrompt(prompt);
  const hasWriteTaskIntent = hasCreateIntent || hasWriteExpectationIntent;
  const mutationIntentTarget =
    hasWriteTaskIntent || hasEditIntent
      ? selectMutationTargetFromPrompt(prompt, targetResolution.targets)
      : undefined;
  const primaryTarget =
    mutationIntentTarget ??
    (explicitHasExtension ? explicitPrimaryTarget : null) ??
    promptPathTarget ??
    explicitPrimaryTarget ??
    (continuityTargetPath
      ? {
          raw: continuityTargetPath,
          cleaned: continuityTargetPath,
          absolutePath: continuityTargetPath,
          inWorkspace: true,
        }
      : null);
  const editExpectationContract = classifyEditExpectationContract({
    prompt,
    targetPath: primaryTarget?.cleaned,
    targetCount: targetResolution.targets.length,
    hasConcreteContent: Boolean(
      extractFencedContent(prompt) ?? extractInlineWriteContent(prompt),
    ),
    hasReplaceDirective: Boolean(effectiveReplaceDirectiveFromPrompt),
    hasFencedContent: Boolean(extractFencedContent(prompt)),
    hasCreateIntent: hasWriteTaskIntent,
    hasEditIntent,
    hasReadInspectIntent: hasGroundedReadLikeIntent,
  });
  const readContinuationLineage = [
    ...(ignoredExplicitTargetLineageOrUndefined ?? []),
    ...(readContinuityRecovery.relocationNote
      ? [readContinuityRecovery.relocationNote]
      : []),
  ];
  const readContinuationLineageOrUndefined =
    readContinuationLineage.length > 0 ? readContinuationLineage : undefined;
  const usedRestoredState =
    !explicitPrimaryTarget &&
    (Boolean(continuityTargetPath) ||
      hasWeakDiagnosticHandoffCue ||
      hasDiagnosticVerifyHandoffCue ||
      ((hasContinuationCue ||
        hasEditFailureRepairPayload ||
        hasTemporalSuccessorCue ||
        hasResumeTaskContinuityCue) &&
        hasTaskTruthAnchor));
  const explicitDeliverableMode = detectGroundedDeliverableMode(prompt);
  const inferredDeliverableModeFromContinuity =
    inferGroundedDeliverableModeFromContinuity(continuity);
  const effectiveGroundedDeliverableMode =
    explicitDeliverableMode ??
    (lastTaskWasReadLike &&
    (hasContinuationCue ||
      hasCorrectionCue ||
      hasAnswerRepairCue ||
      isAmbiguousRepairFollowUp ||
      hasGroundedReadLikeIntent ||
      (usedRestoredState && !hasDiagnosisIntent))
      ? inferredDeliverableModeFromContinuity
      : undefined);
  const normalizedRepairInstruction = normalizeGroundedRepairInstruction({
    prompt,
    continuity,
    explicitDeliverableMode,
    effectiveDeliverableMode: effectiveGroundedDeliverableMode,
    hasContinuationCue,
    hasCorrectionCue,
    hasAnswerRepairCue,
    isAmbiguousRepairFollowUp,
    hasGroundedReadLikeIntent,
    lastTaskWasReadLike,
  });
  const readWindowDirective = resolveReadWindowDirectiveForWorkflow(
    prompt,
    continuity,
    {
      localSliceExplain: hasLocalExplainCue,
    },
  );
  const readFragmentDirective =
    extractLastReadDeliveredFragmentFromContinuity(continuity);
  const hasLocalMutationCue =
    hasLocalSliceExplainCue(prompt) &&
    (hasEditIntent ||
      hasExecutionCorrectionCue ||
      (hasContinuationCue &&
        !hasGroundedReadLikeIntent &&
        !hasVerifyIntent &&
        !hasDiagnosisIntent));
  const hasMutationScopeEvidence =
    (readFragmentDirective.lineIndexes?.length ?? 0) > 0 ||
    (readFragmentDirective.ranges?.length ?? 0) > 0 ||
    (readFragmentDirective.sourceWindowStart !== undefined &&
      readFragmentDirective.sourceWindowEnd !== undefined);
  const mutationScopeFields =
    hasLocalMutationCue && hasMutationScopeEvidence
      ? {
          ...(readFragmentDirective.lineIndexes?.length
            ? { mutationScopeLineIndexes: readFragmentDirective.lineIndexes }
            : {}),
          ...(readFragmentDirective.ranges?.length
            ? { mutationScopeRanges: readFragmentDirective.ranges }
            : {}),
          ...(readFragmentDirective.sourceWindowStart !== undefined
            ? {
                mutationScopeSourceWindowStart:
                  readFragmentDirective.sourceWindowStart,
              }
            : {}),
          ...(readFragmentDirective.sourceWindowEnd !== undefined
            ? {
                mutationScopeSourceWindowEnd:
                  readFragmentDirective.sourceWindowEnd,
              }
            : {}),
          ...(readFragmentDirective.fingerprint
            ? { mutationScopeFingerprint: readFragmentDirective.fingerprint }
            : {}),
        }
      : {};
  const mutationScopeRequiredFields =
    hasLocalMutationCue && !hasCreateIntent
      ? { mutationScopeRequired: true }
      : {};
  const readLineCount = readWindowDirective.lineCount;
  const readLineOffset = readWindowDirective.lineOffset;
  const failedTransforms = collectContinuationTransforms({
    continuity,
    preferredTarget: primaryTarget?.cleaned,
    workspaceRoot,
  });
  const hasCrossFileContinuationContext =
    hasCrossFileContinuationContextInContinuity(continuity);
  const crossFileCandidates = deriveCrossFileRepairCandidates(
    continuity,
    primaryTarget?.cleaned,
  );
  const hasCrossFileEvidenceSignal =
    hasCrossFileEvidenceSignalInContinuity(continuity);
  const hasCrossFileUltraWeakFollowUp =
    hasUltraWeakContinuationEquivalentCue &&
    !hasCrossFileCue &&
    !hasCorrectionCue &&
    !hasExecutionCorrectionCue &&
    !hasAnswerRepairCue &&
    (hasCrossFileEvidenceSignal || hasCrossFileContinuationContext);
  const selectedReopenTargetPath = continuationReopenDecision.selectedTarget;
  const selectedReopenTargetExists = selectedReopenTargetPath
    ? fs.existsSync(path.resolve(workspaceRoot, selectedReopenTargetPath))
    : false;
  const hasSingleRecoverableCrossFileReopenTarget = Boolean(
    hasCrossFileUltraWeakFollowUp &&
    continuationReopenDecision.selectedTarget &&
    continuationReopenDecision.candidates.length === 1 &&
    selectedReopenTargetExists,
  );
  const continuityReplaceDirective = inferReplaceDirectiveFromContinuity({
    continuity,
    preferredTarget: primaryTarget?.cleaned,
    workspaceRoot,
  });
  const hasStaleTransformExhaustionHistory =
    ((continuity.lastTerminalClassification === "stopped" ||
      continuity.lastTerminalReason === "stopped_error") &&
      /stale against current file content|stale-transform-already-applied/i.test(
        continuity.lastFailure ?? "",
      )) ||
    (continuity.lastContinuationEvidence ?? []).some((entry) =>
      /rebind-blocker:[^:]+:stale-transform-already-applied:/i.test(entry),
    );
  const retireContinuityTransformForCrossFileUltraWeak =
    hasCrossFileUltraWeakFollowUp &&
    !effectiveReplaceDirectiveFromPrompt &&
    hasStaleTransformExhaustionHistory;
  const continuityReplaceDirectiveForExecution =
    retireContinuityTransformForCrossFileUltraWeak
      ? undefined
      : continuityReplaceDirective;
  const hasExecutableCrossFileTransformEvidence = Boolean(
    effectiveReplaceDirectiveFromPrompt ??
    continuityReplaceDirectiveForExecution,
  );
  const allowCrossFileUltraWeakAutoContinuation = Boolean(
    hasSingleRecoverableCrossFileReopenTarget &&
    hasExecutableCrossFileTransformEvidence,
  );
  const lineageActivationResult = projectWorkflowLineageActivation({
    continuity,
    weakOrTemporalCue: hasUltraWeakContinuationEquivalentCue,
    selectedReopenTarget: continuationReopenDecision.selectedTarget,
    reopenCandidates: continuationReopenDecision.candidates,
    crossFileSignal: hasCrossFileEvidenceSignal,
  });
  const lineageActivation = lineageActivationResult.decision;
  const lineageActivationProjection = lineageActivationResult.projection;
  const lineageActivationEvidence =
    lineageActivationProjection.evidence.length > 0
      ? lineageActivationProjection.evidence
      : undefined;
  const shouldUsePostExhaustionUnifiedBlocker =
    hasStaleTransformExhaustionHistory &&
    hasUltraWeakContinuationEquivalentCue &&
    !effectiveReplaceDirectiveFromPrompt &&
    (hasCrossFileEvidenceSignal ||
      hasCrossFileContinuationContext ||
      continuationReopenDecision.enabled);
  const hasVerifyLineageHint = Boolean(
    inferWorkflowVerifyCommand(continuity),
  );
  const hasBlockedVerifyResumeContext =
    continuity.lastVerificationStatus === "blocked" &&
    Boolean(inferWorkflowVerifyCommand(continuity)) &&
    isWorkflowVerifyResumeEligible(continuity);
  const inferredTransformDirective =
    failedTransforms.length > 0
      ? {
          from: failedTransforms[failedTransforms.length - 1]!.from,
          to: failedTransforms[failedTransforms.length - 1]!.to,
        }
      : undefined;
  const interruptedGoalRepairDirective =
    effectiveReplaceDirectiveFromPrompt ??
    continuityReplaceDirectiveForExecution ??
    inferredTransformDirective ??
    inferReplaceDirectiveFromContinuity({
      continuity,
      workspaceRoot,
    });
  const hasInterruptedGoalRepairCue = Boolean(
    /continue the interrupted task/i.test(prompt) &&
      lastTaskWasMutationLike &&
      continuity.lastVerificationStatus === "failed" &&
      (primaryTarget?.inWorkspace || rawContinuityTargetPath) &&
      interruptedGoalRepairDirective &&
      !hasExplicitBoundaryResetPrompt,
  );
  const hasRepairContinuationCue =
    hasInterruptedGoalRepairCue ||
    isRepairContinuationFollowUpPrompt(prompt) ||
    (reflectiveStateQueryKind === "stop-reason" && hasReflectiveActionCue) ||
    (reflectiveStateQueryKind === "next-step" &&
      /(?:\bcontinue fixing(?:\s+that)?\b|继续修|继续修这个|按这个继续修)/i.test(
        prompt,
      ));
  const repairObject = hasRepairContinuationCue
    ? buildWorkflowRepairContinuation({
        continuity,
        targetPath:
          primaryTarget?.inWorkspace
            ? (rebindContinuationTargetToWorkspace(
                primaryTarget.cleaned,
                workspaceRoot,
              ) ?? primaryTarget.cleaned)
            : hasInterruptedGoalRepairCue
              ? rawContinuityTargetPath
              : undefined,
        replaceDirective:
          effectiveReplaceDirectiveFromPrompt ??
          continuityReplaceDirectiveForExecution ??
          inferredTransformDirective ??
          interruptedGoalRepairDirective,
      })
    : undefined;
  const hasVerifyContinuationStateSignal =
    hasDiagnosticVerifyHandoffCue ||
    lastTaskHadVerifySignal ||
    hasVerifyLineageHint ||
    Boolean(rawContinuityTargetPath);
  const hasVerifyObjectCue =
    (hasVerifyContinuationCue ||
      hasDiagnosticVerifyHandoffCue ||
      (reflectiveStateQueryKind === "next-step" &&
        hasReflectiveActionCue &&
        (hasVerifyIntent || hasBlockedVerifyResumeContext))) &&
    (hasExecutionCorrectionCue || hasVerifyContinuationStateSignal);
  const verifyContinuationTargetPath = primaryTarget?.inWorkspace
    ? primaryTarget.cleaned
    : hasVerifyObjectCue
      ? rawContinuityTargetPath
      : undefined;
  const verifyObject = hasVerifyObjectCue
    ? buildWorkflowVerifyContinuation({
        continuity,
        targetPath: verifyContinuationTargetPath,
        command: effectiveVerifyCommand,
      })
    : undefined;
  const allowWeakFollowUpInheritedTransform =
    hasWeakRepairFollowUp &&
    crossFileCandidates.length > 0 &&
    (hasCrossFileCue || hasCrossFileEvidenceSignal);
  const effectiveReplaceDirective =
    effectiveReplaceDirectiveFromPrompt ??
    (hasWeakRepairFollowUp && !allowWeakFollowUpInheritedTransform
      ? undefined
      : continuityReplaceDirectiveForExecution);
  const shouldKeepVerifiedMutationNextStep =
    Boolean(mutationVerificationLineage?.length) &&
    hasPassedVerificationLineage(continuity) &&
    hasWeakNextStepContinuationCue &&
    primaryTarget?.inWorkspace === true &&
    !hasReflectiveActionCue &&
    !hasEditIntent &&
    !hasCreateIntent &&
    !hasRepairContinuationCue &&
    !hasVerifyIntent &&
    !hasExecutionIntent &&
    !hasGroundedReadLikeIntent &&
    !effectiveReplaceDirective &&
    !extractFencedContent(prompt);
  const shouldCoordinateCrossFileRepair =
    !hasCreateIntent &&
    !effectiveReplaceDirectiveFromPrompt &&
    crossFileCandidates.length > 0 &&
    (hasCrossFileCue ||
      hasCrossFileEvidenceSignal ||
      hasContinuationCue ||
      hasCorrectionCue ||
      hasWeakRepairFollowUp);
  const shouldReturnCrossFileConvergedNoop =
    !hasCreateIntent &&
    !effectiveReplaceDirectiveFromPrompt &&
    !allowCrossFileUltraWeakAutoContinuation &&
    (hasCrossFileCue || hasContinuationCue || hasWeakRepairFollowUp) &&
    hasCrossFileContinuationContext &&
    crossFileCandidates.length === 0;
  const missingActiveWorkContext =
    (hasExecutionCorrectionCue || hasContinuationCue) &&
    !primaryTarget?.inWorkspace &&
    !explicitPrimaryTarget &&
    (lastTaskWasMutationLike || lastTaskHadVerifySignal);

  if (repairObject && hasRepairContinuationCue) {
    if (!repairObject.executableNow) {
      return {
        taskKind: "edit-file",
        reason:
          "repair continuation requested, but structured repair object is incomplete",
        inspectFirst: true,
        verifyAfterEdit: false,
        blockedReason: `Repair continuation is unavailable: missing ${repairObject.missingFields.join(", ")}.`,
        targetMissing: !repairObject.targetPath,
        usedRestoredState,
      };
    }
    return {
      taskKind: "edit-file",
      reason:
        hasInterruptedGoalRepairCue
          ? "interrupted verification failure continuation resumed original edit goal before rerunning verification"
          : "repair continuation resolved from structured blocker/failure lineage",
      targetPath: repairObject.targetPath,
      inspectFirst: true,
      verifyAfterEdit: hasInterruptedGoalRepairCue,
      ...(repairObject.verifyCommand || hasInterruptedGoalRepairCue
        ? {
            verifyCommand:
              repairObject.verifyCommand ??
              effectiveVerifyCommand ??
              inferWorkflowVerifyCommand(continuity) ??
              continuity.lastVerificationCommand,
          }
        : {}),
      ...(repairObject.replaceFrom && repairObject.replaceTo
        ? {
            replaceFrom: repairObject.replaceFrom,
            replaceTo: repairObject.replaceTo,
          }
        : {}),
      ...(failedTransforms.length > 0 ? { failedTransforms } : {}),
      continuationLineage: [
        `continuation-intent:${continuationIntent.kind}`,
        ...lineageActivationProjection.evidence,
        ...(repairObject.verifyCommand
          ? [
              `verify-command-hint:${repairObject.verifyCommand}`,
              ...(repairObject.targetPath
                ? [`verify-target-hint:${repairObject.targetPath}`]
                : []),
            ]
          : []),
        ...(repairObject.sourceLineage.length > 0
          ? repairObject.sourceLineage
          : replaySafeLineage.evidenceIds),
      ],
      usedRestoredState: hasInterruptedGoalRepairCue ? true : usedRestoredState,
    };
  }

  if (lineageActivation.status === "blocked") {
    return {
      taskKind: "edit-file",
      reason: "continuation lineage requires explicit disambiguation",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason:
        lineageActivation.reason ??
        "Continuation follow-up is ambiguous; provide explicit target/action.",
      targetMissing: true,
      usedRestoredState,
      continuationLineage: [
        `continuation-intent:${continuationIntent.kind}`,
        ...lineageActivationProjection.evidence,
      ],
      previousRemainingTargets,
      previousFailedEntries,
      ...(continuationReopenDecision.enabled
        ? {
            degradedReopen: true,
            degradedReopenReason:
              continuationReopenDecision.reason ??
              lineageActivation.reason,
            degradedReopenCandidates: continuationReopenDecision.candidates,
            degradedReopenCandidateSource:
              continuationReopenDecision.candidateSourceSummary,
            degradedReopenCandidatePruned:
              continuationReopenDecision.prunedCandidateSummary,
          }
        : {}),
    };
  }

  if (shouldUsePostExhaustionUnifiedBlocker) {
    return {
      taskKind: "edit-file",
      reason:
        "post-exhaustion cross-file ultra-weak follow-up requires explicit transform",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason:
        "Cross-file follow-up is ambiguous for direct execution (missing transform evidence). Provide explicit file path or transform to continue.",
      targetMissing: true,
      usedRestoredState,
      previousRemainingTargets,
      previousFailedEntries,
      ...(continuationReopenDecision.enabled
        ? {
            degradedReopen: true,
            degradedReopenReason:
              continuationReopenDecision.reason ??
              "post-exhaustion stale transform retired for generic follow-up",
            degradedReopenCandidates: continuationReopenDecision.candidates,
            degradedReopenCandidateSource:
              continuationReopenDecision.candidateSourceSummary,
            degradedReopenCandidatePruned:
              continuationReopenDecision.prunedCandidateSummary,
          }
        : {}),
    };
  }

  if (verifyObject && hasVerifyObjectCue) {
    if (
      verifyObject.commandCwd &&
      normalizePathLike(verifyObject.commandCwd) !==
        normalizePathLike(workspaceRoot)
    ) {
      return {
        taskKind: "run-command",
        reason:
          "verify continuation requested, but structured verify object points to a different workspace authority",
        inspectFirst: false,
        verifyAfterEdit: false,
        blockedReason:
          "Verify continuation is unavailable: rebased workspace authority mismatch for verify command cwd.",
        targetMissing: !verifyObject.targetPath,
        usedRestoredState,
      };
    }
    if (!verifyObject.executableNow) {
      return {
        taskKind: "run-command",
        reason:
          "verify continuation requested, but structured verify object is incomplete",
        inspectFirst: false,
        verifyAfterEdit: false,
        blockedReason: `Verify continuation is unavailable: missing ${verifyObject.missingFields.join(", ")}.`,
        targetMissing: !verifyObject.targetPath,
        usedRestoredState,
      };
    }
    return {
      taskKind: "run-command",
      reason:
        "verify continuation resolved from structured blocker/failure lineage",
      targetPath: verifyObject.targetPath,
      inspectFirst: false,
      verifyAfterEdit: false,
      directCommand: verifyObject.command,
      usedRestoredState,
      continuationLineage: verifyContinuationLineageOrUndefined,
    };
  }

  if (
    continuationReopenDecision.enabled &&
    !continuationReopenDecision.selectedTarget
  ) {
    const useUnifiedUltraWeakExhaustionSurface =
      hasUltraWeakContinuationEquivalentCue &&
      (hasCrossFileEvidenceSignal ||
        hasCrossFileContinuationContext ||
        continuationReopenDecision.enabled);
    const reason = useUnifiedUltraWeakExhaustionSurface
      ? "Cross-file follow-up is ambiguous for direct execution (missing transform evidence). Provide explicit file path or transform to continue."
      : continuationReopenDecision.candidates.length > 1
        ? `Continuation reopen has multiple candidate targets (${continuationReopenDecision.candidates.join(", ")}). Cannot auto-select; provide explicit file path or transform to continue repair.`
        : "Continuation reopen has no recoverable target candidate. Provide explicit file path to reopen repair.";
    return {
      taskKind: "edit-file",
      reason: "continuation reopen requires explicit target disambiguation",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason: reason,
      targetMissing: true,
      usedRestoredState,
      previousRemainingTargets,
      previousFailedEntries,
      degradedReopen: true,
      degradedReopenReason: continuationReopenDecision.reason,
      degradedReopenCandidates: continuationReopenDecision.candidates,
      degradedReopenCandidateSource:
        continuationReopenDecision.candidateSourceSummary,
      degradedReopenCandidatePruned:
        continuationReopenDecision.prunedCandidateSummary,
      continuationLineage: [
        `continuation-intent:${continuationIntent.kind}`,
        ...(lineageActivationEvidence ?? []),
      ],
    };
  }

  if (
    continuationReopenDecision.enabled &&
    continuationReopenDecision.selectedTarget &&
    hasCrossFileUltraWeakFollowUp &&
    !effectiveReplaceDirectiveFromPrompt
  ) {
    const missingTransform =
      !effectiveReplaceDirective && !allowCrossFileUltraWeakAutoContinuation;
    const missingTarget = !selectedReopenTargetExists;
    if (missingTransform || missingTarget) {
      const reasonParts: string[] = [];
      if (missingTransform) {
        reasonParts.push("missing transform evidence");
      }
      if (missingTarget) {
        reasonParts.push(
          `target '${continuationReopenDecision.selectedTarget}' is not recoverable in workspace`,
        );
      }
      return {
        taskKind: "edit-file",
        reason:
          "cross-file ultra-weak follow-up requires clarification before execution",
        inspectFirst: true,
        verifyAfterEdit: false,
        blockedReason: `Cross-file follow-up is ambiguous for direct execution (${reasonParts.join("; ")}). Provide explicit file path or transform to continue.`,
        targetMissing: true,
        usedRestoredState,
        previousRemainingTargets,
        previousFailedEntries,
        degradedReopen: true,
        degradedReopenReason:
          continuationReopenDecision.reason ??
          "ultra-weak cross-file follow-up with insufficient executable evidence",
        degradedReopenCandidates: continuationReopenDecision.candidates,
        degradedReopenCandidateSource:
          continuationReopenDecision.candidateSourceSummary,
        degradedReopenCandidatePruned:
          continuationReopenDecision.prunedCandidateSummary,
      };
    }
  }

  if (missingActiveWorkContext) {
    return {
      taskKind: "edit-file",
      reason:
        "follow-up mutation/verify prompt has no resolvable active target",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason:
        "Follow-up refers to previous edit/verify work, but no active target/failure context could be inherited. Provide explicit file path or rerun with the previous session context.",
      targetMissing: true,
      usedRestoredState,
    };
  }

  if (
    hasContextSeedPrefix &&
    !hasGroundedReadLikeIntent &&
    !hasCreateIntent &&
    !hasVerifyIntent &&
    !hasDiagnosisIntent
  ) {
    return {
      taskKind: "read-file",
      reason: "context-seed prompt acknowledged without executing prior task",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason:
        "Previous-task context was noted, but no execution was performed. Provide a concrete next task to continue.",
      targetMissing: true,
      usedRestoredState,
    };
  }

  if (
    hasExplicitBoundaryResetPrompt &&
    !hasGroundedReadLikeIntent &&
    !hasCreateIntent &&
    !hasVerifyIntent &&
    !hasDiagnosisIntent
  ) {
    return {
      taskKind: "read-file",
      reason:
        "freshness boundary reset requested for prior continuation history",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason:
        "Boundary reset applied. Prior mutation lineage was not consumed; provide a new explicit task or target to proceed.",
      targetMissing: true,
      usedRestoredState,
    };
  }

  if (shouldKeepVerifiedMutationNextStep && primaryTarget?.inWorkspace) {
    return {
      taskKind: "chat",
      reason:
        "verified mutation weak follow-up preserved target and next-step lineage",
      reflectiveStateQueryKind: "next-step",
      targetPath: primaryTarget.cleaned,
      inspectFirst: false,
      verifyAfterEdit: false,
      usedRestoredState: true,
      continuationLineage: mutationVerificationLineage,
    };
  }

  if (reflectiveStateQueryKind && !hasReflectiveActionCue) {
    return {
      taskKind: "chat",
      reason: "reflective state query requested without execution cue",
      inspectFirst: false,
      verifyAfterEdit: false,
      reflectiveStateQueryKind,
      usedRestoredState,
    };
  }

  if (
    lastTaskWasReadLike &&
    normalizedRepairInstruction.operation !== "continue" &&
    (hasAnswerRepairCue ||
      hasCorrectionCue ||
      normalizedRepairInstruction.operation === "switch" ||
      normalizedRepairInstruction.operation === "repair" ||
      normalizedRepairInstruction.operation === "clarify" ||
      isAmbiguousRepairFollowUp)
  ) {
    if (!primaryTarget?.inWorkspace) {
      return {
        taskKind: "read-file",
        reason: "answer-repair follow-up lacks active grounded target",
        inspectFirst: true,
        verifyAfterEdit: false,
        blockedReason:
          "Follow-up asks to repair previous grounded answer, but active target could not be inherited. Provide explicit file path.",
        targetMissing: true,
        usedRestoredState,
      };
    }
    if (normalizedRepairInstruction.operation === "clarify") {
      return {
        taskKind: "read-file",
        reason: normalizedRepairInstruction.reason,
        inspectFirst: true,
        verifyAfterEdit: false,
        blockedReason:
          normalizedRepairInstruction.clarificationPrompt ??
          "Follow-up mixes multiple grounded corrections. Clarify whether you want read, summary, or explain.",
        targetMissing: false,
        usedRestoredState,
        repairInstruction: normalizedRepairInstruction,
      };
    }
    return {
      taskKind: "read-file",
      reason: continuity.lastAnswerDefect
        ? `answer-repair follow-up on prior defect: ${continuity.lastAnswerDefect}`
        : "answer-repair follow-up on previous grounded response",
      targetPath: primaryTarget.cleaned,
      groundedDeliverableMode:
        normalizedRepairInstruction.targetMode ??
        effectiveGroundedDeliverableMode ??
        continuity.lastGroundedDeliverableMode ??
        "read",
      ...(readLineCount !== undefined ? { readLineCount } : {}),
      ...(readLineOffset !== undefined ? { readLineOffset } : {}),
      ...(readFragmentDirective.lineIndexes?.length
        ? { readFragmentLineIndexes: readFragmentDirective.lineIndexes }
        : {}),
      ...(readFragmentDirective.ranges?.length
        ? { readFragmentRanges: readFragmentDirective.ranges }
        : {}),
      ...(readFragmentDirective.sourceWindowStart !== undefined
        ? {
            readFragmentSourceWindowStart:
              readFragmentDirective.sourceWindowStart,
          }
        : {}),
      ...(readFragmentDirective.sourceWindowEnd !== undefined
        ? { readFragmentSourceWindowEnd: readFragmentDirective.sourceWindowEnd }
        : {}),
      ...(readFragmentDirective.fingerprint
        ? { readFragmentFingerprint: readFragmentDirective.fingerprint }
        : {}),
      ...(readFragmentDirective.filter
        ? { readFilter: readFragmentDirective.filter }
        : {}),
      inspectFirst: true,
      verifyAfterEdit: false,
      usedRestoredState,
      repairInstruction: normalizedRepairInstruction,
      continuationLineage: readContinuationLineageOrUndefined,
    };
  }

  if (
    hasFileReadIntent &&
    !hasExplicitPathReference &&
    !primaryTarget &&
    readContinuityRecovery.blockedReason
  ) {
    return {
      taskKind: "read-file",
      reason: "pathless read follow-up could not recover continuation target",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason: readContinuityRecovery.blockedReason,
      targetMissing: true,
      usedRestoredState: Boolean(rawContinuityTargetPath),
      continuationLineage: readContinuationLineageOrUndefined,
    };
  }

  if (
    hasLocalMutationCue &&
    !hasMutationScopeEvidence &&
    !explicitPrimaryTarget &&
    !promptPathTarget &&
    continuity.lastGroundedDeliverableMode === "explain" &&
    !hasGroundedReadLikeIntent &&
    !hasVerifyIntent
  ) {
    return {
      taskKind: "edit-file",
      reason: "local mutation follow-up lacks explain fragment scope evidence",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason:
        "This follow-up refers to the previously explained part, but no reliable local fragment is available to mutate. Re-read/re-explain the target slice or provide an explicit file path and transform.",
      targetMissing: false,
      usedRestoredState,
    };
  }

  if (
    hasExecutionCorrectionCue &&
    lastTaskWasMutationLike &&
    primaryTarget?.inWorkspace
  ) {
    return {
      taskKind: "edit-file",
      reason:
        "execution correction follow-up reused last active mutation target",
      targetPath: primaryTarget.cleaned,
      inspectFirst: true,
      verifyAfterEdit: hasVerifyIntent,
      ...(effectiveVerifyCommand
        ? { verifyCommand: effectiveVerifyCommand }
        : {}),
      continuationRepairReplan: true,
      ...(effectiveReplaceDirective
        ? {
            replaceFrom: effectiveReplaceDirective.from,
            replaceTo: effectiveReplaceDirective.to,
          }
        : {}),
      ...mutationScopeFields,
      ...mutationScopeRequiredFields,
      usedRestoredState,
    };
  }

  if (hasContinuationCue && hasFileReadIntent && primaryTarget?.inWorkspace) {
    return {
      taskKind: "read-file",
      reason: usedRestoredState
        ? "pathless read follow-up resolved from restored session state"
        : "read follow-up resolved from explicit target",
      targetPath: primaryTarget.cleaned,
      groundedDeliverableMode: effectiveGroundedDeliverableMode ?? "read",
      ...(readLineCount !== undefined ? { readLineCount } : {}),
      ...(readLineOffset !== undefined ? { readLineOffset } : {}),
      inspectFirst: true,
      verifyAfterEdit: false,
      usedRestoredState,
      repairInstruction: normalizedRepairInstruction,
      continuationLineage: readContinuationLineageOrUndefined,
    };
  }

  if (
    isAmbiguousRepairFollowUp &&
    !hasCrossFileUltraWeakFollowUp &&
    lastTaskWasReadLike &&
    primaryTarget?.inWorkspace &&
    !hasEditIntent &&
    !hasCreateIntent &&
    !hasVerifyIntent &&
    !hasDiagnosisIntent
  ) {
    return {
      taskKind: "read-file",
      reason:
        "ambiguous short follow-up resolved to active read-like continuation target",
      targetPath: primaryTarget.cleaned,
      groundedDeliverableMode:
        effectiveGroundedDeliverableMode ??
        continuity.lastGroundedDeliverableMode ??
        "read",
      ...(readLineCount !== undefined ? { readLineCount } : {}),
      ...(readLineOffset !== undefined ? { readLineOffset } : {}),
      ...(readFragmentDirective.lineIndexes?.length
        ? { readFragmentLineIndexes: readFragmentDirective.lineIndexes }
        : {}),
      ...(readFragmentDirective.ranges?.length
        ? { readFragmentRanges: readFragmentDirective.ranges }
        : {}),
      ...(readFragmentDirective.sourceWindowStart !== undefined
        ? {
            readFragmentSourceWindowStart:
              readFragmentDirective.sourceWindowStart,
          }
        : {}),
      ...(readFragmentDirective.sourceWindowEnd !== undefined
        ? { readFragmentSourceWindowEnd: readFragmentDirective.sourceWindowEnd }
        : {}),
      ...(readFragmentDirective.fingerprint
        ? { readFragmentFingerprint: readFragmentDirective.fingerprint }
        : {}),
      ...(readFragmentDirective.filter
        ? { readFilter: readFragmentDirective.filter }
        : {}),
      inspectFirst: true,
      verifyAfterEdit: false,
      usedRestoredState,
      repairInstruction: normalizedRepairInstruction,
    };
  }

  if (hasGroundedReadLikeIntent && hasExplicitPathReference && !primaryTarget) {
    const targetStop = projectReadMissingTargetStop({
      reason:
        "Grounded read/summarize/explain request included a path reference, but no resolvable target was found. Provide a valid in-workspace file path.",
      doNext: "Provide a valid in-workspace file path.",
    });
    return {
      taskKind: "read-file",
      reason:
        "grounded read/summarize/explain requires a resolvable target path",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason: targetStop.reason,
      targetMissing: true,
      usedRestoredState,
    };
  }

  if (
    hasGroundedReadLikeIntent &&
    primaryTarget &&
    !primaryTarget.inWorkspace
  ) {
    const targetStop = projectReadOutOfWorkspaceTargetStop({
      targetPath: primaryTarget.cleaned,
      reason:
        "Grounded read/summarize/explain target is outside current workspace. Attach/switch project or provide an in-workspace path.",
      doNext: "Attach/switch project or provide an in-workspace path.",
    });
    return {
      taskKind: "read-file",
      reason:
        "grounded read/summarize/explain target resolved outside workspace",
      targetPath: primaryTarget.cleaned,
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason: targetStop.reason,
      targetMissing: true,
      usedRestoredState,
    };
  }

  if (
    hasDiagnosisIntent &&
    !hasExecutionIntent &&
    !hasEditIntent &&
    !hasCreateIntent &&
    (hasExplainIntent ||
      /\b(?:repository|repo|runtime|session|implementation|implemented)\b/i.test(
        groundedIntentPrompt,
      ) ||
      /\b(?:fail|fails|failing|error|errors|exception|boom|intermittently)\b/i.test(
        groundedIntentPrompt,
      ))
  ) {
    return {
      taskKind: "repo-explain",
      reason: "repo diagnosis intent",
      targetPath: primaryTarget?.inWorkspace ? primaryTarget.cleaned : undefined,
      inspectFirst: true,
      verifyAfterEdit: false,
      usedRestoredState,
    };
  }

  if ((hasSummarizeIntent || hasExplainIntent) && !primaryTarget?.inWorkspace) {
    return {
      taskKind: "read-file",
      reason: "grounded summarize/explain requires explicit readable target",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason:
        "Summarize/explain requests require an explicit readable target file. Provide the file path in this workspace.",
      targetMissing: true,
      usedRestoredState,
    };
  }

  if (
    hasFileReadIntent &&
    primaryTarget?.inWorkspace &&
    !hasEditIntent &&
    !hasCreateIntent &&
    !hasExecutionCorrectionCue
  ) {
    return {
      taskKind: "read-file",
      reason:
        "explicit read intent takes precedence over inherited mutation context",
      targetPath: primaryTarget.cleaned,
      groundedDeliverableMode: effectiveGroundedDeliverableMode ?? "read",
      ...(readLineCount !== undefined ? { readLineCount } : {}),
      ...(readLineOffset !== undefined ? { readLineOffset } : {}),
      ...(shouldBuildContextPlanningSurface(prompt)
        ? {
            contextPlanningRequested: true,
            contextPlanningReason: "explicit-context-packet" as const,
          }
        : {}),
      inspectFirst: true,
      verifyAfterEdit: false,
      usedRestoredState,
      repairInstruction: normalizedRepairInstruction,
      continuationLineage: ignoredExplicitTargetLineageOrUndefined,
    };
  }

  if (hasPostEditReadOnlyVerifyCue && primaryTarget?.inWorkspace) {
    return {
      taskKind: "read-file",
      reason:
        "post-edit verify/check follow-up resolved as read-only continuation",
      targetPath: primaryTarget.cleaned,
      groundedDeliverableMode: effectiveGroundedDeliverableMode ?? "read",
      inspectFirst: true,
      verifyAfterEdit: false,
      usedRestoredState,
      repairInstruction: normalizedRepairInstruction,
      continuationLineage: mutationVerificationLineage,
    };
  }

  if (hasSeedReadOnlyCheckCue && primaryTarget?.inWorkspace) {
    return {
      taskKind: "read-file",
      reason:
        "seed-driven read-only check follow-up reused action result target",
      targetPath: primaryTarget.cleaned,
      groundedDeliverableMode: effectiveGroundedDeliverableMode ?? "read",
      inspectFirst: true,
      verifyAfterEdit: false,
      usedRestoredState,
      repairInstruction: normalizedRepairInstruction,
      continuationLineage: ["seedInfluence=target-carryover"],
    };
  }

  if (
    hasWeakDiagnosticHandoffCue &&
    primaryTarget?.inWorkspace &&
    !hasEditIntent &&
    !hasCorrectionCue &&
    !hasCreateIntent &&
    !hasExecutionIntent &&
    !hasVerifyIntent &&
    !effectiveReplaceDirectiveFromPrompt &&
    !extractFencedContent(prompt)
  ) {
    return {
      taskKind: "read-file",
      reason: "diagnostic-driven weak follow-up reused handoff target",
      targetPath: primaryTarget.cleaned,
      groundedDeliverableMode: effectiveGroundedDeliverableMode ?? "read",
      inspectFirst: true,
      verifyAfterEdit: false,
      usedRestoredState,
      repairInstruction: normalizedRepairInstruction,
      continuationLineage: diagnosticHandoffLineage,
    };
  }

  if (
    reflectiveStateQueryKind === "next-step" &&
    hasReflectiveActionCue &&
    lastTaskWasReadLike &&
    primaryTarget?.inWorkspace &&
    !hasEditIntent &&
    !hasCreateIntent &&
    !hasRepairContinuationCue &&
    !hasVerifyIntent &&
    !effectiveReplaceDirective
  ) {
    return {
      taskKind: "read-file",
      reason: "reflective next-step handoff reused read continuity target",
      targetPath: primaryTarget.cleaned,
      groundedDeliverableMode: effectiveGroundedDeliverableMode ?? "read",
      ...(readLineCount !== undefined ? { readLineCount } : {}),
      ...(readLineOffset !== undefined ? { readLineOffset } : {}),
      inspectFirst: true,
      verifyAfterEdit: false,
      usedRestoredState,
      repairInstruction: normalizedRepairInstruction,
      continuationLineage: ignoredExplicitTargetLineageOrUndefined,
    };
  }

  if (hasContinuationExecutionIntent && primaryTarget?.inWorkspace) {
    if (shouldReturnCrossFileConvergedNoop) {
      return {
        taskKind: "edit-file",
        reason:
          "cross-file continuation already converged; no remaining related targets",
        targetPath: primaryTarget.cleaned,
        inspectFirst: false,
        verifyAfterEdit: false,
        crossFileRepair: true,
        additionalTargetPaths: [],
        crossFileConvergedNoop: true,
        usedRestoredState,
        previousRemainingTargets,
        previousFailedEntries,
        ...(continuationReopenDecision.enabled
          ? {
              degradedReopen: true,
              degradedReopenReason: continuationReopenDecision.reason,
              degradedReopenCandidates: continuationReopenDecision.candidates,
              degradedReopenCandidateSource:
                continuationReopenDecision.candidateSourceSummary,
              degradedReopenCandidatePruned:
                continuationReopenDecision.prunedCandidateSummary,
            }
          : {}),
      };
    }
    return {
      taskKind: hasCreateIntent ? "write-file" : "edit-file",
      reason: allowCrossFileUltraWeakAutoContinuation
        ? "cross-file ultra-weak follow-up auto-activated from single recoverable continuation target"
        : hasEditFailureRepairPayload && editFailureRepairContext
          ? `single-file edit failure follow-up reused ${editFailureRepairContext.failureReason} context`
          : usedRestoredState
            ? "continuation edit/write target resolved from restored session state"
            : hasCreateIntent
              ? "write intent with explicit target"
              : "edit/repair intent with explicit target",
      targetPath: primaryTarget.cleaned,
      inspectFirst: !hasCreateIntent,
      verifyAfterEdit: hasVerifyIntent,
      ...(effectiveVerifyCommand
        ? { verifyCommand: effectiveVerifyCommand }
        : {}),
      ...(hasWeakRepairFollowUp ? { continuationRepairReplan: true } : {}),
      ...(avoidPreviousDirection ? { avoidPreviousDirection: true } : {}),
      ...(failedTransforms.length > 0 ? { failedTransforms } : {}),
      ...(shouldCoordinateCrossFileRepair
        ? {
            crossFileRepair: true,
            additionalTargetPaths: crossFileCandidates,
          }
        : {}),
      ...(effectiveReplaceDirective
        ? {
            replaceFrom: effectiveReplaceDirective.from,
            replaceTo: effectiveReplaceDirective.to,
          }
        : {}),
      continuationLineage: [
        `continuation-intent:${continuationIntent.kind}`,
        ...(lineageActivationEvidence ?? []),
        ...(replaySafeLineage.verificationHint?.command &&
        hasVerifyLineageHint &&
        continuityTargetPath === primaryTarget.cleaned
          ? [`verify-command-hint:${replaySafeLineage.verificationHint.command}`]
          : []),
      ],
      ...(hasEditFailureRepairPayload &&
      editFailureRepairContext &&
      editFailureRepairPayloadKind
        ? {
            repairContextUsed: true,
            repairedFailureReason: editFailureRepairContext.failureReason,
            repairedTargetFile: primaryTarget.cleaned,
            repairPayloadKind: editFailureRepairPayloadKind,
          }
        : {}),
      ...(hasEditFailureRepairLikePayload && editFailureRepairContextAbandonment
        ? {
            repairContextAbandoned: true,
            repairContextAbandonedReason:
              editFailureRepairContextAbandonment.reason,
            repairContextAbandonedFailureReason:
              editFailureRepairContextAbandonment.failureReason,
            repairContextAbandonedTargetCount:
              editFailureRepairContextAbandonment.failedTargetCandidates.length,
          }
        : {}),
      ...(!hasCreateIntent ? mutationScopeFields : {}),
      ...(!hasCreateIntent ? mutationScopeRequiredFields : {}),
      usedRestoredState,
      previousRemainingTargets,
      previousFailedEntries,
      ...(continuationReopenDecision.enabled
        ? {
            degradedReopen: true,
            degradedReopenReason: continuationReopenDecision.reason,
            degradedReopenCandidates: continuationReopenDecision.candidates,
            degradedReopenCandidateSource:
              continuationReopenDecision.candidateSourceSummary,
            degradedReopenCandidatePruned:
              continuationReopenDecision.prunedCandidateSummary,
          }
        : {}),
    };
  }

  if (
    hasDiagnosisIntent &&
    !hasExecutionIntent &&
    !hasGroundedReadLikeIntent &&
    !(
      lastTaskWasReadLike &&
      (effectiveGroundedDeliverableMode ||
        hasAnswerRepairCue ||
        isAmbiguousRepairFollowUp)
    )
  ) {
    return {
      taskKind: "repo-explain",
      reason: "repo diagnosis intent",
      targetPath: primaryTarget?.inWorkspace
        ? primaryTarget.cleaned
        : undefined,
      inspectFirst: true,
      verifyAfterEdit: false,
      usedRestoredState,
    };
  }

  if (editExpectationContract.reasonCode === "unsupported-discovery-edit") {
    return {
      taskKind: "edit-file",
      reason: "discovery edit is outside current write/edit contract",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason: `Discovery edit is unsupported in the current bounded edit contract. ${editExpectationContract.doNext}`,
      targetMissing: true,
      usedRestoredState,
    };
  }

  if (hasExecutionIntent && unsupportedCommand) {
    return {
      taskKind: "run-command",
      reason: "execution intent outside allowlist",
      inspectFirst: false,
      verifyAfterEdit: false,
      directCommand: unsupportedCommand,
      blockedReason: blockedCommandReason(unsupportedCommand),
      usedRestoredState,
    };
  }

  if (hasExecutionIntent) {
    const command = detectCommand(normalized);
    return {
      taskKind: "run-command",
      reason: "explicit run-command intent",
      inspectFirst: false,
      verifyAfterEdit: false,
      directCommand: command,
      ...(isAllowlistedRunCommand(command)
        ? {}
        : { blockedReason: blockedCommandReason(command) }),
      usedRestoredState,
    };
  }

  if (hasWriteTaskIntent || hasEditIntent) {
    if (!primaryTarget) {
      return {
        taskKind: hasWriteTaskIntent ? "write-file" : "edit-file",
        reason: "write/edit intent without resolvable target",
        inspectFirst: !hasWriteTaskIntent,
        verifyAfterEdit: hasVerifyIntent,
        ...(effectiveVerifyCommand
          ? { verifyCommand: effectiveVerifyCommand }
          : {}),
        blockedReason: hasWriteTaskIntent
          ? `Target file is required for write task. ${editExpectationContract.doNext}`
          : formatEditExecutionFailure({
              failureReason: "edit-target-missing",
              explanation:
                "The edit request did not identify one unique in-workspace target file.",
              nextAction:
                "Rerun with exactly one target file path, for example: Edit src/example.ts and replace '<current text>' with '<desired text>'.",
            }),
        targetMissing: true,
        ...(effectiveReplaceDirective
          ? {
              replaceFrom: effectiveReplaceDirective.from,
              replaceTo: effectiveReplaceDirective.to,
            }
          : {}),
        usedRestoredState,
      };
    }

    if (!primaryTarget.inWorkspace) {
      return {
        taskKind: hasWriteTaskIntent ? "write-file" : "edit-file",
        reason: "target resolved outside workspace",
        inspectFirst: !hasWriteTaskIntent,
        verifyAfterEdit: hasVerifyIntent,
        ...(effectiveVerifyCommand
          ? { verifyCommand: effectiveVerifyCommand }
          : {}),
        targetPath: primaryTarget.cleaned,
        blockedReason:
          "Resolved target is outside current workspace. Attach/switch project or provide an in-workspace path.",
        usedRestoredState,
      };
    }

    if (
      hasEditIntent &&
      !effectiveReplaceDirective &&
      !extractFencedContent(prompt) &&
      !extractLowRiskRenameRefactor(prompt)
    ) {
      return {
        taskKind: "edit-file",
        reason: "edit intent needs targeted context planning before mutation",
        targetPath: primaryTarget.cleaned,
        inspectFirst: false,
        verifyAfterEdit: false,
        blockedReason: formatEditExecutionFailure({
          failureReason: "edit-transform-unclear",
          explanation:
            "Missing concrete edit transform. A targeted context packet is required before planning this edit.",
          nextAction:
            "Inspect suggested reads and rerun with an exact replacement or confirmed proposal.",
        }),
        targetMissing: false,
        contextPlanningRequested: true,
        contextPlanningReason: "missing-edit-context",
        usedRestoredState,
      };
    }

    return {
      taskKind: hasWriteTaskIntent ? "write-file" : "edit-file",
      reason: hasWriteTaskIntent
        ? "write intent with explicit target"
        : "edit intent with explicit target",
      targetPath: primaryTarget.cleaned,
      inspectFirst: !hasWriteTaskIntent,
      verifyAfterEdit: hasVerifyIntent,
      ...(effectiveVerifyCommand
        ? { verifyCommand: effectiveVerifyCommand }
        : {}),
      ...(effectiveReplaceDirective
        ? {
            replaceFrom: effectiveReplaceDirective.from,
            replaceTo: effectiveReplaceDirective.to,
          }
        : {}),
      ...(!hasCreateIntent ? mutationScopeFields : {}),
      ...(!hasCreateIntent ? mutationScopeRequiredFields : {}),
      usedRestoredState,
      continuationLineage: ignoredExplicitTargetLineageOrUndefined,
    };
  }

  if (hasFileReadIntent && primaryTarget?.inWorkspace) {
    return {
      taskKind: "read-file",
      reason: "read/inspect intent with explicit target",
      targetPath: primaryTarget.cleaned,
      groundedDeliverableMode: effectiveGroundedDeliverableMode ?? "read",
      ...(readLineCount !== undefined ? { readLineCount } : {}),
      ...(readLineOffset !== undefined ? { readLineOffset } : {}),
      ...(shouldBuildContextPlanningSurface(prompt)
        ? {
            contextPlanningRequested: true,
            contextPlanningReason: "explicit-context-packet" as const,
          }
        : {}),
      inspectFirst: true,
      verifyAfterEdit: false,
      usedRestoredState,
      repairInstruction: normalizedRepairInstruction,
      continuationLineage: ignoredExplicitTargetLineageOrUndefined,
    };
  }

  if (
    hasImplicitPathOnlyReadIntent &&
    primaryTarget?.inWorkspace &&
    !hasEditIntent &&
    !hasCreateIntent &&
    !hasExecutionIntent
  ) {
    return {
      taskKind: "read-file",
      reason: "path-only prompt resolved as grounded read",
      targetPath: primaryTarget.cleaned,
      groundedDeliverableMode: "read",
      ...(readLineCount !== undefined ? { readLineCount } : {}),
      inspectFirst: true,
      verifyAfterEdit: false,
      usedRestoredState,
    };
  }

  if ((hasSummarizeIntent || hasExplainIntent) && primaryTarget?.inWorkspace) {
    const effectiveRepairInstruction = hasLocalExplainCue
      ? { ...normalizedRepairInstruction, targetMode: "explain" as const }
      : normalizedRepairInstruction;
    return {
      taskKind: "read-file",
      reason: "summarize/explain intent with explicit target",
      targetPath: primaryTarget.cleaned,
      groundedDeliverableMode:
        (hasLocalExplainCue ? "explain" : effectiveGroundedDeliverableMode) ??
        (hasExplainIntent ? "explain" : "summary"),
      ...(readLineCount !== undefined ? { readLineCount } : {}),
      ...(readLineOffset !== undefined ? { readLineOffset } : {}),
      ...(shouldBuildContextPlanningSurface(prompt)
        ? {
            contextPlanningRequested: true,
            contextPlanningReason: "explicit-context-packet" as const,
          }
        : {}),
      ...(hasLocalExplainCue && readFragmentDirective.lineIndexes?.length
        ? { readFragmentLineIndexes: readFragmentDirective.lineIndexes }
        : {}),
      ...(hasLocalExplainCue && readFragmentDirective.ranges?.length
        ? { readFragmentRanges: readFragmentDirective.ranges }
        : {}),
      ...(hasLocalExplainCue &&
      readFragmentDirective.sourceWindowStart !== undefined
        ? {
            readFragmentSourceWindowStart:
              readFragmentDirective.sourceWindowStart,
          }
        : {}),
      ...(hasLocalExplainCue &&
      readFragmentDirective.sourceWindowEnd !== undefined
        ? { readFragmentSourceWindowEnd: readFragmentDirective.sourceWindowEnd }
        : {}),
      ...(hasLocalExplainCue && readFragmentDirective.fingerprint
        ? { readFragmentFingerprint: readFragmentDirective.fingerprint }
        : {}),
      ...(hasLocalExplainCue && readFragmentDirective.filter
        ? { readFilter: readFragmentDirective.filter }
        : {}),
      inspectFirst: true,
      verifyAfterEdit: false,
      usedRestoredState,
      repairInstruction: effectiveRepairInstruction,
    };
  }

  if (hasFileReadIntent) {
    if (hasTargetedFileReadIntent && !hasRepositoryInspectIntent) {
      const targetStop = projectReadMissingTargetStop({
        reason:
          "I can read the file, but I still need an explicit in-workspace file path.",
        doNext: "Provide an explicit in-workspace file path.",
      });
      return {
        taskKind: "read-file",
        reason: "targeted read intent requires explicit readable target",
        inspectFirst: true,
        verifyAfterEdit: false,
        blockedReason: targetStop.reason,
        targetMissing: true,
        usedRestoredState,
      };
    }
    return {
      taskKind: "inspect-files",
      reason: "read/inspect intent without explicit in-workspace target",
      inspectFirst: true,
      verifyAfterEdit: false,
      usedRestoredState,
    };
  }

  return {
    taskKind: "chat",
    reason: "no deterministic inspect/edit/verify contract detected",
    inspectFirst: false,
    verifyAfterEdit: false,
    usedRestoredState,
  };
}

function shouldBuildContextPlanningSurface(prompt: string): boolean {
  return /\b(?:context packet|targeted context|planning context|related files|related tests|suggested reads|missing context|plan(?:ning)? surface|analysis brief|execution plan|analy[sz]e|plan)\b/i.test(
    prompt,
  );
}

function removeNegatedMutationInstructions(prompt: string): string {
  return prompt
    .replace(
      /\b(?:do\s+not|don't|dont|never)\s+(?:edit|modify|change|touch|update|write|replace|fix)\b[^.!?\n]*(?:[.!?]|$)/gi,
      " ",
    )
    .replace(
      /\bno\s+(?:edits?|modifications?|changes?|writes?|replacements?|fixes?)\b[^.!?\n]*(?:[.!?]|$)/gi,
      " ",
    );
}

function extractWorkflowTaskIntentSignals(
  prompt: string,
  continuity: ContinuityStateLike,
): WorkflowTaskIntentSignals {
  const normalized = prompt.toLowerCase();
  const intentPrompt = stripPathTokensForIntent(prompt);
  const groundedIntentPrompt = intentPrompt.length > 0 ? intentPrompt : prompt;
  const hasContextSeedPrefix =
    /^\s*(?:previous|prior|last)\s+task\s+context\s*:/i.test(prompt);
  const hasExplicitBoundaryResetPrompt =
    /\b(?:do\s+not|don't|not)\s+continue\s+(?:the\s+)?old\s+edit\b/i.test(
      prompt,
    ) || /\bboundary\s+reset\b/i.test(prompt);
  const readInspectIntent = classifyReadInspectRequest(groundedIntentPrompt);
  const hasFileReadIntent = readInspectIntent.hasFileReadIntent;
  const hasTargetedFileReadIntent =
    readInspectIntent.hasTargetedFileReadIntent;
  const hasRepositoryInspectIntent =
    readInspectIntent.hasRepositoryInspectIntent;
  const hasSummarizeIntent =
    /(?:summari[sz]e|summary|\u603b\u7ed3|\u6458\u8981|\u6982\u8ff0)/i.test(
      groundedIntentPrompt,
    );
  const hasExplainIntent =
    /(?:\bexplain\b|what .* does|\u89e3\u91ca|\u5728\u505a\u4ec0\u4e48)/i.test(
      groundedIntentPrompt,
    );
  const workflowIntentProjection = projectWorkflowIntent(
    groundedIntentPrompt,
    continuity,
  );
  const hasReflectiveExplainStateQuestion =
    workflowIntentProjection.hasReflectiveExplainStateQuestion;
  const hasReflectiveExplainContinuation =
    isReflectiveExplainContinuationPrompt(groundedIntentPrompt);
  const hasReflectiveExplainQuery =
    hasReflectiveExplainStateQuestion || hasReflectiveExplainContinuation;
  const detectedReflectiveStateQueryKind =
    workflowIntentProjection.detectedReflectiveStateQueryKind;
  const reflectiveStateQueryKind =
    workflowIntentProjection.reflectiveStateQueryKind;
  const hasReflectiveActionCue =
    workflowIntentProjection.hasReflectiveActionCue;
  const hasPriorLocalExplainEvidence =
    hasWorkflowLocalExplainEvidence(continuity);
  const hasRecoverableReadFragmentEvidence =
    hasWorkflowReadFragmentEvidence(continuity);
  const hasLocalExplainCue =
    hasExplainIntent &&
    (hasLocalSliceExplainCue(groundedIntentPrompt) ||
      (hasReflectiveExplainContinuation &&
        (hasPriorLocalExplainEvidence || hasRecoverableReadFragmentEvidence)));
  const hasGroundedReadLikeIntent =
    hasFileReadIntent || hasSummarizeIntent || hasExplainIntent;
  const hasGroundedConstraintCue =
    parseGroundedRepairConstraints(groundedIntentPrompt) !== undefined;
  const hasCreateIntent =
    /(?:create|new file|\u65b0\u589e|\u521b\u5efa|\u65b0\u5efa|\u5199\u4e00\u4e2a)/i.test(
      intentPrompt,
    );
  const mutationIntentPrompt = removeNegatedMutationInstructions(intentPrompt);
  const hasEditIntentRaw =
    /(?:\bedit\b|modify|update|fix|change|repair|replace|swap|\badd\b|\binsert\b|\bappend\b|continue fixing|continue repairing|\u4fee\u6539|\u4fee\u590d|\u6539\u4e00\u4e0b|\u6539\u6210|\u6539\u4e3a|\u66ff\u6362|\u66ff\u6362\u4e3a|\u7ee7\u7eed\u4fee)/i.test(
      mutationIntentPrompt,
    );
  const hasEditIntent =
    hasEditIntentRaw &&
    !hasContextSeedPrefix &&
    !hasExplicitBoundaryResetPrompt;
  const hasVerifyIntent =
    /(?:verify|test|build|lint|check|\u9a8c\u8bc1|\u6d4b\u8bd5|\u6784\u5efa|\u7f16\u8bd1|\u68c0\u67e5)/i.test(
      intentPrompt,
    );
  const hasCorrectionCue = isCorrectionFollowUpPrompt(prompt);
  const hasExecutionCorrectionCue = isExecutionCorrectionFollowUpPrompt(prompt);
  const hasAnswerRepairCue = isAnswerRepairFollowUpPrompt(prompt);
  const isAmbiguousRepairFollowUp = isAmbiguousGroundedRepairFollowUp(prompt);
  const hasDiagnosisIntent =
    /(?:why|how|where|which file|implemented|\u4e3a\u4ec0\u4e48|\u600e\u4e48|\u5728\u54ea|\u54ea\u4e2a\u6587\u4ef6|\u5b9e\u73b0)/i.test(
      groundedIntentPrompt,
    );
  const hasWeakRepairFollowUp = isWeakRepairFollowUpPrompt(prompt);
  const avoidPreviousDirection = isAvoidPreviousDirectionPrompt(prompt);
  const hasCrossFileCue = isCrossFileRepairFollowUpPrompt(prompt);
  const hasVerifyContinuationCue = isVerifyContinuationFollowUpPrompt(prompt);
  const verifyCommand = hasExternalVerifyOptOut(prompt)
    ? undefined
    : detectVerifyCommand(normalized);
  const preferTestOverBuild = prefersTestOverBuildInFollowUp(prompt);
  const effectiveVerifyCommand =
    preferTestOverBuild && hasVerifyIntent
      ? "npm test -- --help"
      : verifyCommand;
  const effectiveReplaceDirectiveFromPrompt = extractReplaceDirective(prompt);
  const hasExecutionIntent = hasExplicitExecutionIntent(prompt, normalized);
  const unsupportedCommand = detectUnsupportedCommandIntent(normalized);

  return {
    normalized,
    intentPrompt,
    groundedIntentPrompt,
    hasContextSeedPrefix,
    hasExplicitBoundaryResetPrompt,
    hasFileReadIntent,
    hasTargetedFileReadIntent,
    hasRepositoryInspectIntent,
    hasSummarizeIntent,
    hasExplainIntent,
    hasReflectiveExplainStateQuestion,
    hasReflectiveExplainContinuation,
    hasReflectiveExplainQuery,
    detectedReflectiveStateQueryKind,
    reflectiveStateQueryKind,
    hasReflectiveActionCue,
    hasPriorLocalExplainEvidence,
    hasRecoverableReadFragmentEvidence,
    hasLocalExplainCue,
    hasGroundedReadLikeIntent,
    hasGroundedConstraintCue,
    hasCreateIntent,
    hasEditIntentRaw,
    hasEditIntent,
    hasVerifyIntent,
    hasCorrectionCue,
    hasExecutionCorrectionCue,
    hasAnswerRepairCue,
    isAmbiguousRepairFollowUp,
    hasDiagnosisIntent,
    hasWeakRepairFollowUp,
    avoidPreviousDirection,
    hasCrossFileCue,
    hasVerifyContinuationCue,
    verifyCommand,
    preferTestOverBuild,
    effectiveVerifyCommand,
    effectiveReplaceDirectiveFromPrompt,
    hasExecutionIntent,
    unsupportedCommand,
  };
}

function extractInlineContinuityContext(prompt: string): {
  cleanPrompt: string;
  inlineState: ContinuityStateLike;
} {
  const match = prompt.match(
    /\[FOLLOW-UP CONTINUITY CONTEXT\]([\s\S]*?)\[END CONTINUITY CONTEXT\]/i,
  );
  if (!match) {
    return {
      cleanPrompt: prompt,
      inlineState: {},
    };
  }

  const block = match[1] ?? "";
  const inlineState: ContinuityStateLike = {};
  const targetMatch = block.match(/recent-target-files:\s*(.+)/i);
  if (targetMatch?.[1]) {
    inlineState.recentTargetFiles = targetMatch[1]
      .split(",")
      .map((entry) => normalizePathLike(entry.trim()))
      .filter((entry) => entry.length > 0);
  }
  const failedMatch = block.match(/recent-failed-files:\s*(.+)/i);
  if (failedMatch?.[1]) {
    inlineState.recentFailedFiles = failedMatch[1]
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => ({
        path: normalizePathLike((entry.split("(")[0] ?? entry).trim()),
        reason: entry,
      }));
  }
  const evidenceMatch = block.match(/last-continuation-evidence:\s*(.+)/i);
  if (evidenceMatch?.[1]) {
    inlineState.lastContinuationEvidence = evidenceMatch[1]
      .split("|")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  const deliverableModeMatch = block.match(
    /last-grounded-deliverable-mode:\s*(.+)/i,
  );
  if (deliverableModeMatch?.[1]) {
    const mode = deliverableModeMatch[1].trim().toLowerCase();
    if (mode === "read" || mode === "summary" || mode === "explain") {
      inlineState.lastGroundedDeliverableMode = mode;
    }
  }
  const deliveredLinesMatch = block.match(
    /last-read-delivered-lines:\s*(\d+)/i,
  );
  if (deliveredLinesMatch?.[1]) {
    const parsed = Number.parseInt(deliveredLinesMatch[1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      inlineState.lastReadDeliveredLines = parsed;
    }
  }
  const readWindowStartMatch = block.match(/last-read-window-start:\s*(\d+)/i);
  if (readWindowStartMatch?.[1]) {
    const parsed = Number.parseInt(readWindowStartMatch[1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      inlineState.lastReadWindowStart = parsed;
    }
  }
  const readWindowEndMatch = block.match(/last-read-window-end:\s*(\d+)/i);
  if (readWindowEndMatch?.[1]) {
    const parsed = Number.parseInt(readWindowEndMatch[1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      inlineState.lastReadWindowEnd = parsed;
    }
  }
  const readWindowSizeMatch = block.match(/last-read-window-size:\s*(\d+)/i);
  if (readWindowSizeMatch?.[1]) {
    const parsed = Number.parseInt(readWindowSizeMatch[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      inlineState.lastReadWindowSize = parsed;
    }
  }
  const readFragmentStartMatch = block.match(
    /last-read-fragment-start:\s*(\d+)/i,
  );
  if (readFragmentStartMatch?.[1]) {
    const parsed = Number.parseInt(readFragmentStartMatch[1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      inlineState.lastReadFragmentStart = parsed;
    }
  }
  const readFragmentEndMatch = block.match(/last-read-fragment-end:\s*(\d+)/i);
  if (readFragmentEndMatch?.[1]) {
    const parsed = Number.parseInt(readFragmentEndMatch[1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      inlineState.lastReadFragmentEnd = parsed;
    }
  }
  const readFragmentIndexesMatch = block.match(
    /last-read-fragment-line-indexes:\s*([0-9,\s]+)/i,
  );
  if (readFragmentIndexesMatch?.[1]) {
    const parsed = normalizeReadFragmentLineIndexes(
      readFragmentIndexesMatch[1]
        .split(",")
        .map((value) => Number.parseInt(value.trim(), 10)),
    );
    if (parsed.length > 0) {
      inlineState.lastReadFragmentLineIndexes = parsed;
    }
  }
  const readFragmentRangesMatch = block.match(
    /last-read-fragment-ranges:\s*([0-9;,\s-]+)/i,
  );
  if (readFragmentRangesMatch?.[1]) {
    const ranges = readFragmentRangesMatch[1]
      .split(";")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    if (ranges.length > 0) {
      inlineState.lastReadFragmentRanges = ranges;
    }
  }
  const readFragmentSourceStartMatch = block.match(
    /last-read-fragment-source-window-start:\s*(\d+)/i,
  );
  if (readFragmentSourceStartMatch?.[1]) {
    const parsed = Number.parseInt(readFragmentSourceStartMatch[1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      inlineState.lastReadFragmentSourceWindowStart = parsed;
    }
  }
  const readFragmentSourceEndMatch = block.match(
    /last-read-fragment-source-window-end:\s*(\d+)/i,
  );
  if (readFragmentSourceEndMatch?.[1]) {
    const parsed = Number.parseInt(readFragmentSourceEndMatch[1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      inlineState.lastReadFragmentSourceWindowEnd = parsed;
    }
  }
  const readFilterMatch = block.match(
    /last-read-filter:\s*(none|function-definitions)/i,
  );
  if (readFilterMatch?.[1]) {
    inlineState.lastReadFilter = readFilterMatch[1].trim().toLowerCase() as
      | "none"
      | "function-definitions";
  }
  const readFragmentFingerprintMatch = block.match(
    /last-read-fragment-fingerprint:\s*([0-9a-f]{64})/i,
  );
  if (readFragmentFingerprintMatch?.[1]) {
    inlineState.lastReadFragmentFingerprint = readFragmentFingerprintMatch[1]
      .trim()
      .toLowerCase();
  }
  const stagedStepCountMatch = block.match(
    /last-staged-repair-steps:\s*(\d+)/i,
  );
  if (stagedStepCountMatch?.[1]) {
    const parsed = Number.parseInt(stagedStepCountMatch[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      inlineState.lastStagedRepairStepCount = parsed;
    }
  }
  const stagedCompletedStepMatch = block.match(
    /last-staged-repair-completed-step:\s*(\d+)/i,
  );
  if (stagedCompletedStepMatch?.[1]) {
    const parsed = Number.parseInt(stagedCompletedStepMatch[1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      inlineState.lastStagedRepairCompletedStep = parsed;
    }
  }
  const stagedBlockedStepMatch = block.match(
    /last-staged-repair-blocked-step:\s*(\d+)/i,
  );
  if (stagedBlockedStepMatch?.[1]) {
    const parsed = Number.parseInt(stagedBlockedStepMatch[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      inlineState.lastStagedRepairBlockedStep = parsed;
    }
  }
  const stagedNextStepMatch = block.match(
    /last-staged-repair-next-step:\s*(\d+)/i,
  );
  if (stagedNextStepMatch?.[1]) {
    const parsed = Number.parseInt(stagedNextStepMatch[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      inlineState.lastStagedRepairNextStep = parsed;
    }
  }
  const answerDefectMatch = block.match(/last-answer-defect:\s*(.+)/i);
  if (answerDefectMatch?.[1]) {
    const defect = answerDefectMatch[1].trim();
    if (defect.length > 0) {
      inlineState.lastAnswerDefect = defect;
    }
  }
  const lastFailureMatch = block.match(/last-failure:\s*(.+)/i);
  if (lastFailureMatch?.[1]) {
    const failure = lastFailureMatch[1].trim();
    if (failure.length > 0) {
      inlineState.lastFailure = failure;
    }
  }
  const lastVerificationCommandMatch = block.match(
    /last-verification-command:\s*(.+)/i,
  );
  if (lastVerificationCommandMatch?.[1]) {
    const command = lastVerificationCommandMatch[1].trim();
    if (command.length > 0) {
      inlineState.lastVerificationCommand = command;
    }
  }
  const lastVerificationReasonMatch = block.match(
    /last-verification-reason:\s*(.+)/i,
  );
  if (lastVerificationReasonMatch?.[1]) {
    const reason = lastVerificationReasonMatch[1].trim();
    if (reason.length > 0) {
      inlineState.lastVerificationReason = reason;
    }
  }
  const lastVerificationBlockerKindMatch = block.match(
    /last-verification-blocker-kind:\s*(.+)/i,
  );
  if (lastVerificationBlockerKindMatch?.[1]) {
    const kind = lastVerificationBlockerKindMatch[1].trim();
    if (kind.length > 0) {
      inlineState.lastVerificationBlockerKind = kind;
    }
  }
  const lastVerificationNextActionMatch = block.match(
    /last-verification-next-action:\s*(.+)/i,
  );
  if (lastVerificationNextActionMatch?.[1]) {
    const nextAction = lastVerificationNextActionMatch[1].trim();
    if (nextAction.length > 0) {
      inlineState.lastVerificationNextAction = nextAction;
    }
  }
  const lastVerificationResumeEligibleMatch = block.match(
    /last-verification-resume-eligible:\s*(.+)/i,
  );
  if (lastVerificationResumeEligibleMatch?.[1]) {
    const normalized = lastVerificationResumeEligibleMatch[1]
      .trim()
      .toLowerCase();
    if (["yes", "true", "1"].includes(normalized)) {
      inlineState.lastVerificationResumeEligible = true;
    } else if (["no", "false", "0"].includes(normalized)) {
      inlineState.lastVerificationResumeEligible = false;
    }
  }
  const lastApprovalDecisionMatch = block.match(
    /last-approval-decision:\s*(.+)/i,
  );
  if (lastApprovalDecisionMatch?.[1]) {
    const decision = lastApprovalDecisionMatch[1].trim().toLowerCase();
    if (
      decision === "deny" ||
      decision === "allow-once" ||
      decision === "allow-always"
    ) {
      inlineState.lastApprovalDecision = decision;
    }
  }
  const lastApprovalDecisionSourceMatch = block.match(
    /last-approval-decision-source:\s*(.+)/i,
  );
  if (lastApprovalDecisionSourceMatch?.[1]) {
    const source = lastApprovalDecisionSourceMatch[1].trim();
    if (source.length > 0) {
      inlineState.lastApprovalDecisionSource = source;
    }
  }
  const lastApprovalPersistentMatch = block.match(
    /last-approval-persistent:\s*(.+)/i,
  );
  if (lastApprovalPersistentMatch?.[1]) {
    const normalized = lastApprovalPersistentMatch[1].trim().toLowerCase();
    if (["yes", "true", "1"].includes(normalized)) {
      inlineState.lastApprovalPersistent = true;
    } else if (["no", "false", "0"].includes(normalized)) {
      inlineState.lastApprovalPersistent = false;
    }
  }
  const lastApprovalCacheEffectMatch = block.match(
    /last-approval-cache-effect:\s*(.+)/i,
  );
  if (lastApprovalCacheEffectMatch?.[1]) {
    const cacheEffect = lastApprovalCacheEffectMatch[1].trim();
    if (cacheEffect.length > 0) {
      inlineState.lastApprovalCacheEffect = cacheEffect;
    }
  }
  const lastApprovalProjectRootMatch = block.match(
    /last-approval-project-root:\s*(.+)/i,
  );
  if (lastApprovalProjectRootMatch?.[1]) {
    const approvalRoot = lastApprovalProjectRootMatch[1].trim();
    if (approvalRoot.length > 0) {
      inlineState.lastApprovalProjectRoot = approvalRoot;
    }
  }
  const lastApprovalCacheKeyMatch = block.match(
    /last-approval-cache-key:\s*(.+)/i,
  );
  if (lastApprovalCacheKeyMatch?.[1]) {
    const cacheKey = lastApprovalCacheKeyMatch[1].trim();
    if (cacheKey.length > 0) {
      inlineState.lastApprovalCacheKey = cacheKey;
    }
  }
  const lastApprovalScopeMatch = block.match(/last-approval-scope:\s*(.+)/i);
  if (lastApprovalScopeMatch?.[1]) {
    const scope = lastApprovalScopeMatch[1].trim();
    if (scope.length > 0) {
      inlineState.lastApprovalScope = scope;
    }
  }
  const lastApprovalLineageMatch = block.match(
    /last-approval-lineage:\s*(.+)/i,
  );
  if (lastApprovalLineageMatch?.[1]) {
    const lineage = lastApprovalLineageMatch[1].trim();
    if (lineage.length > 0) {
      inlineState.lastApprovalLineage = lineage;
    }
  }
  const lastApprovalChannelMatch = block.match(
    /last-approval-channel:\s*(.+)/i,
  );
  if (lastApprovalChannelMatch?.[1]) {
    const channel = lastApprovalChannelMatch[1].trim().toLowerCase();
    if (channel === "interactive" || channel === "non-interactive") {
      inlineState.lastApprovalChannel = channel;
    }
  }
  const lastApprovalInputKeyMatch = block.match(
    /last-approval-input-key:\s*(.+)/i,
  );
  if (lastApprovalInputKeyMatch?.[1]) {
    const inputKey = lastApprovalInputKeyMatch[1].trim().toLowerCase();
    if (
      inputKey === "y" ||
      inputKey === "a" ||
      inputKey === "n" ||
      inputKey === "other"
    ) {
      inlineState.lastApprovalInputKey = inputKey;
    }
  }
  const lastApprovalStopReasonMatch = block.match(
    /last-approval-stop-reason:\s*(.+)/i,
  );
  if (lastApprovalStopReasonMatch?.[1]) {
    const stopReason = lastApprovalStopReasonMatch[1].trim();
    if (stopReason.length > 0) {
      inlineState.lastApprovalStopReason = stopReason;
    }
  }
  const lastApprovalRecordedAtMatch = block.match(
    /last-approval-recorded-at:\s*(.+)/i,
  );
  if (lastApprovalRecordedAtMatch?.[1]) {
    const recordedAt = lastApprovalRecordedAtMatch[1].trim();
    if (recordedAt.length > 0) {
      inlineState.lastApprovalRecordedAt = recordedAt;
    }
  }
  const lastPermissionRequestToolMatch = block.match(
    /last-permission-request-tool:\s*(.+)/i,
  );
  if (lastPermissionRequestToolMatch?.[1]) {
    const tool = lastPermissionRequestToolMatch[1].trim().toLowerCase();
    if (tool.length > 0) {
      inlineState.lastPermissionRequestToolName = tool;
    }
  }
  const lastPermissionRequestOperationMatch = block.match(
    /last-permission-request-operation:\s*(.+)/i,
  );
  if (lastPermissionRequestOperationMatch?.[1]) {
    const operation = lastPermissionRequestOperationMatch[1]
      .trim()
      .toLowerCase();
    if (operation.length > 0) {
      inlineState.lastPermissionRequestOperation = operation;
    }
  }
  const lastPermissionRequestTargetMatch = block.match(
    /last-permission-request-target:\s*(.+)/i,
  );
  if (lastPermissionRequestTargetMatch?.[1]) {
    const target = lastPermissionRequestTargetMatch[1].trim();
    if (target.length > 0) {
      inlineState.lastPermissionRequestTarget = target;
    }
  }
  const lastPermissionRequestProcessMatch = block.match(
    /last-permission-request-process:\s*(.+)/i,
  );
  if (lastPermissionRequestProcessMatch?.[1]) {
    const process = lastPermissionRequestProcessMatch[1].trim().toLowerCase();
    if (process.length > 0) {
      inlineState.lastPermissionRequestProcess = process;
    }
  }
  const lastPermissionRequestScopeKeyMatch = block.match(
    /last-permission-request-scope-key:\s*(.+)/i,
  );
  if (lastPermissionRequestScopeKeyMatch?.[1]) {
    const scopeKey = lastPermissionRequestScopeKeyMatch[1].trim().toLowerCase();
    if (scopeKey.length > 0) {
      inlineState.lastPermissionRequestScopeKey = scopeKey;
    }
  }
  const lastPermissionRequestScopeLabelMatch = block.match(
    /last-permission-request-scope-label:\s*(.+)/i,
  );
  if (lastPermissionRequestScopeLabelMatch?.[1]) {
    const scopeLabel = lastPermissionRequestScopeLabelMatch[1].trim();
    if (scopeLabel.length > 0) {
      inlineState.lastPermissionRequestScopeLabel = scopeLabel;
    }
  }
  const lastPermissionRequestCacheKeyMatch = block.match(
    /last-permission-request-cache-key:\s*(.+)/i,
  );
  if (lastPermissionRequestCacheKeyMatch?.[1]) {
    const cacheKey = lastPermissionRequestCacheKeyMatch[1].trim();
    if (cacheKey.length > 0) {
      inlineState.lastPermissionRequestCacheKey = cacheKey;
    }
  }
  const lastPermissionRequestProjectRootMatch = block.match(
    /last-permission-request-project-root:\s*(.+)/i,
  );
  if (lastPermissionRequestProjectRootMatch?.[1]) {
    const root = lastPermissionRequestProjectRootMatch[1].trim();
    if (root.length > 0) {
      inlineState.lastPermissionRequestProjectRoot = root;
    }
  }
  const lastPermissionRequestSourceMatch = block.match(
    /last-permission-request-source:\s*(.+)/i,
  );
  if (lastPermissionRequestSourceMatch?.[1]) {
    const source = lastPermissionRequestSourceMatch[1].trim().toLowerCase();
    if (source === "verification-command" || source === "approval-request") {
      inlineState.lastPermissionRequestSource = source;
    }
  }
  const lastPermissionRequestLineageMatch = block.match(
    /last-permission-request-lineage:\s*(.+)/i,
  );
  if (lastPermissionRequestLineageMatch?.[1]) {
    const lineage = lastPermissionRequestLineageMatch[1].trim();
    if (lineage.length > 0) {
      inlineState.lastPermissionRequestLineage = lineage;
    }
  }
  const lastRequestScopeCacheKeyMatch = block.match(
    /last-request-scope-cache-key:\s*(.+)/i,
  );
  if (lastRequestScopeCacheKeyMatch?.[1]) {
    const cacheKey = lastRequestScopeCacheKeyMatch[1].trim();
    if (cacheKey.length > 0) {
      inlineState.lastRequestScopeCacheKey = cacheKey;
    }
  }
  const lastRequestScopeLabelMatch = block.match(
    /last-request-scope-label:\s*(.+)/i,
  );
  if (lastRequestScopeLabelMatch?.[1]) {
    const scope = lastRequestScopeLabelMatch[1].trim();
    if (scope.length > 0) {
      inlineState.lastRequestScopeLabel = scope;
    }
  }
  const lastRequestScopeProjectRootMatch = block.match(
    /last-request-scope-project-root:\s*(.+)/i,
  );
  if (lastRequestScopeProjectRootMatch?.[1]) {
    const root = lastRequestScopeProjectRootMatch[1].trim();
    if (root.length > 0) {
      inlineState.lastRequestScopeProjectRoot = root;
    }
  }
  const lastRequestScopeSourceMatch = block.match(
    /last-request-scope-source:\s*(.+)/i,
  );
  if (lastRequestScopeSourceMatch?.[1]) {
    const source = lastRequestScopeSourceMatch[1].trim().toLowerCase();
    if (source === "verification-command" || source === "approval-request") {
      inlineState.lastRequestScopeSource = source;
    }
  }
  const lastRepairStatusMatch = block.match(/last-repair-status:\s*(.+)/i);
  if (lastRepairStatusMatch?.[1]) {
    const status = lastRepairStatusMatch[1].trim();
    if (status.length > 0) {
      inlineState.lastRepairStatus = status;
    }
  }
  const lastContinuationStatusMatch = block.match(
    /last-continuation-status:\s*(.+)/i,
  );
  if (lastContinuationStatusMatch?.[1]) {
    const status = lastContinuationStatusMatch[1].trim();
    if (status.length > 0) {
      inlineState.lastContinuationStatus = status;
    }
  }

  return {
    cleanPrompt: prompt.replace(match[0], "").trim(),
    inlineState,
  };
}

function resolveSingleFileEditFailureRepairContext(
  continuity: ContinuityStateLike,
  workspaceRoot: string,
):
  | { failureReason: SingleFileEditFailureReason; targetPath?: string }
  | undefined {
  if (continuity.lastTaskKind !== "edit-file") {
    return undefined;
  }

  const failureReason = extractSingleFileEditFailureReason(continuity);
  if (!failureReason) {
    return undefined;
  }

  const targetCandidates = new Set<string>();
  const addCandidate = (rawCandidate: string | undefined): void => {
    const candidate = normalizePathLike(rawCandidate ?? "");
    if (!isUsableContinuationTargetPath(candidate)) {
      return;
    }
    const rebound = rebindContinuationTargetToWorkspace(
      candidate,
      workspaceRoot,
    );
    if (rebound) {
      targetCandidates.add(rebound);
    }
  };

  addCandidate(
    deriveWorkflowContinuationTarget({
      continuity,
      workspaceRoot,
    }),
  );
  for (const entry of continuity.recentFailedFiles ?? []) {
    addCandidate(entry.path);
  }
  for (const entry of continuity.recentTargetFiles ?? []) {
    addCandidate(entry);
  }

  if (failureReason === "edit-target-missing") {
    return {
      failureReason,
      ...(targetCandidates.size === 1
        ? { targetPath: [...targetCandidates][0] }
        : {}),
    };
  }

  if (targetCandidates.size !== 1) {
    return undefined;
  }

  return {
    failureReason,
    targetPath: [...targetCandidates][0],
  };
}

function resolveSingleFileEditFailureRepairContextAbandonment(
  continuity: ContinuityStateLike,
  workspaceRoot: string,
):
  | {
      reason: "multiple-failed-targets";
      failureReason: SingleFileEditFailureReason;
      failedTargetCandidates: readonly string[];
    }
  | undefined {
  if (continuity.lastTaskKind !== "edit-file") {
    return undefined;
  }

  const failureReason = extractSingleFileEditFailureReason(continuity);
  if (!failureReason) {
    return undefined;
  }

  const failedTargetCandidates = new Set<string>();
  for (const entry of continuity.recentFailedFiles ?? []) {
    const candidate = normalizePathLike(entry.path ?? "");
    if (!isUsableContinuationTargetPath(candidate)) {
      continue;
    }
    const rebound = rebindContinuationTargetToWorkspace(
      candidate,
      workspaceRoot,
    );
    if (rebound) {
      failedTargetCandidates.add(rebound);
    }
  }

  if (failedTargetCandidates.size <= 1) {
    return undefined;
  }

  return {
    reason: "multiple-failed-targets",
    failureReason,
    failedTargetCandidates: [...failedTargetCandidates],
  };
}

function extractSingleFileEditFailureReason(
  continuity: ContinuityStateLike,
): SingleFileEditFailureReason | undefined {
  const evidence = [
    continuity.lastFailure ?? "",
    ...(continuity.recentFailedFiles ?? []).flatMap((entry) => [
      entry.path,
      entry.reason,
    ]),
    ...(continuity.lastContinuationEvidence ?? []),
    ...(continuity.unresolvedItems ?? []),
  ].join("\n");
  const match = evidence.match(
    /\b(edit-target-missing|edit-transform-unclear|patch-from-not-found|patch-ambiguous|patch-target-missing)\b/i,
  );
  return match?.[1]?.toLowerCase() as SingleFileEditFailureReason | undefined;
}

function resolveSingleFileEditRepairPayloadKind(input: {
  failureReason: SingleFileEditFailureReason;
  prompt: string;
  hasEditIntent: boolean;
  replaceDirective?: { from: string; to: string };
  fencedContent?: string;
}): SingleFileEditRepairPayloadKind | undefined {
  if (
    input.failureReason === "edit-target-missing" &&
    hasPathLikeReference(input.prompt) &&
    (input.hasEditIntent || input.replaceDirective || input.fencedContent)
  ) {
    return "target-path-with-transform";
  }
  if (input.replaceDirective) {
    return "replace-directive";
  }
  if (input.fencedContent) {
    return "fenced-content";
  }
  return undefined;
}

function rebindContinuationTargetToWorkspace(
  candidatePath: string,
  workspaceRoot: string,
): string | undefined {
  const normalizedCandidate = normalizePathLike(candidatePath ?? "");
  if (!isUsableContinuationTargetPath(normalizedCandidate)) {
    return undefined;
  }
  return rebindPathLikeToWorkspace(normalizedCandidate, workspaceRoot);
}

function isUsableContinuationTargetPath(candidate: string): boolean {
  if (!candidate) {
    return false;
  }
  const lowered = candidate.toLowerCase();
  if (
    lowered === "(missing-target)" ||
    lowered === "(unknown)" ||
    lowered === "(workspace)" ||
    lowered.includes("(missing-target)")
  ) {
    return false;
  }
  return true;
}

function hasCrossFileEvidenceSignalInContinuity(
  continuity: ContinuityStateLike,
): boolean {
  const explicitRemaining = extractCrossFileStateListFromContinuityEvidence(
    continuity,
    "repair-remaining-files:",
  );
  if (explicitRemaining.length > 0) {
    return true;
  }
  if ((continuity.recentFailedFiles?.length ?? 0) > 1) {
    return true;
  }
  const unresolved = (continuity.unresolvedItems ?? [])
    .join(" | ")
    .toLowerCase();
  if (/failed-files:.*[,，]/.test(unresolved)) {
    return true;
  }
  return (continuity.recentChangedFiles?.length ?? 0) > 1;
}

function deriveCrossFileRepairCandidates(
  continuity: ContinuityStateLike,
  primaryTarget?: string,
): string[] {
  if (!primaryTarget) {
    return [];
  }
  const normalizedPrimary = normalizePathLike(primaryTarget);
  const explicitRemaining = extractCrossFileStateListFromContinuityEvidence(
    continuity,
    "repair-remaining-files:",
  ).filter((candidate) => candidate !== normalizedPrimary);
  if (explicitRemaining.length > 0) {
    return explicitRemaining.slice(0, 2);
  }
  const processedFromEvidence = new Set(
    extractProcessedCrossFilePathsFromContinuity(continuity),
  );
  const primaryDir = path.posix.dirname(normalizedPrimary);
  const pool = Array.from(
    new Set([
      ...(continuity.recentFailedFiles ?? []).map((item) =>
        normalizePathLike(item.path),
      ),
      ...(continuity.recentChangedFiles ?? []).map((item) =>
        normalizePathLike(item),
      ),
      ...(continuity.recentTargetFiles ?? []).map((item) =>
        normalizePathLike(item),
      ),
    ]),
  ).filter(
    (item) =>
      item.length > 0 &&
      item !== normalizedPrimary &&
      !processedFromEvidence.has(item),
  );
  const scoreFile = (candidate: string): number => {
    let score = 0;
    if (path.posix.dirname(candidate) === primaryDir) {
      score += 2;
    }
    if (/\b(test|spec)\b|\.test\.|\.spec\./i.test(candidate)) {
      score += 3;
    }
    if (/\b(helper|util|config|map|fixture)\b/i.test(candidate)) {
      score += 2;
    }
    if (candidate.endsWith(".md")) {
      score -= 1;
    }
    return score;
  };
  return pool
    .map((candidate) => ({ candidate, score: scoreFile(candidate) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 2)
    .map((entry) => entry.candidate);
}

function hasCrossFileContinuationContextInContinuity(
  continuity: ContinuityStateLike,
): boolean {
  return (
    extractCrossFileStateListFromContinuityEvidence(
      continuity,
      "repair-candidate-files:",
    ).length > 0 ||
    extractCrossFileStateListFromContinuityEvidence(
      continuity,
      "repair-processed-files:",
    ).length > 0 ||
    extractCrossFileStateListFromContinuityEvidence(
      continuity,
      "repair-remaining-files:",
    ).length > 0 ||
    (continuity.lastContinuationEvidence ?? []).some((entry) =>
      entry.startsWith("repair-cross-file"),
    )
  );
}

function extractProcessedCrossFilePathsFromContinuity(
  continuity: ContinuityStateLike,
): string[] {
  const entries = continuity.lastContinuationEvidence ?? [];
  const processed = new Set(
    extractCrossFileStateListFromContinuityEvidence(
      continuity,
      "repair-processed-files:",
    ),
  );
  for (const token of entries) {
    const normalizedToken = token.trim();
    const appliedMatch = normalizedToken.match(
      /^repair-cross-file applied on (.+)$/i,
    );
    if (appliedMatch?.[1]) {
      processed.add(normalizePathLike(appliedMatch[1]));
    }
  }
  return Array.from(processed).filter((item) => item.length > 0);
}

function extractCrossFileStateListFromContinuityEvidence(
  continuity: ContinuityStateLike,
  prefix: string,
): string[] {
  const entries = continuity.lastContinuationEvidence ?? [];
  const marker = entries.find((entry) =>
    entry.toLowerCase().startsWith(prefix.toLowerCase()),
  );
  if (!marker) {
    return [];
  }
  const markerIndex = marker.indexOf(":");
  const payload = markerIndex >= 0 ? marker.slice(markerIndex + 1).trim() : "";
  if (!payload || payload === "(none)") {
    return [];
  }
  return payload
    .split(",")
    .map((item) => normalizePathLike(item))
    .filter((item) => item.length > 0);
}

function extractCrossFileFailureEntriesFromContinuity(
  continuity: ContinuityStateLike,
): Array<{
  path: string;
  failureCode: "read-failed" | "patch-generation-failed" | "write-failed";
  reason: string;
}> {
  const entries = continuity.lastContinuationEvidence ?? [];
  const marker = entries.find((entry) =>
    entry.toLowerCase().startsWith("repair-failed-files:"),
  );
  if (!marker) {
    return [];
  }
  const markerIndex = marker.indexOf(":");
  const payload = markerIndex >= 0 ? marker.slice(markerIndex + 1).trim() : "";
  if (!payload || payload === "(none)") {
    return [];
  }
  const parsed: Array<{
    path: string;
    failureCode: "read-failed" | "patch-generation-failed" | "write-failed";
    reason: string;
  }> = [];
  for (const token of payload.split("|")) {
    const [rawPath, rawCode, rawReason] = token.split("::");
    const pathCandidate = normalizePathLike((rawPath ?? "").trim());
    const codeCandidate = (rawCode ?? "").trim().toLowerCase();
    const reasonCandidate = (rawReason ?? "").trim();
    if (!pathCandidate || !reasonCandidate) {
      continue;
    }
    if (
      codeCandidate !== "read-failed" &&
      codeCandidate !== "patch-generation-failed" &&
      codeCandidate !== "write-failed"
    ) {
      continue;
    }
    parsed.push({
      path: pathCandidate,
      failureCode: codeCandidate,
      reason: reasonCandidate,
    });
  }
  return parsed;
}

function hasDegradedContinuationEvidenceInState(
  continuity: ContinuityStateLike,
): boolean {
  const evidence = continuity.lastContinuationEvidence ?? [];
  if (
    evidence.some((entry) =>
      entry.toLowerCase().startsWith("repair-outcome:degraded-terminal"),
    )
  ) {
    return true;
  }
  return (continuity.unresolvedItems ?? []).some((entry) =>
    entry.toLowerCase().includes("degraded"),
  );
}

function hasContinuationStateSignalsInState(
  continuity: ContinuityStateLike,
  previousRemainingTargets: readonly string[],
  previousFailedEntries: ReadonlyArray<{
    path: string;
    failureCode: "read-failed" | "patch-generation-failed" | "write-failed";
    reason: string;
  }>,
): boolean {
  return (
    previousRemainingTargets.length > 0 ||
    previousFailedEntries.length > 0 ||
    (continuity.recentTargetFiles?.length ?? 0) > 0 ||
    (continuity.recentFailedFiles?.length ?? 0) > 0 ||
    (continuity.lastContinuationEvidence?.length ?? 0) > 0
  );
}

function isAtypicalReopenFollowUpPrompt(prompt: string): boolean {
  const lowered = prompt.toLowerCase();
  const lexicalSignals = [
    "use the previous failure",
    "use the failed one",
    "try again",
    "continue but not that",
    "repair the other one",
    "finish the rest",
    "not that one",
    "the other related file",
  ];
  if (lexicalSignals.some((signal) => lowered.includes(signal))) {
    return true;
  }
  return /(?:\u7528\u4e0a\u4e00\u6b21\u5931\u8d25|\u518d\u8bd5\u4e00\u6b21|\u7ee7\u7eed\u4fee|\u8865\u9f50\u5269\u4e0b|\u4e0d\u662f\u90a3\u4e2a)/i.test(
    prompt,
  );
}

function isDegradedReopenFollowUpPrompt(prompt: string): boolean {
  return /(?:continue repairing it|continue fixing it|try again|finish the rest|fix the .* one|use the previous failure|use the failure above|not that one|the other related file|继续修|接着修|再试一次|补齐剩下|用上一次失败)/i.test(
    prompt,
  );
}

function resolveContinuationReopenTarget(input: {
  continuity: ContinuityStateLike;
  prompt: string;
  workspaceRoot: string;
  enabled: boolean;
  degradedOnly: boolean;
}): {
  enabled: boolean;
  selectedTarget?: string;
  candidates: string[];
  reason?: string;
  candidateSourceSummary?: string;
  prunedCandidateSummary?: string[];
} {
  if (!input.enabled) {
    return { enabled: false, candidates: [] };
  }
  const remaining = extractCrossFileStateListFromContinuityEvidence(
    input.continuity,
    "repair-remaining-files:",
  );
  const failed = extractCrossFileFailureEntriesFromContinuity(
    input.continuity,
  ).map((entry) => normalizePathLike(entry.path));
  const processed = extractCrossFileStateListFromContinuityEvidence(
    input.continuity,
    "repair-processed-files:",
  ).map((entry) => normalizePathLike(entry));
  const primaryCandidates: Array<{ path: string; source: string }> = [
    ...remaining.map((candidate) => ({ path: candidate, source: "remaining" })),
    ...failed.map((candidate) => ({ path: candidate, source: "failed" })),
    ...(input.continuity.recentFailedFiles ?? []).map((entry) => ({
      path: normalizePathLike(entry.path),
      source: "recent-failed",
    })),
  ];
  const fallbackCandidates: Array<{ path: string; source: string }> = (
    input.continuity.recentTargetFiles ?? []
  ).map((entry) => ({
    path: normalizePathLike(entry),
    source: "recent-target",
  }));
  const workspaceAbsolute = path.resolve(input.workspaceRoot);
  const normalizedWorkspace = workspaceAbsolute.toLowerCase();
  const sourceCounts = new Map<string, number>();
  const pruned: string[] = [];
  const candidateMap = new Map<string, { path: string; source: string }>();

  const appendCandidate = (rawEntry: { path: string; source: string }) => {
    const candidate = normalizePathLike(rawEntry.path ?? "");
    if (!candidate || !isUsableContinuationTargetPath(candidate)) {
      if (candidate) {
        pruned.push(`${candidate}::placeholder`);
      }
      return;
    }
    const absolute = path.resolve(input.workspaceRoot, candidate);
    const normalizedAbsolute = absolute.toLowerCase();
    const inWorkspace =
      normalizedAbsolute === normalizedWorkspace ||
      normalizedAbsolute.startsWith(
        `${normalizedWorkspace}${path.sep.toLowerCase()}`,
      );
    if (!inWorkspace) {
      pruned.push(`${candidate}::outside-workspace`);
      return;
    }
    if (processed.includes(candidate)) {
      pruned.push(`${candidate}::already-processed`);
      return;
    }
    if (fs.existsSync(absolute)) {
      try {
        if (fs.statSync(absolute).isDirectory()) {
          pruned.push(`${candidate}::directory-target`);
          return;
        }
      } catch {
        // Ignore transient stat failures and keep candidate for later execution checks.
      }
    }
    const dedupKey = candidate.toLowerCase();
    if (candidateMap.has(dedupKey)) {
      pruned.push(`${candidate}::duplicate`);
      return;
    }
    sourceCounts.set(
      rawEntry.source,
      (sourceCounts.get(rawEntry.source) ?? 0) + 1,
    );
    candidateMap.set(dedupKey, { path: candidate, source: rawEntry.source });
  };
  for (const rawEntry of primaryCandidates) {
    appendCandidate(rawEntry);
  }
  if (candidateMap.size === 0) {
    for (const rawEntry of fallbackCandidates) {
      appendCandidate(rawEntry);
    }
  }

  const candidates = Array.from(candidateMap.values()).map(
    (entry) => entry.path,
  );
  const candidateSourceSummary = Array.from(sourceCounts.entries())
    .map(([source, count]) => `${source}=${count}`)
    .join(",");
  const prunedCandidateSummary = Array.from(new Set(pruned)).slice(0, 10);
  if (candidates.length === 0) {
    return {
      enabled: true,
      candidates: [],
      reason: input.degradedOnly
        ? "degraded-session follow-up had no recoverable candidate target"
        : "mixed/degraded continuation follow-up had no recoverable candidate target",
      candidateSourceSummary,
      prunedCandidateSummary,
    };
  }
  const loweredPrompt = input.prompt.toLowerCase();
  const lexical = candidates.filter(
    (candidate) =>
      candidate
        .split("/")
        .some((part) => loweredPrompt.includes(part.toLowerCase())) ||
      (loweredPrompt.includes("config") && candidate.includes("config")) ||
      (loweredPrompt.includes("test") && /test|spec/i.test(candidate)),
  );
  if (lexical.length === 1) {
    return {
      enabled: true,
      selectedTarget: lexical[0],
      candidates,
      reason: input.degradedOnly
        ? "degraded-session reopen matched lexical cue with a single candidate"
        : "continuation reopen matched lexical cue with a single candidate",
      candidateSourceSummary,
      prunedCandidateSummary,
    };
  }
  if (candidates.length === 1) {
    return {
      enabled: true,
      selectedTarget: candidates[0],
      candidates,
      reason: input.degradedOnly
        ? "degraded-session reopen recovered single candidate target from remaining/failure evidence"
        : "continuation reopen recovered single candidate target from remaining/failure evidence",
      candidateSourceSummary,
      prunedCandidateSummary,
    };
  }
  return {
    enabled: true,
    candidates,
    reason: input.degradedOnly
      ? "degraded-session reopen remains ambiguous across multiple candidates; explicit target required"
      : "continuation reopen remains ambiguous across multiple candidates; explicit target required",
    candidateSourceSummary,
    prunedCandidateSummary,
  };
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
  const discoveryEditRequest = buildDiscoveryEditRuntimeRequest({
    prompt: input.prompt,
    workspaceRoot: input.workspaceRoot,
    targetPath: input.plan.targetPath,
  });
  if (discoveryEditRequest) {
    const discoveryPlan = planDiscoveryEdit(discoveryEditRequest);
    if (
      discoveryPlan.status !== "ready-for-handoff" &&
      discoveryPlan.status !== "ready-for-target-set"
    ) {
      const result = buildDiscoveryEditPlanResult({
        sessionId: input.sessionId,
        prompt: input.prompt,
        plan: discoveryPlan,
      });
      return {
        events,
        notes: [
          ...notes,
          "discovery-edit: manifest produced without mutation",
          discoveryPlan.manifest.transcriptSummary,
          ...discoveryPlan.evidence,
        ],
        codingResult: result.codingResult!,
        userFacingOutput: result.finalOutput,
      };
    }

    if (discoveryPlan.status === "ready-for-target-set") {
      const workspaceAuthority = createWorkspaceWriteAuthority(input.workspaceRoot);
      const approvalResults = [];
      for (const targetPath of discoveryPlan.confirmedTargetSet) {
        const absoluteTarget = path.isAbsolute(targetPath)
          ? targetPath
          : path.join(input.workspaceRoot, targetPath);
        approvalResults.push(
          await input.enforcer.checkAndEnforce("edit", {
            scope: "filesystem",
            operation: "write",
            target: absoluteTarget,
            workspaceRoot: input.workspaceRoot,
          }),
        );
      }
      const allApproved = approvalResults.every((approval) => approval.allowed);
      const route = await runTargetSetEditRoute({
        workspaceRoot: input.workspaceRoot,
        manifest: discoveryPlan.manifest,
        confirmedTargetSet: discoveryPlan.confirmedTargetSet,
        mapping: discoveryPlan.mapping,
        maxFiles: 3,
        explicitRuntimeOptIn: true,
        explicitWorkspaceWriteOptIn: true,
        requestedUserDecision: allApproved ? "approved" : "denied",
        defaultProductionRejectionUnchanged: true,
        readFile: workspaceAuthority.readFile,
        readVerifiedFile: workspaceAuthority.readVerifiedFile,
        validateWriteTarget: workspaceAuthority.validateWriteTarget,
        writeFile: workspaceAuthority.writeFile,
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
      const result = buildTargetSetEditRouteResult({
        sessionId: input.sessionId,
        prompt: input.prompt,
        route: {
          ...route,
          evidence: [
            discoveryPlan.manifest.transcriptSummary,
            ...discoveryPlan.evidence,
            "discovery-edit-handoff:target-set-edit-route",
            ...route.evidence,
          ],
        },
      });
      return {
        events,
        notes: [
          ...notes,
          `discovery-edit: confirmed target-set=${discoveryPlan.confirmedTargetSet.join(",")}`,
          `discovery-edit: permission=${allApproved ? "approved" : "denied"}`,
          discoveryPlan.manifest.transcriptSummary,
          ...discoveryPlan.evidence,
          ...route.evidence,
        ],
        codingResult: result.codingResult!,
        userFacingOutput: result.finalOutput,
      };
    }

    const workspaceAuthority = createWorkspaceWriteAuthority(input.workspaceRoot);
    const absoluteTarget = path.isAbsolute(discoveryPlan.confirmation.targetPath)
      ? discoveryPlan.confirmation.targetPath
      : path.join(input.workspaceRoot, discoveryPlan.confirmation.targetPath);
    const approval = await input.enforcer.checkAndEnforce("edit", {
      scope: "filesystem",
      operation: "write",
      target: absoluteTarget,
      workspaceRoot: input.workspaceRoot,
    });
    const route = await runFencedEditReplacementRoute({
      workspaceRoot: input.workspaceRoot,
      targetPath: discoveryPlan.confirmation.targetPath,
      mapping: discoveryPlan.mapping,
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: approval.allowed ? "approved" : "denied",
      defaultProductionRejectionUnchanged: true,
      readFile: workspaceAuthority.readFile,
      readVerifiedFile: workspaceAuthority.readVerifiedFile,
      validateWriteTarget: workspaceAuthority.validateWriteTarget,
      writeFile: workspaceAuthority.writeFile,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    });
    const activatedRoute = {
      ...route,
      evidence: [
        discoveryPlan.manifest.transcriptSummary,
        ...discoveryPlan.evidence,
        "discovery-edit-handoff:existing-fenced-route",
        ...route.evidence,
      ],
    };
    const result = buildFencedEditReplacementRouteResult({
      sessionId: input.sessionId,
      prompt: input.prompt,
      route: activatedRoute,
    });
    return {
      events,
      notes: [
        ...notes,
        `discovery-edit: confirmed target=${discoveryPlan.confirmation.targetPath}`,
        `discovery-edit: permission=${approval.allowed ? "approved" : "denied"}`,
        discoveryPlan.manifest.transcriptSummary,
        ...discoveryPlan.evidence,
        ...activatedRoute.evidence,
      ],
      codingResult: result.codingResult!,
      userFacingOutput: result.finalOutput,
    };
  }
  const fencedActivation = selectFencedEditReplacementActivation({
    prompt: input.prompt,
    ...(input.plan.targetPath ? { targetPath: input.plan.targetPath } : {}),
    ...(input.plan.replaceFrom && input.plan.replaceTo
      ? {
          replaceDirective: {
            from: input.plan.replaceFrom,
            to: input.plan.replaceTo,
          },
        }
      : {}),
    hasMultipleTargets:
      (input.plan.additionalTargetPaths?.length ?? 0) > 0 ||
      /(?:\s|^)(?:and|,)\s+[\w./\\-]+\.(?:ts|tsx|js|jsx|py|go|rs|md|txt|json|yaml|yml)\b/i.test(
        input.prompt,
      ),
  });
  if (fencedActivation.status === "stopped") {
    const result = buildFencedEditReplacementRouteResult({
      sessionId: input.sessionId,
      prompt: input.prompt,
      route: fencedActivation.route,
    });
    return {
      events,
      notes: [
        ...notes,
        "fenced-edit-activation: stopped before mutation",
        ...fencedActivation.evidence,
      ],
      codingResult: result.codingResult!,
      userFacingOutput: result.finalOutput,
    };
  }
  if (fencedActivation.status === "selected") {
    const workspaceAuthority = createWorkspaceWriteAuthority(input.workspaceRoot);
    const absoluteTarget = path.isAbsolute(fencedActivation.targetPath)
      ? fencedActivation.targetPath
      : path.join(input.workspaceRoot, fencedActivation.targetPath);
    const approval = await input.enforcer.checkAndEnforce("edit", {
      scope: "filesystem",
      operation: "write",
      target: absoluteTarget,
      workspaceRoot: input.workspaceRoot,
    });
    const route = await runFencedEditReplacementRoute({
      workspaceRoot: input.workspaceRoot,
      targetPath: fencedActivation.targetPath,
      mapping: fencedActivation.mapping,
      explicitRuntimeOptIn: true,
      explicitWorkspaceWriteOptIn: true,
      requestedUserDecision: approval.allowed ? "approved" : "denied",
      defaultProductionRejectionUnchanged: true,
      readFile: workspaceAuthority.readFile,
      readVerifiedFile: workspaceAuthority.readVerifiedFile,
      validateWriteTarget: workspaceAuthority.validateWriteTarget,
      writeFile: workspaceAuthority.writeFile,
      ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
    });
    const activatedRoute = {
      ...route,
      evidence: [...fencedActivation.evidence, ...route.evidence],
    };
    const result = buildFencedEditReplacementRouteResult({
      sessionId: input.sessionId,
      prompt: input.prompt,
      route: activatedRoute,
    });
    return {
      events,
      notes: [
        ...notes,
        `fenced-edit-activation: selected target=${fencedActivation.targetPath}`,
        `fenced-edit-activation: permission=${approval.allowed ? "approved" : "denied"}`,
        ...fencedActivation.evidence,
        ...activatedRoute.evidence,
      ],
      codingResult: result.codingResult!,
      userFacingOutput: result.finalOutput,
    };
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
  if (
    input.plan.inspectFirst &&
    input.plan.targetPath &&
    (input.plan.taskKind === "edit-file" || input.plan.taskKind === "read-file")
  ) {
    const readStep = await dispatchRuntimeTool({
      dispatcher: input.dispatcher,
      events,
      toolName: "read",
      taskId: `task_${input.sessionId}_${input.turn}_read`,
      args: { path: input.plan.targetPath },
      workspaceRoot: input.workspaceRoot,
      sessionId: input.sessionId,
      abortSignal: input.abortSignal,
      requireApprovalEvent: false,
    });
    if (!readStep.success) {
      const rawReason = readStep.error ?? "read failed";
      const reason =
        input.plan.replaceFrom && input.plan.replaceTo
          ? formatPatchFailureReason({
              ok: false,
              failureCode: "patch-target-missing",
              failureReason: "patch-target-missing",
              explanation:
                "Patch target could not be read before applying replace.",
              reason: "Patch target could not be read before applying replace.",
              matchedCount: 0,
              nextAction:
                "Check that the target file exists and rerun with an explicit in-workspace path.",
            })
          : rawReason;
      notes.push(`inspect failed: ${reason}`);
      if (input.plan.replaceFrom && input.plan.replaceTo) {
        patches.push({
          path: input.plan.targetPath,
          operation: "replace",
          status: "failed",
          failureCode: "patch-target-missing",
          reason,
        });
      }
      failedFiles.push({ path: input.plan.targetPath, reason });
      const inspectFailureTaskReason =
        input.plan.taskKind === "read-file"
          ? "Read/inspect step failed; no files changed."
          : "Inspect step failed; mutation skipped.";
      const inspectFailureRepairNotes =
        input.plan.replaceFrom && input.plan.replaceTo
          ? [reason]
          : ["inspect step failed before edit"];
      return {
        events,
        notes,
        ...projectWorkflowRuntimeOutcome({
          taskKind: input.plan.taskKind,
          changedFiles,
          failedFiles,
          patches,
          verifiedFiles,
          unverifiedFiles,
          verification: {
            status: "skipped",
            reason: "inspect failed before edit",
            selectionScope: "none",
            selectionSource: "not-requested",
          },
          repairNotes: inspectFailureRepairNotes,
          evidence: [`read failed: ${reason}`],
          taskVerdict: "insufficient-evidence",
          taskReasons: [inspectFailureTaskReason],
          userFacingOutput: `Task not completed: failed to read ${input.plan.targetPath}. Reason: ${reason}`,
        }),
      };
    }
    originalContent = readStep.output ?? "";
    notes.push(`tool: read file ${input.plan.targetPath}`);
    evidence.push(`inspect: read ${input.plan.targetPath}`);
    if (input.plan.taskKind === "edit-file" && unchangedAssertions.length > 0) {
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
    if (input.plan.taskKind === "read-file") {
      const readDelivery = buildReadTaskDelivery({
        prompt: input.prompt,
        targetPath: input.plan.targetPath,
        content: originalContent,
        preferredMode: input.plan.groundedDeliverableMode,
        requestedLines: input.plan.readLineCount,
        lineOffset: input.plan.readLineOffset,
        readFragmentLineIndexes: input.plan.readFragmentLineIndexes,
        readFragmentRanges: input.plan.readFragmentRanges,
        readFragmentSourceWindowStart: input.plan.readFragmentSourceWindowStart,
        readFragmentSourceWindowEnd: input.plan.readFragmentSourceWindowEnd,
        readFragmentFingerprint: input.plan.readFragmentFingerprint,
        readFilter: input.plan.readFilter,
        repairInstruction: input.plan.repairInstruction,
      });
      if (input.plan.contextPlanningRequested) {
        const planning = await buildContextGraphPlanningBundle({
          workspaceRoot: input.workspaceRoot,
          targetPath: input.plan.targetPath,
          workflowPlan: input.plan,
        });
        const agentPlanResult = buildAgentPlanResult(planning.agentPlan);
        const planningReady = planning.agentPlan.executionReadiness === "ready";
        const planningReason = planningReady
          ? "Agent plan is ready for the existing read/context route."
          : planning.agentPlan.doNext;
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
          ...projectWorkflowRuntimeOutcome({
            taskKind: "read-file",
            changedFiles,
            failedFiles: planningReady
              ? []
              : [{ path: input.plan.targetPath, reason: planningReason }],
            patches,
            verifiedFiles,
            unverifiedFiles,
            verification: {
              status: "not-requested",
              reason: "read-only context packet",
              selectionScope: "none",
              selectionSource: "not-requested",
            },
            repairNotes,
            evidence: [
              ...evidence,
              ...readDelivery.evidenceMarkers,
              ...planning.packetResult.evidence,
              ...planning.graphResult.evidence,
              ...agentPlanResult.evidence,
            ],
            taskVerdict:
              readDelivery.completed && planningReady
                ? "satisfied"
                : "insufficient-evidence",
            taskReasons: [
              readDelivery.completed
                ? "Read/summarize task delivered requested content."
                : "Read step succeeded but no user-facing delivery could be produced.",
              planningReason,
            ],
            userFacingOutput: [
              readDelivery.output,
              "",
              planning.packetResult.output,
              "",
              planning.graphResult.output,
              "",
              agentPlanResult.output,
            ].join("\n"),
          }),
        };
      }
      return {
        events,
        notes,
        ...projectWorkflowRuntimeOutcome({
          taskKind: "read-file",
          changedFiles,
          failedFiles,
          patches,
          verifiedFiles,
          unverifiedFiles,
          verification: {
            status: "not-requested",
            reason: "read-only task",
            selectionScope: "none",
            selectionSource: "not-requested",
          },
          repairNotes,
          evidence: [...evidence, ...readDelivery.evidenceMarkers],
          taskVerdict: readDelivery.completed
            ? "satisfied"
            : "insufficient-evidence",
          taskReasons: [
            readDelivery.completed
              ? "Read/summarize task delivered requested content."
              : readDelivery.output.length > 0
                ? readDelivery.output
                : "Read step succeeded but no user-facing delivery could be produced.",
          ],
          userFacingOutput: readDelivery.output,
        }),
      };
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

  if (input.plan.taskKind === "inspect-files") {
    const globStep = await dispatchRuntimeTool({
      dispatcher: input.dispatcher,
      events,
      toolName: "glob",
      taskId: `task_${input.sessionId}_${input.turn}_glob`,
      args: { pattern: ".ts" },
      workspaceRoot: input.workspaceRoot,
      sessionId: input.sessionId,
      abortSignal: input.abortSignal,
      requireApprovalEvent: false,
    });
    if (globStep.success) {
      const delivery = buildInspectFilesDelivery(globStep.output ?? "");
      const inspectCompleted = !delivery.startsWith("Task not completed:");
      notes.push("inspect candidates collected via glob(.ts)");
      evidence.push("inspect: glob(.ts) executed");
      return {
        events,
        notes,
        ...projectWorkflowRuntimeOutcome({
          taskKind: "inspect-files",
          changedFiles,
          failedFiles,
          patches,
          verifiedFiles,
          unverifiedFiles,
          verification: {
            status: "not-requested",
            reason: "inspect-only task",
            selectionScope: "none",
            selectionSource: "not-requested",
          },
          repairNotes,
          evidence,
          taskVerdict: inspectCompleted ? "satisfied" : "insufficient-evidence",
          taskReasons: [
            inspectCompleted
              ? "Repository inspection executed."
              : "Repository inspection produced no candidate files for requested scope.",
          ],
          userFacingOutput: delivery,
        }),
      };
    }
    const reason = globStep.error ?? "glob failed";
    notes.push(`inspect failed: ${reason}`);
    failedFiles.push({ path: "(workspace)", reason });
    return {
      events,
      notes,
      ...projectWorkflowRuntimeOutcome({
        taskKind: "inspect-files",
        changedFiles,
        failedFiles,
        patches,
        verifiedFiles,
        unverifiedFiles,
        verification: {
          status: "skipped",
          reason: "inspect failed",
          selectionScope: "none",
          selectionSource: "not-requested",
        },
        repairNotes: ["inspect stage failed"],
        evidence: [`glob failed: ${reason}`],
        taskVerdict: "insufficient-evidence",
        taskReasons: ["Could not inspect repository files."],
        userFacingOutput: `Task not completed: repository inspection failed. Reason: ${reason}`,
      }),
    };
  }

  if (input.plan.taskKind === "repo-explain") {
    const globStep = await dispatchRuntimeTool({
      dispatcher: input.dispatcher,
      events,
      toolName: "glob",
      taskId: `task_${input.sessionId}_${input.turn}_repo_explain_glob`,
      args: { pattern: ".ts" },
      workspaceRoot: input.workspaceRoot,
      sessionId: input.sessionId,
      abortSignal: input.abortSignal,
      requireApprovalEvent: false,
    });
    const candidateFiles = globStep.success
      ? parseRepoCandidateFiles(globStep.output ?? "")
      : [];
    if (globStep.success) {
      notes.push("tool: approved glob(.ts) for repo diagnosis");
      evidence.push("repo-explain: glob(.ts) executed");
    } else {
      notes.push(
        `repo-explain glob failed: ${globStep.error ?? "glob failed"}`,
      );
    }

    let targetPath = input.plan.targetPath;
    let targetContent: string | undefined;

    if (!targetPath && candidateFiles.length > 0) {
      const inspectedCandidates: Array<{ path: string; content: string }> = [];
      for (const candidatePath of candidateFiles.slice(0, 20)) {
        const readCandidate = await dispatchRuntimeTool({
          dispatcher: input.dispatcher,
          events,
          toolName: "read",
          taskId: `task_${input.sessionId}_${input.turn}_repo_explain_candidate_${hashStableId(candidatePath)}`,
          args: { path: candidatePath },
          workspaceRoot: input.workspaceRoot,
          sessionId: input.sessionId,
          abortSignal: input.abortSignal,
          requireApprovalEvent: false,
        });
        if (readCandidate.success) {
          inspectedCandidates.push({
            path: candidatePath,
            content: readCandidate.output ?? "",
          });
        }
      }
      const selected = selectRepoExplainTarget({
        prompt: input.prompt,
        candidates: inspectedCandidates,
      });
      targetPath = selected?.path;
      targetContent = selected?.content;
    }

    if (!targetPath) {
      const targetStop =
        candidateFiles.length > 1
          ? projectReadAmbiguousTargetStop({
              candidates: candidateFiles,
              reason:
                "Repo explain needs one high-confidence evidence target, but multiple candidates matched. Provide an explicit in-workspace file path.",
              doNext: "Provide an explicit in-workspace file path.",
            })
          : projectReadMissingTargetStop({
              reason:
                "Repo explain requires an explicit in-workspace file target for truthful delivery.",
              doNext: "Provide an explicit in-workspace file path.",
            });
      const reason = targetStop.reason;
      return {
        events,
        notes: [...notes, "repo-explain missing explicit target"],
        ...projectWorkflowRuntimeOutcome({
          taskKind: "repo-explain",
          changedFiles,
          failedFiles: [
            {
              path: "(missing-target)",
              reason,
            },
          ],
          patches,
          verifiedFiles,
          unverifiedFiles,
          verification: {
            status: "skipped",
            reason: "repo-explain target missing",
            selectionScope: "none",
            selectionSource: "not-requested",
          },
          repairNotes: ["Provide explicit file path for explanation task."],
          evidence,
          taskVerdict: "insufficient-evidence",
          taskReasons: ["Explanation target was not resolved."],
          userFacingOutput:
            `Task not completed: ${reason}`,
        }),
      };
    }

    if (targetContent === undefined) {
      const readStep = await dispatchRuntimeTool({
        dispatcher: input.dispatcher,
        events,
        toolName: "read",
        taskId: `task_${input.sessionId}_${input.turn}_repo_explain_read`,
        args: { path: targetPath },
        workspaceRoot: input.workspaceRoot,
        sessionId: input.sessionId,
        abortSignal: input.abortSignal,
        requireApprovalEvent: false,
      });
      if (!readStep.success) {
        const reason = readStep.error ?? "read failed";
        return {
          events,
          notes: [...notes, `repo-explain read failed: ${reason}`],
          ...projectWorkflowRuntimeOutcome({
            taskKind: "repo-explain",
            changedFiles,
            failedFiles: [{ path: targetPath, reason }],
            patches,
            verifiedFiles,
            unverifiedFiles,
            verification: {
              status: "skipped",
              reason: "repo-explain read failed",
              selectionScope: "none",
              selectionSource: "not-requested",
            },
            repairNotes: ["Could not read target file for explanation."],
            evidence: [`repo-explain read failed: ${reason}`],
            taskVerdict: "insufficient-evidence",
            taskReasons: ["Target file could not be read for explanation."],
            userFacingOutput: `Task not completed: failed to read ${targetPath}. Reason: ${reason}`,
          }),
        };
      }
      targetContent = readStep.output ?? "";
    }

    notes.push("tool: read diagnosis evidence");
    evidence.push(`repo-explain: read ${targetPath}`);
    const explainOutput = buildExplainTaskDelivery(targetPath, targetContent);
    const disposition = inferRepoDiagnosis({ prompt: input.prompt });
    const outcome = projectWorkflowRuntimeOutcome({
      taskKind: "repo-explain",
      changedFiles,
      failedFiles,
      patches,
      verifiedFiles,
      unverifiedFiles,
      verification: {
        status: "not-requested",
        reason: "repo-explain read-only task",
        selectionScope: "none",
        selectionSource: "not-requested",
      },
      repairNotes,
      evidence,
      taskVerdict:
        disposition === "needs-verification"
          ? "completed-with-caveats"
          : "satisfied",
      taskReasons: [
        disposition === "needs-verification"
          ? "Repo diagnosis is grounded in inspected files but still needs verification."
          : "Repo explanation delivered from inspected file content.",
      ],
      userFacingOutput: explainOutput,
    });
    outcome.codingResult.diagnosis = {
      disposition,
      reason:
        disposition === "needs-verification"
          ? "Symptom-oriented diagnosis requires verification after evidence collection."
          : "Explanation is grounded in inspected repository evidence.",
      searchPattern: ".ts",
      candidateFiles,
      evidenceFiles: [targetPath],
      evidenceNodes: [
        {
          path: targetPath,
          role: inferRepoEvidenceRole({ targetPath }),
          score: 1,
        },
      ],
      evidenceLinks: [],
    };
    return {
      events,
      notes: [
        ...notes,
        `repo-explain delivered: ${targetPath}`,
        `diagnosis: disposition=${disposition}`,
      ],
      ...outcome,
    };
  }

  if (
    input.plan.taskKind === "write-file" ||
    input.plan.taskKind === "edit-file"
  ) {
    const targetPath = input.plan.targetPath ?? "(unknown)";
    if (
      input.plan.taskKind === "edit-file" &&
      input.plan.crossFileConvergedNoop
    ) {
      const convergedMessage =
        "Cross-file continuation already converged; no remaining related files require edits.";
      notes.push(
        "repair: cross-file continuation converged (no remaining targets)",
      );
      evidence.push("repair-cross-file converged:no-remaining-targets");
      evidence.push("repair-processed-files:(none-added-this-turn)");
      evidence.push("repair-remaining-files:(none)");
      return {
        events,
        notes,
        ...projectWorkflowRuntimeOutcome({
          taskKind: input.plan.taskKind,
          changedFiles,
          failedFiles,
          patches,
          verifiedFiles,
          unverifiedFiles,
          verification: {
            status: "not-requested",
            reason: "cross-file continuation converged",
            selectionScope: "none",
            selectionSource: "not-requested",
          },
          repairNotes: [convergedMessage],
          evidence,
          taskVerdict: "satisfied",
          taskReasons: [
            "No remaining related files required continuation edits.",
          ],
          userFacingOutput: convergedMessage,
        }),
      };
    }
    const fenced = extractFencedContent(input.prompt);
    const lowRiskRenameRefactor = extractLowRiskRenameRefactor(input.prompt);
    let replaceDirective =
      input.plan.replaceFrom && input.plan.replaceTo
        ? { from: input.plan.replaceFrom, to: input.plan.replaceTo }
        : extractReplaceDirective(input.prompt);
    if (!replaceDirective && lowRiskRenameRefactor) {
      replaceDirective = {
        from: lowRiskRenameRefactor.from,
        to: lowRiskRenameRefactor.to,
      };
    }
    const explicitPromptDirective = extractReplaceDirective(input.prompt);
    const isExplicitPromptDirective = Boolean(
      explicitPromptDirective &&
      replaceDirective &&
      explicitPromptDirective.from === replaceDirective.from &&
      explicitPromptDirective.to === replaceDirective.to,
    );
    if (
      !replaceDirective &&
      input.plan.taskKind === "edit-file" &&
      input.plan.continuationRepairReplan
    ) {
      const alternativeDirective = inferAlternativeReplaceDirective({
        targetPath,
        originalContent,
        failedTransforms: input.plan.failedTransforms ?? [],
        avoidPreviousDirection: input.plan.avoidPreviousDirection === true,
      });
      if (
        alternativeDirective &&
        isSafeGeneratedAlternativeDirective(alternativeDirective)
      ) {
        replaceDirective = alternativeDirective;
        notes.push("repair: continuation re-plan applied");
        const isBlockScoped =
          alternativeDirective.from.includes("\n") ||
          alternativeDirective.to.includes("\n");
        notes.push(
          isBlockScoped
            ? "repair replan: block-scoped alternative selected from current code context"
            : `repair replan: alternative transform selected ${alternativeDirective.from}=>${alternativeDirective.to}`,
        );
        evidence.push(
          `replan-transform:${targetPath}:${alternativeDirective.from}=>${alternativeDirective.to}`,
        );
        if (isBlockScoped) {
          evidence.push(`replan-context:${targetPath}:block-scoped`);
        }
      } else if (alternativeDirective) {
        notes.push("repair replan: unsafe alternative transform skipped");
        evidence.push(
          `replan-skipped:${targetPath}:unsafe-transform:${alternativeDirective.from}=>${alternativeDirective.to}`,
        );
      }
    }
    if (
      replaceDirective &&
      input.plan.taskKind === "edit-file" &&
      typeof originalContent === "string" &&
      !isExplicitPromptDirective &&
      !originalContent.includes(replaceDirective.from)
    ) {
      const hasPotentialCrossFileRepair =
        input.plan.crossFileRepair === true &&
        (input.plan.additionalTargetPaths?.length ?? 0) > 0;
      const reboundDirective = inferAlternativeReplaceDirective({
        targetPath,
        originalContent,
        failedTransforms: [
          ...(input.plan.failedTransforms ?? []),
          {
            path: normalizePathLike(targetPath),
            from: replaceDirective.from,
            to: replaceDirective.to,
          },
        ],
        avoidPreviousDirection: input.plan.avoidPreviousDirection === true,
      });
      if (
        reboundDirective &&
        reboundDirective.from !== replaceDirective.from &&
        originalContent.includes(reboundDirective.from) &&
        isSafeReboundDirective({
          original: replaceDirective,
          rebound: reboundDirective,
        })
      ) {
        notes.push(
          `repair: reopen transform rebound from ${replaceDirective.from}=>${replaceDirective.to} to ${reboundDirective.from}=>${reboundDirective.to}`,
        );
        evidence.push(
          `rebind-transform:${targetPath}:${replaceDirective.from}=>${replaceDirective.to}->${reboundDirective.from}=>${reboundDirective.to}`,
        );
        replaceDirective = reboundDirective;
      } else if (
        originalContent.includes(replaceDirective.to) &&
        !hasPotentialCrossFileRepair
      ) {
        const reason =
          "Reopened target recovered, but previous transform is stale against current file content (replacement already present). Provide an explicit next transform to continue.";
        failedFiles.push({ path: targetPath, reason });
        repairNotes.push(reason);
        evidence.push(
          `rebind-blocker:${targetPath}:stale-transform-already-applied:${replaceDirective.from}=>${replaceDirective.to}`,
        );
        return {
          events,
          notes: [...notes, `blocker: ${reason}`],
          ...projectWorkflowRuntimeOutcome({
            taskKind: input.plan.taskKind,
            changedFiles,
            failedFiles,
            patches,
            verifiedFiles,
            unverifiedFiles,
            verification: {
              status: "skipped",
              reason: "stale transform requires explicit override",
              selectionScope: "none",
              selectionSource: "not-requested",
            },
            repairNotes,
            evidence,
            taskVerdict: "insufficient-evidence",
            taskReasons: [reason],
            userFacingOutput: `Task not completed: ${reason}`,
          }),
        };
      } else if (
        originalContent.includes(replaceDirective.to) &&
        hasPotentialCrossFileRepair
      ) {
        notes.push(
          "repair: stale primary transform detected, allowing cross-file continuation to proceed",
        );
        evidence.push(
          `rebind-primary-skip:${targetPath}:stale-transform-preserved-for-cross-file`,
        );
      }
    }
    if (replaceDirective) {
      evidence.push(
        `transform:${targetPath}:${replaceDirective.from}=>${replaceDirective.to}`,
      );
    } else if (
      input.plan.taskKind === "edit-file" &&
      input.plan.continuationRepairReplan &&
      (input.plan.failedTransforms?.length ?? 0) > 0
    ) {
      evidence.push(
        `repair-replan:blocker:${targetPath}:no-safe-alternative-transform`,
      );
      if (input.plan.avoidPreviousDirection) {
        const reason =
          "Continuation cannot safely avoid the previous failed direction with current evidence. Provide an explicit replacement transform.";
        failedFiles.push({ path: targetPath, reason });
        repairNotes.push(reason);
        return {
          events,
          notes: [...notes, `blocker: ${reason}`],
          ...projectWorkflowRuntimeOutcome({
            taskKind: input.plan.taskKind,
            changedFiles,
            failedFiles,
            patches,
            verifiedFiles,
            unverifiedFiles,
            verification: {
              status: "skipped",
              reason: "continuation repair evidence insufficient",
              selectionScope: "none",
              selectionSource: "not-requested",
            },
            repairNotes,
            evidence,
            taskVerdict: "insufficient-evidence",
            taskReasons: [reason],
            userFacingOutput: `Task not completed: ${reason}`,
          }),
        };
      }
    }
    const mutationInstruction = resolveMutationInstruction(
      input.plan,
      input.prompt,
      originalContent,
      fenced,
      replaceDirective,
    );
    const hasCrossFileRepairTargets =
      input.plan.taskKind === "edit-file" &&
      input.plan.crossFileRepair &&
      Boolean(replaceDirective) &&
      (input.plan.additionalTargetPaths?.length ?? 0) > 0;
    let primarySkippedForCrossFile = false;

    if (isMutationInstructionFailure(mutationInstruction)) {
      if (
        hasCrossFileRepairTargets &&
        mutationInstruction.reason.includes("Replace source text not found")
      ) {
        primarySkippedForCrossFile = true;
        notes.push(
          `repair: primary target skipped for coordinated continuation (${targetPath})`,
        );
        evidence.push(
          `repair-cross-file primary-skip:${targetPath}:anchor-not-found`,
        );
      } else {
        const patchFailureCode = mutationInstruction.reason.includes(
          "patch-from-not-found",
        )
          ? "patch-from-not-found"
          : mutationInstruction.reason.includes("patch-ambiguous")
            ? "patch-ambiguous"
            : mutationInstruction.reason.includes("patch-generation-failed")
              ? "patch-generation-failed"
              : undefined;
        if (patchFailureCode) {
          patches.push({
            path: targetPath,
            operation: "replace",
            status: "failed",
            failureCode: patchFailureCode,
            reason: mutationInstruction.reason,
          });
        }
        failedFiles.push({
          path: targetPath,
          reason: mutationInstruction.reason,
        });
        repairNotes.push(mutationInstruction.reason);
        if (mutationInstruction.reason.includes("edit-transform-unclear")) {
          const planning = await buildContextGraphPlanningBundle({
            workspaceRoot: input.workspaceRoot,
            targetPath,
            workflowPlan: {
              ...input.plan,
              blockedReason: mutationInstruction.reason,
              contextPlanningRequested: true,
              contextPlanningReason: "missing-edit-context",
            },
          });
          const agentPlanResult = buildAgentPlanResult(planning.agentPlan);
          return {
            events,
            notes: [
              ...notes,
              `blocker: ${mutationInstruction.reason}`,
              `context-packet: ${planning.packet.packetId}`,
              `context-graph: ${planning.graph.graphId}`,
              `test-impact: ${planning.testImpact.impactPlanId}`,
              planning.packet.replaySafeSummary,
              planning.graph.replaySafeSummary,
              planning.testImpact.replaySafeSummary,
              planning.agentPlan.replaySafeSummary,
            ],
            ...projectWorkflowRuntimeOutcome({
              taskKind: input.plan.taskKind,
              changedFiles,
              failedFiles,
              patches,
              verifiedFiles,
              unverifiedFiles,
              verification: {
                status: "skipped",
                reason: "mutation instruction missing",
                selectionScope: "none",
                selectionSource: "not-requested",
              },
              repairNotes,
              evidence: [
                ...evidence,
                ...planning.packetResult.evidence,
                ...planning.graphResult.evidence,
                ...agentPlanResult.evidence,
              ],
              taskVerdict: "insufficient-evidence",
              taskReasons: [
                mutationInstruction.reason,
                planning.agentPlan.doNext,
              ],
              userFacingOutput: [
                `Task not completed: ${mutationInstruction.reason}`,
                "",
                planning.packetResult.output,
                "",
                planning.graphResult.output,
                "",
                agentPlanResult.output,
              ].join("\n"),
            }),
          };
        }
        return {
          events,
          notes: [...notes, `blocker: ${mutationInstruction.reason}`],
          ...projectWorkflowRuntimeOutcome({
            taskKind: input.plan.taskKind,
            changedFiles,
            failedFiles,
            patches,
            verifiedFiles,
            unverifiedFiles,
            verification: {
              status: "skipped",
              reason: "mutation instruction missing",
              selectionScope: "none",
              selectionSource: "not-requested",
            },
            repairNotes,
            evidence,
            taskVerdict: "insufficient-evidence",
            taskReasons: [mutationInstruction.reason],
            userFacingOutput: `Task not completed: ${mutationInstruction.reason}`,
          }),
        };
      }
    }
    const successfulMutationInstruction = mutationInstruction as Exclude<
      typeof mutationInstruction,
      { ok: false; reason: string }
    >;

    if (!primarySkippedForCrossFile) {
      const transformKind =
        input.plan.taskKind === "write-file"
          ? "write"
          : fenced
            ? "fenced-replacement"
            : replaceDirective
              ? "replace"
              : "rewrite";
      notes.push(`mutation transform: ${transformKind}`);
      evidence.push(`edit-transform-kind:${targetPath}:${transformKind}`);
      const primaryMutationToolName =
        input.plan.taskKind === "write-file" ? "write" : "edit";
      const primaryMutationTarget = path.isAbsolute(targetPath)
        ? targetPath
        : path.join(input.workspaceRoot, targetPath);
      const currentMutationScope = deriveCurrentPermissionRequestFromToolInput({
        toolName: primaryMutationToolName,
        operation: "write",
        target: primaryMutationTarget,
        workspaceRoot: input.workspaceRoot,
        source: "approval-request",
        lineageHint:
          input.plan.taskKind === "write-file"
            ? "write-file-primary"
            : "edit-file-primary",
      });
      appendCurrentRequestScopeEvidence(evidence, currentMutationScope);
      const mutation = await executeFileMutationBranch({
        path: targetPath,
        content: successfulMutationInstruction.content,
        operation: input.plan.taskKind === "write-file" ? "append" : "replace",
        changedLines: successfulMutationInstruction.changedLines,
        addedLines: successfulMutationInstruction.addedLines,
        removedLines: successfulMutationInstruction.removedLines,
        failureReason: "mutation failed",
        appliedNote: `mutation applied: ${targetPath}`,
        appliedEvidence: `edit/write applied on ${targetPath}`,
        expectedContentBeforeWrite:
          input.plan.taskKind === "edit-file" &&
          typeof originalContent === "string"
            ? originalContent
            : undefined,
        readContentBeforeWrite:
          input.plan.taskKind === "edit-file" &&
          typeof originalContent === "string"
            ? async () => {
                try {
                  const absoluteTargetPath = path.isAbsolute(targetPath)
                    ? targetPath
                    : path.join(input.workspaceRoot, targetPath);
                  return {
                    success: true,
                    content: fs.readFileSync(absoluteTargetPath, "utf8"),
                  };
                } catch (error) {
                  return {
                    success: false,
                    error:
                      error instanceof Error
                        ? `stale-read: ${error.message}`
                        : "stale-read: Could not verify the current file content before writing.",
                  };
                }
              }
            : undefined,
        dispatch: () =>
          dispatchRuntimeTool({
            dispatcher: input.dispatcher,
            events,
            toolName: primaryMutationToolName,
            taskId: `task_${input.sessionId}_${input.turn}_${primaryMutationToolName}`,
            args: {
              path: targetPath,
              content: successfulMutationInstruction.content,
            },
            workspaceRoot: input.workspaceRoot,
            sessionId: input.sessionId,
            abortSignal: input.abortSignal,
            requireApprovalEvent: true,
          }),
      });
      mutationResults.push(mutation);
      if (mutation.failedFile) {
        failedFiles.push(mutation.failedFile);
      }
      if (mutation.changedFile) {
        changedFiles.push(mutation.changedFile);
      }
      patches.push(mutation.patch);
      if (mutation.note) {
        notes.push(mutation.note);
      }
      if (mutation.evidence) {
        evidence.push(mutation.evidence);
      }
      if (mutation.appliedContent) {
        appliedContentByPath.set(
          mutation.appliedContent.normalizedPath,
          mutation.appliedContent.content,
        );
      }
    }

    if (!primarySkippedForCrossFile && changedFiles.includes(targetPath)) {
      if (lowRiskRenameRefactor) {
        const processedRenamePaths = new Set([normalizePathLike(targetPath)]);
        for (const renamePath of lowRiskRenameRefactor.paths) {
          if (processedRenamePaths.has(normalizePathLike(renamePath))) {
            continue;
          }
          processedRenamePaths.add(normalizePathLike(renamePath));
          const renameRead = await dispatchRuntimeTool({
            dispatcher: input.dispatcher,
            events,
            toolName: "read",
            taskId: `task_${input.sessionId}_${input.turn}_rename_read_${hashStableId(renamePath)}`,
            args: { path: renamePath },
            workspaceRoot: input.workspaceRoot,
            sessionId: input.sessionId,
            abortSignal: input.abortSignal,
            requireApprovalEvent: false,
          });
          if (!renameRead.success) {
            const reason = renameRead.error ?? "rename target read failed";
            failedFiles.push({ path: renamePath, reason });
            patches.push({
              path: renamePath,
              operation: "replace",
              status: "failed",
              failureCode: "read-failed",
              reason,
            });
            continue;
          }
          const renameContent = applyWholeWordRename(
            renameRead.output ?? "",
            lowRiskRenameRefactor.from,
            lowRiskRenameRefactor.to,
          );
          if (renameContent === (renameRead.output ?? "")) {
            continue;
          }
          const lineDelta = computeLineDelta(
            renameRead.output ?? "",
            renameContent,
          );
          const renameMutation = await executeFileMutationBranch({
            path: renamePath,
            content: renameContent,
            operation: "replace",
            changedLines: lineDelta.changedLines,
            addedLines: lineDelta.addedLines,
            removedLines: lineDelta.removedLines,
            failureReason: "rename target edit failed",
            appliedNote: `low-risk rename applied: ${renamePath}`,
            appliedEvidence: `rename-refactor:${renamePath}:${lowRiskRenameRefactor.from}->${lowRiskRenameRefactor.to}`,
            dispatch: () =>
              dispatchRuntimeTool({
                dispatcher: input.dispatcher,
                events,
                toolName: "edit",
                taskId: `task_${input.sessionId}_${input.turn}_rename_edit_${hashStableId(renamePath)}`,
                args: { path: renamePath, content: renameContent },
                workspaceRoot: input.workspaceRoot,
                sessionId: input.sessionId,
                abortSignal: input.abortSignal,
                requireApprovalEvent: true,
              }),
          });
          mutationResults.push(renameMutation);
          if (renameMutation.failedFile) {
            failedFiles.push(renameMutation.failedFile);
            patches.push(renameMutation.patch);
            continue;
          }
          if (renameMutation.changedFile) {
            changedFiles.push(renameMutation.changedFile);
          }
          patches.push(renameMutation.patch);
          if (renameMutation.note) {
            notes.push(renameMutation.note);
          }
          if (renameMutation.evidence) {
            evidence.push(renameMutation.evidence);
          }
          if (renameMutation.appliedContent) {
            appliedContentByPath.set(
              renameMutation.appliedContent.normalizedPath,
              renameMutation.appliedContent.content,
            );
          }
        }
      }

      const secondaryWrites = extractSecondaryFileWrites(
        input.prompt,
        targetPath,
      );
      for (const secondary of secondaryWrites) {
        const lineCount = secondary.content.split("\n").length;
        const secondaryMutation = await executeFileMutationBranch({
          path: secondary.path,
          content: secondary.content,
          operation: "append",
          changedLines: lineCount,
          addedLines: lineCount,
          removedLines: 0,
          failureReason: "secondary write failed",
          appliedNote: `secondary write applied: ${secondary.path}`,
          appliedEvidence: `secondary write applied on ${secondary.path}`,
          dispatch: () =>
            dispatchRuntimeTool({
              dispatcher: input.dispatcher,
              events,
              toolName: "write",
              taskId: `task_${input.sessionId}_${input.turn}_write_${hashStableId(secondary.path)}`,
              args: { path: secondary.path, content: secondary.content },
              workspaceRoot: input.workspaceRoot,
              sessionId: input.sessionId,
              abortSignal: input.abortSignal,
              requireApprovalEvent: true,
            }),
        });
        mutationResults.push(secondaryMutation);
        if (secondaryMutation.failedFile) {
          failedFiles.push(secondaryMutation.failedFile);
          patches.push(secondaryMutation.patch);
          continue;
        }
        if (secondaryMutation.changedFile) {
          changedFiles.push(secondaryMutation.changedFile);
        }
        patches.push(secondaryMutation.patch);
        if (secondaryMutation.note) {
          notes.push(secondaryMutation.note);
        }
        if (secondaryMutation.evidence) {
          evidence.push(secondaryMutation.evidence);
        }
        if (secondaryMutation.appliedContent) {
          appliedContentByPath.set(
            secondaryMutation.appliedContent.normalizedPath,
            secondaryMutation.appliedContent.content,
          );
        }
      }
    }

    if (
      input.plan.taskKind === "edit-file" &&
      input.plan.crossFileRepair &&
      replaceDirective &&
      (changedFiles.includes(targetPath) || primarySkippedForCrossFile) &&
      (input.plan.additionalTargetPaths?.length ?? 0) > 0
    ) {
      const coordinatedTargets = input.plan.additionalTargetPaths ?? [];
      notes.push(
        `repair: cross-file coordinated repair candidates=${coordinatedTargets.join(", ")}`,
      );
      evidence.push(`repair-candidate-files:${coordinatedTargets.join(",")}`);
      const processedCrossFilePaths = new Set<string>();
      const remainingCrossFilePaths = new Set<string>();
      const failedEntries: Array<{
        path: string;
        failureCode: "read-failed" | "patch-generation-failed" | "write-failed";
        reason: string;
      }> = [];
      const skippedEntries: Array<{ path: string; reason: string }> = [];
      for (const linkedPath of coordinatedTargets) {
        const linkedRead = await dispatchRuntimeTool({
          dispatcher: input.dispatcher,
          events,
          toolName: "read",
          taskId: `task_${input.sessionId}_${input.turn}_cross_read_${linkedPath.replace(/[^\w.-]+/g, "_")}`,
          args: { path: linkedPath },
          workspaceRoot: input.workspaceRoot,
          sessionId: input.sessionId,
          abortSignal: input.abortSignal,
          requireApprovalEvent: false,
        });
        if (!linkedRead.success) {
          const reason = linkedRead.error ?? "cross-file read failed";
          failedFiles.push({ path: linkedPath, reason });
          failedEntries.push({
            path: linkedPath,
            failureCode: "read-failed",
            reason,
          });
          if (shouldRetainCrossFileFailureInRemaining("read-failed", reason)) {
            remainingCrossFilePaths.add(linkedPath);
          } else {
            processedCrossFilePaths.add(linkedPath);
          }
          patches.push({
            path: linkedPath,
            operation: "replace",
            status: "failed",
            failureCode: "read-failed",
            reason,
          });
          continue;
        }
        const linkedContent = linkedRead.output ?? "";
        if (!linkedContent.includes(replaceDirective.from)) {
          const reason = "Replace source text not found in target file.";
          notes.push(
            `repair: cross-file patch generation failed for ${linkedPath} (${reason})`,
          );
          failedFiles.push({ path: linkedPath, reason });
          failedEntries.push({
            path: linkedPath,
            failureCode: "patch-generation-failed",
            reason,
          });
          if (
            shouldRetainCrossFileFailureInRemaining(
              "patch-generation-failed",
              reason,
            )
          ) {
            remainingCrossFilePaths.add(linkedPath);
          } else {
            processedCrossFilePaths.add(linkedPath);
          }
          patches.push({
            path: linkedPath,
            operation: "replace",
            status: "failed",
            failureCode: "patch-generation-failed",
            reason,
          });
          continue;
        }
        const linkedInstruction = resolveMutationInstruction(
          {
            ...input.plan,
            taskKind: "edit-file",
            targetPath: linkedPath,
          },
          input.prompt,
          linkedContent,
          undefined,
          replaceDirective,
        );
        if (isMutationInstructionFailure(linkedInstruction)) {
          failedFiles.push({
            path: linkedPath,
            reason: linkedInstruction.reason,
          });
          failedEntries.push({
            path: linkedPath,
            failureCode: "patch-generation-failed",
            reason: linkedInstruction.reason,
          });
          if (
            shouldRetainCrossFileFailureInRemaining(
              "patch-generation-failed",
              linkedInstruction.reason,
            )
          ) {
            remainingCrossFilePaths.add(linkedPath);
          } else {
            processedCrossFilePaths.add(linkedPath);
          }
          patches.push({
            path: linkedPath,
            operation: "replace",
            status: "failed",
            failureCode: "patch-generation-failed",
            reason: linkedInstruction.reason,
          });
          continue;
        }
        const linkedMutationTarget = path.isAbsolute(linkedPath)
          ? linkedPath
          : path.join(input.workspaceRoot, linkedPath);
        const currentLinkedMutationScope =
          deriveCurrentPermissionRequestFromToolInput({
            toolName: "edit",
            operation: "write",
            target: linkedMutationTarget,
            workspaceRoot: input.workspaceRoot,
            source: "approval-request",
            lineageHint: "edit-file-cross",
          });
        appendCurrentRequestScopeEvidence(evidence, currentLinkedMutationScope);
        const linkedMutation = await executeFileMutationBranch({
          path: linkedPath,
          content: linkedInstruction.content,
          operation: "replace",
          changedLines: linkedInstruction.changedLines,
          addedLines: linkedInstruction.addedLines,
          removedLines: linkedInstruction.removedLines,
          failureReason: "cross-file mutation failed",
          appliedNote: `repair: cross-file coordinated mutation applied on ${linkedPath}`,
          appliedEvidence: `repair-cross-file applied on ${linkedPath}`,
          recordAppliedContent: false,
          dispatch: () =>
            dispatchRuntimeTool({
              dispatcher: input.dispatcher,
              events,
              toolName: "edit",
              taskId: `task_${input.sessionId}_${input.turn}_cross_edit_${linkedPath.replace(/[^\w.-]+/g, "_")}`,
              args: { path: linkedPath, content: linkedInstruction.content },
              workspaceRoot: input.workspaceRoot,
              sessionId: input.sessionId,
              abortSignal: input.abortSignal,
              requireApprovalEvent: true,
            }),
        });
        mutationResults.push(linkedMutation);
        if (linkedMutation.failedFile) {
          failedFiles.push(linkedMutation.failedFile);
          failedEntries.push({
            path: linkedPath,
            failureCode: "write-failed",
            reason: linkedMutation.failedFile.reason,
          });
          if (
            shouldRetainCrossFileFailureInRemaining(
              "write-failed",
              linkedMutation.failedFile.reason,
            )
          ) {
            remainingCrossFilePaths.add(linkedPath);
          } else {
            processedCrossFilePaths.add(linkedPath);
          }
          patches.push(linkedMutation.patch);
          continue;
        }
        if (linkedMutation.changedFile) {
          changedFiles.push(linkedMutation.changedFile);
        }
        processedCrossFilePaths.add(linkedPath);
        patches.push(linkedMutation.patch);
        if (linkedMutation.note) {
          notes.push(linkedMutation.note);
        }
        if (linkedMutation.evidence) {
          evidence.push(linkedMutation.evidence);
        }
      }
      const remainingCrossFileTargets = coordinatedTargets.filter((candidate) =>
        remainingCrossFilePaths.has(candidate),
      );
      const degradationDecision = shouldDegradeCrossFileRemaining({
        previousRemainingTargets: input.plan.previousRemainingTargets ?? [],
        previousFailedEntries: input.plan.previousFailedEntries ?? [],
        currentRemainingTargets: remainingCrossFileTargets,
        currentFailedEntries: failedEntries,
      });
      if (degradationDecision.shouldDegrade) {
        degradedCrossFileTargets = degradationDecision.degradedTargets;
        crossFileDegradationReason = degradationDecision.reason;
        for (const degradedPath of degradationDecision.degradedTargets) {
          failedFiles.push({
            path: degradedPath,
            reason: `continuation-degraded: ${degradationDecision.reason}`,
          });
        }
        notes.push(`repair degradation: ${degradationDecision.reason}`);
        evidence.push(
          `repair-degradation:triggered:${degradationDecision.degradedTargets.join(",")}`,
        );
        evidence.push("repair-degradation-no-progress:true");
        evidence.push(
          `repair-degradation-reason:${degradationDecision.reason}`,
        );
      }
      crossFileRemainingTargets = remainingCrossFileTargets;
      crossFileFailedByReason = failedEntries;
      crossFileSkippedFiles = skippedEntries;
      evidence.push(
        `repair-processed-files:${
          processedCrossFilePaths.size > 0
            ? Array.from(processedCrossFilePaths).join(",")
            : "(none)"
        }`,
      );
      evidence.push(
        `repair-remaining-files:${
          degradationDecision.shouldDegrade
            ? "(none)"
            : remainingCrossFileTargets.length > 0
              ? remainingCrossFileTargets.join(",")
              : "(none)"
        }`,
      );
      evidence.push(
        `repair-failed-files:${
          failedEntries.length > 0
            ? failedEntries
                .map(
                  (entry) =>
                    `${entry.path}::${entry.failureCode}::${truncateText(entry.reason, 80)}`,
                )
                .join("|")
            : "(none)"
        }`,
      );
      evidence.push(
        `repair-skipped-files:${
          skippedEntries.length > 0
            ? skippedEntries
                .map((entry) => `${entry.path}::${entry.reason}`)
                .join("|")
            : "(none)"
        }`,
      );
      evidence.push(
        `repair-outcome:${
          degradationDecision.shouldDegrade
            ? "degraded-terminal"
            : remainingCrossFileTargets.length > 0
              ? "partial-complete-with-remaining"
              : failedEntries.length > 0
                ? "partial-complete-with-failures"
                : "completed"
        }`,
      );
    }
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
  }

  const verificationPlan = planWorkflowVerification({
    taskKind: input.plan.taskKind,
    prompt: input.prompt,
    changedFiles,
    explicitVerifyRequested: input.plan.verifyAfterEdit,
    explicitVerifyCommand: input.plan.verifyAfterEdit
      ? input.plan.verifyCommand
      : undefined,
  });

  if (verificationPlan.mode === "low-risk") {
      const lowRiskVerificationPlan = planLowRiskVerification({
        prompt: input.prompt,
        changedFiles,
        unchangedAssertions,
        appliedContentByPath,
        protectedSnapshots,
        patches,
      });
      const {
        fileContentAssertions,
        contentAssertion,
        consistencyAssertion,
        uniqueContentAssertions,
        fileAssertionReadPlan,
      } = lowRiskVerificationPlan;
      if (consistencyAssertion) {
        const verifyReadResults = await Promise.all(
          consistencyAssertion.paths.map(async (targetPath) => {
            const readResult = await dispatchRuntimeTool({
              dispatcher: input.dispatcher,
              events,
              toolName: "read",
              taskId: `task_${input.sessionId}_${input.turn}_verify_read_${hashStableId(targetPath)}`,
              args: { path: targetPath },
              workspaceRoot: input.workspaceRoot,
              sessionId: input.sessionId,
              abortSignal: input.abortSignal,
              requireApprovalEvent: false,
            });
            return { path: targetPath, result: readResult };
          }),
        );
        const unreadable = verifyReadResults.find(
          (entry) => !entry.result.success,
        );
        if (unreadable) {
          verification = {
            status: "blocked",
            reason:
              unreadable.result.error ??
              `Could not read ${unreadable.path} for consistency verification.`,
            selectionScope: "focused",
            selectionSource: "explicit-user",
            blockerKind: "environment-not-ready",
            nextAction:
              "Read all files participating in the consistency check, then rerun verification.",
          };
          for (const path of changedFiles) {
            unverifiedFiles.push({ path, reason: verification.reason });
          }
          repairNotes.push("verify blocked: consistency readback unavailable");
          notes.push("verify blocked: consistency readback unavailable");
        } else {
          const sourceRead = verifyReadResults.find(
            (entry) => entry.path === consistencyAssertion.sourcePath,
          );
          const sourceItems = extractConsistencyItems(
            sourceRead?.result.output ?? "",
          );
          if (sourceItems.length === 0) {
            verification = {
              status: "blocked",
              reason: `${consistencyAssertion.sourcePath} has no comparable non-empty items for consistency verification.`,
              selectionScope: "focused",
              selectionSource: "explicit-user",
              blockerKind: "unknown",
              nextAction:
                "Add a concrete source item or specify the exact text that should be reflected.",
            };
            for (const path of changedFiles) {
              unverifiedFiles.push({ path, reason: verification.reason });
            }
            repairNotes.push("verify blocked: no comparable source items");
            notes.push("verify blocked: consistency source empty");
          } else {
            const missing = findMissingConsistencyItems({
              sourceItems,
              targets: verifyReadResults.filter(
                (entry) => entry.path !== consistencyAssertion.sourcePath,
              ),
            });
            if (missing) {
              verification = {
                status: "failed",
                reason: `${missing.targetPath} is missing source item from ${consistencyAssertion.sourcePath}: ${missing.item}`,
                selectionScope: "focused",
                selectionSource: "explicit-user",
                nextAction:
                  "Update the derived file to reflect the missing source item, then rerun verification.",
              };
              for (const path of changedFiles) {
                unverifiedFiles.push({ path, reason: verification.reason });
              }
              repairNotes.push(
                "verify failed: multi-file consistency mismatch",
              );
              notes.push("verify failed: multi-file consistency");
            } else {
              verification = {
                status: "passed",
                reason: `multi-file consistency verification passed: ${consistencyAssertion.paths.join(" <-> ")}`,
                selectionScope: "focused",
                selectionSource: "explicit-user",
              };
              verifiedFiles.push(...consistencyAssertion.paths);
              notes.push(
                `verify passed: multi-file consistency ${consistencyAssertion.paths.join(",")}`,
              );
              evidence.push(
                `verify-consistency:${consistencyAssertion.sourcePath}->${consistencyAssertion.paths
                  .filter((entry) => entry !== consistencyAssertion.sourcePath)
                  .join(",")}`,
              );
            }
          }
        }
      } else {
        if (
          fileContentAssertions.length > 0 ||
          unchangedAssertions.length > 0
        ) {
          const verifyReadResults = await Promise.all(
            fileAssertionReadPlan.map(async (entry) => {
              if (entry.source !== "read-tool") {
                return {
                  path: entry.path,
                  result: { success: true, output: entry.output, error: undefined },
                };
              }
              const readResult = await dispatchRuntimeTool({
                dispatcher: input.dispatcher,
                events,
                toolName: "read",
                taskId: `task_${input.sessionId}_${input.turn}_verify_read_${hashStableId(entry.path)}`,
                args: { path: entry.path },
                workspaceRoot: input.workspaceRoot,
                sessionId: input.sessionId,
                abortSignal: input.abortSignal,
                requireApprovalEvent: false,
              });
              return { path: entry.path, result: readResult };
            }),
          );
          const unreadable = verifyReadResults.find(
            (entry) => !entry.result.success,
          );
          let missingExpected:
            | { path: string; expectedText: string }
            | undefined;
          for (const assertionGroup of uniqueContentAssertions) {
            const readEntry = verifyReadResults.find(
              (entry) => entry.path === assertionGroup.path,
            );
            if (!readEntry?.result.success) {
              continue;
            }
            const comparableOutput = normalizeComparableText(
              readEntry.result.output ?? "",
            );
            const missing = assertionGroup.expected.find(
              (assertion) =>
                !comparableOutput.includes(
                  normalizeComparableText(assertion.expectedText),
                ),
            );
            if (missing) {
              missingExpected = {
                path: assertionGroup.path,
                expectedText: missing.expectedText,
              };
              break;
            }
          }
          const changedProtected = verifyReadResults.find((entry) => {
            const snapshot = protectedSnapshots.get(entry.path);
            return (
              entry.result.success &&
              snapshot !== undefined &&
              (entry.result.output ?? "") !== snapshot
            );
          });
          const missingSnapshot = unchangedAssertions.find(
            (assertion) => !protectedSnapshots.has(assertion.path),
          );
          if (unreadable) {
            verification = {
              status: "blocked",
              reason:
                unreadable.result.error ??
                `Could not read ${unreadable.path} for content verification.`,
              selectionScope: "focused",
              selectionSource: "explicit-user",
              blockerKind: "environment-not-ready",
              nextAction:
                "Read the changed files successfully, then rerun the content verification.",
            };
            for (const path of changedFiles) {
              unverifiedFiles.push({ path, reason: verification.reason });
            }
            repairNotes.push(
              "verify blocked: file content readback unavailable",
            );
            notes.push("verify blocked: file content readback unavailable");
          } else if (missingSnapshot) {
            verification = {
              status: "blocked",
              reason: `Could not capture original content for unchanged verification: ${missingSnapshot.path}`,
              selectionScope: "focused",
              selectionSource: "explicit-user",
              blockerKind: "environment-not-ready",
              nextAction:
                "Read the protected file before editing, then rerun unchanged verification.",
            };
            unverifiedFiles.push({
              path: missingSnapshot.path,
              reason: verification.reason,
            });
            repairNotes.push("verify blocked: protected file snapshot missing");
            notes.push("verify blocked: protected file snapshot missing");
          } else if (missingExpected) {
            verification = {
              status: "failed",
              reason: `${missingExpected.path} does not contain expected text: ${missingExpected.expectedText}`,
              selectionScope: "focused",
              selectionSource: "explicit-user",
              nextAction:
                "Update the referenced file to include the expected text, then rerun verification.",
            };
            unverifiedFiles.push({
              path: missingExpected.path,
              reason: verification.reason,
            });
            repairNotes.push("verify failed: expected file content not found");
            notes.push("verify failed: file content assertion");
          } else if (changedProtected) {
            verification = {
              status: "failed",
              reason: `${changedProtected.path} changed but was expected to remain unchanged.`,
              selectionScope: "focused",
              selectionSource: "explicit-user",
              nextAction:
                "Restore the protected file, then rerun unchanged-file verification.",
            };
            unverifiedFiles.push({
              path: changedProtected.path,
              reason: verification.reason,
            });
            repairNotes.push("verify failed: protected file changed");
            notes.push("verify failed: unchanged file assertion");
          } else {
            verification = {
              status: "passed",
              reason: `content verification passed: ${[
                ...fileContentAssertions.map(
                  (assertion) =>
                    `${assertion.path} contains ${assertion.expectedText}`,
                ),
                ...unchangedAssertions.map(
                  (assertion) => `${assertion.path} unchanged`,
                ),
              ].join("; ")}`,
              selectionScope: "focused",
              selectionSource: "explicit-user",
            };
            verifiedFiles.push(
              ...uniqueStable([
                ...fileContentAssertions.map((assertion) => assertion.path),
                ...unchangedAssertions.map((assertion) => assertion.path),
              ]),
            );
            notes.push(
              "verify passed: file-specific content/unchanged assertions",
            );
            evidence.push(
              `verify-file-content:${fileContentAssertions
                .map(
                  (assertion) => `${assertion.path}:${assertion.expectedText}`,
                )
                .join("|")}`,
            );
            if (unchangedAssertions.length > 0) {
              evidence.push(
                `verify-unchanged:${unchangedAssertions
                  .map((assertion) => assertion.path)
                  .join("|")}`,
              );
            }
          }
        } else if (contentAssertion) {
          const verifyReadResults = await Promise.all(
            changedFiles.map(async (changedPath) => {
              const readResult = await dispatchRuntimeTool({
                dispatcher: input.dispatcher,
                events,
                toolName: "read",
                taskId: `task_${input.sessionId}_${input.turn}_verify_read_${hashStableId(changedPath)}`,
                args: { path: changedPath },
                workspaceRoot: input.workspaceRoot,
                sessionId: input.sessionId,
                abortSignal: input.abortSignal,
                requireApprovalEvent: false,
              });
              return { path: changedPath, result: readResult };
            }),
          );
          const unreadable = verifyReadResults.find(
            (entry) => !entry.result.success,
          );
          const missingExpected = verifyReadResults.find(
            (entry) =>
              entry.result.success &&
              !(entry.result.output ?? "").includes(
                contentAssertion.expectedText,
              ),
          );

          if (unreadable) {
            verification = {
              status: "blocked",
              reason:
                unreadable.result.error ??
                `Could not read ${unreadable.path} for content verification.`,
              selectionScope: "focused",
              selectionSource: "explicit-user",
              blockerKind: "environment-not-ready",
              nextAction:
                "Read the changed file successfully, then rerun the content verification.",
            };
            for (const path of changedFiles) {
              unverifiedFiles.push({ path, reason: verification.reason });
            }
            repairNotes.push("verify blocked: content readback unavailable");
            notes.push("verify blocked: content readback unavailable");
          } else if (missingExpected) {
            verification = {
              status: "failed",
              reason: `${missingExpected.path} does not contain expected text: ${contentAssertion.expectedText}`,
              selectionScope: "focused",
              selectionSource: "explicit-user",
              nextAction:
                "Update the changed file to include the expected text, then rerun verification.",
            };
            for (const path of changedFiles) {
              unverifiedFiles.push({ path, reason: verification.reason });
            }
            repairNotes.push("verify failed: expected content not found");
            notes.push("verify failed: content assertion");
          } else {
            verification = {
              status: "passed",
              reason: `content verification passed: contains ${contentAssertion.expectedText}`,
              selectionScope: "focused",
              selectionSource: "explicit-user",
            };
            verifiedFiles.push(...changedFiles);
            notes.push(
              `verify passed: content contains ${contentAssertion.expectedText}`,
            );
            evidence.push(
              `verify-content-contains:${changedFiles.join(",")}:${contentAssertion.expectedText}`,
            );
          }
        } else {
          verification = {
            status: "blocked",
            reason:
              "Verify intent was detected, but no verify strategy could be resolved from the prompt.",
            selectionScope: "focused",
            selectionSource: "explicit-user",
            blockerKind: "no-verify-strategy",
            nextAction:
              "Specify verify intent explicitly with test/build/check keywords so a concrete verify command can be selected.",
          };
          for (const path of changedFiles) {
            unverifiedFiles.push({
              path,
              reason: verification.reason,
            });
          }
          repairNotes.push(
            "verify blocked: no verify strategy resolved from prompt; provide explicit test/build/check intent",
          );
          notes.push("verify blocked: no verify strategy");
        }
      }
  } else if (verificationPlan.mode === "command" && verificationPlan.command) {
    const verifyCommand = verificationPlan.command;
    const currentVerifyScope = deriveCurrentPermissionRequestFromToolInput({
      toolName: "bash",
      operation: "spawn",
      target: verifyCommand,
      workspaceRoot: input.workspaceRoot,
      source: "verification-command",
      lineageHint: "verify-after-edit",
    });
    appendCurrentRequestScopeEvidence(evidence, currentVerifyScope);

    for (let attempt = 1; attempt <= verificationPlan.maxAttempts; attempt += 1) {
      const verifyResult = await dispatchRuntimeTool({
        dispatcher: input.dispatcher,
        events,
        toolName: "bash",
        taskId:
          attempt === 1
            ? `task_${input.sessionId}_${input.turn}_verify`
            : `task_${input.sessionId}_${input.turn}_verify_retry_${attempt}`,
        args: { command: verifyCommand },
        workspaceRoot: input.workspaceRoot,
        sessionId: input.sessionId,
        abortSignal: input.abortSignal,
        requireApprovalEvent: true,
        provenanceCollector,
      });
      const failure = verifyResult.success
        ? undefined
        : classifyVerificationFailure(verifyResult);
      const retry = planWorkflowVerificationRetry({
        plan: verificationPlan,
        attempt,
        outcome: verifyResult.success
          ? "passed"
          : failure?.status === "blocked"
            ? "blocked"
            : "failed",
      });
      const projected = projectWorkflowCommandVerification({
        plan: verificationPlan,
        result: verifyResult,
        attempt,
        retry,
        targetPath: input.plan.targetPath,
        workspaceRoot: input.workspaceRoot,
        verifyLikeCommand: isVerifyLikeCommand(verifyCommand),
      });
      verification = projected.verification;

      if (retry.status === "retry-planned") {
        notes.push(
          `verify retry planned: ${verifyCommand} (${attempt}/${verificationPlan.maxAttempts})`,
        );
        evidence.push(`verify-retry:${retry.status}:${retry.reasonCode}`);
        continue;
      }

      notes.push(projected.note);
      evidence.push(...projected.evidence);
      if (verifyResult.success) {
        verifiedFiles.push(...changedFiles);
      } else {
        for (const path of changedFiles) {
          unverifiedFiles.push({
            path,
            reason:
              verification.reason ??
              "verify failed; inspect output and repair before next edit",
          });
        }
        repairNotes.push(
          verification.status === "blocked"
            ? `verify blocked after edit; ${verification.nextAction}`
            : "verify failed after edit; inspect failing command output before continuing edits",
        );
      }
      break;
    }
  } else if (
    verificationPlan.mode === "skipped" ||
    verificationPlan.mode === "unavailable"
  ) {
    verification = projectSkippedWorkflowVerification(verificationPlan);
    for (const path of changedFiles) {
      unverifiedFiles.push({
        path,
        reason: verification.reason ?? "verification skipped",
      });
    }
    notes.push(`verify skipped: ${verification.reason ?? "not available"}`);
  } else if (changedFiles.length > 0) {
    for (const path of changedFiles) {
      unverifiedFiles.push({
        path,
        reason: "verify step was not requested in prompt",
      });
    }
    verification = projectNotRequestedWorkflowVerification(verificationPlan);
  }

  if (failedFiles.length > 0 && repairNotes.length === 0) {
    repairNotes.push(
      "operation failed; inspect failed items and rerun with clearer target/instruction",
    );
  }

  const resultContract = projectWorkflowRuntimeResultContract({
    workspaceRoot: input.workspaceRoot,
    preRunGitChangeSet,
    attributeChangeSet: input.plan.taskKind !== "run-command",
    handoff:
      input.plan.taskKind === "run-command"
        ? {
          capabilityPlan: {
            taskKind: input.plan.taskKind,
            targetPath: input.plan.targetPath,
            directCommand: dispatchedRunCommand ?? verification.command,
            verification,
            verifyAfterEdit: input.plan.verifyAfterEdit,
            inspectFirst: input.plan.inspectFirst,
            continuationLineage: input.plan.continuationLineage,
          },
          receipts: {
            evidence,
            continuationEvidence: input.plan.continuationLineage,
            verification,
          },
          command: {
            command: dispatchedRunCommand ?? verification.command ?? "command",
            changedFiles,
            failedFiles,
            patches,
            verifiedFiles,
            unverifiedFiles,
            verification,
            repairNotes,
            evidence,
            provenance: summarizeToolRuntimeProvenance(provenanceCollector),
          },
        }
        : {
          capabilityPlan: {
            taskKind: input.plan.taskKind,
            targetPath: input.plan.targetPath,
            blockedReason: input.plan.blockedReason,
            directCommand: input.plan.directCommand,
            verification,
            verifyAfterEdit: input.plan.verifyAfterEdit,
            inspectFirst: input.plan.inspectFirst,
            continuationLineage: input.plan.continuationLineage,
          },
          receipts: {
            evidence,
            continuationEvidence: input.plan.continuationLineage,
            verification,
          },
          mutation: {
            taskKind: input.plan.taskKind,
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
          },
        },
  });

  return {
    events,
    notes,
    codingResult: resultContract.codingResult,
    userFacingOutput: resultContract.userFacingOutput,
  };
}

function isCorrectionFollowUpPrompt(prompt: string): boolean {
  return /(?:\u4e0d\u662f\u8fd9\u4e2a\u610f\u601d|\u6211\u8981\u7684\u662f|\u4e0d\u662f.*\u800c\u662f|\u4e0d\u662f\u8fd9\u4e48\u6539|\u4fdd\u7559.*\u4e0d\u52a8|\u53ea\u6539\u7b2c[\u4e00\u4e8c\u4e09\u56db\d]+\u884c|\u91cd\u7b54\u4e0a\u4e00\u9898|\u7ee7\u7eed\u521a\u624d\u90a3\u4e2a\u6587\u4ef6|\u4e0d\u662f\u65b9\u6cd5|correction:|directly summarize|not this meaning|redo previous answer|revise last answer|not that edit)/i.test(
    prompt,
  );
}

function isAnswerRepairFollowUpPrompt(prompt: string): boolean {
  return /(?:so where is your summary|where(?:'s| is)\s+(?:the|your)\s+(?:summary|explanation)|go on with the summary|continue the summary|continue the explanation|i asked for .*summary|i asked for .*explain|not file info, summarize content|give the actual summary|so your summary\?|so your explanation\?|所以你的总结呢|我要的是内容总结|不是文件信息|直接给摘要|继续解释刚才那个文件|继续总结刚才那个文件)/i.test(
    prompt,
  );
}

function isAmbiguousGroundedRepairFollowUp(prompt: string): boolean {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (normalized.length > 24) {
    return false;
  }
  return /^(then\??|go on|continue|and then\??|\u7ee7\u7eed|\u7136\u540e\u5462|\u63a5\u7740\u5462|\u518d\u7ee7\u7eed)$/.test(
    normalized,
  );
}

function isExecutionCorrectionFollowUpPrompt(prompt: string): boolean {
  return /(?:\u4e0d\u662f\u8fd9\u4e48\u6539|\u4fdd\u7559.*\u4e0d\u52a8|\u53ea\u6539\u7b2c[\u4e00\u4e8c\u4e09\u56db\d]+\u884c|\u7ee7\u7eed\u4fee\u521a\u624d\u90a3\u4e2a\u5931\u8d25|\u6309\u521a\u624d\u90a3\u4e2a\u7ed3\u679c\u7ee7\u7eed|not that edit|keep signature|don't overwrite|continue fixing the previous failure|continue that failed fix)/i.test(
    prompt,
  );
}

function prefersTestOverBuildInFollowUp(prompt: string): boolean {
  return /(?:\u5148\u522b\u8dd1\s*build|\u5148\u770b\s*test|\u5148\u4fee\s*test|dont run build|don't run build|run tests first|test first)/i.test(
    prompt,
  );
}

function isVerifyContinuationFollowUpPrompt(prompt: string): boolean {
  return /(?:\b(?:continue|rerun|re-run|retry|run|execute)\b.*\b(?:verify|verification|test|tests|build|lint|check)\b|\b(?:verify|verification|test|tests|build|lint|check)\b.*\b(?:again|retry|rerun|re-run|continue)\b|\u7ee7\u7eed.*(?:\u9a8c\u8bc1|\u6d4b\u8bd5|\u6784\u5efa|\u7f16\u8bd1|\u68c0\u67e5)|\u91cd\u8dd1.*(?:\u6d4b\u8bd5|\u6784\u5efa|\u7f16\u8bd1)|\u518d\u8dd1.*(?:\u6d4b\u8bd5|\u6784\u5efa|\u7f16\u8bd1))/i.test(
    prompt,
  );
}

function isPostEditReadOnlyVerifyFollowUp(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  const hasVerifyOrCheck =
    /\b(?:verify|verification|check|confirm|ensure|make sure)\b/i.test(
      normalized,
    ) || /(?:\u9a8c\u8bc1|\u68c0\u67e5|\u786e\u8ba4)/i.test(normalized);
  if (!hasVerifyOrCheck) {
    return false;
  }
  const referencesPriorEdit =
    /\b(?:last|previous|prior|recent)\s+(?:change|edit|modification|update)\b/i.test(
      normalized,
    ) ||
    /\b(?:changed file|changed files|the change|the edit)\b/i.test(
      normalized,
    ) ||
    /(?:\u4e0a\u4e00\u6b21|\u521a\u624d|\u4e0a\u8f6e).*(?:\u4fee\u6539|\u6539\u52a8)/i.test(
      normalized,
    );
  const readOnlyCheck =
    /\b(?:contains|include|includes|has|matches|stays|remains)\b/i.test(
      normalized,
    ) ||
    /\b(?:do not|don't|dont|without)\s+(?:edit|modify|change|touch|write|replace|fix)\b/i.test(
      normalized,
    ) ||
    /(?:\u5305\u542b|\u4e0d\u8981\s*(?:\u4fee\u6539|\u5199\u5165|\u66ff\u6362))/i.test(
      normalized,
    );
  return referencesPriorEdit || readOnlyCheck;
}

function isWeakSeedTargetCarryoverPrompt(prompt: string): boolean {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized || normalized.length > 80) {
    return false;
  }
  return /^(?:check it|verify again|what next|what's next|fix it|continue|go on|proceed|do the next step)$/i.test(
    normalized,
  );
}

function isWeakRepairFollowUpPrompt(prompt: string): boolean {
  return /(?:use the failure above|same file.*not that fix|not the right fix|wrong direction|fix the real issue|continue repairing it|continue fixing it|不要再走刚才那个错误方向|同一个文件.*不是那个修法|基于上一次失败继续修复)/i.test(
    prompt,
  );
}

function isUltraWeakContinuationFollowUpPrompt(prompt: string): boolean {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized || normalized.length > 40) {
    return false;
  }
  if (
    /^(?:thanks|thank you|thx|ok|okay|got it|sounds good|great|nice|understood|收到|好的|明白了)$/i.test(
      normalized,
    )
  ) {
    return false;
  }
  return /^(?:keep going|go on|do it|finish it|keep at it|go ahead|carry on|继续|接着|继续吧|继续做|接着做|做吧|继续一下)$/i.test(
    normalized,
  );
}

function isTemporalSuccessorCuePrompt(prompt: string): boolean {
  const firstMeaningfulLine =
    prompt
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";
  const normalized = firstMeaningfulLine
    .trim()
    .toLowerCase()
    .replace(/[!?。！？]+$/g, "")
    .trim();
  if (!normalized || normalized.length > 24) {
    return false;
  }
  const words = normalized.split(/\s+/).filter((word) => word.length > 0);
  if (words.length === 0 || words.length > 4) {
    return false;
  }
  const allowedWords = new Set([
    "next",
    "then",
    "what",
    "what's",
    "whats",
    "is",
    "after",
    "that",
    "and",
  ]);
  for (const word of words) {
    if (!allowedWords.has(word)) {
      return false;
    }
  }
  const hasNext = words.includes("next");
  const hasThen = words.includes("then");
  const hasAfterThat = words.includes("after") && words.includes("that");
  return hasNext || hasThen || hasAfterThat;
}

function isAvoidPreviousDirectionPrompt(prompt: string): boolean {
  return /(?:same file.*not that (?:fix|change)|同一个文件.*不是那个修法|同文件.*不是那个改法)/i.test(
    prompt,
  );
}

function isCrossFileRepairFollowUpPrompt(prompt: string): boolean {
  return /(?:complete the rest|rest of files|other files|source\s*\+\s*test|source\s*\+\s*helper|source\s*\+\s*config|补齐其余文件|连同测试一起修|同步辅助文件|同步配置)/i.test(
    prompt,
  );
}

function extractKeyTerms(content: string): string[] {
  const tokens = (content.match(/[A-Za-z_][A-Za-z0-9_]{3,}/g) ?? [])
    .map((token) => token.toLowerCase())
    .filter(
      (token) =>
        ![
          "this",
          "that",
          "with",
          "from",
          "const",
          "function",
          "return",
        ].includes(token),
    );
  const freq = new Map<string, number>();
  for (const token of tokens) {
    freq.set(token, (freq.get(token) ?? 0) + 1);
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([token]) => token);
}

function isReflectiveExplainContinuationPrompt(prompt: string): boolean {
  return /(?:continue explaining that part|继续解释这部分)/i.test(prompt);
}

function isRepairContinuationFollowUpPrompt(prompt: string): boolean {
  return /(?:\bcontinue fixing(?:\s+that)?\b|\bthen continue(?:\s+fixing)?\b|\bwhy did it stop[^\n]*continue\b|\bwhat should we do next[^\n]*continue fixing\b|刚才为什么停了.*继续修|那继续修|继续修这个|就按刚才那个继续修|按这个继续修|那就按这个继续修)/i.test(
    prompt,
  );
}

function uniqueStable(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = normalizePathLike(value);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function hashStableId(value: string): string {
  return computeFragmentFingerprint(value).slice(0, 12);
}

function inferReplaceDirectiveFromContinuity(input: {
  readonly continuity: ContinuityStateLike;
  readonly preferredTarget?: string;
  readonly workspaceRoot: string;
}): { from: string; to: string } | undefined {
  const preferredTarget = input.preferredTarget
    ? normalizePathLike(input.preferredTarget)
    : undefined;
  const continuityEvidence = input.continuity.lastContinuationEvidence ?? [];
  for (let index = continuityEvidence.length - 1; index >= 0; index -= 1) {
    const entry = continuityEvidence[index];
    if (!entry) {
      continue;
    }
    const parsed = parseTransformEvidence(entry);
    if (!parsed) {
      continue;
    }
    const reboundPath =
      rebindContinuationTargetToWorkspace(parsed.path, input.workspaceRoot) ??
      normalizePathLike(parsed.path);
    if (preferredTarget && normalizePathLike(reboundPath) !== preferredTarget) {
      continue;
    }
    return { from: parsed.from, to: parsed.to };
  }
  return undefined;
}

function parseTransformEvidence(
  evidence: string,
): { path: string; from: string; to: string } | undefined {
  const directMatch = evidence.match(/^transform:(.+):(.+)=>(.+)$/i);
  if (directMatch?.[1] && directMatch?.[2] && directMatch?.[3]) {
    return {
      path: directMatch[1].trim(),
      from: directMatch[2].trim(),
      to: directMatch[3].trim(),
    };
  }
  const replanMatch = evidence.match(/^replan-transform:(.+):(.+)=>(.+)$/i);
  if (replanMatch?.[1] && replanMatch?.[2] && replanMatch?.[3]) {
    return {
      path: replanMatch[1].trim(),
      from: replanMatch[2].trim(),
      to: replanMatch[3].trim(),
    };
  }
  const rebindMatch = evidence.match(
    /^rebind-transform:(.+):.+=>.+->(.+)=>(.+)$/i,
  );
  if (rebindMatch?.[1] && rebindMatch?.[2] && rebindMatch?.[3]) {
    return {
      path: rebindMatch[1].trim(),
      from: rebindMatch[2].trim(),
      to: rebindMatch[3].trim(),
    };
  }
  // `rebind-blocker:*:stale-transform-already-applied` is retained for
  // explainability/history, but must not be re-consumed as executable
  // transform evidence on subsequent generic temporal follow-ups.
  return undefined;
}

function collectContinuationTransforms(input: {
  readonly continuity: ContinuityStateLike;
  readonly preferredTarget?: string;
  readonly workspaceRoot: string;
}): ContinuationTransform[] {
  const target = input.preferredTarget
    ? normalizePathLike(input.preferredTarget)
    : undefined;
  const transforms: ContinuationTransform[] = [];
  for (const entry of input.continuity.lastContinuationEvidence ?? []) {
    const parsed = parseTransformEvidence(entry);
    if (!parsed) {
      continue;
    }
    const normalizedPath = normalizePathLike(
      rebindContinuationTargetToWorkspace(parsed.path, input.workspaceRoot) ??
        parsed.path,
    );
    if (target && normalizedPath !== target) {
      continue;
    }
    transforms.push({
      path: normalizedPath,
      from: parsed.from,
      to: parsed.to,
    });
  }
  return transforms;
}

function isMutationInstructionFailure(
  instruction: ReturnType<typeof resolveMutationInstruction>,
): instruction is { ok: false; reason: string } {
  return instruction.ok === false;
}

function shouldBlockMutationForTargetResolution(input: {
  readonly blocker: TargetResolutionBlocker;
  readonly hasCorrectionCue: boolean;
  readonly hasCreateIntent: boolean;
  readonly hasEditIntent: boolean;
  readonly hasExecutionCorrectionCue: boolean;
  readonly hasFencedContent: boolean;
  readonly hasReplaceDirective: boolean;
}): boolean {
  return (
    input.blocker.code === "ambiguous-target" &&
    (input.hasCorrectionCue ||
      input.hasCreateIntent ||
      input.hasEditIntent ||
      input.hasExecutionCorrectionCue ||
      input.hasFencedContent ||
      input.hasReplaceDirective)
  );
}

function normalizePathLike(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/g, "")
    .trim();
}
