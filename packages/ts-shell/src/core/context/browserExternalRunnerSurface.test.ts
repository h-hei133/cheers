import { describe, expect, it } from "vitest";
import { renderBrowserExternalRunnerSurface } from "./browserExternalRunnerSurface.js";
import type { BrowserExecutionResult } from "./browserExecutionResult.js";

describe("browser external runner surface", () => {
  it("renders concise external runner status without raw content", () => {
    const output = renderBrowserExternalRunnerSurface({
      request: { actionKind: "observe", mode: "test-local" },
      executed: true,
      nextAction: "Review safe evidence.",
      warnings: [],
      executorResult: {
        evidence: [
          { label: "runner status", value: "executed" },
          { label: "runner source", value: "cli-harness" },
          { label: "execution mode", value: "test-local" },
          { label: "safe observation", value: "Safe summary." },
        ],
      },
    } as unknown as BrowserExecutionResult);

    expect(output).toContain("External browser runner");
    expect(output).toContain("Executed: yes");
    expect(output).not.toContain("RAW_");
  });
});
