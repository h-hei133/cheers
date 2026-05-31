import { describe, expect, it } from "vitest";
import { buildAgentPlan } from "../../orchestration/agentPlan.js";
import { buildHarnessScorecard } from "../../orchestration/harnessScorecard.js";
import { buildHarnessTrace } from "../../orchestration/harnessTrace.js";
import { buildPlanQuality } from "./model.js";
import { evaluatePlanQualityGate } from "./gate.js";
import { buildPlanQualityCodingResult } from "./result.js";

describe("planQualityResult", () => {
  it("projects replay-safe no-write quality trace and scorecard evidence", () => {
    const quality = buildPlanQuality({
      agentPlan: buildAgentPlan({
        ownerCapability: "agent-loop",
        taskKind: "edit-file",
        requestedActionKind: "edit",
        targetSummary: "src/app.ts",
        contextPacketIds: [],
        contextCompleteness: "missing-context",
        confidence: "medium",
        executionReadiness: "needs-more-context",
        missingFacts: ["context packet missing"],
        suggestedReads: ["src/app.ts"],
        suggestedVerification: [],
        safeEvidenceMarkers: [],
        mutationAuthority: "not-granted",
        redactionStatus: "redacted-and-budgeted",
        doNext: "read target",
      }),
    });
    const gate = evaluatePlanQualityGate({ planQuality: quality, action: "provider-proposal" });
    const trace = buildHarnessTrace({
      agentPlanId: quality.sourceAgentPlanId,
      planQualityId: quality.qualityId,
      status: quality.level,
      reason: gate.reason,
      evidence: gate.evidence,
    });
    const scorecard = buildHarnessScorecard({ planQuality: quality, trace });

    const result = buildPlanQualityCodingResult({ planQuality: quality, gate, trace, scorecard });

    expect(result.changedFiles).toEqual([]);
    expect(result.verification.status).toBe("blocked");
    expect(result.verification.nextAction).toBe(gate.nextAction);
    expect(result.continuation.evidence).toEqual(
      expect.arrayContaining([
        quality.replaySafeSummary,
        trace.replaySafeSummary,
        scorecard.replaySafeSummary,
        "plan-quality-result:mutation-authority:not-granted",
        "plan-quality-result:raw-content-excluded",
      ]),
    );
  });
});
