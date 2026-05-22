import type { ContextPacketSourceSummary, TargetedContextPacket } from "./contextPacket.js";
import type { ContextAwareProviderEditInput } from "./contextAwareProviderEdit.js";
import { redactProviderEditText } from "./providerEditContext.js";

export interface ContextAwareProviderPromptContext {
  readonly requestId: string;
  readonly contextPacketId: string;
  readonly contextGraphId?: string;
  readonly agentPlanId: string;
  readonly taskLifecycleId?: string;
  readonly analysisBriefId?: string;
  readonly analysisQualityId?: string;
  readonly analysisQualityDecision?: string;
  readonly planQualityId?: string;
  readonly planQualityLevel?: string;
  readonly taskExecutionPlanId?: string;
  readonly userRequest: string;
  readonly targetSummary: string;
  readonly target: {
    readonly pathLabel: string;
    readonly summary: string;
  };
  readonly relatedContext: readonly {
    readonly kind: ContextPacketSourceSummary["kind"];
    readonly pathLabel: string;
    readonly relation: string;
    readonly summary: string;
  }[];
  readonly constraints: readonly string[];
  readonly nonGoals: readonly string[];
  readonly missingFacts: readonly string[];
  readonly suggestedReads: readonly string[];
  readonly suggestedVerification: readonly string[];
  readonly omittedContentReasons: readonly string[];
  readonly contextReadiness?: string;
  readonly testImpactSummary?: string;
  readonly codeGraphTraceId?: string;
  readonly impactQueryId?: string;
  readonly impactReadiness?: string;
  readonly impactSummary?: string;
  readonly analysisBriefSummary?: string;
  readonly executionPlanConstraints?: readonly string[];
  readonly verificationExpectation: "review-before-apply";
  readonly mutationAuthority: "not-granted";
  readonly redactionStatus: "redacted-and-budgeted";
  readonly providerPrompt: string;
  readonly evidence: readonly string[];
}

export function buildContextAwareProviderPrompt(input: {
  readonly editInput: ContextAwareProviderEditInput;
  readonly contextPacket: TargetedContextPacket;
  readonly userRequest: string;
  readonly constraints?: readonly string[];
  readonly nonGoals?: readonly string[];
  readonly maxRelatedContext?: number;
}): ContextAwareProviderPromptContext {
  const targetSource =
    input.contextPacket.selectedCandidateSummaries.find(
      (source) => source.kind === "target-file-summary",
    ) ?? input.contextPacket.selectedCandidateSummaries[0];
  const relatedContext = input.contextPacket.selectedCandidateSummaries
    .filter((source) => source !== targetSource)
    .slice(0, input.maxRelatedContext ?? 8)
    .map((source) => ({
      kind: source.kind,
      pathLabel: source.pathLabel,
      relation: redactProviderEditText(source.relation),
      summary: redactProviderEditText(source.summary ?? `${source.kind} included`),
    }));
  const omittedContentReasons = Array.from(
    new Set([
      ...input.editInput.omittedContentReasons,
      ...input.contextPacket.omittedCandidateSummaries.map(
        (source) => source.reason ?? source.kind,
      ),
    ]),
  ).map(redactProviderEditText);
  const contextPacketId = input.editInput.contextPacketId ?? input.contextPacket.packetId;
  const agentPlanId = input.editInput.agentPlanId ?? "(missing-agent-plan)";
  const promptLines = [
    "Create a review-only provider edit proposal from explicit context.",
    `Request: ${redactProviderEditText(input.userRequest)}`,
    `Context packet: ${contextPacketId}`,
    `Context graph: ${input.editInput.contextGraphId ?? "none"}`,
    `Code graph trace: ${input.editInput.codeGraphTraceId ?? "none"}`,
    `Impact query: ${input.editInput.impactQueryId ?? "none"}`,
    `Agent Plan: ${agentPlanId}`,
    `Task lifecycle: ${input.editInput.taskLifecycleId ?? "none"}`,
    `Analysis brief: ${input.editInput.analysisBriefId ?? "none"}`,
    `Analysis quality: ${input.editInput.analysisQualityGateId ?? "none"}`,
    `Plan quality: ${input.editInput.planQualityId ?? "none"}`,
    `Task execution plan: ${input.editInput.taskExecutionPlanId ?? "none"}`,
    `Target: ${input.contextPacket.targetSafeLabel}`,
    `Target summary: ${redactProviderEditText(targetSource?.summary ?? input.editInput.targetSummary)}`,
    `Context completeness: ${input.editInput.contextCompleteness}`,
    `Plan confidence: ${input.editInput.planConfidence}`,
    `Graph readiness: ${input.editInput.contextGraphReadiness ?? "none"}`,
    `Context coverage score: ${input.editInput.contextCoverageScore ?? "none"}`,
    `Test impact: ${input.editInput.testImpactSummary ?? "none"}`,
    `Code graph impact: ${input.editInput.impactSummary ?? "none"}`,
    `Impact readiness: ${input.editInput.impactReadiness ?? "none"}`,
    `Analysis brief summary: ${input.editInput.analysisBriefSummary ?? "none"}`,
    `Execution constraints: ${input.editInput.executionPlanConstraints?.join("; ") ?? "none"}`,
    `Missing facts: ${input.editInput.missingFacts.join("; ") || "none"}`,
    `Suggested reads: ${input.editInput.suggestedReads.join("; ") || "none"}`,
    `Suggested verification: ${input.editInput.suggestedVerification.join("; ") || "none"}`,
    `Omitted content: ${omittedContentReasons.join("; ") || "none"}`,
    "Return a bounded proposal only; mutation authority is not granted and changes must not be applied.",
  ];

  return {
    requestId: input.editInput.requestId,
    contextPacketId,
    ...(input.editInput.contextGraphId ? { contextGraphId: input.editInput.contextGraphId } : {}),
    agentPlanId,
    ...(input.editInput.taskLifecycleId ? { taskLifecycleId: input.editInput.taskLifecycleId } : {}),
    ...(input.editInput.analysisBriefId ? { analysisBriefId: input.editInput.analysisBriefId } : {}),
    ...(input.editInput.analysisQualityGateId ? { analysisQualityId: input.editInput.analysisQualityGateId } : {}),
    ...(input.editInput.analysisQualityGateDecision ? { analysisQualityDecision: input.editInput.analysisQualityGateDecision } : {}),
    ...(input.editInput.planQualityId ? { planQualityId: input.editInput.planQualityId } : {}),
    ...(input.editInput.planQualityLevel ? { planQualityLevel: input.editInput.planQualityLevel } : {}),
    ...(input.editInput.taskExecutionPlanId ? { taskExecutionPlanId: input.editInput.taskExecutionPlanId } : {}),
    userRequest: redactProviderEditText(input.userRequest),
    targetSummary: redactProviderEditText(input.editInput.targetSummary),
    target: {
      pathLabel: input.contextPacket.targetSafeLabel,
      summary: redactProviderEditText(targetSource?.summary ?? input.editInput.targetSummary),
    },
    relatedContext,
    constraints: (input.constraints ?? []).map(redactProviderEditText),
    nonGoals: (input.nonGoals ?? []).map(redactProviderEditText),
    missingFacts: input.editInput.missingFacts.map(redactProviderEditText),
    suggestedReads: input.editInput.suggestedReads.map(redactProviderEditText),
    suggestedVerification: input.editInput.suggestedVerification.map(
      redactProviderEditText,
    ),
    omittedContentReasons,
    ...(input.editInput.contextGraphReadiness ? { contextReadiness: input.editInput.contextGraphReadiness } : {}),
    ...(input.editInput.testImpactSummary ? { testImpactSummary: input.editInput.testImpactSummary } : {}),
    ...(input.editInput.codeGraphTraceId ? { codeGraphTraceId: input.editInput.codeGraphTraceId } : {}),
    ...(input.editInput.impactQueryId ? { impactQueryId: input.editInput.impactQueryId } : {}),
    ...(input.editInput.impactReadiness ? { impactReadiness: input.editInput.impactReadiness } : {}),
    ...(input.editInput.impactSummary ? { impactSummary: redactProviderEditText(input.editInput.impactSummary) } : {}),
    ...(input.editInput.analysisBriefSummary
      ? { analysisBriefSummary: redactProviderEditText(input.editInput.analysisBriefSummary) }
      : {}),
    ...(input.editInput.executionPlanConstraints
      ? {
          executionPlanConstraints: input.editInput.executionPlanConstraints.map(
            redactProviderEditText,
          ),
        }
      : {}),
    verificationExpectation: "review-before-apply",
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    providerPrompt: promptLines.join("\n"),
    evidence: [
      `context-aware-provider-prompt:context-packet:${contextPacketId}`,
      ...(input.editInput.contextGraphId
        ? [`context-aware-provider-prompt:context-graph:${input.editInput.contextGraphId}`]
        : []),
      ...(input.editInput.codeGraphTraceId
        ? [`context-aware-provider-prompt:code-graph-trace:${input.editInput.codeGraphTraceId}`]
        : []),
      ...(input.editInput.impactQueryId
        ? [`context-aware-provider-prompt:impact-query:${input.editInput.impactQueryId}`]
        : []),
      `context-aware-provider-prompt:agent-plan:${agentPlanId}`,
      ...(input.editInput.taskLifecycleId
        ? [`context-aware-provider-prompt:task-lifecycle:${input.editInput.taskLifecycleId}`]
        : []),
      ...(input.editInput.analysisBriefId
        ? [`context-aware-provider-prompt:analysis-brief:${input.editInput.analysisBriefId}`]
        : []),
      ...(input.editInput.analysisQualityGateId
        ? [`context-aware-provider-prompt:analysis-quality:${input.editInput.analysisQualityGateId}`]
        : []),
      ...(input.editInput.planQualityId
        ? [`context-aware-provider-prompt:plan-quality:${input.editInput.planQualityId}`]
        : []),
      ...(input.editInput.taskExecutionPlanId
        ? [`context-aware-provider-prompt:execution-plan:${input.editInput.taskExecutionPlanId}`]
        : []),
      "context-aware-provider-prompt:redacted-and-budgeted",
      "context-aware-provider-prompt:raw-full-content-excluded",
      "context-aware-provider-prompt:provider-config-excluded",
      "context-aware-provider-prompt:mutation-authority:not-granted",
    ],
  };
}
