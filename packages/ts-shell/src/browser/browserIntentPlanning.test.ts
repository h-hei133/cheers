import { describe, expect, it } from "vitest";

import { buildBrowserIntentPlan } from "./browserIntentPlanning.js";

describe("browserIntentPlanning", () => {
  it("projects browser task intent without executing browser runtime", () => {
    const plan = buildBrowserIntentPlan({
      prompt: "use browser to open https://example.com and inspect the page",
      continuity: {},
    });

    expect(plan).toMatchObject({
      taskKind: "browser",
      inspectFirst: false,
      verifyAfterEdit: false,
      usedRestoredState: false,
    });
    expect(plan?.browserPlan).toBeDefined();
  });

  it("preserves restored browser state signal", () => {
    const plan = buildBrowserIntentPlan({
      prompt: "continue browser task",
      continuity: {
        lastTaskKind: "browser",
        lastContinuationEvidence: [
          "browser-agent-observation:status=blocked;url=https://example.com;summary=needs retry",
        ],
      },
    });

    expect(plan).toMatchObject({
      taskKind: "browser",
      usedRestoredState: true,
    });
  });
});
