import { describe, expect, it } from "vitest";
import path from "node:path";
import {
  extractPromptTargets,
  pickPrimaryTarget,
  resolveTaskTargets,
} from "./targetResolution.js";

describe("targetResolution", () => {
  const workspaceRoot = "D:\\repo\\project";

  it("does not treat CLI option markers as file targets", () => {
    const targets = extractPromptTargets(
      "where is --project/--attach parsing implemented",
      workspaceRoot,
    );
    const cleaned = targets.map((target) => target.cleaned);
    expect(cleaned).not.toContain("/--attach");
    expect(cleaned).not.toContain("--project/--attach");
  });

  it("keeps multi-suffix file paths as stable targets", () => {
    const targets = extractPromptTargets(
      "read packages/ts-shell/src/entrypoints/cli.test.tsx",
      workspaceRoot,
    );
    expect(targets.length).toBeGreaterThan(0);
    expect(targets[0]?.cleaned).toBe(
      "packages/ts-shell/src/entrypoints/cli.test.tsx",
    );
    expect(targets[0]?.absolutePath).toBe(
      path.resolve(workspaceRoot, "packages/ts-shell/src/entrypoints/cli.test.tsx"),
    );
  });

  it("resolves a canonical target contract shared by task routing", () => {
    const resolution = resolveTaskTargets(
      "inspect ./src/main.ts and C:\\outside\\tmp\\notes.md",
      workspaceRoot,
    );

    expect(resolution.primaryTarget?.cleaned).toBe("./src/main.ts");
    expect(resolution.cleanedPaths).toEqual([
      "./src/main.ts",
      "C:\\outside\\tmp\\notes.md",
    ]);
    expect(resolution.workspacePaths).toEqual(["./src/main.ts"]);
    expect(resolution.externalPaths).toEqual(["C:\\outside\\tmp\\notes.md"]);
    expect(resolution.blocker).toBeNull();
  });

  it("blocks sibling target ambiguity instead of silently choosing the first file", () => {
    const resolution = resolveTaskTargets(
      "replace the shared TOKEN in src/alpha.ts or src/beta.ts",
      workspaceRoot,
    );

    expect(resolution.cleanedPaths).toEqual(["src/alpha.ts", "src/beta.ts"]);
    expect(resolution.primaryTarget).toBeNull();
    expect(resolution.blocker).toEqual({
      code: "ambiguous-target",
      reason:
        "Multiple sibling target files were mentioned, so a single edit target cannot be chosen safely.",
      nextAction:
        "Rerun with exactly one explicit target file for this edit, or split the request into separate edits.",
      candidates: ["src/alpha.ts", "src/beta.ts"],
    });
    expect(pickPrimaryTarget(resolution.prompt, workspaceRoot)).toBeNull();
  });
});
