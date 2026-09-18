import { describe, expect, it } from "vitest";

import { projectContextPacketToAgentPlanContext } from "./agentPlanContext.js";
import type { ContextGraph } from "../../orchestration/contextGraph.js";
import type { ContextGraphScore } from "../../orchestration/contextGraphScore.js";
import type { TargetedContextPacket } from "../../orchestration/contextPacket.js";
import type { TestImpactPlan } from "../../orchestration/testImpactPlan.js";

describe("projectContextPacketToAgentPlanContext", () => {
  it("projects context packet facts into replay-safe agent planning input", () => {
    const packet: TargetedContextPacket = {
      packetId: "ctx_test",
      rootTargetFile: "src/target.ts",
      targetSafeLabel: "src/target.ts",
      targetKind: "explicit-code-target",
      readBudget: {
        maxCandidateCount: 4,
        maxFilesRead: 4,
        maxBytesPerFile: 100,
        maxTotalBytes: 400,
        filesRead: 2,
        bytesUsed: 80,
      },
      contextSources: [],
      selectedCandidateSummaries: [
        {
          kind: "target-file-summary",
          pathLabel: "src/target.ts",
          relation: "explicit target",
          status: "included",
          summary: "lines=1",
          byteLength: 40,
          redactionApplied: false,
        },
      ],
      omittedCandidateSummaries: [
        {
          kind: "omitted-over-budget-candidate",
          pathLabel: "src/target.test.ts",
          relation: "nearby test",
          status: "omitted",
          reason: "file budget",
          byteLength: 500,
          redactionApplied: false,
        },
      ],
      confidence: "medium",
      completenessStatus: "partial",
      freshnessFacts: ["fresh"],
      redactionStatus: "redacted-and-budgeted",
      replaySafeSummary: "context-packet ctx_test; target=src/target.ts",
      mutationAuthority: "not-granted",
      evidence: ["context-packet:raw-full-content-excluded"],
    };

    const context = projectContextPacketToAgentPlanContext(packet);

    expect(context.contextPacketIds).toEqual(["ctx_test"]);
    expect(context.executionReadiness).toBe("needs-more-context");
    expect(context.suggestedReads).toEqual(["src/target.test.ts"]);
    expect(context.mutationAuthority).toBe("not-granted");
    expect(context.replaySafeEvidence).toContain(
      "context-packet:raw-full-content-excluded",
    );
  });

  it("projects graph coverage and test-impact facts into Agent Plan context", () => {
    const packet = packetFixture();
    const graph: ContextGraph = {
      graphId: "ctx_graph_agent",
      rootTarget: "src/target.ts",
      nodes: [],
      edges: [],
      includedCandidates: [],
      omittedCandidates: [],
      mutationAuthority: "not-granted",
      redactionStatus: "redacted-and-budgeted",
      replaySafeSummary: "context-graph ctx_graph_agent",
      evidence: ["context-graph:id:ctx_graph_agent"],
    };
    const score: ContextGraphScore = {
      graphId: graph.graphId,
      rootTargetConfidence: "high",
      importCoverage: 1,
      testCoverage: 1,
      docsCoverage: 1,
      callSiteCoverage: 1,
      omittedRiskLevel: "none",
      planningReadiness: "context-ready",
      coverageScore: 100,
      evidence: ["context-graph-score:coverage:100"],
    };
    const testImpact: TestImpactPlan = {
      impactPlanId: "test_impact_agent",
      graphId: graph.graphId,
      likelyTestFiles: ["src/target.test.ts"],
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
      suggestedReads: ["src/target.test.ts"],
      commandReadiness: "ready",
      noWriteEvidence: ["test-impact:mutation-authority:not-granted"],
      replaySafeSummary: "test-impact test_impact_agent",
      evidence: ["test-impact:id:test_impact_agent"],
    };

    const context = projectContextPacketToAgentPlanContext(packet, {
      graph,
      score,
      testImpact,
    });

    expect(context.contextGraphIds).toEqual(["ctx_graph_agent"]);
    expect(context.graphReadiness).toBe("context-ready");
    expect(context.contextCoverageScore).toBe(100);
    expect(context.suggestedVerification).toContain("npm test -- --help");
    expect(context.replaySafeEvidence).toContain("context-graph:id:ctx_graph_agent");
  });
});

function packetFixture(): TargetedContextPacket {
  return {
    packetId: "ctx_test",
    rootTargetFile: "src/target.ts",
    targetSafeLabel: "src/target.ts",
    targetKind: "explicit-code-target",
    readBudget: {
      maxCandidateCount: 4,
      maxFilesRead: 4,
      maxBytesPerFile: 100,
      maxTotalBytes: 400,
      filesRead: 2,
      bytesUsed: 80,
    },
    contextSources: [],
    selectedCandidateSummaries: [
      {
        kind: "target-file-summary",
        pathLabel: "src/target.ts",
        relation: "explicit target",
        status: "included",
        summary: "lines=1",
        byteLength: 40,
        redactionApplied: false,
      },
    ],
    omittedCandidateSummaries: [],
    confidence: "high",
    completenessStatus: "complete",
    freshnessFacts: ["fresh"],
    redactionStatus: "redacted-and-budgeted",
    replaySafeSummary: "context-packet ctx_test; target=src/target.ts",
    mutationAuthority: "not-granted",
    evidence: ["context-packet:raw-full-content-excluded"],
  };
}
