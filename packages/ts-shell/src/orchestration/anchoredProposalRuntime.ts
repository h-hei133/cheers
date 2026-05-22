import { buildContextAwareProviderEditInput } from "./contextAwareProviderEdit.js";
import { buildContextAwareProviderPrompt } from "./contextAwareProviderPrompt.js";
import { buildHarnessScorecard, type HarnessScorecard } from "./harnessScorecard.js";
import { buildHarnessTrace, type HarnessTrace } from "./harnessTrace.js";
import { buildProviderDryRunResult } from "./providerDryRunResult.js";
import type { ProviderEditRawProposal } from "./providerEditProposal.js";
import type { ProviderEditAvailability } from "./providerEditPlanner.js";
import {
  buildAnchoredProviderProposalReview,
  type ProviderAnchoredProposalManifest,
} from "./providerAnchoredProposal.js";
import {
  activateAnchoredProposal,
  type AnchoredProposalActivation,
  type AnchoredProposalDryRunMode,
} from "./anchoredProposalActivation.js";
import { evaluateAnchoredProposal, type AnchoredProposalEval } from "./anchoredProposalEval.js";
import {
  buildAnchoredProposalScorecard,
  type AnchoredProposalScorecard,
} from "./anchoredProposalScorecard.js";
import {
  runRealProviderProposalDryRun,
  type RealProviderProposalDryRunProvider,
  type RealProviderProposalDryRunResult,
} from "./realProviderProposalDryRun.js";
import type { TaskLifecycleActivation } from "./taskLifecycleActivation.js";
import type { OrchestrationResult } from "./types.js";

export type AnchoredProposalRuntimeStatus =
  | "runtime-review-required-no-write"
  | "runtime-handoff-ready-no-write"
  | "runtime-stopped-no-write";

export interface AnchoredProposalRuntimeResult {
  readonly status: AnchoredProposalRuntimeStatus;
  readonly activation: AnchoredProposalActivation;
  readonly dryRun?: RealProviderProposalDryRunResult;
  readonly anchoredProposal?: ProviderAnchoredProposalManifest;
  readonly evalResult: AnchoredProposalEval;
  readonly scorecard: AnchoredProposalScorecard;
  readonly harnessTrace: HarnessTrace;
  readonly harnessScorecard: HarnessScorecard;
  readonly orchestrationResult?: OrchestrationResult;
  readonly changedFiles: readonly [];
  readonly mutationAuthority: "not-granted";
  readonly mutation: "not-run";
  readonly reason: string;
  readonly nextAction: string;
  readonly output: string;
  readonly evidence: readonly string[];
}

export async function runAnchoredProposalRuntime(input: {
  readonly requestId: string;
  readonly sessionId: string;
  readonly prompt: string;
  readonly taskActivation: TaskLifecycleActivation;
  readonly dryRunMode: AnchoredProposalDryRunMode;
  readonly providerAvailability?: ProviderEditAvailability;
  readonly provider?: RealProviderProposalDryRunProvider;
  readonly currentContentByTargetLabel?: ReadonlyMap<string, string>;
  readonly staleTargetLabels?: readonly string[];
  readonly inWorkspaceTargetLabels?: readonly string[];
}): Promise<AnchoredProposalRuntimeResult> {
  const bundle = input.taskActivation.contextBundle;
  const activation = activateAnchoredProposal({
    requestId: input.requestId,
    dryRunMode: input.dryRunMode,
    taskLifecycleId: input.taskActivation.taskLifecycle.lifecycleId,
    taskIntentId: input.taskActivation.taskIntent.taskId,
    contextPacketId: bundle?.packet.packetId,
    contextGraphId: bundle?.graph.graphId,
    codeGraphTraceId: bundle?.codeGraphTrace.traceId,
    analysisBriefId: input.taskActivation.analysisBrief.briefId,
    analysisQualityId: input.taskActivation.analysisQualityGate.gateId,
    analysisQualityDecision: input.taskActivation.analysisQualityGate.allowed ? "allow" : "stop",
    taskExecutionPlanId: input.taskActivation.taskExecutionPlan.executionPlanId,
    planQualityId: input.taskActivation.planQuality.qualityId,
    planQualityLevel: input.taskActivation.planQuality.level,
    providerAvailability: input.providerAvailability,
    redactionStatus: bundle?.packet.redactionStatus,
    supported: Boolean(bundle),
  });

  if (!activation.activated || !bundle) {
    return stoppedRuntime({ input, activation });
  }

  const editInput = buildContextAwareProviderEditInput({
    requestId: input.requestId,
    targetSummary: bundle.packet.targetSafeLabel,
    contextPacket: bundle.packet,
    contextGraph: bundle.graph,
    contextGraphScore: bundle.graphScore,
    testImpactPlan: bundle.testImpact,
    codeGraphImpact: bundle.codeGraphImpact,
    agentPlan: input.taskActivation.agentPlan,
    taskLifecycle: input.taskActivation.taskLifecycle,
    analysisBrief: input.taskActivation.analysisBrief,
    taskContextSufficiency: input.taskActivation.taskContextSufficiency,
    analysisQualityGate: input.taskActivation.analysisQualityGate,
    taskExecutionPlan: input.taskActivation.taskExecutionPlan,
    providerReadinessState: activation.providerSafeLabel ?? "fake-provider",
    allowReviewOnlyWithMissingContext: true,
  });
  const promptContext = buildContextAwareProviderPrompt({
    editInput,
    contextPacket: bundle.packet,
    userRequest: input.prompt,
    constraints: [
      "return bounded old/new anchors when possible",
      "do not apply changes",
      "do not include raw full file content",
    ],
    nonGoals: ["automatic mutation", "fuzzy apply", "provider call during apply"],
  });
  const availability =
    input.dryRunMode === "fake"
      ? { kind: "available" as const, providerKindLabel: "fake-provider" }
      : input.providerAvailability ?? { kind: "not-configured" as const, reason: "real provider dry-run adapter not supplied" };
  const provider = input.dryRunMode === "fake"
    ? input.provider ?? buildDeterministicFakeProvider(input.currentContentByTargetLabel)
    : input.provider;
  const dryRun = await runRealProviderProposalDryRun({
    requestId: input.requestId,
    dryRunOptIn: true,
    promptContext,
    explicitTargetLabels: [bundle.packet.targetSafeLabel],
    lifecycleId: input.taskActivation.taskLifecycle.lifecycleId,
    analysisBriefId: input.taskActivation.analysisBrief.briefId,
    analysisQualityId: input.taskActivation.analysisQualityGate.gateId,
    analysisQualityDecision: input.taskActivation.analysisQualityGate.allowed ? "allow" : "stop",
    planQualityId: input.taskActivation.planQuality.qualityId,
    planQualityLevel: input.taskActivation.planQuality.level,
    contextPacketId: bundle.packet.packetId,
    contextGraphId: bundle.graph.graphId,
    codeGraphTraceId: bundle.codeGraphTrace.traceId,
    taskExecutionPlanId: input.taskActivation.taskExecutionPlan.executionPlanId,
    providerAvailability: availability,
    redactionStatus: promptContext.redactionStatus,
    provider,
    currentContentByTargetLabel: input.currentContentByTargetLabel,
    staleTargetLabels: input.staleTargetLabels,
    inWorkspaceTargetLabels: input.inWorkspaceTargetLabels ?? [bundle.packet.targetSafeLabel],
  });
  const orchestrationResult = buildProviderDryRunResult({
    sessionId: input.sessionId,
    prompt: input.prompt,
    dryRun,
  });
  return completedRuntime({ input, activation, dryRun, orchestrationResult });
}

export function shouldActivateAnchoredProposalRuntimePrompt(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return /\b(?:anchored|anchor)\b/.test(normalized) &&
    /\b(?:proposal|dry-run|dry run|provider)\b/.test(normalized) &&
    /\b(?:fake|eval|evaluate|runtime)\b/.test(normalized);
}

function stoppedRuntime(input: {
  readonly input: {
    readonly taskActivation: TaskLifecycleActivation;
  };
  readonly activation: AnchoredProposalActivation;
}): AnchoredProposalRuntimeResult {
  const evalResult = evaluateAnchoredProposal({ activation: input.activation });
  const scorecard = buildAnchoredProposalScorecard({ activation: input.activation, evalResult });
  const harnessTrace = buildHarnessTrace({
    routeId: "route195-anchored-proposal-runtime",
    taskId: input.input.taskActivation.taskIntent.taskId,
    taskLifecycleId: input.input.taskActivation.taskLifecycle.lifecycleId,
    analysisBriefId: input.input.taskActivation.analysisBrief.briefId,
    taskExecutionPlanId: input.input.taskActivation.taskExecutionPlan.executionPlanId,
    agentPlanId: input.input.taskActivation.agentPlan.planId,
    planQualityId: input.input.taskActivation.planQuality.qualityId,
    providerAnchoringAttempted: false,
    providerDryRunCalled: false,
    status: input.activation.decision,
    reason: input.activation.reason,
    evidence: [...input.activation.evidence, ...evalResult.evidence, ...scorecard.evidence],
  });
  const harnessScorecard = buildHarnessScorecard({
    planQuality: input.input.taskActivation.planQuality,
    trace: harnessTrace,
    providerProposalReady: false,
    resultTruthful: true,
    continuationReady: true,
  });
  const evidence = [
    ...input.activation.evidence,
    ...evalResult.evidence,
    ...scorecard.evidence,
    ...harnessTrace.evidence,
    ...harnessScorecard.evidence,
    "anchored-proposal-runtime:status:runtime-stopped-no-write",
    "anchored-proposal-runtime:mutation:not-run",
    "anchored-proposal-runtime:mutation-authority:not-granted",
    "anchored-proposal-runtime:raw-content-excluded",
  ];
  const output = formatRuntimeOutput({
    activation: input.activation,
    evalResult,
    scorecard,
    reason: input.activation.reason,
    nextAction: input.activation.nextAction,
  });
  return {
    status: "runtime-stopped-no-write",
    activation: input.activation,
    evalResult,
    scorecard,
    harnessTrace,
    harnessScorecard,
    changedFiles: [],
    mutationAuthority: "not-granted",
    mutation: "not-run",
    reason: input.activation.reason,
    nextAction: input.activation.nextAction,
    output,
    evidence,
  };
}

function completedRuntime(input: {
  readonly input: {
    readonly taskActivation: TaskLifecycleActivation;
  };
  readonly activation: AnchoredProposalActivation;
  readonly dryRun: RealProviderProposalDryRunResult;
  readonly orchestrationResult: OrchestrationResult;
}): AnchoredProposalRuntimeResult {
  const anchoredProposal = input.dryRun.anchoredProposal;
  const evalResult = evaluateAnchoredProposal({ activation: input.activation, dryRun: input.dryRun });
  const review = anchoredProposal ? buildAnchoredProviderProposalReview(anchoredProposal) : undefined;
  const harnessTrace = buildHarnessTrace({
    routeId: "route195-anchored-proposal-runtime",
    taskId: input.input.taskActivation.taskIntent.taskId,
    taskLifecycleId: input.input.taskActivation.taskLifecycle.lifecycleId,
    analysisBriefId: input.input.taskActivation.analysisBrief.briefId,
    taskExecutionPlanId: input.input.taskActivation.taskExecutionPlan.executionPlanId,
    contextPacketId: input.input.taskActivation.contextBundle?.packet.packetId,
    contextGraphId: input.input.taskActivation.contextBundle?.graph.graphId,
    agentPlanId: input.input.taskActivation.agentPlan.planId,
    planQualityId: input.input.taskActivation.planQuality.qualityId,
    providerProposalId: "manifest" in input.dryRun ? input.dryRun.manifest.proposalId : undefined,
    providerDryRunId: input.dryRun.dryRunId,
    providerDryRunGateDecision: input.dryRun.gate.decision,
    providerPromptAuditStatus: input.dryRun.promptAudit?.status,
    providerOutputValidationStatus: input.dryRun.outputValidation?.status,
    providerAnchorQualityLevel: input.dryRun.anchorQuality?.level,
    providerAnchoringAttempted: Boolean(input.dryRun.anchoringResult),
    providerAnchoringOutcome: input.dryRun.anchoringResult?.status,
    providerAnchoredProposalId: anchoredProposal?.anchoredProposalId,
    providerAnchoringExactness: anchoredProposal?.handoffReadiness,
    providerAnchoringReviewReadiness: anchoredProposal?.reviewRequirement,
    providerAnchoringNoWrite: input.dryRun.anchoringResult?.noWrite,
    providerDryRunCalled: input.dryRun.providerCalled,
    status: input.dryRun.status,
    reason: input.dryRun.reason,
    evidence: input.dryRun.evidence,
  });
  const harnessScorecard = buildHarnessScorecard({
    planQuality: input.input.taskActivation.planQuality,
    trace: harnessTrace,
    providerProposalReady: anchoredProposal?.handoffReadiness === "exact-single-target" ||
      anchoredProposal?.handoffReadiness === "exact-hunk-set",
    providerDryRun: {
      promptAuditStatus: input.dryRun.promptAudit?.status,
      outputValidationStatus: input.dryRun.outputValidation?.status,
      anchorQualityLevel: input.dryRun.anchorQuality?.level,
      anchoringOutcome: input.dryRun.anchoringResult?.status,
      anchoredProposalId: anchoredProposal?.anchoredProposalId,
      anchoringReviewReadiness: anchoredProposal?.reviewRequirement,
      anchoringNoWrite: input.dryRun.anchoringResult?.noWrite,
      redactionStatus: input.dryRun.anchoringResult?.redactionStatus ?? "raw-content-excluded",
      noWrite: input.dryRun.mutation === "not-run" && input.dryRun.changedFiles.length === 0,
    },
    resultTruthful: true,
    continuationReady: true,
  });
  const scorecard = buildAnchoredProposalScorecard({
    activation: input.activation,
    dryRun: input.dryRun,
    evalResult,
    failureClass: harnessTrace.failureTaxonomy.failureClass,
  });
  const status =
    anchoredProposal?.handoffReadiness === "exact-single-target" ||
    anchoredProposal?.handoffReadiness === "exact-hunk-set"
      ? "runtime-handoff-ready-no-write"
      : "runtime-review-required-no-write";
  const evidence = [
    ...input.activation.evidence,
    ...input.dryRun.evidence,
    ...(review?.evidence ?? []),
    ...evalResult.evidence,
    ...scorecard.evidence,
    ...harnessTrace.evidence,
    ...harnessScorecard.evidence,
    `anchored-proposal-runtime:status:${status}`,
    "anchored-proposal-runtime:review-required",
    "anchored-proposal-runtime:mutation:not-run",
    "anchored-proposal-runtime:mutation-authority:not-granted",
    "anchored-proposal-runtime:provider-call-during-apply:not-run",
    "anchored-proposal-runtime:raw-content-excluded",
  ];
  const output = formatRuntimeOutput({
    activation: input.activation,
    dryRun: input.dryRun,
    evalResult,
    scorecard,
    reason: input.dryRun.reason,
    nextAction: input.dryRun.nextAction,
  });
  return {
    status,
    activation: input.activation,
    dryRun: input.dryRun,
    ...(anchoredProposal ? { anchoredProposal } : {}),
    evalResult,
    scorecard,
    harnessTrace,
    harnessScorecard,
    orchestrationResult: {
      ...input.orchestrationResult,
      finalOutput: output,
      codingResult: input.orchestrationResult.codingResult
        ? {
            ...input.orchestrationResult.codingResult,
            evidence,
            continuation: {
              ...input.orchestrationResult.codingResult.continuation,
              evidence,
            },
            taskSatisfaction: {
              ...input.orchestrationResult.codingResult.taskSatisfaction,
              observedEvidence: evidence,
            },
          }
        : input.orchestrationResult.codingResult,
    },
    changedFiles: [],
    mutationAuthority: "not-granted",
    mutation: "not-run",
    reason: input.dryRun.reason,
    nextAction: input.dryRun.nextAction,
    output,
    evidence,
  };
}

function buildDeterministicFakeProvider(
  currentContentByTargetLabel: ReadonlyMap<string, string> | undefined,
): RealProviderProposalDryRunProvider {
  return {
    proposeEdit: (context): ProviderEditRawProposal => {
      const current = currentContentByTargetLabel?.get(context.target.pathLabel);
      const oldText = firstAnchorLine(current) ?? context.target.pathLabel;
      return {
        operationKind: "exact-fenced-replacement",
        targets: [
          {
            path: context.target.pathLabel,
            summary: "deterministic fake anchored proposal",
            oldText,
            newText: `${oldText} // anchored proposal`,
          },
        ],
        verificationPlan: context.suggestedVerification,
      };
    },
  };
}

function firstAnchorLine(content: string | undefined): string | undefined {
  return content?.split(/\r?\n/).find((line) => line.trim().length > 0)?.slice(0, 200);
}

function formatRuntimeOutput(input: {
  readonly activation: AnchoredProposalActivation;
  readonly dryRun?: RealProviderProposalDryRunResult;
  readonly evalResult: AnchoredProposalEval;
  readonly scorecard: AnchoredProposalScorecard;
  readonly reason: string;
  readonly nextAction: string;
}): string {
  return [
    "anchored proposal runtime evaluated; mutation did not run.",
    `Activation: ${input.activation.activationId}`,
    `Activation decision: ${input.activation.decision}`,
    `Dry-run mode: ${input.activation.dryRunMode}`,
    `Dry-run: ${input.dryRun?.dryRunId ?? "(none)"}`,
    `Provider called: ${input.dryRun?.providerCalled ? "yes" : "no"}`,
    `Prompt audit: ${input.dryRun?.promptAudit?.status ?? "none"}`,
    `Output validation: ${input.dryRun?.outputValidation?.status ?? "none"}`,
    `Anchor quality: ${input.dryRun?.anchorQuality?.level ?? "none"}`,
    `Anchored proposal: ${input.dryRun?.anchoredProposal?.anchoredProposalId ?? "(none)"}`,
    `Review requirement: ${input.dryRun?.anchoredProposal?.reviewRequirement ?? "none"}`,
    `Handoff readiness: ${input.dryRun?.anchoredProposal?.handoffReadiness ?? "none"}`,
    `Eval: ${input.evalResult.overall}`,
    `Scorecard: ${input.scorecard.scorecardId}`,
    `Reason: ${input.reason}`,
    `Next: ${input.nextAction}`,
    "Mutation authority: not granted",
    "Raw content: excluded",
  ].join("\n");
}
