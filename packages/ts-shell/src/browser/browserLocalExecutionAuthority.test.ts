import { describe, expect, it } from "vitest";
import { createBrowserExecutionRequest } from "./browserExecutionContract.js";
import { createBrowserActionContract } from "./browserActionContract.js";
import { createBrowserLocalFixture } from "./browserLocalFixture.js";
import {
  createBrowserLocalExecutionAuthority,
  decideBrowserLocalExecutionAuthority,
} from "./browserLocalExecutionAuthority.js";

function request(actionKind: "observe" | "extract" | "navigate" | "screenshot") {
  return createBrowserExecutionRequest({
    mode: "local-fixture",
    action: createBrowserActionContract({
      actionKind,
      url: actionKind === "navigate" ? "https://example.com" : undefined,
      userIntentSummary: `execute ${actionKind}`,
      requiresNetwork: actionKind === "navigate",
      requiresAuth: false,
    }),
    source: "test",
  });
}

describe("browser local execution authority", () => {
  it("blocks by default", () => {
    const decision = decideBrowserLocalExecutionAuthority({
      request: request("observe"),
      executorKind: "local-fixture",
    });

    expect(decision.status).toBe("blocked-disabled");
    expect(decision.allowed).toBe(false);
  });

  it("allows local fixture read-only execution with an allowed fixture", () => {
    const fixture = createBrowserLocalFixture({ fixtureId: "fixture:route99" });
    const decision = decideBrowserLocalExecutionAuthority({
      request: request("extract"),
      executorKind: "local-fixture",
      fixture,
      authority: createBrowserLocalExecutionAuthority({
        mode: "local-fixture",
        allowedFixtureIds: [fixture.fixtureId],
      }),
    });

    expect(decision.status).toBe("allowed");
    expect(decision.allowed).toBe(true);
  });

  it("keeps unsafe and future external actions blocked", () => {
    const fixture = createBrowserLocalFixture();
    expect(
      decideBrowserLocalExecutionAuthority({
        request: request("screenshot"),
        executorKind: "local-fixture",
        fixture,
        authority: createBrowserLocalExecutionAuthority({ mode: "local-fixture" }),
      }).status,
    ).toBe("blocked-unsafe-action");
    expect(
      decideBrowserLocalExecutionAuthority({
        request: request("navigate"),
        executorKind: "explicit-local",
        fixture,
        authority: createBrowserLocalExecutionAuthority({ mode: "future-external" }),
      }).status,
    ).toBe("future-external-required");
  });
});
