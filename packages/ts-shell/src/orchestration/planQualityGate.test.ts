import { describe, expect, it } from "vitest";
import { buildAgentPlan } from "./agentPlan.js";
import { buildContextGraph } from "./contextGraph.js";
import { scoreContextGraph } from "./contextGraphScore.js";
import { buildPlanQuality } from "./planQuality.js";
import { evaluatePlanQualityGate } from "./planQualityGate.js";

describe("planQualityGate", () => {
  it("blocks provider proposal when quality needs more context", () => {
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

    expect(gate.decision).toBe("stop-needs-more-context");
    expect(gate.allowed).toBe(false);
    expect(gate.evidence).toContain("plan-quality-gate:provider-call:not-run");
    expect(gate.mutationAuthority).toBe("not-granted");
  });

  it("blocks repair loops without runtime receipt evidence", () => {
    const quality = buildPlanQuality({
      agentPlan: buildAgentPlan({
        ownerCapability: "agent-loop",
        taskKind: "edit-file",
        requestedActionKind: "edit",
        targetSummary: "src/app.ts",
        contextPacketIds: ["ctx"],
        contextCompleteness: "complete",
        confidence: "high",
        executionReadiness: "ready",
        missingFacts: [],
        suggestedReads: [],
        suggestedVerification: ["npm test -- --help"],
        safeEvidenceMarkers: [],
        mutationAuthority: "not-granted",
        redactionStatus: "redacted-and-budgeted",
        doNext: "verify",
      }),
    });

    const gate = evaluatePlanQualityGate({ planQuality: quality, action: "repair-loop" });

    expect(gate.decision).toBe("stop-missing-runtime-receipt");
    expect(gate.allowed).toBe(false);
  });

  it("blocks provider proposal when graph quality is budget-limited", () => {
    const graph = buildContextGraph({
      rootTarget: "src/app.ts",
      nodes: [
        {
          kind: "root-target",
          pathLabel: "src/app.ts",
          relation: "target",
          sourceKind: "target-packet",
          depth: 0,
          reason: "target",
          budgetStatus: "included",
          confidence: "high",
          redactionStatus: "redacted-and-budgeted",
        },
        {
          kind: "omitted-candidate",
          pathLabel: "src/large.ts",
          relation: "sibling",
          sourceKind: "sibling-scan",
          depth: 1,
          reason: "over byte budget",
          budgetStatus: "omitted",
          confidence: "medium",
          redactionStatus: "raw-content-excluded",
          omissionReason: "over-byte-budget",
        },
      ],
      edges: [],
    });
    const graphScore = scoreContextGraph(graph);
    const agentPlan = buildAgentPlan({
      ownerCapability: "agent-loop",
      taskKind: "edit-file",
      requestedActionKind: "edit",
      targetSummary: "src/app.ts",
      contextPacketIds: ["ctx_188"],
      contextGraphIds: [graph.graphId],
      graphReadiness: graphScore.planningReadiness,
      contextCompleteness: "complete",
      confidence: "high",
      executionReadiness: "ready",
      missingFacts: [],
      suggestedReads: [],
      suggestedVerification: ["npm test -- --help"],
      safeEvidenceMarkers: [],
      mutationAuthority: "not-granted",
      redactionStatus: "redacted-and-budgeted",
      doNext: "verify",
    });
    const quality = buildPlanQuality({
      agentPlan,
      contextGraph: graph,
      contextGraphScore: graphScore,
      testImpactPlan: {
        impactPlanId: "test_188",
        graphId: graph.graphId,
        likelyTestFiles: ["src/app.test.ts"],
        likelyVerificationCommandCandidates: [
          {
            command: "npm test -- --help",
            source: "allowlisted-generic",
            readiness: "ready",
            reason: "allowlisted",
          },
        ],
        confidence: "high",
        missingTestContext: [],
        suggestedReads: [],
        commandReadiness: "ready",
        noWriteEvidence: [],
        replaySafeSummary: "test-impact test_188",
        evidence: ["test-impact:id:test_188"],
      },
    });

    const gate = evaluatePlanQualityGate({ planQuality: quality, action: "provider-proposal" });

    expect(quality.level).toBe("budget-limited");
    expect(gate.decision).toBe("stop-budget-limited");
    expect(gate.allowed).toBe(false);
  });
});
