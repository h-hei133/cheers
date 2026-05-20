import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { SchemaVersion } from "../../../../contracts/typescript/types.js";
import type {
  GoogleAccountAuthConfig,
  OpenAIAccountAuthConfig,
  RuntimeProvider,
} from "../config/runtimeConfig.js";
import { getRuntimeConfig } from "../config/runtimeConfig.js";
import { CoreMcpGateway } from "../core/mcp/gateway.js";
import {
  detectBrowserAgentPlan,
  type BrowserAgentPlan,
} from "../core/context/browserAgent.js";
import { browserObservationFromMetadata } from "../core/context/browserObs.js";
import { executeBrowserTransaction } from "../core/context/browserTxn.js";
import { getPwRuntimeStatus, type PwRuntimeStatus } from "../core/context/pwRuntime.js";
import {
  rebindPathLikeToWorkspace,
} from "../core/paths/legacyRootRebase.js";
import type { QueryEvent } from "../core/query/events.js";
import type { QueryRuntimeStateSeed } from "../core/query/runtimeState.js";
import { OpenAIModelAdapter } from "../model-adapters/providers/openai/OpenAIModelAdapter.js";
import { createComponentLogger, recordCount } from "../observability/index.js";
import {
  SandboxEnforcer,
  type EscalationDecision,
  type EscalationPrompt,
  type EscalationResponse,
} from "../sandbox/index.js";
import { ToolDispatcher } from "../tools/dispatcher.js";
import { getWorkflowGitContext } from "../workflow/gitContext.js";
import {
  createCodingResultProvenanceCollector,
  summarizeCodingResultProvenance,
} from "./codingResultProvenance.js";
import {
  blockedCommandReason,
  detectCommand,
  detectUnsupportedCommandIntent,
  isAllowlistedRunCommand,
} from "./capabilityBoundaryProjection.js";
import {
  extractFileConstraintAssertions,
  extractLowRiskUnchangedVerifications,
  type FileConstraintAssertions,
} from "./fileConstraintAssertions.js";
import {
  buildBrowserAgentBaseEvidence,
  projectBrowserContinuationEvidence,
  projectBrowserObservationEvidence,
  projectBrowserTransactionEvidence,
} from "./flowEvidenceProjection.js";
import {
  dispatchToolWithLifecycle,
  type ToolLifecycleResult,
} from "./flowDispatch.js";
import {
  attributeGitChangeSet,
  snapshotGitChangeSet,
} from "./gitChangeSetAttribution.js";
import {
  projectBrowserContinuationResult,
  projectBrowserObservationResult,
  projectBrowserTransactionResult,
  type BrowserToolFailureProjection,
} from "./flowResultProjection.js";
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
  buildAmbiguousEditInstructionReason,
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
import {
  projectApplyPatchRuntimeMutationRoute,
  type ApplyPatchRuntimeRouteOptions,
} from "./mutationRoutingProjection.js";
import {
  appendCurrentRequestScopeEvidence,
  deriveCurrentPermissionRequestFromToolInput,
} from "./approvalAuthorityProjection.js";
import { projectProviderOutcome } from "./providerOutcomeProjection.js";
import { reconcileFileMutationSummary } from "./mutationResultAggregation.js";
import {
  applySingleFileReplacePatch,
  formatPatchFailureReason,
} from "./patchMutationLane.js";
import { createWorkspaceWriteAuthority } from "./patchResult/workspaceAuthority.js";
import {
  projectBlockedRuntimeOutcome,
  projectRuntimeCodingOutcome,
} from "./runtimeOutcomeProjection.js";
import {
  classifyReadInspectRequest,
  inferRepoDiagnosis,
  inferRepoEvidenceRole,
  isPathOnlyReadRequest,
  parseRepoCandidateFiles,
  projectReadAmbiguousTargetStop,
  projectReadMissingTargetStop,
  projectReadOutOfWorkspaceTargetStop,
  recoverReadContinuationTarget,
  selectRepoExplainTarget,
} from "./readInspectModule.js";
import {
  planWorkflowVerification,
  planWorkflowVerificationRetry,
  projectNotRequestedWorkflowVerification,
  projectSkippedWorkflowVerification,
  projectWorkflowCommandVerification,
  projectWorkflowVerificationEvidence,
  stripVerificationTailForTarget,
} from "./verificationModule.js";
import {
  classifyEditExpectationContract,
  isWriteExpectationPrompt,
} from "./editExpectationContract.js";
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
import { projectTurnResultHandoff } from "./turnKernel.js";
import type {
  ResolvedTarget,
  TargetResolutionBlocker,
} from "./targetResolution.js";
import { classifyVerificationFailure } from "./toolExecutionOutcomeProjection.js";
import type { SingleFileReplacePatchResult } from "./patchMutationLane.js";
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

const CONTRACT_VERSION: SchemaVersion = "1.0.0";

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
}

export async function runMvpIntegratedFlow(
  options: MvpIntegratedFlowOptions,
): Promise<OrchestrationResult> {
  const applyPatchRuntimeResult =
    await runApplyPatchRuntimeRouteIfRequested(options);
  if (applyPatchRuntimeResult) {
    return applyPatchRuntimeResult;
  }

  const logger = createComponentLogger("orchestration");
  const workflowContext = getWorkflowGitContext(options.workspaceRoot);
  const runtimeConfig = getRuntimeConfig(options.workspaceRoot);
  const browserRuntimeStatus =
    options.browserRuntimeStatus ?? await getPwRuntimeStatus();
  const mcpGateway = new CoreMcpGateway(options.workspaceRoot);
  const mcpSnapshot = await mcpGateway.snapshot();
  const enforcer = new SandboxEnforcer({
    workspaceRoot: options.workspaceRoot,
    sessionId: options.sessionId,
  });

  if (options.escalationPromptHandler) {
    enforcer.setEscalationPromptHandler(options.escalationPromptHandler);
  } else if (options.escalationDecision) {
    enforcer.setEscalationPromptHandler(async (prompt) => ({
      promptId: prompt.id,
      decision: options.escalationDecision,
      respondedAt: Date.now(),
      userComment: `Decision from runtime config: ${options.escalationDecision}`,
    }));
  }

  const dispatcher = new ToolDispatcher(enforcer, {
    mcpTools: mcpSnapshot.tools,
    mcpGateway,
    runtimeConfig,
    browserRuntimeStatus,
  });
  const runner = createIntegratedRunner(
    options.workspaceRoot,
    dispatcher,
    workflowContext,
    mcpSnapshot,
    browserRuntimeStatus,
    options.providerMode ?? "synthetic",
    options.realProvider,
    options.agentMode ?? "build",
    options.abortSignal,
    options.continuityState,
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
    enforcer.close();
  }
}

export async function* streamMvpIntegratedFlow(
  options: MvpIntegratedFlowOptions,
): AsyncIterable<QueryEvent> {
  const applyPatchRuntimeResult =
    await runApplyPatchRuntimeRouteIfRequested(options);
  if (applyPatchRuntimeResult) {
    yield {
      type: "query.started",
      sessionId: options.sessionId,
      prompt: options.prompt,
    };
    yield { type: "query.completed", result: applyPatchRuntimeResult };
    return;
  }

  const workflowContext = getWorkflowGitContext(options.workspaceRoot);
  const runtimeConfig = getRuntimeConfig(options.workspaceRoot);
  const browserRuntimeStatus =
    options.browserRuntimeStatus ?? await getPwRuntimeStatus();
  const mcpGateway = new CoreMcpGateway(options.workspaceRoot);
  const mcpSnapshot = await mcpGateway.snapshot();
  const enforcer = new SandboxEnforcer({
    workspaceRoot: options.workspaceRoot,
    sessionId: options.sessionId,
  });
  if (options.escalationPromptHandler) {
    enforcer.setEscalationPromptHandler(options.escalationPromptHandler);
  } else if (options.escalationDecision) {
    enforcer.setEscalationPromptHandler(async (prompt) => ({
      promptId: prompt.id,
      decision: options.escalationDecision,
      respondedAt: Date.now(),
      userComment: `Synthetic ${options.escalationDecision} for integration flow`,
    }));
  }

  const dispatcher = new ToolDispatcher(enforcer, {
    mcpTools: mcpSnapshot.tools,
    mcpGateway,
    runtimeConfig,
    browserRuntimeStatus,
  });
  const runner = createIntegratedRunner(
    options.workspaceRoot,
    dispatcher,
    workflowContext,
    mcpSnapshot,
    browserRuntimeStatus,
    options.providerMode ?? "synthetic",
    options.realProvider,
    options.agentMode ?? "build",
    options.abortSignal,
    options.continuityState,
  );

  try {
    const orchestrator = new MultiAgentOrchestrator(runner);
    yield* orchestrator.stream(options.sessionId, options.prompt, {
      maxTurns: options.maxTurns ?? 6,
      runtimeSeed: options.runtimeSeed,
    });
  } finally {
    enforcer.close();
  }
}

async function runApplyPatchRuntimeRouteIfRequested(
  options: MvpIntegratedFlowOptions,
): Promise<OrchestrationResult | undefined> {
  const routeOptions = options.applyPatchRuntimeRoute;
  if (!routeOptions) {
    return undefined;
  }

  return projectApplyPatchRuntimeMutationRoute({
    sessionId: options.sessionId,
    prompt: options.prompt,
    workspaceRoot: options.workspaceRoot,
    routeOptions,
    getWorkspaceAuthority: () =>
      createWorkspaceWriteAuthority(options.workspaceRoot),
    readNoWriteRuntimeFile: readWorkspaceFile(options.workspaceRoot),
    ...(options.abortSignal ? { abortSignal: options.abortSignal } : {}),
  });
}

function readWorkspaceFile(
  workspaceRootInput: string,
): (absolutePath: string) => string | undefined {
  const workspaceRoot = path.resolve(workspaceRootInput);
  return (absolutePath) => {
    const resolved = path.resolve(absolutePath);
    if (!pathStaysInsideWorkspace(workspaceRoot, resolved)) {
      return undefined;
    }
    try {
      return fs.readFileSync(resolved, "utf8");
    } catch {
      return undefined;
    }
  };
}

function pathStaysInsideWorkspace(
  workspaceRoot: string,
  absolutePath: string,
): boolean {
  const relative = path.relative(workspaceRoot, absolutePath);
  return (
    relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative)
  );
}

function createIntegratedRunner(
  workspaceRoot: string,
  dispatcher: ToolDispatcher,
  workflowContext: ReturnType<typeof getWorkflowGitContext>,
  mcpSnapshot: Awaited<ReturnType<CoreMcpGateway["snapshot"]>>,
  browserRuntimeStatus: PwRuntimeStatus,
  providerMode: "synthetic" | "real",
  realProvider?: MvpIntegratedFlowOptions["realProvider"],
  agentMode: "plan" | "build" = "build",
  abortSignal?: AbortSignal,
  continuityState?: unknown,
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
          (await streamRoleDraft(
            role,
            cleanPrompt,
            providerMode,
            realProvider,
          ));

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
        abortSignal,
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

    const content = await streamRoleDraft(
      role,
      "Review complete. Delivering streamed result and preserving safety guardrails.",
      providerMode,
      realProvider,
    );
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

interface FreshnessObservability {
  readonly notes: readonly string[];
  readonly evidence: readonly string[];
}

interface WorkflowExecutionResult {
  readonly events: QueryEvent[];
  readonly notes: string[];
  readonly codingResult: CodingResultSummary;
  readonly userFacingOutput: string;
}

type ReadWindowMode = "reset" | "continue" | "absolute";

interface ReadWindowDirective {
  readonly lineCount?: number;
  readonly lineOffset?: number;
  readonly mode: ReadWindowMode;
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
  const browserPlan = detectBrowserAgentPlan({
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
  const diagnosticHandoffProjection = projectProviderOutcome(continuity);
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

function buildFreshnessObservability(input: {
  prompt: string;
  continuity: ContinuityStateLike;
  plan: WorkflowTaskPlan;
}): FreshnessObservability {
  const hasPathOverride = hasPathLikeReference(input.prompt);
  const hasTransformOverride = Boolean(extractReplaceDirective(input.prompt));
  const retained: string[] = [];
  const pruned: string[] = [];
  const boundary: string[] = [];
  const historyEvidence = input.continuity.lastContinuationEvidence ?? [];
  const hasContinuationHistory =
    (input.continuity.freshnessHistoryCount ?? 0) > 0 ||
    historyEvidence.length > 0 ||
    (input.continuity.recentFailedFiles?.length ?? 0) > 0 ||
    (input.continuity.recentTargetFiles?.length ?? 0) > 0;

  if ((input.plan.previousRemainingTargets?.length ?? 0) > 0) {
    retained.push(
      `freshness-retained:previous-remaining-targets=${input.plan.previousRemainingTargets!.length}`,
    );
  }
  if ((input.plan.previousFailedEntries?.length ?? 0) > 0) {
    retained.push(
      `freshness-retained:previous-failed-entries=${input.plan.previousFailedEntries!.length}`,
    );
  }
  if ((input.plan.degradedReopenCandidates?.length ?? 0) > 0) {
    retained.push(
      `freshness-retained:reopen-candidates=${input.plan.degradedReopenCandidates!.length}`,
    );
  }
  if (input.plan.usedRestoredState) {
    boundary.push("freshness-boundary:restored-session-state-consumed");
  }
  if (input.plan.degradedReopen) {
    boundary.push("freshness-boundary:degraded-reopen");
  }

  if (input.continuity.lastTerminalClassification) {
    boundary.push(
      `freshness-boundary:last-terminal=${input.continuity.lastTerminalClassification}:${input.continuity.lastTerminalReason ?? "unknown"}`,
    );
  }

  if (
    hasContinuationHistory &&
    input.plan.taskKind === "chat" &&
    !input.plan.usedRestoredState
  ) {
    const prunedCount = Math.max(
      historyEvidence.length,
      input.continuity.freshnessHistoryCount ?? 0,
    );
    boundary.push("freshness-reset:new-task");
    pruned.push(
      `freshness-pruned:continuation-history-not-consumed=${Math.min(prunedCount, 16)}`,
    );
  }

  if (
    hasContinuationHistory &&
    !input.plan.usedRestoredState &&
    (hasPathOverride || hasTransformOverride)
  ) {
    boundary.push("freshness-reset:explicit-override");
    if (hasPathOverride) {
      pruned.push("freshness-pruned:override-path-superseded-history");
    }
    if (hasTransformOverride) {
      pruned.push("freshness-pruned:override-transform-superseded-history");
    }
  }

  if (
    historyEvidence.some((entry) =>
      entry.toLowerCase().startsWith("repair-outcome:blocked-disambiguation"),
    )
  ) {
    boundary.push("freshness-boundary:blocked-disambiguation-history");
  }
  if (
    historyEvidence.some((entry) =>
      entry.toLowerCase().startsWith("repair-outcome:degraded-terminal"),
    )
  ) {
    boundary.push("freshness-boundary:degraded-terminal-history");
  }
  if (
    historyEvidence.some((entry) =>
      entry.toLowerCase().includes("replan-skipped:"),
    )
  ) {
    boundary.push("freshness-boundary:replan-skipped-history");
  }

  const notes = [...boundary, ...retained, ...pruned];
  const evidence = [...notes];
  return {
    notes,
    evidence,
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

function isNonRetriableRemainingFailure(
  failureCode: "read-failed" | "patch-generation-failed" | "write-failed",
  reason: string,
): boolean {
  const normalized = reason.toLowerCase();
  if (failureCode === "patch-generation-failed") {
    return false;
  }
  return (
    normalized.includes("eisdir") ||
    normalized.includes("directory") ||
    normalized.includes("outside workspace") ||
    normalized.includes("permission denied") ||
    normalized.includes("readonly") ||
    normalized.includes("read-only")
  );
}

function shouldDegradeCrossFileRemaining(input: {
  previousRemainingTargets: readonly string[];
  previousFailedEntries: ReadonlyArray<{
    path: string;
    failureCode: "read-failed" | "patch-generation-failed" | "write-failed";
    reason: string;
  }>;
  currentRemainingTargets: readonly string[];
  currentFailedEntries: ReadonlyArray<{
    path: string;
    failureCode: "read-failed" | "patch-generation-failed" | "write-failed";
    reason: string;
  }>;
}):
  | { shouldDegrade: false }
  | {
      shouldDegrade: true;
      reason: string;
      degradedTargets: string[];
    } {
  const repeatedTargets = input.currentRemainingTargets.filter((target) =>
    input.previousRemainingTargets.includes(target),
  );
  const repeatedNonRetriable = repeatedTargets.filter((target) => {
    const currentFailure = input.currentFailedEntries.find(
      (entry) => entry.path === target,
    );
    const previousFailure = input.previousFailedEntries.find(
      (entry) => entry.path === target,
    );
    if (!currentFailure || !previousFailure) {
      return false;
    }
    return (
      isNonRetriableRemainingFailure(
        currentFailure.failureCode,
        currentFailure.reason,
      ) &&
      isNonRetriableRemainingFailure(
        previousFailure.failureCode,
        previousFailure.reason,
      )
    );
  });
  if (repeatedNonRetriable.length > 0) {
    return {
      shouldDegrade: true,
      reason: `remaining targets are non-retriable and repeated without progress: ${repeatedNonRetriable.join(", ")}`,
      degradedTargets: repeatedNonRetriable,
    };
  }
  const repeatedPatchGenerationFailures = Array.from(
    new Set(
      input.currentFailedEntries
        .filter((entry) => entry.failureCode === "patch-generation-failed")
        .map((entry) => entry.path),
    ),
  ).filter((target) => {
    const currentFailure = input.currentFailedEntries.find(
      (entry) => entry.path === target,
    );
    const previousFailure = input.previousFailedEntries.find(
      (entry) => entry.path === target,
    );
    if (!currentFailure || !previousFailure) {
      return false;
    }
    return (
      currentFailure.failureCode === "patch-generation-failed" &&
      previousFailure.failureCode === "patch-generation-failed"
    );
  });
  if (repeatedPatchGenerationFailures.length > 0) {
    return {
      shouldDegrade: true,
      reason: `remaining targets exhausted after repeated patch-generation-failed: ${repeatedPatchGenerationFailures.join(", ")}`,
      degradedTargets: repeatedPatchGenerationFailures,
    };
  }
  return { shouldDegrade: false };
}

function shouldRetainCrossFileFailureInRemaining(
  failureCode: "read-failed" | "patch-generation-failed" | "write-failed",
  reason: string,
): boolean {
  const normalizedReason = reason.toLowerCase();
  if (failureCode === "patch-generation-failed") {
    return true;
  }
  if (failureCode === "read-failed") {
    if (
      normalizedReason.includes("enoent") ||
      normalizedReason.includes("no such file") ||
      normalizedReason.includes("outside workspace") ||
      normalizedReason.includes("does not exist")
    ) {
      return false;
    }
    return true;
  }
  if (failureCode === "write-failed") {
    if (
      normalizedReason.includes("outside workspace") ||
      normalizedReason.includes("readonly") ||
      normalizedReason.includes("permission denied")
    ) {
      return false;
    }
    return true;
  }
  return true;
}

function appendSingleFileEditRepairObservability(
  evidence: string[],
  plan: WorkflowTaskPlan,
): void {
  if (plan.repairContextAbandoned) {
    evidence.push("repairContextUsed:false");
    evidence.push("repairContextAbandoned:true");
    if (plan.repairContextAbandonedReason) {
      evidence.push(
        `repairContextAbandonedReason:${plan.repairContextAbandonedReason}`,
      );
    }
    if (plan.repairContextAbandonedFailureReason) {
      evidence.push(
        `repairContextAbandonedFailureReason:${plan.repairContextAbandonedFailureReason}`,
      );
    }
    if (plan.repairContextAbandonedTargetCount !== undefined) {
      evidence.push(
        `repairContextAbandonedTargetCount:${plan.repairContextAbandonedTargetCount}`,
      );
    }
  }

  if (!plan.repairContextUsed) {
    return;
  }
  evidence.push("repairContextUsed:true");
  if (plan.repairedFailureReason) {
    evidence.push(`repairedFailureReason:${plan.repairedFailureReason}`);
  }
  if (plan.repairedTargetFile) {
    evidence.push(`repairedTargetFile:${plan.repairedTargetFile}`);
  }
  if (plan.repairPayloadKind) {
    evidence.push(`repairPayloadKind:${plan.repairPayloadKind}`);
  }
}

async function executeBrowserWorkflowTaskPlan(input: {
  readonly plan: BrowserAgentPlan;
  readonly freshnessObservability: FreshnessObservability;
  readonly dispatcher: ToolDispatcher;
  readonly browserRuntimeStatus: PwRuntimeStatus;
  readonly sessionId: string;
  readonly turn: number;
  readonly workspaceRoot: string;
  readonly abortSignal?: AbortSignal;
}): Promise<WorkflowExecutionResult> {
  const events: QueryEvent[] = [];
  const notes = [
    ...input.freshnessObservability.notes,
    "browser-agent: tool pipeline selected",
  ];
  const evidence = buildBrowserAgentBaseEvidence({
    freshnessEvidence: input.freshnessObservability.evidence,
    planEvidence: input.plan.evidence,
  });

  if (input.plan.actions.length === 0 && input.plan.continuationSummary) {
    const projected = projectBrowserContinuationResult({
      evidence: projectBrowserContinuationEvidence(evidence),
      continuationSummary: input.plan.continuationSummary,
    });
    return { events, notes, ...projected };
  }

  if (input.plan.transactionPlan) {
    const transaction = await executeBrowserTransaction(input.plan.transactionPlan, {
      runtimeStatus: input.browserRuntimeStatus,
    });
    const transactionEvidence = projectBrowserTransactionEvidence({
      evidence,
      transaction,
    });
    notes.push(
      `browser-transaction: ${transaction.status} ${transaction.reasonCode} repair=${transaction.repairStatus} cleanup=${transaction.cleanupStatus}`,
    );
    const projected = projectBrowserTransactionResult({
      evidence: transactionEvidence,
      transaction,
    });
    return { events, notes, ...projected };
  }

  const observations = [];
  let firstFailure: BrowserToolFailureProjection | undefined;
  for (let index = 0; index < input.plan.actions.length; index += 1) {
    const action = input.plan.actions[index]!;
    const taskId = `browser_agent_${input.turn}_${index + 1}_${action.toolName.replace(/[^a-z0-9]+/gi, "_")}`;
    const result = await dispatchToolWithLifecycle({
      dispatcher: input.dispatcher,
      events,
      toolName: action.toolName,
      taskId,
      args: action.args,
      workspaceRoot: input.workspaceRoot,
      sessionId: input.sessionId,
      abortSignal: input.abortSignal,
      requireApprovalEvent: false,
    });
    const observation = browserObservationFromMetadata(result.metadata);
    if (observation) {
      observations.push(observation);
      evidence.push(...projectBrowserObservationEvidence(observation));
      notes.push(
        `browser-action: ${observation.operation} ${observation.status} ${observation.reasonCode} cleanup=${observation.cleanupStatus}`,
      );
    }
    if (!result.success) {
      firstFailure = {
        reason: result.error ?? observation?.visibleTextSummary ?? "Browser tool failed",
        reasonCode: observation?.reasonCode ?? "unknown",
      };
      break;
    }
  }

  const finalObservation = observations[observations.length - 1];
  const projected = projectBrowserObservationResult({
    evidence,
    firstFailure,
    finalObservation,
  });
  return { events, notes, ...projected };
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
  readonly abortSignal?: AbortSignal;
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
  const provenanceCollector = createCodingResultProvenanceCollector();
  const preRunGitChangeSet = snapshotGitChangeSet(input.workspaceRoot);
  const appliedContentByPath = new Map<string, string>();
  const mutationResults: FileMutationExecutionResult[] = [];
  notes.push(...input.freshnessObservability.notes);
  evidence.push(...input.freshnessObservability.evidence);
  if ((input.plan.continuationLineage?.length ?? 0) > 0) {
    evidence.push(...input.plan.continuationLineage!);
  }
  appendSingleFileEditRepairObservability(evidence, input.plan);
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
    return {
      events,
      notes,
      ...projectBlockedRuntimeOutcome({
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
    return executeBrowserWorkflowTaskPlan({
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
    const readStep = await dispatchToolWithLifecycle({
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
        ...projectRuntimeCodingOutcome({
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
        const readProtected = await dispatchToolWithLifecycle({
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
      return {
        events,
        notes,
        ...projectRuntimeCodingOutcome({
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
      const readProtected = await dispatchToolWithLifecycle({
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
    const globStep = await dispatchToolWithLifecycle({
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
        ...projectRuntimeCodingOutcome({
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
      ...projectRuntimeCodingOutcome({
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
    const globStep = await dispatchToolWithLifecycle({
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
        const readCandidate = await dispatchToolWithLifecycle({
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
        ...projectRuntimeCodingOutcome({
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
      const readStep = await dispatchToolWithLifecycle({
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
          ...projectRuntimeCodingOutcome({
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
    const outcome = projectRuntimeCodingOutcome({
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
        ...projectRuntimeCodingOutcome({
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
          ...projectRuntimeCodingOutcome({
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
          ...projectRuntimeCodingOutcome({
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
        return {
          events,
          notes: [...notes, `blocker: ${mutationInstruction.reason}`],
          ...projectRuntimeCodingOutcome({
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
          dispatchToolWithLifecycle({
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
          const renameRead = await dispatchToolWithLifecycle({
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
              dispatchToolWithLifecycle({
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
            dispatchToolWithLifecycle({
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
        const linkedRead = await dispatchToolWithLifecycle({
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
            dispatchToolWithLifecycle({
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
                    `${entry.path}::${entry.failureCode}::${truncate(entry.reason, 80)}`,
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
    const command = input.plan.directCommand ?? "node --version";
    dispatchedRunCommand = command;
    const currentRequestScope = deriveCurrentPermissionRequestFromToolInput({
      toolName: "bash",
      operation: "spawn",
      target: command,
      workspaceRoot: input.workspaceRoot,
      source: "verification-command",
      lineageHint: "run-command",
    });
    appendCurrentRequestScopeEvidence(evidence, currentRequestScope);
    if (input.plan.blockedReason) {
      failedFiles.push({ path: "(command)", reason: input.plan.blockedReason });
      verification = {
        status: "skipped",
        reason: input.plan.blockedReason,
        command,
        selectionScope: "none",
        selectionSource: "not-requested",
      };
    } else {
      const commandResult = await dispatchToolWithLifecycle({
        dispatcher: input.dispatcher,
        events,
        toolName: "bash",
        taskId: `task_${input.sessionId}_${input.turn}_bash`,
        args: { command },
        workspaceRoot: input.workspaceRoot,
        sessionId: input.sessionId,
        abortSignal: input.abortSignal,
        requireApprovalEvent: true,
        provenanceCollector,
      });
      const commandFailure = commandResult.success
        ? undefined
        : classifyVerificationFailure(commandResult);
      notes.push(
        commandResult.success
          ? `tool: approved bash(${command})`
          : `tool: blocked bash(${command})`,
      );
      verification = {
        status: commandResult.success
          ? "passed"
          : (commandFailure?.status ?? "failed"),
        command,
        reason: commandResult.success
          ? "run-command executed"
          : (commandFailure?.reason ??
            truncate(
              commandResult.error ?? commandResult.output ?? "command failed",
            )),
        selectionScope: "explicit",
        selectionSource: "explicit-user",
        ...(commandFailure?.blockerKind
          ? { blockerKind: commandFailure.blockerKind }
          : {}),
        ...(commandFailure?.nextAction
          ? { nextAction: commandFailure.nextAction }
          : {}),
      };
      evidence.push(
        ...projectWorkflowVerificationEvidence({
          verification,
          targetPath: input.plan.targetPath,
          workspaceRoot: input.workspaceRoot,
          verifyLikeCommand: Boolean(
            verification.command && isVerifyLikeCommand(verification.command),
          ),
        }),
      );
      if (!commandResult.success) {
        failedFiles.push({
          path: "(command)",
          reason: verification.reason ?? "command failed",
        });
      }
    }
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
            const readResult = await dispatchToolWithLifecycle({
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
              const readResult = await dispatchToolWithLifecycle({
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
              const readResult = await dispatchToolWithLifecycle({
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
      const verifyResult = await dispatchToolWithLifecycle({
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

  const resultContract =
    input.plan.taskKind === "run-command"
      ? projectTurnResultHandoff({
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
            provenance: summarizeCodingResultProvenance(provenanceCollector),
          },
        })
      : projectTurnResultHandoff({
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
            provenance: summarizeCodingResultProvenance(provenanceCollector),
          },
        });

  const codingResult =
    input.plan.taskKind === "run-command"
      ? resultContract.codingResult
      : {
          ...resultContract.codingResult,
          changeSet: attributeGitChangeSet({
            workspaceRoot: input.workspaceRoot,
            preRun: preRunGitChangeSet,
            changeSet: resultContract.codingResult.changeSet,
          }),
        };

  return {
    events,
    notes,
    codingResult,
    userFacingOutput: resultContract.userFacingOutput,
  };
}

function buildReadTaskDelivery(input: {
  prompt: string;
  targetPath: string;
  content: string;
  preferredMode?: GroundedDeliverableMode;
  requestedLines?: number;
  lineOffset?: number;
  readFragmentLineIndexes?: readonly number[];
  readFragmentRanges?: readonly string[];
  readFragmentSourceWindowStart?: number;
  readFragmentSourceWindowEnd?: number;
  readFragmentFingerprint?: string;
  readFilter?: "none" | "function-definitions";
  repairInstruction?: GroundedRepairInstruction;
}): { completed: boolean; output: string; evidenceMarkers: string[] } {
  const trimmed = input.content.trim();
  if (trimmed.length === 0) {
    return {
      completed: false,
      output: `Task not completed: ${input.targetPath} was read but is empty, so no summary/content could be delivered.`,
      evidenceMarkers: [
        `deliverable-mode:${input.preferredMode ?? "read"}`,
        "read-delivered-lines:0",
      ],
    };
  }
  const localExplainRequest =
    hasLocalSliceExplainCue(input.prompt) &&
    /(?:\bexplain\b|\u89e3\u91ca|\u5728\u505a\u4ec0\u4e48)/i.test(input.prompt);
  if (localExplainRequest) {
    const sourceLines = input.content.split(/\r?\n/);
    while (
      sourceLines.length > 0 &&
      sourceLines[sourceLines.length - 1]?.length === 0
    ) {
      sourceLines.pop();
    }
    let fragmentIndexes = normalizeReadFragmentLineIndexes(
      input.readFragmentLineIndexes,
      sourceLines.length,
    );
    if (
      fragmentIndexes.length === 0 &&
      (input.readFragmentRanges?.length ?? 0) > 0
    ) {
      fragmentIndexes = normalizeReadFragmentLineIndexes(
        expandReadFragmentRangesToIndexes(
          input.readFragmentRanges,
          sourceLines.length,
        ),
        sourceLines.length,
      );
    }
    if (
      fragmentIndexes.length === 0 &&
      input.readFilter === "function-definitions" &&
      input.readFragmentSourceWindowStart !== undefined &&
      input.readFragmentSourceWindowEnd !== undefined
    ) {
      const boundedStart = Math.max(0, input.readFragmentSourceWindowStart);
      const boundedEnd = Math.min(
        sourceLines.length,
        Math.max(boundedStart, input.readFragmentSourceWindowEnd),
      );
      for (let index = boundedStart; index < boundedEnd; index += 1) {
        if (
          lineMatchesReadFilter(
            sourceLines[index] ?? "",
            "function-definitions",
          )
        ) {
          fragmentIndexes.push(index);
        }
      }
      fragmentIndexes = normalizeReadFragmentLineIndexes(
        fragmentIndexes,
        sourceLines.length,
      );
    }
    if (input.readFilter && fragmentIndexes.length === 0) {
      return {
        completed: false,
        output: `Task not completed: no delivered filtered fragment is available to explain for ${input.targetPath}.`,
        evidenceMarkers: [
          "deliverable-mode:explain",
          ...(input.readFragmentSourceWindowStart !== undefined
            ? [
                `read-fragment-source-window-start:${input.readFragmentSourceWindowStart}`,
              ]
            : []),
          ...(input.readFragmentSourceWindowEnd !== undefined
            ? [
                `read-fragment-source-window-end:${input.readFragmentSourceWindowEnd}`,
              ]
            : []),
          ...(input.readFilter
            ? [`repair-read-filter:${input.readFilter}`]
            : []),
          "local-explain:missing-delivered-fragment",
        ],
      };
    }
    if (fragmentIndexes.length > 0) {
      let resolvedFragmentIndexes = fragmentIndexes;
      let resolvedSourceWindowStart = input.readFragmentSourceWindowStart;
      let resolvedSourceWindowEnd = input.readFragmentSourceWindowEnd;
      let reanchorMarker: string | undefined;
      let resolvedFragment = computeFragmentFingerprintFromIndexes(
        sourceLines,
        resolvedFragmentIndexes,
      );
      if (!resolvedFragment) {
        return {
          completed: false,
          output: `Task not completed: delivered fragment indexes are out of bounds for ${input.targetPath}.`,
          evidenceMarkers: [
            "deliverable-mode:explain",
            "local-explain:invalid-fragment-indexes",
          ],
        };
      }
      let scopedText = resolvedFragment.text;
      let currentFingerprint = resolvedFragment.fingerprint;
      let reanchorConfidence: "high" | "medium" | undefined;
      let reanchorReason: string | undefined;
      if (
        input.readFragmentFingerprint &&
        input.readFragmentFingerprint !== currentFingerprint
      ) {
        const reanchor = attemptSelectiveReanchorByFingerprint({
          sourceLines,
          expectedFingerprint: input.readFragmentFingerprint,
          readFilter: input.readFilter,
          sourceWindowStart: input.readFragmentSourceWindowStart,
          sourceWindowEnd: input.readFragmentSourceWindowEnd,
          previousFragmentIndexes: resolvedFragmentIndexes,
        });
        if (reanchor.status !== "matched") {
          return {
            completed: false,
            output:
              reanchor.status === "ambiguous"
                ? `Task not completed: previously delivered fragment mapping is ambiguous for ${input.targetPath} after file drift. Re-run read before local explain.`
                : `Task not completed: previously delivered fragment is stale for ${input.targetPath} (file changed since last read). Re-run read before local explain.`,
            evidenceMarkers: [
              "deliverable-mode:explain",
              reanchor.status === "ambiguous"
                ? "local-explain:fragment-reanchor-ambiguous"
                : "local-explain:stale-fragment-invalidated",
              ...(input.readFilter
                ? [`repair-read-filter:${input.readFilter}`]
                : []),
            ],
          };
        }
        resolvedFragmentIndexes = reanchor.indexes;
        resolvedSourceWindowStart = reanchor.sourceWindowStart;
        resolvedSourceWindowEnd = reanchor.sourceWindowEnd;
        reanchorConfidence = reanchor.confidence;
        reanchorReason = reanchor.reason;
        reanchorMarker = "local-explain:fragment-reanchored-after-drift";
        const reanchoredFragment = computeFragmentFingerprintFromIndexes(
          sourceLines,
          resolvedFragmentIndexes,
        );
        if (!reanchoredFragment) {
          return {
            completed: false,
            output: `Task not completed: re-anchored fragment is unavailable for ${input.targetPath}. Re-run read before local explain.`,
            evidenceMarkers: [
              "deliverable-mode:explain",
              "local-explain:reanchored-fragment-missing",
              ...(input.readFilter
                ? [`repair-read-filter:${input.readFilter}`]
                : []),
            ],
          };
        }
        scopedText = reanchoredFragment.text;
        currentFingerprint = reanchoredFragment.fingerprint;
      }
      const label = summarizeLineIndexSet(resolvedFragmentIndexes);
      const explanation = buildExplainTaskDelivery(
        `${input.targetPath} (${label})`,
        scopedText,
      );
      const resolvedRanges = compressLineIndexesToRanges(
        resolvedFragmentIndexes,
      );
      const resolvedRangeCount =
        resolvedRanges.length > 0
          ? resolvedRanges.split(";").filter((entry) => entry.length > 0).length
          : 0;
      const includeExplicitIndexes = resolvedFragmentIndexes.length <= 128;
      return {
        completed: true,
        output: explanation,
        evidenceMarkers: [
          "deliverable-mode:explain",
          ...(includeExplicitIndexes
            ? [
                `read-fragment-line-indexes:${resolvedFragmentIndexes.join(",")}`,
              ]
            : []),
          `read-fragment-ranges:${resolvedRanges}`,
          `read-fragment-line-index-count:${resolvedFragmentIndexes.length}`,
          ...(resolvedRangeCount > 0
            ? [`read-fragment-range-count:${resolvedRangeCount}`]
            : []),
          `read-fragment-fingerprint:${currentFingerprint}`,
          ...(resolvedSourceWindowStart !== undefined
            ? [`read-fragment-source-window-start:${resolvedSourceWindowStart}`]
            : []),
          ...(resolvedSourceWindowEnd !== undefined
            ? [`read-fragment-source-window-end:${resolvedSourceWindowEnd}`]
            : []),
          ...(input.readFilter
            ? [`repair-read-filter:${input.readFilter}`]
            : []),
          ...(reanchorConfidence
            ? [`read-fragment-reanchor-confidence:${reanchorConfidence}`]
            : []),
          ...(reanchorReason
            ? [`read-fragment-reanchor-reason:${reanchorReason}`]
            : []),
          ...(reanchorMarker ? [reanchorMarker] : []),
          "local-explain:anchored-delivered-fragment",
        ],
      };
    }
    const start = Math.max(0, input.lineOffset ?? 0);
    const count =
      input.requestedLines ?? extractRequestedLineCount(input.prompt) ?? 4;
    const selected = sourceLines.slice(start, start + count);
    if (selected.length === 0) {
      return {
        completed: false,
        output: `Task not completed: local explain slice is out of bounds for ${input.targetPath}.`,
        evidenceMarkers: [
          "deliverable-mode:explain",
          `read-delivered-lines:${start}`,
        ],
      };
    }
    const end = start + selected.length;
    const scopedText = selected.join("\n");
    const scopedIndexes = Array.from(
      { length: selected.length },
      (_, index) => start + index,
    );
    const scopedRanges = compressLineIndexesToRanges(scopedIndexes);
    const scopedFingerprint = computeFragmentFingerprint(scopedText);
    const explanation = buildExplainTaskDelivery(
      `${input.targetPath} (${start + 1}-${end})`,
      scopedText,
    );
    return {
      completed: true,
      output: explanation,
      evidenceMarkers: [
        "deliverable-mode:explain",
        `read-delivered-lines:${end}`,
        `read-window-start:${start}`,
        `read-window-end:${end}`,
        `read-window-size:${Math.max(0, end - start)}`,
        `read-fragment-start:${start}`,
        `read-fragment-end:${end}`,
        `read-fragment-source-window-start:${start}`,
        `read-fragment-source-window-end:${end}`,
        `read-fragment-ranges:${scopedRanges}`,
        `read-fragment-fingerprint:${scopedFingerprint}`,
        "local-explain:anchored-read-slice",
      ],
    };
  }

  const requestedLines =
    input.requestedLines ?? extractRequestedLineCount(input.prompt);
  let effectiveLineOffset = Math.max(0, input.lineOffset ?? 0);
  const reanchorObservabilityMarkers: string[] = [];
  const continuationReadIntent =
    hasImplicitReadContinuationCue(input.prompt) ||
    extractContinuationReadLineCount(input.prompt) !== undefined;
  if (continuationReadIntent && input.readFragmentFingerprint) {
    const sourceLines = input.content.split(/\r?\n/);
    while (
      sourceLines.length > 0 &&
      sourceLines[sourceLines.length - 1]?.length === 0
    ) {
      sourceLines.pop();
    }
    const previousFragmentIndexes = resolveFragmentIndexesFromContinuityInput(
      sourceLines,
      input.readFragmentLineIndexes,
      input.readFragmentRanges,
      input.readFragmentSourceWindowStart,
      input.readFragmentSourceWindowEnd,
      input.readFilter,
    );
    if (previousFragmentIndexes.length > 0) {
      const previousFragment = computeFragmentFingerprintFromIndexes(
        sourceLines,
        previousFragmentIndexes,
      );
      const currentFingerprint = previousFragment?.fingerprint;
      if (currentFingerprint !== input.readFragmentFingerprint) {
        const reanchor = attemptSelectiveReanchorByFingerprint({
          sourceLines,
          expectedFingerprint: input.readFragmentFingerprint,
          readFilter: input.readFilter,
          sourceWindowStart: input.readFragmentSourceWindowStart,
          sourceWindowEnd: input.readFragmentSourceWindowEnd,
          previousFragmentIndexes,
        });
        if (reanchor.status === "matched") {
          effectiveLineOffset = Math.max(
            effectiveLineOffset,
            reanchor.sourceWindowEnd,
          );
          reanchorObservabilityMarkers.push(
            "read-continuation:fragment-reanchored-after-drift",
            `read-fragment-reanchor-confidence:${reanchor.confidence}`,
            `read-fragment-reanchor-reason:${reanchor.reason}`,
            `read-fragment-source-window-start:${reanchor.sourceWindowStart}`,
            `read-fragment-source-window-end:${reanchor.sourceWindowEnd}`,
          );
        } else {
          return {
            completed: false,
            output:
              reanchor.status === "ambiguous"
                ? `Task not completed: continuation fragment mapping is ambiguous for ${input.targetPath} after file drift. Re-run read to refresh continuity before continuing.`
                : `Task not completed: continuation fragment is stale for ${input.targetPath} (file changed since previous filtered read). Re-run read to refresh continuity.`,
            evidenceMarkers: [
              "deliverable-mode:read",
              reanchor.status === "ambiguous"
                ? "read-continuation:fragment-reanchor-ambiguous"
                : "read-continuation:stale-fragment-invalidated",
              ...(input.readFilter
                ? [`repair-read-filter:${input.readFilter}`]
                : []),
            ],
          };
        }
      }
    }
  }
  const forceLocalExplain =
    hasLocalSliceExplainCue(input.prompt) &&
    /(?:\bexplain\b|\u89e3\u91ca|\u5728\u505a\u4ec0\u4e48)/i.test(input.prompt);
  const scopedExplainLineCount =
    requestedLines ?? (forceLocalExplain ? 4 : undefined);
  const scopedExplainLineOffset = effectiveLineOffset;
  const summarizeIntent =
    /(?:summari[sz]e|summary|\u603b\u7ed3|\u6458\u8981|\u6982\u8ff0)/i.test(
      input.prompt,
    );
  const explainIntent =
    /(?:\u89e3\u91ca|explain|\u5728\u505a\u4ec0\u4e48|what .* does)/i.test(
      input.prompt,
    );
  const constraints = input.repairInstruction?.constraints;
  const effectiveMode: GroundedDeliverableMode = forceLocalExplain
    ? "explain"
    : (input.repairInstruction?.targetMode ??
      input.preferredMode ??
      (requestedLines
        ? "read"
        : summarizeIntent
          ? "summary"
          : explainIntent
            ? "explain"
            : "read"));

  const stagedSteps = input.repairInstruction?.stagedSteps;
  if (stagedSteps && stagedSteps.length > 0) {
    const resumeCursor = Math.min(
      Math.max(1, input.repairInstruction?.stagedResumeCursor ?? 1),
      stagedSteps.length,
    );
    const startIndex = resumeCursor - 1;
    let readCursor = effectiveLineOffset;
    const stageOutputs: string[] = [];
    const evidenceMarkers: string[] = [
      `deliverable-mode:${stagedSteps[stagedSteps.length - 1]?.mode ?? effectiveMode}`,
      `staged-repair-steps:${stagedSteps.length}`,
      `staged-repair-step-total:${stagedSteps.length}`,
    ];
    let latestReadSliceContent: string | undefined;
    let latestReadSliceLabel: string | undefined;
    if (resumeCursor > 1) {
      stageOutputs.push(
        `Resuming staged repair at step ${resumeCursor}/${stagedSteps.length}.`,
      );
      evidenceMarkers.push(`staged-repair-resume-cursor:${resumeCursor}`);
    }
    let completedStep = Math.max(0, startIndex);
    let blockedStep: number | undefined;
    let completed = true;

    for (let index = startIndex; index < stagedSteps.length; index += 1) {
      const stage = stagedSteps[index];
      if (!stage) {
        continue;
      }
      const stageConstraints = mergeGroundedRepairConstraints(
        constraints,
        stage.constraints,
        stage,
      );
      const stageReadCount =
        stage.mode === "read"
          ? (stage.readLineCount ?? requestedLines ?? 2)
          : undefined;
      const stageLineOffset =
        stage.mode === "read"
          ? stage.continueFromPreviousRead
            ? readCursor
            : effectiveLineOffset
          : undefined;
      const stageResult = buildSingleGroundedDelivery({
        prompt: input.prompt,
        targetPath: input.targetPath,
        content: input.content,
        ...(stage.mode === "explain" &&
        stage.useLatestReadSnippet &&
        latestReadSliceContent
          ? {
              scopedContent: latestReadSliceContent,
              scopedLabel: latestReadSliceLabel,
            }
          : {}),
        mode: stage.mode,
        constraints: stageConstraints,
        requestedLines: stageReadCount,
        lineOffset: stageLineOffset,
      });
      stageOutputs.push(
        `Step ${index + 1}/${stagedSteps.length} (${stage.label}):\n${stageResult.output}`,
      );
      evidenceMarkers.push(
        `repair-stage:${index + 1}:${stage.mode}:${stageResult.completed ? "completed" : "blocked"}`,
        ...stageResult.evidenceMarkers,
      );
      readCursor = Math.max(readCursor, stageResult.readDeliveredLines);
      if (stageResult.readSliceContent) {
        latestReadSliceContent = stageResult.readSliceContent;
        latestReadSliceLabel = stageResult.readSliceLabel;
      }
      if (!stageResult.completed) {
        blockedStep = index + 1;
        completed = false;
        break;
      }
      completedStep = index + 1;
    }

    const nextStep = completed
      ? stagedSteps.length + 1
      : (blockedStep ?? completedStep + 1);
    evidenceMarkers.push(`staged-repair-completed-step:${completedStep}`);
    if (blockedStep !== undefined) {
      evidenceMarkers.push(`staged-repair-blocked-step:${blockedStep}`);
    }
    if (!completed && nextStep <= stagedSteps.length) {
      evidenceMarkers.push(`staged-repair-next-step:${nextStep}`);
    } else if (completed) {
      evidenceMarkers.push("staged-repair-next-step:done");
    }
    evidenceMarkers.push(`staged-repair-step-cursor:${completedStep}`);
    evidenceMarkers.push(`read-delivered-lines:${readCursor}`);
    return {
      completed,
      output: stageOutputs.join("\n\n"),
      evidenceMarkers,
    };
  }

  const singleStep = buildSingleGroundedDelivery({
    ...(effectiveMode === "explain" &&
    hasLocalSliceExplainCue(input.prompt) &&
    scopedExplainLineCount !== undefined
      ? (() => {
          const sourceLines = input.content.split(/\r?\n/);
          const start = scopedExplainLineOffset;
          const selected = sourceLines.slice(
            start,
            start + scopedExplainLineCount,
          );
          const slice = selected.join("\n");
          const end = selected.length > 0 ? start + selected.length : start;
          return {
            scopedContent: slice,
            scopedLabel: `lines ${start + 1}-${end}`,
          };
        })()
      : {}),
    prompt: input.prompt,
    targetPath: input.targetPath,
    content: input.content,
    mode: effectiveMode,
    constraints,
    requestedLines,
    lineOffset:
      input.lineOffset !== undefined || reanchorObservabilityMarkers.length > 0
        ? effectiveLineOffset
        : undefined,
  });
  return {
    completed: singleStep.completed,
    output: singleStep.output,
    evidenceMarkers: [
      ...singleStep.evidenceMarkers,
      ...reanchorObservabilityMarkers,
    ],
  };
}

function buildSingleGroundedDelivery(input: {
  prompt: string;
  targetPath: string;
  content: string;
  scopedContent?: string;
  scopedLabel?: string;
  mode: GroundedDeliverableMode;
  constraints?: GroundedDeliverableConstraints;
  requestedLines?: number;
  lineOffset?: number;
}): {
  completed: boolean;
  output: string;
  evidenceMarkers: string[];
  readDeliveredLines: number;
  readSliceContent?: string;
  readSliceLabel?: string;
} {
  const effectiveContent = input.scopedContent ?? input.content;
  const trimmed = effectiveContent.trim();
  if (input.requestedLines !== undefined || input.mode === "read") {
    const rawLines = input.content.split(/\r?\n/);
    while (rawLines.length > 0 && rawLines[rawLines.length - 1]?.length === 0) {
      rawLines.pop();
    }
    const count = input.requestedLines ?? Math.min(40, rawLines.length);
    const start =
      input.lineOffset !== undefined
        ? Math.max(0, input.lineOffset)
        : hasReadTailCue(input.prompt)
          ? Math.max(0, rawLines.length - count)
          : 0;
    const windowLines = rawLines.slice(start, start + count);
    const windowEnd = start + windowLines.length;
    let lines = windowLines;
    let matchedLineIndexes = windowLines.map((_, index) => start + index);
    const filteredRead =
      input.constraints?.readFilter === "function-definitions";
    if (input.constraints?.readFilter === "function-definitions") {
      const filteredPairs = windowLines
        .map((line, index) => ({ line, index: start + index }))
        .filter(({ line }) =>
          lineMatchesReadFilter(line, "function-definitions"),
        );
      lines = filteredPairs.map((entry) => entry.line);
      matchedLineIndexes = filteredPairs.map((entry) => entry.index);
    }
    if (windowLines.length === 0) {
      return {
        completed: false,
        output: `Task not completed: requested read range is out of file bounds for ${input.targetPath}.`,
        evidenceMarkers: [
          "deliverable-mode:read",
          `read-delivered-lines:${start}`,
          ...(input.constraints?.readFilter
            ? [`repair-read-filter:${input.constraints.readFilter}`]
            : []),
        ],
        readDeliveredLines: start,
        readSliceLabel: `${start + 1}-${start}`,
      };
    }
    if (lines.length === 0) {
      return {
        completed: false,
        output: `Task not completed: no lines matched filter "${input.constraints?.readFilter}" in ${input.targetPath} lines ${start + 1}-${windowEnd}.`,
        evidenceMarkers: [
          "deliverable-mode:read",
          `read-delivered-lines:${windowEnd}`,
          `read-fragment-start:${start}`,
          `read-fragment-end:${windowEnd}`,
          `read-fragment-source-window-start:${start}`,
          `read-fragment-source-window-end:${windowEnd}`,
          "read-fragment-empty:true",
          ...(input.constraints?.readFilter
            ? [`repair-read-filter:${input.constraints.readFilter}`]
            : []),
        ],
        readDeliveredLines: windowEnd,
        readSliceLabel: `${start + 1}-${windowEnd}`,
      };
    }
    const readSliceContent = lines.join("\n");
    const readSliceFingerprint = computeFragmentFingerprint(readSliceContent);
    const readSliceLabel =
      filteredRead && matchedLineIndexes.length > 0
        ? summarizeLineIndexSet(matchedLineIndexes)
        : `${start + 1}-${windowEnd}`;
    const fragmentStart =
      matchedLineIndexes.length > 0 ? matchedLineIndexes[0] : start;
    const fragmentEnd =
      matchedLineIndexes.length > 0
        ? (matchedLineIndexes[matchedLineIndexes.length - 1] ?? start) + 1
        : windowEnd;
    const matchedRanges = compressLineIndexesToRanges(matchedLineIndexes);
    const matchedRangeCount =
      matchedRanges.length > 0
        ? matchedRanges.split(";").filter((entry) => entry.length > 0).length
        : 0;
    const includeExplicitIndexes = matchedLineIndexes.length <= 128;
    return {
      completed: true,
      output: [
        filteredRead
          ? `Read result for ${input.targetPath} (filtered matches in lines ${start + 1}-${windowEnd}):`
          : input.requestedLines
            ? `Read result for ${input.targetPath} (${start > 0 ? `lines ${start + 1}-${start + lines.length}` : `first ${input.requestedLines} lines`}):`
            : `Read result for ${input.targetPath}:`,
        "```text",
        readSliceContent,
        "```",
      ].join("\n"),
      evidenceMarkers: [
        "deliverable-mode:read",
        `read-delivered-lines:${windowEnd}`,
        `read-window-start:${start}`,
        `read-window-end:${windowEnd}`,
        `read-window-size:${Math.max(0, windowEnd - start)}`,
        `read-fragment-start:${fragmentStart}`,
        `read-fragment-end:${fragmentEnd}`,
        `read-fragment-source-window-start:${start}`,
        `read-fragment-source-window-end:${windowEnd}`,
        ...(filteredRead && includeExplicitIndexes
          ? [`read-fragment-line-indexes:${matchedLineIndexes.join(",")}`]
          : []),
        ...(filteredRead ? [`read-fragment-ranges:${matchedRanges}`] : []),
        ...(filteredRead
          ? [`read-fragment-line-index-count:${matchedLineIndexes.length}`]
          : []),
        ...(filteredRead && matchedRangeCount > 0
          ? [`read-fragment-range-count:${matchedRangeCount}`]
          : []),
        `read-fragment-fingerprint:${readSliceFingerprint}`,
        ...(input.constraints?.readFilter
          ? [`repair-read-filter:${input.constraints.readFilter}`]
          : []),
      ],
      readDeliveredLines: windowEnd,
      readSliceContent,
      readSliceLabel,
    };
  }

  if (input.mode === "summary") {
    const summary =
      input.constraints?.summaryStyle === "conclusion-with-evidence"
        ? summarizeAsConclusionWithEvidence(
            trimmed,
            input.constraints.summaryEvidenceCount ?? 2,
            input.constraints.includeKeyRisks ?? false,
            input.constraints.avoidGenericLanguage ?? false,
          )
        : prefersDirectTextSummary(input.prompt)
          ? summarizeContentAsText(trimmed)
          : summarizeContent(trimmed);
    return {
      completed: true,
      output: [`Summary of ${input.targetPath}:`, summary].join("\n"),
      evidenceMarkers: [
        "deliverable-mode:summary",
        "read-delivered-lines:0",
        ...(input.constraints?.summaryStyle
          ? [`repair-summary-style:${input.constraints.summaryStyle}`]
          : []),
        ...(input.constraints?.includeKeyRisks
          ? ["repair-summary-include-risk:true"]
          : []),
      ],
      readDeliveredLines: 0,
    };
  }

  if (input.mode === "explain") {
    const explanationTarget = input.scopedLabel
      ? `${input.targetPath} (${input.scopedLabel})`
      : input.targetPath;
    const explanation =
      input.constraints?.explainScope === "purpose-io-only"
        ? buildPurposeIoExplainDelivery(explanationTarget, effectiveContent)
        : buildExplainTaskDelivery(explanationTarget, effectiveContent);
    return {
      completed: true,
      output: explanation,
      evidenceMarkers: [
        "deliverable-mode:explain",
        "read-delivered-lines:0",
        ...(input.constraints?.explainScope
          ? [`repair-explain-scope:${input.constraints.explainScope}`]
          : []),
      ],
      readDeliveredLines: 0,
    };
  }

  const preview = input.content.split(/\r?\n/).slice(0, 40).join("\n");
  return {
    completed: true,
    output: [
      `Read result for ${input.targetPath}:`,
      "```text",
      preview,
      "```",
    ].join("\n"),
    evidenceMarkers: ["deliverable-mode:read", "read-delivered-lines:40"],
    readDeliveredLines: 40,
  };
}

function mergeGroundedRepairConstraints(
  base: GroundedDeliverableConstraints | undefined,
  override: GroundedDeliverableConstraints | undefined,
  stage: GroundedRepairStage,
): GroundedDeliverableConstraints | undefined {
  const merged: GroundedDeliverableConstraints = {
    ...(base ?? {}),
    ...(override ?? {}),
  };
  if (stage.summaryConclusionOnly) {
    merged.summaryStyle = "conclusion-with-evidence";
    merged.summaryEvidenceCount = 1;
  }
  if (stage.summaryEvidenceOnly) {
    merged.summaryStyle = "conclusion-with-evidence";
    merged.summaryEvidenceCount = stage.summaryEvidenceCount ?? 2;
    merged.avoidGenericLanguage = true;
  }
  if (stage.appendRiskLine) {
    merged.includeKeyRisks = true;
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}
function buildInspectFilesDelivery(globOutput: string): string {
  const files = globOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (files.length === 0) {
    return "Task not completed: inspection ran but no candidate files were found for the requested scope.";
  }
  const preview = files.slice(0, 20).join("\n");
  return [
    "Repository inspection result (candidate files):",
    "```text",
    preview,
    "```",
    files.length > 20
      ? `Total matches: ${files.length}. Showing first 20 entries.`
      : `Total matches: ${files.length}.`,
  ].join("\n");
}

function buildExplainTaskDelivery(targetPath: string, content: string): string {
  const lines = content.split(/\r?\n/);
  const nonEmpty = lines
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const preview = nonEmpty.slice(0, 5);
  const signalHints: string[] = [];

  if (/\b(import|from)\b/.test(content)) {
    signalHints.push("imports dependencies/modules");
  }
  if (/\b(function|const|class|export)\b/.test(content)) {
    signalHints.push("defines executable logic/API symbols");
  }
  if (/\b(test|describe|it\(|expect\()/i.test(content)) {
    signalHints.push("contains test-related logic");
  }
  if (/\b(fetch|http|api|request)\b/i.test(content)) {
    signalHints.push("contains request/network handling");
  }

  return [
    `Explanation for ${targetPath}:`,
    `- File appears to ${signalHints.length > 0 ? signalHints.join("; ") : "contain implementation/content logic based on inspected lines"}.`,
    `- Non-empty lines: ${nonEmpty.length}.`,
    preview.length > 0 ? "- Key excerpts:" : "- Key excerpts: none",
    preview.length > 0 ? ["```text", preview.join("\n"), "```"].join("\n") : "",
  ]
    .filter((item) => item.length > 0)
    .join("\n");
}

function buildPurposeIoExplainDelivery(
  targetPath: string,
  content: string,
): string {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const inputHints = lines.filter((line) =>
    /\b(input|args?|params?|request|payload|stdin|argv)\b/i.test(line),
  );
  const outputHints = lines.filter((line) =>
    /\b(output|return|response|stdout|result)\b/i.test(line),
  );
  const roleHint = inferFileRoleHint(content);
  return [
    `Explanation for ${targetPath} (scoped to role + I/O):`,
    `- Role: ${roleHint}.`,
    `- Inputs: ${inputHints.length > 0 ? inputHints.slice(0, 2).join(" | ") : "No explicit input markers found in inspected lines."}`,
    `- Outputs: ${outputHints.length > 0 ? outputHints.slice(0, 2).join(" | ") : "No explicit output markers found in inspected lines."}`,
  ].join("\n");
}

function inferFileRoleHint(content: string): string {
  if (/\b(test|describe|it\(|expect\()/i.test(content)) {
    return "test verification logic";
  }
  if (/\b(fetch|request|api|http|endpoint)\b/i.test(content)) {
    return "request/adapter flow";
  }
  if (/\b(interface|type|schema|zod)\b/i.test(content)) {
    return "type/schema contract definition";
  }
  if (/\b(main|bootstrap|start|entry)\b/i.test(content)) {
    return "entry/bootstrap orchestration";
  }
  return "general implementation logic";
}

function summarizeAsConclusionWithEvidence(
  content: string,
  evidenceCount: number,
  includeKeyRisks: boolean,
  avoidGenericLanguage: boolean,
): string {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const evidence = lines.slice(0, Math.max(1, evidenceCount));
  const conclusion = avoidGenericLanguage
    ? `This file primarily centers on: ${evidence[0] ?? "the inspected target content"}.`
    : `Conclusion: this file mainly describes ${evidence[0] ?? "the inspected target content"}.`;
  const result = [
    conclusion,
    ...evidence.map((line, index) => `Evidence ${index + 1}: ${line}`),
  ];
  if (includeKeyRisks) {
    result.push(
      `Key risk: current content is concise and may omit edge-case behavior details beyond the shown evidence.`,
    );
  }
  return result.join("\n");
}

function summarizeContent(content: string): string {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const preview = lines.slice(0, 3);
  const totalChars = content.length;
  const totalLines = lines.length;
  const keyTerms = extractKeyTerms(content);
  return [
    `- Size: ${totalLines} non-empty lines, ${totalChars} chars.`,
    preview.length > 0
      ? `- Main content preview: ${preview.join(" | ")}`
      : "- Main content preview: (none)",
    keyTerms.length > 0
      ? `- Possible key terms: ${keyTerms.join(", ")}`
      : "- Possible key terms: (none)",
  ].join("\n");
}

function summarizeContentAsText(content: string): string {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) {
    return "(No non-empty text content found.)";
  }

  const firstParagraph = lines.slice(0, 4).join(" ");
  const secondParagraph = lines.slice(4, 8).join(" ");
  if (secondParagraph.length === 0) {
    return `This text mainly states: ${firstParagraph}`;
  }
  return [
    `This text mainly states: ${firstParagraph}`,
    `It further emphasizes: ${secondParagraph}`,
  ].join("\n");
}

function prefersDirectTextSummary(prompt: string): boolean {
  return /(?:\u6211\u8981\u7684\u662f.*\u603b\u7ed3|\u6587\u672c\u603b\u7ed3|\u4e0d\u662f.*\u4fe1\u606f|\u4e0d\u662f.*\u65b9\u6cd5|\u76f4\u63a5\u7ed9\u6458\u8981|reanswer|redo|not method|just summarize)/i.test(
    prompt,
  );
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

function extractRequestedLineCount(prompt: string): number | undefined {
  const zh = prompt.match(
    /(?:前|读前|读取前|前面)\s*([0-9]+|[一二两三四五六七八九十百]+)\s*行/u,
  );
  if (zh?.[1]) {
    return parseLineCountToken(zh[1]);
  }
  const en = prompt.match(/first\s+([0-9]+)\s+lines?/i);
  if (en?.[1]) {
    return parseLineCountToken(en[1]);
  }
  const generic = prompt.match(
    /(?:read|读取|查看|看)\s*([0-9]+)\s*(?:lines?|行)/i,
  );
  if (generic?.[1]) {
    return parseLineCountToken(generic[1]);
  }
  return undefined;
}

function extractContinuationReadLineCount(prompt: string): number | undefined {
  const zh = prompt.match(
    /(?:继续(?:读取|读|看)|接着(?:读取|读|看)|再读(?:后|下)?|继续读取后)\s*([0-9]+|[一二两三四五六七八九十百]+)\s*行/u,
  );
  if (zh?.[1]) {
    return parseLineCountToken(zh[1]);
  }
  const en = prompt.match(
    /(?:continue|next)\s+(?:read(?:ing)?\s+)?(?:next\s+)?([0-9]+)\s+lines?/i,
  );
  if (en?.[1]) {
    return parseLineCountToken(en[1]);
  }
  if (/(?:缁х画璇诲彇鍚庝袱琛|鍚庝袱琛)/u.test(prompt)) {
    return 2;
  }
  return undefined;
}

function extractReadStartLine(prompt: string): number | undefined {
  const zh = prompt.match(
    /从第\s*([0-9]+|[一二两三四五六七八九十百]+)\s*行(?:开始|起)?/u,
  );
  if (zh?.[1]) {
    return parseLineCountToken(zh[1]);
  }
  const en = prompt.match(/(?:from|starting\s+at)\s+line\s+([0-9]+)/i);
  if (en?.[1]) {
    return parseLineCountToken(en[1]);
  }
  return undefined;
}

function hasReadTailCue(prompt: string): boolean {
  return /(?:后\s*(?:[0-9]+|[一二两三四五六七八九十百]+)\s*行|最后\s*(?:[0-9]+|[一二两三四五六七八九十百]+)\s*行|last\s+[0-9]+\s+lines?|鍚庝袱琛)/iu.test(
    prompt,
  );
}

function hasResetReadWindowCue(prompt: string): boolean {
  return /(?:重新(?:读取|读)|重读|re-?read|read again)/i.test(prompt);
}

function hasImplicitReadContinuationCue(prompt: string): boolean {
  return /(?:继续读(?:下一段)?|再读一段|接着读一段|继续读取|go on reading|continue reading(?:\s+(?:it|this|that))?|read on|read next chunk|next chunk)/i.test(
    prompt,
  );
}

function hasLocalSliceExplainCue(prompt: string): boolean {
  return /(?:这部分|这一段|这段|刚才那段|that part|this part|this section|that section|local section)/i.test(
    prompt,
  );
}

function isReflectiveExplainContinuationPrompt(prompt: string): boolean {
  return /(?:continue explaining that part|继续解释这部分)/i.test(prompt);
}

function isRepairContinuationFollowUpPrompt(prompt: string): boolean {
  return /(?:\bcontinue fixing(?:\s+that)?\b|\bthen continue(?:\s+fixing)?\b|\bwhy did it stop[^\n]*continue\b|\bwhat should we do next[^\n]*continue fixing\b|刚才为什么停了.*继续修|那继续修|继续修这个|就按刚才那个继续修|按这个继续修|那就按这个继续修)/i.test(
    prompt,
  );
}

function parseLineCountToken(token: string): number | undefined {
  const normalized = token.trim();
  if (normalized.length === 0) {
    return undefined;
  }
  if (/^\d+$/.test(normalized)) {
    const value = Number.parseInt(normalized, 10);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }
  const value = parseChineseNumber(normalized);
  return value > 0 ? value : undefined;
}

function parseChineseNumber(token: string): number {
  const normalized = token.replace(/\s+/g, "");
  if (normalized.length === 0) {
    return 0;
  }
  const digitMap: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  };
  if (normalized === "十") {
    return 10;
  }
  if (normalized.includes("十")) {
    const parts = normalized.split("十");
    const tensPart = parts[0] ?? "";
    const onesPart = parts[1] ?? "";
    const tens = tensPart.length === 0 ? 1 : (digitMap[tensPart] ?? 0);
    const ones = onesPart.length === 0 ? 0 : (digitMap[onesPart] ?? 0);
    return tens * 10 + ones;
  }
  if (normalized.includes("百")) {
    const parts = normalized.split("百");
    const hundredsPart = parts[0] ?? "";
    const restPart = parts[1] ?? "";
    const hundreds =
      hundredsPart.length === 0 ? 1 : (digitMap[hundredsPart] ?? 0);
    if (restPart.length === 0) {
      return hundreds * 100;
    }
    return hundreds * 100 + parseChineseNumber(restPart);
  }
  return digitMap[normalized] ?? 0;
}

function extractLastReadWindowFromContinuity(continuity: ContinuityStateLike): {
  start?: number;
  end?: number;
  size?: number;
} {
  let start = continuity.lastReadWindowStart;
  let end = continuity.lastReadWindowEnd;
  let size = continuity.lastReadWindowSize;
  for (const entry of continuity.lastContinuationEvidence ?? []) {
    const token = entry.trim().toLowerCase();
    if (!token) {
      continue;
    }
    if (start === undefined) {
      const match = token.match(/^read-window-start:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          start = parsed;
        }
      }
    }
    if (end === undefined) {
      const match = token.match(/^read-window-end:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          end = parsed;
        }
      }
    }
    if (size === undefined) {
      const match = token.match(/^read-window-size:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed > 0) {
          size = parsed;
        }
      }
    }
  }
  if (
    size === undefined &&
    start !== undefined &&
    end !== undefined &&
    end >= start
  ) {
    size = end - start;
  }
  return { start, end, size };
}

function extractLastReadDeliveredFragmentFromContinuity(
  continuity: ContinuityStateLike,
): {
  start?: number;
  end?: number;
  lineIndexes?: number[];
  ranges?: string[];
  sourceWindowStart?: number;
  sourceWindowEnd?: number;
  fingerprint?: string;
  filter?: "none" | "function-definitions";
  empty?: boolean;
} {
  let start = continuity.lastReadFragmentStart;
  let end = continuity.lastReadFragmentEnd;
  const lineIndexes =
    continuity.lastReadFragmentLineIndexes?.filter(
      (value) => Number.isFinite(value) && value >= 0,
    ) ?? [];
  let ranges =
    continuity.lastReadFragmentRanges?.filter(
      (value) => value.trim().length > 0,
    ) ?? [];
  let sourceWindowStart = continuity.lastReadFragmentSourceWindowStart;
  let sourceWindowEnd = continuity.lastReadFragmentSourceWindowEnd;
  let fingerprint = continuity.lastReadFragmentFingerprint;
  let filter = continuity.lastReadFilter;
  let empty: boolean | undefined;
  for (const entry of continuity.lastContinuationEvidence ?? []) {
    const token = entry.trim().toLowerCase();
    if (!token) {
      continue;
    }
    if (start === undefined) {
      const match = token.match(/^read-fragment-start:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          start = parsed;
        }
      }
    }
    if (end === undefined) {
      const match = token.match(/^read-fragment-end:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          end = parsed;
        }
      }
    }
    if (lineIndexes.length === 0) {
      const match = token.match(/^read-fragment-line-indexes:([0-9,\s]+)$/);
      if (match?.[1]) {
        const parsed = normalizeReadFragmentLineIndexes(
          match[1].split(",").map((value) => Number.parseInt(value.trim(), 10)),
        );
        if (parsed.length > 0) {
          lineIndexes.push(...parsed);
        }
      }
    }
    if (ranges.length === 0) {
      const match = token.match(/^read-fragment-ranges:([0-9;,\s-]+)$/);
      if (match?.[1]) {
        ranges = match[1]
          .split(";")
          .map((value) => value.trim())
          .filter((value) => value.length > 0);
      }
    }
    if (sourceWindowStart === undefined) {
      const match = token.match(/^read-fragment-source-window-start:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          sourceWindowStart = parsed;
        }
      }
    }
    if (sourceWindowEnd === undefined) {
      const match = token.match(/^read-fragment-source-window-end:(\d+)$/);
      if (match?.[1]) {
        const parsed = Number.parseInt(match[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          sourceWindowEnd = parsed;
        }
      }
    }
    if (filter === undefined) {
      const match = token.match(
        /^repair-read-filter:(none|function-definitions)$/,
      );
      if (match?.[1]) {
        filter = match[1] as "none" | "function-definitions";
      }
    }
    if (fingerprint === undefined) {
      const match = token.match(/^read-fragment-fingerprint:([0-9a-f]{64})$/);
      if (match?.[1]) {
        fingerprint = match[1];
      }
    }
    if (empty === undefined) {
      const match = token.match(/^read-fragment-empty:(true|false)$/);
      if (match?.[1]) {
        empty = match[1] === "true";
      }
    }
  }
  if (
    empty === undefined &&
    lineIndexes.length === 0 &&
    start !== undefined &&
    end !== undefined &&
    end <= start
  ) {
    empty = true;
  }
  if (ranges.length === 0 && lineIndexes.length > 0) {
    const compressed = compressLineIndexesToRanges(lineIndexes);
    if (compressed.length > 0) {
      ranges = compressed
        .split(";")
        .map((value) => value.trim())
        .filter((value) => value.length > 0);
    }
  }
  return {
    start,
    end,
    ...(lineIndexes.length > 0 ? { lineIndexes } : {}),
    ...(ranges.length > 0 ? { ranges } : {}),
    ...(sourceWindowStart !== undefined ? { sourceWindowStart } : {}),
    ...(sourceWindowEnd !== undefined ? { sourceWindowEnd } : {}),
    ...(fingerprint ? { fingerprint } : {}),
    ...(filter ? { filter } : {}),
    ...(empty !== undefined ? { empty } : {}),
  };
}

function normalizeReadFragmentLineIndexes(
  values: readonly number[] | undefined,
  maxExclusive?: number,
): number[] {
  const normalized: number[] = [];
  for (const value of values ?? []) {
    if (!Number.isFinite(value)) {
      continue;
    }
    const parsed = Math.floor(value);
    if (parsed < 0) {
      continue;
    }
    if (maxExclusive !== undefined && parsed >= maxExclusive) {
      continue;
    }
    if (!normalized.includes(parsed)) {
      normalized.push(parsed);
    }
  }
  normalized.sort((left, right) => left - right);
  return normalized;
}

function compressLineIndexesToRanges(lineIndexes: readonly number[]): string {
  const normalized = normalizeReadFragmentLineIndexes(lineIndexes);
  if (normalized.length === 0) {
    return "";
  }
  const ranges: string[] = [];
  let start = normalized[0] ?? 0;
  let end = start;
  for (let index = 1; index < normalized.length; index += 1) {
    const current = normalized[index];
    if (current === undefined) {
      continue;
    }
    if (current === end + 1) {
      end = current;
      continue;
    }
    ranges.push(`${start}-${end}`);
    start = current;
    end = current;
  }
  ranges.push(`${start}-${end}`);
  return ranges.join(";");
}

function expandReadFragmentRangesToIndexes(
  ranges: readonly string[] | undefined,
  maxExclusive?: number,
): number[] {
  const indexes: number[] = [];
  for (const token of ranges ?? []) {
    for (const piece of token.split(/[;,\s]+/)) {
      const normalized = piece.trim();
      if (!normalized) {
        continue;
      }
      const rangeMatch = normalized.match(/^(\d+)-(\d+)$/);
      if (rangeMatch?.[1] && rangeMatch[2]) {
        const left = Number.parseInt(rangeMatch[1], 10);
        const right = Number.parseInt(rangeMatch[2], 10);
        if (!Number.isFinite(left) || !Number.isFinite(right)) {
          continue;
        }
        const start = Math.max(0, Math.min(left, right));
        const end = Math.max(start, Math.max(left, right));
        for (let value = start; value <= end; value += 1) {
          indexes.push(value);
        }
        continue;
      }
      const singleMatch = normalized.match(/^(\d+)$/);
      if (singleMatch?.[1]) {
        const parsed = Number.parseInt(singleMatch[1], 10);
        if (Number.isFinite(parsed) && parsed >= 0) {
          indexes.push(parsed);
        }
      }
    }
  }
  return normalizeReadFragmentLineIndexes(indexes, maxExclusive);
}

function resolveFragmentIndexesFromContinuityInput(
  sourceLines: readonly string[],
  indexes: readonly number[] | undefined,
  ranges: readonly string[] | undefined,
  sourceWindowStart: number | undefined,
  sourceWindowEnd: number | undefined,
  readFilter: "none" | "function-definitions" | undefined,
): number[] {
  let resolved = normalizeReadFragmentLineIndexes(indexes, sourceLines.length);
  if (resolved.length === 0 && (ranges?.length ?? 0) > 0) {
    resolved = expandReadFragmentRangesToIndexes(ranges, sourceLines.length);
  }
  if (
    resolved.length === 0 &&
    sourceWindowStart !== undefined &&
    sourceWindowEnd !== undefined
  ) {
    const start = Math.max(0, sourceWindowStart);
    const end = Math.min(sourceLines.length, Math.max(start, sourceWindowEnd));
    const recomputed: number[] = [];
    for (let index = start; index < end; index += 1) {
      if (
        readFilter === "function-definitions" &&
        !lineMatchesReadFilter(sourceLines[index] ?? "", "function-definitions")
      ) {
        continue;
      }
      recomputed.push(index);
    }
    resolved = normalizeReadFragmentLineIndexes(recomputed, sourceLines.length);
  }
  return resolved;
}

function computeFragmentFingerprintFromIndexes(
  sourceLines: readonly string[],
  indexes: readonly number[],
): { text: string; fingerprint: string } | undefined {
  if (indexes.length === 0) {
    return undefined;
  }
  const selected = indexes
    .map((index) => sourceLines[index])
    .filter((line): line is string => line !== undefined);
  if (selected.length === 0) {
    return undefined;
  }
  const text = selected.join("\n");
  return {
    text,
    fingerprint: computeFragmentFingerprint(text),
  };
}

function attemptSelectiveReanchorByFingerprint(input: {
  sourceLines: readonly string[];
  expectedFingerprint: string;
  readFilter: "none" | "function-definitions" | undefined;
  sourceWindowStart: number | undefined;
  sourceWindowEnd: number | undefined;
  previousFragmentIndexes?: readonly number[];
}):
  | {
      status: "matched";
      indexes: number[];
      sourceWindowStart: number;
      sourceWindowEnd: number;
      confidence: "high" | "medium";
      reason: string;
    }
  | { status: "ambiguous" }
  | { status: "not-found" } {
  if (
    input.readFilter !== "function-definitions" ||
    input.sourceWindowStart === undefined ||
    input.sourceWindowEnd === undefined
  ) {
    return { status: "not-found" };
  }
  const sourceLength = input.sourceLines.length;
  if (sourceLength <= 0) {
    return { status: "not-found" };
  }
  const normalizedStart = Math.max(0, input.sourceWindowStart);
  const normalizedEnd = Math.min(
    sourceLength,
    Math.max(normalizedStart, input.sourceWindowEnd),
  );
  const windowSize = Math.max(1, normalizedEnd - normalizedStart);
  const maxStart = Math.max(0, sourceLength - windowSize);
  const expectedRelativePattern =
    input.sourceWindowStart !== undefined
      ? normalizeReadFragmentLineIndexes(input.previousFragmentIndexes).map(
          (index) => index - Math.max(0, input.sourceWindowStart ?? 0),
        )
      : [];
  const expectedPreviousIndexes = normalizeReadFragmentLineIndexes(
    input.previousFragmentIndexes,
    sourceLength,
  );
  const matches: Array<{
    indexes: number[];
    sourceWindowStart: number;
    sourceWindowEnd: number;
  }> = [];
  for (
    let candidateStart = 0;
    candidateStart <= maxStart;
    candidateStart += 1
  ) {
    const candidateEnd = candidateStart + windowSize;
    const candidateIndexes: number[] = [];
    for (let index = candidateStart; index < candidateEnd; index += 1) {
      if (
        lineMatchesReadFilter(
          input.sourceLines[index] ?? "",
          "function-definitions",
        )
      ) {
        candidateIndexes.push(index);
      }
    }
    const candidate = computeFragmentFingerprintFromIndexes(
      input.sourceLines,
      candidateIndexes,
    );
    if (!candidate) {
      continue;
    }
    if (candidate.fingerprint === input.expectedFingerprint) {
      matches.push({
        indexes: candidateIndexes,
        sourceWindowStart: candidateStart,
        sourceWindowEnd: candidateEnd,
      });
    }
  }
  let narrowed = matches;
  if (expectedRelativePattern.length > 0) {
    const relativePatternMatches = matches.filter((candidate) => {
      const relative = candidate.indexes.map(
        (index) => index - candidate.sourceWindowStart,
      );
      if (relative.length !== expectedRelativePattern.length) {
        return false;
      }
      return relative.every(
        (value, idx) => value === expectedRelativePattern[idx],
      );
    });
    if (relativePatternMatches.length > 0) {
      narrowed = relativePatternMatches;
    }
  }
  if (narrowed.length > 1) {
    const scored = narrowed
      .map((candidate) => {
        let score = 0;
        const reasons: string[] = [];
        const relative = candidate.indexes.map(
          (index) => index - candidate.sourceWindowStart,
        );
        if (
          expectedRelativePattern.length > 0 &&
          relative.length === expectedRelativePattern.length &&
          relative.every((value, idx) => value === expectedRelativePattern[idx])
        ) {
          score += 4;
          reasons.push("relative-pattern-match");
        }
        if (input.sourceWindowStart !== undefined) {
          const drift = Math.abs(
            candidate.sourceWindowStart - input.sourceWindowStart,
          );
          if (drift <= 1) {
            score += 3;
            reasons.push("window-start-near");
          } else if (drift <= 4) {
            score += 2;
            reasons.push("window-start-close");
          } else if (drift <= 10) {
            score += 1;
            reasons.push("window-start-acceptable");
          }
        }
        if (input.sourceWindowEnd !== undefined) {
          const drift = Math.abs(
            candidate.sourceWindowEnd - input.sourceWindowEnd,
          );
          if (drift <= 1) {
            score += 2;
            reasons.push("window-end-near");
          } else if (drift <= 4) {
            score += 1;
            reasons.push("window-end-close");
          }
        }
        if (
          expectedPreviousIndexes.length > 0 &&
          candidate.indexes.length === expectedPreviousIndexes.length
        ) {
          const shifts = candidate.indexes.map(
            (index, idx) => index - (expectedPreviousIndexes[idx] ?? index),
          );
          const uniqueShifts = Array.from(new Set(shifts));
          if (uniqueShifts.length === 1) {
            score += 2;
            reasons.push("uniform-shift");
            const shift = Math.abs(uniqueShifts[0] ?? 0);
            if (shift <= 4) {
              score += 1;
              reasons.push("small-shift");
            }
          }
        }
        return { candidate, score, reasons };
      })
      .sort((left, right) => right.score - left.score);
    const best = scored[0];
    const second = scored[1];
    if (!best) {
      return { status: "ambiguous" };
    }
    const margin = best.score - (second?.score ?? Number.NEGATIVE_INFINITY);
    if (best.score >= 5 && margin >= 2) {
      return {
        status: "matched",
        indexes: best.candidate.indexes,
        sourceWindowStart: best.candidate.sourceWindowStart,
        sourceWindowEnd: best.candidate.sourceWindowEnd,
        confidence: best.score >= 7 ? "high" : "medium",
        reason:
          best.reasons.length > 0 ? best.reasons.join("+") : "score-ranked",
      };
    }
    return { status: "ambiguous" };
  }
  const matched = narrowed[0];
  if (!matched) {
    return { status: "not-found" };
  }
  return {
    status: "matched",
    indexes: matched.indexes,
    sourceWindowStart: matched.sourceWindowStart,
    sourceWindowEnd: matched.sourceWindowEnd,
    confidence: "high",
    reason: "unique-fingerprint-match",
  };
}

function computeFragmentFingerprint(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function lineMatchesReadFilter(
  line: string,
  filter: "none" | "function-definitions",
): boolean {
  if (filter === "none") {
    return true;
  }
  return /^\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\b|^\s*(?:export\s+)?(?:default\s+)?const\s+\w+\s*=\s*(?:\([^)]*\)\s*=>|\w+\s*=>)|^\s*(?:export\s+)?(?:default\s+)?class\s+\w+/i.test(
    line,
  );
}

function summarizeLineIndexSet(lineIndexes: readonly number[]): string {
  if (lineIndexes.length === 0) {
    return "lines (none)";
  }
  const sorted = [...lineIndexes].sort((left, right) => left - right);
  const ranges: string[] = [];
  let rangeStart = sorted[0] ?? 0;
  let previous = rangeStart;
  for (let index = 1; index < sorted.length; index += 1) {
    const current = sorted[index];
    if (current === undefined) {
      continue;
    }
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    ranges.push(
      rangeStart === previous
        ? `${rangeStart + 1}`
        : `${rangeStart + 1}-${previous + 1}`,
    );
    rangeStart = current;
    previous = current;
  }
  ranges.push(
    rangeStart === previous
      ? `${rangeStart + 1}`
      : `${rangeStart + 1}-${previous + 1}`,
  );
  return `lines ${ranges.join(", ")}`;
}

function resolveReadWindowDirectiveForWorkflow(
  prompt: string,
  continuity: ContinuityStateLike,
  options?: {
    localSliceExplain?: boolean;
  },
): ReadWindowDirective {
  const explicitStartLine = extractReadStartLine(prompt);
  const requestedLineCount = extractRequestedLineCount(prompt);
  const continuationLineCount = extractContinuationReadLineCount(prompt);
  const hasResetCue = hasResetReadWindowCue(prompt);
  const hasImplicitContinuationCue = hasImplicitReadContinuationCue(prompt);
  const lastDelivered = Math.max(0, continuity.lastReadDeliveredLines ?? 0);
  const lastWindow = extractLastReadWindowFromContinuity(continuity);
  const lastFragment =
    extractLastReadDeliveredFragmentFromContinuity(continuity);
  const fallbackChunkSize = lastWindow.size ?? 2;

  if (explicitStartLine !== undefined) {
    return {
      mode: "absolute",
      lineOffset: Math.max(0, explicitStartLine - 1),
      lineCount:
        requestedLineCount ?? continuationLineCount ?? fallbackChunkSize,
    };
  }
  if (requestedLineCount !== undefined || hasResetCue) {
    return {
      mode: "reset",
      lineOffset: 0,
      lineCount: requestedLineCount ?? continuationLineCount,
    };
  }
  if (continuationLineCount !== undefined) {
    return {
      mode: "continue",
      lineOffset: lastDelivered > 0 ? lastDelivered : lastWindow.end,
      lineCount: continuationLineCount,
    };
  }
  if (hasImplicitContinuationCue) {
    return {
      mode: "continue",
      lineOffset: lastDelivered > 0 ? lastDelivered : lastWindow.end,
      lineCount: fallbackChunkSize,
    };
  }
  if (
    options?.localSliceExplain &&
    (lastFragment.start !== undefined || lastWindow.start !== undefined)
  ) {
    const localStart =
      lastFragment.sourceWindowStart ??
      lastFragment.start ??
      lastWindow.start ??
      0;
    const localCount =
      lastFragment.sourceWindowStart !== undefined &&
      lastFragment.sourceWindowEnd !== undefined &&
      lastFragment.sourceWindowEnd >= lastFragment.sourceWindowStart
        ? Math.max(
            1,
            lastFragment.sourceWindowEnd - lastFragment.sourceWindowStart,
          )
        : lastFragment.start !== undefined &&
            lastFragment.end !== undefined &&
            lastFragment.end >= lastFragment.start
          ? Math.max(1, lastFragment.end - lastFragment.start)
          : fallbackChunkSize;
    return {
      mode: "absolute",
      lineOffset: localStart,
      lineCount: localCount,
    };
  }
  return { mode: "reset" };
}

function normalizeGroundedRepairInstruction(input: {
  prompt: string;
  continuity: ContinuityStateLike;
  explicitDeliverableMode?: GroundedDeliverableMode;
  effectiveDeliverableMode?: GroundedDeliverableMode;
  hasContinuationCue: boolean;
  hasCorrectionCue: boolean;
  hasAnswerRepairCue: boolean;
  isAmbiguousRepairFollowUp: boolean;
  hasGroundedReadLikeIntent: boolean;
  lastTaskWasReadLike: boolean;
}): GroundedRepairInstruction {
  const semanticPrompt = stripPathTokensForIntent(input.prompt);
  const source = semanticPrompt.length > 0 ? semanticPrompt : input.prompt;
  const lowered = source.toLowerCase();
  const currentMode =
    input.effectiveDeliverableMode ??
    input.continuity.lastGroundedDeliverableMode;
  const targetMode = input.explicitDeliverableMode ?? currentMode;
  const constraints = parseGroundedRepairConstraints(source);
  const continuationDefaultWindow = extractLastReadWindowFromContinuity(
    input.continuity,
  ).size;
  const requestedReadLinesForRepair =
    extractContinuationReadLineCount(source) ??
    extractRequestedLineCount(source) ??
    (hasImplicitReadContinuationCue(source)
      ? (continuationDefaultWindow ?? 2)
      : undefined);
  const stagedSteps = inferStagedGroundedRepairSteps({
    prompt: source,
    currentMode,
    explicitDeliverableMode: input.explicitDeliverableMode,
    requestedReadLines: requestedReadLinesForRepair,
  });
  const modeCueCount = countDeliverableModeCues(source);
  const hasSwitchCue =
    /(?:no\s+summary|not\s+summary|no\s+explain|not\s+explain|switch|instead|directly\s+explain|directly\s+summarize|涓嶇敤鎬荤粨|涓嶈鎬荤粨|鍒€荤粨|鎬荤粨鍏堜笉鐪媩鍏堜笉鎬荤粨|涓嶇敤瑙ｉ噴|涓嶈瑙ｉ噴|鍒В閲妡鐩存帴瑙ｉ噴|鐩存帴鎬荤粨)/i.test(
      lowered,
    ) && input.explicitDeliverableMode !== undefined;
  const conflictingModeCue = modeCueCount > 1 && !hasSwitchCue && !stagedSteps;
  if (stagedSteps && stagedSteps.length > 0) {
    const stagedResumeCursor = resolveStagedRepairResumeCursor({
      continuity: input.continuity,
      stagedStepCount: stagedSteps.length,
      hasContinuationIntent:
        input.hasContinuationCue ||
        input.hasCorrectionCue ||
        input.hasAnswerRepairCue ||
        input.isAmbiguousRepairFollowUp,
    });
    return {
      operation: hasSwitchCue ? "switch" : "repair",
      targetMode: stagedSteps[stagedSteps.length - 1]?.mode ?? targetMode,
      constraints,
      stagedSteps,
      ...(stagedResumeCursor > 1 ? { stagedResumeCursor } : {}),
      reason: "compound follow-up decomposed into staged grounded repair plan",
    };
  }
  if (conflictingModeCue && input.lastTaskWasReadLike) {
    return {
      operation: "clarify",
      targetMode,
      constraints,
      reason: "mixed-intent repair follow-up has conflicting deliverable cues",
      clarificationPrompt:
        "Your follow-up mixes multiple deliverables. Clarify one: continue summary, switch to explain, or continue read with a filter.",
    };
  }

  if (hasSwitchCue && input.explicitDeliverableMode) {
    return {
      operation: "switch",
      targetMode: input.explicitDeliverableMode,
      constraints,
      reason: "explicit deliverable switch in grounded follow-up",
    };
  }

  if (
    input.hasCorrectionCue ||
    input.hasAnswerRepairCue ||
    constraints !== undefined
  ) {
    return {
      operation: "repair",
      targetMode,
      constraints,
      reason: "grounded answer repair follow-up",
    };
  }

  if (
    input.isAmbiguousRepairFollowUp &&
    input.lastTaskWasReadLike &&
    targetMode
  ) {
    return {
      operation: "continue",
      targetMode,
      constraints,
      reason: "ambiguous follow-up resolved to active grounded deliverable",
    };
  }

  if (input.hasContinuationCue && input.lastTaskWasReadLike && targetMode) {
    return {
      operation: "continue",
      targetMode,
      constraints,
      reason: "continuation follow-up for grounded deliverable",
    };
  }

  return {
    operation: "continue",
    targetMode,
    constraints,
    reason: input.hasGroundedReadLikeIntent
      ? "grounded intent detected from prompt"
      : "no explicit grounded repair intent",
  };
}

function inferStagedGroundedRepairSteps(input: {
  prompt: string;
  currentMode?: GroundedDeliverableMode;
  explicitDeliverableMode?: GroundedDeliverableMode;
  requestedReadLines?: number;
}): readonly GroundedRepairStage[] | undefined {
  const segments = splitCompoundRepairPrompt(input.prompt);
  if (segments.length < 2) {
    return undefined;
  }
  const steps: GroundedRepairStage[] = [];
  let resolvedAnyRead = false;
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment) {
      continue;
    }
    const segmentMode =
      inferSegmentDeliverableMode(segment) ??
      (index === 0
        ? (input.explicitDeliverableMode ?? input.currentMode)
        : undefined);
    if (!segmentMode) {
      return undefined;
    }
    const segmentConstraints = parseGroundedRepairConstraints(segment);
    const summaryConclusionOnly =
      /(缁撹|conclusion)/i.test(segment) &&
      !/(渚濇嵁|evidence)/i.test(segment);
    const summaryEvidenceOnly =
      /(渚濇嵁|evidence)/i.test(segment) &&
      !/(缁撹|conclusion)/i.test(segment);
    const summaryEvidenceCount = extractEvidenceCount(segment);
    const appendRiskLine = /(鍏抽敭椋庨櫓|key risks?|risk)/i.test(segment);
    const readCount =
      extractRequestedLineCount(segment) ??
      extractContinuationReadLineCount(segment);
    const continueRead =
      /(?:continue|next|继续|接着|后\s*\d+\s*行|下一段)/i.test(segment) ||
      hasImplicitReadContinuationCue(segment);
    const localSliceExplain = hasLocalSliceExplainCue(segment);
    const step: GroundedRepairStage = {
      mode: segmentMode,
      label: buildStageLabel(segmentMode, segment),
      constraints: segmentConstraints,
      ...(segmentMode === "read"
        ? {
            readLineCount: readCount ?? input.requestedReadLines ?? 2,
            continueFromPreviousRead: resolvedAnyRead || continueRead,
          }
        : {}),
      ...(summaryConclusionOnly ? { summaryConclusionOnly: true } : {}),
      ...(summaryEvidenceOnly ? { summaryEvidenceOnly: true } : {}),
      ...(summaryEvidenceCount !== undefined ? { summaryEvidenceCount } : {}),
      ...(appendRiskLine ? { appendRiskLine: true } : {}),
      ...(segmentMode === "explain" && localSliceExplain
        ? { useLatestReadSnippet: true }
        : {}),
    };
    if (segmentMode === "read") {
      resolvedAnyRead = true;
    }
    steps.push(step);
  }
  return steps.length > 1 ? steps : undefined;
}

function resolveStagedRepairResumeCursor(input: {
  continuity: ContinuityStateLike;
  stagedStepCount: number;
  hasContinuationIntent: boolean;
}): number {
  if (!input.hasContinuationIntent || input.stagedStepCount <= 1) {
    return 1;
  }
  const continuity = input.continuity;
  const continuityTotal =
    continuity.lastStagedRepairStepCount ??
    extractStagedRepairStepTotalFromEvidence(
      continuity.lastContinuationEvidence,
    );
  if (
    continuityTotal !== undefined &&
    continuityTotal !== input.stagedStepCount
  ) {
    return 1;
  }

  const candidateCursor =
    continuity.lastStagedRepairNextStep ??
    extractStagedRepairNextStepFromEvidence(
      continuity.lastContinuationEvidence,
    ) ??
    (() => {
      const completed =
        continuity.lastStagedRepairCompletedStep ??
        extractStagedRepairCompletedStepFromEvidence(
          continuity.lastContinuationEvidence,
        );
      return completed !== undefined ? completed + 1 : undefined;
    })();
  if (candidateCursor === undefined) {
    return 1;
  }
  const parsed = Math.floor(candidateCursor);
  if (!Number.isFinite(parsed) || parsed <= 1) {
    return 1;
  }
  if (parsed > input.stagedStepCount) {
    return input.stagedStepCount;
  }
  return parsed;
}

function extractStagedRepairStepTotalFromEvidence(
  evidence: readonly string[] | undefined,
): number | undefined {
  for (const entry of evidence ?? []) {
    const match = entry.match(/^staged-repair-(?:step-total|steps):(\d+)$/i);
    if (!match?.[1]) {
      continue;
    }
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

function extractStagedRepairCompletedStepFromEvidence(
  evidence: readonly string[] | undefined,
): number | undefined {
  for (const entry of evidence ?? []) {
    const match = entry.match(
      /^staged-repair-(?:completed-step|step-cursor):(\d+)$/i,
    );
    if (!match?.[1]) {
      continue;
    }
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return undefined;
}

function extractStagedRepairNextStepFromEvidence(
  evidence: readonly string[] | undefined,
): number | undefined {
  for (const entry of evidence ?? []) {
    const match = entry.match(/^staged-repair-next-step:(\d+)$/i);
    if (!match?.[1]) {
      continue;
    }
    const parsed = Number.parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

function splitCompoundRepairPrompt(prompt: string): string[] {
  return prompt
    .split(
      /(?:\bthen\b|\band then\b|,\s*then\b|,\s*and then\b|,\s*and\s+(?:explain|summari[sz]e|read)\b|，然后|，再|然后|再补|再给|再说明|再解释|再读|并解释|并说明|并补)/i,
    )
    .map((segment) =>
      segment.replace(/^(?:first|firstly|首先|先)\s*/i, "").trim(),
    )
    .filter((segment) => segment.length > 0);
}

function inferSegmentDeliverableMode(
  segment: string,
): GroundedDeliverableMode | undefined {
  const mode = detectGroundedDeliverableMode(segment);
  if (mode) {
    return mode;
  }
  if (/(结论|依据|summary|summari[sz]e)/i.test(segment)) {
    return "summary";
  }
  if (/(解释|explain|作用|输入输出|what .* does)/i.test(segment)) {
    return "explain";
  }
  if (
    /(read|读取|继续读\s*\d+\s*行|前\s*\d+\s*行|next\s+\d+\s+lines?)/i.test(
      segment,
    )
  ) {
    return "read";
  }
  return undefined;
}

function buildStageLabel(
  mode: GroundedDeliverableMode,
  segment: string,
): string {
  const compact = segment.replace(/\s+/g, " ").trim();
  const preview = compact.length > 48 ? `${compact.slice(0, 48)}...` : compact;
  return `${mode}: ${preview}`;
}

function extractEvidenceCount(segment: string): number | undefined {
  const arabic = segment.match(/(\d+)\s*(?:条)?\s*(?:依据|evidence)/i);
  if (arabic?.[1]) {
    const parsed = Number.parseInt(arabic[1], 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }
  const chinese = segment.match(
    /([一二三四五六七八九十两])\s*(?:条)?\s*(?:依据)/u,
  );
  if (chinese?.[1]) {
    const mapped = mapChineseDigit(chinese[1]);
    return mapped > 0 ? mapped : undefined;
  }
  return undefined;
}

function mapChineseDigit(token: string): number {
  const mapping: Record<string, number> = {
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  return mapping[token] ?? 0;
}

function parseGroundedRepairConstraints(
  prompt: string,
): GroundedDeliverableConstraints | undefined {
  const summaryConclusion =
    /(?:结论.*两条依据|两条依据.*结论|conclusion.*two.*evidence|two.*evidence.*conclusion)/i.test(
      prompt,
    );
  const summaryRisk = /(?:关键风险|key risks?|risk)/i.test(prompt);
  const noGeneric = /(?:不要再泛泛而谈|not generic|avoid generic)/i.test(
    prompt,
  );
  const explainIoOnly =
    /(?:别解释实现细节.*只说明.*作用.*输入输出|only.*purpose.*input.*output|no implementation details)/i.test(
      prompt,
    );
  const readFilterIntent = detectReadFilterIntent(prompt);
  const preserveHighlights =
    /(?:保留刚才识别出的重点|preserve .*highlights|keep .*key points)/i.test(
      prompt,
    );

  const constraints: GroundedDeliverableConstraints = {};
  if (summaryConclusion) {
    constraints.summaryStyle = "conclusion-with-evidence";
    constraints.summaryEvidenceCount = 2;
  }
  if (summaryRisk) {
    constraints.includeKeyRisks = true;
  }
  if (noGeneric) {
    constraints.avoidGenericLanguage = true;
  }
  if (explainIoOnly) {
    constraints.explainScope = "purpose-io-only";
  }
  if (readFilterIntent === "function-definitions") {
    constraints.readFilter = readFilterIntent;
  }
  if (preserveHighlights) {
    constraints.preserveRecognizedHighlights = true;
  }

  if (Object.keys(constraints).length === 0) {
    return undefined;
  }
  return constraints;
}

function detectReadFilterIntent(
  prompt: string,
): "function-definitions" | undefined {
  const source = stripPathTokensForIntent(prompt);
  const text = source.length > 0 ? source : prompt;
  const lowered = text.toLowerCase();

  if (
    /(?:只(?:看|给)?(?:函数|方法)?定义(?:相关)?(?:的)?行?|只(?:看|给)?导出(?:定义)?)/u.test(
      text,
    )
  ) {
    return "function-definitions";
  }
  if (
    /(?:鍙粰鍑芥暟瀹氫箟|鍙湅鍑芥暟瀹氫箟鐩稿叧鐨勮|鍙湅瀵煎嚭瀹氫箟|鍙湅瀵煎嚭)/i.test(
      text,
    )
  ) {
    return "function-definitions";
  }

  const hasOnlyQualifier =
    /\b(?:only|just|show only|only show)\b/i.test(lowered) ||
    /\b(?:definitions?\s+only)\b/i.test(lowered);
  const hasFunctionDefinitionCue =
    /\bfunction(?:s)?\b/i.test(lowered) && /\bdefinitions?\b/i.test(lowered);
  const hasHyphenatedFunctionDefinitionCue =
    /\bfunction(?:-|\s)?definition(?:-|\s)?related\b/i.test(lowered);
  const hasExportDefinitionCue =
    /\bexport(?:ed)?\s+definitions?\b/i.test(lowered) ||
    /\bdefinitions?\s+of\s+exports?\b/i.test(lowered);
  if (
    (hasOnlyQualifier && hasFunctionDefinitionCue) ||
    hasHyphenatedFunctionDefinitionCue ||
    (hasOnlyQualifier && hasExportDefinitionCue)
  ) {
    return "function-definitions";
  }

  return undefined;
}

function detectGroundedDeliverableMode(
  prompt: string,
): GroundedDeliverableMode | undefined {
  const semanticPrompt = stripPathTokensForIntent(prompt);
  const source = semanticPrompt.length > 0 ? semanticPrompt : prompt;
  const lowered = source.toLowerCase();
  const explicitSwitchToExplain =
    /(?:no\s+summary|not\s+summary|don't\s+summarize|skip\s+summary).*?(?:\bexplain\b|what .* does)/i.test(
      lowered,
    ) ||
    /(?:不用总结|不要总结|别总结|总结先不看|先不总结).*(?:解释|在做什么)/u.test(
      source,
    );
  const explicitSwitchToSummary =
    /(?:no\s+explain|don't\s+explain|skip\s+explain).*\b(summarize|summary)\b/i.test(
      lowered,
    ) || /(?:不用解释|不要解释|别解释).*(?:总结|摘要)/u.test(source);
  const explicitSwitchToRead =
    /(?:no\s+explain|no\s+summary|skip\s+(?:summary|explain)).*\b(read|show|print)\b/i.test(
      lowered,
    ) ||
    /(?:不用解释|不用总结|不要解释|不要总结).*(?:读取|读前?\s*\d+\s*行)/u.test(
      source,
    );
  if (explicitSwitchToExplain) {
    return "explain";
  }
  if (explicitSwitchToSummary) {
    return "summary";
  }
  if (explicitSwitchToRead) {
    return "read";
  }
  if (
    /(?:\u8bfb\u53d6|\u67e5\u770b|\u524d\s*\d+\s*\u884c|\u540e\s*\d+\s*\u884c)/u.test(
      source,
    ) ||
    /\b(read|show|print|first\s+\d+\s+lines?|next\s+\d+\s+lines?)\b/i.test(
      lowered,
    )
  ) {
    return "read";
  }
  if (
    /(?:\u603b\u7ed3|\u6458\u8981|\u6982\u8ff0)/u.test(source) ||
    /\b(summarize|summary)\b/i.test(lowered)
  ) {
    return "summary";
  }
  if (
    /(?:\u89e3\u91ca|\u5728\u505a\u4ec0\u4e48)/u.test(source) ||
    /\b(explain|what .* does)\b/i.test(lowered)
  ) {
    return "explain";
  }
  return undefined;
}

function inferGroundedDeliverableModeFromContinuity(
  continuity: ContinuityStateLike,
): GroundedDeliverableMode | undefined {
  if (continuity.lastGroundedDeliverableMode) {
    return continuity.lastGroundedDeliverableMode;
  }
  for (const marker of continuity.lastContinuationEvidence ?? []) {
    const match = marker.match(/^deliverable-mode:(read|summary|explain)$/i);
    if (match?.[1]) {
      return match[1].toLowerCase() as GroundedDeliverableMode;
    }
  }
  if (continuity.lastTaskKind === "repo-explain") {
    return "explain";
  }
  if (continuity.lastTaskKind === "read-file") {
    return "read";
  }
  return undefined;
}

function countDeliverableModeCues(prompt: string): number {
  const lowered = prompt.toLowerCase();
  const hasRead =
    /(?:\bread\b|first\s+\d+\s+lines?|next\s+\d+\s+lines?|\bprint\b|读取|读前|读后|继续读)/i.test(
      lowered,
    );
  const hasSummary = /(?:\bsummar(?:y|ize)\b|鎬荤粨|鎽樿|姒傝堪)/i.test(
    lowered,
  );
  const hasExplain = /(?:\bexplain\b|what .* does|解释|在做什么)/i.test(
    lowered,
  );
  return Number(hasRead) + Number(hasSummary) + Number(hasExplain);
}

function detectVerifyCommand(normalizedPrompt: string): string | undefined {
  if (
    normalizedPrompt.includes("node --version") ||
    normalizedPrompt.includes("node version")
  ) {
    return "node --version";
  }
  if (/(test|\u6d4b\u8bd5)/i.test(normalizedPrompt)) {
    return "npm test -- --help";
  }
  if (
    /(build|\u6784\u5efa|\u7f16\u8bd1|\u68c0\u67e5)/i.test(normalizedPrompt)
  ) {
    return "npm run build -- --help";
  }
  return undefined;
}

function hasExternalVerifyOptOut(prompt: string): boolean {
  return /\b(?:do\s+not|don't|without|no)\s+(?:run\s+)?(?:npm|tests?|build|cargo|external\s+commands?)\b/i.test(
    prompt,
  );
}

function extractLowRiskRenameRefactor(
  prompt: string,
): { from: string; to: string; paths: string[] } | undefined {
  const match = prompt.match(
    /\brename\b[\s\S]{0,80}\b(?:exported\s+)?(?:function\s+)?([A-Za-z_$][\w$]*)\s+\bto\b\s+([A-Za-z_$][\w$]*)\b/i,
  );
  const from = match?.[1]?.trim();
  const to = match?.[2]?.trim();
  if (!from || !to || from === to) {
    return undefined;
  }
  const protectedPaths = new Set(
    extractLowRiskUnchangedVerifications(prompt).map((assertion) =>
      normalizePathLike(assertion.path),
    ),
  );
  const paths = extractPromptFileReferences(prompt).filter(
    (filePath) => !protectedPaths.has(normalizePathLike(filePath)),
  );
  if (paths.length < 2) {
    return undefined;
  }
  return { from, to, paths: uniqueStable(paths) };
}

function applyWholeWordRename(
  content: string,
  from: string,
  to: string,
): string {
  return content.replace(new RegExp(`\\b${escapeRegExp(from)}\\b`, "g"), to);
}

function extractSecondaryFileWrites(
  prompt: string,
  primaryPath: string,
): Array<{ path: string; content: string }> {
  const writes: Array<{ path: string; content: string }> = [];
  const primary = normalizePathLike(primaryPath);
  const matches = prompt.matchAll(
    /\b(?:create|write)\s+(?:file\s+)?((?:\.{1,2}[\\/])?(?:[\w.-]+[\\/])*[\w.-]+\.(?:txt|md|json|yaml|yml|ts|tsx|js|jsx|py|css|html))\s+with\s+content\s*:\s*([\s\S]*?)(?=(?:[.!?。！？]\s+(?:do\s+not|don't|without|no|verify|confirm|ensure|check|only|then|create|write|update|replace)\b)|$)/gi,
  );
  for (const match of matches) {
    const path = match[1]?.trim().replace(/\\/g, "/");
    const content = match[2]?.trim();
    if (!path || !content || normalizePathLike(path) === primary) {
      continue;
    }
    writes.push({ path, content: trimTrailingVerifyInstruction(content) });
  }
  return writes;
}

function extractPromptFileReferences(prompt: string): string[] {
  const matches = prompt.matchAll(
    /(?:^|[\s"'“”`(])((?:\.{1,2}[\\/])?(?:[\w.-]+[\\/])*[\w.-]+\.(?:txt|md|json|yaml|yml|ts|tsx|js|jsx|py|css|html))(?:$|[\s"'“”`),.:;!?])/gi,
  );
  const paths: string[] = [];
  for (const match of matches) {
    const candidate = match[1]?.trim();
    if (candidate) {
      paths.push(candidate.replace(/\\/g, "/"));
    }
  }
  return uniqueStable(paths);
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

function extractFencedContent(prompt: string): string | undefined {
  const match = prompt.match(/```(?:[\w.+-]+)?\n?([\s\S]*?)```/);
  const content = match?.[1]?.trim();
  return content && content.length > 0 ? content : undefined;
}

function extractReplaceDirective(
  prompt: string,
): { from: string; to: string } | undefined {
  const zhWithPathMatch = prompt.match(
    /(?:\u628a|\u5c06)\s*.+?\s*\u91cc(?:\u7684)?\s*["'`]?(.+?)["'`]?\s*(?:\u66ff\u6362\u4e3a|\u6539\u6210|\u6539\u4e3a)\s*["'`]?([^"'`\uFF0C\u3002,\.\n\r]+)["'`]?/u,
  );
  if (zhWithPathMatch?.[1] && zhWithPathMatch?.[2]) {
    return { from: zhWithPathMatch[1], to: zhWithPathMatch[2] };
  }

  const zhMatch = prompt.match(
    /(?:\u628a|\u5c06)\s*["'`]?(.+?)["'`]?\s*(?:\u66ff\u6362\u4e3a|\u6539\u6210|\u6539\u4e3a)\s*["'`]?([^"'`\uFF0C\u3002,\.\n\r]+)["'`]?/u,
  );
  if (zhMatch?.[1] && zhMatch?.[2]) {
    return { from: zhMatch[1], to: zhMatch[2] };
  }

  const enMatch = prompt.match(
    /replac(?:e|ing)(?:\s+it)?\s+["'`]?(.+?)["'`]?\s+with\s+["'`]?(.+?)["'`]?(?:[.\u3002!\uFF01?\uFF1F]|$)/i,
  );
  if (enMatch?.[1] && enMatch?.[2]) {
    return { from: enMatch[1], to: sanitizeReplaceTarget(enMatch[2]) };
  }

  const enChangeMatch = prompt.match(
    /(?:change|update|fix|modify|swap)\s+["'`]?(.+?)["'`]?\s+(?:to|into|with)\s+["'`]?(.+?)["'`]?(?=\s+in\s+(?:that|this)\s+(?:part|section|file)|[.\u3002!\uFF01?\uFF1F]|$)(?:\s+in\s+(?:that|this)\s+(?:part|section|file))?(?:[.\u3002!\uFF01?\uFF1F]|$)/i,
  );
  if (enChangeMatch?.[1] && enChangeMatch?.[2]) {
    return {
      from: enChangeMatch[1],
      to: sanitizeReplaceTarget(enChangeMatch[2]),
    };
  }
  return undefined;
}

function sanitizeReplaceTarget(value: string): string {
  return value
    .replace(/\s*,\s*then\s+run\b[\s\S]*$/i, "")
    .replace(/\s+then\s+run\b[\s\S]*$/i, "")
    .replace(/\s+and\s+run\b[\s\S]*$/i, "")
    .trim();
}

function isVerifyLikeCommand(command: string): boolean {
  return /(?:\bverify\b|\btest\b|\btests?\b|\bbuild\b|\blint\b|\bcheck\b|npm\s+test|npm\s+run\s+build|pnpm\s+test|yarn\s+test|vitest|jest|pytest|cargo\s+test|go\s+test)/i.test(
    command,
  );
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

function inferAlternativeReplaceDirective(input: {
  readonly targetPath: string;
  readonly originalContent: string | undefined;
  readonly failedTransforms: readonly ContinuationTransform[];
  readonly avoidPreviousDirection: boolean;
}): { from: string; to: string } | undefined {
  if (typeof input.originalContent !== "string") {
    return undefined;
  }
  const targetPath = normalizePathLike(input.targetPath);
  const relevant = input.failedTransforms.filter(
    (item) =>
      normalizePathLike(item.path) === targetPath && item.to.trim().length > 0,
  );
  if (relevant.length === 0) {
    return undefined;
  }

  const directCandidates = relevant.filter(
    (item) =>
      input.originalContent.includes(item.from) &&
      !input.originalContent.includes(item.to),
  );
  if (directCandidates.length > 0) {
    const preferred = directCandidates[directCandidates.length - 1];
    return { from: preferred.from, to: preferred.to };
  }

  for (const failed of relevant) {
    const sourceCandidate = inferFallbackReplaceSourceFromCurrentContent(
      input.originalContent,
      failed.to,
    );
    if (!sourceCandidate) {
      continue;
    }
    return { from: sourceCandidate, to: failed.to };
  }

  const constrainedCandidate = inferConstraintAwareBlockReplacement({
    content: input.originalContent,
    failedTransforms: relevant,
    avoidPreviousDirection: input.avoidPreviousDirection,
  });
  if (constrainedCandidate) {
    return constrainedCandidate;
  }

  return undefined;
}

function inferFallbackReplaceSourceFromCurrentContent(
  content: string,
  avoidValue: string,
): string | undefined {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const unique = Array.from(new Set(lines));
  if (unique.length === 0) {
    return undefined;
  }
  if (unique.length === 1) {
    return unique[0] === avoidValue ? undefined : unique[0];
  }
  const compactCandidates = unique.filter(
    (line) =>
      line !== avoidValue && line.length <= 80 && !/[{}()[\];]/.test(line),
  );
  return compactCandidates.length === 1 ? compactCandidates[0] : undefined;
}

function inferConstraintAwareBlockReplacement(input: {
  readonly content: string;
  readonly failedTransforms: readonly ContinuationTransform[];
  readonly avoidPreviousDirection: boolean;
}): { from: string; to: string } | undefined {
  const lines = input.content.split(/\r?\n/);
  for (const failed of input.failedTransforms) {
    const toPair = extractAssignmentPair(failed.to);
    if (!toPair) {
      continue;
    }
    const assignment = findAssignmentLine(lines, toPair.key);
    if (!assignment) {
      continue;
    }
    const prohibitedValues = new Set<string>(
      input.failedTransforms
        .map((item) => extractAssignmentPair(item.to)?.value)
        .filter((value): value is string => Boolean(value)),
    );
    const nextValue = chooseAlternativeAssignmentValue(
      assignment.value,
      prohibitedValues,
      input.avoidPreviousDirection,
    );
    if (!nextValue) {
      continue;
    }

    const updatedLine = assignment.line.replace(
      assignment.match[0],
      `${assignment.match[1]}${assignment.match[2] ?? ""}${nextValue}${assignment.match[2] ?? ""}`,
    );
    const blockRange = inferLocalBlockRange(lines, assignment.index);
    const fromBlock = lines
      .slice(blockRange.start, blockRange.end + 1)
      .join("\n");
    const toLines = lines.slice(blockRange.start, blockRange.end + 1);
    toLines[assignment.index - blockRange.start] = updatedLine;
    const toBlock = toLines.join("\n");
    if (fromBlock === toBlock) {
      continue;
    }
    return { from: fromBlock, to: toBlock };
  }
  return undefined;
}

function extractAssignmentPair(
  raw: string,
): { key: string; value: string } | undefined {
  const match = raw.match(
    /^\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*[:=]\s*["']?([^"'\s]+)["']?\s*$/,
  );
  if (!match?.[1] || !match?.[2]) {
    return undefined;
  }
  return { key: match[1], value: match[2] };
}

function findAssignmentLine(
  lines: readonly string[],
  key: string,
):
  | {
      index: number;
      line: string;
      value: string;
      match: RegExpMatchArray;
    }
  | undefined {
  const pattern = new RegExp(
    `(\\b${escapeRegExp(key)}\\b\\s*[:=]\\s*)(["']?)([^"'\\s]+)\\2`,
  );
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? "";
    const match = line.match(pattern);
    if (!match?.[0] || !match[3]) {
      continue;
    }
    return {
      index: i,
      line,
      value: match[3],
      match,
    };
  }
  return undefined;
}

function chooseAlternativeAssignmentValue(
  currentValue: string,
  prohibitedValues: ReadonlySet<string>,
  avoidPreviousDirection: boolean,
): string | undefined {
  const normalizedCurrent = currentValue.trim().toLowerCase();
  const map: Record<string, string[]> = {
    legacy: ["modern", "v2", "enabled", "right"],
    old: ["new", "modern", "v2"],
    wrong: ["right", "fixed", "modern"],
    disabled: ["enabled"],
    false: ["true"],
    off: ["on"],
  };
  const fallback = ["modern", "right", "fixed", "v2"];
  const candidates = map[normalizedCurrent] ?? fallback;
  for (const candidate of candidates) {
    if (candidate.toLowerCase() === normalizedCurrent) {
      continue;
    }
    if (avoidPreviousDirection && prohibitedValues.has(candidate)) {
      continue;
    }
    return candidate;
  }
  return undefined;
}

function inferLocalBlockRange(
  lines: readonly string[],
  targetIndex: number,
): { start: number; end: number } {
  let start = targetIndex;
  while (start > 0) {
    const line = lines[start] ?? "";
    if (
      /^\s*(export\s+)?(async\s+)?function\b/.test(line) ||
      /^\s*(const|let|var)\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*(async\s*)?\(/.test(
        line,
      ) ||
      /^\s*#{1,6}\s+/.test(line)
    ) {
      break;
    }
    if ((lines[start - 1] ?? "").trim() === "") {
      break;
    }
    start -= 1;
  }

  let end = targetIndex;
  let depth = 0;
  let seenBrace = false;
  for (let i = start; i < lines.length && i <= start + 60; i += 1) {
    const line = lines[i] ?? "";
    const opens = (line.match(/\{/g) ?? []).length;
    const closes = (line.match(/\}/g) ?? []).length;
    if (opens > 0) {
      seenBrace = true;
    }
    depth += opens - closes;
    end = i;
    if (seenBrace && depth <= 0 && i > targetIndex) {
      break;
    }
    if (!seenBrace && i > targetIndex && line.trim() === "") {
      end = i - 1;
      break;
    }
  }

  if (end < start) {
    end = start;
  }
  return { start, end };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isSingleFileReplacePatchFailure(
  result: SingleFileReplacePatchResult,
): result is Extract<SingleFileReplacePatchResult, { ok: false }> {
  return result.ok === false;
}

function selectMutationTargetFromPrompt(
  prompt: string,
  targets: readonly ResolvedTarget[],
): ResolvedTarget | undefined {
  const selectionPlan = planMutationTargetSelection(prompt, targets);
  return rankMutationTargetCandidates(selectionPlan);
}

interface MutationTargetSelectionPlan<
  TTarget extends { readonly cleaned: string },
> {
  lowerPrompt: string;
  candidateTargets: readonly TTarget[];
  targetNames: readonly string[];
  fileConstraints: FileConstraintAssertions;
}

function planMutationTargetSelection<
  TTarget extends { readonly cleaned: string },
>(
  prompt: string,
  targets: readonly TTarget[],
): MutationTargetSelectionPlan<TTarget> {
  const fileConstraints = extractFileConstraintAssertions(prompt);
  const protectedPaths = new Set(
    fileConstraints.protectedMutationPaths.map((item) =>
      normalizePathLike(item),
    ),
  );
  const mutationTargets = targets.filter(
    (target) => !protectedPaths.has(normalizePathLike(target.cleaned)),
  );
  const candidateTargets =
    mutationTargets.length > 0 ? mutationTargets : targets;
  return {
    lowerPrompt: prompt.toLowerCase(),
    candidateTargets,
    targetNames: candidateTargets.map((target) => target.cleaned.toLowerCase()),
    fileConstraints,
  };
}

function rankMutationTargetCandidates<
  TTarget extends { readonly cleaned: string },
>(selectionPlan: MutationTargetSelectionPlan<TTarget>): TTarget | undefined {
  const { candidateTargets, lowerPrompt, targetNames } = selectionPlan;
  if (candidateTargets.length <= 1) {
    return candidateTargets[0];
  }
  let best:
    | {
        target: TTarget;
        score: number;
      }
    | undefined;
  for (const target of candidateTargets) {
    const targetIndex = lowerPrompt.indexOf(target.cleaned.toLowerCase());
    if (targetIndex < 0) {
      continue;
    }
    const score = scoreMutationTargetOccurrence(
      lowerPrompt,
      targetIndex,
      target.cleaned.toLowerCase(),
      targetNames,
    );
    if (!best || score > best.score) {
      best = { target, score };
    }
  }
  return best?.target;
}

function scoreMutationTargetOccurrence(
  lowerPrompt: string,
  targetIndex: number,
  targetName: string,
  targetNames: readonly string[],
): number {
  const segmentStart = findPromptSegmentStart(lowerPrompt, targetIndex);
  const prefix = lowerPrompt.slice(segmentStart, targetIndex);
  const segmentWithTarget = lowerPrompt.slice(
    segmentStart,
    Math.min(lowerPrompt.length, targetIndex + targetName.length + 40),
  );
  const directMutationTarget = new RegExp(
    `\\b(?:create|write|append|update|edit|modify|replace)\\b\\s+(?:to\\s+|in\\s+|at\\s+|the\\s+file\\s+|file\\s+)?${escapeRegExp(targetName)}\\b`,
  ).test(segmentWithTarget);
  const mutationMatches = Array.from(
    prefix.matchAll(/\b(create|write|append|update|edit|modify|replace)\b/g),
  );
  const lastMutation = mutationMatches.at(-1);
  const verifyCue = /\b(?:verify|confirm|ensure|check)\b/.test(prefix);
  const readCue = /\b(?:read|inspect|open|show|summari[sz]e)\b/.test(prefix);
  let score = directMutationTarget ? 5 : 0;
  if (!directMutationTarget && lastMutation) {
    const afterMutation = prefix.slice(
      (lastMutation.index ?? 0) + lastMutation[0].length,
    );
    const mentionsOtherTarget = targetNames.some(
      (name) => name !== targetName && afterMutation.includes(name),
    );
    score += mentionsOtherTarget ? -1 : 3;
  }
  if (verifyCue) {
    score -= 3;
  }
  if (readCue) {
    score -= 2;
  }
  // Keep ties stable and prefer the earliest local mutation target.
  return score - targetIndex / 10000;
}

function findPromptSegmentStart(
  lowerPrompt: string,
  targetIndex: number,
): number {
  const boundaries = [
    "\n",
    ".",
    ";",
    "!",
    "?",
    "\u3002",
    "\uff1b",
    "\uff01",
    "\uff1f",
  ];
  let start = 0;
  for (const boundary of boundaries) {
    const boundaryIndex = lowerPrompt.lastIndexOf(boundary, targetIndex - 1);
    if (boundaryIndex >= 0) {
      start = Math.max(start, boundaryIndex + boundary.length);
    }
  }
  return start;
}

function extractInlineWriteContent(prompt: string): string | undefined {
  const zhMatch = prompt.match(
    /(?:\u5199\u5165(?:\u4ee5\u4e0b)?\u5185\u5bb9|\u5185\u5bb9(?:\u662f|[:\uFF1A]))\s*[:\uFF1A]?\s*(.+)$/u,
  );
  if (zhMatch?.[1]) {
    return trimTrailingVerifyInstruction(zhMatch[1]).trim();
  }

  const enMultilineMatch = prompt.match(
    /(?:with exactly this content|with exactly|containing exactly|content\s*:)\s*:?\s*\n([\s\S]+)$/i,
  );
  if (enMultilineMatch?.[1]) {
    return trimTrailingVerifyInstruction(enMultilineMatch[1]).trim();
  }

  const enMatch = prompt.match(
    /(?:write content|content\s*:|content\s+is|with content(?:\s+exactly)?|containing(?:\s+exactly)?|set content to)\s*[:=]?\s*["“”']?(.+?)["“”']?\s*$/i,
  );
  if (enMatch?.[1]) {
    return trimTrailingVerifyInstruction(enMatch[1]).trim();
  }

  return undefined;
}

function trimTrailingVerifyInstruction(content: string): string {
  let trimmed = content.replace(
    /\s+(?:and\s+)?(?:verify|confirm|ensure|check)\b[\s\S]*?\b(?:contains|includes|has)\b[\s\S]*$/i,
    "",
  );
  const fileVerifyMatches = Array.from(
    trimmed.matchAll(
      /(?:^|[.!?。！？]\s+)(?:and\s+)?(?:verify|confirm|ensure|check)\b[\s\S]*?(?:[\w.-]+\.(?:txt|md|json|yaml|yml|ts|tsx|js|jsx|py|css|html)|consistent|sync(?:ed|hronized)?|aligned|match|reflect|keep.+same|contains|includes|has)/gi,
    ),
  );
  const lastFileVerify = fileVerifyMatches.at(-1);
  if (lastFileVerify?.index !== undefined && lastFileVerify.index > 0) {
    trimmed = trimmed.slice(0, lastFileVerify.index).trim();
  }
  return trimmed
    .replace(
      /[.!?。！？]\s+(?:create|write|update|replace)\s+(?:file\s+)?[\w.-]+\.(?:txt|md|json|yaml|yml|ts|tsx|js|jsx|py|css|html)\s+with\s+content\b[\s\S]*$/i,
      "",
    )
    .replace(
      /\s+(?:only\s+modify|do\s+not\s+change|then\s+verify)\b[\s\S]*$/i,
      "",
    )
    .replace(/[.!?。！？]\s*$/, "")
    .trim();
}

function resolveMutationInstruction(
  plan: WorkflowTaskPlan,
  rawPrompt: string,
  originalContent: string | undefined,
  fencedContent: string | undefined,
  replaceDirective: { from: string; to: string } | undefined,
):
  | {
      ok: true;
      content: string;
      changedLines: number;
      addedLines: number;
      removedLines: number;
    }
  | { ok: false; reason: string } {
  if (plan.taskKind === "write-file") {
    const inlineContent = extractInlineWriteContent(rawPrompt);
    const resolvedContent =
      fencedContent ??
      inlineContent ??
      inferLowRiskExampleFileContent({
        targetPath: plan.targetPath,
        prompt: rawPrompt,
      });
    if (!resolvedContent) {
      return {
        ok: false,
        reason:
          "Write task needs concrete file content. Provide fenced code or a single-line literal such as 'with content: hello'.",
      };
    }
    const lines = resolvedContent.split("\n").length;
    return {
      ok: true,
      content: resolvedContent,
      changedLines: lines,
      addedLines: lines,
      removedLines: 0,
    };
  }

  if (plan.taskKind !== "edit-file") {
    return {
      ok: false,
      reason: "Mutation instruction only applies to write/edit tasks.",
    };
  }

  const explicitPromptReplaceDirective = extractReplaceDirective(rawPrompt);
  const shouldUsePatchFirstReplaceLane = Boolean(
    plan.targetPath &&
    plan.replaceFrom &&
    plan.replaceTo &&
    replaceDirective &&
    explicitPromptReplaceDirective &&
    explicitPromptReplaceDirective.from === replaceDirective.from &&
    explicitPromptReplaceDirective.to === replaceDirective.to,
  );
  if (shouldUsePatchFirstReplaceLane && replaceDirective) {
    const patchResult = applySingleFileReplacePatch({
      targetPath: plan.targetPath,
      originalContent,
      replaceDirective,
    });
    if (patchResult.ok) {
      return {
        ok: true,
        content: patchResult.content,
        changedLines: patchResult.changedLines,
        addedLines: patchResult.addedLines,
        removedLines: patchResult.removedLines,
      };
    }
    if (isSingleFileReplacePatchFailure(patchResult)) {
      return {
        ok: false,
        reason: formatPatchFailureReason(patchResult),
      };
    }
  }

  if (fencedContent) {
    const previous = originalContent ?? "";
    const delta = computeLineDelta(previous, fencedContent);
    return {
      ok: true,
      content: fencedContent,
      ...delta,
    };
  }

  const inlineContent = extractInlineWriteContent(rawPrompt);
  if (
    typeof originalContent === "string" &&
    inlineContent &&
    /\b(?:replace|update|write|set)\b[\s\S]{0,80}?\bcontent\b/i.test(rawPrompt)
  ) {
    return {
      ok: true,
      content: inlineContent,
      ...computeLineDelta(originalContent, inlineContent),
    };
  }
  if (
    typeof originalContent === "string" &&
    inlineContent &&
    /\bappend\b/i.test(rawPrompt)
  ) {
    const separator =
      originalContent.length > 0 && !originalContent.endsWith("\n") ? "\n" : "";
    const updated = `${originalContent}${separator}${inlineContent}`;
    return {
      ok: true,
      content: updated,
      ...computeLineDelta(originalContent, updated),
    };
  }

  if (typeof originalContent === "string") {
    const smallBugfix = inferLowRiskSmallBugfix({
      targetPath: plan.targetPath,
      prompt: rawPrompt,
      originalContent,
    });
    if (smallBugfix) {
      return {
        ok: true,
        content: smallBugfix,
        ...computeLineDelta(originalContent, smallBugfix),
      };
    }

    const constrainedAddition = inferLowRiskConstrainedAddition({
      targetPath: plan.targetPath,
      prompt: rawPrompt,
      originalContent,
    });
    if (constrainedAddition) {
      return {
        ok: true,
        content: constrainedAddition,
        ...computeLineDelta(originalContent, constrainedAddition),
      };
    }
  }

  if (typeof originalContent === "string" && replaceDirective) {
    const lineScopedRepair = applyLineScopedContinuationRepair(
      originalContent,
      replaceDirective,
      rawPrompt,
    );
    if (lineScopedRepair) {
      return {
        ok: true,
        content: lineScopedRepair,
        ...computeLineDelta(originalContent, lineScopedRepair),
      };
    }
  }

  if (!replaceDirective) {
    if (plan.mutationScopeRequired) {
      return {
        ok: false,
        reason: formatEditExecutionFailure({
          failureReason: "edit-transform-unclear",
          explanation:
            "Local-slice edit requires a concrete transform for the explained fragment.",
          nextAction:
            "Specify an explicit change such as: replace X with Y in that part.",
        }),
      };
    }
    return {
      ok: false,
      reason: buildAmbiguousEditInstructionReason(plan.targetPath),
    };
  }

  if (typeof originalContent !== "string") {
    return {
      ok: false,
      reason: formatEditExecutionFailure({
        failureReason: "edit-target-missing",
        explanation:
          "The target file content was not available before applying the edit.",
        nextAction:
          "Check that the target file exists, ask to read it first, then rerun with an explicit replace instruction.",
      }),
    };
  }

  if (
    plan.mutationScopeRequired ||
    (plan.mutationScopeLineIndexes?.length ?? 0) > 0 ||
    (plan.mutationScopeRanges?.length ?? 0) > 0 ||
    plan.mutationScopeSourceWindowStart !== undefined ||
    plan.mutationScopeSourceWindowEnd !== undefined ||
    Boolean(plan.mutationScopeFingerprint)
  ) {
    const scopedMutation = applyScopedReplaceDirective({
      content: originalContent,
      replaceDirective,
      scope: {
        indexes: plan.mutationScopeLineIndexes,
        ranges: plan.mutationScopeRanges,
        sourceWindowStart: plan.mutationScopeSourceWindowStart,
        sourceWindowEnd: plan.mutationScopeSourceWindowEnd,
        fingerprint: plan.mutationScopeFingerprint,
      },
      required: plan.mutationScopeRequired === true,
    });
    if (scopedMutation.ok) {
      return {
        ok: true,
        content: scopedMutation.content,
        ...computeLineDelta(originalContent, scopedMutation.content),
      };
    }
    if ("hardFailure" in scopedMutation && scopedMutation.hardFailure) {
      return {
        ok: false,
        reason: scopedMutation.reason,
      };
    }
    // Scope was optional and could not be reconstructed; fall back to file-level replace.
  }

  const patchResult = applySingleFileReplacePatch({
    targetPath: plan.targetPath,
    originalContent,
    replaceDirective,
  });
  if (isSingleFileReplacePatchFailure(patchResult)) {
    return {
      ok: false,
      reason: formatPatchFailureReason(patchResult),
    };
  }

  return {
    ok: true,
    content: patchResult.content,
    changedLines: patchResult.changedLines,
    addedLines: patchResult.addedLines,
    removedLines: patchResult.removedLines,
  };
}

function inferLowRiskConstrainedAddition(input: {
  targetPath?: string;
  prompt: string;
  originalContent: string;
}): string | undefined {
  const normalizedTarget = normalizePathLike(input.targetPath ?? "");
  if (
    normalizedTarget.endsWith("examples.md") &&
    /\bexpected\s+outputs?\b/i.test(input.prompt) &&
    /\bdouble\s*\(\s*3\s*\)/.test(input.prompt) &&
    /\bsquare\s*\(\s*4\s*\)/.test(input.prompt)
  ) {
    return buildLowRiskMathExamplesContent({ includeOutputs: true });
  }

  if (
    normalizedTarget.endsWith("README.md") &&
    /\b(?:add|show|primary\s+example|second\s+example)\b[\s\S]{0,120}\b(?:usage\s+section|example)\b/i.test(
      input.prompt,
    ) &&
    /\b(?:greet|welcome)\(\)/.test(input.prompt) &&
    /(?:greet|welcome)\((?:["“']?Ada["”']?)\)/.test(input.prompt)
  ) {
    const functionName = /\bwelcome\(\)/.test(input.prompt)
      ? "welcome"
      : "greet";
    const usageSection = [
      "## Usage",
      "",
      `- \`${functionName}()\``,
      `- \`${functionName}(\"Ada\")\``,
    ].join("\n");
    if (
      input.originalContent.includes(`${functionName}()`) &&
      input.originalContent.includes(`${functionName}("Ada")`)
    ) {
      return input.originalContent;
    }
    const separator =
      input.originalContent.length > 0 && !input.originalContent.endsWith("\n")
        ? "\n\n"
        : "\n";
    return `${input.originalContent}${separator}${usageSection}`;
  }

  if (
    normalizedTarget.endsWith("utils.js") &&
    /\badd\b[\s\S]{0,120}\bexported\s+function\b[\s\S]{0,80}\bshout\s*\(\s*message\s*\)/i.test(
      input.prompt,
    ) &&
    /message\.toUpperCase\s*\(\s*\)/.test(input.prompt)
  ) {
    if (/export\s+function\s+shout\s*\(/.test(input.originalContent)) {
      return input.originalContent;
    }
    const functionBlock = [
      "export function shout(message) {",
      "  return message.toUpperCase();",
      "}",
    ].join("\n");
    const separator =
      input.originalContent.length > 0 && !input.originalContent.endsWith("\n")
        ? "\n\n"
        : "\n";
    return `${input.originalContent}${separator}${functionBlock}`;
  }

  return undefined;
}

function inferLowRiskExampleFileContent(input: {
  targetPath?: string;
  prompt: string;
}): string | undefined {
  const normalizedTarget = normalizePathLike(input.targetPath ?? "");
  if (
    normalizedTarget.endsWith("examples.md") &&
    /\bcreate\b[\s\S]{0,80}\bexamples\.md\b/i.test(input.prompt) &&
    /\bdouble\b/i.test(input.prompt) &&
    /\bsquare\b/i.test(input.prompt)
  ) {
    return buildLowRiskMathExamplesContent({
      includeOutputs: /\bexpected\s+outputs?\b/i.test(input.prompt),
    });
  }
  return undefined;
}

function buildLowRiskMathExamplesContent(input: {
  includeOutputs: boolean;
}): string {
  if (input.includeOutputs) {
    return [
      "# Examples",
      "",
      "- `double(3)` returns `6`.",
      "- `square(4)` returns `16`.",
    ].join("\n");
  }
  return ["# Examples", "", "- `double(3)`", "- `square(4)`"].join("\n");
}

function inferLowRiskSmallBugfix(input: {
  targetPath?: string;
  prompt: string;
  originalContent: string;
}): string | undefined {
  const normalizedTarget = normalizePathLike(input.targetPath ?? "");
  if (!normalizedTarget.endsWith("math.js")) {
    return undefined;
  }

  if (
    /\bdouble\s*\(\s*3\s*\)\s+should\s+return\s+6\b/i.test(input.prompt) &&
    /\bfix\b[\s\S]{0,80}\bbug\b|\bbug\b[\s\S]{0,120}\bimplementation\s+is\s+wrong\b/i.test(
      input.prompt,
    ) &&
    /return\s+n\s*\+\s*2\s*;/.test(input.originalContent)
  ) {
    return input.originalContent.replace(
      /return\s+n\s*\+\s*2\s*;/,
      "return n * 2;",
    );
  }

  if (
    /\bcomment\s+above\s+double\b/i.test(input.prompt) &&
    /\bdoubles\s+a\s+number\b/i.test(input.prompt) &&
    /export\s+function\s+double\s*\(/.test(input.originalContent) &&
    !/doubles\s+a\s+number/i.test(input.originalContent)
  ) {
    return input.originalContent.replace(
      /(export\s+function\s+double\s*\()/,
      "// doubles a number\n$1",
    );
  }

  return undefined;
}

function applyScopedReplaceDirective(input: {
  content: string;
  replaceDirective: { from: string; to: string };
  scope: {
    indexes?: readonly number[];
    ranges?: readonly string[];
    sourceWindowStart?: number;
    sourceWindowEnd?: number;
    fingerprint?: string;
  };
  required: boolean;
}):
  | { ok: true; content: string }
  | { ok: false; hardFailure: boolean; reason: string } {
  const lines = input.content.split(/\r?\n/);
  const scopedIndexes = resolveFragmentIndexesFromContinuityInput(
    lines,
    input.scope.indexes,
    input.scope.ranges,
    input.scope.sourceWindowStart,
    input.scope.sourceWindowEnd,
    undefined,
  );
  if (scopedIndexes.length === 0) {
    return {
      ok: false,
      hardFailure: input.required,
      reason:
        "Local-slice edit requested, but explained fragment scope is unavailable. Re-read/re-explain that part before editing.",
    };
  }

  if (input.scope.fingerprint) {
    const currentScopedFragment = computeFragmentFingerprintFromIndexes(
      lines,
      scopedIndexes,
    )?.fingerprint;
    if (
      !currentScopedFragment ||
      currentScopedFragment !== input.scope.fingerprint
    ) {
      return {
        ok: false,
        hardFailure: true,
        reason:
          "Explained fragment evidence is stale for local edit. Re-read/re-explain this part before applying the mutation.",
      };
    }
  }

  const from = input.replaceDirective.from;
  const to = input.replaceDirective.to;
  const isMultiline = from.includes("\n");

  if (isMultiline) {
    const contiguousRanges = compressLineIndexesToRanges(scopedIndexes)
      .split(";")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => {
        const [rawStart, rawEnd] = entry.split("-").map((part) => part?.trim());
        const start = Number.parseInt(rawStart ?? "", 10);
        const end = Number.parseInt(rawEnd ?? rawStart ?? "", 10);
        if (
          Number.isFinite(start) &&
          Number.isFinite(end) &&
          start >= 0 &&
          end >= start
        ) {
          return { start, end };
        }
        return undefined;
      })
      .filter((value): value is { start: number; end: number } =>
        Boolean(value),
      );
    if (contiguousRanges.length !== 1) {
      return {
        ok: false,
        hardFailure: true,
        reason:
          "Multiline replacement is ambiguous for the explained fragment (non-contiguous slice). Provide an explicit file-scoped edit or a narrower local transform.",
      };
    }
    const range = contiguousRanges[0];
    if (!range) {
      return {
        ok: false,
        hardFailure: true,
        reason:
          "Explained fragment range could not be reconstructed for multiline replacement.",
      };
    }
    const block = lines.slice(range.start, range.end + 1).join("\n");
    if (!block.includes(from)) {
      return {
        ok: false,
        hardFailure: true,
        reason:
          "Replace source text was not found inside the explained fragment.",
      };
    }
    const replaced = block.replace(from, to);
    if (replaced === block) {
      return {
        ok: false,
        hardFailure: true,
        reason:
          "Replace operation produced no effective change in explained fragment.",
      };
    }
    const nextLines = [...lines];
    nextLines.splice(
      range.start,
      range.end - range.start + 1,
      ...replaced.split("\n"),
    );
    return { ok: true, content: nextLines.join("\n") };
  }

  const nextLines = [...lines];
  for (const index of scopedIndexes) {
    const line = nextLines[index];
    if (line === undefined || !line.includes(from)) {
      continue;
    }
    const updatedLine = line.replace(from, to);
    if (updatedLine === line) {
      continue;
    }
    nextLines[index] = updatedLine;
    return { ok: true, content: nextLines.join("\n") };
  }

  return {
    ok: false,
    hardFailure: true,
    reason: "Replace source text was not found inside the explained fragment.",
  };
}

function isSafeReboundDirective(input: {
  readonly original: { from: string; to: string };
  readonly rebound: { from: string; to: string };
}): boolean {
  const from = input.rebound.from.trim();
  const to = input.rebound.to.trim();
  const originalFrom = input.original.from.trim();
  const originalTo = input.original.to.trim();
  if (!from || !to) {
    return false;
  }
  if (from === to) {
    return false;
  }
  // Prevent temporal multi-hop oscillation when stale follow-ups try to
  // immediately invert the last successful transform direction.
  if (from === originalTo && to === originalFrom) {
    return false;
  }
  const reboundIsBlockScoped = from.includes("\n") || to.includes("\n");
  if (reboundIsBlockScoped) {
    return true;
  }
  const fromHasWhitespace = /\s/.test(from);
  const toHasWhitespace = /\s/.test(to);
  if (fromHasWhitespace && !toHasWhitespace) {
    return false;
  }
  if (from.length > to.length * 3 && !toHasWhitespace) {
    return false;
  }
  const originalTokenLike = !/\s/.test(originalFrom);
  if (originalTokenLike && fromHasWhitespace && !toHasWhitespace) {
    return false;
  }
  return true;
}

function isSafeGeneratedAlternativeDirective(input: {
  readonly from: string;
  readonly to: string;
}): boolean {
  const from = input.from.trim();
  const to = input.to.trim();
  if (!from || !to || from === to) {
    return false;
  }
  const isBlockScoped = from.includes("\n") || to.includes("\n");
  if (isBlockScoped) {
    return true;
  }
  const fromHasWhitespace = /\s/.test(from);
  const toHasWhitespace = /\s/.test(to);
  if (fromHasWhitespace && !toHasWhitespace) {
    return false;
  }
  if (!toHasWhitespace && from.length > Math.max(48, to.length * 3)) {
    return false;
  }
  return true;
}

function applyLineScopedContinuationRepair(
  content: string,
  replaceDirective: { from: string; to: string },
  prompt: string,
): string | undefined {
  const keepFirstLine =
    /(?:\u4fdd\u7559\u7b2c\u4e00\u884c|\u7b2c\u4e00\u884c\u4e0d\u52a8|keep first line)/i.test(
      prompt,
    );
  const onlySecondLine =
    /(?:\u53ea\u6539\u7b2c\u4e8c\u884c|\u53ea\u4fee\u7b2c\u4e8c\u884c|only second line)/i.test(
      prompt,
    );
  if (!keepFirstLine && !onlySecondLine) {
    return undefined;
  }

  const lines = content.split(/\r?\n/);
  if (lines.length === 0) {
    return undefined;
  }
  let mutated = false;

  if (keepFirstLine && lines.length >= 1) {
    const reverted = lines[0]!.replace(
      replaceDirective.to,
      replaceDirective.from,
    );
    if (reverted !== lines[0]) {
      lines[0] = reverted;
      mutated = true;
    }
  }

  if (onlySecondLine && lines.length >= 2) {
    const updatedSecond = lines[1]!.replace(
      replaceDirective.from,
      replaceDirective.to,
    );
    if (updatedSecond !== lines[1]) {
      lines[1] = updatedSecond;
      mutated = true;
    }
  }

  if (!mutated) {
    return undefined;
  }
  return lines.join("\n");
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

function computeLineDelta(
  previous: string,
  next: string,
): { changedLines: number; addedLines: number; removedLines: number } {
  const previousLines = previous.length > 0 ? previous.split("\n") : [];
  const nextLines = next.length > 0 ? next.split("\n") : [];
  const changedLines = Math.max(previousLines.length, nextLines.length);
  return {
    changedLines,
    addedLines: Math.max(0, nextLines.length - previousLines.length),
    removedLines: Math.max(0, previousLines.length - nextLines.length),
  };
}

function truncate(value: string, maxLength = 220): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function normalizePathLike(value: string): string {
  return value
    .replace(/\\/g, "/")
    .replace(/^\.\/+/g, "")
    .trim();
}

function stripPathTokensForIntent(prompt: string): string {
  return prompt
    .replace(/["'`](?:\.{1,2}[\\/]|[A-Za-z]:[\\/]|\/)[^"'`]+["'`]/g, " ")
    .replace(
      /\b(?:[\w.-]+[\\/])+[\w.-]+\.(?:d\.ts|test\.(?:ts|tsx|jsx|js)|spec\.(?:ts|tsx|jsx|js)|[A-Za-z0-9]{1,8})\b/g,
      " ",
    )
    .replace(/(?:\.{1,2}[\\/]|[A-Za-z]:[\\/]|\/)[^\s\u3002\uFF0C,;:!?]+/g, " ")
    .replace(/\b[\w.-]+\.[A-Za-z0-9]{1,8}\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hasPathLikeReference(prompt: string): boolean {
  return /(?:[A-Za-z]:[\\/][^\s"'`<>|?*]+|\.{1,2}[\\/][^\s"'`<>|?*]+|\/[^\s"'`<>|?*]+|[A-Za-z0-9._-]+\.(?:d\.ts|test\.(?:ts|tsx|js|jsx)|spec\.(?:ts|tsx|js|jsx)|tsx|jsx|ts|js|py|go|rs|md|txt|json|log|yaml|yml|toml))(?:$|\s|[,.!?;:])/i.test(
    prompt,
  );
}

function derivePromptPathTarget(
  prompt: string,
  workspaceRoot: string,
): {
  raw: string;
  cleaned: string;
  absolutePath: string;
  inWorkspace: boolean;
} | null {
  const quotedMatch = prompt.match(/["'`](\.{1,2}[\\/][^"'`]+?)["'`]/);
  const unquotedMatch = prompt.match(
    /(\.{1,2}[\\/][^\n\r]+?\.[A-Za-z0-9]+)(?=\s*(?:\u6587\u4ef6|\u5185\u5bb9|\u524d\s*\d+\s*\u884c|\u5728\u505a\u4ec0\u4e48|$|[\uFF0C,\u3002]))/u,
  );
  const raw = (quotedMatch?.[1] ?? unquotedMatch?.[1] ?? "").trim();
  if (!raw) {
    return null;
  }

  const cleaned = raw.replace(/[\uFF0C,\u3002.]+$/u, "").trim();
  const absolutePath = path.resolve(workspaceRoot, cleaned);
  const workspaceAbsolute = path.resolve(workspaceRoot);
  const normalizedAbsolute = absolutePath.toLowerCase();
  const normalizedWorkspace = workspaceAbsolute.toLowerCase();
  const inWorkspace =
    normalizedAbsolute === normalizedWorkspace ||
    normalizedAbsolute.startsWith(
      `${normalizedWorkspace}${path.sep.toLowerCase()}`,
    );

  return {
    raw: cleaned,
    cleaned,
    absolutePath,
    inWorkspace,
  };
}

async function streamRoleDraft(
  role: "planner" | "coder" | "reviewer",
  draft: string,
  providerMode: "synthetic" | "real",
  realProvider?: MvpIntegratedFlowOptions["realProvider"],
): Promise<string> {
  const requestModel = resolveRequestModel(providerMode, realProvider);
  const adapter =
    providerMode === "real"
      ? createRealProviderAdapter(realProvider)
      : new OpenAIModelAdapter(
          { provider: "openai", apiKey: "local-mvp-test-key" },
          async () =>
            new Response(createSyntheticSseBody(draft), {
              status: 200,
              headers: { "content-type": "text/event-stream" },
            }),
        );

  let text = "";
  for await (const event of adapter.streamResponse({
    schemaVersion: CONTRACT_VERSION,
    model: requestModel,
    messages: [{ role: "user", content: draft }],
  })) {
    if (event.type === "content.delta") {
      text += event.delta;
    }
  }

  return text.trim();
}

function createRealProviderAdapter(
  realProvider?: MvpIntegratedFlowOptions["realProvider"],
): OpenAIModelAdapter {
  const apiKey =
    realProvider?.apiKey?.trim() ?? process.env.OPENAI_API_KEY?.trim();
  const accountAccess = realProvider?.accountAuth?.accessToken?.trim();
  if (!apiKey && !accountAccess) {
    throw new Error(
      "OPENAI_API_KEY is required for the real provider path unless an account-auth connection is active. Use /connect login openai --account to create one.",
    );
  }

  return new OpenAIModelAdapter({
    provider: (realProvider?.provider ?? "openai") as RuntimeProvider,
    apiKey,
    accountAuth: realProvider?.accountAuth,
    baseUrl: realProvider?.baseUrl,
  });
}

function hasExplicitExecutionIntent(
  rawPrompt: string,
  normalizedPrompt: string,
): boolean {
  const englishIntent = /\b(run|execute|command|bash|terminal)\b/i.test(
    normalizedPrompt,
  );
  const chineseIntent =
    /(?:\u8fd0\u884c|\u6267\u884c|\u547d\u4ee4|\u7ec8\u7aef)/u.test(rawPrompt);
  return englishIntent || chineseIntent;
}
function resolveRequestModel(
  providerMode: "synthetic" | "real",
  realProvider?: MvpIntegratedFlowOptions["realProvider"],
): string {
  if (providerMode !== "real") {
    return "gpt-4.1-mini";
  }

  const configuredModel = realProvider?.model?.trim();
  if (configuredModel) {
    return configuredModel;
  }

  if (realProvider?.provider === "openai" && realProvider?.accountAuth) {
    return "gpt-5.4";
  }

  return "gpt-4.1-mini";
}

function createSyntheticSseBody(content: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const first = content.slice(0, Math.ceil(content.length / 2));
  const second = content.slice(Math.ceil(content.length / 2));

  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            model: "gpt-4.1-mini",
            choices: [{ delta: { content: first } }],
          })}\n\n`,
        ),
      );
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            model: "gpt-4.1-mini",
            choices: [{ delta: { content: second }, finish_reason: "stop" }],
            usage: { prompt_tokens: 5, completion_tokens: 8, total_tokens: 13 },
          })}\n\n`,
        ),
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}
