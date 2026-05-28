import { describe, expect, it } from "vitest";
import {
  extractActionHandoffSummaryFromMemory,
  extractSeedInfluenceFromMemory,
  extractWriteContinuityFromMemory,
} from "./legacyContinuityMemory.js";

describe("legacyContinuityMemory", () => {
  it("preserves structured continuity fields before summary fallbacks", () => {
    const memory = {
      continuity: {
        lastActionHandoffSummary: "structured action",
        lastSeedInfluence: "verify-signal",
        lastWriterStarted: true,
        lastWriteEffect: "verified",
        lastWriteRequiresUserInspection: false,
        lastWriteEffectTarget: "src/app.ts",
      },
      summary: [
        "- last-action-handoff-summary: stale summary",
        "- seed-influence:target-carryover",
      ],
    };

    expect(extractActionHandoffSummaryFromMemory(memory)).toBe(
      "structured action",
    );
    expect(extractSeedInfluenceFromMemory(memory)).toBe("verify-signal");
    expect(extractWriteContinuityFromMemory(memory)).toEqual({
      writerStarted: true,
      writeEffect: "verified",
      requiresUserInspection: false,
      target: "src/app.ts",
    });
  });
});
