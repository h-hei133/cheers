import type { ContextPacketSourceSummary, TargetedContextPacket } from "./contextPacket.js";
import type { ContextAwareProviderEditInput } from "./contextAwareProviderEdit.js";
import { redactProviderEditText } from "./providerEditContext.js";

export interface ContextAwareProviderPromptContext {
  readonly requestId: string;
  readonly contextPacketId: string;
  readonly agentPlanId: string;
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
    `Agent Plan: ${agentPlanId}`,
    `Target: ${input.contextPacket.targetSafeLabel}`,
    `Target summary: ${redactProviderEditText(targetSource?.summary ?? input.editInput.targetSummary)}`,
    `Context completeness: ${input.editInput.contextCompleteness}`,
    `Plan confidence: ${input.editInput.planConfidence}`,
    `Missing facts: ${input.editInput.missingFacts.join("; ") || "none"}`,
    `Suggested reads: ${input.editInput.suggestedReads.join("; ") || "none"}`,
    `Suggested verification: ${input.editInput.suggestedVerification.join("; ") || "none"}`,
    `Omitted content: ${omittedContentReasons.join("; ") || "none"}`,
    "Return a bounded proposal only; mutation authority is not granted and changes must not be applied.",
  ];

  return {
    requestId: input.editInput.requestId,
    contextPacketId,
    agentPlanId,
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
    verificationExpectation: "review-before-apply",
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    providerPrompt: promptLines.join("\n"),
    evidence: [
      `context-aware-provider-prompt:context-packet:${contextPacketId}`,
      `context-aware-provider-prompt:agent-plan:${agentPlanId}`,
      "context-aware-provider-prompt:redacted-and-budgeted",
      "context-aware-provider-prompt:raw-full-content-excluded",
      "context-aware-provider-prompt:provider-config-excluded",
      "context-aware-provider-prompt:mutation-authority:not-granted",
    ],
  };
}
