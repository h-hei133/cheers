import { describe, expect, it } from "vitest";
import {
  createBrowserExternalRunnerRequest,
  validateBrowserExternalRunnerRequest,
  validateBrowserExternalRunnerResponse,
} from "./protocol.js";
import { parseBrowserCommandArgs } from "../../../browserCommandContract.js";

describe("browser external runner protocol", () => {
  it("validates safe requests and responses", () => {
    const request = parseBrowserCommandArgs(["execute", "observe", "local-fixture://route103-demo"]).contract!.execution!;
    const runnerRequest = createBrowserExternalRunnerRequest({
      request,
      mode: "test-local",
      fixtureId: "fixture:route103-demo",
      safeUrl: "local-fixture://route103-demo",
      outputBudgetBytes: 4096,
      sandboxDecision: "local-fixture:allowed",
      allowlistDecision: "network:none",
      confirmationDecision: "sandbox:confirmed",
    });

    expect(validateBrowserExternalRunnerRequest(runnerRequest).ok).toBe(true);
    expect(validateBrowserExternalRunnerResponse({
      status: "executed",
      executed: true,
      mode: "test-local",
      evidence: {
        safeObservationSummary: "Safe observed fixture summary.",
      },
      warnings: [],
      redactions: [],
      rawContent: "excluded",
      providerCall: "none",
      modelCall: "none",
      browserSessionPersistence: "none",
    }).ok).toBe(true);
  });

  it("rejects raw or secret-looking runner responses", () => {
    const result = validateBrowserExternalRunnerResponse({
      status: "executed",
      executed: true,
      mode: "test-local",
      evidence: {
        safeObservationSummary: "<html>sk-testsecret123</html>",
      },
      warnings: [],
      redactions: [],
      rawContent: "excluded",
      providerCall: "none",
      modelCall: "none",
      browserSessionPersistence: "none",
    });

    expect(result.ok).toBe(false);
  });
});
