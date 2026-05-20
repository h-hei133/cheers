import { describe, expect, it } from "vitest";
import { createCommandRuntimeReceipt, createRuntimeReceipt } from "./runtimeReceipt.js";
import {
  budgetRuntimeObservation,
  projectRuntimeReceipt,
  projectRuntimeTimeout,
  sanitizeRuntimeText,
} from "./runtimeReceiptProjection.js";

describe("runtime receipt projection", () => {
  it("projects transcript-safe summaries and excludes secrets/raw browser content", () => {
    const receipt = createRuntimeReceipt({
      runtimeKind: "browser",
      availability: "not-ready",
      policy: "not-applicable",
      execution: "not-run",
      result: "stopped",
      reasonCode: "runtime-disabled",
      reason: "raw DOM <html><body>token=abc123 document.cookie</body></html>",
      doNext: "Retry without authorization=Bearer abcdefghijklmnop",
      cleanup: "not-started",
      evidence: [
        "raw html should be excluded",
        "/home/wang/.private-agents-real/provider.env",
      ],
      stdoutSummary: "api_key=secret123",
    });

    const projection = projectRuntimeReceipt(receipt);
    const serialized = JSON.stringify(projection);

    expect(serialized).toContain("[raw-content-excluded]");
    expect(serialized).toContain("[redacted-real-provider-home]");
    expect(serialized).toContain("api_key=[redacted]");
    expect(serialized).not.toContain("secret123");
    expect(serialized).not.toContain("provider.env");
    expect(projection.redactionStatus).toBe("redacted");
  });

  it("budgets stdout and stderr summaries", () => {
    const long = Array.from({ length: 80 }, (_, index) => `line-${index}`).join("\n");

    const summary = budgetRuntimeObservation(long, 60);

    expect(summary?.length).toBeLessThanOrEqual(60);
    expect(summary).toContain("[long-output-excluded]");
  });

  it("projects timeout and cleanup summaries", () => {
    const receipt = createCommandRuntimeReceipt({
      command: "sleep 99",
      status: "timeout",
      executionPath: "ts-local",
      durationMs: 30_005,
      timeoutMs: 30_000,
      signal: "SIGTERM",
    });

    const projection = projectRuntimeReceipt(receipt);

    expect(projection.cleanupSummary).toBe("cleanup:not-needed");
    expect(projection.timeoutSummary).toBe("timeout;durationMs=30005;timeoutMs=30000;signal=SIGTERM");
    expect(projectRuntimeTimeout(receipt)).toBe(projection.timeoutSummary);
  });

  it("keeps sanitized text bounded", () => {
    const text = sanitizeRuntimeText("Bearer abcdefghijklmnop " + "x".repeat(500), 80);

    expect(text.length).toBeLessThanOrEqual(80);
    expect(text).toContain("Bearer [redacted]");
  });
});
