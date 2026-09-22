import { describe, expect, it } from "vitest";
import { createBrowserSkillRunnerMetadata } from "./metadata.js";
import { classifyBrowserSkillRunnerReadiness } from "./readiness.js";

describe("browser skill runner readiness", () => {
  it("reports unavailable when no explicit metadata exists", () => {
    const readiness = classifyBrowserSkillRunnerReadiness();

    expect(readiness.status).toBe("unavailable");
    expect(readiness.execution).toBe("not-enabled");
  });

  it("distinguishes metadata readiness from future execution", () => {
    const metadata = createBrowserSkillRunnerMetadata();

    expect(classifyBrowserSkillRunnerReadiness({ metadata }).status).toBe("metadata-ready");
    expect(classifyBrowserSkillRunnerReadiness({ metadata, futureExecutionRequired: true }).status).toBe(
      "future-execution-required",
    );
  });

  it("blocks dynamic discovery", () => {
    const readiness = classifyBrowserSkillRunnerReadiness({
      dynamicDiscoveryRequested: true,
    });

    expect(readiness.status).toBe("blocked-dynamic-discovery");
    expect(readiness.evidence).toContain("browser-skill-runner-readiness:no-discovery");
  });
});
