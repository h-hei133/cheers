import { describe, expect, it } from "vitest";
import { projectWorkflowIntent } from "./workflowIntentProjection.js";

describe("workflowIntentProjection", () => {
  it("classifies reflective continuation queries without execution context", () => {
    expect(
      projectWorkflowIntent("what should we do next?", {}),
    ).toMatchObject({
      hasReflectiveExplainStateQuestion: false,
      detectedReflectiveStateQueryKind: "next-step",
      reflectiveStateQueryKind: "next-step",
      hasReflectiveActionCue: false,
    });

    expect(
      projectWorkflowIntent("what part did you just explain?", {}),
    ).toMatchObject({
      hasReflectiveExplainStateQuestion: true,
      reflectiveStateQueryKind: "explain-scope",
    });
  });

  it("projects approval-memory intent from structured continuity memory", () => {
    expect(
      projectWorkflowIntent("why is it asking approval again?", {
        lastApprovalDecision: "allow-once",
      }),
    ).toMatchObject({
      detectedReflectiveStateQueryKind: undefined,
      reflectiveStateQueryKind: "approval-memory",
    });
  });

  it("detects reflective action cues separately from query kind", () => {
    expect(projectWorkflowIntent("then continue fixing", {})).toMatchObject({
      reflectiveStateQueryKind: undefined,
      hasReflectiveActionCue: true,
    });
  });
});
