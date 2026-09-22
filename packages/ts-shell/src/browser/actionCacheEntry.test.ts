import { describe, expect, it } from "vitest";
import { createBrowserActionContract } from "./actionContract.js";
import { createBrowserActionCacheEntryFromReceipt } from "./actionCacheEntry.js";
import { createBrowserExecutionRequest } from "./executionContract.js";
import { createBrowserExecutionReceipt } from "./executionReceipt.js";
import { decideBrowserExecutionPolicy } from "./executionPolicy.js";
import type { BrowserExecutorResult } from "./executor.js";

describe("browser action cache entry", () => {
  it("derives a safe replay-ready cache entry from a sanitized receipt", () => {
    const receipt = safeReceipt();
    const result = createBrowserActionCacheEntryFromReceipt({ receipt });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.entry.sourceReceiptId).toBe(receipt.receiptId);
    expect(result.entry.replayReadinessSnapshot.status).toBe("replay-ready");
    expect(result.entry.persistence).toBe("none");
    expect(JSON.stringify(result.entry)).not.toContain("RAW_");
  });

  it("rejects unsafe receipt evidence before cache insertion", () => {
    const receipt = {
      ...safeReceipt(),
      runnerId: "sk-1234567890abcdef",
    };
    const result = createBrowserActionCacheEntryFromReceipt({ receipt });

    expect(result.ok).toBe(false);
    expect(result.evidence).toContain("browser-action-cache-entry:blocked");
  });
});

export function safeReceipt() {
  const action = createBrowserActionContract({
    actionKind: "observe",
    target: "local fixture",
    userIntentSummary: "Observe local fixture.",
    requiresNetwork: false,
    requiresAuth: false,
  });
  const request = createBrowserExecutionRequest({
    requestId: "browser-exec:cache-entry",
    mode: "local-fixture",
    action,
    approval: "read-only",
    source: "test",
  });
  const executorResult: BrowserExecutorResult = {
    status: "executed",
    executorKind: "local-fixture",
    executed: true,
    runtime: "local fixture test executor",
    evidence: [
      { label: "request id", value: request.requestId },
      { label: "runner id", value: "local-fixture-runner" },
      { label: "runner source", value: "test-only" },
      { label: "manifest id", value: "fixture-manifest" },
      { label: "manifest source", value: "test-only" },
      { label: "runner status", value: "executed" },
      { label: "sandbox decision", value: "local-fixture:allowed" },
      { label: "allowlist decision", value: "network:none" },
      { label: "confirmation decision", value: "sandbox:confirmed" },
      { label: "fixture id", value: "fixture:route107-demo" },
      { label: "safe title", value: "Route 107 fixture" },
      { label: "safe url", value: "local-fixture://route107-demo" },
      { label: "safe observation", value: "Safe observed Route 107 fixture." },
      { label: "action trace", value: "observe:route107" },
      { label: "raw content", value: "excluded" },
    ],
    warnings: [],
    rawContent: "excluded",
    providerCall: "none",
    modelCall: "none",
    browserSessionPersistence: "none",
  };
  return createBrowserExecutionReceipt({
    request,
    policy: decideBrowserExecutionPolicy({ request, executorAvailable: true }),
    executorResult,
  });
}
