import type { ContextPlanningBlockSummary } from "../../context/acquisition/summary.js";
import type { ContinuationReadinessProjection } from "../../session/continuation/readiness.js";
import type { NextTurnBundleProjection } from "../../turn/nextTurnBundle.js";
import type { ProviderRegistryProjection } from "../registry/provider.js";

export type ModelRequestReadinessStatus =
  | "ready"
  | "blocked_missing_required_facts"
  | "blocked_provider_not_ready"
  | "review_only"
  | "not_proven";

export interface ModelRequestBoundaryInput {
  readonly requestId: string;
  readonly turnId?: string;
  readonly loopId?: string;
  readonly providerId?: string;
  readonly providerMode?: "synthetic" | "real" | "default";
  readonly providerSafeLabel?: string;
  readonly modelSafeLabel?: string;
  readonly providerReadinessStatus?: "ready" | "missing" | "blocked" | "unknown";
  readonly providerRegistry?: ProviderRegistryProjection;
  readonly contextPlanningSummary?: ContextPlanningBlockSummary;
  readonly continuationReadiness?: ContinuationReadinessProjection;
  readonly planningConstraints?: readonly string[];
  readonly noWriteStatus?: string;
  readonly missingRequiredFacts?: readonly string[];
  readonly missingOptionalFacts?: readonly string[];
  readonly notProvenClaims?: readonly string[];
}

export interface ModelRequestBoundary {
  readonly requestId: string;
  readonly turnId?: string;
  readonly loopId?: string;
  readonly providerId?: string;
  readonly providerSafeLabel: string;
  readonly modelSafeLabel: string;
  readonly providerMode: "synthetic" | "real" | "default";
  readonly readinessStatus: ModelRequestReadinessStatus;
  readonly providerReadinessStatus: "ready" | "missing" | "blocked" | "unknown";
  readonly providerDefaultEnablement: "disabled";
  readonly providerRequiresExplicitOptIn: true;
  readonly registryProviderCount: number;
  readonly registryModelCount: number;
  readonly contextPlanningSummaryId?: string;
  readonly contextPlanningStatus?: string;
  readonly continuationReadinessId?: string;
  readonly continuationReadinessStatus?: ContinuationReadinessProjection["status"];
  readonly continuationContextReadinessStatus?: ContinuationReadinessProjection["contextReadinessStatus"];
  readonly planningConstraints: readonly string[];
  readonly noWriteStatus: string;
  readonly mutationAuthority: "not-granted";
  readonly missingRequiredFacts: readonly string[];
  readonly missingOptionalFacts: readonly string[];
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export type NextTurnRequestReadinessStatus =
  | "ready_for_explicit_model_invocation"
  | "ready_with_partial_tool_results"
  | "blocked_by_policy"
  | "blocked_by_authority"
  | "blocked_by_failed_tool"
  | "blocked_by_missing_context"
  | "blocked_by_provider_unavailable"
  | "blocked_by_redaction"
  | "unsupported"
  | "not_ready";

export interface NextTurnRequestInputMessage {
  readonly messageId: string;
  readonly source: "system" | "task" | "tool-result" | "steering" | "follow-up" | "continuation";
  readonly safeSummary: string;
  readonly terminalSuccessClaim: false;
}

export interface NextTurnRequestProviderMetadata {
  readonly providerSafeLabel: string;
  readonly modelSafeLabel: string;
  readonly providerOptInState: "required" | "not-granted";
  readonly authReadiness: "resolved" | "missing" | "expired" | "unsupported" | "unknown";
  readonly configReadiness: string;
  readonly compatibilityState: string;
  readonly compatibilityFlags: readonly string[];
  readonly supportedModes: readonly string[];
  readonly knownUnsupportedStates: readonly string[];
  readonly streamingCapability: string;
  readonly fallbackProviderSafeLabel?: string;
  readonly fallbackModelSafeLabel?: string;
  readonly fallbackEligibleFailureClasses: readonly string[];
  readonly fallbackIneligibleFailureClasses: readonly string[];
  readonly missingProviderFacts: readonly string[];
  readonly fallbackMetadata: readonly string[];
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

export interface NextTurnModelRequestPreparation {
  readonly requestPreparationId: string;
  readonly sourceNextTurnBundleId: string;
  readonly modelRequestBoundaryId: string;
  readonly includedToolResultMessageIds: readonly string[];
  readonly excludedMessageIds: readonly string[];
  readonly exclusionReasons: readonly string[];
  readonly steeringIds: readonly string[];
  readonly followUpIds: readonly string[];
  readonly contextConstraintIds: readonly string[];
  readonly planningConstraintIds: readonly string[];
  readonly continuationReadinessId?: string;
  readonly continuationReadinessStatus?: ContinuationReadinessProjection["status"];
  readonly continuationBlockedReasons: readonly string[];
  readonly providerMetadataId?: string;
  readonly modelMetadataId?: string;
  readonly readinessStatus: NextTurnRequestReadinessStatus;
  readonly blockedReasons: readonly string[];
  readonly providerMetadata: NextTurnRequestProviderMetadata;
  readonly safeRequestMessages: readonly NextTurnRequestInputMessage[];
  readonly redaction: {
    readonly status: "report-safe" | "redacted";
    readonly excluded: readonly string[];
  };
  readonly notProvenClaims: readonly string[];
  readonly terminalSuccessClaim: false;
}

const REDACTION_EXCLUSIONS = [
  "api-keys",
  "provider.env",
  "auth-headers",
  "raw-provider-output",
  "oldText",
  "newText",
  "unredacted-command-output",
  "hidden-reasoning",
  "full-transcript",
  "unsafe-file-contents",
] as const;

export function createModelRequestBoundary(
  input: ModelRequestBoundaryInput,
): ModelRequestBoundary {
  const redactions = new Set<string>();
  const continuationMissing = continuationMissingFacts(input.continuationReadiness)
    .map((item) => sanitizeText(item, redactions));
  const continuationConstraints = continuationPlanningConstraints(input.continuationReadiness)
    .map((item) => sanitizeText(item, redactions));
  const requiredMissing = unique([
    ...(input.contextPlanningSummary?.acquisition.requiredMissingFacts ?? []),
    ...(input.missingRequiredFacts ?? []),
    ...continuationMissing,
  ].map((item) => sanitizeText(item, redactions)));
  const optionalMissing = unique([
    ...(input.contextPlanningSummary?.acquisition.optionalMissingFacts ?? []),
    ...(input.missingOptionalFacts ?? []),
  ].map((item) => sanitizeText(item, redactions)));
  const constraints = unique([
    ...(input.contextPlanningSummary?.planning.constraints ?? []),
    ...(input.planningConstraints ?? []),
    ...continuationConstraints,
  ].map((item) => sanitizeText(item, redactions)));
  const providerReadinessStatus = input.providerReadinessStatus ?? "unknown";
  const noWriteStatus = sanitizeText(
    input.noWriteStatus ??
      input.contextPlanningSummary?.handoff.editNoWriteStatus ??
      "no-write-authority-granted",
    redactions,
  );

  return deepFreeze({
    requestId: sanitizeText(input.requestId || "model-request-unavailable", redactions),
    ...(input.turnId ? { turnId: sanitizeText(input.turnId, redactions) } : {}),
    ...(input.loopId ? { loopId: sanitizeText(input.loopId, redactions) } : {}),
    ...(input.providerId ? { providerId: sanitizeText(input.providerId, redactions) } : {}),
    providerSafeLabel: sanitizeText(input.providerSafeLabel ?? "provider-not-selected", redactions),
    modelSafeLabel: sanitizeText(input.modelSafeLabel ?? "model-not-selected", redactions),
    providerMode: input.providerMode ?? "default",
    readinessStatus: selectReadinessStatus({
      providerReadinessStatus,
      requiredMissingCount: requiredMissing.length,
      noWriteStatus,
    }),
    providerReadinessStatus,
    providerDefaultEnablement: "disabled",
    providerRequiresExplicitOptIn: true,
    registryProviderCount: input.providerRegistry?.providers.length ?? 0,
    registryModelCount: input.providerRegistry?.models.length ?? 0,
    ...(input.contextPlanningSummary
      ? {
          contextPlanningSummaryId: sanitizeText(input.contextPlanningSummary.summaryId, redactions),
          contextPlanningStatus: input.contextPlanningSummary.status,
        }
      : {}),
    ...(input.continuationReadiness
      ? {
          continuationReadinessId: sanitizeText(input.continuationReadiness.readinessId, redactions),
          continuationReadinessStatus: input.continuationReadiness.status,
          continuationContextReadinessStatus: input.continuationReadiness.contextReadinessStatus,
        }
      : {}),
    planningConstraints: Object.freeze(constraints),
    noWriteStatus,
    mutationAuthority: "not-granted",
    missingRequiredFacts: Object.freeze(requiredMissing),
    missingOptionalFacts: Object.freeze(optionalMissing),
    redaction: {
      status: redactions.size > 0 ||
          input.providerRegistry?.redaction.status === "redacted"
        ? "redacted"
        : "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
    notProvenClaims: unique([
      "model-request-prepared-is-not-provider-success",
      "provider-readiness-is-not-provider-success",
      "provider-called-is-not-provider-success",
      "cp-plan-handoff-is-not-mutation-authority",
      "request-ready-is-not-task-success",
      "fallback-eligible-is-not-fallback-executed",
      "continuation-readiness-is-not-provider-success",
      "continuation-readiness-is-not-task-success",
      "terminal-success",
      ...(input.providerRegistry?.notProvenClaims ?? []),
      ...(input.contextPlanningSummary?.notProvenClaims ?? []),
      ...(input.continuationReadiness?.notProvenClaims ?? []),
      ...(input.notProvenClaims ?? []),
    ]),
    terminalSuccessClaim: false,
  });
}

export function prepareNextTurnModelRequest(input: {
  readonly nextTurnBundle: NextTurnBundleProjection;
  readonly modelRequestBoundary: ModelRequestBoundary;
  readonly providerRegistry?: ProviderRegistryProjection;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly continuationReadiness?: ContinuationReadinessProjection;
  readonly instructionSummary?: string;
  readonly taskSummary?: string;
  readonly contextConstraintIds?: readonly string[];
  readonly planningConstraintIds?: readonly string[];
  readonly notProvenClaims?: readonly string[];
}): NextTurnModelRequestPreparation {
  const redactions = new Set<string>();
  const providerMatch = input.providerId
    ? input.providerRegistry?.providers.find((candidate) => candidate.providerId === input.providerId)
    : input.providerRegistry?.providers.find((candidate) =>
      candidate.safeLabel === input.modelRequestBoundary.providerSafeLabel
    );
  const provider = providerMatch ?? (input.providerId ? undefined : input.providerRegistry?.providers[0]);
  const modelMatch = input.modelId
    ? input.providerRegistry?.models.find((candidate) => candidate.modelId === input.modelId)
    : input.providerRegistry?.models.find((candidate) =>
      candidate.safeLabel === input.modelRequestBoundary.modelSafeLabel ||
      candidate.providerId === provider?.providerId
    );
  const model = modelMatch ?? (input.modelId ? undefined : input.providerRegistry?.models[0]);
  const auth = input.providerRegistry?.auth.find((candidate) =>
    candidate.providerId === provider?.providerId
  );
  const fallbackProvider = input.providerRegistry?.providers.find((candidate) =>
    candidate.providerId === provider?.fallbackPolicy?.fallbackProviderId
  );
  const fallbackModel = input.providerRegistry?.models.find((candidate) =>
    candidate.providerId === fallbackProvider?.providerId
  );
  const providerMetadata = createProviderMetadata({
    boundary: input.modelRequestBoundary,
    providerRegistry: input.providerRegistry,
    provider,
    model,
    auth,
    fallbackProvider,
    fallbackModel,
    redactions,
  });
  const safeMessages = createSafeRequestMessages({
    bundle: input.nextTurnBundle,
    continuationReadiness: input.continuationReadiness,
    instructionSummary: input.instructionSummary,
    taskSummary: input.taskSummary,
    redactions,
  });
  const continuationBlockedReasons = continuationRequestBlockers({
    boundary: input.modelRequestBoundary,
    continuationReadiness: input.continuationReadiness,
    redactions,
  });
  const excludedMessageIds = unique([
    ...input.nextTurnBundle.excludedToolResultMessageIds,
    ...(input.nextTurnBundle.redaction.status === "redacted" &&
        input.nextTurnBundle.includedToolResultMessageIds.length === 0
      ? input.nextTurnBundle.sourceToolResultMessageIds
      : []),
  ].map((value) => sanitizeText(value, redactions)));
  const exclusionReasons = unique([
    ...input.nextTurnBundle.messageExclusionReasons,
    ...continuationBlockedReasons,
    ...(excludedMessageIds.length > 0 && input.nextTurnBundle.messageExclusionReasons.length === 0
      ? ["message-excluded:redaction"]
      : []),
  ].map((value) => sanitizeText(value, redactions)));
  const blockedReasons = blockedRequestReasons({
    bundle: input.nextTurnBundle,
    boundary: input.modelRequestBoundary,
    providerMetadata,
    excludedMessageIds,
    continuationBlockedReasons,
    redactionStatus: redactions.size > 0 || input.nextTurnBundle.redaction.status === "redacted"
      ? "redacted"
      : "report-safe",
  });
  const readinessStatus = requestReadiness({
    bundle: input.nextTurnBundle,
    boundary: input.modelRequestBoundary,
    blockedReasons,
    providerMetadata,
    excludedMessageIds,
  });

  return deepFreeze({
    requestPreparationId: sanitizeText(
      `next-turn-request:${input.nextTurnBundle.bundleId}`,
      redactions,
    ),
    sourceNextTurnBundleId: sanitizeText(input.nextTurnBundle.bundleId, redactions),
    modelRequestBoundaryId: sanitizeText(input.modelRequestBoundary.requestId, redactions),
    includedToolResultMessageIds: Object.freeze(
      input.nextTurnBundle.includedToolResultMessageIds.map((id) => sanitizeText(id, redactions)),
    ),
    excludedMessageIds: Object.freeze(excludedMessageIds),
    exclusionReasons: Object.freeze(exclusionReasons),
    steeringIds: Object.freeze(
      input.nextTurnBundle.steeringMessageIds.map((id) => sanitizeText(id, redactions)),
    ),
    followUpIds: Object.freeze(
      input.nextTurnBundle.followUpMessageIds.map((id) => sanitizeText(id, redactions)),
    ),
    contextConstraintIds: Object.freeze(
      (input.contextConstraintIds ?? []).map((id) => sanitizeText(id, redactions)),
    ),
    planningConstraintIds: Object.freeze(
      (input.planningConstraintIds ?? input.modelRequestBoundary.planningConstraints)
        .map((id) => sanitizeText(id, redactions)),
    ),
    ...(input.continuationReadiness ?? input.modelRequestBoundary.continuationReadinessId
      ? {
          continuationReadinessId: sanitizeText(
            input.continuationReadiness?.readinessId ??
              input.modelRequestBoundary.continuationReadinessId ?? "",
            redactions,
          ),
          continuationReadinessStatus:
            input.continuationReadiness?.status ??
            input.modelRequestBoundary.continuationReadinessStatus,
        }
      : {}),
    continuationBlockedReasons: Object.freeze(continuationBlockedReasons),
    ...(provider ? { providerMetadataId: sanitizeText(provider.providerId, redactions) } : {}),
    ...(model ? { modelMetadataId: sanitizeText(model.modelId, redactions) } : {}),
    readinessStatus,
    blockedReasons: Object.freeze(blockedReasons),
    providerMetadata,
    safeRequestMessages: Object.freeze(safeMessages),
    redaction: {
      status: redactions.size > 0 ||
          input.nextTurnBundle.redaction.status === "redacted" ||
          input.modelRequestBoundary.redaction.status === "redacted" ||
          input.providerRegistry?.redaction.status === "redacted"
        ? "redacted"
        : "report-safe",
      excluded: REDACTION_EXCLUSIONS,
    },
    notProvenClaims: unique([
      "next-turn-ready-is-not-provider-call",
      "request-prepared-is-not-provider-call",
      "provider-metadata-is-not-provider-success",
      "opt-in-available-is-not-opt-in-granted",
      "safe-message-prepared-is-not-model-response",
      "product-surface-rendered-is-not-success",
      "continuation-readiness-is-not-provider-call",
      "continuation-readiness-is-not-task-success",
      "terminal-success",
      ...input.nextTurnBundle.notProvenClaims,
      ...input.modelRequestBoundary.notProvenClaims,
      ...(input.continuationReadiness?.notProvenClaims ?? []),
      ...providerMetadata.notProvenClaims,
      ...(input.providerRegistry?.notProvenClaims ?? []),
      ...(input.notProvenClaims ?? []),
    ]),
    terminalSuccessClaim: false,
  });
}

function createProviderMetadata(input: {
  readonly boundary: ModelRequestBoundary;
  readonly providerRegistry?: ProviderRegistryProjection;
  readonly provider?: ProviderRegistryProjection["providers"][number];
  readonly model?: ProviderRegistryProjection["models"][number];
  readonly auth?: ProviderRegistryProjection["auth"][number];
  readonly fallbackProvider?: ProviderRegistryProjection["providers"][number];
  readonly fallbackModel?: ProviderRegistryProjection["models"][number];
  readonly redactions: Set<string>;
}): NextTurnRequestProviderMetadata {
  const compatibility = input.model?.compatibility ?? input.provider?.compatibility;
  const matrixEntry = input.providerRegistry?.compatibilityMatrix.find((entry) =>
    entry.providerId === input.provider?.providerId &&
      (!input.model || entry.modelId === input.model.modelId)
  );
  const readinessEntry = input.providerRegistry?.readinessMatrix.find((entry) =>
    entry.providerId === input.provider?.providerId &&
      (!input.model || entry.modelId === input.model.modelId)
  );
  const flags = compatibility
    ? [
        `toolCalls:${compatibility.toolCalls}`,
        `parallelToolCalls:${compatibility.parallelToolCalls}`,
        `structuredJsonOutput:${compatibility.structuredJsonOutput}`,
        `streaming:${compatibility.streaming}`,
        `strictMessageRoles:${compatibility.strictMessageRoles}`,
      ]
    : [];
  const fallback = input.provider?.fallbackPolicy
    ? [
        ...(input.provider.fallbackPolicy.fallbackProviderId
          ? [`fallbackProviderId:${input.provider.fallbackPolicy.fallbackProviderId}`]
          : []),
        `executesFallback:${input.provider.fallbackPolicy.executesFallback}`,
        `requiresExplicitOptIn:${input.provider.fallbackPolicy.requiresExplicitOptIn}`,
        `retryRelation:${input.provider.fallbackPolicy.retryRelation}`,
        `eligibleFailureClasses:${input.provider.fallbackPolicy.eligibleFailureClasses.join(",") || "none"}`,
        `ineligibleFailureClasses:${input.provider.fallbackPolicy.ineligibleFailureClasses.join(",") || "none"}`,
      ]
    : [];
  const unsupportedCompatibilityFacts = compatibility
    ? [
        ...(compatibility.streaming === "unsupported" ? ["unsupported-model-mode:streaming"] : []),
        ...(compatibility.toolCalls === "unsupported" ? ["unsupported-model-mode:tool-calls"] : []),
        ...(compatibility.strictMessageRoles === "unsupported"
          ? ["unsupported-model-mode:message-roles"]
          : []),
        ...(compatibility.structuredJsonOutput === "unsupported"
          ? ["unsupported-model-mode:structured-output"]
          : []),
      ]
    : [];
  const missingProviderFacts = unique([
    ...(input.provider ? [] : ["provider-metadata-missing"]),
    ...(input.model ? [] : ["model-metadata-missing"]),
    ...(input.auth ? [] : ["auth-projection-missing"]),
    ...(input.auth && input.auth.resolutionStatus !== "resolved"
      ? [`auth-readiness:${input.auth.resolutionStatus}`]
      : []),
    ...(readinessEntry && readinessEntry.configState !== "opt-in-required" &&
        readinessEntry.configState !== "auth-redacted-present"
      ? [`config-readiness:${readinessEntry.configState}`]
      : []),
    ...(matrixEntry?.state === "unsupported" ? [`compatibility-state:${matrixEntry.state}`] : []),
    ...(matrixEntry?.knownUnsupportedStates ?? []),
    ...(readinessEntry?.blockers.filter((blocker) => blocker !== "opt-in-required") ?? []),
    ...unsupportedCompatibilityFacts,
    ...(input.boundary.providerReadinessStatus === "ready" ? [] : [
      `provider-readiness:${input.boundary.providerReadinessStatus}`,
    ]),
  ].map((value) => sanitizeText(value, input.redactions)));

  return deepFreeze({
    providerSafeLabel: sanitizeText(
      input.provider?.safeLabel ?? input.boundary.providerSafeLabel,
      input.redactions,
    ),
    modelSafeLabel: sanitizeText(
      input.model?.safeLabel ?? input.boundary.modelSafeLabel,
      input.redactions,
    ),
    providerOptInState: "required",
    authReadiness: input.auth?.resolutionStatus ?? "unknown",
    configReadiness: sanitizeText(readinessEntry?.configState ?? "unknown", input.redactions),
    compatibilityState: sanitizeText(matrixEntry?.state ?? "not-proven", input.redactions),
    compatibilityFlags: Object.freeze(flags.map((value) => sanitizeText(value, input.redactions))),
    supportedModes: Object.freeze(
      (matrixEntry?.supportedModes ?? ["synthetic", "injected"])
        .map((value) => sanitizeText(value, input.redactions)),
    ),
    knownUnsupportedStates: Object.freeze(
      (matrixEntry?.knownUnsupportedStates ?? unsupportedCompatibilityFacts)
        .map((value) => sanitizeText(value, input.redactions)),
    ),
    streamingCapability: sanitizeText(compatibility?.streaming ?? "unknown", input.redactions),
    ...(input.fallbackProvider
      ? { fallbackProviderSafeLabel: sanitizeText(input.fallbackProvider.safeLabel, input.redactions) }
      : {}),
    ...(input.fallbackModel
      ? { fallbackModelSafeLabel: sanitizeText(input.fallbackModel.safeLabel, input.redactions) }
      : {}),
    fallbackEligibleFailureClasses: Object.freeze(
      (input.provider?.fallbackPolicy?.eligibleFailureClasses ?? []).map((value) =>
        sanitizeText(value, input.redactions)
      ),
    ),
    fallbackIneligibleFailureClasses: Object.freeze(
      (input.provider?.fallbackPolicy?.ineligibleFailureClasses ?? []).map((value) =>
        sanitizeText(value, input.redactions)
      ),
    ),
    missingProviderFacts: Object.freeze(missingProviderFacts),
    fallbackMetadata: Object.freeze(fallback.map((value) => sanitizeText(value, input.redactions))),
    notProvenClaims: unique([
      "provider-metadata-is-not-provider-success",
      "provider-readiness-is-not-provider-success",
      "provider-compatibility-is-not-provider-success",
      "config-readiness-is-not-provider-success",
      "opt-in-available-is-not-opt-in-granted",
      ...(matrixEntry?.notProvenClaims ?? []),
      ...(readinessEntry?.notProvenClaims ?? []),
      ...(input.provider?.notProvenClaims ?? []),
      ...(input.model?.notProvenClaims ?? []),
      ...(input.auth?.notProvenClaims ?? []),
      ...(input.providerRegistry?.notProvenClaims ?? []),
    ]),
    terminalSuccessClaim: false,
  });
}

function createSafeRequestMessages(input: {
  readonly bundle: NextTurnBundleProjection;
  readonly continuationReadiness?: ContinuationReadinessProjection;
  readonly instructionSummary?: string;
  readonly taskSummary?: string;
  readonly redactions: Set<string>;
}): readonly NextTurnRequestInputMessage[] {
  const messages: NextTurnRequestInputMessage[] = [];
  if (input.instructionSummary) {
    messages.push({
      messageId: "request-message:system-summary",
      source: "system",
      safeSummary: sanitizeText(input.instructionSummary, input.redactions),
      terminalSuccessClaim: false,
    });
  }
  if (input.taskSummary ?? input.bundle.assistantResponseSummary) {
    messages.push({
      messageId: "request-message:task-summary",
      source: "task",
      safeSummary: sanitizeText(
        input.taskSummary ?? input.bundle.assistantResponseSummary ?? "",
        input.redactions,
      ),
      terminalSuccessClaim: false,
    });
  }
  for (const message of input.bundle.safeToolResultMessages) {
    messages.push({
      messageId: sanitizeText(`request-message:${message.messageId}`, input.redactions),
      source: "tool-result",
      safeSummary: sanitizeText(message.safeContentSummary, input.redactions),
      terminalSuccessClaim: false,
    });
  }
  for (const fact of input.bundle.deliveryFacts) {
    messages.push({
      messageId: sanitizeText(`request-message:${fact.deliveryId}`, input.redactions),
      source: fact.deliveryKind,
      safeSummary: sanitizeText(fact.safeUserFacingSummary, input.redactions),
      terminalSuccessClaim: false,
    });
  }
  if (input.continuationReadiness) {
    messages.push({
      messageId: sanitizeText(
        `request-message:${input.continuationReadiness.readinessId}`,
        input.redactions,
      ),
      source: "continuation",
      safeSummary: sanitizeText(
        [
          `continuation:${input.continuationReadiness.status}`,
          `context:${input.continuationReadiness.contextReadinessStatus}`,
          `branch:${input.continuationReadiness.branchGapStatus}`,
          `compaction:${input.continuationReadiness.compactionGapStatus}`,
          `missingRequired:${input.continuationReadiness.missingRequiredFacts.length}`,
          `unsafeExcluded:${input.continuationReadiness.unsafeFactsExcluded.length}`,
          `stale:${input.continuationReadiness.staleFacts.length}`,
        ].join("; "),
        input.redactions,
      ),
      terminalSuccessClaim: false,
    });
  }
  return Object.freeze(messages);
}

function requestReadiness(input: {
  readonly bundle: NextTurnBundleProjection;
  readonly boundary: ModelRequestBoundary;
  readonly providerMetadata: NextTurnRequestProviderMetadata;
  readonly blockedReasons: readonly string[];
  readonly excludedMessageIds: readonly string[];
}): NextTurnRequestReadinessStatus {
  if (input.boundary.missingRequiredFacts.length > 0) {
    return "blocked_by_missing_context";
  }
  if (input.boundary.providerReadinessStatus === "missing" ||
    input.boundary.providerReadinessStatus === "blocked") {
    return "blocked_by_provider_unavailable";
  }
  if (
    input.bundle.redaction.status === "redacted" &&
    input.bundle.includedToolResultMessageIds.length === 0 &&
    input.excludedMessageIds.length > 0
  ) {
    return "blocked_by_redaction";
  }
  if (
    input.providerMetadata.missingProviderFacts.some((fact) =>
      fact === "provider-metadata-missing" ||
      fact === "model-metadata-missing" ||
      fact.startsWith("unsupported-model-mode:")
    )
  ) {
    return "unsupported";
  }
  if (input.providerMetadata.authReadiness !== "resolved") {
    return "blocked_by_provider_unavailable";
  }
  if (input.blockedReasons.some((reason) => reason.startsWith("continuation:"))) {
    return "blocked_by_missing_context";
  }
  switch (input.bundle.readinessStatus) {
    case "ready":
      return input.boundary.providerReadinessStatus === "ready"
        ? "ready_for_explicit_model_invocation"
        : "not_ready";
    case "ready_with_partial_tool_results":
      return "ready_with_partial_tool_results";
    case "blocked_by_policy":
      return "blocked_by_policy";
    case "blocked_by_authority":
      return "blocked_by_authority";
    case "blocked_by_failed_tool":
      return "blocked_by_failed_tool";
    case "blocked_by_malformed_tool_call":
      return "blocked_by_policy";
    case "blocked_by_unsupported_tool":
    case "unsupported":
      return "unsupported";
    case "not_ready":
      return "not_ready";
  }
}

function blockedRequestReasons(input: {
  readonly bundle: NextTurnBundleProjection;
  readonly boundary: ModelRequestBoundary;
  readonly providerMetadata: NextTurnRequestProviderMetadata;
  readonly excludedMessageIds: readonly string[];
  readonly continuationBlockedReasons?: readonly string[];
  readonly redactionStatus: "report-safe" | "redacted";
}): readonly string[] {
  return unique([
    ...input.bundle.blockingFacts,
    ...input.boundary.missingRequiredFacts.map((fact) => `missing-context:${fact}`),
    ...(input.continuationBlockedReasons ?? []),
    ...input.boundary.missingOptionalFacts.map((fact) => `missing-optional:${fact}`),
    ...input.boundary.notProvenClaims
      .filter((fact) => fact.includes("provider") || fact.includes("model"))
      .map((fact) => `request-fact:${fact}`),
    ...input.providerMetadata.missingProviderFacts.map((fact) => `provider-fact:${fact}`),
    ...(input.boundary.providerReadinessStatus === "missing" ||
        input.boundary.providerReadinessStatus === "blocked"
      ? [`provider-readiness:${input.boundary.providerReadinessStatus}`]
      : []),
    ...(input.excludedMessageIds.length > 0 ? ["unsafe-message-excluded"] : []),
    ...(input.redactionStatus === "redacted" ? ["redaction-applied"] : []),
  ]);
}

function continuationMissingFacts(
  readiness?: ContinuationReadinessProjection,
): readonly string[] {
  if (!readiness) {
    return [];
  }
  if (
    readiness.status === "blocked_missing_required_facts" ||
    readiness.status === "blocked_unsafe_context" ||
    readiness.status === "blocked_stale_session" ||
    readiness.status === "not_ready" ||
    readiness.status === "unsupported" ||
    readiness.status === "not_proven"
  ) {
    return unique([
      `continuation-status:${readiness.status}`,
      ...readiness.requiredMissingFacts.map((fact) => `continuation-required:${fact}`),
      ...readiness.staleFacts.map((fact) => `continuation-stale:${fact}`),
      ...readiness.unsafeFactsExcluded.map((fact) => `continuation-unsafe-excluded:${fact}`),
    ]);
  }
  return [];
}

function continuationPlanningConstraints(
  readiness?: ContinuationReadinessProjection,
): readonly string[] {
  if (!readiness) {
    return [];
  }
  return unique([
    `continuation-readiness:${readiness.status}`,
    `continuation-context:${readiness.contextReadinessStatus}`,
    ...readiness.requiredRefreshReads.map((read) => `continuation-required-refresh:${read}`),
    ...readiness.optionalRefreshReads.map((read) => `continuation-optional-refresh:${read}`),
  ]);
}

function continuationRequestBlockers(input: {
  readonly boundary: ModelRequestBoundary;
  readonly continuationReadiness?: ContinuationReadinessProjection;
  readonly redactions: Set<string>;
}): readonly string[] {
  const readinessStatus =
    input.continuationReadiness?.status ?? input.boundary.continuationReadinessStatus;
  const contextStatus =
    input.continuationReadiness?.contextReadinessStatus ??
    input.boundary.continuationContextReadinessStatus;
  if (!readinessStatus) {
    return [];
  }
  const blockers = [
    ...(readinessStatus.startsWith("blocked") ||
        readinessStatus === "unsupported" ||
        readinessStatus === "not_ready" ||
        readinessStatus === "not_proven"
      ? [`continuation:${readinessStatus}`]
      : []),
    ...(contextStatus?.startsWith("blocked") || contextStatus === "unsupported"
      ? [`continuation-context:${contextStatus}`]
      : []),
  ];
  return unique(blockers.map((value) => sanitizeText(value, input.redactions)));
}

function selectReadinessStatus(input: {
  readonly providerReadinessStatus: ModelRequestBoundary["providerReadinessStatus"];
  readonly requiredMissingCount: number;
  readonly noWriteStatus: string;
}): ModelRequestReadinessStatus {
  if (input.requiredMissingCount > 0) {
    return "blocked_missing_required_facts";
  }
  if (input.providerReadinessStatus === "missing" || input.providerReadinessStatus === "blocked") {
    return "blocked_provider_not_ready";
  }
  if (input.providerReadinessStatus === "ready" && input.noWriteStatus.includes("no-write")) {
    return "review_only";
  }
  return input.providerReadinessStatus === "ready" ? "ready" : "not_proven";
}

function sanitizeText(input: string, redactions: Set<string>): string {
  const before = input;
  let value = input.trim();
  value = value.replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[redacted-real-provider-home]");
  value = value.replace(/\bprovider\.env\b[^\n\r]*/gi, "provider.env=[redacted]");
  value = value.replace(/\bAuthorization:\s*Bearer\s+[A-Za-z0-9._~+/-]+/gi, "Authorization: Bearer [secret-redacted]");
  value = value.replace(/\b(?:Bearer|token|api[_-]?key|secret)\s*[:=]?\s*[A-Za-z0-9._~+/-]+/gi, "[secret-redacted]");
  value = value.replace(/\b(?:sk|pk)-[A-Za-z0-9_-]{8,}\b/g, "[secret-redacted]");
  value = value.replace(/\boldText\s*[:=]\s*[^\n\r]*/gi, "oldText=[raw-content-excluded]");
  value = value.replace(/\bnewText\s*[:=]\s*[^\n\r]*/gi, "newText=[raw-content-excluded]");
  value = value.replace(/\braw provider output\s*[:=]\s*[^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]");
  value = value.replace(/\bhidden reasoning[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]");
  value = value.replace(/<[^>]+>/g, "[raw-content-excluded]");
  if (value !== before) {
    redactions.add("unsafe-request-boundary-input");
  }
  return value.length > 0 ? value.slice(0, 180) : "redacted-empty";
}

function unique(input: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(input)]);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
  }
  return value;
}
