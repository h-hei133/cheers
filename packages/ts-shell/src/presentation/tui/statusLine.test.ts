import { describe, it, expect } from "vitest";
import { formatStatusLine } from "./statusLine.js";

describe("Multi-Segment Dynamic StatusLine", () => {
  it("formats all segments cleanly when width is ample", () => {
    const status = formatStatusLine({
      statusText: "Idle",
      modelName: "test-model-4o",
      gitBranch: "main",
      projectDir: "coding-agents",
      usedTokens: 12000,
      contextWindow: 64000,
      costUsd: 0.015,
    }, 120);

    expect(status).toContain("Idle");
    expect(status).toContain("test-model-4o");
    expect(status).toContain("main");
    expect(status).toContain("coding-agents");
    expect(status).toContain("12k/64k (19%)");
    expect(status).toContain("$0.0150");
  });

  it("applies context warning colors across thresholds", () => {
    // Under 50%: gray
    const safe = formatStatusLine({ usedTokens: 10000, contextWindow: 64000 });
    expect(safe).toContain("\x1b[90m");

    // 50% - 69%: yellow
    const warn50 = formatStatusLine({ usedTokens: 35000, contextWindow: 64000 });
    expect(warn50).toContain("\x1b[33m");

    // 70% - 89%: purple/magenta
    const warn70 = formatStatusLine({ usedTokens: 50000, contextWindow: 64000 });
    expect(warn70).toContain("\x1b[35m");

    // >= 90%: red
    const warn90 = formatStatusLine({ usedTokens: 60000, contextWindow: 64000 });
    expect(warn90).toContain("\x1b[31m");
  });

  it("condenses lower-priority segments from right when width is constrained", () => {
    const narrowStatus = formatStatusLine({
      statusText: "Running",
      modelName: "test-model-4o",
      gitBranch: "feature/super-long-branch-name",
      projectDir: "some-deeply-nested-project-folder",
      usedTokens: 12000,
      contextWindow: 64000,
      costUsd: 0.015,
    }, 45);

    expect(narrowStatus.length).toBeLessThan(150);
  });
});
