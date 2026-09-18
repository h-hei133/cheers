import { describe, expect, it } from "vitest";
import { buildAgentPlan } from "../task/agentPlan.js";
import { buildContextGraph } from "../../orchestration/contextGraph.js";
import { scoreContextGraph } from "../../orchestration/contextGraphScore.js";
import { buildPlanQuality, attachPlanQualityToAgentPlan, attachProviderAnchoringToPlanQuality } from "./model.js";
import type { TargetedContextPacket } from "../../orchestration/contextPacket.js";
import { buildTestImpactPlan } from "../../orchestration/testImpactPlan.js";
import { normalizeCodeGraphFacts } from "../../context/acquisition/code/facts.js";
import { buildCodeGraphTrace } from "../../context/acquisition/code/trace.js";
import { buildCodeGraphImpact } from "../../context/acquisition/code/impact.js";

describe("planQuality", () => {
  it("scores high-quality context as ready and attaches score to Agent Plan", () => {
    const graph = readyGraph();
    const graphScore = scoreContextGraph(graph);
    const testImpactPlan = buildTestImpactPlan({ graph, score: graphScore });
    const codeGraphTrace = buildCodeGraphTrace({
      graph,
      facts: normalizeCodeGraphFacts({ graph, testImpactPlan }),
    });
    const codeGraphImpact = buildCodeGraphImpact({ trace: codeGraphTrace });
    const agentPlan = buildAgentPlan({
      ownerCapability: "agent-loop",
      taskKind: "edit-file",
      requestedActionKind: "edit",
      targetSummary: "src/app.ts",
      contextPacketIds: ["ctx_packet_188"],
      contextGraphIds: [graph.graphId],
      codeGraphTraceIds: [codeGraphTrace.traceId],
      impactQueryId: codeGraphImpact.impactQueryId,
      impactReadiness: codeGraphImpact.readiness,
      likelyAffectedFiles: codeGraphImpact.likelyCallSites,
      likelyAffectedTests: codeGraphImpact.likelyTests,
      graphReadiness: graphScore.planningReadiness,
      contextCoverageScore: graphScore.coverageScore,
      testImpactSummary: "tests=1; commands=2; readiness=ready",
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
      contextPacket: packet(),
      contextGraph: graph,
      contextGraphScore: graphScore,
      testImpactPlan,
      codeGraphTrace,
      codeGraphImpact,
    });
    const attached = attachPlanQualityToAgentPlan({ agentPlan, planQuality: quality });

    expect(quality.level).toBe("ready");
    expect(quality.score).toBeGreaterThanOrEqual(70);
    expect(quality.mutationAuthority).toBe("not-granted");
    expect(attached.planQualityId).toBe(quality.qualityId);
    expect(attached.impactQueryId).toBe(codeGraphImpact.impactQueryId);
    expect(attached.replaySafeSummary).toContain("qualityScore=");
  });

  it("classifies missing context as needs-more-context", () => {
    const agentPlan = buildAgentPlan({
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
    });

    const quality = buildPlanQuality({ agentPlan });

    expect(quality.level).toBe("needs-more-context");
    expect(quality.missingFacts).toContain("context packet missing");
    expect(quality.evidence).toContain("plan-quality:mutation-authority:not-granted");
  });

  it("requires analysis brief evidence for lifecycle-backed planning", () => {
    const agentPlan = buildAgentPlan({
      ownerCapability: "agent-loop",
      taskKind: "edit-file",
      requestedActionKind: "edit",
      targetSummary: "src/app.ts",
      taskLifecycleId: "task_lifecycle_quality",
      taskLifecycleCurrentStage: "plan",
      contextPacketIds: ["ctx_packet_188"],
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

    const quality = buildPlanQuality({ agentPlan, contextPacket: packet() });

    expect(quality.level).toBe("needs-more-context");
    expect(quality.taskLifecycleId).toBe("task_lifecycle_quality");
    expect(quality.missingFacts).toContain(
      "analysis brief missing for lifecycle task",
    );
  });

  it("consumes anchored provider proposal readiness without granting mutation", () => {
    const agentPlan = buildAgentPlan({
      ownerCapability: "agent-loop",
      taskKind: "edit-file",
      requestedActionKind: "edit",
      targetSummary: "src/app.ts",
      contextPacketIds: ["ctx_packet_188"],
      contextCompleteness: "complete",
      confidence: "high",
      executionReadiness: "ready",
      missingFacts: [],
      suggestedReads: [],
      suggestedVerification: [],
      safeEvidenceMarkers: [],
      mutationAuthority: "not-granted",
      redactionStatus: "redacted-and-budgeted",
      doNext: "review provider anchors",
    });
    const quality = buildPlanQuality({ agentPlan, contextPacket: packet() });
    const attached = attachProviderAnchoringToPlanQuality({
      planQuality: quality,
      anchoredProposal: {
        anchoredProposalId: "provider-anchored-194",
        sourceOutputValidationId: "validation-194",
        extractionId: "extraction-194",
        matchResultId: "match-194",
        conflictId: "conflict-194",
        candidateIds: ["candidate-194"],
        exactHunkIds: ["hunk-194"],
        partialCandidateIds: [],
        unsupportedCandidateIds: [],
        hunks: [],
        anchorQualityId: "anchor-quality-194",
        anchorQualityLevel: "exact-ready",
        reviewRequirement: "explicit-review-and-confirmation",
        handoffReadiness: "exact-single-target",
        mutationAuthority: "not-granted",
        redactionStatus: "raw-content-excluded",
        safeSummary: "provider anchored proposal",
        transcriptSummary: "provider-anchored-proposal id=provider-anchored-194",
        evidence: ["provider-anchored-proposal:id:provider-anchored-194"],
      },
      anchoringResult: {
        status: "anchored-proposal-handoff-ready",
        anchoredProposalId: "provider-anchored-194",
        candidateCount: 1,
        exactCount: 1,
        partialCount: 0,
        unsupportedCount: 0,
        anchorQualityLevel: "exact-ready",
        missingFacts: [],
        suggestedReads: [],
        noWrite: true,
        mutationAuthority: "not-granted",
        redactionStatus: "raw-content-excluded",
        reason: "ready",
        nextAction: "review",
        safeSummary: "provider-anchoring proposal=provider-anchored-194",
        evidence: ["provider-anchoring-result:status:anchored-proposal-handoff-ready"],
      },
    });

    expect(attached.providerAnchoredProposalId).toBe("provider-anchored-194");
    expect(attached.providerAnchoringOutcome).toBe("anchored-proposal-handoff-ready");
    expect(attached.evidence).toContain("plan-quality:provider-handoff:exact-single-target");
    expect(attached.mutationAuthority).toBe("not-granted");
  });
});

function readyGraph() {
  return buildContextGraph({
    rootTarget: "src/app.ts",
    rootPacketId: "ctx_packet_188",
    nodes: [
      node("root-target", "src/app.ts", 0),
      node("direct-import", "src/lib.ts", 1),
      node("nearby-test", "src/app.test.ts", 1),
      node("docs-readme", "README.md", 1),
      node("reverse-call-site", "src/main.ts", 1),
      node("second-hop-candidate", "src/helper.ts", 2),
    ],
    edges: [
      { fromPathLabel: "src/app.ts", toPathLabel: "src/lib.ts", kind: "imports", reason: "imports" },
      { fromPathLabel: "src/app.ts", toPathLabel: "src/app.test.ts", kind: "tests", reason: "tests" },
      { fromPathLabel: "src/app.ts", toPathLabel: "README.md", kind: "documents", reason: "docs" },
      { fromPathLabel: "src/app.ts", toPathLabel: "src/main.ts", kind: "calls-or-references", reason: "uses" },
    ],
  });
}

function node(
  kind: Parameters<typeof buildContextGraph>[0]["nodes"][number]["kind"],
  pathLabel: string,
  depth: 0 | 1 | 2,
): Parameters<typeof buildContextGraph>[0]["nodes"][number] {
  return {
    kind,
    pathLabel,
    relation: kind,
    sourceKind: "target-packet",
    depth,
    reason: kind,
    budgetStatus: "included",
    confidence: "high",
    redactionStatus: "redacted-and-budgeted",
  };
}

function packet(): TargetedContextPacket {
  return {
    packetId: "ctx_packet_188",
    rootTargetFile: "src/app.ts",
    targetSafeLabel: "src/app.ts",
    targetKind: "explicit-code-target",
    readBudget: {
      maxCandidateCount: 16,
      maxFilesRead: 8,
      maxBytesPerFile: 16_000,
      maxTotalBytes: 64_000,
      filesRead: 1,
      bytesUsed: 100,
    },
    contextSources: [],
    selectedCandidateSummaries: [],
    omittedCandidateSummaries: [],
    completenessStatus: "complete",
    confidence: "high",
    freshnessFacts: ["context-freshness:read-during-current-turn"],
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    replaySafeSummary: "context-packet ctx_packet_188",
    evidence: ["context-packet:id:ctx_packet_188"],
  };
}
