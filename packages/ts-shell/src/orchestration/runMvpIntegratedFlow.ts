import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { SchemaVersion } from "../../../../contracts/typescript/types.js";
import { getRuntimeConfig } from "../config/runtimeConfig.js";
import { CoreMcpGateway } from "../core/mcp/gateway.js";
import type { QueryEvent } from "../core/query/events.js";
import type { QueryRuntimeStateSeed } from "../core/query/runtimeState.js";
import type {
  GoogleAccountAuthConfig,
  OpenAIAccountAuthConfig,
  RuntimeProvider,
} from "../config/runtimeConfig.js";
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
import { MultiAgentOrchestrator } from "./MultiAgentOrchestrator.js";
import { resolveTaskTargets } from "./targetResolution.js";
import type {
  AgentExecutionInput,
  AgentExecutionOutput,
  CodingPatchRecord,
  CodingResultSummary,
  CodingTaskKind,
  CodingVerificationBlockerKind,
  CodingVerificationSummary,
  TerminalClassification,
  TerminalReason,
  OrchestrationResult,
} from "./types.js";

const CONTRACT_VERSION: SchemaVersion = "1.0.0";
const RUN_COMMAND_ALLOWLIST = [
  "node --version",
  "npm test -- --help",
  "npm run build -- --help",
] as const;

export interface MvpIntegratedFlowOptions {
  readonly sessionId: string;
  readonly prompt: string;
  readonly workspaceRoot: string;
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
}

export async function runMvpIntegratedFlow(
  options: MvpIntegratedFlowOptions,
): Promise<OrchestrationResult> {
  const logger = createComponentLogger("orchestration");
  const workflowContext = getWorkflowGitContext(options.workspaceRoot);
  const runtimeConfig = getRuntimeConfig(options.workspaceRoot);
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
  });
  const runner = createIntegratedRunner(
    options.workspaceRoot,
    dispatcher,
    workflowContext,
    mcpSnapshot,
    options.providerMode ?? "synthetic",
    options.realProvider,
    options.agentMode ?? "build",
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
  const workflowContext = getWorkflowGitContext(options.workspaceRoot);
  const runtimeConfig = getRuntimeConfig(options.workspaceRoot);
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
  });
  const runner = createIntegratedRunner(
    options.workspaceRoot,
    dispatcher,
    workflowContext,
    mcpSnapshot,
    options.providerMode ?? "synthetic",
    options.realProvider,
    options.agentMode ?? "build",
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

function createIntegratedRunner(
  workspaceRoot: string,
  dispatcher: ToolDispatcher,
  workflowContext: ReturnType<typeof getWorkflowGitContext>,
  mcpSnapshot: Awaited<ReturnType<CoreMcpGateway["snapshot"]>>,
  providerMode: "synthetic" | "real",
  realProvider?: MvpIntegratedFlowOptions["realProvider"],
  agentMode: "plan" | "build" = "build",
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
      const freshnessConsumptionForObservability =
        applyAgeAwareEvidenceConsumption({
          continuity: mergedContinuityState,
          prompt: cleanPrompt,
          hasExplicitPathOverride:
            Boolean(workflowPlan.targetPath) ||
            hasPathLikeReference(cleanPrompt),
          hasExplicitTransformOverride: Boolean(
            extractReplaceDirective(cleanPrompt),
          ),
          hasContinuationFamilyCue: hasContinuationFamilyCueInPrompt(cleanPrompt),
          explicitTargetPath: workflowPlan.targetPath,
          hasSemanticSameFileNewIntent: shouldCutSameFileFamilyBySemanticShift({
            continuity: mergedContinuityState,
            prompt: cleanPrompt,
            explicitTargetPath: workflowPlan.targetPath,
            hasReadIntent:
              workflowPlan.taskKind === "read-file" ||
              workflowPlan.taskKind === "inspect-files",
            hasDiagnosisIntent: workflowPlan.taskKind === "repo-explain",
            hasEditIntent:
              workflowPlan.taskKind === "edit-file" ||
              workflowPlan.taskKind === "write-file",
            hasVerifyIntent: false,
            hasExecutionIntent: workflowPlan.taskKind === "run-command",
          }),
          intentFamily: deriveIntentFamily(workflowPlan.taskKind),
          transformSignature:
            workflowPlan.replaceFrom !== undefined &&
            workflowPlan.replaceTo !== undefined
              ? `${workflowPlan.replaceFrom}=>${workflowPlan.replaceTo}`
              : undefined,
        });
      const freshnessObservability = buildFreshnessObservability({
        prompt: cleanPrompt,
        continuity: freshnessConsumptionForObservability.continuity,
        plan: workflowPlan,
        consumptionDecision: freshnessConsumptionForObservability.decision,
      });
      const resumeProvenanceEvidence = extractResumeProvenanceEvidence(
        mergedContinuityState,
      );
      const freshnessObservabilityWithResume = {
        notes: Array.from(
          new Set([
            ...freshnessObservability.notes,
            ...resumeProvenanceEvidence,
          ]),
        ),
        evidence: Array.from(
          new Set([
            ...freshnessObservability.evidence,
            ...resumeProvenanceEvidence,
          ]),
        ),
      };
      if (workflowPlan.taskKind === "chat") {
        const content = await streamRoleDraft(
          role,
          cleanPrompt,
          providerMode,
          realProvider,
        );
        const chatActivationNotes = workflowPlan.lineageActivationDecision
          ? [
              `continuation-lineage-activation:${
                workflowPlan.lineageActivationDecision === "same-file-slot"
                  ? "same-file-slot"
                  : workflowPlan.lineageActivationDecision === "same-file-slot-clarify"
                    ? "clarify:same-file-slot"
                    : workflowPlan.lineageActivationDecision === "cross-file-candidate"
                      ? "cross-file-candidate"
                      : workflowPlan.lineageActivationDecision === "cross-file-disambiguation"
                        ? "clarify:cross-file-candidate"
                    : "chat-boundary"
              }`,
              ...(workflowPlan.lineageActivationMode
                ? [`continuation-lineage-activation-mode:${workflowPlan.lineageActivationMode}`]
                : []),
              ...(workflowPlan.lineageSlotConfidence
                ? [`continuation-lineage-slot-confidence:${workflowPlan.lineageSlotConfidence}`]
                : []),
              ...(workflowPlan.lineageSlotReason
                ? [`continuation-lineage-slot-reason:${workflowPlan.lineageSlotReason}`]
                : []),
            ]
          : [];

        if (agentMode === "plan") {
          return {
            role,
            content,
            handoffTo: "reviewer",
            handoffReason: "Chat response drafted; reviewer final pass",
            notes: [
              `plan: intent=${workflowPlan.taskKind} reason=${workflowPlan.reason}`,
              ...freshnessObservabilityWithResume.notes,
              ...chatActivationNotes,
            ],
          };
        }

        return {
          role,
          content,
          notes: [
            `plan: intent=${workflowPlan.taskKind} reason=${workflowPlan.reason}`,
            ...freshnessObservabilityWithResume.notes,
            ...chatActivationNotes,
          ],
        };
      }
      const execution = await executeWorkflowTaskPlan({
        plan: workflowPlan,
        freshnessObservability: freshnessObservabilityWithResume,
        prompt: cleanPrompt,
        dispatcher,
        sessionId: sharedContext.sessionId,
        turn,
        workspaceRoot,
      });
      const notes = [
        `plan: intent=${workflowPlan.taskKind} reason=${workflowPlan.reason}`,
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

interface WorkflowTaskPlan {
  readonly taskKind: CodingTaskKind;
  readonly groundedDeliverableMode?: GroundedDeliverableMode;
  readonly forceExplainFragmentAnchor?: boolean;
  readonly allowWholeFileExplainFallback?: boolean;
  readonly readLineCount?: number;
  readonly readLineOffset?: number;
  readonly readFragmentLineIndexes?: readonly number[];
  readonly readFragmentRanges?: readonly string[];
  readonly readFragmentSourceWindowStart?: number;
  readonly readFragmentSourceWindowEnd?: number;
  readonly readFragmentFingerprint?: string;
  readonly readFragmentStructureSignature?: string;
  readonly readFragmentNeighborhoodSignature?: string;
  readonly readFilter?: "none" | "function-definitions";
  readonly repairInstruction?: GroundedRepairInstruction;
  readonly reason: string;
  readonly targetPath?: string;
  readonly replaceFrom?: string;
  readonly replaceTo?: string;
  readonly continuationRepairReplan?: boolean;
  readonly avoidPreviousDirection?: boolean;
  readonly failedTransforms?: readonly ContinuationTransform[];
  readonly crossFileRepair?: boolean;
  readonly additionalTargetPaths?: readonly string[];
  readonly crossFileConvergedNoop?: boolean;
  readonly previousRemainingTargets?: readonly string[];
  readonly previousFailedEntries?: ReadonlyArray<{
    path: string;
    failureCode: "read-failed" | "patch-generation-failed" | "write-failed";
    reason: string;
  }>;
  readonly degradedReopen?: boolean;
  readonly degradedReopenReason?: string;
  readonly degradedReopenCandidates?: readonly string[];
  readonly degradedReopenCandidateSource?: string;
  readonly degradedReopenCandidatePruned?: readonly string[];
  readonly inspectFirst: boolean;
  readonly verifyAfterEdit: boolean;
  readonly verifyCommand?: string;
  readonly directCommand?: string;
  readonly blockedReason?: string;
  readonly targetMissing?: boolean;
  readonly usedRestoredState?: boolean;
  readonly relocatedTargetFromPath?: string;
  readonly relocationRecoveryReason?: string;
  readonly relocationCandidateSummary?: readonly string[];
  readonly lineageSlotDecision?: "match" | "ambiguous-clarify";
  readonly lineageSlotFamily?: "read" | "diagnosis" | "edit" | "execute" | "chat";
  readonly lineageSlotSelected?: string;
  readonly lineageSlotCandidates?: readonly string[];
  readonly lineageSlotReason?: string;
  readonly lineageActivationDecision?:
    | "same-file-slot"
    | "same-file-slot-clarify"
    | "cross-file-candidate"
    | "cross-file-disambiguation"
    | "chat-boundary";
  readonly lineageActivationMode?: "cue" | "weak-shape";
  readonly lineageSlotConfidence?: "high" | "low";
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

interface ToolLifecycleResult {
  readonly success: boolean;
  readonly output?: string;
  readonly error?: string;
  readonly metadata?: Record<string, unknown>;
}

interface ContinuityStateLike {
  lastTaskKind?: CodingTaskKind;
  lastGroundedDeliverableMode?: GroundedDeliverableMode;
  lastReadDeliveredLines?: number;
  lastReadWindowStart?: number;
  lastReadWindowEnd?: number;
  lastReadWindowSize?: number;
  lastReadFragmentStart?: number;
  lastReadFragmentEnd?: number;
  lastReadFragmentLineIndexes?: readonly number[];
  lastReadFragmentRanges?: readonly string[];
  lastReadFragmentSourceWindowStart?: number;
  lastReadFragmentSourceWindowEnd?: number;
  lastReadFragmentFingerprint?: string;
  lastReadFragmentStructureSignature?: string;
  lastReadFragmentNeighborhoodSignature?: string;
  lastReadFilter?: "none" | "function-definitions";
  lastStagedRepairStepCount?: number;
  lastStagedRepairCompletedStep?: number;
  lastStagedRepairBlockedStep?: number;
  lastStagedRepairNextStep?: number;
  lastAnswerDefect?: string;
  lastUserIntent?: string;
  lastAssistantOutput?: string;
  recentTargetFiles?: readonly string[];
  recentChangedFiles?: readonly string[];
  recentFailedFiles?: ReadonlyArray<{ path: string; reason: string }>;
  recentVerifiedFiles?: readonly string[];
  lastVerificationStatus?: string;
  lastTerminalClassification?: TerminalClassification;
  lastTerminalReason?: TerminalReason;
  lastContinuationEvidence?: readonly string[];
  unresolvedItems?: readonly string[];
  freshnessHistoryCount?: number;
  freshnessAgeTurnDistance?: number;
  freshnessAgeNotConsumedTurns?: number;
  continuationFamilyId?: string;
  continuationEpoch?: number;
  continuationFamilyAnchor?: string;
  forcedStepKind?:
    | "run-command"
    | "edit-fix"
    | "read-continuation"
    | "explain-continuation"
    | "summary-continuation"
    | "task-continuation";
  forcedStepTargetPath?: string;
  forcedStepCommand?: string;
  forcedStepReplaceFrom?: string;
  forcedStepReplaceTo?: string;
  forcedStepReadLineCount?: number;
  forcedStepReadFilter?: "none" | "function-definitions";
  forcedStepContinuationPrompt?: string;
  forcedStepConfidence?: "high" | "medium" | "low";
}

function extractResumeProvenanceEvidence(
  continuity: ContinuityStateLike,
): string[] {
  const source = (continuity.lastContinuationEvidence ?? []).filter((entry) =>
    /^session-resume-(?:source|requested|resolved|rebind-from-missing):/i.test(
      entry,
    ),
  );
  const takeLast = (prefix: string): string | undefined => {
    for (let index = source.length - 1; index >= 0; index -= 1) {
      const marker = source[index];
      if (marker.toLowerCase().startsWith(prefix)) {
        return marker;
      }
    }
    return undefined;
  };
  return [
    takeLast("session-resume-source:"),
    takeLast("session-resume-requested:"),
    takeLast("session-resume-resolved:"),
    takeLast("session-resume-rebind-from-missing:"),
  ].filter((entry): entry is string => Boolean(entry));
}

interface ContinuityConsumptionDecision {
  readonly familyId: string;
  readonly epoch: number;
  readonly boundary:
    | "retained"
    | "active-family-retained"
    | "aged-out-pruned"
    | "explicit-override"
    | "family-mismatch-pruned"
    | "same-file-new-intent";
  readonly activeFamily: boolean;
  readonly agedOut: boolean;
  readonly explicitOverride: boolean;
  readonly familyMismatchPruned: boolean;
  readonly epochBumped: boolean;
  readonly lineageAction?: "match" | "cut" | "mismatch-pruned";
  readonly lineageActive?: string;
  readonly lineageSlots?: readonly string[];
}

interface ContinuationTransform {
  readonly path: string;
  readonly from: string;
  readonly to: string;
}

interface ContinuationTargetRelocationDecision {
  readonly targetPath?: string;
  readonly recoveredFromPath?: string;
  readonly recoveryReason?: string;
  readonly blockedReason?: string;
  readonly candidateSummary?: readonly string[];
}

type GroundedDeliverableMode = "read" | "summary" | "explain";

interface GroundedDeliverableConstraints {
  summaryStyle?: "default" | "conclusion-with-evidence";
  summaryEvidenceCount?: number;
  includeKeyRisks?: boolean;
  avoidGenericLanguage?: boolean;
  explainScope?: "default" | "purpose-io-only";
  readFilter?: "none" | "function-definitions";
  preserveRecognizedHighlights?: boolean;
}

interface GroundedRepairInstruction {
  readonly operation: "continue" | "repair" | "switch" | "clarify";
  readonly targetMode?: GroundedDeliverableMode;
  readonly constraints?: GroundedDeliverableConstraints;
  readonly stagedSteps?: readonly GroundedRepairStage[];
  readonly stagedResumeCursor?: number;
  readonly reason: string;
  readonly clarificationPrompt?: string;
}

interface GroundedRepairStage {
  readonly mode: GroundedDeliverableMode;
  readonly label: string;
  readonly constraints?: GroundedDeliverableConstraints;
  readonly readLineCount?: number;
  readonly continueFromPreviousRead?: boolean;
  readonly useLatestReadSnippet?: boolean;
  readonly summaryConclusionOnly?: boolean;
  readonly summaryEvidenceOnly?: boolean;
  readonly summaryEvidenceCount?: number;
  readonly appendRiskLine?: boolean;
}

type ReadWindowMode = "reset" | "continue" | "absolute";

interface ReadWindowDirective {
  readonly lineCount?: number;
  readonly lineOffset?: number;
  readonly mode: ReadWindowMode;
}

function hasContinuationFamilyCueInPrompt(prompt: string): boolean {
  return (
    /(?:continue|same file|use the failure above|wrong direction|not the right fix|\u7ee7\u7eed|\u63a5\u7740|\u4e0a\u4e00\u8f6e|\u5931\u8d25)/i.test(
      prompt,
    ) ||
    isAtypicalReopenFollowUpPrompt(prompt) ||
    isCrossFileRepairFollowUpPrompt(prompt) ||
    isVerifyContinuationFollowUpPrompt(prompt) ||
    isCorrectionFollowUpPrompt(prompt) ||
    isExecutionCorrectionFollowUpPrompt(prompt) ||
    isAnswerRepairFollowUpPrompt(prompt) ||
    isWeakRepairFollowUpPrompt(prompt) ||
    isAmbiguousGroundedRepairFollowUp(prompt)
  );
}

function deriveIntentFamily(
  taskKind: CodingTaskKind | undefined,
): "read" | "diagnosis" | "edit" | "execute" | "chat" {
  switch (taskKind) {
    case "read-file":
    case "inspect-files":
      return "read";
    case "repo-explain":
      return "diagnosis";
    case "edit-file":
    case "write-file":
      return "edit";
    case "run-command":
      return "execute";
    default:
      return "chat";
  }
}

function resolvePromptIntentFamily(input: {
  hasReadIntent: boolean;
  hasDiagnosisIntent: boolean;
  hasEditIntent: boolean;
  hasVerifyIntent: boolean;
  hasExecutionIntent: boolean;
}): "read" | "diagnosis" | "edit" | "execute" | "chat" {
  if (input.hasEditIntent) {
    return "edit";
  }
  if (input.hasVerifyIntent) {
    return "execute";
  }
  if (input.hasDiagnosisIntent) {
    return "diagnosis";
  }
  if (input.hasReadIntent) {
    return "read";
  }
  if (input.hasExecutionIntent) {
    return "execute";
  }
  return "chat";
}

function shouldCutSameFileFamilyBySemanticShift(input: {
  continuity: ContinuityStateLike;
  prompt: string;
  explicitTargetPath?: string;
  hasReadIntent: boolean;
  hasDiagnosisIntent: boolean;
  hasEditIntent: boolean;
  hasVerifyIntent: boolean;
  hasExecutionIntent: boolean;
}): boolean {
  const anchor = normalizePathLike(input.continuity.continuationFamilyAnchor ?? "");
  const explicitTarget = normalizePathLike(input.explicitTargetPath ?? "");
  const hasPathlessSameFileReference =
    /\bthis file\b|\bthat file\b|(?:\u8be5|\u8fd9)\u4e2a?\u6587\u4ef6/i.test(
      input.prompt,
    );
  const sameFileReference =
    (anchor.length > 0 && explicitTarget.length > 0 && anchor === explicitTarget) ||
    (anchor.length > 0 && explicitTarget.length === 0 && hasPathlessSameFileReference);
  if (!sameFileReference) {
    return false;
  }
  if (hasContinuationFamilyCueInPrompt(input.prompt)) {
    return false;
  }
  const previousFamily = deriveIntentFamily(input.continuity.lastTaskKind);
  const currentFamily = resolvePromptIntentFamily({
    hasReadIntent: input.hasReadIntent,
    hasDiagnosisIntent: input.hasDiagnosisIntent,
    hasEditIntent: input.hasEditIntent,
    hasVerifyIntent: input.hasVerifyIntent,
    hasExecutionIntent: input.hasExecutionIntent,
  });
  if (currentFamily === "chat" || currentFamily === previousFamily) {
    return false;
  }
  return true;
}

function encodeLineageSlot(input: {
  target: string;
  family: "read" | "diagnosis" | "edit" | "execute" | "chat";
  transform?: string;
}): string {
  return `${input.target}::${input.family}::${input.transform ?? "*"}`;
}

function decodeLineageSlot(
  value: string,
):
  | {
      target: string;
      family: "read" | "diagnosis" | "edit" | "execute" | "chat";
      transform: string;
    }
  | undefined {
  const [target, family, transform] = value.split("::");
  if (!target || !family || !transform) {
    return undefined;
  }
  if (
    family !== "read" &&
    family !== "diagnosis" &&
    family !== "edit" &&
    family !== "execute" &&
    family !== "chat"
  ) {
    return undefined;
  }
  return {
    target: normalizePathLike(target),
    family,
    transform,
  };
}

function extractLineageSlotsFromEvidence(
  evidence: readonly string[] | undefined,
): { slots: string[]; active?: string } {
  const slots = new Set<string>();
  let active: string | undefined;
  for (const entry of evidence ?? []) {
    const normalized = entry.trim();
    if (!normalized) {
      continue;
    }
    const lowered = normalized.toLowerCase();
    if (lowered.startsWith("continuation-lineage-slot:")) {
      const value = normalized
        .slice("continuation-lineage-slot:".length)
        .trim();
      if (value.length > 0) {
        slots.add(value);
      }
    } else if (lowered.startsWith("continuation-lineage-active:")) {
      const value = normalized
        .slice("continuation-lineage-active:".length)
        .trim();
      if (value.length > 0) {
        active = value;
      }
    }
  }
  return {
    slots: Array.from(slots),
    active,
  };
}

function lineageSlotMatches(
  candidate: string,
  target: string,
  family: "read" | "diagnosis" | "edit" | "execute" | "chat",
  transform: string,
): boolean {
  const decoded = decodeLineageSlot(candidate);
  if (!decoded) {
    return false;
  }
  if (decoded.target !== target || decoded.family !== family) {
    return false;
  }
  if (decoded.transform === "*" || transform === "*") {
    return true;
  }
  return decoded.transform === transform;
}

function resolveSameFileLineageSlotDecision(input: {
  continuity: ContinuityStateLike;
  promptIntentFamily: "read" | "diagnosis" | "edit" | "execute" | "chat";
  hasContinuationCue: boolean;
  hasWeakActivationShape: boolean;
  hasExplicitPathReference: boolean;
  hasExplicitTransformOverride: boolean;
  primaryTargetPath?: string;
}):
  | {
      decision: "match";
      family: "read" | "diagnosis" | "edit" | "execute" | "chat";
      selected: string;
      candidates: string[];
      reason: string;
    }
  | {
      decision: "ambiguous-clarify";
      candidates: string[];
      reason: string;
    }
  | undefined {
  if (
    (!input.hasContinuationCue && !input.hasWeakActivationShape) ||
    input.hasExplicitPathReference ||
    input.hasExplicitTransformOverride
  ) {
    return undefined;
  }
  const anchor = normalizePathLike(
    input.primaryTargetPath ??
      input.continuity.continuationFamilyAnchor ??
      input.continuity.recentTargetFiles?.[0] ??
      "",
  );
  if (!anchor) {
    return undefined;
  }
  const lineage = extractLineageSlotsFromEvidence(
    input.continuity.lastContinuationEvidence,
  );
  const rawCandidates = Array.from(
    new Set([...(lineage.active ? [lineage.active] : []), ...lineage.slots]),
  );
  const slotCandidates = rawCandidates
    .map((raw) => ({ raw, decoded: decodeLineageSlot(raw) }))
    .filter(
      (
        entry,
      ): entry is {
        raw: string;
        decoded: {
          target: string;
          family: "read" | "diagnosis" | "edit" | "execute" | "chat";
          transform: string;
        };
      } => Boolean(entry.decoded && entry.decoded.target === anchor),
    );
  if (slotCandidates.length === 0) {
    return undefined;
  }
  const families = Array.from(new Set(slotCandidates.map((slot) => slot.decoded.family)));
  const candidateLabels = slotCandidates.map(
    (slot) => `${slot.decoded.family}:${slot.decoded.transform}`,
  );

  if (slotCandidates.length === 1) {
    return {
      decision: "match",
      family: slotCandidates[0]!.decoded.family,
      selected: slotCandidates[0]!.raw,
      candidates: candidateLabels,
      reason: "single same-file lineage slot candidate",
    };
  }

  if (input.promptIntentFamily !== "chat") {
    const familyMatched = slotCandidates.filter(
      (slot) => slot.decoded.family === input.promptIntentFamily,
    );
    if (familyMatched.length === 1) {
      return {
        decision: "match",
        family: input.promptIntentFamily,
        selected: familyMatched[0]!.raw,
        candidates: candidateLabels,
        reason: `same-file lineage slot matched by intent family ${input.promptIntentFamily}`,
      };
    }
    if (familyMatched.length > 1) {
      return {
        decision: "ambiguous-clarify",
        candidates: candidateLabels,
        reason: `multiple same-file lineage slots match intent family ${input.promptIntentFamily}`,
      };
    }
    if (families.length === 1 && slotCandidates.length >= 1) {
      return {
        decision: "match",
        family: families[0]!,
        selected: slotCandidates[0]!.raw,
        candidates: candidateLabels,
        reason: "same-file lineage slots collapse to one operation family",
      };
    }
    return {
      decision: "ambiguous-clarify",
      candidates: candidateLabels,
      reason: "same-file lineage slots span multiple operation families",
    };
  }

  if (families.length === 1 && slotCandidates.length >= 1) {
    return {
      decision: "match",
      family: families[0]!,
      selected: slotCandidates[0]!.raw,
      candidates: candidateLabels,
      reason: "pathless follow-up matched single same-file lineage family",
    };
  }
  return {
    decision: "ambiguous-clarify",
    candidates: candidateLabels,
    reason:
      "pathless follow-up is ambiguous across same-file lineage slots; explicit intent/path needed",
  };
}

function hasWeakNoCueSameFileActivationShape(input: {
  prompt: string;
  promptIntentFamily: "read" | "diagnosis" | "edit" | "execute" | "chat";
  hasContinuationCue: boolean;
  hasExplicitPathReference: boolean;
  hasExplicitTransformOverride: boolean;
  hasContinuationStateSignals: boolean;
}): boolean {
  if (
    input.hasContinuationCue ||
    input.hasExplicitPathReference ||
    input.hasExplicitTransformOverride ||
    !input.hasContinuationStateSignals ||
    input.promptIntentFamily !== "chat"
  ) {
    return false;
  }
  const normalized = input.prompt.trim().toLowerCase();
  if (!normalized || normalized.length > 32 || /[?？]/.test(normalized)) {
    return false;
  }
  if (
    /^(?:hi|hello|hey|thanks|thank you|ok|okay|cool|great|nice|bye|再见|谢谢|好的|ok了)$/i.test(
      normalized,
    )
  ) {
    return false;
  }
  const tokenCount = normalized.split(/\s+/).filter((token) => token.length > 0).length;
  if (tokenCount > 4) {
    return false;
  }
  const hasActionVerb =
    /\b(?:continue|keep|go|do|finish|proceed)\b/i.test(normalized) ||
    /(?:继续|接着|做完|继续吧)/u.test(normalized);
  if (!hasActionVerb) {
    return false;
  }
  const hasDeicticReference =
    /\b(?:it|that|this|one|rest)\b/i.test(normalized) ||
    /(?:这个|那个|它|剩下|其余)/u.test(normalized);
  return hasDeicticReference || tokenCount <= 2;
}

function hasWeakNoCueCrossFileActivationShape(input: {
  prompt: string;
  promptIntentFamily: "read" | "diagnosis" | "edit" | "execute" | "chat";
  hasContinuationCue: boolean;
  hasExplicitPathReference: boolean;
  hasExplicitTransformOverride: boolean;
  hasCrossFileContinuationSignals: boolean;
}): boolean {
  if (
    input.hasContinuationCue ||
    input.hasExplicitPathReference ||
    input.hasExplicitTransformOverride ||
    !input.hasCrossFileContinuationSignals ||
    input.promptIntentFamily !== "chat"
  ) {
    return false;
  }
  const normalized = input.prompt.trim().toLowerCase();
  if (!normalized || normalized.length > 32 || /[?？]/.test(normalized)) {
    return false;
  }
  if (
    /^(?:hi|hello|hey|thanks|thank you|ok|okay|cool|great|nice|bye|再见|谢谢|好的|ok了)$/i.test(
      normalized,
    )
  ) {
    return false;
  }
  const tokenCount = normalized.split(/\s+/).filter((token) => token.length > 0).length;
  if (tokenCount > 4) {
    return false;
  }
  const hasActionVerb =
    /\b(?:continue|keep|go|do|finish|proceed)\b/i.test(normalized) ||
    /(?:继续|接着|做完|继续吧)/u.test(normalized);
  if (!hasActionVerb) {
    return false;
  }
  const hasDeicticReference =
    /\b(?:it|that|this|one|rest)\b/i.test(normalized) ||
    /(?:这个|那个|它|剩下|其余)/u.test(normalized);
  return hasDeicticReference || tokenCount <= 2;
}

function buildWorkflowTaskPlan(
  prompt: string,
  workspaceRoot: string,
  continuityState?: unknown,
): WorkflowTaskPlan {
  const normalized = prompt.toLowerCase();
  const intentPrompt = stripPathTokensForIntent(prompt);
  const groundedIntentPrompt = intentPrompt.length > 0 ? intentPrompt : prompt;
  const targetResolution = resolveTaskTargets(prompt, workspaceRoot);
  const continuity = continuityStateAsObject(continuityState);
  const forcedStepPlan = buildWorkflowTaskPlanFromForcedStep({
    continuity,
    workspaceRoot,
  });
  if (forcedStepPlan) {
    return forcedStepPlan;
  }
  const promptPathTarget = derivePromptPathTarget(prompt, workspaceRoot);
  const explicitPrimaryTarget = targetResolution.primaryTarget;
  const hasFileReadIntent = /(?:\bread\b|\binspect\b|\bopen\b|\bshow\b|\bprint\b|\u67e5\u770b|\u8bfb\u53d6|\u770b\u770b|\u5206\u6790|\u524d\s*\d+\s*\u884c)/i.test(
    groundedIntentPrompt,
  );
  const hasSummarizeIntent = /(?:summari[sz]e|summary|\u603b\u7ed3|\u6458\u8981|\u6982\u8ff0)/i.test(
    groundedIntentPrompt,
  );
  const hasExplainIntent = /(?:\bexplain\b|what .* does|\u89e3\u91ca|\u5728\u505a\u4ec0\u4e48)/i.test(
    groundedIntentPrompt,
  );
  const hasLocalExplainCue =
    hasExplainIntent && hasLocalSliceExplainCue(groundedIntentPrompt);
  const hasGroundedReadLikeIntent =
    hasFileReadIntent || hasSummarizeIntent || hasExplainIntent;
  const hasGroundedConstraintCue =
    parseGroundedRepairConstraints(groundedIntentPrompt) !== undefined;
  const hasExplicitPathReference =
    Boolean(promptPathTarget || explicitPrimaryTarget) ||
    targetResolution.targets.length > 0 ||
    hasPathLikeReference(prompt);
  const hasCreateIntent = /(?:create|new file|\u65b0\u589e|\u521b\u5efa|\u65b0\u5efa|\u5199\u4e00\u4e2a)/i.test(intentPrompt);
  const hasEditIntent = /(?:\bedit\b|modify|update|fix|change|repair|continue fixing|continue repairing|\u4fee\u6539|\u4fee\u590d|\u6539\u4e00\u4e0b|\u6539\u6210|\u6539\u4e3a|\u66ff\u6362|\u66ff\u6362\u4e3a|\u7ee7\u7eed\u4fee)/i.test(
    intentPrompt,
  );
  const hasVerifyIntent = /(?:verify|test|build|lint|check|\u9a8c\u8bc1|\u6d4b\u8bd5|\u6784\u5efa|\u7f16\u8bd1|\u68c0\u67e5)/i.test(
    intentPrompt,
  );
  const hasCorrectionCue = isCorrectionFollowUpPrompt(prompt);
  const hasExecutionCorrectionCue = isExecutionCorrectionFollowUpPrompt(prompt);
  const hasAnswerRepairCue = isAnswerRepairFollowUpPrompt(prompt);
  const isAmbiguousRepairFollowUp = isAmbiguousGroundedRepairFollowUp(prompt);
  const lastTaskWasReadLike =
    continuity.lastTaskKind === "read-file" ||
    continuity.lastTaskKind === "repo-explain" ||
    continuity.lastTaskKind === "inspect-files";
  const lastTaskWasMutationLike =
    continuity.lastTaskKind === "edit-file" ||
    continuity.lastTaskKind === "write-file";
  const lastTaskHadVerifySignal =
    continuity.lastVerificationStatus === "failed" ||
    continuity.lastVerificationStatus === "blocked" ||
    continuity.lastVerificationStatus === "skipped" ||
    (continuity.unresolvedItems ?? []).some((entry) =>
      entry.toLowerCase().startsWith("verify:") &&
      !entry.toLowerCase().includes("not-requested"),
    );
  const hasDiagnosisIntent =
    /(?:why|how|where|which file|implemented|\u4e3a\u4ec0\u4e48|\u600e\u4e48|\u5728\u54ea|\u54ea\u4e2a\u6587\u4ef6|\u5b9e\u73b0)/i.test(
      groundedIntentPrompt,
    );
  const hasWeakRepairFollowUp = isWeakRepairFollowUpPrompt(prompt);
  const avoidPreviousDirection = isAvoidPreviousDirectionPrompt(prompt);
  const hasCrossFileCue = isCrossFileRepairFollowUpPrompt(prompt);
  const hasVerifyContinuationCue = isVerifyContinuationFollowUpPrompt(prompt);
  const verifyCommand = detectVerifyCommand(normalized);
  const preferTestOverBuild = prefersTestOverBuildInFollowUp(prompt);
  const effectiveVerifyCommand =
    preferTestOverBuild && hasVerifyIntent
      ? "npm test -- --help"
      : verifyCommand;
  const promptReplaceDirective = extractReplaceDirective(prompt);
  const effectiveReplaceDirectiveFromPrompt = promptReplaceDirective;
  const hasAtypicalReopenCue = isAtypicalReopenFollowUpPrompt(prompt);
  const hasContinuationFamilyCue = hasContinuationFamilyCueInPrompt(prompt);
  const promptIntentFamily = resolvePromptIntentFamily({
    hasReadIntent: hasGroundedReadLikeIntent,
    hasDiagnosisIntent,
    hasEditIntent: hasEditIntent || hasCreateIntent,
    hasVerifyIntent,
    hasExecutionIntent: hasExplicitExecutionIntent(prompt, normalized),
  });
  const transformSignature = effectiveReplaceDirectiveFromPrompt
    ? `${effectiveReplaceDirectiveFromPrompt.from}=>${effectiveReplaceDirectiveFromPrompt.to}`
    : undefined;
  const semanticSameFileFamilyCut = shouldCutSameFileFamilyBySemanticShift({
    continuity,
    prompt,
    explicitTargetPath:
      explicitPrimaryTarget?.cleaned ??
      promptPathTarget?.cleaned ??
      explicitPrimaryTarget?.raw ??
      promptPathTarget?.raw,
    hasReadIntent: hasGroundedReadLikeIntent,
    hasDiagnosisIntent,
    hasEditIntent: hasEditIntent || hasCreateIntent,
    hasVerifyIntent,
    hasExecutionIntent: hasExplicitExecutionIntent(prompt, normalized),
  });
  const freshnessConsumption = applyAgeAwareEvidenceConsumption({
    continuity,
    prompt,
    hasExplicitPathOverride:
      Boolean(promptPathTarget || explicitPrimaryTarget) ||
      targetResolution.targets.length > 0 ||
      hasPathLikeReference(prompt),
    hasExplicitTransformOverride: Boolean(effectiveReplaceDirectiveFromPrompt),
    hasContinuationFamilyCue,
    explicitTargetPath:
      explicitPrimaryTarget?.cleaned ??
      promptPathTarget?.cleaned ??
      explicitPrimaryTarget?.raw ??
      promptPathTarget?.raw,
    hasSemanticSameFileNewIntent: semanticSameFileFamilyCut,
    intentFamily: promptIntentFamily,
    transformSignature,
  });
  const continuityForConsumption = freshnessConsumption.continuity;
  const rawContinuityTargetPath = deriveContinuationTargetPath({
    continuity: continuityForConsumption,
    intentFamily: promptIntentFamily,
    transformSignature,
  });
  const hasExecutionIntent = hasExplicitExecutionIntent(prompt, normalized);
  const unsupportedCommand = detectUnsupportedCommandIntent(normalized);
  let previousRemainingTargets = extractCrossFileStateListFromContinuityEvidence(
    continuityForConsumption,
    "repair-remaining-files:",
  );
  const previousReopenCandidates = extractCrossFileStateListFromContinuityEvidence(
    continuityForConsumption,
    "reopen-candidates:",
  );
  let previousFailedEntries = extractCrossFileFailureEntriesFromContinuity(
    continuityForConsumption,
  );
  const hasFailureRecoverySignals =
    previousRemainingTargets.length > 0 ||
    previousFailedEntries.length > 0 ||
    (continuityForConsumption.recentFailedFiles?.length ?? 0) > 0;
  const hasContinuationStateSignals =
    previousRemainingTargets.length > 0 ||
    previousFailedEntries.length > 0 ||
    previousReopenCandidates.length > 0 ||
    (continuityForConsumption.recentTargetFiles?.length ?? 0) > 0 ||
    (continuityForConsumption.recentFailedFiles?.length ?? 0) > 0 ||
    (continuityForConsumption.lastContinuationEvidence?.length ?? 0) > 0;
  const hasContinuationCue =
    /(?:continue|same file|use the failure above|wrong direction|not the right fix|\u7ee7\u7eed|\u63a5\u7740|\u4e0a\u4e00\u8f6e|\u5931\u8d25)/i.test(
      prompt,
    ) ||
    (hasAtypicalReopenCue &&
      hasContinuationStateSignals &&
      !hasDiagnosisIntent &&
      !hasExecutionIntent &&
      !hasGroundedReadLikeIntent);
  const hasWeakActivationShape = hasWeakNoCueSameFileActivationShape({
    prompt,
    promptIntentFamily,
    hasContinuationCue,
    hasExplicitPathReference,
    hasExplicitTransformOverride: Boolean(effectiveReplaceDirectiveFromPrompt),
    hasContinuationStateSignals,
  });
  const hasWeakCrossFileActivationShape = hasWeakNoCueCrossFileActivationShape({
    prompt,
    promptIntentFamily,
    hasContinuationCue,
    hasExplicitPathReference,
    hasExplicitTransformOverride: Boolean(effectiveReplaceDirectiveFromPrompt),
    hasCrossFileContinuationSignals:
      previousRemainingTargets.length > 0 ||
      previousFailedEntries.length > 0 ||
      previousReopenCandidates.length > 0,
  });
  const sameFileSlotDecision = resolveSameFileLineageSlotDecision({
    continuity: continuityForConsumption,
    promptIntentFamily,
    hasContinuationCue,
    hasWeakActivationShape,
    hasExplicitPathReference:
      Boolean(promptPathTarget || explicitPrimaryTarget) ||
      targetResolution.targets.length > 0 ||
      hasPathLikeReference(prompt),
    hasExplicitTransformOverride: Boolean(effectiveReplaceDirectiveFromPrompt),
    primaryTargetPath:
      explicitPrimaryTarget?.cleaned ??
      promptPathTarget?.cleaned ??
      rawContinuityTargetPath,
  });
  const slotForcedFamily =
    sameFileSlotDecision?.decision === "match"
      ? sameFileSlotDecision.family
      : undefined;
  const slotClarifyRequired =
    sameFileSlotDecision?.decision === "ambiguous-clarify";
  const sameFileDecisionMetadata: Partial<WorkflowTaskPlan> = sameFileSlotDecision
    ? {
        lineageSlotDecision: sameFileSlotDecision.decision,
        lineageActivationDecision:
          sameFileSlotDecision.decision === "match"
            ? "same-file-slot"
            : "same-file-slot-clarify",
        lineageActivationMode: hasWeakActivationShape ? "weak-shape" : "cue",
        lineageSlotConfidence:
          sameFileSlotDecision.decision === "match" ? "high" : "low",
        ...(sameFileSlotDecision.decision === "match"
          ? {
              lineageSlotFamily: sameFileSlotDecision.family,
              lineageSlotSelected: sameFileSlotDecision.selected,
            }
          : {}),
        lineageSlotCandidates: sameFileSlotDecision.candidates,
        lineageSlotReason: sameFileSlotDecision.reason,
      }
    : {};
  const hasDegradedContinuationEvidence = hasDegradedContinuationEvidenceInState(
    continuityForConsumption,
  );
  const hasDegradedReopenCue = isDegradedReopenFollowUpPrompt(prompt);
  const continuationReopenDecision = resolveContinuationReopenTarget({
    continuity: continuityForConsumption,
    prompt,
    workspaceRoot,
    enabled:
      (hasFailureRecoverySignals || hasDegradedContinuationEvidence) &&
      (hasDegradedReopenCue ||
        hasAtypicalReopenCue ||
        hasCrossFileCue ||
        hasContinuationCue ||
        hasWeakCrossFileActivationShape) &&
      !explicitPrimaryTarget &&
      !promptPathTarget,
    degradedOnly: hasDegradedContinuationEvidence && hasDegradedReopenCue,
  });
  const crossFileDecisionMetadata: Partial<WorkflowTaskPlan> =
    hasWeakCrossFileActivationShape && !sameFileSlotDecision
      ? continuationReopenDecision.selectedTarget
        ? {
            lineageActivationDecision: "cross-file-candidate",
            lineageActivationMode: "weak-shape",
            lineageSlotConfidence: "high",
            lineageSlotReason:
              "weak/no-cue cross-file follow-up activated a unique continuation reopen candidate",
            lineageSlotSelected: continuationReopenDecision.selectedTarget,
            lineageSlotCandidates: continuationReopenDecision.candidates,
          }
        : continuationReopenDecision.enabled
          ? {
              lineageActivationDecision: "cross-file-disambiguation",
              lineageActivationMode: "weak-shape",
              lineageSlotConfidence: "low",
              lineageSlotReason:
                continuationReopenDecision.candidates.length > 1
                  ? "weak/no-cue cross-file follow-up is ambiguous across multiple reopen candidates"
                  : "weak/no-cue cross-file follow-up has no recoverable continuation reopen candidate",
              lineageSlotCandidates: continuationReopenDecision.candidates,
            }
          : {}
      : {};
  const activationDecisionMetadata =
    Object.keys(sameFileDecisionMetadata).length > 0
      ? sameFileDecisionMetadata
      : Object.keys(crossFileDecisionMetadata).length > 0
        ? crossFileDecisionMetadata
        : hasWeakActivationShape
          ? {
              lineageActivationDecision: "chat-boundary" as const,
              lineageActivationMode: "weak-shape" as const,
              lineageSlotConfidence: "low" as const,
              lineageSlotReason:
                "weak/no-cue same-file follow-up lacked confident active slot; preserved chat boundary",
            }
          : {};
  const hasContinuationExecutionIntent =
    hasContinuationCue ||
    (hasWeakActivationShape &&
      sameFileSlotDecision?.decision === "match" &&
      (sameFileSlotDecision.family === "edit" ||
        sameFileSlotDecision.family === "execute")) ||
    hasEditIntent ||
    hasCreateIntent ||
    (continuationReopenDecision.enabled &&
      (Boolean(continuationReopenDecision.selectedTarget) ||
        continuationReopenDecision.candidates.length > 0));
  const shouldUseContinuationTarget = Boolean(
    !explicitPrimaryTarget &&
      rawContinuityTargetPath &&
      (hasContinuationCue ||
        hasCorrectionCue ||
        hasExecutionCorrectionCue ||
        hasAnswerRepairCue ||
        hasGroundedConstraintCue ||
        isAmbiguousRepairFollowUp ||
        hasWeakRepairFollowUp ||
        hasWeakActivationShape ||
        (hasGroundedReadLikeIntent && lastTaskWasReadLike) ||
        hasEditIntent ||
        hasCreateIntent ||
        (hasVerifyIntent && lastTaskHadVerifySignal)),
  );
  const rawContinuationTargetPath =
    continuationReopenDecision.selectedTarget ??
    (shouldUseContinuationTarget ? rawContinuityTargetPath : undefined);
  const relocationDecision = resolveMigrationAwareContinuationTargetPath({
    candidatePath: rawContinuationTargetPath,
    workspaceRoot,
    continuity: continuityForConsumption,
    prompt,
    enabled:
      !explicitPrimaryTarget &&
      !promptPathTarget &&
      Boolean(rawContinuationTargetPath) &&
      (hasContinuationCue ||
        hasCorrectionCue ||
        hasExecutionCorrectionCue ||
        hasAnswerRepairCue ||
        hasGroundedReadLikeIntent ||
        hasEditIntent ||
        hasCreateIntent ||
        hasVerifyIntent),
  });
  const continuityTargetPath =
    relocationDecision.targetPath ?? rawContinuationTargetPath;
  const explicitHasExtension = Boolean(
    explicitPrimaryTarget?.cleaned &&
      /\/[^/]+\.[A-Za-z0-9._-]+$/.test(
        normalizePathLike(explicitPrimaryTarget.cleaned),
      ),
  );
  let primaryTarget =
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
  const usedRestoredState =
    !explicitPrimaryTarget && Boolean(rawContinuationTargetPath);
  const followUpContinuationIntent =
    hasContinuationCue ||
    hasCorrectionCue ||
    hasExecutionCorrectionCue ||
    hasAnswerRepairCue ||
    isAmbiguousRepairFollowUp ||
    hasGroundedReadLikeIntent ||
    hasEditIntent ||
    hasCreateIntent;
  const explicitPathRelocationDecision =
    primaryTarget?.inWorkspace && followUpContinuationIntent
      ? resolveMigrationAwareContinuationTargetPath({
          candidatePath: primaryTarget.cleaned,
          workspaceRoot,
          continuity: continuityForConsumption,
          prompt,
          enabled: true,
        })
      : { targetPath: primaryTarget?.cleaned } satisfies ContinuationTargetRelocationDecision;
  if (
    explicitPathRelocationDecision.targetPath &&
    primaryTarget?.cleaned &&
    normalizePathLike(explicitPathRelocationDecision.targetPath) !==
      normalizePathLike(primaryTarget.cleaned)
  ) {
    primaryTarget = {
      raw: explicitPathRelocationDecision.targetPath,
      cleaned: explicitPathRelocationDecision.targetPath,
      absolutePath: explicitPathRelocationDecision.targetPath,
      inWorkspace: true,
    };
  }
  const relocationMetadata =
    (relocationDecision.recoveredFromPath && continuityTargetPath) ||
    (explicitPathRelocationDecision.recoveredFromPath && primaryTarget?.cleaned)
      ? {
          relocatedTargetFromPath:
            relocationDecision.recoveredFromPath ??
            explicitPathRelocationDecision.recoveredFromPath,
          relocationRecoveryReason:
            relocationDecision.recoveryReason ??
            explicitPathRelocationDecision.recoveryReason ??
            "continuation target relocated after migration",
          relocationCandidateSummary:
            relocationDecision.candidateSummary ??
            explicitPathRelocationDecision.candidateSummary ??
            [],
        }
      : {};
  const relocatedTargetAliases = buildRelocatedContinuationTargetAliases({
    targetPath: primaryTarget?.cleaned,
    relocatedFromPath:
      relocationDecision.recoveredFromPath ??
      explicitPathRelocationDecision.recoveredFromPath,
  });
  if (relocatedTargetAliases.length > 1) {
    const canonicalTarget = relocatedTargetAliases[0]!;
    const aliasSet = new Set(
      relocatedTargetAliases.map((value) => normalizePathLike(value)),
    );
    previousRemainingTargets = previousRemainingTargets.map((candidate) =>
      aliasSet.has(normalizePathLike(candidate)) ? canonicalTarget : candidate,
    );
    previousFailedEntries = previousFailedEntries.map((entry) =>
      aliasSet.has(normalizePathLike(entry.path))
        ? { ...entry, path: canonicalTarget }
        : entry,
    );
  }
  const explicitDeliverableMode = detectGroundedDeliverableMode(prompt);
  const inferredDeliverableModeFromContinuity = inferGroundedDeliverableModeFromContinuity(
    continuityForConsumption,
  );
  const effectiveGroundedDeliverableMode =
    explicitDeliverableMode ??
    ((lastTaskWasReadLike &&
      (hasContinuationCue ||
        hasCorrectionCue ||
        hasAnswerRepairCue ||
        isAmbiguousRepairFollowUp ||
        hasGroundedReadLikeIntent ||
        (usedRestoredState && !hasDiagnosisIntent)))
      ? inferredDeliverableModeFromContinuity
      : undefined);
  const normalizedRepairInstruction = normalizeGroundedRepairInstruction({
    prompt,
    continuity: continuityForConsumption,
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
    continuityForConsumption,
    {
      localSliceExplain: hasLocalExplainCue,
    },
  );
  const readFragmentDirective = extractLastReadDeliveredFragmentFromContinuity(
    continuityForConsumption,
  );
  const readLineCount = readWindowDirective.lineCount;
  const readLineOffset = readWindowDirective.lineOffset;
  const failedTransforms = collectContinuationTransforms(
    continuityForConsumption,
    primaryTarget?.cleaned,
    relocatedTargetAliases,
  );
  const hasCrossFileContinuationContext =
    hasCrossFileContinuationContextInContinuity(continuityForConsumption);
  const crossFileCandidates = deriveCrossFileRepairCandidates(
    continuityForConsumption,
    primaryTarget?.cleaned,
  );
  const hasCrossFileEvidenceSignal = hasCrossFileEvidenceSignalInContinuity(
    continuityForConsumption,
  );
  const continuityReplaceDirective = inferReplaceDirectiveFromContinuity(
    continuityForConsumption,
    primaryTarget?.cleaned,
    relocatedTargetAliases,
  );
  const allowWeakFollowUpInheritedTransform =
    hasWeakRepairFollowUp &&
    crossFileCandidates.length > 0 &&
    (hasCrossFileCue || hasCrossFileEvidenceSignal);
  const effectiveReplaceDirective =
    effectiveReplaceDirectiveFromPrompt ??
    (hasWeakRepairFollowUp && !allowWeakFollowUpInheritedTransform
      ? undefined
      : continuityReplaceDirective);
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
    (hasCrossFileCue || hasContinuationCue || hasWeakRepairFollowUp) &&
    hasCrossFileContinuationContext &&
    crossFileCandidates.length === 0;
  const missingActiveWorkContext =
    (hasExecutionCorrectionCue || hasContinuationCue) &&
    !primaryTarget?.inWorkspace &&
    !explicitPrimaryTarget &&
    (lastTaskWasMutationLike || lastTaskHadVerifySignal);

  if (
    slotClarifyRequired &&
    !hasVerifyIntent &&
    !explicitPrimaryTarget &&
    !promptPathTarget
  ) {
    return {
      taskKind: "read-file",
      reason: "same-file multi-subtask lineage slots are ambiguous for pathless follow-up",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason: `Same-file continuation is ambiguous across multiple subtask slots (${sameFileSlotDecision.candidates.join(", ")}). Clarify whether to continue read/summary/explain or edit/repair, or provide explicit path/transform.`,
      targetMissing: true,
      usedRestoredState,
      ...activationDecisionMetadata,
    };
  }

  if (continuationReopenDecision.enabled && !continuationReopenDecision.selectedTarget) {
    const reason =
      continuationReopenDecision.candidates.length > 1
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
    };
  }

  if (
    relocationDecision.blockedReason &&
    !explicitPrimaryTarget &&
    !promptPathTarget &&
    followUpContinuationIntent
  ) {
    return {
      taskKind:
        hasEditIntent || hasCreateIntent || hasExecutionCorrectionCue
          ? "edit-file"
          : "read-file",
      reason: "migration-aware continuation target relocation unresolved",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason: relocationDecision.blockedReason,
      targetMissing: true,
      usedRestoredState,
      previousRemainingTargets,
      previousFailedEntries,
      ...(relocationDecision.candidateSummary?.length
        ? { degradedReopenCandidates: relocationDecision.candidateSummary }
        : {}),
    };
  }

  if (
    explicitPathRelocationDecision.blockedReason &&
    primaryTarget?.inWorkspace &&
    followUpContinuationIntent
  ) {
    return {
      taskKind:
        hasEditIntent || hasCreateIntent || hasExecutionCorrectionCue
          ? "edit-file"
          : "read-file",
      reason: "migration-aware target relocation unresolved on inherited explicit path",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason: explicitPathRelocationDecision.blockedReason,
      targetMissing: true,
      usedRestoredState,
      previousRemainingTargets,
      previousFailedEntries,
      ...(explicitPathRelocationDecision.candidateSummary?.length
        ? {
            degradedReopenCandidates:
              explicitPathRelocationDecision.candidateSummary,
          }
        : {}),
    };
  }

  if (missingActiveWorkContext) {
    return {
      taskKind: "edit-file",
      reason: "follow-up mutation/verify prompt has no resolvable active target",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason:
        "Follow-up refers to previous edit/verify work, but no active target/failure context could be inherited. Provide explicit file path or rerun with the previous session context.",
      targetMissing: true,
      usedRestoredState,
    };
  }

  if (
    (hasCorrectionCue ||
      hasContinuationCue ||
      hasAnswerRepairCue ||
      isAmbiguousRepairFollowUp ||
      normalizedRepairInstruction.operation === "clarify") &&
    !primaryTarget?.inWorkspace &&
    !explicitPrimaryTarget
  ) {
    return {
      taskKind: "read-file",
      reason: "follow-up prompt has no resolvable inherited target",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason:
        "Follow-up prompt refers to previous target, but no active file could be inherited in this session. Provide explicit file path.",
      targetMissing: true,
      usedRestoredState,
    };
  }

  if (hasLocalExplainCue && lastTaskWasReadLike && primaryTarget?.inWorkspace) {
    return {
      taskKind: "read-file",
      reason: "local slice explain follow-up resolved on active read target",
      targetPath: primaryTarget.cleaned,
      groundedDeliverableMode: "explain",
      forceExplainFragmentAnchor: true,
      allowWholeFileExplainFallback: true,
      ...(readLineCount !== undefined ? { readLineCount } : {}),
      ...(readLineOffset !== undefined ? { readLineOffset } : {}),
      ...(readFragmentDirective.lineIndexes?.length
        ? { readFragmentLineIndexes: readFragmentDirective.lineIndexes }
        : {}),
      ...(readFragmentDirective.ranges?.length
        ? { readFragmentRanges: readFragmentDirective.ranges }
        : {}),
      ...(readFragmentDirective.sourceWindowStart !== undefined
        ? { readFragmentSourceWindowStart: readFragmentDirective.sourceWindowStart }
        : {}),
      ...(readFragmentDirective.sourceWindowEnd !== undefined
        ? { readFragmentSourceWindowEnd: readFragmentDirective.sourceWindowEnd }
        : {}),
      ...(readFragmentDirective.fingerprint
        ? { readFragmentFingerprint: readFragmentDirective.fingerprint }
        : {}),
      ...(readFragmentDirective.structureSignature
        ? {
            readFragmentStructureSignature:
              readFragmentDirective.structureSignature,
          }
        : {}),
      ...(readFragmentDirective.neighborhoodSignature
        ? {
            readFragmentNeighborhoodSignature:
              readFragmentDirective.neighborhoodSignature,
          }
        : {}),
      ...(readFragmentDirective.filter
        ? { readFilter: readFragmentDirective.filter }
        : {}),
      inspectFirst: true,
      verifyAfterEdit: false,
      usedRestoredState,
      repairInstruction: {
        ...normalizedRepairInstruction,
        targetMode: "explain",
      },
    };
  }

  if (
    (hasCorrectionCue || hasContinuationCue || hasGroundedConstraintCue) &&
    lastTaskWasReadLike &&
    !hasEditIntent &&
    !hasCreateIntent &&
    !effectiveReplaceDirectiveFromPrompt &&
    slotForcedFamily !== "edit"
  ) {
    if (!primaryTarget?.inWorkspace) {
      return {
        taskKind: "read-file",
        reason: "correction follow-up requires previous target but none was resolved",
        inspectFirst: true,
        verifyAfterEdit: false,
        blockedReason:
          "Follow-up correction refers to previous file/task, but no active target could be inherited. Provide explicit file path.",
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
          "Follow-up mixes multiple grounded corrections. Clarify one intended deliverable.",
        targetMissing: false,
        usedRestoredState,
        repairInstruction: normalizedRepairInstruction,
      };
    }
    return {
      taskKind: "read-file",
      reason: "correction-aware follow-up resolved to previous read-like target",
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
        ? { readFragmentSourceWindowStart: readFragmentDirective.sourceWindowStart }
        : {}),
      ...(readFragmentDirective.sourceWindowEnd !== undefined
        ? { readFragmentSourceWindowEnd: readFragmentDirective.sourceWindowEnd }
        : {}),
      ...(readFragmentDirective.fingerprint
        ? { readFragmentFingerprint: readFragmentDirective.fingerprint }
        : {}),
      ...(readFragmentDirective.structureSignature
        ? {
            readFragmentStructureSignature:
              readFragmentDirective.structureSignature,
          }
        : {}),
      ...(readFragmentDirective.neighborhoodSignature
        ? {
            readFragmentNeighborhoodSignature:
              readFragmentDirective.neighborhoodSignature,
          }
        : {}),
      ...(readFragmentDirective.filter
        ? { readFilter: readFragmentDirective.filter }
        : {}),
      inspectFirst: true,
      verifyAfterEdit: false,
      usedRestoredState,
      repairInstruction: normalizedRepairInstruction,
      ...relocationMetadata,
      ...activationDecisionMetadata,
    };
  }

  if (lastTaskWasReadLike && normalizedRepairInstruction.operation !== "continue" &&
      (hasAnswerRepairCue || hasCorrectionCue || normalizedRepairInstruction.operation === "switch" || normalizedRepairInstruction.operation === "repair" || normalizedRepairInstruction.operation === "clarify" || isAmbiguousRepairFollowUp)
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
        ? { readFragmentSourceWindowStart: readFragmentDirective.sourceWindowStart }
        : {}),
      ...(readFragmentDirective.sourceWindowEnd !== undefined
        ? { readFragmentSourceWindowEnd: readFragmentDirective.sourceWindowEnd }
        : {}),
      ...(readFragmentDirective.fingerprint
        ? { readFragmentFingerprint: readFragmentDirective.fingerprint }
        : {}),
      ...(readFragmentDirective.structureSignature
        ? {
            readFragmentStructureSignature:
              readFragmentDirective.structureSignature,
          }
        : {}),
      ...(readFragmentDirective.neighborhoodSignature
        ? {
            readFragmentNeighborhoodSignature:
              readFragmentDirective.neighborhoodSignature,
          }
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

  if (
    hasExecutionCorrectionCue &&
    lastTaskWasMutationLike &&
    primaryTarget?.inWorkspace
  ) {
    return {
      taskKind: "edit-file",
      reason: "execution correction follow-up reused last active mutation target",
      targetPath: primaryTarget.cleaned,
      inspectFirst: true,
      verifyAfterEdit: hasVerifyIntent,
      ...(effectiveVerifyCommand ? { verifyCommand: effectiveVerifyCommand } : {}),
      continuationRepairReplan: true,
      ...(effectiveReplaceDirective
        ? {
            replaceFrom: effectiveReplaceDirective.from,
            replaceTo: effectiveReplaceDirective.to,
          }
        : {}),
      usedRestoredState,
    };
  }

  if (
    hasVerifyContinuationCue &&
    (hasExecutionCorrectionCue || hasContinuationCue) &&
    lastTaskHadVerifySignal &&
    !hasEditIntent &&
    !hasCreateIntent
  ) {
    if (!primaryTarget?.inWorkspace) {
      return {
        taskKind: "run-command",
        reason: "verify follow-up without resolvable inherited target",
        inspectFirst: false,
        verifyAfterEdit: false,
        blockedReason:
          "Verify follow-up refers to previous failure, but active verify target could not be inherited. Provide explicit file path or verification scope.",
        targetMissing: true,
        usedRestoredState,
      };
    }
    return {
      taskKind: "run-command",
      reason: "verify follow-up reused previous active target/failure context",
      targetPath: primaryTarget.cleaned,
      inspectFirst: false,
      verifyAfterEdit: false,
      directCommand: effectiveVerifyCommand ?? "npm test -- --help",
      usedRestoredState,
    };
  }

  if (
    (hasContinuationCue ||
      (hasWeakActivationShape &&
        sameFileSlotDecision?.decision === "match" &&
        sameFileSlotDecision.family === "read")) &&
    hasFileReadIntent &&
    primaryTarget?.inWorkspace
  ) {
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
      ...relocationMetadata,
      ...activationDecisionMetadata,
    };
  }

  if (
    hasGroundedReadLikeIntent &&
    hasExplicitPathReference &&
    !primaryTarget
  ) {
    return {
      taskKind: "read-file",
      reason: "grounded read/summarize/explain requires a resolvable target path",
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason:
        "Grounded read/summarize/explain request included a path reference, but no resolvable target was found. Provide a valid in-workspace file path.",
      targetMissing: true,
      usedRestoredState,
    };
  }

  if (
    hasGroundedReadLikeIntent &&
    primaryTarget &&
    !primaryTarget.inWorkspace
  ) {
    return {
      taskKind: "read-file",
      reason: "grounded read/summarize/explain target resolved outside workspace",
      targetPath: primaryTarget.cleaned,
      inspectFirst: true,
      verifyAfterEdit: false,
      blockedReason:
        "Grounded read/summarize/explain target is outside current workspace. Attach/switch project or provide an in-workspace path.",
      targetMissing: true,
      usedRestoredState,
    };
  }

  if (
    (hasSummarizeIntent || hasExplainIntent) &&
    !primaryTarget?.inWorkspace
  ) {
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
    hasWeakActivationShape &&
    sameFileSlotDecision?.decision === "match" &&
    promptIntentFamily === "chat" &&
    primaryTarget?.inWorkspace &&
    !hasEditIntent &&
    !hasCreateIntent &&
    !hasVerifyIntent &&
    !hasExecutionIntent
  ) {
    if (sameFileSlotDecision.family === "read") {
      return {
        taskKind: "read-file",
        reason: "weak/no-cue same-file follow-up activated active read lineage slot",
        targetPath: primaryTarget.cleaned,
        groundedDeliverableMode: effectiveGroundedDeliverableMode ?? "read",
        ...(readLineCount !== undefined ? { readLineCount } : {}),
        ...(readLineOffset !== undefined ? { readLineOffset } : {}),
        inspectFirst: true,
        verifyAfterEdit: false,
        usedRestoredState,
        repairInstruction: normalizedRepairInstruction,
        ...activationDecisionMetadata,
      };
    }
    if (sameFileSlotDecision.family === "diagnosis") {
      return {
        taskKind: "repo-explain",
        reason:
          "weak/no-cue same-file follow-up activated active diagnosis lineage slot",
        targetPath: primaryTarget.cleaned,
        inspectFirst: true,
        verifyAfterEdit: false,
        usedRestoredState,
        ...activationDecisionMetadata,
      };
    }
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
      reason: "explicit read intent takes precedence over inherited mutation context",
      targetPath: primaryTarget.cleaned,
      groundedDeliverableMode: effectiveGroundedDeliverableMode ?? "read",
      ...(readLineCount !== undefined ? { readLineCount } : {}),
      ...(readLineOffset !== undefined ? { readLineOffset } : {}),
      inspectFirst: true,
      verifyAfterEdit: false,
      usedRestoredState,
      repairInstruction: normalizedRepairInstruction,
    };
  }

  if (hasContinuationExecutionIntent && primaryTarget?.inWorkspace) {
    if (shouldReturnCrossFileConvergedNoop) {
      return {
        taskKind: "edit-file",
        reason: "cross-file continuation already converged; no remaining related targets",
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
        ...relocationMetadata,
      };
    }
    return {
      taskKind: hasCreateIntent ? "write-file" : "edit-file",
      reason: usedRestoredState
        ? "continuation edit/write target resolved from restored session state"
        : hasCreateIntent
          ? "write intent with explicit target"
          : "edit/repair intent with explicit target",
      targetPath: primaryTarget.cleaned,
      inspectFirst: !hasCreateIntent,
      verifyAfterEdit: hasVerifyIntent,
      ...(effectiveVerifyCommand ? { verifyCommand: effectiveVerifyCommand } : {}),
      ...(hasWeakRepairFollowUp
        ? { continuationRepairReplan: true }
        : {}),
      ...(avoidPreviousDirection ? { avoidPreviousDirection: true } : {}),
      ...(failedTransforms.length > 0
        ? { failedTransforms }
        : {}),
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
      ...relocationMetadata,
      ...activationDecisionMetadata,
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
      targetPath: primaryTarget?.inWorkspace ? primaryTarget.cleaned : undefined,
      inspectFirst: true,
      verifyAfterEdit: false,
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

  if (hasCreateIntent || hasEditIntent) {
    if (!primaryTarget) {
      return {
        taskKind: hasCreateIntent ? "write-file" : "edit-file",
        reason: "write/edit intent without resolvable target",
        inspectFirst: !hasCreateIntent,
        verifyAfterEdit: hasVerifyIntent,
        ...(effectiveVerifyCommand ? { verifyCommand: effectiveVerifyCommand } : {}),
        blockedReason:
          "Target file is required for write/edit task. Provide an explicit file path.",
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
        taskKind: hasCreateIntent ? "write-file" : "edit-file",
        reason: "target resolved outside workspace",
        inspectFirst: !hasCreateIntent,
        verifyAfterEdit: hasVerifyIntent,
        ...(effectiveVerifyCommand ? { verifyCommand: effectiveVerifyCommand } : {}),
        targetPath: primaryTarget.cleaned,
        blockedReason:
          "Resolved target is outside current workspace. Attach/switch project or provide an in-workspace path.",
        usedRestoredState,
      };
    }

    return {
      taskKind: hasCreateIntent ? "write-file" : "edit-file",
      reason: hasCreateIntent
        ? "write intent with explicit target"
        : "edit intent with explicit target",
      targetPath: primaryTarget.cleaned,
      inspectFirst: !hasCreateIntent,
      verifyAfterEdit: hasVerifyIntent,
      ...(effectiveVerifyCommand ? { verifyCommand: effectiveVerifyCommand } : {}),
      ...(effectiveReplaceDirective
        ? {
            replaceFrom: effectiveReplaceDirective.from,
            replaceTo: effectiveReplaceDirective.to,
          }
        : {}),
      usedRestoredState,
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
        (hasLocalExplainCue
          ? "explain"
          : effectiveGroundedDeliverableMode) ??
        (hasExplainIntent ? "explain" : "summary"),
      ...(hasLocalExplainCue
        ? {
            forceExplainFragmentAnchor: true,
            allowWholeFileExplainFallback: true,
          }
        : {}),
      ...(readLineCount !== undefined ? { readLineCount } : {}),
      ...(readLineOffset !== undefined ? { readLineOffset } : {}),
      ...(hasLocalExplainCue && readFragmentDirective.lineIndexes?.length
        ? { readFragmentLineIndexes: readFragmentDirective.lineIndexes }
        : {}),
      ...(hasLocalExplainCue && readFragmentDirective.ranges?.length
        ? { readFragmentRanges: readFragmentDirective.ranges }
        : {}),
      ...(hasLocalExplainCue && readFragmentDirective.sourceWindowStart !== undefined
        ? { readFragmentSourceWindowStart: readFragmentDirective.sourceWindowStart }
        : {}),
      ...(hasLocalExplainCue && readFragmentDirective.sourceWindowEnd !== undefined
        ? { readFragmentSourceWindowEnd: readFragmentDirective.sourceWindowEnd }
        : {}),
      ...(hasLocalExplainCue && readFragmentDirective.fingerprint
        ? { readFragmentFingerprint: readFragmentDirective.fingerprint }
        : {}),
      ...(hasLocalExplainCue && readFragmentDirective.structureSignature
        ? {
            readFragmentStructureSignature:
              readFragmentDirective.structureSignature,
          }
        : {}),
      ...(hasLocalExplainCue && readFragmentDirective.neighborhoodSignature
        ? {
            readFragmentNeighborhoodSignature:
              readFragmentDirective.neighborhoodSignature,
          }
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
    ...activationDecisionMetadata,
  };
}

function buildWorkflowTaskPlanFromForcedStep(input: {
  continuity: ContinuityStateLike;
  workspaceRoot: string;
}): WorkflowTaskPlan | undefined {
  const kind = input.continuity.forcedStepKind;
  if (!kind) {
    return undefined;
  }
  const resolveForcedTarget = (): string | undefined => {
    const candidate = input.continuity.forcedStepTargetPath?.trim();
    if (!candidate) {
      return undefined;
    }
    const resolution = resolveTaskTargets(candidate, input.workspaceRoot);
    if (resolution.primaryTarget?.inWorkspace) {
      return resolution.primaryTarget.cleaned;
    }
    const normalized = normalizePathLike(candidate);
    return normalized.length > 0 ? normalized : undefined;
  };
  const forcedTarget = resolveForcedTarget();
  if (kind === "run-command") {
    if (!input.continuity.forcedStepCommand?.trim()) {
      return {
        taskKind: "run-command",
        reason: "forced staged run-command step is missing command",
        inspectFirst: false,
        verifyAfterEdit: false,
        blockedReason:
          "Task not completed: staged run-command step is missing command.",
      };
    }
    return {
      taskKind: "run-command",
      reason: "forced staged run-command continuation",
      directCommand: input.continuity.forcedStepCommand.trim(),
      inspectFirst: false,
      verifyAfterEdit: false,
    };
  }
  if (kind === "edit-fix") {
    if (!forcedTarget || !input.continuity.forcedStepReplaceFrom || !input.continuity.forcedStepReplaceTo) {
      return {
        taskKind: "edit-file",
        reason: "forced staged edit-fix step missing target or transform",
        inspectFirst: false,
        verifyAfterEdit: true,
        targetPath: forcedTarget,
        blockedReason:
          "Task not completed: staged edit-fix step is missing target/transform evidence.",
      };
    }
    return {
      taskKind: "edit-file",
      reason: "forced staged edit-fix continuation",
      inspectFirst: false,
      verifyAfterEdit: true,
      targetPath: forcedTarget,
      replaceFrom: input.continuity.forcedStepReplaceFrom,
      replaceTo: input.continuity.forcedStepReplaceTo,
    };
  }
  if (kind === "read-continuation") {
    if (!forcedTarget) {
      return {
        taskKind: "read-file",
        reason: "forced staged read step missing target",
        inspectFirst: false,
        verifyAfterEdit: false,
        blockedReason:
          "Task not completed: staged read continuation lost target binding.",
      };
    }
    return {
      taskKind: "read-file",
      reason: "forced staged read continuation",
      targetPath: forcedTarget,
      groundedDeliverableMode: "read",
      readLineCount: Math.max(1, Math.min(input.continuity.forcedStepReadLineCount ?? 2, 40)),
      ...(input.continuity.lastReadWindowEnd !== undefined
        ? { readLineOffset: input.continuity.lastReadWindowEnd + 1 }
        : {}),
      ...(input.continuity.forcedStepReadFilter
        ? { readFilter: input.continuity.forcedStepReadFilter }
        : {}),
      inspectFirst: true,
      verifyAfterEdit: false,
    };
  }
  if (kind === "explain-continuation") {
    if (!forcedTarget) {
      return {
        taskKind: "repo-explain",
        reason: "forced staged explain step missing target",
        inspectFirst: false,
        verifyAfterEdit: false,
        blockedReason:
          "Task not completed: staged explain continuation lost target binding.",
      };
    }
    return {
      taskKind: "read-file",
      reason: "forced staged explain continuation",
      targetPath: forcedTarget,
      groundedDeliverableMode: "explain",
      forceExplainFragmentAnchor: true,
      allowWholeFileExplainFallback: true,
      inspectFirst: true,
      verifyAfterEdit: false,
      ...(input.continuity.lastReadFragmentLineIndexes?.length
        ? { readFragmentLineIndexes: input.continuity.lastReadFragmentLineIndexes }
        : {}),
      ...(input.continuity.lastReadFragmentRanges?.length
        ? { readFragmentRanges: input.continuity.lastReadFragmentRanges }
        : {}),
      ...(input.continuity.lastReadFragmentSourceWindowStart !== undefined
        ? { readFragmentSourceWindowStart: input.continuity.lastReadFragmentSourceWindowStart }
        : {}),
      ...(input.continuity.lastReadFragmentSourceWindowEnd !== undefined
        ? { readFragmentSourceWindowEnd: input.continuity.lastReadFragmentSourceWindowEnd }
        : {}),
      ...(input.continuity.lastReadFilter
        ? { readFilter: input.continuity.lastReadFilter }
        : {}),
      ...(input.continuity.lastReadFragmentFingerprint
        ? { readFragmentFingerprint: input.continuity.lastReadFragmentFingerprint }
        : {}),
      ...(input.continuity.lastReadFragmentStructureSignature
        ? {
            readFragmentStructureSignature:
              input.continuity.lastReadFragmentStructureSignature,
          }
        : {}),
      ...(input.continuity.lastReadFragmentNeighborhoodSignature
        ? {
            readFragmentNeighborhoodSignature:
              input.continuity.lastReadFragmentNeighborhoodSignature,
          }
        : {}),
      ...(input.continuity.lastReadWindowSize !== undefined
        ? { readLineCount: input.continuity.lastReadWindowSize }
        : {}),
      ...(input.continuity.lastReadWindowStart !== undefined
        ? { readLineOffset: input.continuity.lastReadWindowStart }
        : {}),
      repairInstruction: {
        operation: "switch",
        targetMode: "explain",
        reason: "forced staged explain continuation",
      },
    };
  }
  if (kind === "summary-continuation") {
    if (!forcedTarget) {
      return {
        taskKind: "read-file",
        reason: "forced staged summary step missing target",
        inspectFirst: false,
        verifyAfterEdit: false,
        blockedReason:
          "Task not completed: staged summary continuation lost target binding.",
      };
    }
    return {
      taskKind: "read-file",
      reason: "forced staged summary continuation",
      targetPath: forcedTarget,
      groundedDeliverableMode: "summary",
      inspectFirst: true,
      verifyAfterEdit: false,
    };
  }
  if (kind === "task-continuation") {
    if (!forcedTarget) {
      return {
        taskKind: "chat",
        reason: "forced staged task-continuation lacks resolvable target",
        inspectFirst: false,
        verifyAfterEdit: false,
        blockedReason:
          "Task not completed: staged task-continuation needs explicit target.",
      };
    }
    return {
      taskKind: "read-file",
      reason: "forced staged task continuation",
      targetPath: forcedTarget,
      groundedDeliverableMode: "read",
      inspectFirst: true,
      verifyAfterEdit: false,
    };
  }
  return undefined;
}

function extractInlineContinuityContext(prompt: string): {
  cleanPrompt: string;
  inlineState: ContinuityStateLike;
} {
  const continuityMatch = prompt.match(
    /\[FOLLOW-UP CONTINUITY CONTEXT\]([\s\S]*?)\[END CONTINUITY CONTEXT\]/i,
  );
  const stepMatch = prompt.match(
    /\[FOLLOW-UP STEP CONTEXT\]([\s\S]*?)\[END STEP CONTEXT\]/i,
  );
  if (!continuityMatch && !stepMatch) {
    return { cleanPrompt: prompt, inlineState: {} };
  }

  const block = continuityMatch?.[1] ?? "";
  const stepBlock = stepMatch?.[1] ?? "";
  const inlineState: ContinuityStateLike = {};
  const readStepField = (key: string): string | undefined => {
    const linePattern = new RegExp(
      `^\\s*${escapeRegExp(key)}\\s*:\\s*([^\\r\\n]+)\\s*$`,
      "im",
    );
    const lineMatch = stepBlock.match(linePattern);
    const lineValue = lineMatch?.[1]?.trim();
    if (lineValue && lineValue.length > 0) {
      return lineValue;
    }

    // Fallback for compacted single-line contexts where multiple step fields are
    // flattened into one line (e.g. prompt budget compaction / transport reshape).
    const compactPattern = new RegExp(
      `${escapeRegExp(key)}\\s*:\\s*([\\s\\S]*?)(?=\\s+[a-z][a-z-]*\\s*:|$)`,
      "i",
    );
    const compactMatch = stepBlock.match(compactPattern);
    const compactValue = compactMatch?.[1]?.trim();
    return compactValue && compactValue.length > 0 ? compactValue : undefined;
  };
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
  const deliverableModeMatch = block.match(/last-grounded-deliverable-mode:\s*(.+)/i);
  if (deliverableModeMatch?.[1]) {
    const mode = deliverableModeMatch[1].trim().toLowerCase();
    if (mode === "read" || mode === "summary" || mode === "explain") {
      inlineState.lastGroundedDeliverableMode = mode;
    }
  }
  const deliveredLinesMatch = block.match(/last-read-delivered-lines:\s*(\d+)/i);
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
  const readFragmentStartMatch = block.match(/last-read-fragment-start:\s*(\d+)/i);
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
    inlineState.lastReadFilter = readFilterMatch[1]
      .trim()
      .toLowerCase() as "none" | "function-definitions";
  }
  const readFragmentFingerprintMatch = block.match(
    /last-read-fragment-fingerprint:\s*([0-9a-f]{64})/i,
  );
  if (readFragmentFingerprintMatch?.[1]) {
    inlineState.lastReadFragmentFingerprint = readFragmentFingerprintMatch[1]
      .trim()
      .toLowerCase();
  }
  const readFragmentStructureSignatureMatch = block.match(
    /last-read-fragment-structure-signature:\s*([0-9a-f]{64})/i,
  );
  if (readFragmentStructureSignatureMatch?.[1]) {
    inlineState.lastReadFragmentStructureSignature =
      readFragmentStructureSignatureMatch[1].trim().toLowerCase();
  }
  const readFragmentNeighborhoodSignatureMatch = block.match(
    /last-read-fragment-neighborhood-signature:\s*([0-9a-f]{64})/i,
  );
  if (readFragmentNeighborhoodSignatureMatch?.[1]) {
    inlineState.lastReadFragmentNeighborhoodSignature =
      readFragmentNeighborhoodSignatureMatch[1].trim().toLowerCase();
  }
  const stagedStepCountMatch = block.match(/last-staged-repair-steps:\s*(\d+)/i);
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
  const stagedNextStepMatch = block.match(/last-staged-repair-next-step:\s*(\d+)/i);
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
  const ageTurnDistanceMatch = block.match(
    /freshness-age-turn-distance:\s*(\d+)/i,
  );
  if (ageTurnDistanceMatch?.[1]) {
    const parsed = Number.parseInt(ageTurnDistanceMatch[1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      inlineState.freshnessAgeTurnDistance = parsed;
    }
  }
  const ageNotConsumedMatch = block.match(
    /freshness-age-not-consumed-turns:\s*(\d+)/i,
  );
  if (ageNotConsumedMatch?.[1]) {
    const parsed = Number.parseInt(ageNotConsumedMatch[1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      inlineState.freshnessAgeNotConsumedTurns = parsed;
    }
  }
  const continuationFamilyMatch = block.match(/continuation-family:\s*(.+)/i);
  if (continuationFamilyMatch?.[1]) {
    const parsed = continuationFamilyMatch[1].trim();
    if (parsed.length > 0) {
      inlineState.continuationFamilyId = parsed;
    }
  }
  const continuationEpochMatch = block.match(/continuation-epoch:\s*(\d+)/i);
  if (continuationEpochMatch?.[1]) {
    const parsed = Number.parseInt(continuationEpochMatch[1], 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      inlineState.continuationEpoch = parsed;
    }
  }
  const continuationFamilyAnchorMatch = block.match(
    /continuation-family-anchor:\s*(.+)/i,
  );
  if (continuationFamilyAnchorMatch?.[1]) {
    const parsed = normalizePathLike(continuationFamilyAnchorMatch[1].trim());
    if (parsed.length > 0) {
      inlineState.continuationFamilyAnchor = parsed;
    }
  }

  const stepKindValue = readStepField("step-kind");
  if (stepKindValue) {
    const normalized = stepKindValue.toLowerCase();
    if (
      normalized === "run-command" ||
      normalized === "edit-fix" ||
      normalized === "read-continuation" ||
      normalized === "explain-continuation" ||
      normalized === "summary-continuation" ||
      normalized === "task-continuation"
    ) {
      inlineState.forcedStepKind =
        normalized as ContinuityStateLike["forcedStepKind"];
    }
  }
  const stepTargetValue = readStepField("step-target");
  if (stepTargetValue) {
    const parsed = normalizePathLike(stepTargetValue);
    if (parsed.length > 0) {
      inlineState.forcedStepTargetPath = parsed;
    }
  }
  const stepCommandValue = readStepField("step-command");
  if (stepCommandValue) {
    const command = stepCommandValue.trim();
    if (command.length > 0) {
      inlineState.forcedStepCommand = command;
    }
  }
  const stepReplaceFromValue = readStepField("step-replace-from");
  if (stepReplaceFromValue) {
    const value = stepReplaceFromValue.trim();
    if (value.length > 0) {
      inlineState.forcedStepReplaceFrom = value;
    }
  }
  const stepReplaceToValue = readStepField("step-replace-to");
  if (stepReplaceToValue) {
    const value = stepReplaceToValue.trim();
    if (value.length > 0) {
      inlineState.forcedStepReplaceTo = value;
    }
  }
  const stepReadLineCountValue = readStepField("step-read-line-count");
  if (stepReadLineCountValue) {
    const parsed = Number.parseInt(stepReadLineCountValue, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      inlineState.forcedStepReadLineCount = parsed;
    }
  }
  const stepReadFilterValue = readStepField("step-read-filter");
  if (stepReadFilterValue) {
    const normalized = stepReadFilterValue.toLowerCase();
    if (normalized === "none" || normalized === "function-definitions") {
      inlineState.forcedStepReadFilter = normalized as
        | "none"
        | "function-definitions";
    }
  }
  // Step-context fragment fields are intentionally ignored here.
  // Explain/read fragment evidence must come from structured continuity state,
  // not prompt-inline step text, to keep provenance closed across transports.
  const stepContinuationPromptValue = readStepField("step-continuation-prompt");
  if (stepContinuationPromptValue) {
    const value = stepContinuationPromptValue.trim();
    if (value.length > 0) {
      inlineState.forcedStepContinuationPrompt = value;
    }
  }
  const stepConfidenceValue = readStepField("step-confidence");
  if (stepConfidenceValue) {
    const normalized = stepConfidenceValue.toLowerCase();
    if (normalized === "high" || normalized === "medium" || normalized === "low") {
      inlineState.forcedStepConfidence = normalized as "high" | "medium" | "low";
    }
  }

  return {
    cleanPrompt: prompt
      .replace(continuityMatch?.[0] ?? "", "")
      .replace(stepMatch?.[0] ?? "", "")
      .trim(),
    inlineState,
  };
}

function mergeContinuationState(
  structuredState: unknown,
  inlineState: ContinuityStateLike,
): ContinuityStateLike {
  const structured = continuityStateAsObject(structuredState);
  return {
    lastTaskKind: structured.lastTaskKind ?? inlineState.lastTaskKind,
    lastUserIntent: structured.lastUserIntent ?? inlineState.lastUserIntent,
    lastAssistantOutput:
      structured.lastAssistantOutput ?? inlineState.lastAssistantOutput,
    recentTargetFiles:
      structured.recentTargetFiles?.length
        ? structured.recentTargetFiles
        : inlineState.recentTargetFiles,
    recentChangedFiles:
      structured.recentChangedFiles?.length
        ? structured.recentChangedFiles
        : inlineState.recentChangedFiles,
    recentFailedFiles:
      structured.recentFailedFiles?.length
        ? structured.recentFailedFiles
        : inlineState.recentFailedFiles,
    recentVerifiedFiles:
      structured.recentVerifiedFiles?.length
        ? structured.recentVerifiedFiles
        : inlineState.recentVerifiedFiles,
    lastVerificationStatus:
      structured.lastVerificationStatus ?? inlineState.lastVerificationStatus,
    lastTerminalClassification:
      structured.lastTerminalClassification ??
      inlineState.lastTerminalClassification,
    lastTerminalReason:
      structured.lastTerminalReason ??
      inlineState.lastTerminalReason,
    lastContinuationEvidence:
      structured.lastContinuationEvidence?.length
        ? structured.lastContinuationEvidence
        : inlineState.lastContinuationEvidence,
    lastGroundedDeliverableMode:
      structured.lastGroundedDeliverableMode ??
      inlineState.lastGroundedDeliverableMode,
    lastReadDeliveredLines:
      inlineState.lastReadDeliveredLines ??
      structured.lastReadDeliveredLines,
    lastReadWindowStart:
      inlineState.lastReadWindowStart ??
      structured.lastReadWindowStart,
    lastReadWindowEnd:
      inlineState.lastReadWindowEnd ??
      structured.lastReadWindowEnd,
    lastReadWindowSize:
      inlineState.lastReadWindowSize ??
      structured.lastReadWindowSize,
    lastReadFragmentStart:
      inlineState.lastReadFragmentStart ??
      structured.lastReadFragmentStart,
    lastReadFragmentEnd:
      inlineState.lastReadFragmentEnd ??
      structured.lastReadFragmentEnd,
    lastReadFragmentLineIndexes:
      inlineState.lastReadFragmentLineIndexes?.length
        ? inlineState.lastReadFragmentLineIndexes
        : structured.lastReadFragmentLineIndexes,
    lastReadFragmentRanges:
      inlineState.lastReadFragmentRanges?.length
        ? inlineState.lastReadFragmentRanges
        : structured.lastReadFragmentRanges,
    lastReadFragmentSourceWindowStart:
      inlineState.lastReadFragmentSourceWindowStart ??
      structured.lastReadFragmentSourceWindowStart,
    lastReadFragmentSourceWindowEnd:
      inlineState.lastReadFragmentSourceWindowEnd ??
      structured.lastReadFragmentSourceWindowEnd,
    lastReadFilter:
      inlineState.lastReadFilter ??
      structured.lastReadFilter,
    lastReadFragmentFingerprint:
      inlineState.lastReadFragmentFingerprint ??
      structured.lastReadFragmentFingerprint,
    lastReadFragmentStructureSignature:
      inlineState.lastReadFragmentStructureSignature ??
      structured.lastReadFragmentStructureSignature,
    lastReadFragmentNeighborhoodSignature:
      inlineState.lastReadFragmentNeighborhoodSignature ??
      structured.lastReadFragmentNeighborhoodSignature,
    lastStagedRepairStepCount:
      structured.lastStagedRepairStepCount ??
      inlineState.lastStagedRepairStepCount,
    lastStagedRepairCompletedStep:
      structured.lastStagedRepairCompletedStep ??
      inlineState.lastStagedRepairCompletedStep,
    lastStagedRepairBlockedStep:
      structured.lastStagedRepairBlockedStep ??
      inlineState.lastStagedRepairBlockedStep,
    lastStagedRepairNextStep:
      structured.lastStagedRepairNextStep ??
      inlineState.lastStagedRepairNextStep,
    lastAnswerDefect:
      structured.lastAnswerDefect ??
      inlineState.lastAnswerDefect,
    unresolvedItems:
      structured.unresolvedItems?.length
        ? structured.unresolvedItems
        : inlineState.unresolvedItems,
    freshnessHistoryCount:
      structured.freshnessHistoryCount ?? inlineState.freshnessHistoryCount,
    freshnessAgeTurnDistance:
      structured.freshnessAgeTurnDistance ??
      inlineState.freshnessAgeTurnDistance,
    freshnessAgeNotConsumedTurns:
      structured.freshnessAgeNotConsumedTurns ??
      inlineState.freshnessAgeNotConsumedTurns,
    continuationFamilyId:
      structured.continuationFamilyId ?? inlineState.continuationFamilyId,
    continuationEpoch:
      structured.continuationEpoch ?? inlineState.continuationEpoch,
    continuationFamilyAnchor:
      structured.continuationFamilyAnchor ?? inlineState.continuationFamilyAnchor,
    forcedStepKind:
      inlineState.forcedStepKind ?? structured.forcedStepKind,
    forcedStepTargetPath:
      inlineState.forcedStepTargetPath ?? structured.forcedStepTargetPath,
    forcedStepCommand:
      inlineState.forcedStepCommand ?? structured.forcedStepCommand,
    forcedStepReplaceFrom:
      inlineState.forcedStepReplaceFrom ?? structured.forcedStepReplaceFrom,
    forcedStepReplaceTo:
      inlineState.forcedStepReplaceTo ?? structured.forcedStepReplaceTo,
    forcedStepReadLineCount:
      inlineState.forcedStepReadLineCount ?? structured.forcedStepReadLineCount,
    forcedStepReadFilter:
      inlineState.forcedStepReadFilter ?? structured.forcedStepReadFilter,
    forcedStepContinuationPrompt:
      inlineState.forcedStepContinuationPrompt ??
      structured.forcedStepContinuationPrompt,
    forcedStepConfidence:
      inlineState.forcedStepConfidence ?? structured.forcedStepConfidence,
  };
}

function continuityStateAsObject(value: unknown): ContinuityStateLike {
  if (!value || typeof value !== "object") {
    return {};
  }
  return value as ContinuityStateLike;
}

function sanitizeContinuationAnchor(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.replace(/\u0000/g, "").trim().slice(0, 1024);
}

function applyAgeAwareEvidenceConsumption(input: {
  continuity: ContinuityStateLike;
  prompt: string;
  hasExplicitPathOverride: boolean;
  hasExplicitTransformOverride: boolean;
  hasContinuationFamilyCue: boolean;
  explicitTargetPath?: string;
  hasSemanticSameFileNewIntent?: boolean;
  intentFamily: "read" | "diagnosis" | "edit" | "execute" | "chat";
  transformSignature?: string;
}): { continuity: ContinuityStateLike; decision: ContinuityConsumptionDecision } {
  const existingFamilyId =
    input.continuity.continuationFamilyId?.trim() || "default-family";
  const existingEpoch = Number.isFinite(input.continuity.continuationEpoch)
    ? Math.max(0, Math.trunc(input.continuity.continuationEpoch ?? 0))
    : 0;
  const continuationAnchor = normalizePathLike(
    sanitizeContinuationAnchor(input.continuity.continuationFamilyAnchor) ||
      input.continuity.recentTargetFiles?.[0] ||
      "",
  );
  const explicitTargetPath = normalizePathLike(input.explicitTargetPath ?? "");
  const hasPathHardOverride =
    input.hasExplicitPathOverride &&
    explicitTargetPath.length > 0 &&
    (continuationAnchor.length === 0 ||
      explicitTargetPath !== continuationAnchor);
  const hasExplicitOverride =
    input.hasExplicitTransformOverride || hasPathHardOverride;
  const hasFamilyAnchorMismatch =
    input.hasContinuationFamilyCue &&
    explicitTargetPath.length > 0 &&
    continuationAnchor.length > 0 &&
    explicitTargetPath !== continuationAnchor;
  const priorLineage = extractLineageSlotsFromEvidence(
    input.continuity.lastContinuationEvidence,
  );
  const lineageTarget =
    explicitTargetPath.length > 0 ? explicitTargetPath : continuationAnchor;
  const currentLineage = lineageTarget
    ? encodeLineageSlot({
        target: lineageTarget,
        family: input.intentFamily,
        transform: input.transformSignature && input.transformSignature.length > 0
          ? input.transformSignature
          : "*",
      })
    : undefined;
  const currentLineageTransform = currentLineage
    ? (decodeLineageSlot(currentLineage)?.transform ?? "*")
    : "*";
  const mergedLineageSlots = currentLineage
    ? Array.from(new Set([currentLineage, ...priorLineage.slots])).slice(0, 4)
    : priorLineage.slots.slice(0, 4);
  const preservedResumeProvenance = Array.from(
    new Set(
      (input.continuity.lastContinuationEvidence ?? []).filter((entry) =>
        /^session-resume-(?:source|requested|resolved|rebind-from-missing):/i.test(
          entry,
        ),
      ),
    ),
  );
  const lineageEvidence = [
    ...(currentLineage
      ? [`continuation-lineage-active:${currentLineage}`]
      : []),
    ...mergedLineageSlots.map((slot) => `continuation-lineage-slot:${slot}`),
    ...preservedResumeProvenance,
  ];
  const hasLineageMatch =
    Boolean(currentLineage) &&
    priorLineage.slots.some((slot) =>
      lineageSlotMatches(
        slot,
        lineageTarget,
        input.intentFamily,
        currentLineageTransform,
      ),
    );

  if (hasExplicitOverride) {
    const nextEpoch = existingEpoch + 1;
    const nextAnchor =
      explicitTargetPath.length > 0
        ? explicitTargetPath
        : continuationAnchor;
    return {
      continuity: {
        ...input.continuity,
        recentTargetFiles: [],
        recentFailedFiles: [],
        lastContinuationEvidence: lineageEvidence,
        continuationFamilyId: existingFamilyId,
        continuationEpoch: nextEpoch,
        continuationFamilyAnchor:
          nextAnchor.length > 0 ? nextAnchor : input.continuity.continuationFamilyAnchor,
      },
      decision: {
        familyId: existingFamilyId,
        epoch: nextEpoch,
        boundary: "explicit-override",
        activeFamily: false,
        agedOut: false,
        explicitOverride: true,
        familyMismatchPruned: false,
        epochBumped: true,
        lineageAction: currentLineage ? "cut" : undefined,
        lineageActive: currentLineage,
        lineageSlots: mergedLineageSlots,
      },
    };
  }

  if (input.hasSemanticSameFileNewIntent) {
    const nextEpoch = existingEpoch + 1;
    const nextAnchor =
      explicitTargetPath.length > 0
        ? explicitTargetPath
        : continuationAnchor;
    return {
      continuity: {
        ...input.continuity,
        recentTargetFiles:
          lineageTarget.length > 0
            ? [lineageTarget]
            : (input.continuity.recentTargetFiles ?? []),
        recentFailedFiles: [],
        lastContinuationEvidence: lineageEvidence,
        continuationFamilyId: existingFamilyId,
        continuationEpoch: nextEpoch,
        continuationFamilyAnchor:
          nextAnchor.length > 0
            ? nextAnchor
            : input.continuity.continuationFamilyAnchor,
      },
      decision: {
        familyId: existingFamilyId,
        epoch: nextEpoch,
        boundary: "same-file-new-intent",
        activeFamily: false,
        agedOut: false,
        explicitOverride: false,
        familyMismatchPruned: false,
        epochBumped: true,
        lineageAction: "cut",
        lineageActive: currentLineage,
        lineageSlots: mergedLineageSlots,
      },
    };
  }

  if (hasFamilyAnchorMismatch) {
    return {
      continuity: {
        ...input.continuity,
        recentTargetFiles: [],
        recentFailedFiles: [],
        lastContinuationEvidence: [],
        continuationFamilyId: existingFamilyId,
        continuationEpoch: existingEpoch,
        continuationFamilyAnchor:
          explicitTargetPath.length > 0
            ? explicitTargetPath
            : continuationAnchor,
      },
      decision: {
        familyId: existingFamilyId,
        epoch: existingEpoch,
        boundary: "family-mismatch-pruned",
        activeFamily: false,
        agedOut: false,
        explicitOverride: false,
        familyMismatchPruned: true,
        epochBumped: false,
        lineageAction: "mismatch-pruned",
        lineageActive: currentLineage ?? priorLineage.active,
        lineageSlots: priorLineage.slots.slice(0, 4),
      },
    };
  }

  const ageTurnDistance = input.continuity.freshnessAgeTurnDistance ?? 0;
  const ageNotConsumedTurns =
    input.continuity.freshnessAgeNotConsumedTurns ?? ageTurnDistance;
  const AGE_OUT_TURN_DISTANCE_THRESHOLD = 4;
  const AGE_OUT_NOT_CONSUMED_THRESHOLD = 3;
  const continuationEvidence = input.continuity.lastContinuationEvidence ?? [];
  const hasOpenRepairChain = continuationEvidence.some((entry) => {
    const lowered = entry.toLowerCase();
    if (lowered.startsWith("repair-remaining-files:")) {
      return !lowered.includes("(none)");
    }
    if (lowered.startsWith("repair-failed-files:")) {
      return !lowered.includes("(none)");
    }
    return (
      lowered.startsWith("repair-outcome:partial-complete-with-remaining") ||
      lowered.startsWith("repair-outcome:partial-complete-with-failures") ||
      lowered.startsWith("repair-outcome:blocked-disambiguation")
    );
  });
  const isAgedOut =
    ageTurnDistance >= AGE_OUT_TURN_DISTANCE_THRESHOLD &&
    ageNotConsumedTurns >= AGE_OUT_NOT_CONSUMED_THRESHOLD;
  const isActiveFamily =
    input.hasContinuationFamilyCue &&
    (hasOpenRepairChain ||
      (input.continuity.recentFailedFiles?.length ?? 0) > 0);
  if (!isAgedOut || isActiveFamily) {
    return {
      continuity: {
        ...input.continuity,
        continuationFamilyId: existingFamilyId,
        continuationEpoch: existingEpoch,
        continuationFamilyAnchor:
          continuationAnchor.length > 0
            ? continuationAnchor
            : input.continuity.continuationFamilyAnchor,
      },
      decision: {
        familyId: existingFamilyId,
        epoch: existingEpoch,
        boundary: isActiveFamily ? "active-family-retained" : "retained",
        activeFamily: isActiveFamily,
        agedOut: isAgedOut,
        explicitOverride: false,
        familyMismatchPruned: false,
        epochBumped: false,
        lineageAction: hasLineageMatch ? "match" : undefined,
        lineageActive: currentLineage ?? priorLineage.active,
        lineageSlots: currentLineage
          ? Array.from(new Set([currentLineage, ...priorLineage.slots])).slice(0, 4)
          : priorLineage.slots.slice(0, 4),
      },
    };
  }

  return {
    continuity: {
      ...input.continuity,
      recentTargetFiles: [],
      recentFailedFiles: [],
      lastContinuationEvidence: [],
      continuationFamilyId: existingFamilyId,
      continuationEpoch: existingEpoch,
      continuationFamilyAnchor:
        continuationAnchor.length > 0
          ? continuationAnchor
          : input.continuity.continuationFamilyAnchor,
    },
    decision: {
      familyId: existingFamilyId,
      epoch: existingEpoch,
      boundary: "aged-out-pruned",
      activeFamily: false,
      agedOut: true,
      explicitOverride: false,
      familyMismatchPruned: false,
      epochBumped: false,
      lineageAction: "mismatch-pruned",
      lineageActive: undefined,
      lineageSlots: [],
    },
  };
}

function buildFreshnessObservability(input: {
  prompt: string;
  continuity: ContinuityStateLike;
  plan: WorkflowTaskPlan;
  consumptionDecision?: ContinuityConsumptionDecision;
}): FreshnessObservability {
  const hasPathOverride = hasPathLikeReference(input.prompt);
  const hasTransformOverride = Boolean(extractReplaceDirective(input.prompt));
  const hasExplicitOverride = hasPathOverride || hasTransformOverride;
  const retained: string[] = [];
  const pruned: string[] = [];
  const boundary: string[] = [];
  const historyEvidence = input.continuity.lastContinuationEvidence ?? [];
  const ageTurnDistance =
    input.continuity.freshnessAgeTurnDistance ??
    input.continuity.freshnessAgeNotConsumedTurns ??
    0;
  const ageNotConsumedTurns =
    input.continuity.freshnessAgeNotConsumedTurns ?? ageTurnDistance;
  const continuationFamilyId = input.continuity.continuationFamilyId?.trim();
  const continuationEpoch = Number.isFinite(input.continuity.continuationEpoch)
    ? Math.max(0, Math.trunc(input.continuity.continuationEpoch ?? 0))
    : 0;
  const continuationFamilyAnchor = normalizePathLike(
    input.continuity.continuationFamilyAnchor ??
      input.continuity.recentTargetFiles?.[0] ??
      "",
  );
  const effectiveFamilyId =
    input.consumptionDecision?.familyId ?? continuationFamilyId;
  const effectiveEpoch = input.consumptionDecision?.epoch ?? continuationEpoch;
  const hasEffectiveExplicitOverride =
    input.consumptionDecision?.explicitOverride ?? hasExplicitOverride;
  const AGE_OUT_TURN_DISTANCE_THRESHOLD = 4;
  const AGE_OUT_NOT_CONSUMED_THRESHOLD = 3;
  const isAgedOut =
    ageTurnDistance >= AGE_OUT_TURN_DISTANCE_THRESHOLD &&
    ageNotConsumedTurns >= AGE_OUT_NOT_CONSUMED_THRESHOLD;
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
    hasEffectiveExplicitOverride
  ) {
    boundary.push("freshness-reset:explicit-override");
    if (hasPathOverride) {
      pruned.push("freshness-pruned:override-path-superseded-history");
    }
    if (hasTransformOverride) {
      pruned.push("freshness-pruned:override-transform-superseded-history");
    }
  }

  if (input.plan.usedRestoredState && hasContinuationHistory) {
    boundary.push("freshness-precedence:active-family-retained");
    retained.push(
      `freshness-retained-active-family:turn-distance=${Math.max(ageTurnDistance, 0)}`,
    );
    retained.push(
      `freshness-retained-active-family:not-consumed-turns=${Math.max(
        ageNotConsumedTurns,
        0,
      )}`,
    );
  }

  if (
    hasContinuationHistory &&
    !input.plan.usedRestoredState &&
    !hasPathOverride &&
    !hasTransformOverride &&
    isAgedOut
  ) {
    boundary.push("freshness-precedence:aged-out-pruned");
    boundary.push("freshness-aged-out:continuation-history");
    boundary.push(`freshness-age-turn-distance:${ageTurnDistance}`);
    pruned.push(`freshness-age-not-consumed:${ageNotConsumedTurns}`);
    pruned.push("freshness-pruned:aged-out-history-not-consumed");
  }

  if (
    hasContinuationHistory &&
    !input.plan.usedRestoredState &&
    hasEffectiveExplicitOverride
  ) {
    boundary.push("freshness-precedence:explicit-override");
  }
  if (effectiveFamilyId) {
    boundary.push(`continuation-family:${effectiveFamilyId}`);
    boundary.push(`continuation-epoch:${effectiveEpoch}`);
    if (continuationFamilyAnchor.length > 0) {
      boundary.push(`continuation-family-anchor:${continuationFamilyAnchor}`);
    }
  }
  if (!input.plan.usedRestoredState && hasContinuationHistory) {
    boundary.push("continuation-family-reset:new-task");
  }
  if (input.consumptionDecision?.boundary === "same-file-new-intent") {
    boundary.push("freshness-precedence:same-file-new-intent");
    boundary.push("continuation-family-reset:new-same-file-task");
    boundary.push("continuation-epoch-bump:new-intent");
    pruned.push("freshness-pruned:same-file-new-intent-superseded-history");
  }
  if (
    hasEffectiveExplicitOverride &&
    effectiveFamilyId &&
    (input.consumptionDecision?.epochBumped ?? true)
  ) {
    boundary.push("continuation-epoch-bump:explicit-override");
  }
  if (
    hasPathOverride &&
    continuationFamilyAnchor.length > 0 &&
    input.plan.targetPath &&
    normalizePathLike(input.plan.targetPath) !== continuationFamilyAnchor
  ) {
    boundary.push("continuation-family-mismatch-pruned");
  }
  if (
    input.plan.usedRestoredState &&
    effectiveFamilyId &&
    (input.consumptionDecision?.activeFamily ?? true)
  ) {
    boundary.push("continuation-family-consumption:active");
  }
  if (input.consumptionDecision?.familyMismatchPruned) {
    boundary.push("continuation-family-mismatch-pruned");
  }
  if (input.consumptionDecision?.lineageAction === "match") {
    boundary.push("continuation-lineage-match:same-file-subtask");
  }
  if (input.consumptionDecision?.lineageAction === "cut") {
    boundary.push("continuation-lineage-cut:new-same-file-subtask");
  }
  if (input.consumptionDecision?.lineageAction === "mismatch-pruned") {
    boundary.push("continuation-lineage-mismatch-pruned");
  }
  if (input.consumptionDecision?.lineageActive) {
    boundary.push(
      `continuation-lineage-active:${input.consumptionDecision.lineageActive}`,
    );
  }
  for (const slot of input.consumptionDecision?.lineageSlots ?? []) {
    boundary.push(`continuation-lineage-slot:${slot}`);
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

function deriveContinuationTargetPath(input: {
  continuity: ContinuityStateLike;
  intentFamily?: "read" | "diagnosis" | "edit" | "execute" | "chat";
  transformSignature?: string;
}): string | undefined {
  const continuity = input.continuity;
  const lineage = extractLineageSlotsFromEvidence(continuity.lastContinuationEvidence);
  const desiredFamily = input.intentFamily;
  const desiredTransform =
    input.transformSignature && input.transformSignature.length > 0
      ? input.transformSignature
      : "*";
  const lineageCandidates = [
    ...(lineage.active ? [lineage.active] : []),
    ...lineage.slots,
  ];
  const seenLineageTargets = new Set<string>();
  for (const encoded of lineageCandidates) {
    const decoded = decodeLineageSlot(encoded);
    if (!decoded) {
      continue;
    }
    if (desiredFamily && decoded.family !== desiredFamily) {
      continue;
    }
    if (!lineageSlotMatches(encoded, decoded.target, decoded.family, desiredTransform)) {
      continue;
    }
    const candidate = normalizePathLike(decoded.target ?? "");
    if (!isUsableContinuationTargetPath(candidate) || seenLineageTargets.has(candidate)) {
      continue;
    }
    seenLineageTargets.add(candidate);
    return candidate;
  }
  const readLikeTask =
    continuity.lastTaskKind === "read-file" ||
    continuity.lastTaskKind === "repo-explain" ||
    continuity.lastTaskKind === "inspect-files";
  const preferredOrder = readLikeTask
    ? [
        ...(continuity.recentTargetFiles ?? []),
        ...((continuity.recentFailedFiles ?? []).map((entry) => entry.path)),
        ...(continuity.recentChangedFiles ?? []),
        ...(continuity.recentVerifiedFiles ?? []),
      ]
    : [
        ...(continuity.recentTargetFiles ?? []),
        ...(continuity.recentChangedFiles ?? []),
        ...((continuity.recentFailedFiles ?? []).map((entry) => entry.path)),
        ...(continuity.recentVerifiedFiles ?? []),
      ];

  for (const rawCandidate of preferredOrder) {
    const candidate = normalizePathLike(rawCandidate ?? "");
    if (!isUsableContinuationTargetPath(candidate)) {
      continue;
    }
    return candidate;
  }
  return undefined;
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

function resolveMigrationAwareContinuationTargetPath(input: {
  candidatePath?: string;
  workspaceRoot: string;
  continuity: ContinuityStateLike;
  prompt: string;
  enabled: boolean;
}): ContinuationTargetRelocationDecision {
  const candidatePath = normalizePathLike(input.candidatePath ?? "");
  if (!input.enabled || !isUsableContinuationTargetPath(candidatePath)) {
    return { targetPath: candidatePath || undefined };
  }
  const targetAbsolute = path.resolve(input.workspaceRoot, candidatePath);
  if (fs.existsSync(targetAbsolute)) {
    try {
      if (!fs.statSync(targetAbsolute).isDirectory()) {
        return { targetPath: candidatePath };
      }
    } catch {
      // Fall through to relocation scan when stat is transiently unavailable.
    }
  }

  const search = findRelocatedContinuationTargetCandidates({
    workspaceRoot: input.workspaceRoot,
    missingTargetPath: candidatePath,
    continuity: input.continuity,
    prompt: input.prompt,
  });
  if (search.selectedTarget) {
    return {
      targetPath: search.selectedTarget,
      recoveredFromPath: candidatePath,
      recoveryReason: search.reason,
      candidateSummary: search.candidates,
    };
  }

  const candidateSummary = search.candidates.slice(0, 10);
  if (candidateSummary.length > 1) {
    return {
      blockedReason: `Inherited target ${candidatePath} no longer exists under current project root, and relocation is ambiguous across candidates: ${candidateSummary.join(", ")}. Provide explicit file path to continue safely.`,
      candidateSummary,
    };
  }

  if (candidateSummary.length === 1) {
    return {
      blockedReason: `Inherited target ${candidatePath} no longer exists under current project root, and relocation confidence is insufficient for candidate ${candidateSummary[0]}. Provide explicit file path to continue safely.`,
      candidateSummary,
    };
  }

  return {
    blockedReason: `Inherited target ${candidatePath} no longer exists under current project root and no high-confidence relocation candidate was found. Re-read or specify the file path explicitly.`,
  };
}

function findRelocatedContinuationTargetCandidates(input: {
  workspaceRoot: string;
  missingTargetPath: string;
  continuity: ContinuityStateLike;
  prompt: string;
}): {
  selectedTarget?: string;
  candidates: string[];
  reason?: string;
} {
  const basename = path.posix.basename(normalizePathLike(input.missingTargetPath));
  if (!basename) {
    return { candidates: [] };
  }
  let candidates = collectWorkspaceCandidatesByBasename({
    workspaceRoot: input.workspaceRoot,
    basename,
    limit: 64,
  });
  const extension = path.posix.extname(normalizePathLike(input.missingTargetPath));
  const hasTransformRelocationEvidence = hasTransformRelocationSignal({
    continuity: input.continuity,
    missingTargetPath: input.missingTargetPath,
  });
  if (
    candidates.length === 0 &&
    extension &&
    (input.continuity.lastReadFragmentFingerprint || hasTransformRelocationEvidence)
  ) {
    const extensionCandidates = collectWorkspaceCandidatesByExtension({
      workspaceRoot: input.workspaceRoot,
      extension,
      limit: 96,
    });
    const extensionScored = extensionCandidates
      .map((candidate) =>
        scoreRelocatedContinuationCandidate({
          candidate,
          missingTargetPath: input.missingTargetPath,
          workspaceRoot: input.workspaceRoot,
          continuity: input.continuity,
          prompt: input.prompt,
        }),
      )
      .filter((entry) => entry.fingerprintMatched)
      .sort((a, b) => b.score - a.score);
    if (extensionScored.length === 1) {
      return {
        selectedTarget: extensionScored[0].candidate,
        candidates: extensionCandidates,
        reason: "high-confidence relocation by fragment fingerprint on renamed target",
      };
    }
    candidates = extensionCandidates;
  }
  if (candidates.length === 0) {
    return { candidates: [] };
  }

  const scored = candidates
    .map((candidate) =>
      scoreRelocatedContinuationCandidate({
        candidate,
        missingTargetPath: input.missingTargetPath,
        workspaceRoot: input.workspaceRoot,
        continuity: input.continuity,
        prompt: input.prompt,
      }),
    )
    .sort((a, b) => b.score - a.score);
  const top = scored[0];
  const second = scored[1];
  if (!top) {
    return { candidates };
  }
  const topConfident =
    top.score >= 6 || (top.fingerprintMatched && top.score >= 5);
  const sufficientlySeparated =
    !second || top.score - second.score >= (top.fingerprintMatched ? 2 : 3);
  if (topConfident && sufficientlySeparated) {
    return {
      selectedTarget: top.candidate,
      candidates,
      reason:
        top.reasons.length > 0
          ? `high-confidence relocation (${top.reasons.join("+")})`
          : "high-confidence relocation",
    };
  }
  return { candidates };
}

function collectWorkspaceCandidatesByExtension(input: {
  workspaceRoot: string;
  extension: string;
  limit: number;
}): string[] {
  const normalizedExtension = input.extension.toLowerCase();
  if (!normalizedExtension) {
    return [];
  }
  const results: string[] = [];
  const stack: string[] = [path.resolve(input.workspaceRoot)];
  const skipDirectories = new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    ".turbo",
  ]);
  while (stack.length > 0 && results.length < input.limit) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (results.length >= input.limit) {
        break;
      }
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirectories.has(entry.name.toLowerCase())) {
          stack.push(fullPath);
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (path.posix.extname(entry.name).toLowerCase() !== normalizedExtension) {
        continue;
      }
      const relative = path.relative(input.workspaceRoot, fullPath);
      if (!relative || relative.startsWith("..")) {
        continue;
      }
      results.push(normalizePathLike(relative));
    }
  }
  return Array.from(new Set(results));
}

function collectWorkspaceCandidatesByBasename(input: {
  workspaceRoot: string;
  basename: string;
  limit: number;
}): string[] {
  const results: string[] = [];
  const stack: string[] = [path.resolve(input.workspaceRoot)];
  const normalizedTarget = input.basename.toLowerCase();
  const skipDirectories = new Set([
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    ".turbo",
  ]);
  while (stack.length > 0 && results.length < input.limit) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (results.length >= input.limit) {
        break;
      }
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!skipDirectories.has(entry.name.toLowerCase())) {
          stack.push(fullPath);
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      if (entry.name.toLowerCase() !== normalizedTarget) {
        continue;
      }
      const relative = path.relative(input.workspaceRoot, fullPath);
      if (!relative || relative.startsWith("..")) {
        continue;
      }
      results.push(normalizePathLike(relative));
    }
  }
  return results;
}

function scoreRelocatedContinuationCandidate(input: {
  candidate: string;
  missingTargetPath: string;
  workspaceRoot: string;
  continuity: ContinuityStateLike;
  prompt: string;
}): { candidate: string; score: number; reasons: string[]; fingerprintMatched: boolean } {
  const reasons: string[] = [];
  const candidate = normalizePathLike(input.candidate);
  const missing = normalizePathLike(input.missingTargetPath);
  let score = 0;
  const missingBase = path.posix.basename(missing).toLowerCase();
  const candidateBase = path.posix.basename(candidate).toLowerCase();
  if (missingBase === candidateBase) {
    score += 2;
    reasons.push("same-basename");
  }
  const missingExt = path.posix.extname(missing).toLowerCase();
  const candidateExt = path.posix.extname(candidate).toLowerCase();
  if (missingExt && missingExt === candidateExt) {
    score += 2;
    reasons.push("same-extension");
  }
  const suffixOverlap = countPathSuffixOverlap(missing, candidate);
  if (suffixOverlap > 0) {
    score += Math.min(6, suffixOverlap * 2);
    reasons.push(`suffix-overlap:${suffixOverlap}`);
  }
  const promptLexical = input.prompt.toLowerCase();
  const candidateParts = candidate.split("/");
  if (
    candidateParts.some(
      (part) => part.length >= 3 && promptLexical.includes(part.toLowerCase()),
    )
  ) {
    score += 2;
    reasons.push("prompt-lexical-match");
  }
  const continuityAnchor = normalizePathLike(
    input.continuity.continuationFamilyAnchor ?? "",
  );
  if (continuityAnchor && continuityAnchor === candidate) {
    score += 6;
    reasons.push("continuity-anchor-match");
  }
  const latestKnownTarget = normalizePathLike(
    input.continuity.recentTargetFiles?.[0] ?? "",
  );
  if (latestKnownTarget && latestKnownTarget === candidate) {
    score += 4;
    reasons.push("recent-target-match");
  }
  let fingerprintMatched = false;
  const fingerprintSignal = evaluateRelocationFingerprintSignal({
    workspaceRoot: input.workspaceRoot,
    candidatePath: candidate,
    continuity: input.continuity,
  });
  if (fingerprintSignal === "matched") {
    score += 10;
    reasons.push("fragment-fingerprint-match");
    fingerprintMatched = true;
  } else if (fingerprintSignal === "conflict") {
    score -= 6;
    reasons.push("fragment-fingerprint-conflict");
  }
  const snippetSignal = evaluateRelocationSnippetSignal({
    workspaceRoot: input.workspaceRoot,
    candidatePath: candidate,
    continuity: input.continuity,
  });
  if (snippetSignal === "matched") {
    score += 6;
    reasons.push("assistant-snippet-match");
  }
  const transformSignal = evaluateRelocationTransformSignal({
    workspaceRoot: input.workspaceRoot,
    candidatePath: candidate,
    continuity: input.continuity,
    missingTargetPath: input.missingTargetPath,
  });
  if (transformSignal === "matched") {
    score += 5;
    reasons.push("transform-evidence-match");
  } else if (transformSignal === "conflict") {
    score -= 2;
    reasons.push("transform-evidence-conflict");
  }
  return { candidate, score, reasons, fingerprintMatched };
}

function countPathSuffixOverlap(left: string, right: string): number {
  const leftParts = normalizePathLike(left)
    .split("/")
    .filter((part) => part.length > 0);
  const rightParts = normalizePathLike(right)
    .split("/")
    .filter((part) => part.length > 0);
  let overlap = 0;
  let li = leftParts.length - 1;
  let ri = rightParts.length - 1;
  while (li >= 0 && ri >= 0) {
    if (leftParts[li]?.toLowerCase() !== rightParts[ri]?.toLowerCase()) {
      break;
    }
    overlap += 1;
    li -= 1;
    ri -= 1;
  }
  return overlap;
}

function evaluateRelocationFingerprintSignal(input: {
  workspaceRoot: string;
  candidatePath: string;
  continuity: ContinuityStateLike;
}): "matched" | "conflict" | "none" {
  const expectedFingerprint = input.continuity.lastReadFragmentFingerprint;
  if (!expectedFingerprint) {
    return "none";
  }
  const absolute = path.resolve(input.workspaceRoot, input.candidatePath);
  let content: string;
  try {
    content = fs.readFileSync(absolute, "utf8");
  } catch {
    return "none";
  }
  const sourceLines = content.split(/\r?\n/);
  while (sourceLines.length > 0 && sourceLines[sourceLines.length - 1]?.length === 0) {
    sourceLines.pop();
  }
  const previousIndexes = resolveFragmentIndexesFromContinuityInput(
    sourceLines,
    input.continuity.lastReadFragmentLineIndexes,
    input.continuity.lastReadFragmentRanges,
    input.continuity.lastReadFragmentSourceWindowStart,
    input.continuity.lastReadFragmentSourceWindowEnd,
    input.continuity.lastReadFilter,
  );
  if (previousIndexes.length > 0) {
    const current = computeFragmentFingerprintFromIndexes(sourceLines, previousIndexes);
    if (current?.fingerprint === expectedFingerprint) {
      return "matched";
    }
  }
  const reanchor = attemptSelectiveReanchorByFingerprint({
    sourceLines,
    expectedFingerprint,
    expectedStructureSignature: input.continuity.lastReadFragmentStructureSignature,
    expectedNeighborhoodSignature:
      input.continuity.lastReadFragmentNeighborhoodSignature,
    readFilter: input.continuity.lastReadFilter,
    sourceWindowStart: input.continuity.lastReadFragmentSourceWindowStart,
    sourceWindowEnd: input.continuity.lastReadFragmentSourceWindowEnd,
    previousFragmentIndexes: previousIndexes,
  });
  if (reanchor.status === "matched") {
    return "matched";
  }
  if (reanchor.status === "ambiguous") {
    return "conflict";
  }
  return "none";
}

function evaluateRelocationSnippetSignal(input: {
  workspaceRoot: string;
  candidatePath: string;
  continuity: ContinuityStateLike;
}): "matched" | "none" {
  const assistantOutput = input.continuity.lastAssistantOutput?.trim();
  if (!assistantOutput) {
    return "none";
  }
  const fencedMatch = assistantOutput.match(/```(?:[\w.+-]+)?\n([\s\S]*?)```/);
  const snippetSource = (fencedMatch?.[1] ?? assistantOutput).trim();
  if (!snippetSource) {
    return "none";
  }
  const snippetLines = snippetSource
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 3)
    .slice(0, 6);
  if (snippetLines.length === 0) {
    return "none";
  }
  let content: string;
  try {
    content = fs.readFileSync(
      path.resolve(input.workspaceRoot, input.candidatePath),
      "utf8",
    );
  } catch {
    return "none";
  }
  const matched = snippetLines.filter((line) => content.includes(line)).length;
  if (snippetLines.length >= 2 && matched >= 2) {
    return "matched";
  }
  if (snippetLines.length === 1 && matched === 1) {
    return "matched";
  }
  return "none";
}

function hasTransformRelocationSignal(input: {
  continuity: ContinuityStateLike;
  missingTargetPath: string;
}): boolean {
  const transforms = extractRelocationTransformHints({
    continuity: input.continuity,
    missingTargetPath: input.missingTargetPath,
  });
  return transforms.some(
    (entry) => entry.from.trim().length > 0 || entry.to.trim().length > 0,
  );
}

function evaluateRelocationTransformSignal(input: {
  workspaceRoot: string;
  candidatePath: string;
  continuity: ContinuityStateLike;
  missingTargetPath: string;
}): "matched" | "conflict" | "none" {
  const transforms = extractRelocationTransformHints({
    continuity: input.continuity,
    missingTargetPath: input.missingTargetPath,
  });
  if (transforms.length === 0) {
    return "none";
  }
  let content: string;
  try {
    content = fs.readFileSync(
      path.resolve(input.workspaceRoot, input.candidatePath),
      "utf8",
    );
  } catch {
    return "none";
  }
  let positive = 0;
  let conflict = 0;
  for (const transform of transforms) {
    const from = transform.from.trim();
    const to = transform.to.trim();
    const hasFrom = from.length > 0 && content.includes(from);
    const hasTo = to.length > 0 && content.includes(to);
    if (hasFrom && !hasTo) {
      positive += 1;
      continue;
    }
    if (!hasFrom && hasTo) {
      conflict += 1;
    }
  }
  if (positive > 0) {
    return "matched";
  }
  if (conflict > 0 && conflict === transforms.length) {
    return "conflict";
  }
  return "none";
}

function extractRelocationTransformHints(input: {
  continuity: ContinuityStateLike;
  missingTargetPath: string;
}): ReadonlyArray<{ from: string; to: string }> {
  const hints: Array<{ from: string; to: string }> = [];
  const seen = new Set<string>();
  const push = (from: string, to: string): void => {
    const normalizedFrom = from.trim();
    const normalizedTo = to.trim();
    if (!normalizedFrom && !normalizedTo) {
      return;
    }
    const key = `${normalizedFrom}=>${normalizedTo}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    hints.push({ from: normalizedFrom, to: normalizedTo });
  };

  for (const transform of collectContinuationTransforms(
    input.continuity,
    input.missingTargetPath,
    [input.missingTargetPath],
  )) {
    push(transform.from, transform.to);
  }

  const lineage = extractLineageSlotsFromEvidence(
    input.continuity.lastContinuationEvidence,
  );
  const allSlots = [
    ...(lineage.active ? [lineage.active] : []),
    ...lineage.slots,
  ];
  const missingTarget = normalizePathLike(input.missingTargetPath);
  for (const slot of allSlots) {
    const decoded = decodeLineageSlot(slot);
    if (!decoded) {
      continue;
    }
    if (normalizePathLike(decoded.target) !== missingTarget) {
      continue;
    }
    const transformSignature = decoded.transform.trim();
    if (!transformSignature || transformSignature === "*") {
      continue;
    }
    const separator = transformSignature.indexOf("=>");
    if (separator <= 0) {
      continue;
    }
    const from = transformSignature.slice(0, separator);
    const to = transformSignature.slice(separator + 2);
    push(from, to);
  }

  return hints;
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
  const unresolved = (continuity.unresolvedItems ?? []).join(" | ").toLowerCase();
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
      ...(continuity.recentChangedFiles ?? []).map((item) => normalizePathLike(item)),
      ...(continuity.recentTargetFiles ?? []).map((item) => normalizePathLike(item)),
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
    const appliedMatch = normalizedToken.match(/^repair-cross-file applied on (.+)$/i);
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

  const candidates = Array.from(candidateMap.values()).map((entry) => entry.path);
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
      candidate.split("/").some((part) => loweredPrompt.includes(part.toLowerCase())) ||
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

async function executeWorkflowTaskPlan(input: {
  readonly plan: WorkflowTaskPlan;
  readonly freshnessObservability: FreshnessObservability;
  readonly prompt: string;
  readonly dispatcher: ToolDispatcher;
  readonly sessionId: string;
  readonly turn: number;
  readonly workspaceRoot: string;
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
  notes.push(...input.freshnessObservability.notes);
  evidence.push(...input.freshnessObservability.evidence);
  if (input.plan.lineageSlotDecision === "match") {
    notes.push("same-file slot disambiguation: matched lineage slot");
    evidence.push("continuation-lineage-match:same-file-slot");
    if (input.plan.lineageSlotFamily) {
      evidence.push(`continuation-lineage-slot-family:${input.plan.lineageSlotFamily}`);
    }
    if (input.plan.lineageSlotSelected) {
      evidence.push(`continuation-lineage-slot-selected:${input.plan.lineageSlotSelected}`);
    }
    if ((input.plan.lineageSlotCandidates?.length ?? 0) > 0) {
      evidence.push(
        `continuation-lineage-slot-candidates:${input.plan.lineageSlotCandidates!.join(",")}`,
      );
    }
  } else if (input.plan.lineageSlotDecision === "ambiguous-clarify") {
    notes.push("same-file slot disambiguation: ambiguous, clarify required");
    evidence.push("continuation-lineage-ambiguous:same-file-slot");
    evidence.push("continuation-clarify-required:same-file-slot");
    if ((input.plan.lineageSlotCandidates?.length ?? 0) > 0) {
      evidence.push(
        `continuation-lineage-slot-candidates:${input.plan.lineageSlotCandidates!.join(",")}`,
      );
    }
  }
  if (input.plan.lineageActivationDecision === "same-file-slot") {
    evidence.push("continuation-lineage-activation:same-file-slot");
  } else if (input.plan.lineageActivationDecision === "same-file-slot-clarify") {
    evidence.push("continuation-lineage-activation-clarify:same-file-slot");
  } else if (input.plan.lineageActivationDecision === "cross-file-candidate") {
    evidence.push("continuation-lineage-activation:cross-file-candidate");
  } else if (
    input.plan.lineageActivationDecision === "cross-file-disambiguation"
  ) {
    evidence.push("continuation-lineage-activation-clarify:cross-file-candidate");
  } else if (input.plan.lineageActivationDecision === "chat-boundary") {
    evidence.push("continuation-lineage-activation-chat-boundary");
  }
  if (input.plan.lineageActivationMode) {
    evidence.push(`continuation-lineage-activation-mode:${input.plan.lineageActivationMode}`);
  }
  if (
    !input.plan.lineageActivationDecision &&
    input.plan.degradedReopen &&
    input.plan.targetMissing &&
    !input.plan.targetPath &&
    (input.plan.degradedReopenCandidates?.length ?? 0) > 1
  ) {
    evidence.push("continuation-lineage-activation-clarify:cross-file-candidate");
    evidence.push("continuation-lineage-slot-confidence:low");
    evidence.push(
      "continuation-lineage-slot-reason:cross-file continuation remained ambiguous across multiple reopen candidates",
    );
  }
  if (input.plan.lineageSlotConfidence) {
    evidence.push(`continuation-lineage-slot-confidence:${input.plan.lineageSlotConfidence}`);
  }
  if (input.plan.lineageSlotReason) {
    evidence.push(`continuation-lineage-slot-reason:${input.plan.lineageSlotReason}`);
  }
  if (
    input.plan.relocatedTargetFromPath &&
    input.plan.targetPath &&
    normalizePathLike(input.plan.relocatedTargetFromPath) !==
      normalizePathLike(input.plan.targetPath)
  ) {
    const lineageFamily = deriveIntentFamily(input.plan.taskKind);
    notes.push(
      `continuation target relocated: ${input.plan.relocatedTargetFromPath} -> ${input.plan.targetPath}`,
    );
    evidence.push(
      `target-relocated:${input.plan.relocatedTargetFromPath}->${input.plan.targetPath}`,
      `continuation-family-anchor:${input.plan.targetPath}`,
      `continuation-lineage-active:${input.plan.targetPath}::${lineageFamily}::*`,
      `continuation-lineage-slot:${input.plan.targetPath}::${lineageFamily}::*`,
    );
    if (input.plan.relocationRecoveryReason) {
      evidence.push(
        `target-relocation-reason:${input.plan.relocationRecoveryReason}`,
      );
    }
    if ((input.plan.relocationCandidateSummary?.length ?? 0) > 0) {
      evidence.push(
        `target-relocation-candidates:${input.plan.relocationCandidateSummary!.join(",")}`,
      );
    }
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

  if (input.plan.blockedReason) {
    notes.push(`blocker: ${input.plan.blockedReason}`);
    const blockedEvidence = [
      ...evidence,
      "workflow blocked before mutation",
    ];
    const blockedRemainingTargets = Array.from(
      new Set([
        ...(input.plan.previousRemainingTargets ?? []),
        ...(input.plan.degradedReopenCandidates ?? []),
      ]),
    ).filter((entry) => entry.trim().length > 0);
    const blockedFailedEntries = input.plan.previousFailedEntries ?? [];
    blockedEvidence.push(
      `repair-remaining-files:${
        blockedRemainingTargets.length > 0
          ? blockedRemainingTargets.join(",")
          : "(none)"
      }`,
    );
    blockedEvidence.push(
      `repair-failed-files:${
        blockedFailedEntries.length > 0
          ? blockedFailedEntries
              .map((entry) =>
                `${entry.path}::${entry.failureCode}::${truncate(entry.reason, 80)}`,
              )
              .join("|")
          : "(none)"
      }`,
    );
    if (input.plan.degradedReopenReason) {
      blockedEvidence.push(`reopen-reason:${input.plan.degradedReopenReason}`);
    }
    if ((input.plan.degradedReopenCandidates?.length ?? 0) > 0) {
      blockedEvidence.push(
        `reopen-candidates:${input.plan.degradedReopenCandidates!.join(",")}`,
      );
    }
    if (input.plan.degradedReopenCandidateSource) {
      blockedEvidence.push(
        `reopen-candidate-source:${input.plan.degradedReopenCandidateSource}`,
      );
    }
    if ((input.plan.degradedReopenCandidatePruned?.length ?? 0) > 0) {
      blockedEvidence.push(
        `reopen-candidate-pruned:${input.plan.degradedReopenCandidatePruned!.join("|")}`,
      );
    }
    if (
      input.plan.degradedReopenCandidates &&
      input.plan.degradedReopenCandidates.length > 1
    ) {
      blockedEvidence.push("why-not-auto-select:multi-candidate-ambiguous");
      blockedEvidence.push("repair-outcome:blocked-disambiguation");
    }
    return {
      events,
      notes,
      codingResult: buildCodingResult(input.plan.taskKind, {
        changedFiles,
        failedFiles: [
          {
            path: input.plan.targetPath ?? "(missing-target)",
            reason: input.plan.blockedReason,
          },
        ],
        patches,
        verifiedFiles,
        unverifiedFiles,
        verification: {
          status: "skipped",
          reason: input.plan.blockedReason,
          selectionScope: "none",
          selectionSource: "not-requested",
        },
        repairNotes: [input.plan.blockedReason],
        evidence: blockedEvidence,
        taskVerdict: "insufficient-evidence",
        taskReasons: [input.plan.blockedReason],
      }),
      userFacingOutput: `Task not completed: ${input.plan.blockedReason}`,
    };
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

  let originalContent: string | undefined;
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
      requireApprovalEvent: false,
    });
    if (!readStep.success) {
      const reason = readStep.error ?? "read failed";
      notes.push(`inspect failed: ${reason}`);
      failedFiles.push({ path: input.plan.targetPath, reason });
      return {
        events,
        notes,
        codingResult: buildCodingResult(input.plan.taskKind, {
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
          repairNotes: ["inspect step failed before edit"],
          evidence: [`read failed: ${reason}`],
          taskVerdict: "insufficient-evidence",
          taskReasons: ["Inspect step failed; mutation skipped."],
        }),
        userFacingOutput: `Task not completed: failed to read ${input.plan.targetPath}. Reason: ${reason}`,
      };
    }
    originalContent = readStep.output ?? "";
    notes.push(`tool: read file ${input.plan.targetPath}`);
    evidence.push(`inspect: read ${input.plan.targetPath}`);
    if (input.plan.taskKind === "read-file") {
      const readDelivery = buildReadTaskDelivery({
        prompt: input.prompt,
        targetPath: input.plan.targetPath,
        content: originalContent,
        preferredMode: input.plan.groundedDeliverableMode,
        forceExplainFragmentAnchor: input.plan.forceExplainFragmentAnchor,
        allowWholeFileExplainFallback: input.plan.allowWholeFileExplainFallback,
        requestedLines: input.plan.readLineCount,
        lineOffset: input.plan.readLineOffset,
        readFragmentLineIndexes: input.plan.readFragmentLineIndexes,
        readFragmentRanges: input.plan.readFragmentRanges,
        readFragmentSourceWindowStart: input.plan.readFragmentSourceWindowStart,
        readFragmentSourceWindowEnd: input.plan.readFragmentSourceWindowEnd,
        readFragmentFingerprint: input.plan.readFragmentFingerprint,
        readFragmentStructureSignature: input.plan.readFragmentStructureSignature,
        readFragmentNeighborhoodSignature:
          input.plan.readFragmentNeighborhoodSignature,
        readFilter: input.plan.readFilter,
        repairInstruction: input.plan.repairInstruction,
      });
      return {
        events,
        notes,
        codingResult: buildCodingResult(
          readDelivery.evidenceMarkers.includes("deliverable-mode:explain")
            ? "repo-explain"
            : "read-file",
          {
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
        }),
        userFacingOutput: readDelivery.output,
      };
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
        codingResult: buildCodingResult("inspect-files", {
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
        }),
        userFacingOutput: delivery,
      };
    }
    const reason = globStep.error ?? "glob failed";
    notes.push(`inspect failed: ${reason}`);
    failedFiles.push({ path: "(workspace)", reason });
    return {
      events,
      notes,
      codingResult: buildCodingResult("inspect-files", {
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
      }),
      userFacingOutput: `Task not completed: repository inspection failed. Reason: ${reason}`,
    };
  }

  if (input.plan.taskKind === "repo-explain") {
    if (!input.plan.targetPath) {
      return {
        events,
        notes: [...notes, "repo-explain missing explicit target"],
        codingResult: buildCodingResult("repo-explain", {
          changedFiles,
          failedFiles: [
            {
              path: "(missing-target)",
              reason:
                "Repo explain requires an explicit in-workspace file target for truthful delivery.",
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
        }),
        userFacingOutput:
          "Task not completed: missing target file. Provide an explicit in-workspace file path to explain.",
      };
    }
    const readStep = await dispatchToolWithLifecycle({
      dispatcher: input.dispatcher,
      events,
      toolName: "read",
      taskId: `task_${input.sessionId}_${input.turn}_repo_explain_read`,
      args: { path: input.plan.targetPath },
      workspaceRoot: input.workspaceRoot,
      sessionId: input.sessionId,
      requireApprovalEvent: false,
    });
    if (!readStep.success) {
      const reason = readStep.error ?? "read failed";
      return {
        events,
        notes: [...notes, `repo-explain read failed: ${reason}`],
        codingResult: buildCodingResult("repo-explain", {
          changedFiles,
          failedFiles: [{ path: input.plan.targetPath, reason }],
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
        }),
        userFacingOutput: `Task not completed: failed to read ${input.plan.targetPath}. Reason: ${reason}`,
      };
    }
    const explainOutput = buildExplainTaskDelivery(
      input.plan.targetPath,
      readStep.output ?? "",
    );
    return {
      events,
      notes: [...notes, `repo-explain delivered: ${input.plan.targetPath}`],
      codingResult: buildCodingResult("repo-explain", {
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
        evidence: [...evidence, `repo-explain: read ${input.plan.targetPath}`],
        taskVerdict: "satisfied",
        taskReasons: ["Repo explanation delivered from inspected file content."],
      }),
      userFacingOutput: explainOutput,
    };
  }

  if (input.plan.taskKind === "write-file" || input.plan.taskKind === "edit-file") {
    const targetPath = input.plan.targetPath ?? "(unknown)";
    if (input.plan.taskKind === "edit-file" && input.plan.crossFileConvergedNoop) {
      const convergedMessage =
        "Cross-file continuation already converged; no remaining related files require edits.";
      notes.push("repair: cross-file continuation converged (no remaining targets)");
      evidence.push("repair-cross-file converged:no-remaining-targets");
      evidence.push("repair-processed-files:(none-added-this-turn)");
      evidence.push("repair-remaining-files:(none)");
      return {
        events,
        notes,
        codingResult: buildCodingResult(input.plan.taskKind, {
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
          taskReasons: ["No remaining related files required continuation edits."],
        }),
        userFacingOutput: convergedMessage,
      };
    }
    const fenced = extractFencedContent(input.prompt);
    let replaceDirective =
      input.plan.replaceFrom && input.plan.replaceTo
        ? { from: input.plan.replaceFrom, to: input.plan.replaceTo }
        : extractReplaceDirective(input.prompt);
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
          codingResult: buildCodingResult(input.plan.taskKind, {
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
          }),
          userFacingOutput: `Task not completed: ${reason}`,
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
          codingResult: buildCodingResult(input.plan.taskKind, {
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
          }),
          userFacingOutput: `Task not completed: ${reason}`,
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
      failedFiles.push({ path: targetPath, reason: mutationInstruction.reason });
      repairNotes.push(mutationInstruction.reason);
      return {
        events,
        notes: [...notes, `blocker: ${mutationInstruction.reason}`],
        codingResult: buildCodingResult(input.plan.taskKind, {
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
        }),
        userFacingOutput: `Task not completed: ${mutationInstruction.reason}`,
      };
      }
    }
    const successfulMutationInstruction = mutationInstruction as Exclude<
      typeof mutationInstruction,
      { ok: false; reason: string }
    >;

    if (!primarySkippedForCrossFile) {
      const mutation = await dispatchToolWithLifecycle({
        dispatcher: input.dispatcher,
        events,
        toolName: input.plan.taskKind === "write-file" ? "write" : "edit",
        taskId: `task_${input.sessionId}_${input.turn}_${input.plan.taskKind === "write-file" ? "write" : "edit"}`,
        args: { path: targetPath, content: successfulMutationInstruction.content },
        workspaceRoot: input.workspaceRoot,
        sessionId: input.sessionId,
        requireApprovalEvent: true,
      });

      if (!mutation.success) {
        const reason = mutation.error ?? "mutation failed";
        failedFiles.push({ path: targetPath, reason });
        patches.push({
          path: targetPath,
          operation: input.plan.taskKind === "write-file" ? "append" : "replace",
          status: "failed",
          failureCode: "write-failed",
          reason,
        });
      } else {
        changedFiles.push(targetPath);
        patches.push({
          path: targetPath,
          operation: input.plan.taskKind === "write-file" ? "append" : "replace",
          status: "applied",
          changedLines: successfulMutationInstruction.changedLines,
          addedLines: successfulMutationInstruction.addedLines,
          removedLines: successfulMutationInstruction.removedLines,
        });
        notes.push(`mutation applied: ${targetPath}`);
        evidence.push(`edit/write applied on ${targetPath}`);
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
      evidence.push(
        `repair-candidate-files:${coordinatedTargets.join(",")}`,
      );
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
          failedFiles.push({ path: linkedPath, reason: linkedInstruction.reason });
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
        const linkedMutation = await dispatchToolWithLifecycle({
          dispatcher: input.dispatcher,
          events,
          toolName: "edit",
          taskId: `task_${input.sessionId}_${input.turn}_cross_edit_${linkedPath.replace(/[^\w.-]+/g, "_")}`,
          args: { path: linkedPath, content: linkedInstruction.content },
          workspaceRoot: input.workspaceRoot,
          sessionId: input.sessionId,
          requireApprovalEvent: true,
        });
        if (!linkedMutation.success) {
          const reason = linkedMutation.error ?? "cross-file mutation failed";
          failedFiles.push({ path: linkedPath, reason });
          failedEntries.push({
            path: linkedPath,
            failureCode: "write-failed",
            reason,
          });
          if (shouldRetainCrossFileFailureInRemaining("write-failed", reason)) {
            remainingCrossFilePaths.add(linkedPath);
          } else {
            processedCrossFilePaths.add(linkedPath);
          }
          patches.push({
            path: linkedPath,
            operation: "replace",
            status: "failed",
            failureCode: "write-failed",
            reason,
          });
          continue;
        }
        changedFiles.push(linkedPath);
        processedCrossFilePaths.add(linkedPath);
        patches.push({
          path: linkedPath,
          operation: "replace",
          status: "applied",
          changedLines: linkedInstruction.changedLines,
          addedLines: linkedInstruction.addedLines,
          removedLines: linkedInstruction.removedLines,
        });
        notes.push(`repair: cross-file coordinated mutation applied on ${linkedPath}`);
        evidence.push(`repair-cross-file applied on ${linkedPath}`);
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
        evidence.push(`repair-degradation-reason:${degradationDecision.reason}`);
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
                .map((entry) =>
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

  if (input.plan.taskKind === "run-command") {
    const command = input.plan.directCommand ?? "node --version";
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
        requireApprovalEvent: true,
      });
      verification = {
        status: commandResult.success ? "passed" : "failed",
        command,
        reason: commandResult.success
          ? "run-command executed"
          : truncate(commandResult.error ?? commandResult.output ?? "command failed"),
        selectionScope: "explicit",
        selectionSource: "explicit-user",
      };
      if (!commandResult.success) {
        failedFiles.push({
          path: "(command)",
          reason: verification.reason ?? "command failed",
        });
      }
    }
  }

  if (input.plan.verifyAfterEdit && changedFiles.length > 0) {
    const verifyCommand = input.plan.verifyCommand;
    if (!verifyCommand) {
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
    } else {
    const verifyResult = await dispatchToolWithLifecycle({
      dispatcher: input.dispatcher,
      events,
      toolName: "bash",
      taskId: `task_${input.sessionId}_${input.turn}_verify`,
      args: { command: verifyCommand },
      workspaceRoot: input.workspaceRoot,
      sessionId: input.sessionId,
      requireApprovalEvent: true,
    });
      if (verifyResult.success) {
        verification = {
          status: "passed",
          command: verifyCommand,
          reason: "verify completed",
          selectionScope: "focused",
          selectionSource: "explicit-user",
        };
        verifiedFiles.push(...changedFiles);
        notes.push(`verify passed: ${verifyCommand}`);
      } else {
        const verifyFailure = classifyVerificationFailure(verifyResult);
        verification = {
          status: verifyFailure.status,
          command: verifyCommand,
          reason: verifyFailure.reason,
          selectionScope: "focused",
          selectionSource: "explicit-user",
          blockerKind: verifyFailure.blockerKind,
          nextAction: verifyFailure.nextAction,
        };
        for (const path of changedFiles) {
          unverifiedFiles.push({
            path,
            reason:
              verification.reason ??
              "verify failed; inspect output and repair before next edit",
          });
        }
        repairNotes.push(
          verifyFailure.status === "blocked"
            ? `verify blocked after edit; ${verifyFailure.nextAction}`
            : "verify failed after edit; inspect failing command output before continuing edits",
        );
        notes.push(
          verifyFailure.status === "blocked"
            ? `verify blocked: ${verifyCommand}`
            : `verify failed: ${verifyCommand}`,
        );
      }
    }
  } else if (changedFiles.length > 0) {
    for (const path of changedFiles) {
      unverifiedFiles.push({
        path,
        reason: "verify step was not requested in prompt",
      });
    }
    verification = {
      status: "not-requested",
      reason: "mutation completed without explicit verify intent",
      selectionScope: "none",
      selectionSource: "not-requested",
    };
  }

  if (failedFiles.length > 0 && repairNotes.length === 0) {
    repairNotes.push("operation failed; inspect failed items and rerun with clearer target/instruction");
  }

  const mutationTaskDelivery = (() => {
    if (crossFileDegradationReason && degradedCrossFileTargets.length > 0) {
      return `Task stopped: unrecoverable remaining targets detected (${degradedCrossFileTargets.join(", ")}). ${crossFileDegradationReason}`;
    }
    if (crossFileRemainingTargets.length > 0) {
      const changed = changedFiles.length > 0 ? changedFiles.join(", ") : "none";
      const failedSummary =
        crossFileFailedByReason.length > 0
          ? ` Failed this turn: ${crossFileFailedByReason
              .map((item) => `${item.path} (${item.failureCode})`)
              .join(", ")}.`
          : "";
      const skippedSummary =
        crossFileSkippedFiles.length > 0
          ? ` Skipped this turn: ${crossFileSkippedFiles
              .map((item) => `${item.path} (${item.reason})`)
              .join(", ")}.`
          : "";
      return `Edit partially completed for ${changed}. Remaining cross-file targets: ${crossFileRemainingTargets.join(", ")}.${failedSummary}${skippedSummary}`;
    }
    if (failedFiles.length > 0) {
      const first = failedFiles[0];
      return `Task not completed: ${first?.path ?? "(unknown)"} failed (${first?.reason ?? "unknown reason"}).`;
    }
    if (changedFiles.length === 0) {
      return "Task not completed: no file mutation was applied.";
    }
    const changed = changedFiles.join(", ");
    const verificationNote =
      verification.status === "passed"
        ? "Verification passed."
        : verification.status === "blocked"
          ? `Verification blocked (${verification.blockerKind ?? "unknown"}). ${verification.nextAction ?? ""}`.trim()
          : verification.status === "failed"
            ? `Verification failed: ${verification.reason ?? "command failed"}.`
            : verification.status === "not-requested"
              ? "Verification was not requested."
              : "Verification skipped.";
    return `${input.plan.taskKind === "write-file" ? "Write completed" : "Edit completed"} for ${changed}. ${verificationNote}`;
  })();

  return {
    events,
    notes,
    codingResult: buildCodingResult(input.plan.taskKind, {
      changedFiles,
      failedFiles,
      patches,
      verifiedFiles,
      unverifiedFiles,
      verification,
      repairNotes,
      evidence,
      taskVerdict:
        crossFileDegradationReason
          ? "insufficient-evidence"
          : crossFileRemainingTargets.length > 0
          ? "completed-with-caveats"
          : failedFiles.length > 0
          ? "insufficient-evidence"
          : verification.status === "failed" || verification.status === "blocked"
            ? "completed-with-caveats"
            : "satisfied",
      taskReasons:
        crossFileDegradationReason
          ? [
              `Cross-file continuation degraded to terminal due to unrecoverable remaining targets: ${degradedCrossFileTargets.join(", ")}`,
              `degradation-reason: ${crossFileDegradationReason}`,
            ]
          : crossFileRemainingTargets.length > 0
          ? [
              `Cross-file repair partially completed; remaining targets: ${crossFileRemainingTargets.join(", ")}`,
              ...(crossFileFailedByReason.length > 0
                ? [
                    `Failed-by-reason: ${crossFileFailedByReason
                      .map(
                        (item) =>
                          `${item.path}=>${item.failureCode} (${item.reason})`,
                      )
                      .join("; ")}`,
                  ]
                : []),
              ...(crossFileSkippedFiles.length > 0
                ? [
                    `Skipped files: ${crossFileSkippedFiles
                      .map((item) => `${item.path} (${item.reason})`)
                      .join("; ")}`,
                  ]
                : []),
            ]
          : failedFiles.length > 0
          ? ["Workflow stopped on blocker/failure."]
          : verification.status === "failed"
            ? ["Edit applied but verify failed; repair required."]
            : verification.status === "blocked"
              ? [
                  `Edit applied but verify was blocked (${verification.blockerKind ?? "unknown"}); follow next action before continuing.`,
                ]
            : ["Workflow completed under inspect/edit/verify contract."],
    }),
    userFacingOutput: mutationTaskDelivery,
  };
}

function renderExecutionSummary(
  plan: WorkflowTaskPlan,
  execution: WorkflowExecutionResult,
): string {
  const result = execution.codingResult;
  const statusLine =
    result.taskSatisfaction.verdict === "satisfied"
      ? "workflow-status=ready"
      : result.taskSatisfaction.verdict === "completed-with-caveats"
        ? "workflow-status=verify-failed"
        : "workflow-status=blocked";
  const verifyLine = `verify=${result.verification.status}${
    result.verification.command ? ` command=${result.verification.command}` : ""
  }`;
  const changed =
    result.changedFiles.length > 0
      ? result.changedFiles.join(", ")
      : "none";
  const failed =
    result.failedFiles.length > 0
      ? result.failedFiles.map((item) => `${item.path}: ${item.reason}`).join(" | ")
      : "none";

  return [
    "Coding workflow execution summary",
    `task=${plan.taskKind}`,
    statusLine,
    `changed=${changed}`,
    `failed=${failed}`,
    verifyLine,
    `repair=${result.repair.status}`,
    `next=${result.taskSatisfaction.reasons.join(" | ") || "none"}`,
  ].join("\n");
}

function buildReadTaskDelivery(input: {
  prompt: string;
  targetPath: string;
  content: string;
  preferredMode?: GroundedDeliverableMode;
  forceExplainFragmentAnchor?: boolean;
  allowWholeFileExplainFallback?: boolean;
  requestedLines?: number;
  lineOffset?: number;
  readFragmentLineIndexes?: readonly number[];
  readFragmentRanges?: readonly string[];
  readFragmentSourceWindowStart?: number;
  readFragmentSourceWindowEnd?: number;
  readFragmentFingerprint?: string;
  readFragmentStructureSignature?: string;
  readFragmentNeighborhoodSignature?: string;
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
  const requestedLinesFromInputOrPrompt =
    input.requestedLines ?? extractRequestedLineCount(input.prompt);
  const scopedExplainRequest =
    input.preferredMode === "explain" &&
    (requestedLinesFromInputOrPrompt !== undefined || input.lineOffset !== undefined);
  const localExplainRequest =
    input.forceExplainFragmentAnchor === true ||
    scopedExplainRequest ||
    (hasLocalSliceExplainCue(input.prompt) &&
      /(?:\bexplain\b|\u89e3\u91ca|\u5728\u505a\u4ec0\u4e48)/i.test(input.prompt));
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
    let fragmentEvidenceSource:
      | "line-indexes"
      | "ranges"
      | "source-window-reconstructed"
      | "source-window-filtered-reconstructed"
      | undefined;
    const hasStrongFragmentIdentitySignal = Boolean(
      input.readFragmentFingerprint ||
        input.readFragmentStructureSignature ||
        input.readFragmentNeighborhoodSignature,
    );
    if (fragmentIndexes.length > 0) {
      fragmentEvidenceSource = "line-indexes";
    }
    if (fragmentIndexes.length === 0 && (input.readFragmentRanges?.length ?? 0) > 0) {
      fragmentIndexes = normalizeReadFragmentLineIndexes(
        expandReadFragmentRangesToIndexes(input.readFragmentRanges, sourceLines.length),
        sourceLines.length,
      );
      if (fragmentIndexes.length > 0) {
        fragmentEvidenceSource = "ranges";
      }
    }
    if (
      fragmentIndexes.length === 0 &&
      hasStrongFragmentIdentitySignal &&
      input.readFragmentSourceWindowStart !== undefined &&
      input.readFragmentSourceWindowEnd !== undefined
    ) {
      const boundedStart = Math.max(0, input.readFragmentSourceWindowStart);
      const boundedEnd = Math.min(
        sourceLines.length,
        Math.max(boundedStart, input.readFragmentSourceWindowEnd),
      );
      const windowIndexes: number[] = [];
      for (let index = boundedStart; index < boundedEnd; index += 1) {
        windowIndexes.push(index);
      }
      fragmentIndexes = normalizeReadFragmentLineIndexes(
        windowIndexes,
        sourceLines.length,
      );
      if (fragmentIndexes.length > 0) {
        fragmentEvidenceSource = "source-window-reconstructed";
      }
    }
    if (
      fragmentIndexes.length === 0 &&
      input.readFilter === "function-definitions" &&
      hasStrongFragmentIdentitySignal &&
      input.readFragmentSourceWindowStart !== undefined &&
      input.readFragmentSourceWindowEnd !== undefined
    ) {
      const boundedStart = Math.max(0, input.readFragmentSourceWindowStart);
      const boundedEnd = Math.min(
        sourceLines.length,
        Math.max(boundedStart, input.readFragmentSourceWindowEnd),
      );
      for (let index = boundedStart; index < boundedEnd; index += 1) {
        if (lineMatchesReadFilter(sourceLines[index] ?? "", "function-definitions")) {
          fragmentIndexes.push(index);
        }
      }
      fragmentIndexes = normalizeReadFragmentLineIndexes(fragmentIndexes, sourceLines.length);
      if (fragmentIndexes.length > 0) {
        fragmentEvidenceSource = "source-window-filtered-reconstructed";
      }
    }
    if (input.readFilter && fragmentIndexes.length === 0) {
      return {
        completed: false,
        output: `Task not completed: no delivered filtered fragment is available to explain for ${input.targetPath}.`,
        evidenceMarkers: [
          "deliverable-mode:explain",
          ...(input.readFragmentSourceWindowStart !== undefined
            ? [`read-fragment-source-window-start:${input.readFragmentSourceWindowStart}`]
            : []),
          ...(input.readFragmentSourceWindowEnd !== undefined
            ? [`read-fragment-source-window-end:${input.readFragmentSourceWindowEnd}`]
            : []),
          ...(input.readFilter ? [`repair-read-filter:${input.readFilter}`] : []),
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
          expectedStructureSignature: input.readFragmentStructureSignature,
          expectedNeighborhoodSignature:
            input.readFragmentNeighborhoodSignature,
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
              ...(input.readFilter ? [`repair-read-filter:${input.readFilter}`] : []),
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
              ...(input.readFilter ? [`repair-read-filter:${input.readFilter}`] : []),
            ],
          };
        }
        scopedText = reanchoredFragment.text;
        currentFingerprint = reanchoredFragment.fingerprint;
      }
      const label = summarizeLineIndexSet(resolvedFragmentIndexes);
      const currentStructureSignature = computeFragmentStructureSignature(
        sourceLines,
        resolvedFragmentIndexes,
      );
      const currentNeighborhoodSignature = computeFragmentNeighborhoodSignature({
        sourceLines,
        sourceWindowStart: resolvedSourceWindowStart,
        sourceWindowEnd: resolvedSourceWindowEnd,
      });
      const explanation = buildExplainTaskDelivery(
        `${input.targetPath} (${label})`,
        scopedText,
      );
      return {
        completed: true,
        output: explanation,
        evidenceMarkers: [
          "deliverable-mode:explain",
          `read-fragment-line-indexes:${resolvedFragmentIndexes.join(",")}`,
          `read-fragment-ranges:${compressLineIndexesToRanges(resolvedFragmentIndexes)}`,
          `read-fragment-fingerprint:${currentFingerprint}`,
          ...(resolvedSourceWindowStart !== undefined
            ? [`read-fragment-source-window-start:${resolvedSourceWindowStart}`]
            : []),
          ...(resolvedSourceWindowEnd !== undefined
            ? [`read-fragment-source-window-end:${resolvedSourceWindowEnd}`]
            : []),
          ...(input.readFilter ? [`repair-read-filter:${input.readFilter}`] : []),
          ...(currentStructureSignature
            ? [`read-fragment-structure-signature:${currentStructureSignature}`]
            : []),
          ...(currentNeighborhoodSignature
            ? [
                `read-fragment-neighborhood-signature:${currentNeighborhoodSignature}`,
              ]
            : []),
          ...(reanchorConfidence
            ? [`read-fragment-reanchor-confidence:${reanchorConfidence}`]
            : []),
          ...(reanchorReason
            ? [`read-fragment-reanchor-reason:${reanchorReason}`]
            : []),
          ...(reanchorMarker ? [reanchorMarker] : []),
          ...(fragmentEvidenceSource
            ? [`local-explain:evidence-source:${fragmentEvidenceSource}`]
            : []),
          "local-explain:anchored-delivered-fragment",
        ],
      };
    }
    const canDegradeToWholeFile =
      input.allowWholeFileExplainFallback === true ||
      input.preferredMode === "explain" ||
      input.repairInstruction?.targetMode === "explain";
    if (canDegradeToWholeFile) {
      const wholeFileExplain = buildSingleGroundedDelivery({
        prompt: input.prompt,
        targetPath: input.targetPath,
        content: input.content,
        mode: "explain",
      });
      return {
        completed: wholeFileExplain.completed,
        output: wholeFileExplain.completed
          ? [
              `Fragment evidence is insufficient for slice-local explain on ${input.targetPath}; falling back to whole-file explain.`,
              wholeFileExplain.output,
            ].join("\n\n")
          : wholeFileExplain.output,
        evidenceMarkers: [
          ...wholeFileExplain.evidenceMarkers,
          "local-explain:degraded-whole-file-fallback",
          ...(input.readFilter ? [`repair-read-filter:${input.readFilter}`] : []),
        ],
      };
    }
    return {
      completed: false,
      output: `Task not completed: explain step has insufficient fragment evidence for ${input.targetPath}, and whole-file fallback is not allowed.`,
      evidenceMarkers: [
        "deliverable-mode:explain",
        "local-explain:insufficient-fragment-evidence",
        ...(input.readFilter ? [`repair-read-filter:${input.readFilter}`] : []),
      ],
    };
  }

  const requestedLines = requestedLinesFromInputOrPrompt;
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
          expectedStructureSignature: input.readFragmentStructureSignature,
          expectedNeighborhoodSignature:
            input.readFragmentNeighborhoodSignature,
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
              ...(input.readFilter ? [`repair-read-filter:${input.readFilter}`] : []),
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
  const summarizeIntent = /(?:summari[sz]e|summary|\u603b\u7ed3|\u6458\u8981|\u6982\u8ff0)/i.test(
    input.prompt,
  );
  const explainIntent = /(?:\u89e3\u91ca|explain|\u5728\u505a\u4ec0\u4e48|what .* does)/i.test(input.prompt);
  const constraints = input.repairInstruction?.constraints;
  const effectiveMode: GroundedDeliverableMode =
    forceLocalExplain
      ? "explain"
      :
    input.repairInstruction?.targetMode ??
    input.preferredMode ??
    (requestedLines
      ? "read"
      : summarizeIntent
        ? "summary"
        : explainIntent
          ? "explain"
          : "read");
  const hasStrongScopedExplainEvidence =
    (input.readFragmentLineIndexes?.length ?? 0) > 0 ||
    (input.readFragmentRanges?.length ?? 0) > 0 ||
    Boolean(
      input.readFragmentFingerprint ||
        input.readFragmentStructureSignature ||
        input.readFragmentNeighborhoodSignature,
    );
  if (
    effectiveMode === "explain" &&
    (requestedLines !== undefined || effectiveLineOffset > 0) &&
    !hasStrongScopedExplainEvidence
  ) {
    const canDegradeToWholeFile =
      input.allowWholeFileExplainFallback === true ||
      input.preferredMode === "explain" ||
      input.repairInstruction?.targetMode === "explain";
    if (canDegradeToWholeFile) {
      const wholeFileExplain = buildSingleGroundedDelivery({
        prompt: input.prompt,
        targetPath: input.targetPath,
        content: input.content,
        mode: "explain",
      });
      return {
        completed: wholeFileExplain.completed,
        output: wholeFileExplain.completed
          ? [
              `Fragment evidence is insufficient for scoped explain on ${input.targetPath}; falling back to whole-file explain.`,
              wholeFileExplain.output,
            ].join("\n\n")
          : wholeFileExplain.output,
        evidenceMarkers: [
          ...wholeFileExplain.evidenceMarkers,
          "local-explain:degraded-whole-file-fallback",
          "local-explain:scoped-window-without-fragment-evidence",
          ...(input.readFilter ? [`repair-read-filter:${input.readFilter}`] : []),
        ],
      };
    }
    return {
      completed: false,
      output: `Task not completed: scoped explain lacks reliable fragment evidence for ${input.targetPath}, and whole-file fallback is not allowed.`,
      evidenceMarkers: [
        "deliverable-mode:explain",
        "local-explain:insufficient-fragment-evidence",
        "local-explain:scoped-window-without-fragment-evidence",
        ...(input.readFilter ? [`repair-read-filter:${input.readFilter}`] : []),
      ],
    };
  }

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
        ...(stage.mode === "explain" && stage.useLatestReadSnippet && latestReadSliceContent
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

    const nextStep = completed ? stagedSteps.length + 1 : blockedStep ?? completedStep + 1;
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
    prompt: input.prompt,
    targetPath: input.targetPath,
    content: input.content,
    mode: effectiveMode,
    constraints,
    requestedLines,
    lineOffset: effectiveLineOffset,
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
    const start = Math.max(0, input.lineOffset ?? 0);
    const count = input.requestedLines ?? Math.min(40, rawLines.length);
    const windowLines = rawLines.slice(start, start + count);
    const windowEnd = start + windowLines.length;
    let lines = windowLines;
    let matchedLineIndexes = windowLines.map((_, index) => start + index);
    const filteredRead =
      input.constraints?.readFilter === "function-definitions";
    if (input.constraints?.readFilter === "function-definitions") {
      const filteredPairs = windowLines
        .map((line, index) => ({ line, index: start + index }))
        .filter(({ line }) => lineMatchesReadFilter(line, "function-definitions"));
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
    const readSliceStructureSignature = computeFragmentStructureSignature(
      rawLines,
      matchedLineIndexes,
    );
    const readSliceNeighborhoodSignature = computeFragmentNeighborhoodSignature({
      sourceLines: rawLines,
      sourceWindowStart: start,
      sourceWindowEnd: windowEnd,
    });
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
        ...(filteredRead
          ? [`read-fragment-line-indexes:${matchedLineIndexes.join(",")}`]
          : []),
        ...(filteredRead
          ? [`read-fragment-ranges:${compressLineIndexesToRanges(matchedLineIndexes)}`]
          : []),
        `read-fragment-fingerprint:${readSliceFingerprint}`,
        ...(readSliceStructureSignature
          ? [`read-fragment-structure-signature:${readSliceStructureSignature}`]
          : []),
        ...(readSliceNeighborhoodSignature
          ? [
              `read-fragment-neighborhood-signature:${readSliceNeighborhoodSignature}`,
            ]
          : []),
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
        ...(input.constraints?.includeKeyRisks ? ["repair-summary-include-risk:true"] : []),
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
    output: [`Read result for ${input.targetPath}:`, "```text", preview, "```"].join(
      "\n",
    ),
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
    preview.length > 0
      ? ["```text", preview.join("\n"), "```"].join("\n")
      : "",
  ]
    .filter((item) => item.length > 0)
    .join("\n");
}

function buildPurposeIoExplainDelivery(targetPath: string, content: string): string {
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
  return /(?:\u4e0d\u662f\u8fd9\u4e2a\u610f\u601d|\u6211\u8981\u7684\u662f|\u4e0d\u662f.*\u800c\u662f|\u4e0d\u662f\u8fd9\u4e48\u6539|\u4fdd\u7559.*\u4e0d\u52a8|\u53ea\u6539\u7b2c[\u4e00\u4e8c\u4e09\u56db\d]+\u884c|\u91cd\u7b54\u4e0a\u4e00\u9898|\u7ee7\u7eed\u521a\u624d\u90a3\u4e2a\u6587\u4ef6|\u4e0d\u662f\u65b9\u6cd5|directly summarize|not this meaning|redo previous answer|revise last answer|not that edit)/i.test(
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

function isWeakRepairFollowUpPrompt(prompt: string): boolean {
  return /(?:use the failure above|same file.*not that fix|not the right fix|wrong direction|fix the real issue|continue repairing it|continue fixing it|不要再走刚才那个错误方向|同一个文件.*不是那个修法|基于上一次失败继续修复)/i.test(
    prompt,
  );
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
  return undefined;
}

function extractReadStartLine(prompt: string): number | undefined {
  const zh = prompt.match(
    /从第\s*([0-9]+|[一二两三四五六七八九十百]+)\s*行(?:开始|起)?/u,
  );
  if (zh?.[1]) {
    return parseLineCountToken(zh[1]);
  }
  const en = prompt.match(
    /(?:from|starting\s+at)\s+line\s+([0-9]+)/i,
  );
  if (en?.[1]) {
    return parseLineCountToken(en[1]);
  }
  return undefined;
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

function extractLastReadWindowFromContinuity(
  continuity: ContinuityStateLike,
): {
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
  if (size === undefined && start !== undefined && end !== undefined && end >= start) {
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
  structureSignature?: string;
  neighborhoodSignature?: string;
  filter?: "none" | "function-definitions";
  empty?: boolean;
} {
  let start = continuity.lastReadFragmentStart;
  let end = continuity.lastReadFragmentEnd;
  const lineIndexes =
    continuity.lastReadFragmentLineIndexes?.filter((value) =>
      Number.isFinite(value) && value >= 0
    ) ?? [];
  let ranges =
    continuity.lastReadFragmentRanges?.filter((value) => value.trim().length > 0) ??
    [];
  let sourceWindowStart = continuity.lastReadFragmentSourceWindowStart;
  let sourceWindowEnd = continuity.lastReadFragmentSourceWindowEnd;
  let fingerprint = continuity.lastReadFragmentFingerprint;
  let structureSignature = continuity.lastReadFragmentStructureSignature;
  let neighborhoodSignature = continuity.lastReadFragmentNeighborhoodSignature;
  let filter = continuity.lastReadFilter;
  let empty: boolean | undefined;
  // Keep fragment provenance closed to structured continuity fields.
  // We only read non-fragment hints from lastContinuationEvidence so replay/print
  // cannot silently reconstruct missing fragment anchors from raw marker text.
  for (const entry of continuity.lastContinuationEvidence ?? []) {
    const token = entry.trim().toLowerCase();
    if (!token) {
      continue;
    }
    if (filter === undefined) {
      const match = token.match(/^repair-read-filter:(none|function-definitions)$/);
      if (match?.[1]) {
        filter = match[1] as "none" | "function-definitions";
      }
    }
    if (empty === undefined) {
      const match = token.match(/^read-fragment-empty:(true|false)$/);
      if (match?.[1]) {
        empty = match[1] === "true";
      }
    }
  }
  if (empty === undefined && lineIndexes.length === 0 && start !== undefined && end !== undefined && end <= start) {
    empty = true;
  }
  if (ranges.length === 0 && lineIndexes.length > 0) {
    const compressed = compressLineIndexesToRanges(lineIndexes);
    if (compressed.length > 0) {
      ranges = compressed.split(";").map((value) => value.trim()).filter((value) => value.length > 0);
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
    ...(structureSignature ? { structureSignature } : {}),
    ...(neighborhoodSignature ? { neighborhoodSignature } : {}),
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
    readFilter === "function-definitions" &&
    sourceWindowStart !== undefined &&
    sourceWindowEnd !== undefined
  ) {
    const start = Math.max(0, sourceWindowStart);
    const end = Math.min(sourceLines.length, Math.max(start, sourceWindowEnd));
    const recomputed: number[] = [];
    for (let index = start; index < end; index += 1) {
      if (lineMatchesReadFilter(sourceLines[index] ?? "", "function-definitions")) {
        recomputed.push(index);
      }
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

function normalizeLineForSignature(line: string): string {
  return line.replace(/\s+/g, " ").trim();
}

function extractStructuralToken(line: string): string {
  const normalized = normalizeLineForSignature(line);
  const fnMatch = normalized.match(
    /^(export\s+)?(async\s+)?function\s+([A-Za-z_$][\w$]*)/i,
  );
  if (fnMatch?.[3]) {
    return `fn:${fnMatch[3].toLowerCase()}:${fnMatch[1] ? "export" : "local"}:${fnMatch[2] ? "async" : "sync"}`;
  }
  const constArrowMatch = normalized.match(
    /^(export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*(?:\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/i,
  );
  if (constArrowMatch?.[2]) {
    return `const-fn:${constArrowMatch[2].toLowerCase()}:${constArrowMatch[1] ? "export" : "local"}`;
  }
  const classMatch = normalized.match(
    /^(export\s+)?class\s+([A-Za-z_$][\w$]*)/i,
  );
  if (classMatch?.[2]) {
    return `class:${classMatch[2].toLowerCase()}:${classMatch[1] ? "export" : "local"}`;
  }
  if (normalized.length === 0) {
    return "empty";
  }
  return `line:${normalized.toLowerCase()}`;
}

function computeFragmentStructureSignature(
  sourceLines: readonly string[],
  indexes: readonly number[],
): string | undefined {
  const selected = normalizeReadFragmentLineIndexes(indexes, sourceLines.length)
    .map((index) => sourceLines[index])
    .filter((line): line is string => line !== undefined);
  if (selected.length === 0) {
    return undefined;
  }
  const structural = selected.map(extractStructuralToken).join("|");
  if (structural.length === 0) {
    return undefined;
  }
  return computeFragmentFingerprint(structural);
}

function computeFragmentNeighborhoodSignature(input: {
  sourceLines: readonly string[];
  sourceWindowStart: number | undefined;
  sourceWindowEnd: number | undefined;
}): string | undefined {
  if (
    input.sourceWindowStart === undefined ||
    input.sourceWindowEnd === undefined
  ) {
    return undefined;
  }
  const sourceLength = input.sourceLines.length;
  if (sourceLength <= 0) {
    return undefined;
  }
  const start = Math.max(0, input.sourceWindowStart);
  const end = Math.min(sourceLength, Math.max(start, input.sourceWindowEnd));
  const leftStart = Math.max(0, start - 2);
  const left = input.sourceLines
    .slice(leftStart, start)
    .map(normalizeLineForSignature)
    .filter((line) => line.length > 0);
  const rightEnd = Math.min(sourceLength, end + 2);
  const right = input.sourceLines
    .slice(end, rightEnd)
    .map(normalizeLineForSignature)
    .filter((line) => line.length > 0);
  const neighborhood = [...left, "::frag::", ...right].join("|");
  if (neighborhood.length === 0) {
    return undefined;
  }
  return computeFragmentFingerprint(neighborhood);
}

function attemptSelectiveReanchorByFingerprint(input: {
  sourceLines: readonly string[];
  expectedFingerprint: string;
  expectedStructureSignature?: string;
  expectedNeighborhoodSignature?: string;
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
    structureSignature?: string;
    neighborhoodSignature?: string;
  }> = [];
  for (let candidateStart = 0; candidateStart <= maxStart; candidateStart += 1) {
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
        structureSignature: computeFragmentStructureSignature(
          input.sourceLines,
          candidateIndexes,
        ),
        neighborhoodSignature: computeFragmentNeighborhoodSignature({
          sourceLines: input.sourceLines,
          sourceWindowStart: candidateStart,
          sourceWindowEnd: candidateEnd,
        }),
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
      return relative.every((value, idx) => value === expectedRelativePattern[idx]);
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
        if (
          input.expectedStructureSignature &&
          candidate.structureSignature === input.expectedStructureSignature
        ) {
          score += 5;
          reasons.push("structure-signature-match");
        }
        if (
          input.expectedNeighborhoodSignature &&
          candidate.neighborhoodSignature === input.expectedNeighborhoodSignature
        ) {
          score += 3;
          reasons.push("neighborhood-signature-match");
        }
        if (input.sourceWindowStart !== undefined) {
          const drift = Math.abs(candidate.sourceWindowStart - input.sourceWindowStart);
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
          const drift = Math.abs(candidate.sourceWindowEnd - input.sourceWindowEnd);
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
        reason: best.reasons.length > 0 ? best.reasons.join("+") : "score-ranked",
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
  return /^\s*(?:export\s+)?(?:async\s+)?function\b|^\s*(?:export\s+)?const\s+\w+\s*=\s*(?:\([^)]*\)\s*=>|\w+\s*=>)|^\s*(?:export\s+)?class\s+\w+/i.test(
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
  const lastFragment = extractLastReadDeliveredFragmentFromContinuity(continuity);
  const fallbackChunkSize = lastWindow.size ?? 2;

  if (explicitStartLine !== undefined) {
    return {
      mode: "absolute",
      lineOffset: Math.max(0, explicitStartLine - 1),
      lineCount: requestedLineCount ?? continuationLineCount ?? fallbackChunkSize,
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
      lineOffset: lastDelivered > 0 ? lastDelivered : undefined,
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
      (lastFragment.sourceWindowStart !== undefined &&
      lastFragment.sourceWindowEnd !== undefined &&
      lastFragment.sourceWindowEnd >= lastFragment.sourceWindowStart)
        ? Math.max(
            1,
            lastFragment.sourceWindowEnd - lastFragment.sourceWindowStart,
          )
        : (lastFragment.start !== undefined &&
      lastFragment.end !== undefined &&
      lastFragment.end >= lastFragment.start)
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
  const currentMode = input.effectiveDeliverableMode ?? input.continuity.lastGroundedDeliverableMode;
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

  if (
    input.hasContinuationCue &&
    input.lastTaskWasReadLike &&
    targetMode
  ) {
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
        ? input.explicitDeliverableMode ?? input.currentMode
        : undefined);
    if (!segmentMode) {
      return undefined;
    }
    const segmentConstraints = parseGroundedRepairConstraints(segment);
    const summaryConclusionOnly = /(缁撹|conclusion)/i.test(segment) && !/(渚濇嵁|evidence)/i.test(segment);
    const summaryEvidenceOnly = /(渚濇嵁|evidence)/i.test(segment) && !/(缁撹|conclusion)/i.test(segment);
    const summaryEvidenceCount = extractEvidenceCount(segment);
    const appendRiskLine = /(鍏抽敭椋庨櫓|key risks?|risk)/i.test(segment);
    const readCount = extractRequestedLineCount(segment) ?? extractContinuationReadLineCount(segment);
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
    extractStagedRepairStepTotalFromEvidence(continuity.lastContinuationEvidence);
  if (
    continuityTotal !== undefined &&
    continuityTotal !== input.stagedStepCount
  ) {
    return 1;
  }

  const candidateCursor =
    continuity.lastStagedRepairNextStep ??
    extractStagedRepairNextStepFromEvidence(continuity.lastContinuationEvidence) ??
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
    const match = entry.match(/^staged-repair-(?:completed-step|step-cursor):(\d+)$/i);
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
      segment
        .replace(/^(?:first|firstly|首先|先)\s*/i, "")
        .trim(),
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
  if (/(read|读取|继续读\s*\d+\s*行|前\s*\d+\s*行|next\s+\d+\s+lines?)/i.test(segment)) {
    return "read";
  }
  return undefined;
}

function buildStageLabel(mode: GroundedDeliverableMode, segment: string): string {
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
  const chinese = segment.match(/([一二三四五六七八九十两])\s*(?:条)?\s*(?:依据)/u);
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
  const lowered = prompt.toLowerCase();
  const chineseCues = [
    "只看函数定义相关的行",
    "只给函数定义",
    "只看函数定义",
    "只看导出定义",
    "只看导出",
  ];
  if (chineseCues.some((cue) => prompt.includes(cue))) {
    return "function-definitions";
  }
  if (
    /(?:鍙粰鍑芥暟瀹氫箟|鍙湅鍑芥暟瀹氫箟鐩稿叧鐨勮|鍙湅瀵煎嚭瀹氫箟|鍙湅瀵煎嚭)/i.test(
      prompt,
    )
  ) {
    return "function-definitions";
  }

  const englishCues = [
    "only function definitions",
    "function definitions only",
    "only show function definitions",
    "show only function definitions",
    "function-definition-related lines",
    "function definition related lines",
    "only show function-definition-related lines",
    "only show function-definition related lines",
    "only show exported definitions",
    "show only exported definitions",
    "only exported definitions",
    "exported definitions only",
    "only show export definitions",
    "show only export definitions",
  ];
  if (englishCues.some((cue) => lowered.includes(cue))) {
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
    /(?:不用总结|不要总结|别总结|总结先不看|先不总结).*(?:解释|在做什么)/u.test(source);
  const explicitSwitchToSummary =
    /(?:no\s+explain|don't\s+explain|skip\s+explain).*\b(summarize|summary)\b/i.test(
      lowered,
    ) ||
    /(?:不用解释|不要解释|别解释).*(?:总结|摘要)/u.test(source);
  const explicitSwitchToRead =
    /(?:no\s+explain|no\s+summary|skip\s+(?:summary|explain)).*\b(read|show|print)\b/i.test(
      lowered,
    ) ||
    /(?:不用解释|不用总结|不要解释|不要总结).*(?:读取|读前?\s*\d+\s*行)/u.test(source);
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
    /(?:\u8bfb\u53d6|\u67e5\u770b|\u524d\s*\d+\s*\u884c|\u540e\s*\d+\s*\u884c)/u.test(source) ||
    /\b(read|show|print|first\s+\d+\s+lines?|next\s+\d+\s+lines?)\b/i.test(lowered)
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
  const hasSummary =
    /(?:\bsummar(?:y|ize)\b|鎬荤粨|鎽樿|姒傝堪)/i.test(lowered);
  const hasExplain =
    /(?:\bexplain\b|what .* does|解释|在做什么)/i.test(lowered);
  return Number(hasRead) + Number(hasSummary) + Number(hasExplain);
}

function buildMutationTaskDelivery(
  taskKind: CodingTaskKind,
  changedFiles: string[],
  failedFiles: Array<{ path: string; reason: string }>,
  verification: CodingVerificationSummary,
): string {
  if (failedFiles.length > 0) {
    const first = failedFiles[0];
    return `Task not completed: ${first?.path ?? "(unknown)"} failed (${first?.reason ?? "unknown reason"}).`;
  }
  if (changedFiles.length === 0) {
    return "Task not completed: no file mutation was applied.";
  }
  const changed = changedFiles.join(", ");
  const verificationNote =
    verification.status === "passed"
      ? "Verification passed."
      : verification.status === "blocked"
        ? `Verification blocked (${verification.blockerKind ?? "unknown"}). ${verification.nextAction ?? ""}`.trim()
        : verification.status === "failed"
          ? `Verification failed: ${verification.reason ?? "command failed"}.`
          : verification.status === "not-requested"
            ? "Verification was not requested."
            : "Verification skipped.";
  return `${taskKind === "write-file" ? "Write completed" : "Edit completed"} for ${changed}. ${verificationNote}`;
}

function detectVerifyCommand(normalizedPrompt: string): string | undefined {
  if (/(test|\u6d4b\u8bd5)/i.test(normalizedPrompt)) {
    return "npm test -- --help";
  }
  if (/(build|\u6784\u5efa|\u7f16\u8bd1|\u68c0\u67e5)/i.test(normalizedPrompt)) {
    return "npm run build -- --help";
  }
  return undefined;
}

async function dispatchToolWithLifecycle(input: {
  readonly dispatcher: ToolDispatcher;
  readonly events: QueryEvent[];
  readonly toolName: string;
  readonly taskId: string;
  readonly args: Record<string, unknown>;
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly requireApprovalEvent: boolean;
}): Promise<ToolLifecycleResult> {
  if (input.requireApprovalEvent) {
    input.events.push({
      type: "approval.requested",
      toolName: input.toolName,
      taskId: input.taskId,
    });
  }
  input.events.push({
    type: "tool.started",
    toolName: input.toolName,
    taskId: input.taskId,
  });
  const result = await input.dispatcher.dispatch(
    input.toolName,
    input.args,
    {
      taskId: input.taskId,
      workspaceRoot: input.workspaceRoot,
      sessionId: input.sessionId,
    },
  );
  if (input.requireApprovalEvent) {
    input.events.push({
      type: "approval.resolved",
      toolName: input.toolName,
      taskId: input.taskId,
      outcome: result.success ? "approved" : "denied",
    });
  }
  input.events.push({
    type: "tool.result",
    toolName: input.toolName,
    taskId: input.taskId,
    success: result.success,
  });
  return {
    success: result.success,
    output: result.output,
    error: result.error,
    metadata: result.metadata,
  };
}

function classifyVerificationFailure(input: ToolLifecycleResult): {
  status: "failed" | "blocked";
  reason: string;
  blockerKind?: CodingVerificationBlockerKind;
  nextAction?: string;
} {
  const reason = truncate(
    input.error ?? input.output ?? "verify command failed",
  );
  const blockerKind = inferVerificationBlockerKind(input, reason);
  if (!blockerKind) {
    return { status: "failed", reason };
  }

  return {
    status: "blocked",
    reason,
    blockerKind,
    nextAction: blockerNextAction(blockerKind),
  };
}

function inferVerificationBlockerKind(
  input: ToolLifecycleResult,
  reason: string,
): CodingVerificationBlockerKind | undefined {
  const normalizedReason = reason.toLowerCase();
  const wasEscalated = input.metadata?.wasEscalated === true;
  if (
    wasEscalated ||
    normalizedReason.includes("escalation denied by user") ||
    normalizedReason.includes("approval denied by user")
  ) {
    return "approval-denied";
  }

  const failureKind = String(input.metadata?.failureKind ?? "").toLowerCase();
  if (failureKind === "sandbox_preflight") {
    return "approval-denied";
  }
  if (failureKind === "timeout" || failureKind === "cancelled") {
    return "environment-not-ready";
  }

  if (
    normalizedReason.includes("is not recognized as an internal or external command") ||
    normalizedReason.includes("command not found") ||
    normalizedReason.includes("not found") ||
    normalizedReason.includes("enoent")
  ) {
    return "missing-command";
  }

  if (
    normalizedReason.includes("econnreset") ||
    normalizedReason.includes("timed out") ||
    normalizedReason.includes("network") ||
    normalizedReason.includes("tls")
  ) {
    return "environment-not-ready";
  }

  return "unknown";
}

function blockerNextAction(kind: CodingVerificationBlockerKind): string {
  switch (kind) {
    case "approval-denied":
      return "Re-run and approve escalation for verify command execution.";
    case "missing-command":
      return "Install or expose the verify command in PATH, then rerun verify.";
    case "environment-not-ready":
      return "Resolve environment/network readiness (dependencies, connectivity, shell), then rerun verify.";
    case "no-verify-strategy":
      return "Provide an explicit verify intent (test/build/check) so the workflow can select a command.";
    default:
      return "Inspect verify stderr and rerun with an explicit verification command.";
  }
}

function extractFencedContent(prompt: string): string | undefined {
  const match = prompt.match(/```(?:[\w.+-]+)?\n?([\s\S]*?)```/);
  const content = match?.[1]?.trim();
  return content && content.length > 0 ? content : undefined;
}

function buildRelocatedContinuationTargetAliases(input: {
  targetPath?: string;
  relocatedFromPath?: string;
}): string[] {
  const aliases: string[] = [];
  const seen = new Set<string>();
  const push = (candidate: string | undefined): void => {
    const normalized = normalizePathLike(candidate ?? "");
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    aliases.push(normalized);
  };
  push(input.targetPath);
  push(input.relocatedFromPath);
  return aliases;
}

function extractReplaceDirective(
  prompt: string,
): { from: string; to: string } | undefined {
  const zhWithPathMatch = prompt.match(
    /(?:\u628a|\u5c06)\s+.+?\s+\u91cc(?:\u7684)?\s+["'`]?(.+?)["'`]?\s*(?:\u66ff\u6362\u4e3a|\u6539\u6210|\u6539\u4e3a)\s*["'`]?([^"'`\uFF0C\u3002,\.\n\r]+)["'`]?/u,
  );
  if (zhWithPathMatch?.[1] && zhWithPathMatch?.[2]) {
    return { from: zhWithPathMatch[1], to: zhWithPathMatch[2] };
  }

  const zhMatch = prompt.match(
    /(?:\u628a|\u5c06)\s+["'`]?(.+?)["'`]?\s*(?:\u66ff\u6362\u4e3a|\u6539\u6210|\u6539\u4e3a)\s*["'`]?([^"'`\uFF0C\u3002,\.\n\r]+)["'`]?/u,
  );
  if (zhMatch?.[1] && zhMatch?.[2]) {
    return { from: zhMatch[1], to: zhMatch[2] };
  }

  const enMatch = prompt.match(
    /replac(?:e|ing)(?:\s+it)?\s+["'`]?(.+?)["'`]?\s+with\s+["'`]?(.+?)["'`]?(?:[.\u3002!\uFF01?\uFF1F]|$)/i,
  );
  if (enMatch?.[1] && enMatch?.[2]) {
    return { from: enMatch[1], to: enMatch[2] };
  }
  return undefined;
}

function inferReplaceDirectiveFromContinuity(
  continuity: ContinuityStateLike,
  preferredTarget?: string,
  preferredTargetAliases?: readonly string[],
): { from: string; to: string } | undefined {
  const canonicalTarget = preferredTarget
    ? normalizePathLike(preferredTarget)
    : undefined;
  const acceptedTargets = new Set<string>(
    (preferredTargetAliases ?? [])
      .map((candidate) => normalizePathLike(candidate))
      .filter((candidate) => candidate.length > 0),
  );
  if (canonicalTarget) {
    acceptedTargets.add(canonicalTarget);
  }
  for (const entry of continuity.lastContinuationEvidence ?? []) {
    const parsed = parseTransformEvidence(entry);
    if (!parsed) {
      continue;
    }
    if (
      acceptedTargets.size > 0 &&
      !acceptedTargets.has(normalizePathLike(parsed.path))
    ) {
      continue;
    }
    return { from: parsed.from, to: parsed.to };
  }
  return undefined;
}

function parseTransformEvidence(
  evidence: string,
): { path: string; from: string; to: string } | undefined {
  const match = evidence.match(/transform:([^:]+):(.+)=>(.+)$/i);
  if (!match?.[1] || !match?.[2] || !match?.[3]) {
    return undefined;
  }
  return {
    path: match[1].trim(),
    from: match[2].trim(),
    to: match[3].trim(),
  };
}

function collectContinuationTransforms(
  continuity: ContinuityStateLike,
  preferredTarget?: string,
  preferredTargetAliases?: readonly string[],
): ContinuationTransform[] {
  const canonicalTarget = preferredTarget
    ? normalizePathLike(preferredTarget)
    : undefined;
  const acceptedTargets = new Set<string>(
    (preferredTargetAliases ?? [])
      .map((candidate) => normalizePathLike(candidate))
      .filter((candidate) => candidate.length > 0),
  );
  if (canonicalTarget) {
    acceptedTargets.add(canonicalTarget);
  }
  const transforms: ContinuationTransform[] = [];
  for (const entry of continuity.lastContinuationEvidence ?? []) {
    const parsed = parseTransformEvidence(entry);
    if (!parsed) {
      continue;
    }
    const normalizedPath = normalizePathLike(parsed.path);
    if (acceptedTargets.size > 0 && !acceptedTargets.has(normalizedPath)) {
      continue;
    }
    transforms.push({
      path: canonicalTarget ?? normalizedPath,
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
    (item) => normalizePathLike(item.path) === targetPath && item.to.trim().length > 0,
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
      line !== avoidValue &&
      line.length <= 80 &&
      !/[{}()[\];]/.test(line),
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
    const fromBlock = lines.slice(blockRange.start, blockRange.end + 1).join("\n");
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

function extractAssignmentPair(raw: string): { key: string; value: string } | undefined {
  const match = raw.match(/^\s*([A-Za-z_][A-Za-z0-9_.-]*)\s*[:=]\s*["']?([^"'\s]+)["']?\s*$/);
  if (!match?.[1] || !match?.[2]) {
    return undefined;
  }
  return { key: match[1], value: match[2] };
}

function findAssignmentLine(
  lines: readonly string[],
  key: string,
): {
  index: number;
  line: string;
  value: string;
  match: RegExpMatchArray;
} | undefined {
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
      /^\s*(const|let|var)\s+[A-Za-z_][A-Za-z0-9_]*\s*=\s*(async\s*)?\(/.test(line) ||
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

function extractInlineWriteContent(prompt: string): string | undefined {
  const zhMatch = prompt.match(
    /(?:\u5199\u5165(?:\u4ee5\u4e0b)?\u5185\u5bb9|\u5185\u5bb9[:\uFF1A])\s*[:\uFF1A]?\s*(.+)$/u,
  );
  if (zhMatch?.[1]) {
    return zhMatch[1].trim();
  }

  const enMatch = prompt.match(/(?:write content|content:)\s*(.+)$/i);
  if (enMatch?.[1]) {
    return enMatch[1].trim();
  }

  return undefined;
}

function resolveMutationInstruction(
  plan: WorkflowTaskPlan,
  rawPrompt: string,
  originalContent: string | undefined,
  fencedContent: string | undefined,
  replaceDirective: { from: string; to: string } | undefined,
): { ok: true; content: string; changedLines: number; addedLines: number; removedLines: number } | { ok: false; reason: string } {
  if (plan.taskKind === "write-file") {
    const inlineContent = extractInlineWriteContent(rawPrompt);
    const resolvedContent = fencedContent ?? inlineContent;
    if (!resolvedContent) {
      return {
        ok: false,
        reason:
          "Write task needs concrete file content. Provide fenced code or '闁告劖鐟ラ崣鍡涘礃閸涱収鍟? ...'.",
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

  if (fencedContent) {
    const previous = originalContent ?? "";
    const delta = computeLineDelta(previous, fencedContent);
    return {
      ok: true,
      content: fencedContent,
      ...delta,
    };
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
    return {
      ok: false,
      reason:
        "Edit task needs either a fenced replacement content or an explicit replace-from/replace-to instruction.",
    };
  }

  if (typeof originalContent !== "string") {
    return {
      ok: false,
      reason: "Edit task requires inspect/read result before applying replace.",
    };
  }

  if (!originalContent.includes(replaceDirective.from)) {
    return {
      ok: false,
      reason: "Replace source text not found in target file.",
    };
  }

  const updated = originalContent.replace(replaceDirective.from, replaceDirective.to);
  if (updated === originalContent) {
    return {
      ok: false,
      reason: "Replace operation produced no effective change.",
    };
  }

  return {
    ok: true,
    content: updated,
    ...computeLineDelta(originalContent, updated),
  };
}

function isSafeReboundDirective(input: {
  readonly original: { from: string; to: string };
  readonly rebound: { from: string; to: string };
}): boolean {
  const from = input.rebound.from.trim();
  const to = input.rebound.to.trim();
  if (!from || !to) {
    return false;
  }
  if (from === to) {
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
  const originalTokenLike = !/\s/.test(input.original.from.trim());
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
    const reverted = lines[0]!.replace(replaceDirective.to, replaceDirective.from);
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

function buildCodingResult(
  taskKind: CodingTaskKind,
  input: {
    readonly changedFiles: string[];
    readonly failedFiles: Array<{ path: string; reason: string }>;
    readonly patches: CodingPatchRecord[];
    readonly verifiedFiles: string[];
    readonly unverifiedFiles: Array<{ path: string; reason: string }>;
    readonly verification: CodingVerificationSummary;
    readonly repairNotes: string[];
    readonly evidence: string[];
    readonly taskVerdict: "satisfied" | "completed-with-caveats" | "insufficient-evidence";
    readonly taskReasons: string[];
  },
): CodingResultSummary {
  const recoveredByContinuation =
    input.failedFiles.length === 0 &&
    input.changedFiles.length > 0 &&
    input.evidence.some((entry) => entry.startsWith("replan-transform:"));
  const attemptedFromEvidence = extractAttemptedFilesFromEvidence(input.evidence);
  const attemptedFiles = Array.from(
    new Set([
      ...attemptedFromEvidence,
      ...input.changedFiles,
      ...input.failedFiles.map((item) => item.path),
    ]),
  );

  return {
    taskKind,
    changedFiles: input.changedFiles,
    failedFiles: input.failedFiles,
    patches: input.patches,
    repair: {
      status:
        input.failedFiles.length > 0
          ? "failed"
          : recoveredByContinuation
            ? "recovered"
            : input.verification.status === "failed"
              ? "not-needed"
              : "not-needed",
      attempts: recoveredByContinuation ? 2 : 1,
      recoveredItems: recoveredByContinuation ? input.changedFiles : [],
      failedItems: input.failedFiles.map((entry) => entry.path),
      notes: input.repairNotes,
    },
    continuation: {
      status:
        input.failedFiles.length > 0
          ? "failed-after-bounded-continuation"
          : recoveredByContinuation
            ? "recovered-after-continuation"
            : "first-pass-success",
      attempts: recoveredByContinuation ? 2 : 1,
      evidence: input.evidence,
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles,
      changedFiles: input.changedFiles,
      unchangedAttemptedFiles: input.failedFiles.map((item) => item.path),
    },
    taskSatisfaction: {
      verdict: input.taskVerdict,
      reasons: input.taskReasons,
      requiredEvidence: ["inspect->edit->verify contract execution"],
      observedEvidence: input.evidence,
    },
    verifiedFiles: input.verifiedFiles,
    unverifiedFiles: input.unverifiedFiles,
    verification: input.verification,
    evidence: input.evidence,
    ...(input.failedFiles.length > 0
      ? { failureBoundary: input.failedFiles[0]?.reason ?? "workflow failed" }
      : {}),
  };
}

function extractAttemptedFilesFromEvidence(evidence: readonly string[]): string[] {
  const extracted = new Set<string>();
  const markerPatterns = [
    /^inspect:\s*read\s+(.+)$/i,
    /^repo-explain:\s*read\s+(.+)$/i,
    /^edit\/write applied on\s+(.+)$/i,
    /^mutation skipped due inspect failure on\s+(.+)$/i,
    /^repair-replan:blocker:([^:]+):/i,
    /^replan-transform:([^:]+):/i,
    /^transform:([^:]+):/i,
  ];
  for (const token of evidence) {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      continue;
    }
    for (const pattern of markerPatterns) {
      const match = normalizedToken.match(pattern);
      const candidate = match?.[1]?.trim();
      if (candidate && candidate !== "(unknown)" && candidate !== "(missing-target)") {
        extracted.add(normalizePathLike(candidate));
        break;
      }
    }
  }
  return Array.from(extracted);
}

function truncate(value: string, maxLength = 220): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function normalizePathLike(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/g, "").trim();
}

function stripPathTokensForIntent(prompt: string): string {
  return prompt
    .replace(/["'`](?:\.{1,2}[\\/]|[A-Za-z]:[\\/]|\/)[^"'`]+["'`]/g, " ")
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
):
  | {
      raw: string;
      cleaned: string;
      absolutePath: string;
      inWorkspace: boolean;
    }
  | null {
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

function detectCommand(normalizedPrompt: string): string {
  // Keep command mapping intentionally narrow for MVP controllability.
  if (normalizedPrompt.includes("version")) {
    return "node --version";
  }

  if (normalizedPrompt.includes("test")) {
    return "npm test -- --help";
  }

  if (normalizedPrompt.includes("build")) {
    return "npm run build -- --help";
  }

  return "node --version";
}

function detectUnsupportedCommandIntent(
  normalizedPrompt: string,
): string | null {
  if (normalizedPrompt.includes("publish")) {
    return "npm publish";
  }

  if (normalizedPrompt.includes("deploy")) {
    return "npm run deploy";
  }

  if (normalizedPrompt.includes("delete") || normalizedPrompt.includes("rm ")) {
    return "rm -rf";
  }

  if (normalizedPrompt.includes("curl") || normalizedPrompt.includes("wget")) {
    return "curl";
  }

  return null;
}

function isAllowlistedRunCommand(command: string): boolean {
  return RUN_COMMAND_ALLOWLIST.includes(
    command as (typeof RUN_COMMAND_ALLOWLIST)[number],
  );
}

function blockedCommandReason(command: string): string {
  return [
    `Run-command intent is not allowed in the MVP allowlist: ${command}`,
    `Allowed commands: ${RUN_COMMAND_ALLOWLIST.join(", ")}`,
    "Please rephrase your request to one of the allowed command intents.",
  ].join(" ");
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
            new Response(
              createSyntheticSseBody(draft),
              {
                status: 200,
                headers: { "content-type": "text/event-stream" },
              },
            ),
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
  const apiKey = realProvider?.apiKey?.trim() ?? process.env.OPENAI_API_KEY?.trim();
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
  const englishIntent =
    /\b(run|execute|command|bash|terminal)\b/i.test(normalizedPrompt);
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




