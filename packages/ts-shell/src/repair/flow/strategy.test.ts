import { describe, expect, it } from "vitest";
import { selectRepairFailureStrategy } from "./strategy.js";

describe("repair failure strategy", () => {
  it("switches failed repair to context discovery when failure evidence lacks context", () => {
    const strategy = selectRepairFailureStrategy({
      failureClass: "missing-context",
      failureSummary: "repair failed because required owner context was missing",
      targetFiles: ["src/repair/context.ts"],
    });

    expect(strategy).toEqual({
      hypothesis: "read missing repair context before another repair attempt",
      contextNeed: "src/repair/context.ts",
    });
  });

  it("keeps non-context failures on a changed repair strategy", () => {
    const strategy = selectRepairFailureStrategy({
      failureClass: "command-failed",
      failureSummary: "assertion failed after repair",
      targetFiles: ["src/repair/target.ts"],
    });

    expect(strategy).toEqual({
      hypothesis: "change repair strategy before another attempt",
    });
  });
});
