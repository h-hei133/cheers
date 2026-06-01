import { describe, expect, it } from "vitest";

import { prepareNextTurnBundle } from "../../turn/nextTurnBundle.js";
import { projectProviderRegistry, unknownProviderCompatibilityFlags } from "../registry/provider.js";
import { createModelRequestBoundary, prepareNextTurnModelRequest } from "./boundary.js";
import {
  createModelInvocationAttemptEnvelope,
  createModelInvocationGate,
} from "./invocation.js";

describe("model invocation gate", () => {
  it("keeps default prepared requests not attempted and blocked by missing opt-in", () => {
    const preparation = readyPreparation();
    const gate = createModelInvocationGate({ requestPreparation: preparation });
    const attempt = createModelInvocationAttemptEnvelope({ gate });

    expect(gate).toMatchObject({
      sourcePreparedRequestId: preparation.requestPreparationId,
      providerMetadataId: "provider-a",
      modelMetadataId: "model-a",
      optInState: "missing",
      authReadinessState: "resolved",
      eligibilityStatus: "blocked_by_missing_opt_in",
      terminalSuccessClaim: false,
    });
    expect(attempt).toMatchObject({
      sourceGateId: gate.gateId,
      attemptStatus: "blocked",
      failureClass: "provider_config",
      terminalSuccessClaim: false,
    });
    expect(attempt.notProvenClaims).toEqual(
      expect.arrayContaining([
        "eligible-gate-is-not-attempted",
        "invocation-attempted-is-not-provider-success",
      ]),
    );
  });

  it("blocks auth failure without exposing unsafe request facts", () => {
    const preparation = readyPreparation("expired");
    const gate = createModelInvocationGate({
      requestPreparation: preparation,
      explicitOptIn: { state: "present", sourceSafeLabel: "approved-safe-label" },
    });
    const attempt = createModelInvocationAttemptEnvelope({ gate });

    expect(gate.eligibilityStatus).toBe("blocked_by_auth");
    expect(gate.blockedReasons).toContain("auth-readiness:expired");
    expect(attempt.failureClass).toBe("provider_auth");
    expect(JSON.stringify({ gate, attempt })).not.toMatch(
      /private-agents-real|provider\.env=\/tmp|Bearer secret|token=secret|raw provider output|hidden reasoning/i,
    );
  });

  it("blocks redaction, request not ready, provider unavailable, and policy distinctly", () => {
    const redacted = createModelInvocationGate({
      requestPreparation: readyPreparation("resolved", "redacted"),
      explicitOptIn: { state: "present", sourceSafeLabel: "approved-safe-label" },
    });
    const notReady = createModelInvocationGate({
      requestPreparation: blockedPreparation("not_ready"),
      explicitOptIn: { state: "present", sourceSafeLabel: "approved-safe-label" },
    });
    const unavailable = createModelInvocationGate({
      requestPreparation: blockedPreparation("blocked_by_provider_unavailable"),
      explicitOptIn: { state: "present", sourceSafeLabel: "approved-safe-label" },
    });
    const policy = createModelInvocationGate({
      requestPreparation: readyPreparation(),
      explicitOptIn: { state: "present", sourceSafeLabel: "approved-safe-label" },
      policyBlocked: true,
    });

    expect(redacted.eligibilityStatus).toBe("blocked_by_redaction");
    expect(notReady.eligibilityStatus).toBe("not_ready");
    expect(unavailable.eligibilityStatus).toBe("blocked_by_provider_unavailable");
    expect(policy.eligibilityStatus).toBe("blocked_by_policy");
  });

  it("creates an eligible metadata-only attempt envelope without provider success", () => {
    const gate = createModelInvocationGate({
      requestPreparation: readyPreparation(),
      explicitOptIn: { state: "present", sourceSafeLabel: "approved-safe-label" },
    });
    const attempt = createModelInvocationAttemptEnvelope({ gate });

    expect(gate.eligibilityStatus).toBe("eligible_for_explicit_invocation");
    expect(attempt).toMatchObject({
      invocationMode: "metadata_only",
      attemptStatus: "not_attempted",
      retryEligibility: "retry_metadata_unavailable",
      fallbackEligibility: "fallback_metadata_unavailable",
      terminalSuccessClaim: false,
    });
    expect(attempt.failureClass).toBeUndefined();
    expect(attempt.notProvenClaims).toEqual(
      expect.arrayContaining([
        "provider-completed-is-not-task-success",
        "fallback-eligible-is-not-fallback-executed",
      ]),
    );
  });
});

function readyPreparation(
  authReadiness: "resolved" | "missing" | "expired" | "unsupported" | "unknown" = "resolved",
  messageRedaction: "report-safe" | "redacted" = "report-safe",
) {
  const registry = projectProviderRegistry({
    providers: [{
      providerId: "provider-a",
      safeLabel: "Provider A",
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
      modelId: "model-a",
      safeLabel: "Model A",
      providerId: "provider-a",
      family: "fixture",
      compatibility: unknownProviderCompatibilityFlags(),
      knownLimitations: [],
    }],
    auth: [{
      providerId: "provider-a",
      authSourceKind: "none",
      authMode: "none",
      resolutionStatus: authReadiness,
    }],
  });
  const boundary = createModelRequestBoundary({
    requestId: "request-a",
    providerId: "provider-a",
    providerSafeLabel: "Provider A",
    modelSafeLabel: "Model A",
    providerReadinessStatus: "ready",
    providerRegistry: registry,
  });
  return prepareNextTurnModelRequest({
    nextTurnBundle: prepareNextTurnBundle({
      bundleId: "bundle-a",
      turnId: "turn-a",
      toolResultMessages: {
        batchId: "messages-a",
        dispatchPlanId: "plan-a",
        messages: [{
          messageId: "message-a",
          role: "tool",
          toolCallId: "call-a",
          toolName: "read",
          safeContentSummary: messageRedaction === "redacted"
            ? "token=secret raw provider output: hidden reasoning provider.env=/tmp/x"
            : "safe summary",
          category: "executed_tool_fact",
          deliveryStatus: messageRedaction === "redacted" ? "blocked" : "prepared",
          redactionStatus: messageRedaction,
          notProvenClaims: [],
          terminalSuccessClaim: false,
        }],
        preparedCount: messageRedaction === "redacted" ? 0 : 1,
        blockedCount: messageRedaction === "redacted" ? 1 : 0,
        terminalSuccessClaim: false,
        notProvenClaims: [],
      },
    }),
    modelRequestBoundary: boundary,
    providerRegistry: registry,
    providerId: "provider-a",
    modelId: "model-a",
  });
}

function blockedPreparation(status: ReturnType<typeof readyPreparation>["readinessStatus"]) {
  return {
    ...readyPreparation(),
    readinessStatus: status,
    blockedReasons: status === "blocked_by_provider_unavailable"
      ? ["provider-readiness:missing"]
      : ["request-not-ready"],
    providerMetadata: {
      ...readyPreparation().providerMetadata,
      missingProviderFacts: status === "blocked_by_provider_unavailable"
        ? ["provider-readiness:missing"]
        : [],
    },
  };
}
