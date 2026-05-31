import { describe, expect, it } from "vitest";

import type { ContextPlanningBlockSummary } from "../../context/acquisition/summary.js";
import { projectProviderRegistry, unknownProviderCompatibilityFlags } from "../registry/provider.js";
import { createModelRequestBoundary } from "./boundary.js";

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
    expect(serialized).not.toMatch(/sk-1234567890|Bearer secret|token=secret|oldText=before|newText=after|private-agents-real|hidden reasoning/i);
    expect(boundary.terminalSuccessClaim).toBe(false);
  });
});

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
