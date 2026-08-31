import { describe, it, expect, beforeEach } from "vitest";
import { ToolActivityCard } from "./toolActivityCard.js";

describe("ToolActivityCard Lifecycle Rendering", () => {
  let card: ToolActivityCard;

  beforeEach(() => {
    card = new ToolActivityCard();
  });

  it("renders pending and running states with status badges", () => {
    const pendingLines = card.render({
      toolName: "bash",
      state: "pending",
    });
    expect(pendingLines[0]).toContain("Queued");

    const runningLines = card.render({
      toolName: "bash",
      commandText: "npm test",
      state: "running",
      startTime: Date.now() - 1500,
    });
    expect(runningLines[0]).toContain("Running");
    expect(runningLines[0]).toContain("npm test");
  });

  it("renders completed state with duration and preview output", () => {
    const completedLines = card.render({
      toolName: "read",
      state: "completed",
      startTime: Date.now() - 2000,
      endTime: Date.now(),
      stdoutLines: ["line 1", "line 2", "line 3"],
    });

    expect(completedLines[0]).toContain("Completed");
    expect(completedLines.some((l) => l.includes("line 1"))).toBe(true);
  });

  it("renders error state with prominent red error message", () => {
    const errorLines = card.render({
      toolName: "edit",
      state: "error",
      errorMessage: "Target file does not exist",
    });

    expect(errorLines[0]).toContain("Failed");
    expect(errorLines.some((l) => l.includes("Error: Target file does not exist"))).toBe(true);
  });
});
