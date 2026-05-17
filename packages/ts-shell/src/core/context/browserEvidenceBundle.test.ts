import { describe, expect, it } from "vitest";
import { createBrowserExecutionRequest } from "./browserExecutionContract.js";
import { createBrowserEvidenceBundle } from "./browserEvidenceBundle.js";

describe("browser evidence bundle", () => {
  it("normalizes safe external runner evidence and excludes raw content", () => {
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
          { label: "safe title", value: "Fixture" },
          { label: "safe url", value: "local-fixture://route104" },
          { label: "fixture id", value: "fixture:route104" },
          { label: "safe observation", value: "Observed safe summary." },
          { label: "action trace", value: "runner:observe;fixture:route104" },
          { label: "raw content", value: "excluded" },
        ],
        warnings: [],
        rawContent: "excluded",
        providerCall: "none",
        modelCall: "none",
        browserSessionPersistence: "none",
      },
    });

    expect(bundle.bundleId).toBe("browser-evidence:browser-exec-observe-fixture-executed");
    expect(bundle.safeUrl).toBe("local-fixture://route104");
    expect(bundle.observationSummary).toBe("Observed safe summary.");
    expect(bundle.redactions).toContain("raw-content");
    expect(bundle.rawContent).toBe("excluded");
  });

  it("redacts unsafe external URL evidence", () => {
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

    expect(bundle.safeUrl).toBe("external-url:redacted");
    expect(bundle.safety.safetyStatus).toBe("blocked");
    expect(JSON.stringify(bundle)).not.toContain("https://example.com");
  });
});
