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
        { path: "src/runtime/owner.ts", purpose: "owner boundary" },
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
      ownerPaths: expect.arrayContaining(["src/runtime/owner.ts"]),
      verificationPaths: ["src/runtime/selector.test.ts"],
      packagePaths: ["package.json"],
      terminalSuccessClaim: false,
    });
    expect(selection.contextPacketSummary).toContain("1 target");
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

  it("does not let unrelated observed paths satisfy a missing required owner", () => {
    const selection = selectContext({
      taskKind: "workspace-understanding",
      taskPath: "runtime",
      shortPrompt: "Find the owner for src/missing.ts.",
      workspaceFiles: [{ path: "src/nearby.ts", purpose: "observed context" }],
      requiredPaths: ["src/missing.ts"],
      observedPaths: ["src/nearby.ts"],
      continuationAvailable: true,
      failureCategories: [],
    });

    expect(selection.state).toBe("blocked");
    expect(selection.blockers).toContain("missing required context: src/missing.ts");
    expect(selection.proofGap).toContain("required context missing");
  });

  it("turns missing context failure into discovery actions and proof gap", () => {
    const selection = selectContext({
      taskKind: "debug-repair",
      taskPath: "edit",
      shortPrompt: "Fix parser failure after missing owner context.",
      workspaceFiles: [{ path: "src/parser.ts", purpose: "target" }],
      requiredPaths: ["src/parser.ts"],
      continuationAvailable: true,
      failureCategories: ["missing context"],
    });

    expect(selection.proofGap).toContain("failure needs more context");
    expect(selection.suggestedActions).toEqual(["search", "read"]);
    expect(selection.terminalSuccessClaim).toBe(false);
  });

  it("narrows owner context without treating owner hints as success", () => {
    const selection = selectContext({
      taskKind: "workspace-understanding",
      taskPath: "runtime",
      shortPrompt: "Find the owner boundary for runtime selector.",
      workspaceFiles: [
        { path: "src/runtime/selector.ts", purpose: "target" },
        { path: "src/runtime/owner.ts", purpose: "owner boundary" },
        { path: "src/runtime/selector.test.ts", purpose: "verification" },
      ],
      requiredPaths: ["src/runtime/selector.ts"],
      continuationAvailable: true,
      failureCategories: [],
    });

    expect(selection.ownerPaths).toEqual(["src/runtime/owner.ts"]);
    expect(selection.selectedPaths).toEqual(expect.arrayContaining([
      "src/runtime/selector.ts",
      "src/runtime/owner.ts",
      "src/runtime/selector.test.ts",
    ]));
    expect(selection.contextPacketSummary).toContain("1 owner hint");
    expect(selection.terminalSuccessClaim).toBe(false);
  });

  it("keeps verification failure as proof gap with repair and verify actions", () => {
    const selection = selectContext({
      taskKind: "debug-repair",
      taskPath: "edit",
      shortPrompt: "Fix failing check.",
      workspaceFiles: [
        { path: "src/parser.ts", purpose: "target" },
        { path: "src/parser.test.ts", purpose: "verification" },
      ],
      requiredPaths: ["src/parser.ts"],
      continuationAvailable: true,
      failureCategories: ["verification failed"],
    });

    expect(selection.proofGap).toContain("verification evidence incomplete");
    expect(selection.suggestedActions).toEqual(["repair", "verify"]);
    expect(selection.terminalSuccessClaim).toBe(false);
  });
});
