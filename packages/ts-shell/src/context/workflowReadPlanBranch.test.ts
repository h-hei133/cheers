import { describe, expect, it } from "vitest";
import { buildWorkflowReadPlanBranch } from "./workflowReadPlanBranch.js";

describe("buildWorkflowReadPlanBranch", () => {
  it("keeps diagnostic handoff as read-only when no write or verify intent is present", () => {
    const plan = buildWorkflowReadPlanBranch({
      prompt: "continue",
      primaryTarget: { cleaned: "src/app.ts", inWorkspace: true },
      hasContinuationCue: false,
      hasFileReadIntent: false,
      hasExplicitPathReference: false,
      hasGroundedReadLikeIntent: false,
      hasDiagnosisIntent: false,
      hasExecutionIntent: false,
      hasEditIntent: false,
      hasCreateIntent: false,
      hasExecutionCorrectionCue: false,
      hasExplainIntent: false,
      hasSummarizeIntent: false,
      groundedIntentPrompt: "continue",
      isAmbiguousRepairFollowUp: false,
      hasCrossFileUltraWeakFollowUp: false,
      lastTaskWasReadLike: false,
      hasVerifyIntent: false,
      hasPostEditReadOnlyVerifyCue: false,
      hasSeedReadOnlyCheckCue: false,
      hasWeakDiagnosticHandoffCue: true,
      hasCorrectionCue: false,
      hasEffectiveReplaceDirectiveFromPrompt: false,
      hasFencedContent: false,
      hasReflectiveActionCue: false,
      hasRepairContinuationCue: false,
      hasEffectiveReplaceDirective: false,
      readWindowDirective: {},
      normalizedRepairInstruction: {
        operation: "continue",
        reason: "continue",
      },
      diagnosticHandoffLineage: ["diagnostic-handoff"],
      usedRestoredState: true,
    });

    expect(plan).toMatchObject({
      taskKind: "read-file",
      reason: "diagnostic-driven weak follow-up reused handoff target",
      targetPath: "src/app.ts",
      verifyAfterEdit: false,
      continuationLineage: ["diagnostic-handoff"],
      usedRestoredState: true,
    });
  });

  it("does not produce a read plan when write intent is present", () => {
    const plan = buildWorkflowReadPlanBranch({
      prompt: "continue and edit",
      primaryTarget: { cleaned: "src/app.ts", inWorkspace: true },
      hasContinuationCue: false,
      hasFileReadIntent: false,
      hasExplicitPathReference: false,
      hasGroundedReadLikeIntent: false,
      hasDiagnosisIntent: false,
      hasExecutionIntent: false,
      hasEditIntent: true,
      hasCreateIntent: false,
      hasExecutionCorrectionCue: false,
      hasExplainIntent: false,
      hasSummarizeIntent: false,
      groundedIntentPrompt: "continue and edit",
      isAmbiguousRepairFollowUp: false,
      hasCrossFileUltraWeakFollowUp: false,
      lastTaskWasReadLike: false,
      hasVerifyIntent: false,
      hasPostEditReadOnlyVerifyCue: false,
      hasSeedReadOnlyCheckCue: false,
      hasWeakDiagnosticHandoffCue: true,
      hasCorrectionCue: false,
      hasEffectiveReplaceDirectiveFromPrompt: false,
      hasFencedContent: false,
      hasReflectiveActionCue: false,
      hasRepairContinuationCue: false,
      hasEffectiveReplaceDirective: false,
      readWindowDirective: {},
      normalizedRepairInstruction: {
        operation: "continue",
        reason: "continue",
      },
      diagnosticHandoffLineage: ["diagnostic-handoff"],
      usedRestoredState: true,
    });

    expect(plan).toBeUndefined();
  });
});
