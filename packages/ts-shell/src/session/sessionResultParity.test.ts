import { describe, expect, it } from "vitest";
import type { CodingResultSummary } from "../orchestration/types.js";
import { projectSessionResultParity } from "./sessionResultParity.js";

describe("session result parity", () => {
  it("keeps approval-denied reason distinct from do-next guidance", () => {
    const projection = projectSessionResultParity({
      terminalClassification: "stopped",
      stopReason: "Re-run and approve escalation for verify command execution.",
      codingResult: makeCodingResult({
        reason: "Approval denied by user for bash",
        nextAction: "Re-run and approve escalation for verify command execution.",
        evidence: ["actionable-blocker-kind:approval-denied"],
      }),
    });

    expect(projection.blockerKind).toBe("approval-denied");
    expect(projection.reason).toBe("Approval denied by user for bash");
    expect(projection.doNext).toBe(
      "Re-run and approve escalation for verify command execution.",
    );
    expect(projection.capabilityArea).toBe("permission-policy");
  });

  it("projects context and agent-plan safe markers for session consumers", () => {
    const projection = projectSessionResultParity({
      terminalClassification: "stopped",
      stopReason: "Read suggested candidates before planning mutation.",
      codingResult: makeCodingResult({
        reason: "Context packet needs more related reads before planning.",
        nextAction: "Read suggested candidates before planning mutation.",
        evidence: [
          "context-packet ctx_abc; target=src/target.ts; included=2; omitted=1; mutationAuthority=not-granted; raw-full-content-excluded",
          "agent-plan plan_abc; readiness=needs-more-context; confidence=medium; suggestedReads=1; mutationAuthority=not-granted; redaction=redacted-and-budgeted",
        ],
      }),
    });

    expect(projection.capabilityArea).toBe("agent-loop");
    expect(projection.mutationAuthority).toBe("not-granted");
    expect(projection.redactionStatus).toBe("redacted-and-budgeted");
    expect(projection.suggestedReads).toBe("1");
    expect(projection.reason).toContain("Context packet needs more related reads");
  });

  it("projects context graph and test-impact markers for session consumers", () => {
    const projection = projectSessionResultParity({
      terminalClassification: "stopped",
      stopReason: "Read omitted graph candidates before provider planning.",
      codingResult: makeCodingResult({
        reason: "Context graph is budget limited.",
        nextAction: "Read omitted graph candidates before provider planning.",
        evidence: [
          "context-graph ctx_graph_abc; root=src/target.ts; nodes=8; included=6; omitted=2; mutationAuthority=not-granted; raw-content-excluded",
          "test-impact test_impact_abc; graph=ctx_graph_abc; tests=1; commands=2; readiness=ready; mutationAuthority=not-granted",
          "context-graph-score:readiness:budget-limited",
        ],
      }),
    });

    expect(projection.capabilityArea).toBe("workspace-file-context");
    expect(projection.mutationAuthority).toBe("not-granted");
    expect(projection.redactionStatus).toBe("raw-content-excluded");
    expect(projection.evidenceMarkers).toContain(
      "context-graph ctx_graph_abc; root=src/target.ts; nodes=8; included=6; omitted=2; mutationAuthority=not-granted; raw-content-excluded",
    );
    expect(projection.evidenceMarkers).toContain(
      "test-impact test_impact_abc; graph=ctx_graph_abc; tests=1; commands=2; readiness=ready; mutationAuthority=not-granted",
    );
  });

  it("projects plan quality harness trace and scorecard markers for session consumers", () => {
    const projection = projectSessionResultParity({
      terminalClassification: "stopped",
      stopReason: "Read missing context before provider proposal.",
      codingResult: makeCodingResult({
        reason: "Provider proposal blocked by plan quality.",
        nextAction: "Read missing context before provider proposal.",
        evidence: [
          "plan-quality plan_quality_abc; agentPlan=plan_abc; contextPacket=ctx_abc; contextGraph=ctx_graph_abc; level=needs-more-context; score=62; suggestedReads=2; mutationAuthority=not-granted; raw-content-excluded",
          "harness-trace harness_trace_abc; route=route188; contextPacket=ctx_abc; contextGraph=ctx_graph_abc; agentPlan=plan_abc; planQuality=plan_quality_abc; stages=read,plan; failureClass=missing-context; mutationAuthority=not-granted; raw-content-excluded",
          "harness-scorecard harness_scorecard_abc; trace=harness_trace_abc; planQuality=plan_quality_abc; context=warn; plan=warn; provider=fail; verification=skip; repair=skip; failureClass=missing-context; mutationAuthority=not-granted; raw-content-excluded",
        ],
      }),
    });

    expect(projection.capabilityArea).toBe("workspace-file-context");
    expect(projection.mutationAuthority).toBe("not-granted");
    expect(projection.redactionStatus).toBe("raw-content-excluded");
    expect(projection.suggestedReads).toBe("2");
    expect(projection.evidenceMarkers).toEqual(
      expect.arrayContaining([
        "plan-quality plan_quality_abc; agentPlan=plan_abc; contextPacket=ctx_abc; contextGraph=ctx_graph_abc; level=needs-more-context; score=62; suggestedReads=2; mutationAuthority=not-granted; raw-content-excluded",
        "harness-trace harness_trace_abc; route=route188; contextPacket=ctx_abc; contextGraph=ctx_graph_abc; agentPlan=plan_abc; planQuality=plan_quality_abc; stages=read,plan; failureClass=missing-context; mutationAuthority=not-granted; raw-content-excluded",
        "harness-scorecard harness_scorecard_abc; trace=harness_trace_abc; planQuality=plan_quality_abc; context=warn; plan=warn; provider=fail; verification=skip; repair=skip; failureClass=missing-context; mutationAuthority=not-granted; raw-content-excluded",
      ]),
    );
  });

  it("projects context-aware provider proposal markers for session consumers", () => {
    const projection = projectSessionResultParity({
      terminalClassification: "stopped",
      stopReason: "Review the context-aware provider proposal before handoff.",
      codingResult: makeCodingResult({
        reason: "Context-aware provider proposal was created for review.",
        nextAction: "Review the context-aware provider proposal before handoff.",
        evidence: [
          "context-aware-provider proposal=provider-edit-abc; status=review-required-proposal; contextPacket=ctx_abc; agentPlan=plan_abc; mutationAuthority=not-granted; raw-content-excluded",
          "context-aware-provider-result:mutation:not-run",
        ],
      }),
    });

    expect(projection.capabilityArea).toBe("edit-patch");
    expect(projection.mutationAuthority).toBe("not-granted");
    expect(projection.redactionStatus).toBe("raw-content-excluded");
    expect(projection.evidenceMarkers).toContain(
      "context-aware-provider-result:mutation:not-run",
    );
  });

  it("projects verification repair loop markers for session consumers", () => {
    const projection = projectSessionResultParity({
      terminalClassification: "stopped",
      stopReason: "Review repair proposal and explicitly confirm exact hunks.",
      codingResult: makeCodingResult({
        reason: "Verification failed; repair proposal requires review.",
        nextAction: "Review repair proposal and explicitly confirm exact hunks.",
        evidence: [
          "verification-repair-loop id=verification-repair-loop-abc; state=repair-review-required; repairContext=edit-repair-context-def; repairProposal=edit-repair-proposal-def; contextPacket=ctx_abc; agentPlan=plan_abc; verification=failed; runtimeReceipts=1; provider=proposal-only; next=review; raw-content-excluded",
          "verification-repair-result:mutation-authority:not-granted-until-existing-route",
        ],
      }),
    });

    expect(projection.capabilityArea).toBe("edit-patch");
    expect(projection.mutationAuthority).toBe("not-granted");
    expect(projection.redactionStatus).toBe("raw-content-excluded");
    expect(projection.evidenceMarkers).toContain(
      "verification-repair-result:mutation-authority:not-granted-until-existing-route",
    );
  });

  it("projects verification command markers for session consumers", () => {
    const projection = projectSessionResultParity({
      terminalClassification: "stopped",
      stopReason: "Create a review-gated repair context from the failed test command.",
      codingResult: makeCodingResult({
        reason: "Verification command failed.",
        nextAction: "Create a review-gated repair context from the failed test command.",
        evidence: [
          "verification-command id=verification-command-plan-abc:result:failed; plan=verification-command-plan-abc; command=npm test -- --help; outcome=failed; failureClass=test-failed; runtimeReceipts=1; repairEligible=yes; mutationAuthority:not-granted; mutation:not-run; raw-content-excluded",
          "verification-command-result:mutation:not-run",
        ],
      }),
    });

    expect(projection.capabilityArea).toBe("edit-patch");
    expect(projection.mutationAuthority).toBe("not-granted");
    expect(projection.redactionStatus).toBe("raw-content-excluded");
    expect(projection.evidenceMarkers).toContain(
      "verification-command-result:mutation:not-run",
    );
  });
});

function makeCodingResult(input: {
  readonly reason: string;
  readonly nextAction?: string;
  readonly evidence: readonly string[];
}): CodingResultSummary {
  return {
    taskKind: "edit-file",
    changedFiles: [],
    failedFiles: [{ path: "(session parity)", reason: input.reason }],
    patches: [],
    repair: {
      status: "failed",
      attempts: 0,
      recoveredItems: [],
      failedItems: [],
      notes: [],
    },
    continuation: {
      status: "failed-after-bounded-continuation",
      attempts: 1,
      evidence: [...input.evidence],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles: [],
      changedFiles: [],
      unchangedAttemptedFiles: [],
    },
    taskSatisfaction: {
      verdict: "insufficient-evidence",
      reasons: [input.reason],
      requiredEvidence: [],
      observedEvidence: [...input.evidence],
    },
    verifiedFiles: [],
    unverifiedFiles: [],
    verification: {
      status: "blocked",
      reason: input.reason,
      blockerKind: "unknown",
      ...(input.nextAction ? { nextAction: input.nextAction } : {}),
    },
    evidence: [...input.evidence],
  };
}
