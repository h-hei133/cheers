import { describe, expect, it } from "vitest";
import {
  extractActionHandoffSummaryFromMemory,
  extractSeedInfluenceFromMemory,
  extractWriteContinuityFromMemory,
} from "./legacyContinuityMemory.js";
import { mergeContinuitySummaryEntries } from "./summaryFormatter.js";

describe("legacyContinuityMemory", () => {
  it.each(["target-carryover", "verify-signal", "ignored-explicit-target"])("reads %s after a summary-only round trip", influence => {
    const summary = mergeContinuitySummaryEntries([], { lastSeedInfluence: influence }, { preserveResult: false });
    expect(summary).toContain(`- last-seed-influence: ${influence}`);
    expect(extractSeedInfluenceFromMemory({ summary })).toBe(influence);
    expect(extractSeedInfluenceFromMemory({ summary, continuity: { lastSeedInfluence: "verify-signal" } })).toBe("verify-signal");
  });

  it("preserves old seed encodings and rejects unknown summary values", () => {
    expect(extractSeedInfluenceFromMemory({ summary: ["seedInfluence=target-carryover"] })).toBe("target-carryover");
    expect(extractSeedInfluenceFromMemory({ summary: ["verify-signal"] })).toBe("verify-signal");
    expect(extractSeedInfluenceFromMemory({ summary: ["- last-seed-influence: made-up"] })).toBeUndefined();
  });
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
