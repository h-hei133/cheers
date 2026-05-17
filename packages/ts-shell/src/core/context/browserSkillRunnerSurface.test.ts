import { describe, expect, it } from "vitest";
import { createBrowserSkillRunnerMetadata } from "./browserSkillRunnerMetadata.js";
import { classifyBrowserSkillRunnerReadiness } from "./browserSkillRunnerReadiness.js";
import { renderBrowserSkillRunnerSurface } from "./browserSkillRunnerSurface.js";

describe("browser skill runner surface", () => {
  it("renders concise safe metadata status without raw execution authority", () => {
    const metadata = createBrowserSkillRunnerMetadata();
    const surface = renderBrowserSkillRunnerSurface({
      metadata,
      readiness: classifyBrowserSkillRunnerReadiness({
        metadata,
        futureExecutionRequired: true,
      }),
    });

    expect(surface).toContain("Skill-managed browser runner");
    expect(surface).toContain("- Metadata status: available-metadata-only");
    expect(surface).toContain("- Execution: not enabled");
    expect(surface).toContain("observe, extract, navigate-local");
    expect(surface).not.toMatch(/secret|token|raw/i);
  });
});
