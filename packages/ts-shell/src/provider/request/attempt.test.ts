import { describe, expect, it } from "vitest";

import { prepareNextTurnBundle } from "../../turn/nextTurnBundle.js";
import { projectProviderRegistry, unknownProviderCompatibilityFlags } from "../registry/provider.js";
import { createModelRequestBoundary, prepareNextTurnModelRequest } from "./boundary.js";
import { createModelInvocationGate } from "./invocation.js";
import { runControlledModelInvocationAdapter } from "./attempt.js";

describe("controlled model invocation adapter", () => {
  it("keeps the default gate from calling the provider", async () => {
    let calls = 0;
    const gate = createModelInvocationGate({
      requestPreparation: readyPreparation(),
      explicitOptIn: { state: "present", sourceSafeLabel: "approved-safe-label" },
    });

    const adapter = await runControlledModelInvocationAdapter({
      gate,
      requestPreparation: readyPreparation(),
      executor: () => {
        calls += 1;
        return { kind: "completed", response: { content: "not reached" } };
      },
    });

    expect(calls).toBe(0);
    expect(adapter).toMatchObject({
      attemptDecision: "not_attempted",
      blockedReason: "controlled-invocation-mode-not-selected",
      terminalSuccessClaim: false,
    });
    expect(adapter.outcome.status).toBe("not_attempted");
  });

  it("blocks missing opt-in, auth failure, and redaction before the fetch seam", async () => {
    let calls = 0;
    const executor = () => {
      calls += 1;
      return { kind: "completed" as const, response: { content: "not reached" } };
    };
    const missingOptIn = createModelInvocationGate({ requestPreparation: readyPreparation() });
    const authBlocked = createModelInvocationGate({
      requestPreparation: readyPreparation({ authReadiness: "expired" }),
      explicitOptIn: { state: "present", sourceSafeLabel: "approved-safe-label" },
    });
    const redactionBlocked = createModelInvocationGate({
      requestPreparation: readyPreparation({ messageRedaction: "redacted" }),
      explicitOptIn: { state: "present", sourceSafeLabel: "approved-safe-label" },
    });

    const projections = await Promise.all([
      runControlledModelInvocationAdapter({
        gate: missingOptIn,
        requestPreparation: readyPreparation(),
        invocationMode: "controlled_provider_fetch",
        executor,
      }),
      runControlledModelInvocationAdapter({
        gate: authBlocked,
        requestPreparation: readyPreparation({ authReadiness: "expired" }),
        invocationMode: "controlled_provider_fetch",
        executor,
      }),
      runControlledModelInvocationAdapter({
        gate: redactionBlocked,
        requestPreparation: readyPreparation({ messageRedaction: "redacted" }),
        invocationMode: "controlled_provider_fetch",
        executor,
      }),
    ]);

    expect(calls).toBe(0);
    expect(projections.map((projection) => projection.outcome.failureClass)).toEqual([
      "provider_config",
      "provider_auth",
      "provider_redaction_failure",
    ]);
    expect(projections.map((projection) => projection.attemptDecision)).toEqual([
      "blocked",
      "blocked",
      "blocked",
    ]);
  });

  it("uses an injected test-safe executor for eligible controlled attempts", async () => {
    const preparation = readyPreparation();
    const gate = createModelInvocationGate({
      requestPreparation: preparation,
      explicitOptIn: { state: "present", sourceSafeLabel: "approved-safe-label" },
    });

    const adapter = await runControlledModelInvocationAdapter({
      gate,
      requestPreparation: preparation,
      invocationMode: "controlled_provider_fetch",
      responseId: "response-controlled",
      executor: (request) => {
        expect(request.model).toBe("Model A");
        return {
          kind: "completed",
          response: {
            content: "safe provider content",
            toolCalls: [{ id: "call-a", name: "read", arguments: { path: "a.ts" } }],
            finishReason: "tool_calls",
          },
        };
      },
    });

    expect(adapter).toMatchObject({
      attemptDecision: "execute_via_provider_fetch",
      attemptId: expect.any(String),
      terminalSuccessClaim: false,
    });
    expect(adapter.outcome).toMatchObject({
      status: "completed",
      fallbackAttempted: false,
      responseHandoffId: expect.any(String),
      terminalSuccessClaim: false,
    });
    expect(adapter.responseHandoff).toMatchObject({
      responseClassification: "completed",
      assistantContentAvailability: "available",
      toolCallExtractionReadiness: "ready",
      rawOutputExcluded: true,
      terminalSuccessClaim: false,
    });
    expect(adapter.responseHandoff?.reportSafeToolCallCandidates).toEqual([
      { id: "call-a", name: "read", arguments: { path: "a.ts" } },
    ]);
    expect(adapter.modelResponseBoundary?.terminalSuccessClaim).toBe(false);
    expect(JSON.stringify(adapter)).not.toContain('"success":true');
  });

  it("preserves distinct provider failure classes and metadata-only recovery facts", async () => {
    const preparation = readyPreparation();
    const gate = createModelInvocationGate({
      requestPreparation: preparation,
      explicitOptIn: { state: "present", sourceSafeLabel: "approved-safe-label" },
    });

    const adapter = await runControlledModelInvocationAdapter({
      gate,
      requestPreparation: preparation,
      invocationMode: "controlled_provider_fetch",
      executor: () => {
        throw {
          provider: "openai",
          kind: "rate_limit",
          message: "rate limited",
          retriable: true,
          statusCode: 429,
        };
      },
    });

    expect(adapter.outcome).toMatchObject({
      status: "failed",
      failureClass: "provider_rate_limited",
      fallbackAttempted: false,
    });
    expect(adapter.responseHandoff).toBeUndefined();
    expect(adapter.notProvenClaims).toEqual(
      expect.arrayContaining([
        "attempt-is-not-provider-success",
        "retry-eligibility-is-not-retry-execution",
        "fallback-eligible-is-not-fallback-executed",
      ]),
    );
  });

  it("selects and completes an explicit fallback after primary provider failure", async () => {
    const preparation = fallbackReadyPreparation();
    const gate = createModelInvocationGate({
      requestPreparation: preparation,
      explicitOptIn: { state: "present", sourceSafeLabel: "approved-safe-label" },
    });

    const adapter = await runControlledModelInvocationAdapter({
      gate,
      requestPreparation: preparation,
      invocationMode: "controlled_provider_fetch",
      fallbackExplicitOptIn: true,
      executor: () => {
        throw new Error("network unreachable");
      },
      fallbackExecutor: () => ({
        kind: "completed",
        response: {
          content: "fallback safe content",
          finishReason: "stop",
        },
      }),
    });

    expect(adapter.outcome).toMatchObject({
      status: "completed",
      fallbackAttempted: true,
      fallbackStatus: "fallback_completed",
      terminalSuccessClaim: false,
    });
    expect(adapter.fallbackDecision).toMatchObject({
      status: "fallback_completed",
      nextAction: "continue",
      selectedProviderSafeLabel: "Fallback Provider",
      selectedModelSafeLabel: "Fallback Model",
      terminalSuccessClaim: false,
    });
    expect(adapter.fallbackResponseHandoff).toMatchObject({
      responseClassification: "completed",
      rawOutputExcluded: true,
      terminalSuccessClaim: false,
    });
  });

  it("blocks fallback when explicit fallback opt-in is missing", async () => {
    const preparation = fallbackReadyPreparation();
    const gate = createModelInvocationGate({
      requestPreparation: preparation,
      explicitOptIn: { state: "present", sourceSafeLabel: "approved-safe-label" },
    });

    const adapter = await runControlledModelInvocationAdapter({
      gate,
      requestPreparation: preparation,
      invocationMode: "controlled_provider_fetch",
      executor: () => {
        throw new Error("timeout");
      },
      fallbackExecutor: () => ({
        kind: "completed",
        response: { content: "not reached", finishReason: "stop" },
      }),
    });

    expect(adapter.outcome).toMatchObject({
      status: "failed",
      fallbackAttempted: false,
      fallbackStatus: "fallback_blocked",
    });
    expect(adapter.fallbackDecision?.blockedReasons).toContain("fallback-explicit-opt-in-missing");
    expect(adapter.fallbackResponseHandoff).toBeUndefined();
  });

  it("keeps fallback failure distinct from primary failure and task success", async () => {
    const preparation = fallbackReadyPreparation();
    const gate = createModelInvocationGate({
      requestPreparation: preparation,
      explicitOptIn: { state: "present", sourceSafeLabel: "approved-safe-label" },
    });

    const adapter = await runControlledModelInvocationAdapter({
      gate,
      requestPreparation: preparation,
      invocationMode: "controlled_provider_fetch",
      fallbackExplicitOptIn: true,
      executor: () => {
        throw new Error("network unreachable");
      },
      fallbackExecutor: () => {
        throw new Error("timeout");
      },
    });

    expect(adapter.outcome).toMatchObject({
      status: "failed",
      failureClass: "provider_network",
      fallbackAttempted: true,
      fallbackStatus: "fallback_failed",
      terminalSuccessClaim: false,
    });
    expect(adapter.fallbackDecision).toMatchObject({
      status: "fallback_failed",
      nextAction: "fail",
      terminalSuccessClaim: false,
    });
    expect(adapter.fallbackResponseHandoff).toBeUndefined();
    expect(adapter.notProvenClaims).toContain("terminal-success");
  });

  it("redacts unsafe facts from controlled invocation reports", async () => {
    const preparation = readyPreparation({
      taskSummary:
        "token=secret raw provider output: hidden reasoning /home/wang/.private-agents-real/provider.env",
    });
    const gate = createModelInvocationGate({
      requestPreparation: preparation,
      explicitOptIn: { state: "present", sourceSafeLabel: "approved-safe-label" },
    });

    const adapter = await runControlledModelInvocationAdapter({
      gate,
      requestPreparation: preparation,
      invocationMode: "controlled_provider_fetch",
      executor: () => ({
        kind: "completed",
        response: {
          content:
            "token=secret raw provider output: hidden reasoning oldText=before newText=after",
          finishReason: "stop",
        },
      }),
    });

    expect(adapter.redactionState).toBe("redacted");
    expect(JSON.stringify(adapter)).not.toMatch(
      /private-agents-real|provider\.env=\/tmp|Bearer secret|token=secret|raw provider output|hidden reasoning|oldText=before|newText=after/i,
    );
  });
});

function readyPreparation(input: {
  readonly authReadiness?: "resolved" | "missing" | "expired" | "unsupported" | "unknown";
  readonly messageRedaction?: "report-safe" | "redacted";
  readonly taskSummary?: string;
} = {}) {
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
      resolutionStatus: input.authReadiness ?? "resolved",
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
          safeContentSummary: input.messageRedaction === "redacted"
            ? "token=secret raw provider output: hidden reasoning provider.env=/tmp/x"
            : "safe summary",
          category: "executed_tool_fact",
          deliveryStatus: input.messageRedaction === "redacted" ? "blocked" : "prepared",
          redactionStatus: input.messageRedaction ?? "report-safe",
          notProvenClaims: [],
          terminalSuccessClaim: false,
        }],
        preparedCount: input.messageRedaction === "redacted" ? 0 : 1,
        blockedCount: input.messageRedaction === "redacted" ? 1 : 0,
        terminalSuccessClaim: false,
        notProvenClaims: [],
      },
    }),
    modelRequestBoundary: boundary,
    providerRegistry: registry,
    providerId: "provider-a",
    modelId: "model-a",
    taskSummary: input.taskSummary,
  });
}

function fallbackReadyPreparation() {
  const registry = projectProviderRegistry({
    providers: [
      {
        providerId: "provider-a",
        safeLabel: "Primary Provider",
        providerKind: "custom",
        endpointClass: "unknown",
        authMode: "none",
        defaultEnabled: false,
        requiresExplicitOptIn: true,
        supportsFallback: "supported",
        compatibility: unknownProviderCompatibilityFlags(),
        fallbackPolicy: {
          fallbackProviderId: "provider-b",
          eligibleFailureClasses: ["provider_network", "provider_timeout"],
          ineligibleFailureClasses: ["provider_auth"],
          maxAttempts: 1,
          retryRelation: "new-request",
          requiresExplicitOptIn: true,
          executesFallback: true,
          redaction: { status: "report-safe", excluded: [] },
          notProvenClaims: [],
        },
        riskLevel: "low",
      },
      {
        providerId: "provider-b",
        safeLabel: "Fallback Provider",
        providerKind: "custom",
        endpointClass: "unknown",
        authMode: "none",
        defaultEnabled: false,
        requiresExplicitOptIn: true,
        supportsFallback: "unknown",
        compatibility: unknownProviderCompatibilityFlags(),
        riskLevel: "low",
      },
    ],
    models: [
      {
        modelId: "model-a",
        safeLabel: "Primary Model",
        providerId: "provider-a",
        family: "fixture",
        compatibility: unknownProviderCompatibilityFlags(),
        knownLimitations: [],
      },
      {
        modelId: "model-b",
        safeLabel: "Fallback Model",
        providerId: "provider-b",
        family: "fixture",
        compatibility: unknownProviderCompatibilityFlags(),
        knownLimitations: [],
      },
    ],
    auth: [{
      providerId: "provider-a",
      authSourceKind: "none",
      authMode: "none",
      resolutionStatus: "resolved",
    }],
  });
  const boundary = createModelRequestBoundary({
    requestId: "request-fallback",
    providerId: "provider-a",
    providerSafeLabel: "Primary Provider",
    modelSafeLabel: "Primary Model",
    providerReadinessStatus: "ready",
    providerRegistry: registry,
  });
  return prepareNextTurnModelRequest({
    nextTurnBundle: prepareNextTurnBundle({
      bundleId: "bundle-fallback",
      turnId: "turn-fallback",
      toolResultMessages: {
        batchId: "messages-fallback",
        dispatchPlanId: "plan-fallback",
        messages: [{
          messageId: "message-fallback",
          role: "tool",
          toolCallId: "call-fallback",
          toolName: "read",
          safeContentSummary: "safe summary",
          category: "executed_tool_fact",
          deliveryStatus: "prepared",
          redactionStatus: "report-safe",
          notProvenClaims: [],
          terminalSuccessClaim: false,
        }],
        preparedCount: 1,
        blockedCount: 0,
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
