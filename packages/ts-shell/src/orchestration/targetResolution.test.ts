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

  it("keeps package.json targets exact across inline and quoted prompts", () => {
    const resolution = resolveTaskTargets(
      [
        "inspect package.json",
        "then read `src/package.json`",
        'and compare "configs/package.json"',
        "without changing unrelated files",
      ].join(" "),
      workspaceRoot,
    );

    expect(resolution.cleanedPaths).toEqual([
      "src/package.json",
      "configs/package.json",
      "package.json",
    ]);
    expect(resolution.cleanedPaths).toContain("package.json");
    expect(resolution.cleanedPaths).toContain("src/package.json");
    expect(resolution.cleanedPaths).toContain("configs/package.json");
    expect(resolution.primaryTarget?.cleaned).toBe("src/package.json");
    expect(resolution.cleanedPaths).not.toContain("package.js");
  });

  it("keeps common config filenames exact across inline and quoted prompts", () => {
    const targets = extractPromptTargets(
      [
        "inspect package-lock.json",
        "then update tsconfig.json",
        "and read vite.config.ts",
        "compare `configs/package-lock.json`",
        'and inspect "apps/web/vite.config.ts"',
      ].join(" "),
      workspaceRoot,
    );
    const cleaned = targets.map((target) => target.cleaned);

    expect(cleaned).toEqual([
      "configs/package-lock.json",
      "apps/web/vite.config.ts",
      "package-lock.json",
      "tsconfig.json",
      "vite.config.ts",
    ]);
    expect(cleaned).not.toContain("package-lock.js");
    expect(cleaned).not.toContain("tsconfig.js");
    expect(cleaned).not.toContain("config.ts");
    expect(cleaned).not.toContain("vite.config");
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
    if (process.platform === "win32") {
      expect(resolution.workspacePaths).toEqual(["./src/main.ts"]);
      expect(resolution.externalPaths).toEqual(["C:\\outside\\tmp\\notes.md"]);
    } else {
      expect(resolution.workspacePaths).toEqual([
        "./src/main.ts",
        "C:\\outside\\tmp\\notes.md",
      ]);
      expect(resolution.externalPaths).toEqual([]);
    }
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

  it("treats keep-unchanged file mentions as protected constraints, not edit targets", () => {
    const resolution = resolveTaskTargets(
      "Edit note.txt and keep README.md / LOCKED.md unchanged",
      workspaceRoot,
    );

    expect(resolution.cleanedPaths).toEqual([
      "note.txt",
      "README.md",
      "LOCKED.md",
    ]);
    expect(resolution.primaryTarget?.cleaned).toBe("note.txt");
    expect(resolution.blocker).toBeNull();
    expect(pickPrimaryTarget(resolution.prompt, workspaceRoot)?.cleaned).toBe(
      "note.txt",
    );
  });

  it("does not block the real coding flow fixture prompt on protected sibling mentions", () => {
    const resolution = resolveTaskTargets(
      [
        "This is an isolated fixture coding task.",
        "Edit only note.txt.",
        'Change the line "status: draft" to exactly "status: ready".',
        "Do not modify README.md.",
        "Do not modify LOCKED.md.",
        'Verify note.txt contains "status: ready" and protected files are unchanged.',
      ].join("\n"),
      workspaceRoot,
    );

    expect(resolution.primaryTarget?.cleaned).toBe("note.txt");
    expect(resolution.blocker).toBeNull();
  });

  it("keeps true multi-target edits ambiguous after protected filtering", () => {
    const resolution = resolveTaskTargets(
      "replace token in src/alpha.ts and src/beta.ts",
      workspaceRoot,
    );

    expect(resolution.primaryTarget).toBeNull();
    expect(resolution.blocker?.code).toBe("ambiguous-target");
    expect(resolution.blocker?.candidates).toEqual([
      "src/alpha.ts",
      "src/beta.ts",
    ]);
  });

  it("allows editing one file while another sibling is explicitly protected", () => {
    const resolution = resolveTaskTargets(
      "edit README.md and do not modify LOCKED.md",
      workspaceRoot,
    );

    expect(resolution.cleanedPaths).toEqual(["README.md", "LOCKED.md"]);
    expect(resolution.primaryTarget?.cleaned).toBe("README.md");
    expect(resolution.blocker).toBeNull();
  });
});
