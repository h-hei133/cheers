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

describe("a loop that alternates rather than repeats", () => {
  const read = ["read", { path: "a.ts" }] as const;
  const edit = ["edit", { path: "a.ts" }] as const;
  const bash = ["bash", { command: "npm test" }] as const;

  /** Feed the calls in order and report whether any was ever flagged. */
  function detect(sequence: ReadonlyArray<readonly [string, Record<string, unknown>]>) {
    const detector = new DoomLoopDetector();
    let firstFlag: { at: number; cycleLength: number } | undefined;
    sequence.forEach(([name, args], index) => {
      const result = detector.recordAndCheck(name, args);
      if (result.isDoomLoop && !firstFlag) firstFlag = { at: index + 1, cycleLength: result.cycleLength };
    });
    return firstFlag;
  }

  it("flags a two-call cycle once it has run enough rounds", () => {
    // Alternating between two calls is invisible to a consecutive-repeat check:
    // the count resets on every switch, so it never reaches the threshold.
    expect(detect([read, edit, read, edit, read, edit, read, edit, read, edit])).toEqual({
      at: 10,
      cycleLength: 2,
    });
  });

  it("flags a three-call cycle", () => {
    const cycle = [read, edit, bash];
    const sequence = [...cycle, ...cycle, ...cycle, ...cycle, ...cycle];

    expect(detect(sequence)).toEqual({ at: 15, cycleLength: 3 });
  });

  it("leaves ordinary alternating work alone", () => {
    // `read → edit` three times is how editing a file normally looks. Flagging
    // it would interrupt real work, which is worse than missing a loop.
    expect(detect([read, edit, read, edit, read, edit])).toBeUndefined();
  });

  it("still flags a call repeated with nothing between it", () => {
    // The tighter threshold is kept for this case: a call that repeats
    // immediately is the clearest sign of being stuck.
    expect(detect([read, read, read])).toEqual({ at: 3, cycleLength: 1 });
  });

  it("does not flag a history that never settles into a pattern", () => {
    expect(detect([read, edit, bash, read, edit, bash, read, edit, bash])).toBeUndefined();
  });

  it("does not flag calls that differ only in their arguments", () => {
    // A different argument is different work: reading three files is not a loop.
    expect(
      detect([
        ["read", { path: "a.ts" }],
        ["edit", { path: "a.ts" }],
        ["read", { path: "b.ts" }],
        ["edit", { path: "b.ts" }],
        ["read", { path: "a.ts" }],
        ["edit", { path: "a.ts" }],
        ["read", { path: "b.ts" }],
        ["edit", { path: "b.ts" }],
        ["read", { path: "a.ts" }],
        ["edit", { path: "a.ts" }],
      ]),
    ).toBeUndefined();
  });

  it("forgets the history when it is reset", () => {
    const detector = new DoomLoopDetector();
    for (const [name, args] of [read, edit, read, edit, read, edit, read, edit, read]) {
      detector.recordAndCheck(name, args);
    }
    detector.reset();

    expect(detector.recordAndCheck(...read).isDoomLoop).toBe(false);
  });
});
