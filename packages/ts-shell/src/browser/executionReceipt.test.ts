import { describe, expect, it } from "vitest";
import { createBrowserExecutionRequest } from "./executionContract.js";
import { createBrowserExecutionReceipt } from "./executionReceipt.js";

describe("browser execution receipt", () => {
  it("creates deterministic executed receipts with replay readiness", () => {
    const request = createBrowserExecutionRequest({
      action: { actionKind: "extract", risk: "read-only", extractionGoal: "summary" },
      mode: "test-local",
      requestId: "browser-exec:extract-summary",
    });
    const receipt = createBrowserExecutionReceipt({
      request,
      policy: {
        allowed: true,
        status: "allowed",
        reason: "allowed",
        requirements: request.requirements,
        evidence: [],
        warnings: [],
        nextAction: "execute",
      },
      executorResult: {
        status: "executed",
        executorKind: "external-runner",
        executed: true,
        runtime: "external browser runner (test-local)",
        evidence: [
          { label: "runner id", value: "runner:route104" },
          { label: "runner source", value: "cli-harness" },
          { label: "manifest id", value: "manifest:route104" },
          { label: "manifest source", value: "cli-harness" },
          { label: "fixture id", value: "fixture:route104" },
          { label: "safe url", value: "local-fixture://route104" },
          { label: "safe extraction", value: "Extracted safe summary." },
          { label: "sandbox decision", value: "local-fixture:allowed" },
          { label: "allowlist decision", value: "network:none" },
          { label: "confirmation decision", value: "sandbox:confirmed" },
          { label: "raw content", value: "excluded" },
        ],
        warnings: [],
        rawContent: "excluded",
        providerCall: "none",
        modelCall: "none",
        browserSessionPersistence: "none",
      },
      now: () => "2026-05-17T01:02:03.000Z",
    });

    expect(receipt.receiptId).toBe("browser-receipt:browser-exec-extract-summary-external-runner-executed");
    expect(receipt.createdAt).toBe("2026-05-17T01:02:03.000Z");
    expect(receipt.status).toBe("executed");
    expect(receipt.replayReadiness.status).toBe("replay-ready");
    expect(receipt.rawContent).toBe("excluded");
  });

  it("maps unsafe runner output to unsafe-output receipt without raw leak", () => {
    const request = createBrowserExecutionRequest({
      action: { actionKind: "observe", risk: "read-only", target: "fixture" },
      mode: "test-local",
      requestId: "browser-exec:observe-unsafe",
    });
    const receipt = createBrowserExecutionReceipt({
      request,
      policy: {
        allowed: true,
        status: "allowed",
        reason: "allowed",
        requirements: request.requirements,
        evidence: [],
        warnings: [],
        nextAction: "execute",
      },
      executorResult: {
        status: "blocked",
        executorKind: "external-runner",
        executed: false,
        runtime: "external browser runner (test-local)",
        evidence: [
          { label: "runner status", value: "invalid-response" },
          { label: "stdout summary", value: "runner output redacted" },
          { label: "redaction", value: "raw-runner-output" },
        ],
        warnings: ["browser-external-runner-process:unsafe-response"],
        error: { code: "external-runner-invalid-response", message: "External browser runner response was unavailable, malformed, or unsafe." },
        rawContent: "excluded",
        providerCall: "none",
        modelCall: "none",
        browserSessionPersistence: "none",
      },
    });

    expect(receipt.status).toBe("unsafe-output");
    expect(receipt.replayReadiness.status).toBe("replay-blocked");
    expect(JSON.stringify(receipt)).not.toContain("sk-testsecret");
  });
});
