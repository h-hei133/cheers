import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  normalizeProjectBinding,
  normalizeProjectRootKey,
  projectSessionBinding,
} from "./projectBindingPolicy.js";

describe("projectBindingPolicy", () => {
  it("normalizes project root keys with resolved lowercase paths", () => {
    expect(normalizeProjectRootKey("  ./Some/Workspace  ")).toBe(
      path.resolve("./Some/Workspace").toLowerCase(),
    );
    expect(normalizeProjectRootKey("   ")).toBe("");
  });

  it("projects initial session binding with existing create semantics", () => {
    const binding = projectSessionBinding({
      projectRoot: "  /workspace/raw  ",
      options: {
        rootMode: "git-root",
        requestedWorkspaceRoot: "/workspace/raw/packages/app",
        targetPathBase: "/workspace/raw",
        gitRoot: "",
      },
    });

    expect(binding).toEqual({
      projectRoot: "  /workspace/raw  ",
      rootMode: "git-root",
      requestedWorkspaceRoot: "/workspace/raw/packages/app",
      targetPathBase: "/workspace/raw",
      gitRoot: "",
    });
  });

  it("normalizes update binding facts without inventing missing fields", () => {
    expect(
      normalizeProjectBinding({
        projectRoot: "  /workspace/next  ",
        rootMode: "direct",
        requestedWorkspaceRoot: "  /workspace/next/app  ",
        targetPathBase: "  /workspace/next  ",
        gitRoot: "   ",
      }),
    ).toEqual({
      projectRoot: "/workspace/next",
      rootMode: "direct",
      requestedWorkspaceRoot: "/workspace/next/app",
      targetPathBase: "/workspace/next",
      gitRoot: null,
    });
  });
});
