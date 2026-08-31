import { describe, it, expect } from "vitest";
import { formatMinimalWelcomeBanner } from "./welcomeBanner.js";

describe("Minimal Welcome Banner", () => {
  it("formats minimal intro banner without leaking debug lines", () => {
    const banner = formatMinimalWelcomeBanner({
      workspaceRoot: "/home/user/project",
      modelName: "test-model-4o",
      gitBranch: "main",
    });

    expect(banner).toContain("Coding Agent Shell");
    expect(banner).toContain("test-model-4o");
    expect(banner).toContain("Directory:");
    expect(banner).toContain("/home/user/project");
    expect(banner).toContain("main");
  });
});
