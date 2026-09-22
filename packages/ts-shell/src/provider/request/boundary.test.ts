import { describe, expect, it } from "vitest";

import type { ContextPlanningBlockSummary } from "../../context/acquisition/summary.js";
import { buildLoopContextRebuildInput } from "../../context/rebuildInput.js";
import { projectSessionContextRebuild } from "../../context/sessionContextRebuildProjection.js";
import { evaluateContinuationReadiness } from "../../session/continuation/readiness.js";
import { projectSessionTree } from "../../session/sessionTreeProjection.js";
import { prepareNextTurnBundle } from "../../turn/nextTurnBundle.js";
import { projectProviderRegistry, unknownProviderCompatibilityFlags } from "../registry/provider.js";
import { createModelRequestBoundary, prepareNextTurnModelRequest } from "./boundary.js";

describe("model request boundary", () => {
  it("consumes provider registry and context planning facts without granting success", () => {
    const registry = projectProviderRegistry({
      providers: [{
        providerId: "synthetic-provider",
        safeLabel: "Synthetic provider",
        providerKind: "custom",
        endpointClass: "unknown",
        authMode: "none",
        defaultEnabled: false,
        requiresExplicitOptIn: true,
        supportsFallback: "unknown",
        compatibility: unknownProviderCompatibilityFlags(),
        riskLevel: "low",
      }],
      models: [{
        modelId: "fixture-model",
        safeLabel: "Fixture model",
        providerId: "synthetic-provider",
        family: "fixture",
        compatibility: unknownProviderCompatibilityFlags(),
        knownLimitations: [],
      }],
    });
    const boundary = createModelRequestBoundary({
      requestId: "request-1",
      turnId: "turn-1",
      providerSafeLabel: "Synthetic provider",
      modelSafeLabel: "Fixture model",
      providerReadinessStatus: "ready",
      providerRegistry: registry,
      contextPlanningSummary: summary({
        requiredMissingFacts: [],
        constraints: ["review-only", "no-write"],
      }),
    });

    expect(boundary).toMatchObject({
      requestId: "request-1",
      readinessStatus: "review_only",
      providerDefaultEnablement: "disabled",
      providerRequiresExplicitOptIn: true,
      registryProviderCount: 1,
      registryModelCount: 1,
      mutationAuthority: "not-granted",
      terminalSuccessClaim: false,
    });
    expect(boundary.planningConstraints).toEqual(["review-only", "no-write"]);
    expect(boundary.notProvenClaims).toEqual(
      expect.arrayContaining([
        "model-request-prepared-is-not-provider-success",
        "cp-plan-handoff-is-not-mutation-authority",
        "request-ready-is-not-task-success",
      ]),
    );
  });

  it("redacts unsafe request metadata and blocks missing required facts", () => {
    const boundary = createModelRequestBoundary({
      requestId: "sk-1234567890",
      providerSafeLabel: "provider.env Authorization: Bearer secret",
      modelSafeLabel: "raw provider output: hidden reasoning oldText=before newText=after",
      providerReadinessStatus: "ready",
      contextPlanningSummary: summary({
        requiredMissingFacts: ["raw provider output: token=secret"],
        constraints: ["/home/wang/.private-agents-real/provider.env"],
      }),
    });
    const serialized = JSON.stringify(boundary);

    expect(boundary.readinessStatus).toBe("blocked_missing_required_facts");
    expect(boundary.redaction.status).toBe("redacted");
    expect(serialized).not.toMatch(/sk-1234567890|Bearer secret|token=secret|oldText=before|newText=after|cheers-real|hidden reasoning/i);
    expect(boundary.terminalSuccessClaim).toBe(false);
  });

  it("prepares next-turn request facts without provider call", () => {
    const registry = providerRegistry();
    const boundary = createModelRequestBoundary({
      requestId: "request-next",
      providerId: "synthetic-provider",
      providerSafeLabel: "Synthetic provider",
      modelSafeLabel: "Fixture model",
      providerReadinessStatus: "ready",
      providerRegistry: registry,
      contextPlanningSummary: summary({ requiredMissingFacts: [], constraints: [] }),
    });
    const nextTurnBundle = prepareNextTurnBundle({
      bundleId: "bundle-next",
      turnId: "turn-next",
      toolResultMessages: toolMessages("report-safe"),
      deliveryStatus: "waiting",
    });
    const preparation = prepareNextTurnModelRequest({
      nextTurnBundle,
      modelRequestBoundary: boundary,
      providerRegistry: registry,
      providerId: "synthetic-provider",
      modelId: "fixture-model",
      instructionSummary: "safe instruction",
      taskSummary: "safe task summary",
      planningConstraintIds: ["review-only"],
    });

    expect(preparation).toMatchObject({
      requestPreparationId: "next-turn-request:bundle-next",
      sourceNextTurnBundleId: "bundle-next",
      readinessStatus: "ready_for_explicit_model_invocation",
      providerMetadataId: "synthetic-provider",
      modelMetadataId: "fixture-model",
      terminalSuccessClaim: false,
    });
    expect(preparation.safeRequestMessages.map((message) => message.source)).toEqual([
      "system",
      "task",
      "tool-result",
      "tool-result",
    ]);
    expect(preparation.providerMetadata).toMatchObject({
      providerSafeLabel: "Synthetic provider",
      modelSafeLabel: "Fixture model",
      providerOptInState: "required",
      authReadiness: "resolved",
      terminalSuccessClaim: false,
    });
    expect(preparation.notProvenClaims).toEqual(
      expect.arrayContaining([
        "request-prepared-is-not-provider-call",
        "provider-metadata-is-not-provider-success",
        "safe-message-prepared-is-not-model-response",
      ]),
    );
  });

  it("distinguishes missing provider, missing model, missing auth, and unsupported model mode", () => {
    const compatibility = unknownProviderCompatibilityFlags();
    const registry = projectProviderRegistry({
      providers: [{
        providerId: "provider-a",
        safeLabel: "Provider A",
        providerKind: "custom",
        endpointClass: "unknown",
        authMode: "api-key",
        defaultEnabled: false,
        requiresExplicitOptIn: true,
        supportsFallback: "unknown",
        compatibility,
        riskLevel: "low",
      }],
      models: [{
        modelId: "model-a",
        safeLabel: "Model A",
        providerId: "provider-a",
        family: "fixture",
        compatibility: {
          ...compatibility,
          streaming: "unsupported",
          toolCalls: "unsupported",
        },
        knownLimitations: [],
      }],
      auth: [{
        providerId: "provider-a",
        authSourceKind: "none",
        authMode: "api-key",
        resolutionStatus: "missing",
      }],
    });
    const boundary = createModelRequestBoundary({
      requestId: "request-provider-state",
      providerId: "provider-a",
      providerSafeLabel: "Provider A",
      modelSafeLabel: "Model A",
      providerReadinessStatus: "ready",
      providerRegistry: registry,
    });
    const missingProvider = prepareNextTurnModelRequest({
      nextTurnBundle: prepareNextTurnBundle({ bundleId: "bundle-missing-provider", turnId: "turn-a" }),
      modelRequestBoundary: boundary,
      providerRegistry: registry,
      providerId: "missing-provider",
    });
    const missingModel = prepareNextTurnModelRequest({
      nextTurnBundle: prepareNextTurnBundle({ bundleId: "bundle-missing-model", turnId: "turn-a" }),
      modelRequestBoundary: boundary,
      providerRegistry: registry,
      providerId: "provider-a",
      modelId: "missing-model",
    });
    const unsupported = prepareNextTurnModelRequest({
      nextTurnBundle: prepareNextTurnBundle({ bundleId: "bundle-unsupported", turnId: "turn-a" }),
      modelRequestBoundary: boundary,
      providerRegistry: registry,
      providerId: "provider-a",
      modelId: "model-a",
    });

    expect(missingProvider.readinessStatus).toBe("unsupported");
    expect(missingProvider.blockedReasons).toContain("provider-fact:provider-metadata-missing");
    expect(missingModel.readinessStatus).toBe("unsupported");
    expect(missingModel.blockedReasons).toContain("provider-fact:model-metadata-missing");
    expect(unsupported.readinessStatus).toBe("unsupported");
    expect(unsupported.providerMetadata.authReadiness).toBe("missing");
    expect(unsupported.blockedReasons).toEqual(
      expect.arrayContaining([
        "provider-fact:auth-readiness:missing",
        "provider-fact:unsupported-model-mode:streaming",
        "provider-fact:unsupported-model-mode:tool-calls",
      ]),
    );
    expect(JSON.stringify({ missingProvider, missingModel, unsupported })).not.toContain('"success":true');
  });

  it("uses continuation readiness to block unsafe next-turn requests without success inflation", () => {
    const sessionProjection = projectSessionTree({
      session: {
        id: "sess-request-continuation",
        projectRoot: "/workspace",
        createdAt: "2026-06-01T00:00:00.000Z",
        updatedAt: "2026-06-01T00:00:01.000Z",
        status: "active",
        turns: [{ role: "user", content: "continue" }],
      },
    });
    const contextRebuildProjection = projectSessionContextRebuild({
      sessionProjection,
      requiredFacts: ["latest-save-point"],
      staleFacts: ["workspace-index"],
    });
    const rebuildInput = buildLoopContextRebuildInput({
      sessionProjection,
      contextRebuildProjection,
    });
    const continuationReadiness = evaluateContinuationReadiness({
      sessionProjection,
      contextRebuildProjection,
      rebuildInput,
      requiredFacts: ["latest-save-point"],
      staleFacts: ["workspace-index"],
    });
    const nextTurnBundle = prepareNextTurnBundle({
      bundleId: "bundle-continuation",
      turnId: "turn-continuation",
      toolResultMessages: toolMessages("report-safe"),
      deliveryStatus: "waiting",
    });
    const boundary = createModelRequestBoundary({
      requestId: "request-continuation",
      providerSafeLabel: "Synthetic provider",
      modelSafeLabel: "Fixture model",
      providerReadinessStatus: "ready",
      providerRegistry: providerRegistry(),
      continuationReadiness,
    });
    const preparation = prepareNextTurnModelRequest({
      nextTurnBundle,
      modelRequestBoundary: boundary,
      providerRegistry: providerRegistry(),
      continuationReadiness,
    });

    expect(boundary).toMatchObject({
      readinessStatus: "blocked_missing_required_facts",
      continuationReadinessId: continuationReadiness.readinessId,
      continuationReadinessStatus: "blocked_missing_required_facts",
      terminalSuccessClaim: false,
    });
    expect(preparation).toMatchObject({
      readinessStatus: "blocked_by_missing_context",
      continuationReadinessId: continuationReadiness.readinessId,
      continuationReadinessStatus: "blocked_missing_required_facts",
      terminalSuccessClaim: false,
    });
    expect(preparation.continuationBlockedReasons).toEqual(
      expect.arrayContaining(["continuation:blocked_missing_required_facts"]),
    );
    expect(preparation.safeRequestMessages.map((message) => message.source)).toContain("continuation");
    expect(preparation.notProvenClaims).toEqual(
      expect.arrayContaining([
        "continuation-readiness-is-not-provider-call",
        "continuation-readiness-is-not-task-success",
      ]),
    );
  });

  it("preserves partial, blocked, provider, and redaction readiness boundaries", () => {
    const registry = providerRegistry();
    const readyBoundary = createModelRequestBoundary({
      requestId: "request-partial",
      providerSafeLabel: "Synthetic provider",
      modelSafeLabel: "Fixture model",
      providerReadinessStatus: "ready",
      providerRegistry: registry,
    });
    const partial = prepareNextTurnModelRequest({
      nextTurnBundle: prepareNextTurnBundle({
        bundleId: "bundle-partial",
        turnId: "turn-partial",
        toolResultMessages: toolMessages("redacted"),
        toolOutcomeBundle: {
          bundleId: "tool-outcome-bundle:batch-a",
          sourceBatchId: "tool-result-batch:batch-a",
          resultMessageIds: ["tool-result-message:call-safe", "tool-result-message:call-redacted"],
          receiptIds: [],
          executedCount: 1,
          failedCount: 0,
          blockedCount: 0,
          authorityRequiredCount: 0,
          unsupportedCount: 0,
          malformedCount: 0,
          unknownCount: 0,
          notDispatchedCount: 1,
          mixedOutcomeStatus: "mixed_success_and_non_success",
          nextAction: "review_failed_result",
          nextActionReason: "failed or unavailable tool execution needs review before continuing",
          redactionStatus: "redacted",
          detailStatuses: [],
          blockingFacts: ["call-redacted:not_dispatched"],
          notProvenClaims: [],
          terminalSuccessClaim: false,
        },
      }),
      modelRequestBoundary: readyBoundary,
      providerRegistry: registry,
    });
    const providerBlocked = prepareNextTurnModelRequest({
      nextTurnBundle: prepareNextTurnBundle({
        bundleId: "bundle-provider",
        turnId: "turn-provider",
        toolResultMessages: toolMessages("report-safe"),
      }),
      modelRequestBoundary: createModelRequestBoundary({
        requestId: "request-provider",
        providerReadinessStatus: "missing",
      }),
    });
    const redactionBlocked = prepareNextTurnModelRequest({
      nextTurnBundle: prepareNextTurnBundle({
        bundleId: "bundle-redacted",
        turnId: "turn-redacted",
        toolResultMessages: {
          ...toolMessages("redacted"),
          messages: [toolMessages("redacted").messages[1]!],
        },
      }),
      modelRequestBoundary: readyBoundary,
    });

    expect(partial.readinessStatus).toBe("ready_with_partial_tool_results");
    expect(providerBlocked.readinessStatus).toBe("blocked_by_provider_unavailable");
    expect(redactionBlocked.readinessStatus).toBe("blocked_by_redaction");
    expect(JSON.stringify(redactionBlocked)).not.toMatch(
      /token=secret|raw provider output:|hidden reasoning|provider\.env=\/tmp/i,
    );
  });
});

function providerRegistry() {
  return projectProviderRegistry({
    providers: [{
      providerId: "synthetic-provider",
      safeLabel: "Synthetic provider",
      providerKind: "custom",
      endpointClass: "unknown",
      authMode: "none",
      defaultEnabled: false,
      requiresExplicitOptIn: true,
      supportsFallback: "unknown",
      compatibility: unknownProviderCompatibilityFlags(),
      riskLevel: "low",
    }],
    models: [{
      modelId: "fixture-model",
      safeLabel: "Fixture model",
      providerId: "synthetic-provider",
      family: "fixture",
      compatibility: unknownProviderCompatibilityFlags(),
      knownLimitations: [],
    }],
    auth: [{
      providerId: "synthetic-provider",
      authSourceKind: "none",
      authMode: "none",
      resolutionStatus: "resolved",
    }],
  });
}

function toolMessages(redaction: "report-safe" | "redacted") {
  return {
    batchId: "tool-result-message-batch:batch-a",
    dispatchPlanId: "plan-a",
    messages: [
      {
        messageId: "tool-result-message:call-safe",
        role: "tool" as const,
        toolCallId: "call-safe",
        toolName: "read",
        safeContentSummary: "read completed",
        category: "executed_tool_fact" as const,
        deliveryStatus: "prepared" as const,
        redactionStatus: "report-safe" as const,
        notProvenClaims: ["task-success"],
        terminalSuccessClaim: false as const,
      },
      {
        messageId: "tool-result-message:call-redacted",
        role: "tool" as const,
        toolCallId: "call-redacted",
        toolName: "bash",
        safeContentSummary: "token=secret raw provider output: hidden reasoning provider.env=/tmp/x",
        category: "not_dispatched" as const,
        deliveryStatus: "blocked" as const,
        redactionStatus: redaction,
        notProvenClaims: ["task-success"],
        terminalSuccessClaim: false as const,
      },
    ],
    preparedCount: redaction === "report-safe" ? 2 : 1,
    blockedCount: redaction === "report-safe" ? 0 : 1,
    terminalSuccessClaim: false as const,
    notProvenClaims: ["next-turn-success"],
  };
}

function summary(input: {
  readonly requiredMissingFacts: readonly string[];
  readonly constraints: readonly string[];
}): ContextPlanningBlockSummary {
  return {
    summaryId: "summary-1",
    status: input.requiredMissingFacts.length > 0 ? "partial_required_facts_missing" : "review_only_ready",
    discovery: {
      scanProfileId: "scan-1",
      selectedCandidateIds: ["candidate-1"],
      competingCandidateIds: [],
      ambiguityState: "unambiguous-top-candidate",
      omittedCandidateCount: 0,
      missingDiscoveryFacts: [],
    },
    acquisition: {
      mode: "bounded",
      stagedReadStatus: "sufficient-for-review",
      readBudgetStatus: "filesRead=1",
      packetProvenanceCount: 1,
      graphConfidence: "medium",
      unavailableGraphComponents: [],
      staleFacts: [],
      requiredMissingFacts: input.requiredMissingFacts,
      optionalMissingFacts: [],
      nextReadSuggestions: [],
      contextSufficiencyStatus: "sufficient-for-review",
    },
    planning: {
      qualityStatus: "medium",
      planConfidence: "medium",
      assumptions: ["assumption"],
      constraints: input.constraints,
      nextAction: "prepare model request",
    },
    handoff: {
      editHandoffStatus: "review-only-ready",
      editNoWriteStatus: "no-write-authority-granted",
      mutationAuthority: "not-granted",
      exactProposalReadiness: "missing",
      verificationIntentStatus: "selected-not-run",
      verificationSelectedNotRunStatus: "selected-not-run",
    },
    continuation: {
      memoryReuseStatus: "not-reused",
      memoryFreshnessRequirement: "fresh",
      requiredRefreshReads: [],
      optionalRefreshReads: [],
      continuationReadinessStatus: "not-proven",
      replaySafePlanningStateIds: [],
    },
    notProvenClaims: ["context-planning-summary-is-not-task-success"],
    nextAction: "prepare model request",
    redaction: {
      status: "report-safe",
      excluded: [],
    },
    evidence: ["summary-evidence"],
    terminalSuccessClaim: false,
  };
}
