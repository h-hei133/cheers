import { describe, expect, it } from "vitest";

import { selectContext } from "./model.js";

describe("context selection model", () => {
  it("selects pathless workspace targets from fixture context without granting success", () => {
    const selection = selectContext({
      taskKind: "workspace-understanding",
      taskPath: "tool",
      shortPrompt: "Find why runtime target selection is wrong.",
      workspaceFiles: [
        { path: "package.json", purpose: "script map" },
        { path: "src/runtime/selector.ts", purpose: "likely target" },
        { path: "src/runtime/selector.test.ts", purpose: "likely verification" },
      ],
      requiredPaths: ["src/runtime/selector.ts"],
      continuationAvailable: true,
      failureCategories: ["context insufficient"],
    });

    expect(selection).toMatchObject({
      state: "ready",
      selectedPaths: expect.arrayContaining(["src/runtime/selector.ts", "package.json"]),
      targetPaths: ["src/runtime/selector.ts"],
      terminalSuccessClaim: false,
    });
    expect(selection.notProvenClaims).toContain("context-selected-is-not-task-success");
  });

  it("blocks missing required or unavailable continuation context", () => {
    expect(selectContext({
      taskKind: "continuation",
      taskPath: "continuation",
      shortPrompt: "Continue the task.",
      workspaceFiles: [{ path: "src/continued.ts", purpose: "target" }],
      requiredPaths: ["src/continued.ts"],
      continuationAvailable: false,
      failureCategories: ["continuation stale"],
    }).state).toBe("blocked");

    expect(selectContext({
      taskKind: "docs-report",
      taskPath: "artifact",
      shortPrompt: "Write report.",
      workspaceFiles: [{ path: "notes/source.md", purpose: "source" }],
      requiredPaths: ["reports/summary.md"],
      continuationAvailable: true,
      failureCategories: [],
    }).blockers).toContain("missing required context: reports/summary.md");
  });
});
