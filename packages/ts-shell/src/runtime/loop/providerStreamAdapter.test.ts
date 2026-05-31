import { describe, expect, it } from "vitest";

import { createModelRequestBoundary } from "../../provider/request/boundary.js";
import { runProviderStreamAdapter } from "./providerStreamAdapter.js";

const request = {
  schemaVersion: "1.0.0" as const,
  model: "safe-model",
  messages: [{ role: "user" as const, content: "answer safely" }],
};

describe("provider stream adapter", () => {
  it("keeps the default disabled path as no-call and no stream projection", async () => {
    let called = false;
    const adapter = await runProviderStreamAdapter({
      adapterId: "provider-adapter-default",
      requestBoundary: createModelRequestBoundary({
        requestId: "request-default",
        providerMode: "default",
        providerReadinessStatus: "unknown",
      }),
      responseId: "response-default",
      explicitProviderOptIn: false,
      request,
      fetchProviderResponse: () => {
        called = true;
        return { kind: "completed", response: { content: "should not run" } };
      },
    });

    expect(called).toBe(false);
    expect(adapter).toMatchObject({
      explicitOptIn: "missing",
      status: "not_run",
      fetchAttempted: false,
      liveClassification: "provider_blocked",
      streamProjected: false,
      retryEligibility: "retry_not_allowed",
      fallbackEligibility: "fallback_not_eligible",
      fallbackStatus: "fallback_not_attempted",
      terminalSuccessClaim: false,
    });
    expect(adapter.recoveryFacts).toEqual(
      expect.arrayContaining([
        "retry_not_allowed",
        "fallback_not_eligible",
        "fallback_not_attempted",
        "manual_action_required",
      ]),
    );
    expect(adapter.modelBoundaryPhase).toBeUndefined();
  });

  it("blocks readiness failures before provider fetch", async () => {
    let called = false;
    const adapter = await runProviderStreamAdapter({
      adapterId: "provider-adapter-readiness",
      requestBoundary: createModelRequestBoundary({
        requestId: "request-readiness",
        providerMode: "real",
        providerReadinessStatus: "ready",
        providerSafeLabel: "OpenAI",
        modelSafeLabel: "safe-model",
      }),
      responseId: "response-readiness",
      explicitProviderOptIn: true,
      readiness: {
        status: "missing_auth",
        safeReason: "auth readiness is missing",
      },
      request,
      fetchProviderResponse: () => {
        called = true;
        return { kind: "completed", response: { content: "should not run" } };
      },
    });

    expect(called).toBe(false);
    expect(adapter).toMatchObject({
      status: "blocked",
      fetchAttempted: false,
      failureClass: "provider_auth",
      liveClassification: "auth_failed",
      nextAction: "auth readiness is missing",
    });
  });

  it("projects fetch success through stream, assistant accumulation, and not-dispatched tool extraction", async () => {
    const adapter = await runProviderStreamAdapter({
      adapterId: "provider-adapter-success",
      turnId: "turn-success",
      requestBoundary: createModelRequestBoundary({
        requestId: "request-success",
        providerMode: "real",
        providerReadinessStatus: "ready",
        providerSafeLabel: "OpenAI",
        modelSafeLabel: "safe-model",
        noWriteStatus: "no-write-authority-granted",
      }),
      responseId: "response-success",
      explicitProviderOptIn: true,
      readiness: { status: "ready" },
      request,
      fetchProviderResponse: () => ({
        kind: "completed",
        response: {
          content: "safe answer",
          toolCalls: [{ id: "call-read", name: "read", arguments: { path: "a.ts" } }],
          finishReason: "stop",
        },
      }),
    });

    expect(adapter).toMatchObject({
      status: "projected",
      fetchAttempted: true,
      liveClassification: "live_completed",
      streamProjected: true,
      assistantAccumulationStatus: "accumulated",
      toolCallExtractionStatus: "extracted",
      retryEligibility: "retry_not_allowed",
      fallbackEligibility: "fallback_not_eligible",
      fallbackStatus: "fallback_not_attempted",
      terminalSuccessClaim: false,
    });
    expect(adapter.modelBoundaryPhase?.stream.status).toBe("completed");
    expect(adapter.modelBoundaryPhase?.toolCallBatch).toMatchObject({
      dispatchStatus: "not_dispatched",
      terminalSuccessClaim: false,
    });
    expect(adapter.notProvenClaims).toEqual(
      expect.arrayContaining([
        "provider-stream-projected-is-not-task-success",
        "tool-call-extracted-is-not-tool-executed",
      ]),
    );
  });

  it.each([
    ["authentication", "provider_auth", "auth_failed"],
    ["network", "provider_network", "network_failed"],
    ["rate_limit", "provider_rate_limited", "rate_limited"],
    ["server", "provider_endpoint", "endpoint_failed"],
  ] as const)("maps %s provider failures without fake success", async (kind, failureClass, liveClassification) => {
    const adapter = await runProviderStreamAdapter({
      adapterId: `provider-adapter-${kind}`,
      requestBoundary: createModelRequestBoundary({
        requestId: `request-${kind}`,
        providerMode: "real",
        providerReadinessStatus: "ready",
        providerSafeLabel: "OpenAI",
        modelSafeLabel: "safe-model",
      }),
      responseId: `response-${kind}`,
      explicitProviderOptIn: true,
      readiness: { status: "ready" },
      request,
      fetchProviderResponse: () => {
        throw {
          provider: "openai",
          kind,
          message: "safe classified failure",
          retriable: false,
        };
      },
    });

    expect(adapter).toMatchObject({
      status: "projected",
      fetchAttempted: true,
      failureClass,
      liveClassification,
      retryEligibility: "retry_not_allowed",
      fallbackStatus: "fallback_not_attempted",
      terminalSuccessClaim: false,
    });
    expect(adapter.modelBoundaryPhase?.stream.failure).toMatchObject({
      class: failureClass,
      fallbackExecuted: false,
    });
  });

  it("redacts unsafe provider output before product facts consume it", async () => {
    const adapter = await runProviderStreamAdapter({
      adapterId: "provider-adapter-redaction",
      requestBoundary: createModelRequestBoundary({
        requestId: "request-redaction",
        providerMode: "real",
        providerReadinessStatus: "ready",
        providerSafeLabel: "OpenAI",
        modelSafeLabel: "safe-model",
      }),
      responseId: "response-redaction",
      explicitProviderOptIn: true,
      readiness: { status: "ready" },
      request,
      fetchProviderResponse: () => ({
        kind: "completed",
        response: {
          content: "raw provider output: hidden reasoning token=secret oldText=before newText=after /home/wang/.private-agents-real/provider.env",
        },
      }),
    });
    const serialized = JSON.stringify(adapter);

    expect(adapter.redaction.status).toBe("redacted");
    expect(serialized).not.toMatch(/token=secret|oldText=before|newText=after|private-agents-real|hidden reasoning/i);
  });

  it.each([
    ["invalid_request", 408, "provider_timeout", "timeout"],
    ["unknown", 499, "provider_endpoint", "endpoint_failed"],
  ] as const)("classifies %s status %s as report-safe recovery facts", async (kind, statusCode, failureClass, liveClassification) => {
    const adapter = await runProviderStreamAdapter({
      adapterId: `provider-adapter-${kind}-${statusCode}`,
      requestBoundary: createModelRequestBoundary({
        requestId: `request-${kind}-${statusCode}`,
        providerMode: "real",
        providerReadinessStatus: "ready",
        providerSafeLabel: "OpenAI",
        modelSafeLabel: "safe-model",
      }),
      responseId: `response-${kind}-${statusCode}`,
      explicitProviderOptIn: true,
      readiness: { status: "ready" },
      request,
      fetchProviderResponse: () => {
        throw {
          provider: "openai",
          kind,
          statusCode,
          code: "safe-code",
          message: "safe classified failure",
          retriable: false,
        };
      },
    });

    expect(adapter).toMatchObject({
      failureClass,
      liveClassification,
      fallbackEligibility: "fallback_not_eligible",
      fallbackStatus: "fallback_not_attempted",
      terminalSuccessClaim: false,
    });
    expect(adapter.recoveryFacts).toContain("provider_unavailable");
  });

  it("classifies cancellation without executing retry or fallback", async () => {
    const controller = new AbortController();
    controller.abort();
    const adapter = await runProviderStreamAdapter({
      adapterId: "provider-adapter-cancelled",
      requestBoundary: createModelRequestBoundary({
        requestId: "request-cancelled",
        providerMode: "real",
        providerReadinessStatus: "ready",
        providerSafeLabel: "OpenAI",
        modelSafeLabel: "safe-model",
      }),
      responseId: "response-cancelled",
      explicitProviderOptIn: true,
      readiness: { status: "ready" },
      request,
      signal: controller.signal,
      fetchProviderResponse: () => {
        throw new Error("aborted");
      },
    });

    expect(adapter).toMatchObject({
      failureClass: "provider_cancelled",
      liveClassification: "cancelled",
      retryEligibility: "retry_not_allowed",
      fallbackStatus: "fallback_not_attempted",
      terminalSuccessClaim: false,
    });
  });

  it("classifies empty provider output as insufficient recovery needed", async () => {
    const adapter = await runProviderStreamAdapter({
      adapterId: "provider-adapter-empty-output",
      requestBoundary: createModelRequestBoundary({
        requestId: "request-empty-output",
        providerMode: "real",
        providerReadinessStatus: "ready",
        providerSafeLabel: "OpenAI",
        modelSafeLabel: "safe-model",
      }),
      responseId: "response-empty-output",
      explicitProviderOptIn: true,
      readiness: { status: "ready" },
      request,
      fetchProviderResponse: () => ({
        kind: "completed",
        response: { content: " ", finishReason: "stop" },
      }),
    });

    expect(adapter).toMatchObject({
      failureClass: "provider_output_insufficient",
      liveClassification: "output_insufficient",
      fallbackStatus: "fallback_not_attempted",
      terminalSuccessClaim: false,
    });
    expect(adapter.recoveryFacts).toContain("output_insufficient_recovery_needed");
  });

  it("keeps provider attempt and model completion from becoming task success", async () => {
    const adapter = await runProviderStreamAdapter({
      adapterId: "provider-adapter-truth",
      requestBoundary: createModelRequestBoundary({
        requestId: "request-truth",
        providerMode: "real",
        providerReadinessStatus: "ready",
        providerSafeLabel: "OpenAI",
        modelSafeLabel: "safe-model",
      }),
      responseId: "response-truth",
      explicitProviderOptIn: true,
      readiness: { status: "ready" },
      request,
      fetchProviderResponse: () => ({
        kind: "completed",
        response: {
          content: "safe answer",
          toolCalls: [{ id: "call-safe", name: "read", arguments: { path: "a.ts" } }],
          finishReason: "tool_calls",
        },
      }),
    });

    expect(adapter.liveClassification).toBe("live_completed");
    expect(adapter.terminalSuccessClaim).toBe(false);
    expect(adapter.modelBoundaryPhase?.terminalSuccessClaim).toBe(false);
    expect(adapter.modelBoundaryPhase?.toolBatchHandoffPrepared).toBe(true);
    expect(adapter.modelBoundaryPhase?.toolCallBatch.dispatchStatus).toBe("not_dispatched");
    expect(adapter.notProvenClaims).toEqual(
      expect.arrayContaining([
        "provider-attempted-is-not-provider-success",
        "model-boundary-completed-is-not-terminal-success",
      ]),
    );
  });
});
