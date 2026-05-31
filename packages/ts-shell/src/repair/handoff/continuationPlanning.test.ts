import { describe, expect, it } from "vitest";

import {
  collectContinuationTransforms,
  inferReplaceDirectiveFromContinuity,
  isRepairContinuationFollowUpPrompt,
} from "./continuationPlanning.js";

describe("repairContinuationPlanning", () => {
  it("detects repair continuation follow-up prompts", () => {
    expect(isRepairContinuationFollowUpPrompt("then continue fixing")).toBe(
      true,
    );
  });

  it("infers newest matching transform without consuming stale blocker evidence", () => {
    const continuity = {
      lastContinuationEvidence: [
        "transform:src/a.ts:a=>b",
        "rebind-blocker:src/a.ts:stale-transform-already-applied:b=>c",
        "replan-transform:src/a.ts:c=>d",
      ],
    };

    expect(
      inferReplaceDirectiveFromContinuity({
        continuity,
        preferredTarget: "src/a.ts",
        workspaceRoot: "/workspace",
      }),
    ).toEqual({ from: "c", to: "d" });
  });

  it("collects continuation transforms as plan evidence only", () => {
    expect(
      collectContinuationTransforms({
        continuity: {
          lastContinuationEvidence: [
            "transform:/workspace/src/a.ts:a=>b",
            "transform:src/b.ts:b=>c",
          ],
        },
        preferredTarget: "src/a.ts",
        workspaceRoot: "/workspace",
      }),
    ).toEqual([{ path: "src/a.ts", from: "a", to: "b" }]);
  });
});
