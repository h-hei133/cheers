import { describe, expect, it } from "vitest";
import { createBrowserExecutionRequest } from "./browserExecutionContract.js";
import { createBrowserEvidenceBundle } from "./browserEvidenceBundle.js";
import { classifyBrowserReplayReadiness } from "./browserReplayReadiness.js";

describe("browser replay readiness", () => {
  it("marks safe local observe receipts replay-ready without executing replay", () => {
    const request = createBrowserExecutionRequest({
      action: { actionKind: "observe", risk: "read-only", target: "fixture" },
      mode: "test-local",
      requestId: "browser-exec:observe-fixture",
    });
    const bundle = createBrowserEvidenceBundle({
      request,
      executorResult: {
        status: "executed",
        executorKind: "external-runner",
        executed: true,
        runtime: "external browser runner (test-local)",
        evidence: [
          { label: "safe url", value: "local-fixture://route104" },
          { label: "fixture id", value: "fixture:route104" },
        ],
        warnings: [],
        rawContent: "excluded",
        providerCall: "none",
        modelCall: "none",
        browserSessionPersistence: "none",
      },
    });
    const readiness = classifyBrowserReplayReadiness({
      requestId: request.requestId,
      actionKind: request.actionKind,
      mode: request.mode,
      executorKind: "external-runner",
      receiptStatus: "executed",
      executed: true,
      evidenceBundle: bundle,
      sandboxDecision: "local-fixture:allowed",
      allowlistDecision: "network:none",
      confirmationDecision: "sandbox:confirmed",
      runnerId: "runner:route104",
      manifestId: "manifest:route104",
    });

    expect(readiness.status).toBe("replay-ready");
    expect(readiness.replayExecution).toBe("not-started");
    expect(readiness.persistence).toBe("none");
    expect(readiness.actionCacheMetadata.cacheStatus).toBe("not-persisted");
  });

  it("blocks external failed evidence without treating the URL as replay-safe", () => {
    const request = createBrowserExecutionRequest({
      action: { actionKind: "navigate", risk: "state-changing", url: "https://example.com" },
      mode: "test-local",
      requestId: "browser-exec:navigate-external",
    });
    const bundle = createBrowserEvidenceBundle({
      request,
      executorResult: {
        status: "blocked",
        executorKind: "noop",
        executed: false,
        runtime: "none",
        evidence: [{ label: "safe url", value: "https://example.com" }],
        warnings: [],
        rawContent: "excluded",
        providerCall: "none",
        modelCall: "none",
        browserSessionPersistence: "none",
      },
    });
    const readiness = classifyBrowserReplayReadiness({
      requestId: request.requestId,
      actionKind: request.actionKind,
      mode: request.mode,
      executorKind: "noop",
      receiptStatus: "blocked",
      executed: false,
      evidenceBundle: bundle,
      sandboxDecision: "blocked",
      allowlistDecision: "blocked-no-allowlist",
      confirmationDecision: "not-required",
    });

    expect(readiness.status).toBe("replay-blocked");
    expect(readiness.reasons).toEqual(expect.arrayContaining(["external-url-blocked"]));
  });
});
