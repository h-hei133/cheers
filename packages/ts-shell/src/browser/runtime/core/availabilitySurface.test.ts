import { describe, expect, it } from "vitest";
import { decideBrowserExternalRunnerPolicy } from "../external/policy.js";
import { renderBrowserRuntimeAvailabilitySurface } from "./availabilitySurface.js";

describe("browser runtime availability surface", () => {
  it("renders concise dependency and external runner state", () => {
    const output = renderBrowserRuntimeAvailabilitySurface({
      availability: "unavailable",
      currentMode: "playwright-local",
      externalRunnerDecision: decideBrowserExternalRunnerPolicy({
        source: "cli-harness-manifest",
        runnerId: "cli-harness:playwright-local",
        executorMode: "playwright-local",
        fixtureScope: "local-fixture-only",
        sandboxAuthority: "local-fixture",
        allowlist: "none",
        evidenceRedactionMode: "safe-summary-only",
      }),
    });

    expect(output).toContain("Browser runtime dependency");
    expect(output).toContain("- Decision: external-runner-only");
    expect(output).toContain("- Availability: unavailable");
    expect(output).toContain("- External runner policy: allowed");
    expect(output).toContain("- Browser execution default: disabled");
  });

  it("redacts unsafe details in next action text", () => {
    const output = renderBrowserRuntimeAvailabilitySurface({
      nextAction: "inspect sk-testsecret123 in hidden reasoning",
    });

    expect(output).not.toContain("sk-testsecret123");
    expect(output).not.toContain("hidden reasoning");
  });
});
