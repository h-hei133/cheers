import { describe, it, expect } from "vitest";
import {
  renderComposerFrame,
  renderComposerPromptRow,
  renderComposerTopRule,
} from "./composerLayout.js";
import { formatStatusLine } from "./statusLine.js";

describe("Composer TUI Layout & StatusLine", () => {
  it("renders top horizontal rule with docked status chip", () => {
    const topRule = renderComposerTopRule(80, {
      modelName: "default-model",
      gitBranch: "main",
      tokenUsage: "12k/200k (6%)",
    });

    expect(topRule).toContain("default-model");
    expect(topRule).toContain("main");
    expect(topRule).toContain("12k/200k (6%)");
    expect(topRule.startsWith("\x1b[90m─")).toBe(true);
  });

  it("renders prompt rows with clean ❯ gutter", () => {
    const promptRows = renderComposerPromptRow(80, "test query");
    expect(promptRows.length).toBe(1);
    expect(promptRows[0]).toContain("❯");
    expect(promptRows[0]).toContain("test query");
  });

  it("renders complete Composer TUI Frame", () => {
    const frame = renderComposerFrame({
      width: 80,
      promptText: "Fix bug in parser.ts",
      chip: { modelName: "default-model", gitBranch: "main" },
      isExecuting: true,
      activeToolStatus: "Running bash: npm test (1.2s)...",
    });

    expect(frame.length).toBeGreaterThanOrEqual(4);
    expect(frame[0]).toContain("default-model");
    expect(frame[1]).toContain("Running bash: npm test");
    expect(frame.some((line) => line.includes("Fix bug in parser.ts"))).toBe(true);
  });

  it("formats informative status line accurately", () => {
    const status = formatStatusLine({
      modelName: "default-model",
      gitBranch: "feature/tui",
      usedTokens: 25000,
      contextWindow: 200000,
      costUsd: 0.045,
    });

    expect(status).toContain("default-model");
    expect(status).toContain("feature/tui");
    expect(status).toContain("25k/200k (13%)");
    expect(status).toContain("$0.0450");
  });
});
