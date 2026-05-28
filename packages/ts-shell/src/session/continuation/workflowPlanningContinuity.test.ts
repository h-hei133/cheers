import { describe, expect, it } from "vitest";
import { deriveWorkflowPlanningContinuitySignals } from "./workflowPlanningContinuity.js";

describe("deriveWorkflowPlanningContinuitySignals", () => {
  it("keeps explicit targets from inheriting seed and diagnostic handoff targets", () => {
    const signals = deriveWorkflowPlanningContinuitySignals({
      continuity: {
        lastActionResultSeed: {
          actionKind: "read-file",
          verification: { status: "skipped" },
        },
      },
      diagnosticHandoffEvidence: {
        command: "npm test",
        status: "failed",
      },
      diagnosticHandoffProjectionLineage: ["diagnostic-handoff"],
      hasVerifyIntent: true,
      hasExplicitPathReference: true,
      hasPostEditReadOnlyVerifyPrompt: true,
      hasWeakSeedTargetCarryoverCue: false,
      hasCorrectionCue: false,
      hasCreateIntent: false,
      hasExecutionIntent: false,
      hasEditIntent: false,
      hasEffectiveReplaceDirectiveFromPrompt: false,
      hasFencedContent: false,
    });

    expect(signals.ignoredExplicitTargetLineageOrUndefined).toEqual([
      "seedInfluence=ignored-explicit-target",
      "diagnosticHandoff=ignored-explicit-target",
    ]);
    expect(signals.hasDiagnosticVerifyHandoffCue).toBe(false);
    expect(signals.diagnosticHandoffLineage).toBeUndefined();
    expect(signals.lastTaskHadVerifySignal).toBe(true);
  });

  it("does not turn prompt-text write intent into read-only continuation carryover", () => {
    const signals = deriveWorkflowPlanningContinuitySignals({
      continuity: {
        lastActionResultSeed: {
          actionKind: "read-file",
          verification: { status: "not-requested" },
        },
      },
      hasVerifyIntent: false,
      hasExplicitPathReference: false,
      hasPostEditReadOnlyVerifyPrompt: true,
      hasWeakSeedTargetCarryoverCue: true,
      hasCorrectionCue: false,
      hasCreateIntent: true,
      hasExecutionIntent: false,
      hasEditIntent: false,
      hasEffectiveReplaceDirectiveFromPrompt: false,
      hasFencedContent: false,
    });

    expect(signals.hasSeedReadOnlyCheckCue).toBe(false);
    expect(signals.verifyContinuationLineageOrUndefined).toBeUndefined();
  });
});
