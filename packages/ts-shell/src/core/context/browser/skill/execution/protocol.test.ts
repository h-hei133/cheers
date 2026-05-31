import { describe, expect, it } from "vitest";
import { parseBrowserPreviewActionArgs } from "../../../browserActionContract.js";
import { createBrowserExecutionRequest } from "../../../browserExecutionContract.js";
import { createBrowserSkillRunnerMetadata } from "../runner/metadata.js";
import {
  createBrowserSkillExecutionRequest,
  validateBrowserSkillExecutionRequest,
  validateBrowserSkillExecutionResponse,
} from "./protocol.js";

describe("browser skill execution protocol", () => {
  it("validates local safe request and response shapes", () => {
    const action = parseBrowserPreviewActionArgs(["observe", "local-fixture://route106-demo"]);
    expect(action.ok).toBe(true);
    const request = createBrowserSkillExecutionRequest({
      request: createBrowserExecutionRequest({ action: action.contract! }),
      metadata: createBrowserSkillRunnerMetadata(),
      mode: "skill-managed-test-local",
      fixtureId: "fixture:route106-demo",
      safeUrl: "local-fixture://route106-demo",
      outputBudgetBytes: 4096,
      sandboxDecision: "local-fixture:allowed",
      allowlistDecision: "network:none",
      confirmationDecision: "sandbox:confirmed",
    });

    expect(validateBrowserSkillExecutionRequest(request).ok).toBe(true);
    expect(validateBrowserSkillExecutionResponse({
      status: "executed",
      executed: true,
      mode: "skill-managed-test-local",
      evidence: {
        safeTitle: "Route 106 fixture",
        safeUrl: "local-fixture://route106-demo",
        safeObservationSummary: "Safe skill observation.",
        actionTraceSummary: "skill:observe",
      },
      warnings: [],
      redactions: [],
      rawContent: "excluded",
      providerCall: "none",
      modelCall: "none",
      browserSessionPersistence: "none",
    }).ok).toBe(true);
  });

  it("rejects unsafe raw skill output", () => {
    const result = validateBrowserSkillExecutionResponse({
      status: "executed",
      executed: true,
      mode: "skill-managed-test-local",
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
    expect(result.ok ? [] : result.redactions).toContain("skill-execution-response");
  });
});
