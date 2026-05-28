import { describe, expect, it } from "vitest";

import { buildSessionResumeSnapshot } from "./sessionPromptContinuity.js";
import type { SessionContinuitySnapshot } from "../sessionContinuityTypes.js";

describe("session prompt continuity", () => {
  it("keeps explicit follow-up prompts attached to the existing snapshot", () => {
    const snapshot = {
      sessionId: "sess_prompt",
      projectRoot: "/repo",
      lastTaskKind: "coding",
      recentChangedFiles: [],
      recentTargetFiles: [],
      recentFailedFiles: [],
      recentVerifiedFiles: [],
      lastRepairNotes: [],
      lastContinuationEvidence: [],
      lastTaskSatisfactionReasons: [],
      unresolvedItems: [],
    } as SessionContinuitySnapshot;

    expect(
      buildSessionResumeSnapshot({
        currentPrompt: "continue this task",
        snapshot,
      }),
    ).toBe(snapshot);
  });
});
