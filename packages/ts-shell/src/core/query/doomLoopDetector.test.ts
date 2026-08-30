import { describe, it, expect } from "vitest";
import { DoomLoopDetector } from "./doomLoopDetector.js";

describe("DoomLoopDetector Test Suite", () => {
  it("detects repeated identical tool invocations crossing threshold", () => {
    const detector = new DoomLoopDetector(3);

    const first = detector.recordAndCheck("grep", { path: "src", pattern: "foo" });
    expect(first.isDoomLoop).toBe(false);
    expect(first.repeatCount).toBe(1);

    const second = detector.recordAndCheck("grep", { path: "src", pattern: "foo" });
    expect(second.isDoomLoop).toBe(false);
    expect(second.repeatCount).toBe(2);

    const third = detector.recordAndCheck("grep", { path: "src", pattern: "foo" });
    expect(third.isDoomLoop).toBe(true);
    expect(third.repeatCount).toBe(3);
  });

  it("resets count when different arguments or tool is invoked", () => {
    const detector = new DoomLoopDetector(3);

    detector.recordAndCheck("grep", { path: "src", pattern: "foo" });
    detector.recordAndCheck("grep", { path: "src", pattern: "foo" });

    // Different pattern
    const diff = detector.recordAndCheck("grep", { path: "src", pattern: "bar" });
    expect(diff.isDoomLoop).toBe(false);
    expect(diff.repeatCount).toBe(1);

    // Different tool
    const diffTool = detector.recordAndCheck("read", { path: "src/index.ts" });
    expect(diffTool.isDoomLoop).toBe(false);
    expect(diffTool.repeatCount).toBe(1);
  });
});
