import type { ProviderStreamAdapterProjection } from "../../runtime/loop/providerStreamAdapter.js";
import type { RuntimeProjectionEvent } from "../../runtime/events/projection.js";
import type { ModelBoundaryPhaseProjection } from "../../runtime/loop/modelBoundary.js";
import { factValue, section, safeText } from "./shared.js";
import type { ContextPlanningBlockStatus, ContextPlanningBlockSummary } from "../../context/acquisition/summary.js";
import type { ProductSurfaceInput, ProductSurfaceSection, ProductSurfaceSeverity, ProductSurfaceStatus } from "./types.js";

/** Runtime-phase surface sections: provider, model boundary, loop, and trajectory. */

export function providerStreamAdapterSections(
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

export function modelBoundarySections(
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

export function contextPlanningSections(
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

export function contextPlanningSeverity(status: ContextPlanningBlockStatus): ProductSurfaceSeverity {
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

export function contextPlanningSurfaceStatus(status: ContextPlanningBlockStatus): ProductSurfaceStatus {
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

export function productLoopAdapterSections(input: ProductSurfaceInput): ProductSurfaceSection[] {
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
      summary: `adapter=${adapter.adapterId}; statuses=${statusSummary}; productIntegrated=${productIntegrated}; completionConsumer=${adapter.completionConsumer.viewStatus}; terminalSuccessClaim=false`,
      machineEventCorrelationIds: adapter.safeReferences.runtimeEventIds,
      notProvenClaims: adapter.notProvenClaims,
    }),
    section({
      kind: "loop",
      title: "Product completion consumer",
      severity: adapter.completionConsumer.viewStatus === "complete_view"
        ? "info"
        : "not_proven",
      status: adapter.completionConsumer.observed ? "observed" : "not_proven",
      summary:
        `packet=${adapter.completionConsumer.packetStatus ?? "not-observed"}; resultStatus=${adapter.completionConsumer.resultOwnedTerminalStatus ?? "not-observed"}; loopDecision=${adapter.completionConsumer.loopDecision ?? "not-observed"}; closeout=${adapter.completionConsumer.closeoutState ?? "not-observed"}; missingProof=${adapter.completionConsumer.missingProofItems.join(",") || "none"}; originalFailure=${adapter.completionConsumer.originalFailureSummary ?? "not-observed"}; terminalSuccessClaim=false`,
      machineEventCorrelationIds: adapter.safeReferences.productCompletionPacketIds,
      notProvenClaims: adapter.completionConsumer.notProvenClaims,
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

export function productLoopCloseoutSections(
  event: RuntimeProjectionEvent | undefined,
): ProductSurfaceSection[] {
  if (!event) {
    return [];
  }
  return [
    section({
      kind: "loop",
      title: "Product loop closeout",
      severity: event.facts.status === "complete" ? "success" : "not_proven",
      status: event.facts.status === "complete" ? "passed" : "not_proven",
      summary:
        `status=${factValue(event.facts.status)}; resultStatus=${factValue(event.facts.resultOwnedTerminalStatus)}; loopDecision=${factValue(event.facts.loopOwnedControlDecision)}; nextAction=${factValue(event.facts.nextAction)}; terminalSuccessClaim=false`,
      facts: [
        {
          label: "resultOwnedTerminalStatus",
          value: factValue(event.facts.resultOwnedTerminalStatus),
        },
        {
          label: "resultOwnedTerminalClassification",
          value: factValue(event.facts.resultOwnedTerminalClassification),
        },
        {
          label: "loopOwnedControlDecision",
          value: factValue(event.facts.loopOwnedControlDecision),
        },
        {
          label: "nextAction",
          value: factValue(event.facts.nextAction),
        },
        {
          label: "originalFailure",
          value: factValue(event.facts.originalFailureSummary),
        },
        {
          label: "repairChain",
          value: factValue(event.facts.repairChainSummary),
        },
        {
          label: "missingProof",
          value: safeText(String(event.facts.missingProofItems ?? "not-observed"), 320),
        },
      ],
      machineEventCorrelationIds: [event.id],
      notProvenClaims: event.notProvenClaims,
    }),
  ];
}

export function productCompletionPacketSections(
  event: RuntimeProjectionEvent | undefined,
): ProductSurfaceSection[] {
  if (!event) {
    return [];
  }
  return [
    section({
      kind: "loop",
      title: "Product completion packet",
      severity: event.facts.status === "complete" ? "success" : "not_proven",
      status: event.facts.status === "complete" ? "passed" : "not_proven",
      summary:
        `status=${factValue(event.facts.status)}; resultStatus=${factValue(event.facts.resultOwnedTerminalStatus)}; loopDecision=${factValue(event.facts.loopDecision)}; closeout=${factValue(event.facts.closeoutState)}; nextAction=${factValue(event.facts.nextAction)}; terminalSuccessClaim=false`,
      facts: [
        {
          label: "resultStatus",
          value: factValue(event.facts.resultOwnedTerminalStatus),
        },
        {
          label: "loopDecision",
          value: factValue(event.facts.loopDecision),
        },
        {
          label: "closeoutState",
          value: factValue(event.facts.closeoutState),
        },
        {
          label: "originalFailure",
          value: factValue(event.facts.originalFailure),
        },
        {
          label: "repairRequired",
          value: factValue(event.facts.repairRequiredFacts),
        },
        {
          label: "proposal",
          value: factValue(event.facts.proposalFacts),
        },
        {
          label: "authority",
          value: factValue(event.facts.authorityFacts),
        },
        {
          label: "apply",
          value: factValue(event.facts.applyObservationFacts),
        },
        {
          label: "postRepairVerification",
          value: factValue(event.facts.postRepairVerificationFacts),
        },
        {
          label: "missingProof",
          value: safeText(String(event.facts.missingProofItems ?? "not-observed"), 320),
        },
      ],
      machineEventCorrelationIds: [event.id],
      notProvenClaims: event.notProvenClaims,
    }),
  ];
}

export function loopTrajectorySections(input: ProductSurfaceInput): ProductSurfaceSection[] {
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
  const verificationResultEvent = trajectory.events.find((event) =>
    event.type === "loop-verification-result-observed"
  );
  const repairHandoffEvent = trajectory.events.find((event) =>
    event.type === "loop-repair-handoff-observed" &&
    event.facts.handoffId !== undefined
  );
  const repairProposalEvent = trajectory.events.find((event) =>
    event.type === "loop-repair-handoff-observed" &&
    event.facts.readinessStatus !== undefined
  );
  const repairAuthorityEvent = trajectory.events.find((event) =>
    event.type === "loop-repair-handoff-observed" &&
    event.facts.authorityDecision !== undefined
  );
  const repairApplyRequestEvent = trajectory.events.find((event) =>
    event.type === "loop-repair-handoff-observed" &&
    event.facts.requestId !== undefined
  );
  const repairApplyEvent = trajectory.events.find((event) =>
    event.type === "loop-repair-handoff-observed" &&
    event.facts.repairApplyId !== undefined
  );
  const postRepairVerificationEvent = trajectory.events.find((event) =>
    event.type === "loop-verification-result-observed" &&
    event.facts.resultId !== undefined &&
    event.facts.verdictCandidateAvailable !== undefined
  ) ?? trajectory.events.find((event) =>
    event.type === "loop-verification-result-observed" &&
    (event.facts.requirementId !== undefined || event.facts.resultId !== undefined) &&
    (event.facts.sourceRepairApplyId !== undefined ||
      event.facts.verdictCandidateAvailable !== undefined)
  );
  const verificationRuntimeReceiptIds =
    verificationResultEvent?.facts.runtimeReceiptIds;
  const verificationRuntimeReceiptCount = Array.isArray(verificationRuntimeReceiptIds)
    ? verificationRuntimeReceiptIds.length
    : 0;
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
      summary: `metadata=${trajectory.providerMetadataIds.length}; requestPreparations=${trajectory.requestPreparationIds.length}; modelResponses=${stage("model-boundary")?.sourceIds.length ?? 0}; providerCalled=not-proven`,
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
      summary: `toolBatches=${stage("tool-call-batch")?.sourceIds.length ?? 0}; dispatch=${observed("before-tool-policy")}; toolResults=${observed("tool-result-details")}; outcomes=${trajectory.toolOutcomeBundleIds.length}; resultMessages=${trajectory.toolResultMessageIds.length}; receipts=${trajectory.receiptIds.length}; executed=${executedTools}; blocked=${blockedTools}; authorityRequired=${authorityRequiredTools}; failed=${failedTools}; unsupported=${unsupportedTools}; notDispatched=${notDispatchedTools}; toolSuccess=not-proven`,
      notProvenClaims: [
        ...(stage("tool-call-batch")?.notProvenClaims ?? []),
        ...(stage("tool-result-details")?.notProvenClaims ?? []),
        ...(stage("tool-result-messages")?.notProvenClaims ?? []),
        ...(stage("tool-outcome")?.notProvenClaims ?? []),
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
      summary: `verificationSuccess=not-proven; taskRelevant=${factValue(verificationResultEvent?.facts.relevanceStatus)}; coverage=${factValue(verificationResultEvent?.facts.coverageStatus)}; authority=${factValue(verificationResultEvent?.facts.authorityRequirement)}; runtimeReceipts=${verificationRuntimeReceiptCount}; repairEligible=${verificationResultEvent?.facts.repairEligible === true ? "yes" : "no"}; postRepair=${factValue(postRepairVerificationEvent?.facts.status ?? postRepairVerificationEvent?.facts.requirementStatus)}; verdictCandidate=${postRepairVerificationEvent?.facts.verdictCandidateAvailable === true ? "input-only" : "not_available"}; commandExitZeroIsTaskSuccess=false; intents=${trajectory.verificationIntentIds.length}; results=${trajectory.verificationResultIds.length}; selected=${observed("verification-intent")}`,
      machineEventCorrelationIds: [
        ...(stage("verification-intent")?.eventIds ?? []),
        ...(stage("verification-result")?.eventIds ?? []),
        ...(stage("post-repair-verification")?.eventIds ?? []),
      ],
      notProvenClaims: [
        ...(stage("verification-intent")?.notProvenClaims ?? []),
        ...(stage("verification-result")?.notProvenClaims ?? []),
        ...(stage("post-repair-verification")?.notProvenClaims ?? []),
      ],
    }),
    section({
      kind: "repair",
      title: "Repair",
      severity: trajectory.repairHandoffIds.length > 0 ? "info" : "not_proven",
      status: trajectory.repairHandoffIds.length > 0 ? "observed" : "not_proven",
      summary: `repairSuccess=not-proven; handoffs=${trajectory.repairHandoffIds.length}; proposals=${trajectory.repairProposalIds.length}; applies=${trajectory.repairApplyIds.length}`,
      facts: [
        {
          label: "originalFailure",
          value: factValue(repairHandoffEvent?.facts.originalFailurePreserved),
        },
        {
          label: "failureClass",
          value: factValue(repairHandoffEvent?.facts.failureClass),
        },
        {
          label: "repairBlocker",
          value: factValue(repairHandoffEvent?.facts.repairBlocker),
        },
        {
          label: "proposalReadiness",
          value: factValue(repairProposalEvent?.facts.readinessStatus),
        },
        {
          label: "apply",
          value: factValue(
            repairApplyEvent?.facts.repairApplyStatus ??
              repairProposalEvent?.facts.applyStatus,
          ),
        },
        {
          label: "authority",
          value: factValue(
            repairApplyEvent?.facts.authorityState ??
              repairApplyRequestEvent?.facts.authorityState ??
              repairAuthorityEvent?.facts.authorityDecision,
          ),
        },
        {
          label: "applyReadiness",
          value: factValue(
            repairApplyEvent?.facts.applyReadiness ??
              repairApplyRequestEvent?.facts.applyReadiness,
          ),
        },
        {
          label: "applyBlocker",
          value: factValue(
            repairApplyEvent?.facts.applyBlocker ??
              repairApplyRequestEvent?.facts.applyBlocker,
          ),
        },
        {
          label: "applyAttempted",
          value: factValue(repairApplyEvent?.facts.applyAttempted),
        },
        {
          label: "postRepairVerification",
          value: factValue(
            postRepairVerificationEvent?.facts.status ??
              postRepairVerificationEvent?.facts.requirementStatus ??
            repairApplyEvent?.facts.postRepairVerificationStatus ??
              repairApplyRequestEvent?.facts.postRepairVerificationStatus ??
              repairProposalEvent?.facts.postRepairVerificationStatus ??
              observed("post-repair-verification"),
          ),
        },
        {
          label: "verdictCandidate",
          value: postRepairVerificationEvent?.facts.verdictCandidateAvailable === true
            ? "input-only"
            : "not_available",
        },
      ],
      machineEventCorrelationIds: [
        ...(stage("repair-handoff")?.eventIds ?? []),
        ...(stage("repair-proposal")?.eventIds ?? []),
        ...(stage("repair-authority")?.eventIds ?? []),
        ...(stage("repair-apply-request")?.eventIds ?? []),
        ...(stage("repair-apply")?.eventIds ?? []),
        ...(stage("post-repair-verification")?.eventIds ?? []),
      ],
      notProvenClaims: [
        ...(stage("repair-handoff")?.notProvenClaims ?? []),
        ...(stage("repair-proposal")?.notProvenClaims ?? []),
        ...(stage("repair-authority")?.notProvenClaims ?? []),
        ...(stage("repair-apply-request")?.notProvenClaims ?? []),
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
      summary: `projections=${trajectory.sessionProjectionIds.length}; readiness=${trajectory.continuationReadinessIds.length}; replaySummaries=${trajectory.replaySafeLoopStateSummaryIds.length}; branch=${observed("branch-gap")}; compaction=${observed("compaction-gap")}; branchFacts=${observed("session-active-path")}`,
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

