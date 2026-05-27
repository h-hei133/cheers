import { describe, expect, it } from "vitest";

import {
  detectGroundedDeliverableMode,
  normalizeGroundedRepairInstruction,
  parseGroundedRepairConstraints,
} from "./groundedAnswerRepair.js";

describe("groundedAnswerRepair", () => {
  it("normalizes answer-repair follow-ups without making them success", () => {
    expect(
      normalizeGroundedRepairInstruction({
        prompt: "Not generic, summarize with conclusion and two evidence points.",
        continuity: { lastGroundedDeliverableMode: "summary" },
        hasContinuationCue: false,
        hasCorrectionCue: true,
        hasAnswerRepairCue: true,
        isAmbiguousRepairFollowUp: false,
        hasGroundedReadLikeIntent: true,
        lastTaskWasReadLike: true,
      }),
    ).toMatchObject({
      operation: "repair",
      targetMode: "summary",
      reason: "grounded answer repair follow-up",
      constraints: {
        summaryStyle: "conclusion-with-evidence",
        summaryEvidenceCount: 2,
        avoidGenericLanguage: true,
      },
    });
  });

  it("decomposes staged read and explain continuations with a resume cursor", () => {
    const instruction = normalizeGroundedRepairInstruction({
      prompt: "First read next 2 lines, then explain this part.",
      continuity: {
        lastGroundedDeliverableMode: "read",
        lastStagedRepairStepCount: 2,
        lastStagedRepairNextStep: 2,
      },
      hasContinuationCue: true,
      hasCorrectionCue: false,
      hasAnswerRepairCue: false,
      isAmbiguousRepairFollowUp: false,
      hasGroundedReadLikeIntent: true,
      lastTaskWasReadLike: true,
    });

    expect(instruction.operation).toBe("repair");
    expect(instruction.stagedSteps).toHaveLength(2);
    expect(instruction.stagedResumeCursor).toBe(2);
    expect(instruction.reason).toBe(
      "compound follow-up decomposed into staged grounded repair plan",
    );
  });

  it("keeps read filters and deliverable mode parsing explicit", () => {
    expect(parseGroundedRepairConstraints("only show function definitions"))
      .toEqual({ readFilter: "function-definitions" });
    expect(detectGroundedDeliverableMode("explain what src/app.ts does")).toBe(
      "explain",
    );
  });
});
