import { describe, expect, it } from "vitest";
import { createBrowserExecutionRequest } from "./executionContract.js";
import { createBrowserExecutionReceipt } from "./executionReceipt.js";
import { renderBrowserExecutionReceiptSurface } from "./executionReceiptSurface.js";

describe("browser execution receipt surface", () => {
  it("renders concise user-facing receipt details", () => {
    const request = createBrowserExecutionRequest({
      action: { actionKind: "observe", risk: "read-only", target: "fixture" },
      mode: "test-local",
      requestId: "browser-exec:observe-fixture",
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
          { label: "safe url", value: "local-fixture://route104" },
          { label: "fixture id", value: "fixture:route104" },
          { label: "safe observation", value: "Observed safe summary." },
          { label: "sandbox decision", value: "local-fixture:allowed" },
          { label: "allowlist decision", value: "network:none" },
          { label: "confirmation decision", value: "sandbox:confirmed" },
        ],
        warnings: [],
        rawContent: "excluded",
        providerCall: "none",
        modelCall: "none",
        browserSessionPersistence: "none",
      },
    });
    const output = renderBrowserExecutionReceiptSurface(receipt);

    expect(output).toContain("Browser execution receipt");
    expect(output).toContain("- Status: executed");
    expect(output).toContain("- Replay readiness: replay-ready");
    expect(output).toContain("- Executed: yes");
    expect(output).not.toContain("<html");
  });
});
