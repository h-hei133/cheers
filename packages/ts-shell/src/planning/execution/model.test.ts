import { describe, expect, it } from "vitest";

import { selectContext } from "../../context/selection/model.js";
import { buildExecutionPlan } from "./model.js";

describe("execution planning model", () => {
  it("builds a repair plan only when context and required tools are ready", () => {
    const context = selectContext({
      taskKind: "debug-repair",
      taskPath: "edit",
      shortPrompt: "Fix failing check.",
      workspaceFiles: [{ path: "src/check.ts", purpose: "target" }],
      requiredPaths: ["src/check.ts"],
      continuationAvailable: true,
      failureCategories: [],
    });

    const plan = buildExecutionPlan({
      taskKind: "debug-repair",
      outputKind: "diff",
      allowedTools: ["read", "repair", "verify"],
      allowedWrites: ["src/check.ts"],
      successRubric: ["repair", "verify"],
      context,
    });

    expect(plan).toMatchObject({
      state: "ready",
      requiredTools: ["read", "repair", "verify"],
      writeRequired: true,
      terminalSuccessClaim: false,
    });
    expect(plan.actionContracts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "repair",
        preconditions: ["context ready", "write authority available"],
        proofContribution: "addresses preserved failure before recheck",
        fallbackAction: "search",
        budgetImpact: "high",
      }),
      expect.objectContaining({
        action: "verify",
        proofContribution: "closes task-relevant proof gap",
      }),
    ]));
  });

  it("blocks artifact plans when artifact tools or authority are unavailable", () => {
    const context = selectContext({
      taskKind: "data-artifact",
      taskPath: "artifact",
      shortPrompt: "Write artifact.",
      workspaceFiles: [{ path: "data/input.csv", purpose: "source" }, { path: "out.json", purpose: "target" }],
      requiredPaths: ["out.json"],
      continuationAvailable: true,
      failureCategories: [],
    });

    const plan = buildExecutionPlan({
      taskKind: "data-artifact",
      outputKind: "artifact",
      allowedTools: ["read"],
      allowedWrites: [],
      successRubric: ["write", "verify"],
      context,
    });

    expect(plan.state).toBe("blocked");
    expect(plan.requiredTools).toEqual(["read", "artifact", "verify"]);
    expect(plan.blockers).toEqual(expect.arrayContaining(["missing tool: artifact", "write authority missing"]));
  });

  it("requires edit capability for diff tasks before verification", () => {
    const context = selectContext({
      taskKind: "coding",
      taskPath: "edit",
      shortPrompt: "Change src/app.ts.",
      workspaceFiles: [
        { path: "src/app.ts", purpose: "target" },
        { path: "src/app.test.ts", purpose: "verification" },
      ],
      requiredPaths: ["src/app.ts"],
      continuationAvailable: true,
      failureCategories: [],
    });

    const blocked = buildExecutionPlan({
      taskKind: "coding",
      outputKind: "diff",
      allowedTools: ["read", "verify"],
      allowedWrites: ["src/app.ts"],
      successRubric: ["edit", "verify"],
      context,
    });
    const ready = buildExecutionPlan({
      taskKind: "coding",
      outputKind: "diff",
      allowedTools: ["read", "edit", "verify"],
      allowedWrites: ["src/app.ts"],
      successRubric: ["edit", "verify"],
      context,
    });

    expect(blocked.requiredTools).toEqual(["read", "edit", "verify"]);
    expect(blocked.blockers).toContain("missing tool: edit");
    expect(ready.state).toBe("ready");
    expect(ready.actionContracts).toEqual(expect.arrayContaining([
      expect.objectContaining({ action: "edit" }),
      expect.objectContaining({ action: "verify" }),
    ]));
  });

  it("plans targeted verification selection after source edits with impacted tests", () => {
    const context = selectContext({
      taskKind: "coding",
      taskPath: "edit",
      shortPrompt: "Change status mapper and run impacted tests.",
      workspaceFiles: [
        { path: "src/status.ts", purpose: "target" },
        { path: "src/status.test.ts", purpose: "verification" },
      ],
      requiredPaths: ["src/status.ts"],
      continuationAvailable: true,
      failureCategories: [],
    });

    const plan = buildExecutionPlan({
      taskKind: "coding",
      outputKind: "diff",
      allowedTools: ["read", "edit", "verify"],
      allowedWrites: ["src/status.ts"],
      successRubric: ["targeted verification"],
      context,
    });

    expect(plan.steps).toEqual([
      "inspect target",
      "edit changed target",
      "select impacted verification",
      "run targeted verification",
    ]);
    expect(plan.actionContracts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "verify",
        expectedObservations: expect.arrayContaining([
          "targeted verification selected",
          "impacted test result",
        ]),
      }),
    ]));
  });
});
