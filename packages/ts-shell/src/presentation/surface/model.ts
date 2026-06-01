import type {
  ContextPlanningBlockStatus,
  ContextPlanningBlockSummary,
} from "../../context/acquisition/summary.js";
import type { CodingResultSummary, OrchestrationStatus, TerminalReason } from "../../orchestration/types.js";
import type { ProviderRegistryProjection } from "../../provider/registry/provider.js";
import type { ModelBoundaryPhaseProjection } from "../../runtime/loop/modelBoundary.js";
import type { RuntimeProjectionEvent } from "../../runtime/events/projection.js";
import type { ProductLoopAdapterProjection } from "../../runtime/loop/adapter.js";
import type { LoopTrajectoryProjection } from "../../runtime/loop/trajectory.js";
import type { ProviderStreamAdapterProjection } from "../../runtime/loop/providerStreamAdapter.js";
import type { PackageInventoryProjection } from "../../runtime/resources/inventory.js";
import type { StaticResourceProjection } from "../../runtime/resources/projection.js";
import {
  compactSessionPresentationText as compact,
  projectSessionPresentationFacts,
} from "../../session/presentation/facts.js";
import type { SessionTreeProjection } from "../../session/sessionTreeProjection.js";

export type ProductSurfaceSectionKind =
  | "task"
  | "context"
  | "context_discovery"
  | "context_acquisition"
  | "loop"
  | "turn"
  | "plan"
  | "planning"
  | "handoff"
  | "continuation_context"
  | "proposal"
  | "authority"
  | "apply"
  | "verification"
  | "repair"
  | "tools"
  | "execution"
  | "save_point"
  | "resources"
  | "provider"
  | "model_boundary"
  | "packages"
  | "session"
  | "events"
  | "verdict"
  | "not_proven"
  | "next_action";

export type ProductSurfaceSeverity =
  | "info"
  | "success"
  | "warning"
  | "blocked"
  | "error"
  | "partial"
  | "not_proven";

export type ProductSurfaceStatus =
  | "observed"
  | "ready"
  | "pending_authority"
  | "blocked"
  | "not_run"
  | "partial"
  | "failed"
  | "passed"
  | "unsupported"
  | "not_proven";

export interface ProductSurfaceFact {
  readonly label: string;
  readonly value: string;
  readonly sourceEvidenceId?: string;
  readonly machineEventCorrelationId?: string;
  readonly redacted?: boolean;
}

export interface ProductSurfaceSection {
  readonly kind: ProductSurfaceSectionKind;
  readonly title: string;
  readonly severity: ProductSurfaceSeverity;
  readonly status: ProductSurfaceStatus;
  readonly summary: string;
  readonly facts: readonly ProductSurfaceFact[];
  readonly redaction: "none" | "applied" | "excluded";
  readonly notProvenClaims: readonly string[];
  readonly sourceEvidenceIds: readonly string[];
  readonly machineEventCorrelationIds: readonly string[];
}

export interface ProductSurfaceViewModel {
  readonly sections: readonly ProductSurfaceSection[];
  readonly verdict: string;
  readonly notProvenClaims: readonly string[];
  readonly nextAction: string;
  readonly redaction: "none" | "applied" | "excluded";
  readonly terminalSuccessClaim: false;
}

export interface ProductSurfaceInput {
  readonly status: OrchestrationStatus;
  readonly terminalClassification: "success" | "stopped" | "error";
  readonly terminalReason: TerminalReason;
  readonly stopReason?: string;
  readonly codingResult?: CodingResultSummary;
  readonly resourceProjection?: StaticResourceProjection;
  readonly packageInventory?: PackageInventoryProjection;
  readonly providerRegistry?: ProviderRegistryProjection;
  readonly modelBoundaryPhase?: ModelBoundaryPhaseProjection;
  readonly providerStreamAdapter?: ProviderStreamAdapterProjection;
  readonly runtimeEvents?: readonly RuntimeProjectionEvent[];
  readonly sessionProjection?: SessionTreeProjection;
  readonly loopTrajectory?: LoopTrajectoryProjection;
  readonly productLoopAdapter?: ProductLoopAdapterProjection;
  readonly contextPlanningSummary?: ContextPlanningBlockSummary;
}

export function projectProductSurfaceViewModel(
  input: ProductSurfaceInput,
): ProductSurfaceViewModel | undefined {
  const codingResult = input.codingResult;
  if (!codingResult && !input.loopTrajectory && !input.productLoopAdapter && !input.contextPlanningSummary && !input.modelBoundaryPhase && !input.providerStreamAdapter && !input.runtimeEvents) {
    return undefined;
  }

  const sessionFacts = codingResult ? projectSessionPresentationFacts(input) : undefined;
  if (codingResult && !sessionFacts) {
    return undefined;
  }

  const sections = [
    ...(codingResult ? [
      taskSection(codingResult),
      contextSection(codingResult),
      planSection(codingResult),
      proposalSection(codingResult),
      authoritySection(codingResult),
      applySection(codingResult),
      verificationSection(codingResult),
      repairSection(codingResult),
      toolsSection(codingResult),
    ] : []),
    ...contextPlanningSections(input.contextPlanningSummary),
    ...productLoopAdapterSections(input),
    ...loopTrajectorySections(input),
    ...resourceSections(input),
    ...providerStreamAdapterSections(input.providerStreamAdapter),
    ...providerSections(input),
    ...modelBoundarySections(input.modelBoundaryPhase),
    ...packageSections(input),
    ...sessionSections(input),
    ...toolOutcomeEventSections(input),
    ...requestPreparationEventSections(input),
    ...modelInvocationEventSections(input),
    ...controlledInvocationEventSections(input),
    ...eventSections(input),
    section({
      kind: "verdict",
      title: "Verdict",
      severity: sessionFacts ? verdictSeverity(sessionFacts.truthStatus) : "not_proven",
      status: sessionFacts ? verdictStatus(sessionFacts.truthStatus) : "not_proven",
      summary: sessionFacts?.verdict ??
        `loopState=${input.loopTrajectory?.finalObservedFacts.loopState ?? input.productLoopAdapter?.adapterId ?? "not-observed"}; terminalSuccessClaim=false`,
    }),
    section({
      kind: "not_proven",
      title: "Not proven",
      severity: (sessionFacts?.notProvenClaims.length ?? input.providerStreamAdapter?.notProvenClaims.length ?? input.modelBoundaryPhase?.notProvenClaims.length ?? input.contextPlanningSummary?.notProvenClaims.length ?? input.loopTrajectory?.notProvenClaims.length ?? input.productLoopAdapter?.notProvenClaims.length ?? 0) > 0 ? "not_proven" : "info",
      status: (sessionFacts?.notProvenClaims.length ?? input.providerStreamAdapter?.notProvenClaims.length ?? input.modelBoundaryPhase?.notProvenClaims.length ?? input.contextPlanningSummary?.notProvenClaims.length ?? input.loopTrajectory?.notProvenClaims.length ?? input.productLoopAdapter?.notProvenClaims.length ?? 0) > 0 ? "not_proven" : "observed",
      summary: (sessionFacts?.notProvenClaims.length ?? 0) > 0
        ? sessionFacts!.notProvenClaims.join("; ")
        : (input.providerStreamAdapter?.notProvenClaims.length ?? 0) > 0
          ? input.providerStreamAdapter!.notProvenClaims.slice(0, 8).join("; ")
        : (input.modelBoundaryPhase?.notProvenClaims.length ?? 0) > 0
          ? input.modelBoundaryPhase!.notProvenClaims.slice(0, 8).join("; ")
        : (input.contextPlanningSummary?.notProvenClaims.length ?? 0) > 0
          ? input.contextPlanningSummary!.notProvenClaims.slice(0, 8).join("; ")
        : (input.loopTrajectory?.notProvenClaims.length ?? 0) > 0
          ? input.loopTrajectory!.notProvenClaims.slice(0, 8).join("; ")
        : (input.productLoopAdapter?.notProvenClaims.length ?? 0) > 0
          ? input.productLoopAdapter!.notProvenClaims.slice(0, 8).join("; ")
        : "none",
      notProvenClaims: sessionFacts?.notProvenClaims ??
        input.providerStreamAdapter?.notProvenClaims ??
        input.modelBoundaryPhase?.notProvenClaims ??
        input.contextPlanningSummary?.notProvenClaims ??
        input.loopTrajectory?.notProvenClaims ??
        input.productLoopAdapter?.notProvenClaims ?? [],
    }),
    section({
      kind: "next_action",
      title: "Next action",
      severity: sessionFacts && (sessionFacts.truthStatus === "verified-success" ||
        sessionFacts.truthStatus === "verified-repaired-success"
      )
        ? "success"
        : "info",
      status: "observed",
      summary: sessionFacts?.nextAction ??
        input.contextPlanningSummary?.nextAction ??
        input.providerStreamAdapter?.nextAction ??
        input.productLoopAdapter?.nextAction ??
        "keep loop trajectory observation separate from terminal success",
    }),
  ];

  return {
    sections,
    verdict: sessionFacts?.verdict ??
      `loopState=${input.loopTrajectory?.finalObservedFacts.loopState ?? input.productLoopAdapter?.adapterId ?? "not-observed"}`,
    notProvenClaims: sessionFacts?.notProvenClaims ??
      input.modelBoundaryPhase?.notProvenClaims ??
      input.contextPlanningSummary?.notProvenClaims ??
      input.providerStreamAdapter?.notProvenClaims ??
      input.loopTrajectory?.notProvenClaims ??
      input.productLoopAdapter?.notProvenClaims ?? [],
    nextAction: sessionFacts?.nextAction ??
      input.contextPlanningSummary?.nextAction ??
      input.providerStreamAdapter?.nextAction ??
      input.productLoopAdapter?.nextAction ??
      "keep loop trajectory observation separate from terminal success",
    redaction: sections.some((item) => item.redaction !== "none") ? "applied" : "none",
    terminalSuccessClaim: false,
  };
}

function toolOutcomeEventSections(input: ProductSurfaceInput): ProductSurfaceSection[] {
  const events = input.runtimeEvents ?? [];
  const outcome = events.find((event) => event.type === "tool-outcome-bundle-observed");
  const nextTurn = events.find((event) => event.type === "next-turn-bundle-prepared");
  const savePointInput = events.find((event) => event.type === "save-point-input-prepared");
  if (!outcome && !nextTurn && !savePointInput) {
    return [];
  }

  return [section({
    kind: "tools",
    title: "Tool outcome",
    severity: events.some((event) =>
      event.type === "next-turn-bundle-blocked" || event.type === "delivery-blocked"
    )
      ? "warning"
      : "info",
    status: "observed",
    summary: [
      outcome ? `outcome=${factValue(outcome.facts.mixedOutcomeStatus)}` : undefined,
      savePointInput ? `savePointInput=${factValue(savePointInput.facts.savePointInputId)}` : undefined,
      nextTurn ? `nextTurn=${factValue(nextTurn.facts.readinessStatus)}` : undefined,
      "terminalSuccessClaim=false",
    ].filter(Boolean).join("; "),
    facts: [
      ...(outcome
        ? [
            {
              label: "executed",
              value: factValue(outcome.facts.executedCount),
              machineEventCorrelationId: outcome.id,
            },
            {
              label: "blocked",
              value: factValue(outcome.facts.blockedCount),
              machineEventCorrelationId: outcome.id,
            },
            {
              label: "failed",
              value: factValue(outcome.facts.failedCount),
              machineEventCorrelationId: outcome.id,
            },
          ]
        : []),
      ...(nextTurn
        ? [
            {
              label: "readiness",
              value: factValue(nextTurn.facts.readinessStatus),
              machineEventCorrelationId: nextTurn.id,
            },
          ]
        : []),
    ],
    machineEventCorrelationIds: [outcome?.id, savePointInput?.id, nextTurn?.id]
      .filter((id): id is string => Boolean(id)),
    notProvenClaims: events
      .filter((event) =>
        event.type === "tool-outcome-bundle-observed" ||
        event.type === "save-point-input-prepared" ||
        event.type === "next-turn-bundle-prepared"
      )
      .flatMap((event) => event.notProvenClaims),
  })];
}

function factValue(value: unknown): string {
  return safeText(String(value ?? "not-observed"), 120);
}

function controlledInvocationEventSections(input: ProductSurfaceInput): ProductSurfaceSection[] {
  const events = input.runtimeEvents ?? [];
  const adapter = events.find((event) => event.type === "controlled-invocation-adapter-observed");
  if (!adapter) {
    return [];
  }
  const blocked = events.find((event) => event.type === "controlled-invocation-attempt-blocked");
  const failed = events.find((event) =>
    event.type === "controlled-invocation-attempt-failed-as-provider-fact"
  );
  const completed = events.find((event) =>
    event.type === "controlled-invocation-attempt-completed-as-provider-fact"
  );
  const handoff = events.find((event) => event.type === "provider-response-handoff-prepared");

  return [section({
    kind: "provider",
    title: "Controlled invocation",
    severity: failed ? "error" : blocked ? "blocked" : completed ? "not_proven" : "info",
    status: failed ? "failed" : blocked ? "blocked" : "observed",
    summary: [
      `decision=${factValue(adapter.facts.attemptDecision)}`,
      `attempt=${factValue(adapter.facts.attemptStatus)}`,
      `provider=${factValue(adapter.facts.providerSafeLabel)}`,
      `model=${factValue(adapter.facts.modelSafeLabel)}`,
      `fallbackAttempted=${factValue(adapter.facts.fallbackAttempted)}`,
      handoff ? `handoff=${factValue(handoff.facts.responseClassification)}` : undefined,
      `failure=${factValue(adapter.facts.failureClass)}`,
      `retry=${factValue(adapter.facts.retryEligibility)}`,
      `fallback=${factValue(adapter.facts.fallbackEligibility)}`,
      "terminalSuccessClaim=false",
    ].filter(Boolean).join("; "),
    facts: [
      {
        label: "adapterId",
        value: factValue(adapter.facts.adapterId),
        machineEventCorrelationId: adapter.id,
      },
      {
        label: "requiredUserAction",
        value: blocked ? factValue(adapter.facts.blockedReason) : "review provider outcome facts",
        machineEventCorrelationId: adapter.id,
      },
      ...(handoff
        ? [
            {
              label: "responseHandoff",
              value: factValue(handoff.facts.responseHandoffId),
              machineEventCorrelationId: handoff.id,
            },
            {
              label: "toolExtraction",
              value: factValue(handoff.facts.toolCallExtractionReadiness),
              machineEventCorrelationId: handoff.id,
            },
          ]
        : []),
    ],
    redaction: adapter.redaction.status === "redacted" || handoff?.redaction.status === "redacted"
      ? "applied"
      : "none",
    machineEventCorrelationIds: [adapter.id, blocked?.id, failed?.id, completed?.id, handoff?.id]
      .filter((id): id is string => Boolean(id)),
    notProvenClaims: events
      .filter((event) =>
        event.type === "controlled-invocation-adapter-observed" ||
        event.type === "controlled-invocation-attempt-completed-as-provider-fact" ||
        event.type === "controlled-invocation-attempt-failed-as-provider-fact" ||
        event.type === "provider-response-handoff-prepared"
      )
      .flatMap((event) => event.notProvenClaims),
  })];
}

function modelInvocationEventSections(input: ProductSurfaceInput): ProductSurfaceSection[] {
  const events = input.runtimeEvents ?? [];
  const gate = events.find((event) => event.type === "model-invocation-gate-observed");
  const attempt = events.find((event) => event.type === "model-invocation-attempt-prepared");
  if (!gate && !attempt) {
    return [];
  }
  const blocked = events.find((event) => event.type === "model-invocation-blocked");
  const optIn = events.find((event) => event.type === "model-invocation-explicit-opt-in-required");
  const redaction = events.find((event) => event.type === "model-invocation-redaction-blocked");

  return [section({
    kind: "model_boundary",
    title: "Invocation gate",
    severity: redaction ? "error" : blocked ? "blocked" : "not_proven",
    status: blocked ? "blocked" : "observed",
    summary: [
      gate ? `eligibility=${factValue(gate.facts.eligibilityStatus)}` : undefined,
      gate ? `provider=${factValue(gate.facts.providerSafeLabel)}` : undefined,
      gate ? `model=${factValue(gate.facts.modelSafeLabel)}` : undefined,
      gate ? `optIn=${factValue(gate.facts.optInState)}` : undefined,
      gate ? `auth=${factValue(gate.facts.authReadiness)}` : undefined,
      attempt ? `attempt=${factValue(attempt.facts.attemptStatus)}` : undefined,
      attempt ? `retry=${factValue(attempt.facts.retryEligibility)}` : undefined,
      attempt ? `fallback=${factValue(attempt.facts.fallbackEligibility)}` : undefined,
      "terminalSuccessClaim=false",
    ].filter(Boolean).join("; "),
    facts: [
      ...(gate
        ? [
            {
              label: "gateId",
              value: factValue(gate.facts.gateId),
              machineEventCorrelationId: gate.id,
            },
            {
              label: "requiredUserAction",
              value: factValue(gate.facts.requiredUserAction),
              machineEventCorrelationId: gate.id,
            },
          ]
        : []),
      ...(attempt
        ? [
            {
              label: "attemptId",
              value: factValue(attempt.facts.attemptId),
              machineEventCorrelationId: attempt.id,
            },
            {
              label: "invocationMode",
              value: factValue(attempt.facts.invocationMode),
              machineEventCorrelationId: attempt.id,
            },
          ]
        : []),
    ],
    redaction: gate?.redaction.status === "redacted" || attempt?.redaction.status === "redacted"
      ? "applied"
      : "none",
    machineEventCorrelationIds: [gate?.id, attempt?.id, blocked?.id, optIn?.id, redaction?.id]
      .filter((id): id is string => Boolean(id)),
    notProvenClaims: events
      .filter((event) =>
        event.type === "model-invocation-gate-observed" ||
        event.type === "model-invocation-attempt-prepared" ||
        event.type === "model-invocation-blocked" ||
        event.type === "model-invocation-explicit-opt-in-required"
      )
      .flatMap((event) => event.notProvenClaims),
  })];
}

function requestPreparationEventSections(input: ProductSurfaceInput): ProductSurfaceSection[] {
  const events = input.runtimeEvents ?? [];
  const request = events.find((event) => event.type === "next-turn-request-preparation-observed");
  const provider = events.find((event) => event.type === "provider-metadata-observed");
  if (!request && !provider) {
    return [];
  }
  const blocked = events.find((event) => event.type === "request-blocked");
  return [section({
    kind: "model_boundary",
    title: "Request preparation",
    severity: blocked ? "warning" : "info",
    status: "observed",
    summary: [
      request ? `readiness=${factValue(request.facts.readinessStatus)}` : undefined,
      provider ? `provider=${factValue(provider.facts.providerSafeLabel)}` : undefined,
      provider ? `model=${factValue(provider.facts.modelSafeLabel)}` : undefined,
      request ? `included=${factValue(request.facts.includedMessageCount)}` : undefined,
      request ? `excluded=${factValue(request.facts.excludedMessageCount)}` : undefined,
      blocked ? `blocked=${factValue(blocked.facts.readinessStatus)}` : undefined,
      "terminalSuccessClaim=false",
    ].filter(Boolean).join("; "),
    facts: [
      ...(request
        ? [
            {
              label: "requestPreparation",
              value: factValue(request.facts.requestPreparationId),
              machineEventCorrelationId: request.id,
            },
            {
              label: "requiredUserAction",
              value: blocked ? "resolve-request-blocker" : "explicit-invocation-required",
              machineEventCorrelationId: request.id,
            },
          ]
        : []),
      ...(provider
        ? [
            {
              label: "auth",
              value: factValue(provider.facts.authReadiness),
              machineEventCorrelationId: provider.id,
            },
            {
              label: "optIn",
              value: factValue(provider.facts.providerOptInState),
              machineEventCorrelationId: provider.id,
            },
          ]
        : []),
    ],
    machineEventCorrelationIds: [request?.id, provider?.id, blocked?.id]
      .filter((id): id is string => Boolean(id)),
    notProvenClaims: events
      .filter((event) =>
        event.type === "next-turn-request-preparation-observed" ||
        event.type === "provider-metadata-observed" ||
        event.type === "provider-opt-in-required" ||
        event.type === "request-input-message-prepared"
      )
      .flatMap((event) => event.notProvenClaims),
  })];
}

function providerStreamAdapterSections(
  adapter: ProviderStreamAdapterProjection | undefined,
): ProductSurfaceSection[] {
  if (!adapter) {
    return [];
  }
  return [section({
    kind: "provider",
    title: "Provider stream adapter",
    severity: adapter.failureClass
      ? adapter.fetchAttempted ? "error" : "blocked"
      : adapter.status === "projected" ? "not_proven" : "blocked",
    status: adapter.status === "projected"
      ? "observed"
      : adapter.status === "blocked" ? "blocked" : "not_run",
    summary: `optIn=${adapter.explicitOptIn}; readiness=${adapter.readinessStatus}; fetchAttempted=${adapter.fetchAttempted}; classification=${adapter.liveClassification}; streamProjected=${adapter.streamProjected}; assistant=${adapter.assistantAccumulationStatus}; toolCalls=${adapter.toolCallExtractionStatus}; retry=${adapter.retryEligibility}; fallback=${adapter.fallbackEligibility}; fallbackStatus=${adapter.fallbackStatus}; failure=${adapter.failureClass ?? "none"}; terminalSuccessClaim=false`,
    facts: [
      { label: "adapterId", value: adapter.adapterId },
      { label: "requestId", value: adapter.requestId },
      { label: "responseId", value: adapter.responseId },
      { label: "redaction", value: adapter.redaction.status },
      { label: "liveClassification", value: adapter.liveClassification },
      { label: "recoveryFacts", value: adapter.recoveryFacts.join(",") },
    ],
    redaction: adapter.redaction.status === "redacted" ? "applied" : "none",
    notProvenClaims: adapter.notProvenClaims,
  })];
}

function modelBoundarySections(
  phase: ModelBoundaryPhaseProjection | undefined,
): ProductSurfaceSection[] {
  if (!phase) {
    return [];
  }
  const streamStatus = phase.stream.status;
  const failureClass = phase.stream.failure?.class ?? "none";
  const cancellation = phase.stream.cancellation?.kind ?? "none";
  const handoff = phase.toolBatchHandoff;
  return [section({
    kind: "model_boundary",
    title: "Model boundary",
    severity: streamStatus === "failed" ||
        streamStatus === "output_invalid" ||
        streamStatus === "output_insufficient" ||
        streamStatus === "redaction_failed"
      ? "error"
      : streamStatus === "cancelled"
        ? "partial"
        : "not_proven",
    status: streamStatus === "completed"
      ? "observed"
      : streamStatus === "failed" ||
          streamStatus === "output_invalid" ||
          streamStatus === "output_insufficient" ||
          streamStatus === "redaction_failed"
        ? "failed"
        : streamStatus === "cancelled" || streamStatus === "partial"
          ? "partial"
          : "not_proven",
    summary: `providerMode=${phase.requestBoundary.providerMode}; model=${phase.requestBoundary.modelSafeLabel}; request=${phase.requestBoundary.readinessStatus}; stream=${streamStatus}; assistant=${phase.assistantResponse.accumulationStatus}; toolCalls=${phase.toolCallBatch.extractionStatus}; handoff=${handoff.executionStatus}; blocked=${phase.toolDispatchPlan.blockedCallIds.length}; authority=${phase.toolDispatchPlan.authorityRequiredCallIds.length}; malformed=${handoff.malformedCallIds.length}; unsupported=${handoff.unsupportedCallIds.length}; unknown=${handoff.unknownToolCallIds.length}; messages=${handoff.nonExecutedMessageIds.length}; next=${handoff.nextTurnInputId ?? handoff.nextTurnInputAbsentReason ?? "not-prepared"}; failure=${failureClass}; cancellation=${cancellation}; fallback=${phase.stream.failure?.fallbackEligibility ?? "unknown"}; terminalSuccessClaim=false`,
    facts: [
      { label: "requestId", value: phase.requestBoundary.requestId },
      { label: "provider", value: phase.requestBoundary.providerSafeLabel },
      { label: "model", value: phase.requestBoundary.modelSafeLabel },
      { label: "missingRequiredFacts", value: String(phase.requestBoundary.missingRequiredFacts.length) },
      { label: "dispatchStatus", value: phase.toolCallBatch.dispatchStatus },
      { label: "batchStatus", value: handoff.dispatchEligibility },
      { label: "callCount", value: String(handoff.normalizedToolCallIds.length) },
      { label: "blockedCount", value: String(phase.toolDispatchPlan.blockedCallIds.length) },
      { label: "authorityRequiredCount", value: String(phase.toolDispatchPlan.authorityRequiredCallIds.length) },
      { label: "notDispatchedMessages", value: String(handoff.nonExecutedMessageIds.length) },
    ],
    redaction: phase.stream.redaction.status === "redacted" ||
        phase.requestBoundary.redaction.status === "redacted"
      ? "applied"
      : "none",
    notProvenClaims: phase.notProvenClaims,
  })];
}

function contextPlanningSections(
  summary: ContextPlanningBlockSummary | undefined,
): ProductSurfaceSection[] {
  if (!summary) {
    return [];
  }
  const severity = contextPlanningSeverity(summary.status);
  const status = contextPlanningSurfaceStatus(summary.status);
  return [
    section({
      kind: "context_discovery",
      title: "Context discovery",
      severity,
      status,
      summary: `ambiguity=${summary.discovery.ambiguityState}; selected=${summary.discovery.selectedCandidateIds.length}; competing=${summary.discovery.competingCandidateIds.length}; omitted=${summary.discovery.omittedCandidateCount}; missingDiscoveryFacts=${summary.discovery.missingDiscoveryFacts.length}`,
      facts: [
        { label: "scanProfile", value: summary.discovery.scanProfileId },
        { label: "ambiguity", value: summary.discovery.ambiguityState },
        { label: "selectedCandidateIds", value: summary.discovery.selectedCandidateIds.join(",") || "none" },
        { label: "competingCandidateIds", value: summary.discovery.competingCandidateIds.join(",") || "none" },
      ],
      notProvenClaims: [
        "discovery-found-is-not-correct-target",
        "selected-candidate-is-not-edit-authority",
      ],
      sourceEvidenceIds: summary.evidence,
    }),
    section({
      kind: "context_acquisition",
      title: "Context acquisition",
      severity,
      status,
      summary: `mode=${summary.acquisition.mode}; stale=${summary.acquisition.staleFacts.length}; requiredMissing=${summary.acquisition.requiredMissingFacts.length}; optionalMissing=${summary.acquisition.optionalMissingFacts.length}; sufficiency=${summary.acquisition.contextSufficiencyStatus}; readBudget=${summary.acquisition.readBudgetStatus}`,
      facts: [
        { label: "packetProvenance", value: String(summary.acquisition.packetProvenanceCount) },
        { label: "graphConfidence", value: summary.acquisition.graphConfidence },
        { label: "unavailableGraphComponents", value: summary.acquisition.unavailableGraphComponents.join(",") || "none" },
        { label: "nextReadSuggestions", value: summary.acquisition.nextReadSuggestions.slice(0, 5).join("; ") || "none" },
      ],
      redaction: "excluded",
      notProvenClaims: [
        "context-read-is-not-repository-understanding",
        "context-sufficient-for-review-only-is-not-edit-authority",
        "next-read-suggestion-is-not-completed-read",
      ],
      sourceEvidenceIds: summary.evidence,
    }),
    section({
      kind: "planning",
      title: "Planning",
      severity,
      status,
      summary: `quality=${summary.planning.qualityStatus}; confidence=${summary.planning.planConfidence}; assumptions=${summary.planning.assumptions.length}; constraints=${summary.planning.constraints.length}; terminalSuccessClaim=false`,
      facts: [
        { label: "assumptions", value: summary.planning.assumptions.slice(0, 5).join("; ") || "none" },
        { label: "constraints", value: summary.planning.constraints.slice(0, 5).join("; ") || "none" },
        { label: "nextAction", value: summary.planning.nextAction },
      ],
      notProvenClaims: [
        "plan-generated-is-not-executable-work",
        "planning-facts-are-not-terminal-success",
      ],
      sourceEvidenceIds: summary.evidence,
    }),
    section({
      kind: "handoff",
      title: "Handoff",
      severity: summary.handoff.editNoWriteStatus.includes("no-write") ? "not_proven" : severity,
      status: summary.handoff.editNoWriteStatus.includes("no-write") ? "not_run" : status,
      summary: `edit=${summary.handoff.editHandoffStatus}; noWrite=${summary.handoff.editNoWriteStatus}; exactProposal=${summary.handoff.exactProposalReadiness}; verificationRun=${summary.handoff.verificationSelectedNotRunStatus}`,
      facts: [
        { label: "editHandoff", value: summary.handoff.editHandoffStatus },
        { label: "exactProposalReadiness", value: summary.handoff.exactProposalReadiness },
        { label: "verificationIntent", value: summary.handoff.verificationIntentStatus },
        { label: "verificationRun", value: summary.handoff.verificationSelectedNotRunStatus },
      ],
      notProvenClaims: [
        "edit-handoff-ready-is-not-mutation-authority",
        "verification-intent-selected-is-not-verification-passed",
      ],
      sourceEvidenceIds: summary.evidence,
    }),
    section({
      kind: "continuation_context",
      title: "Continuation context",
      severity,
      status,
      summary: `memoryReuse=${summary.continuation.memoryReuseStatus}; freshness=${summary.continuation.memoryFreshnessRequirement}; readiness=${summary.continuation.continuationReadinessStatus}; requiredRefresh=${summary.continuation.requiredRefreshReads.length}; optionalRefresh=${summary.continuation.optionalRefreshReads.length}; replaySafePlanning=${summary.continuation.replaySafePlanningStateIds.length}`,
      facts: [
        { label: "requiredRefreshReads", value: summary.continuation.requiredRefreshReads.slice(0, 5).join("; ") || "none" },
        { label: "optionalRefreshReads", value: summary.continuation.optionalRefreshReads.slice(0, 5).join("; ") || "none" },
        { label: "replaySafePlanningStateIds", value: summary.continuation.replaySafePlanningStateIds.join(",") || "none" },
      ],
      redaction: "excluded",
      notProvenClaims: [
        "memory-reused-is-not-fresh-enough-context",
        "continuation-ready-is-not-task-success",
        "replay-state-available-is-not-plan-validity",
      ],
      sourceEvidenceIds: summary.evidence,
    }),
  ];
}

function contextPlanningSeverity(status: ContextPlanningBlockStatus): ProductSurfaceSeverity {
  switch (status) {
    case "blocked_stale_context":
    case "blocked_ambiguous_target":
    case "blocked_missing_required_context":
      return "blocked";
    case "partial_required_facts_missing":
      return "partial";
    case "unsupported":
    case "not_proven":
      return "not_proven";
    case "review_only_ready":
      return "warning";
    case "product_surface_ready":
    default:
      return "info";
  }
}

function contextPlanningSurfaceStatus(status: ContextPlanningBlockStatus): ProductSurfaceStatus {
  switch (status) {
    case "blocked_stale_context":
    case "blocked_ambiguous_target":
    case "blocked_missing_required_context":
      return "blocked";
    case "partial_required_facts_missing":
      return "partial";
    case "unsupported":
      return "unsupported";
    case "not_proven":
      return "not_proven";
    case "review_only_ready":
    case "product_surface_ready":
    default:
      return "observed";
  }
}

function productLoopAdapterSections(input: ProductSurfaceInput): ProductSurfaceSection[] {
  const adapter = input.productLoopAdapter;
  if (!adapter) {
    return [];
  }
  const statusCounts = adapter.phaseStatus.reduce<Record<string, number>>(
    (counts, item) => {
      counts[item.status] = (counts[item.status] ?? 0) + 1;
      return counts;
    },
    {},
  );
  const statusSummary = Object.entries(statusCounts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `${status}=${count}`)
    .join("; ");
  const productIntegrated = adapter.phaseStatus
    .filter((item) => item.status === "product_integrated")
    .map((item) => item.phaseId)
    .slice(0, 8)
    .join(",");

  return [
    section({
      kind: "loop",
      title: "Product loop adapter",
      severity: "not_proven",
      status: "observed",
      summary: `adapter=${adapter.adapterId}; statuses=${statusSummary}; productIntegrated=${productIntegrated}; terminalSuccessClaim=false`,
      machineEventCorrelationIds: adapter.safeReferences.runtimeEventIds,
      notProvenClaims: adapter.notProvenClaims,
    }),
    section({
      kind: "loop",
      title: "Feature integration contract",
      severity: adapter.featureContractAvailable ? "info" : "not_proven",
      status: adapter.featureContractAvailable ? "observed" : "not_proven",
      summary: `available=${adapter.featureContractAvailable}; contracts=${adapter.featureContracts.length}; forbiddenShortcutsRequired=true; validationGatesRequired=true`,
      notProvenClaims: ["feature-contract-valid-is-not-success"],
    }),
  ];
}

function loopTrajectorySections(input: ProductSurfaceInput): ProductSurfaceSection[] {
  const trajectory = input.loopTrajectory;
  if (!trajectory) {
    return [];
  }
  const stage = (kind: string) =>
    trajectory.stages.find((item) => item.category === kind);
  const observed = (kind: string) => stage(kind)?.observationStatus ?? "not_proven";
  const toolResultStatusCount = (status: string) =>
    trajectory.events.filter((event) =>
      event.type === "loop-tool-result-observed" &&
      event.facts.resultStatus === status
    ).length;
  const executedTools = toolResultStatusCount("executed_success") +
    toolResultStatusCount("executed_failed");
  const blockedTools = toolResultStatusCount("blocked_by_policy") +
    toolResultStatusCount("authority_denied");
  const authorityRequiredTools = toolResultStatusCount("authority_required");
  const failedTools = toolResultStatusCount("executed_failed");
  const unsupportedTools = toolResultStatusCount("unsupported_tool") +
    toolResultStatusCount("unknown_tool");
  const notDispatchedTools = toolResultStatusCount("not_dispatched") +
    toolResultStatusCount("execution_unavailable") +
    toolResultStatusCount("malformed_arguments");
  return [
    section({
      kind: "task",
      title: "Task",
      severity: "info",
      status: "observed",
      summary: `loop=${trajectory.loopId}; terminalSuccessClaim=false`,
    }),
    section({
      kind: "turn",
      title: "Turn",
      severity: observed("turn-snapshot") === "observed" ? "info" : "not_proven",
      status: observed("turn-snapshot") === "observed" ? "observed" : "not_proven",
      summary: `turns=${trajectory.turnIds.length}; snapshots=${trajectory.snapshotIds.length}`,
      machineEventCorrelationIds: stage("turn-snapshot")?.eventIds ?? [],
      notProvenClaims: stage("turn-snapshot")?.notProvenClaims ?? [],
    }),
    section({
      kind: "provider",
      title: "Provider",
      severity: "not_proven",
      status: "not_proven",
      summary: `metadata=${trajectory.providerMetadataIds.length}; modelResponses=${stage("model-boundary")?.sourceIds.length ?? 0}; providerCalled=not-proven`,
      notProvenClaims: [
        ...(stage("provider-metadata")?.notProvenClaims ?? ["provider-called"]),
        ...(stage("model-boundary")?.notProvenClaims ?? []),
      ],
    }),
    section({
      kind: "tools",
      title: "Tools",
      severity: observed("tool-call-batch") === "observed" ||
          observed("tool-result-details") === "observed"
        ? "info"
        : "not_proven",
      status: observed("tool-call-batch") === "observed" ||
          observed("tool-result-details") === "observed"
        ? "observed"
        : "not_proven",
      summary: `toolBatches=${stage("tool-call-batch")?.sourceIds.length ?? 0}; dispatch=${observed("before-tool-policy")}; toolResults=${observed("tool-result-details")}; resultMessages=${trajectory.toolResultMessageIds.length}; receipts=${trajectory.receiptIds.length}; executed=${executedTools}; blocked=${blockedTools}; authorityRequired=${authorityRequiredTools}; failed=${failedTools}; unsupported=${unsupportedTools}; notDispatched=${notDispatchedTools}; toolSuccess=not-proven`,
      notProvenClaims: [
        ...(stage("tool-call-batch")?.notProvenClaims ?? []),
        ...(stage("tool-result-details")?.notProvenClaims ?? []),
        ...(stage("tool-result-messages")?.notProvenClaims ?? []),
      ],
    }),
    section({
      kind: "execution",
      title: "Execution",
      severity: trajectory.receiptIds.length > 0 ? "info" : "not_proven",
      status: trajectory.receiptIds.length > 0 ? "observed" : "not_proven",
      summary: `receipts=${trajectory.receiptIds.length}; commandSuccess=not-proven`,
      machineEventCorrelationIds: stage("execution-receipt")?.eventIds ?? [],
      notProvenClaims: stage("execution-receipt")?.notProvenClaims ?? [],
    }),
    section({
      kind: "verification",
      title: "Verification",
      severity: observed("verification-result") === "observed" ? "info" : "not_proven",
      status: observed("verification-result") === "observed" ? "observed" : "not_proven",
      summary: `intents=${trajectory.verificationIntentIds.length}; results=${trajectory.verificationResultIds.length}; selected=${observed("verification-intent")}; commandExitZeroIsTaskSuccess=false; verificationSuccess=not-proven`,
      machineEventCorrelationIds: [
        ...(stage("verification-intent")?.eventIds ?? []),
        ...(stage("verification-result")?.eventIds ?? []),
      ],
      notProvenClaims: [
        ...(stage("verification-intent")?.notProvenClaims ?? []),
        ...(stage("verification-result")?.notProvenClaims ?? []),
      ],
    }),
    section({
      kind: "repair",
      title: "Repair",
      severity: trajectory.repairHandoffIds.length > 0 ? "info" : "not_proven",
      status: trajectory.repairHandoffIds.length > 0 ? "observed" : "not_proven",
      summary: `handoffs=${trajectory.repairHandoffIds.length}; proposals=${trajectory.repairProposalIds.length}; applies=${trajectory.repairApplyIds.length}; postRepairVerification=${observed("post-repair-verification")}; repairSuccess=not-proven`,
      machineEventCorrelationIds: [
        ...(stage("repair-handoff")?.eventIds ?? []),
        ...(stage("repair-proposal")?.eventIds ?? []),
        ...(stage("repair-apply")?.eventIds ?? []),
        ...(stage("post-repair-verification")?.eventIds ?? []),
      ],
      notProvenClaims: [
        ...(stage("repair-handoff")?.notProvenClaims ?? []),
        ...(stage("repair-proposal")?.notProvenClaims ?? []),
        ...(stage("repair-apply")?.notProvenClaims ?? []),
        ...(stage("post-repair-verification")?.notProvenClaims ?? []),
      ],
    }),
    section({
      kind: "save_point",
      title: "Save point",
      severity: trajectory.savePointIds.length > 0 ? "info" : "not_proven",
      status: trajectory.savePointIds.length > 0 ? "observed" : "not_proven",
      summary: `savePoints=${trajectory.savePointIds.length}; bundles=${trajectory.nextTurnBundleIds.length}; steering=${trajectory.steeringMessageIds.length}; followUps=${trajectory.followUpMessageIds.length}; deliveryPolicies=${trajectory.deliveryPolicyIds.length}; nextTurnExecuted=false; savePointSuccess=not-proven`,
      machineEventCorrelationIds: [
        ...(stage("save-point")?.eventIds ?? []),
        ...(stage("next-turn-preparation")?.eventIds ?? []),
        ...(stage("next-turn-delivery-policy")?.eventIds ?? []),
      ],
      notProvenClaims: stage("save-point")?.notProvenClaims ?? [],
    }),
    section({
      kind: "session",
      title: "Session",
      severity: trajectory.sessionProjectionIds.length > 0 ? "info" : "not_proven",
      status: trajectory.sessionProjectionIds.length > 0 ? "observed" : "not_proven",
      summary: `projections=${trajectory.sessionProjectionIds.length}; readiness=${trajectory.continuationReadinessIds.length}; replaySummaries=${trajectory.replaySafeLoopStateSummaryIds.length}; branch=${observed("branch-gap")}; compaction=${observed("compaction-gap")}; storageBackedBranching=not-proven`,
      notProvenClaims: [
        ...(stage("session-active-path")?.notProvenClaims ?? []),
        ...(stage("continuation-readiness")?.notProvenClaims ?? []),
        ...(stage("replay-safe-loop-state")?.notProvenClaims ?? []),
        ...(stage("branch-gap")?.notProvenClaims ?? []),
        ...(stage("compaction-gap")?.notProvenClaims ?? []),
      ],
    }),
    section({
      kind: "context",
      title: "Context",
      severity: trajectory.contextRebuildProjectionIds.length > 0 ? "info" : "not_proven",
      status: trajectory.contextRebuildProjectionIds.length > 0 ? "observed" : "not_proven",
      summary: `rebuildInputs=${trajectory.contextRebuildInputIds.length}; rebuildProjections=${trajectory.contextRebuildProjectionIds.length}; missingFactsVisible=${observed("context-rebuild-projection")}; raw-context=excluded; contextSuccess=not-proven`,
      redaction: "excluded",
      notProvenClaims: [
        ...(stage("context-rebuild-input")?.notProvenClaims ?? []),
        ...(stage("context-rebuild-projection")?.notProvenClaims ?? []),
      ],
    }),
    section({
      kind: "events",
      title: "Events",
      severity: "info",
      status: "observed",
      summary: `events=${trajectory.events.length}; jsonStream=${trajectory.jsonEventStream.length}; nextTurnWaiting=${observed("next-turn-preparation")}; terminalSuccessClaim=false`,
      machineEventCorrelationIds: trajectory.eventIds,
      notProvenClaims: stage("runtime-events")?.notProvenClaims ?? [],
    }),
  ];
}

function taskSection(codingResult: CodingResultSummary): ProductSurfaceSection {
  return section({
    kind: "task",
    title: "Task",
    severity: "info",
    status: "observed",
    summary: codingResult.taskKind,
    facts: [{ label: "kind", value: codingResult.taskKind }],
  });
}

function contextSection(codingResult: CodingResultSummary): ProductSurfaceSection {
  if (codingResult.diagnosis) {
    return section({
      kind: "context",
      title: "Context",
      severity: "info",
      status: "observed",
      summary: `${codingResult.diagnosis.disposition}; evidenceFiles=${codingResult.diagnosis.evidenceFiles.length}; candidates=${codingResult.diagnosis.candidateFiles.length}`,
    });
  }
  return section({
    kind: "context",
    title: "Context",
    severity: "info",
    status: "observed",
    summary: `attemptedFiles=${codingResult.changeSet.attemptedFiles.length}; evidence=${codingResult.evidence.length}; raw-content=excluded`,
    redaction: "excluded",
  });
}

function planSection(codingResult: CodingResultSummary): ProductSurfaceSection {
  const required = codingResult.taskSatisfaction.requiredEvidence[0] ?? "current task contract";
  const reason = codingResult.taskSatisfaction.reasons[0] ?? "no additional plan note";
  return section({
    kind: "plan",
    title: "Plan",
    severity: "info",
    status: "observed",
    summary: `${required}; ${compact(reason)}`,
  });
}

function proposalSection(codingResult: CodingResultSummary): ProductSurfaceSection {
  const proposalSource = markerValue(codingResult.evidence, "proposal-source:") ??
    markerValue(codingResult.evidence, "tool-ecosystem:source:") ??
    "not-proven";
  const state = markerValue(codingResult.evidence, "proposal-state:") ??
    (codingResult.patches && codingResult.patches.length > 0 ? "applied-record-present" : "not-present");
  const targets = codingResult.changeSet.attemptedFiles.length > 0
    ? codingResult.changeSet.attemptedFiles.map((item) => safeText(item, 120)).join(", ")
    : "none";
  const anchor = markerValue(codingResult.evidence, "anchor-quality:") ?? "not-proven";
  return section({
    kind: "proposal",
    title: "Proposal",
    severity: state === "not-present" ? "not_proven" : "info",
    status: state === "not-present" ? "not_proven" : "observed",
    summary: `source=${proposalSource}; state=${state}; targets=${targets}; anchor=${anchor}`,
    sourceEvidenceIds: evidenceIds(codingResult.evidence, [
      "proposal-source:",
      "tool-ecosystem:source:",
      "proposal-state:",
      "anchor-quality:",
    ]),
  });
}

function authoritySection(codingResult: CodingResultSummary): ProductSurfaceSection {
  if (codingResult.evidence.some((entry) => entry.includes("authority:granted"))) {
    return section({
      kind: "authority",
      title: "Authority",
      severity: "info",
      status: "observed",
      summary: "explicit authority granted by product contract",
      sourceEvidenceIds: ["authority:granted"],
    });
  }
  if (
    codingResult.evidence.some((entry) => entry.includes("authority:required")) ||
    codingResult.verification.blockerKind === "approval-denied"
  ) {
    return section({
      kind: "authority",
      title: "Authority",
      severity: "blocked",
      status: "pending_authority",
      summary: "authority required; prompt text alone does not grant apply, verify, repair, tool, or provider authority",
      sourceEvidenceIds: ["authority:required"],
    });
  }
  if (codingResult.changedFiles.length > 0) {
    return section({
      kind: "authority",
      title: "Authority",
      severity: "info",
      status: "observed",
      summary: "authority consumed for recorded mutation path",
    });
  }
  return section({
    kind: "authority",
    title: "Authority",
    severity: "info",
    status: "not_run",
    summary: "no mutation authority granted",
  });
}

function applySection(codingResult: CodingResultSummary): ProductSurfaceSection {
  if (codingResult.changedFiles.length > 0) {
    return section({
      kind: "apply",
      title: "Apply",
      severity: codingResult.failedFiles.length > 0 ? "partial" : "info",
      status: codingResult.failedFiles.length > 0 ? "partial" : "observed",
      summary: `changed=${codingResult.changedFiles.map((item) => safeText(item, 120)).join(", ")}; failed=${codingResult.failedFiles.length}`,
    });
  }
  if (codingResult.failedFiles.length > 0) {
    return section({
      kind: "apply",
      title: "Apply",
      severity: "error",
      status: "failed",
      summary: `changed=none; failed=${codingResult.failedFiles.map((entry) => `${safeText(entry.path, 120)} (${safeText(entry.reason, 120)})`).join("; ")}`,
    });
  }
  return section({
    kind: "apply",
    title: "Apply",
    severity: "info",
    status: "not_run",
    summary: "not-run",
  });
}

function verificationSection(codingResult: CodingResultSummary): ProductSurfaceSection {
  const command = codingResult.verification.command
    ? safeText(codingResult.verification.command, 160)
    : "not-selected";
  const reason = codingResult.verification.reason
    ? `; reason=${safeText(codingResult.verification.reason)}`
    : "";
  const blocker = codingResult.verification.blockerKind
    ? `; blocker=${codingResult.verification.blockerKind}`
    : "";
  const scope = codingResult.verification.selectionScope
    ? `; scope=${codingResult.verification.selectionScope}`
    : "";
  return section({
    kind: "verification",
    title: "Verification",
    severity: verificationSeverity(codingResult.verification.status),
    status: verificationStatus(codingResult.verification.status),
    summary: `status=${codingResult.verification.status}; command=${command}${scope}${blocker}${reason}`,
    notProvenClaims: codingResult.verification.status === "passed"
      ? []
      : ["relevant verification did not pass"],
  });
}

function repairSection(codingResult: CodingResultSummary): ProductSurfaceSection {
  const notes = codingResult.repair.notes.length > 0
    ? `; notes=${codingResult.repair.notes.map((item) => safeText(item)).join(" | ")}`
    : "";
  const originalFailure = codingResult.evidence.some((entry) => entry.includes("original-failure-preserved"))
    ? "; original-failure=preserved"
    : "";
  return section({
    kind: "repair",
    title: "Repair",
    severity: repairSeverity(codingResult.repair.status),
    status: repairStatus(codingResult.repair.status),
    summary: `status=${codingResult.repair.status}; attempts=${codingResult.repair.attempts}${originalFailure}${notes}`,
  });
}

function toolsSection(codingResult: CodingResultSummary): ProductSurfaceSection {
  const toolMarkers = codingResult.evidence
    .filter((entry) =>
      entry.startsWith("tool-ecosystem:receipt:") ||
      entry.startsWith("tool-ecosystem:source:") ||
      entry.startsWith("tool-ecosystem:relevance:") ||
      entry.startsWith("runtime-receipt:"),
    )
    .slice(0, 5);
  const provenance = codingResult.provenance?.toolExecutions ?? [];
  if (toolMarkers.length === 0 && provenance.length === 0) {
    return section({
      kind: "tools",
      title: "Tools",
      severity: "info",
      status: "not_run",
      summary: "not-used",
    });
  }
  const provenanceSummary = provenance
    .slice(-2)
    .map((entry) => `${safeText(entry.toolName, 80)}:${entry.kind}`)
    .join(", ");
  return section({
    kind: "tools",
    title: "Tools",
    severity: "info",
    status: "observed",
    summary: [
      toolMarkers.length > 0 ? `receipts=${toolMarkers.length}` : undefined,
      provenanceSummary ? `executions=${provenanceSummary}` : undefined,
      "task-success-requires-relevance",
    ].filter(Boolean).join("; "),
    sourceEvidenceIds: toolMarkers.map((entry) => safeText(entry, 120)),
  });
}

function resourceSections(input: ProductSurfaceInput): ProductSurfaceSection[] {
  const projection = input.resourceProjection;
  if (!projection) {
    return [];
  }
  return [section({
    kind: "resources",
    title: "Resources",
    severity: projection.resources.length > 0 ? "info" : "not_proven",
    status: "observed",
    summary: `count=${projection.resources.length}; registry=${projection.registryMode}; dynamic=${projection.dynamicDiscovery}; execution=${projection.pluginExecution}; providerDefault=${projection.providerDefaultEnablement}`,
    facts: [
      { label: "resourceCount", value: String(projection.resources.length) },
      { label: "dynamicDiscovery", value: projection.dynamicDiscovery },
      { label: "pluginExecution", value: projection.pluginExecution },
    ],
    notProvenClaims: projection.notProvenClaims.map((item) => safeText(item)),
  })];
}

function providerSections(input: ProductSurfaceInput): ProductSurfaceSection[] {
  const registry = input.providerRegistry;
  if (!registry) {
    return [];
  }
  return [section({
    kind: "provider",
    title: "Provider",
    severity: registry.providerDefaultEnablement === "disabled" ? "not_proven" : "warning",
    status: "not_proven",
    summary: `providers=${registry.providers.length}; models=${registry.models.length}; defaultEnablement=${registry.providerDefaultEnablement}; dynamic=${registry.dynamicProviderLoading}; externalPackages=${registry.externalPackageLoading}`,
    facts: [
      { label: "providerCount", value: String(registry.providers.length) },
      { label: "modelCount", value: String(registry.models.length) },
      { label: "defaultEnablement", value: registry.providerDefaultEnablement },
    ],
    notProvenClaims: registry.notProvenClaims.map((item) => safeText(item)),
  })];
}

function packageSections(input: ProductSurfaceInput): ProductSurfaceSection[] {
  const inventory = input.packageInventory;
  if (!inventory) {
    return [];
  }
  return [section({
    kind: "packages",
    title: "Packages",
    severity: inventory.conflicts.length > 0 ? "warning" : "not_proven",
    status: "observed",
    summary: `count=${inventory.packages.length}; conflicts=${inventory.conflicts.length}; installation=${inventory.packageInstallation}; loading=${inventory.packageLoading}; scripts=${inventory.scriptExecution}`,
    facts: [
      { label: "packageCount", value: String(inventory.packages.length) },
      { label: "conflictCount", value: String(inventory.conflicts.length) },
      { label: "packageInstallation", value: inventory.packageInstallation },
    ],
    notProvenClaims: inventory.notProvenClaims.map((item) => safeText(item)),
    machineEventCorrelationIds: inventory.conflicts.map((item) => item.conflictId),
  })];
}

function sessionSections(input: ProductSurfaceInput): ProductSurfaceSection[] {
  const projection = input.sessionProjection;
  if (!projection) {
    return [];
  }
  return [section({
    kind: "session",
    title: "Session",
    severity: projection.terminal.terminalSuccessClaim ? "warning" : "info",
    status: "observed",
    summary: `activePath=${projection.activePath.length}; tree=${projection.treeSupport}; branch=${projection.branchSupport}; terminalSuccessClaim=${projection.terminal.terminalSuccessClaim}`,
  })];
}

function eventSections(input: ProductSurfaceInput): ProductSurfaceSection[] {
  const events = input.runtimeEvents;
  if (!events) {
    return [];
  }
  const lastEvent = events[events.length - 1];
  return [section({
    kind: "events",
    title: "Events",
    severity: "info",
    status: "observed",
    summary: `count=${events.length}; last=${lastEvent?.type ?? "none"}; terminalSuccessClaim=false`,
    machineEventCorrelationIds: events.map((event) => event.id),
    notProvenClaims: events.flatMap((event) => event.notProvenClaims.map((claim) => safeText(claim))),
  })];
}

function section(input: {
  readonly kind: ProductSurfaceSectionKind;
  readonly title: string;
  readonly severity: ProductSurfaceSeverity;
  readonly status: ProductSurfaceStatus;
  readonly summary: string;
  readonly facts?: readonly ProductSurfaceFact[];
  readonly redaction?: "none" | "applied" | "excluded";
  readonly notProvenClaims?: readonly string[];
  readonly sourceEvidenceIds?: readonly string[];
  readonly machineEventCorrelationIds?: readonly string[];
}): ProductSurfaceSection {
  const summary = safeText(input.summary);
  const facts = (input.facts ?? []).map((fact) => ({
    ...fact,
    label: safeText(fact.label, 80),
    value: safeText(fact.value),
  }));
  const notProvenClaims = (input.notProvenClaims ?? []).map((item) => safeText(item));
  const sourceEvidenceIds = (input.sourceEvidenceIds ?? []).map((item) => safeText(item, 120));
  const machineEventCorrelationIds = (input.machineEventCorrelationIds ?? []).map((item) => safeText(item, 120));
  const redaction = input.redaction ?? (
    summary.includes("[redacted") ||
    facts.some((fact) => fact.value.includes("[redacted")) ||
    notProvenClaims.some((item) => item.includes("[redacted"))
      ? "applied"
      : "none"
  );
  return {
    kind: input.kind,
    title: input.title,
    severity: input.severity,
    status: input.status,
    summary,
    facts,
    redaction,
    notProvenClaims,
    sourceEvidenceIds,
    machineEventCorrelationIds,
  };
}

function verdictSeverity(truthStatus: string): ProductSurfaceSeverity {
  switch (truthStatus) {
    case "verified-success":
    case "verified-repaired-success":
      return "success";
    case "partial":
      return "partial";
    case "verification-failed":
      return "error";
    case "stopped-authority-required":
    case "blocked":
      return "blocked";
    case "not-proven":
      return "not_proven";
    default:
      return "info";
  }
}

function verdictStatus(truthStatus: string): ProductSurfaceStatus {
  switch (truthStatus) {
    case "verified-success":
    case "verified-repaired-success":
      return "passed";
    case "partial":
      return "partial";
    case "verification-failed":
      return "failed";
    case "stopped-authority-required":
      return "pending_authority";
    case "blocked":
      return "blocked";
    case "not-proven":
      return "not_proven";
    default:
      return "observed";
  }
}

function verificationSeverity(status: CodingResultSummary["verification"]["status"]): ProductSurfaceSeverity {
  switch (status) {
    case "passed":
      return "success";
    case "failed":
      return "error";
    case "blocked":
      return "blocked";
    case "skipped":
      return "partial";
    case "not-requested":
      return "not_proven";
    default:
      return "info";
  }
}

function verificationStatus(status: CodingResultSummary["verification"]["status"]): ProductSurfaceStatus {
  switch (status) {
    case "passed":
      return "passed";
    case "failed":
      return "failed";
    case "blocked":
      return "blocked";
    case "skipped":
      return "not_run";
    case "not-requested":
      return "not_proven";
    default:
      return "observed";
  }
}

function repairSeverity(status: CodingResultSummary["repair"]["status"]): ProductSurfaceSeverity {
  switch (status) {
    case "recovered":
      return "success";
    case "failed":
      return "error";
    case "not-needed":
      return "info";
    default:
      return "info";
  }
}

function repairStatus(status: CodingResultSummary["repair"]["status"]): ProductSurfaceStatus {
  switch (status) {
    case "recovered":
      return "passed";
    case "failed":
      return "failed";
    case "not-needed":
      return "not_run";
    default:
      return "observed";
  }
}

function markerValue(evidence: readonly string[], prefix: string): string | undefined {
  const marker = evidence.find((entry) => entry.startsWith(prefix));
  return marker ? safeText(marker.slice(prefix.length), 120) : undefined;
}

function evidenceIds(evidence: readonly string[], prefixes: readonly string[]): string[] {
  return evidence
    .filter((entry) => prefixes.some((prefix) => entry.startsWith(prefix)))
    .map((entry) => safeText(entry, 120));
}

function safeText(value: string, maxLength = 160): string {
  return compact(value, maxLength)
    .replace(/\bprovider\.env\b[^\s;]*/gi, "provider-config=[redacted]")
    .replace(/\b(raw[_ -]?provider[_ -]?output|rawProviderOutput)\b[^\s;]*/gi, "[raw-content-excluded]")
    .replace(/\bhidden[-_ ]?reasoning\b[^\s;]*/gi, "[raw-content-excluded]")
    .replace(/\b(stdout|stderr)\b[\s\S]*/gi, "[raw-content-excluded]");
}
