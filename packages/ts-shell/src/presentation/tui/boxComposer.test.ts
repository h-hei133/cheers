import { describe, it, expect } from "vitest";
import {
  renderBoxBottom,
  renderBoxFrame,
  renderBoxRows,
  renderBoxTop,
} from "./boxComposer.js";

describe("BoxComposer Enclosed Layout", () => {
  it("renders top border with title", () => {
    const top = renderBoxTop(80, "Agent Shell");
    expect(top).toContain("Agent Shell");
    expect(top.startsWith("\x1b[90m╭─")).toBe(true);
    expect(top.endsWith("─╮\x1b[0m")).toBe(true);
  });

  it("renders enclosed prompt rows with gutter and side bars", () => {
    const rows = renderBoxRows(80, "test prompt");
    expect(rows.length).toBe(1);
    expect(rows[0]).toContain("│");
    expect(rows[0]).toContain("❯");
    expect(rows[0]).toContain("test prompt");
  });

  it("renders bottom border with embedded status line", () => {
    const bottom = renderBoxBottom(80, {
      modelName: "test-model",
      gitBranch: "main",
      usedTokens: 12000,
      contextWindow: 64000,
    });

    expect(bottom).toContain("test-model");
    expect(bottom).toContain("main");
    expect(bottom).toContain("12k/64k (19%)");
    expect(bottom.startsWith("\x1b[90m╰─")).toBe(true);
    expect(bottom.endsWith("─╯\x1b[0m")).toBe(true);
  });

  it("renders full Box frame", () => {
    const frame = renderBoxFrame({
      width: 80,
      promptText: "Refactor parser.ts",
      title: "Coding Agent",
      status: {
        modelName: "test-model",
        gitBranch: "feature/box",
      },
    });

    expect(frame.length).toBeGreaterThanOrEqual(4);
    expect(frame[0]).toContain("Coding Agent");
    expect(frame.some((l) => l.includes("Refactor parser.ts"))).toBe(true);
    expect(frame[2]).toContain("feature/box");
  });
});
