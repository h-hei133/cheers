import { describe, expect, it } from "vitest";
import { createBrowserActionContract } from "./browserActionContract.js";
import { createBrowserExecutionRequest } from "./browserExecutionContract.js";
import { createBrowserLocalExecutionAuthority } from "./browserLocalExecutionAuthority.js";
import { createBrowserLocalFixture } from "./browserLocalFixture.js";
import {
  BrowserPlaywrightCliLocalFixtureExecutor,
  createBrowserPlaywrightCliExecutorPlan,
} from "./browserPlaywrightCliExecutor.js";

function request(actionKind: "observe" | "extract") {
  return createBrowserExecutionRequest({
    mode: "local-fixture",
    action: createBrowserActionContract({
      actionKind,
      extractionGoal: actionKind === "extract" ? "headline" : undefined,
      userIntentSummary: `execute ${actionKind}`,
      requiresNetwork: false,
      requiresAuth: false,
    }),
    source: "test",
  });
}

describe("browser Playwright CLI executor seam", () => {
  it("is unavailable without an injected process runner", () => {
    const plan = createBrowserPlaywrightCliExecutorPlan();

    expect(plan.status).toBe("unavailable");
    expect(plan.evidence).toContain("browser-playwright-cli-executor:no-process-spawn");
  });

  it("returns sanitized local fixture execution evidence", () => {
    const fixture = createBrowserLocalFixture({
      fixtureId: "fixture:route99",
      title: "Route 99 Local Fixture",
      text: "A heading and one paragraph are visible.",
    });
    const executor = new BrowserPlaywrightCliLocalFixtureExecutor({
      fixture,
      authority: createBrowserLocalExecutionAuthority({
        mode: "local-fixture",
        allowedFixtureIds: [fixture.fixtureId],
      }),
    });

    const result = executor.execute(request("extract"), {
      now: () => "2026-05-17T03:04:05.000Z",
    });

    expect(result.status).toBe("executed");
    expect(result.executorKind).toBe("local-fixture");
    expect(result.executed).toBe(true);
    expect(result.evidence).toContainEqual({ label: "fixture id", value: "fixture:route99" });
    expect(result.evidence).toContainEqual({
      label: "safe summary",
      value: "Extraction summary: A heading and one paragraph are visible.",
    });
    expect(result.rawContent).toBe("excluded");
    expect(result.providerCall).toBe("none");
    expect(result.modelCall).toBe("none");
  });
});
