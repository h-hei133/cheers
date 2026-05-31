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
      streamProjected: false,
      terminalSuccessClaim: false,
    });
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
      streamProjected: true,
      assistantAccumulationStatus: "accumulated",
      toolCallExtractionStatus: "extracted",
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
    ["authentication", "provider_auth"],
    ["network", "provider_network"],
    ["rate_limit", "provider_rate_limited"],
    ["server", "provider_endpoint"],
  ] as const)("maps %s provider failures without fake success", async (kind, failureClass) => {
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
});
