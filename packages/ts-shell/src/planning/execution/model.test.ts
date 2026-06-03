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
  });

  it("blocks artifact plans when write tools or authority are unavailable", () => {
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
    expect(plan.blockers).toEqual(expect.arrayContaining(["missing tool: write", "write authority missing"]));
  });
});
