import type {
  GoogleAccountAuthConfig,
  OpenAIAccountAuthConfig,
  RuntimeProvider,
} from "../config/runtimeConfig.js";
import type { PwRuntimeStatus } from "../core/context/pwRuntime.js";
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
} from "./integratedFlowEnvironment.js";
import {
  buildFreshnessObservability,
  type FreshnessObservability,
} from "../evidence/freshnessEvidence.js";
import { appendSingleFileEditRepairObservability } from "../evidence/turnEvidenceLedger.js";
import { projectWorkflowRuntimeResultContract } from "../result/workflowRuntimeProjection.js";
import {
  runApplyPatchRuntimeBridgeIfRequested,
  type ApplyPatchRuntimeRouteOptions,
} from "../edit/applyPatchRuntimeBridge.js";
import { computeFragmentFingerprint } from "../context/readWindowContinuation.js";
import { runInspectFilesStage } from "../context/inspectFilesStage.js";
import { runReadRuntimeStage } from "../context/readRuntimeStage.js";
import { runRepoExplainRuntimeStage } from "../context/repoExplainRuntimeStage.js";
import { runProviderDraftStage } from "../provider/providerDraftStage.js";
import { runPlanningRuntimeStage } from "../planning/planningRuntimeStage.js";
import {
  buildWorkflowTaskPlan,
  extractInlineContinuityContext,
} from "../planning/workflowTaskPlan.js";
import { isVerifyLikeCommand } from "../policy/commandIntentPolicy.js";
import { runDirectCommandStage } from "../verification/commandStage.js";
import {
  extractFencedContent,
  extractInlineWriteContent,
  extractLowRiskRenameRefactor,
  extractReplaceDirective,
  inferAlternativeReplaceDirective,
  isSafeGeneratedAlternativeDirective,
  isSafeReboundDirective,
  resolveMutationInstruction,
} from "../edit/mutationInstructionPlanner.js";
import { runLowRiskRenameStage } from "../edit/lowRiskRenameStage.js";
import { runPrimaryMutationRuntimeStage } from "../edit/mutationRuntimeStage.js";
import { runSecondaryWriteStage } from "../edit/secondaryWriteStage.js";
import { runAnchoredProposalStage } from "../proposal/anchoredProposalStage.js";
import { runCrossFileRepairStage } from "../repair/crossFileRepairStage.js";
import {
  executeBrowserModulePlan,
} from "../orchestration/browserModule.js";
import { extractFileConstraintAssertions } from "../orchestration/fileConstraintAssertions.js";
import { snapshotGitChangeSet } from "../orchestration/gitChangeSetAttribution.js";
import { buildReflectiveStateQueryResponse } from "../orchestration/continuationPlanning.js";
import {
  extractConsistencyItems,
  findMissingConsistencyItems,
  normalizeComparableText,
  planLowRiskVerification,
} from "../orchestration/lowRiskVerificationPlanning.js";
import { MultiAgentOrchestrator } from "../orchestration/MultiAgentOrchestrator.js";
import { summarizeFileMutationResults } from "../orchestration/mutationExecution.js";
import type { FileMutationExecutionResult } from "../orchestration/mutationExecution.js";
import {
  appendCurrentRequestScopeEvidence,
  deriveCurrentPermissionRequestFromToolInput,
} from "../orchestration/approvalAuthorityProjection.js";
import { reconcileFileMutationSummary } from "../orchestration/mutationResultAggregation.js";
import {
  projectWorkflowBlockedOutcome,
  projectWorkflowRuntimeOutcome,
} from "../orchestration/resultSurfaceModule.js";
import {
  buildContextGraphPlanningBundle,
  projectReadOutOfWorkspaceTargetStop,
} from "../orchestration/readInspectModule.js";
import type { PlanningRuntimeProductExecutionOptions } from "../orchestration/planningRuntimeProductExecution.js";
import {
  buildAgentPlanResult,
  projectAgentPlanRuntimeOutcome,
} from "../orchestration/agentPlanResult.js";
import {
  planWorkflowVerification,
  planWorkflowVerificationRetry,
  projectNotRequestedWorkflowVerification,
  projectSkippedWorkflowVerification,
  projectWorkflowCommandVerification,
} from "../orchestration/verificationModule.js";
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
import type { TargetResolutionBlocker } from "../orchestration/targetResolution.js";
import { classifyVerificationFailure } from "../orchestration/toolExecutionOutcomeProjection.js";
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

interface WorkflowExecutionResult {
  readonly events: QueryEvent[];
  readonly notes: string[];
  readonly codingResult: CodingResultSummary;
  readonly userFacingOutput: string;
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
      await runPrimaryMutationRuntimeStage({
        plan: input.plan,
        targetPath,
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
          evidence,
          mutationResults,
          appliedContentByPath,
        },
        content: successfulMutationInstruction.content,
        changedLines: successfulMutationInstruction.changedLines,
        addedLines: successfulMutationInstruction.addedLines,
        removedLines: successfulMutationInstruction.removedLines,
        originalContent,
        transformKind,
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
    }

    if (!primarySkippedForCrossFile && changedFiles.includes(targetPath)) {
      if (lowRiskRenameRefactor) {
        await runLowRiskRenameStage({
          rename: lowRiskRenameRefactor,
          targetPath,
          workspaceRoot: input.workspaceRoot,
          sessionId: input.sessionId,
          turn: input.turn,
          dispatcher: input.dispatcher,
          events,
          aggregate: {
            events,
            notes,
            changedFiles,
            failedFiles,
            patches,
            evidence,
            mutationResults,
            appliedContentByPath,
          },
          ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
        });
      }

      await runSecondaryWriteStage({
        prompt: input.prompt,
        targetPath,
        workspaceRoot: input.workspaceRoot,
        sessionId: input.sessionId,
        turn: input.turn,
        dispatcher: input.dispatcher,
        events,
        aggregate: {
          events,
          notes,
          changedFiles,
          failedFiles,
          patches,
          evidence,
          mutationResults,
          appliedContentByPath,
        },
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
    }

    if (
      input.plan.taskKind === "edit-file" &&
      input.plan.crossFileRepair &&
      replaceDirective &&
      (changedFiles.includes(targetPath) || primarySkippedForCrossFile) &&
      (input.plan.additionalTargetPaths?.length ?? 0) > 0
    ) {
      const repairStage = await runCrossFileRepairStage({
        plan: input.plan,
        prompt: input.prompt,
        targetPath,
        replaceDirective,
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
          evidence,
          mutationResults,
          appliedContentByPath,
        },
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
      crossFileRemainingTargets = repairStage.remainingTargets;
      crossFileFailedByReason = repairStage.failedByReason;
      crossFileSkippedFiles = repairStage.skippedFiles;
      degradedCrossFileTargets = repairStage.degradedTargets;
      crossFileDegradationReason = repairStage.degradationReason;
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
