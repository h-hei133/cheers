import { describe, expect, it } from "vitest";
import { parseBrowserPreviewActionArgs } from "../../browserActionContract.js";
import { createBrowserExecutionRequest } from "../../browserExecutionContract.js";
import { createBrowserExecutionResult } from "../../browserExecutionResult.js";
import { decideBrowserExecutionPolicy } from "../../browserExecutionPolicy.js";
import { renderBrowserSkillExecutionSurface } from "./surface.js";

describe("browser skill execution surface", () => {
  it("renders skill-managed execution evidence without raw output", () => {
    const action = parseBrowserPreviewActionArgs(["observe", "local-fixture://route106-demo"]);
    expect(action.ok).toBe(true);
    const request = createBrowserExecutionRequest({
      action: action.contract!,
      mode: "skill-managed",
    });
    const result = createBrowserExecutionResult({
      request,
      policy: decideBrowserExecutionPolicy({ request, executorAvailable: true }),
      executorResult: {
        status: "executed",
        executorKind: "skill-runner",
        executed: true,
        runtime: "skill-managed browser runner (skill-managed-test-local)",
        evidence: [
          { label: "skill execution", value: "skill-managed" },
          { label: "skill id", value: "skill:route106" },
          { label: "skill name", value: "Route 106 skill" },
          { label: "skill binding mode", value: "test-local-process" },
          { label: "runner status", value: "executed" },
          { label: "safe observation", value: "Safe skill observation." },
          { label: "sandbox decision", value: "local-fixture:allowed" },
          { label: "allowlist decision", value: "network:none" },
          { label: "confirmation decision", value: "sandbox:confirmed" },
          { label: "fixture id", value: "fixture:route106-demo" },
          { label: "raw content", value: "excluded" },
        ],
        warnings: [],
        rawContent: "excluded",
        providerCall: "none",
        modelCall: "none",
        browserSessionPersistence: "none",
      },
    });

    const surface = renderBrowserSkillExecutionSurface(result);

    expect(surface).toContain("Skill-managed browser execution");
    expect(surface).toContain("- Binding mode: test-local-process");
    expect(surface).toContain("- Executed: yes");
    expect(surface).not.toMatch(/RAW_|secret|token/i);
  });
});
