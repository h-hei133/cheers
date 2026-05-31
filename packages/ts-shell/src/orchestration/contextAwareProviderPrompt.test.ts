import { describe, expect, it } from "vitest";
import { buildAgentPlan } from "./agentPlan.js";
import { buildContextAwareProviderEditInput } from "./contextAwareProviderEdit.js";
import { buildContextAwareProviderPrompt } from "../provider/request/prompt.js";
import { buildCodeGraphImpact } from "./codeGraphImpact.js";
import { normalizeCodeGraphFacts } from "./codeGraphFacts.js";
import { buildCodeGraphTrace } from "./codeGraphTrace.js";
import { buildContextGraph } from "./contextGraph.js";
import type { TargetedContextPacket } from "./contextPacket.js";

describe("contextAwareProviderPrompt", () => {
  it("builds a redacted provider-facing context without raw full content", () => {
    const packet = buildPacket();
    const plan = buildAgentPlan({
      ownerCapability: "edit-patch",
      taskKind: "edit-file",
      requestedActionKind: "edit",
      targetSummary: "src/app.ts",
      contextPacketIds: [packet.packetId],
      contextGraphIds: ["ctx_graph_prompt"],
      graphReadiness: "context-ready",
      contextCoverageScore: 90,
      testImpactSummary: "tests=1; commands=2; readiness=ready",
      contextCompleteness: "complete",
      confidence: "high",
      executionReadiness: "ready",
      missingFacts: [],
      suggestedReads: ["src/app.test.ts"],
      suggestedVerification: ["npm test -- app"],
      safeEvidenceMarkers: [],
      mutationAuthority: "not-granted",
      redactionStatus: "redacted-and-budgeted",
      doNext: "review provider proposal",
    });
    const editInput = buildContextAwareProviderEditInput({
      requestId: "req-prompt",
      targetSummary: "src/app.ts",
      contextPacket: packet,
      agentPlan: plan,
      codeGraphImpact: impactFixture(),
      providerReadinessState: "available",
    });

    const prompt = buildContextAwareProviderPrompt({
      editInput,
      contextPacket: packet,
      userRequest:
        "rename function, token=super-secret-value, /home/wang/.private-agents-real/config",
      constraints: ["do not reveal api_key=secret-value"],
      nonGoals: ["do not apply changes"],
    });

    expect(prompt.contextPacketId).toBe(packet.packetId);
    expect(prompt.contextGraphId).toBe("ctx_graph_prompt");
    expect(prompt.codeGraphTraceId).toMatch(/^code_graph_trace_/);
    expect(prompt.impactQueryId).toMatch(/^code_graph_impact_/);
    expect(prompt.impactSummary).toContain("tests=1");
    expect(prompt.contextReadiness).toBe("context-ready");
    expect(prompt.testImpactSummary).toContain("tests=1");
    expect(prompt.agentPlanId).toBe(plan.planId);
    expect(prompt.target.summary).toContain("runApp");
    expect(prompt.relatedContext[0]?.pathLabel).toBe("src/app.test.ts");
    expect(prompt.providerPrompt).toContain("mutation");
    expect(JSON.stringify(prompt)).not.toContain("super-secret-value");
    expect(JSON.stringify(prompt)).not.toContain("secret-value");
    expect(JSON.stringify(prompt)).not.toContain(".private-agents-real/config");
    expect(prompt.evidence).toContain(
      "context-aware-provider-prompt:raw-full-content-excluded",
    );
    expect(prompt.evidence).toContain(
      "context-aware-provider-prompt:context-graph:ctx_graph_prompt",
    );
    expect(prompt.evidence.some((entry) =>
      entry.startsWith("context-aware-provider-prompt:impact-query:code_graph_impact_"),
    )).toBe(true);
  });
});

function impactFixture() {
  const graph = buildContextGraph({
    rootTarget: "src/app.ts",
    nodes: [
      graphNode("root-target", "src/app.ts", 0),
      graphNode("nearby-test", "src/app.test.ts", 1),
    ],
    edges: [
      { fromPathLabel: "src/app.ts", toPathLabel: "src/app.test.ts", kind: "tests", reason: "tests" },
    ],
  });
  const trace = buildCodeGraphTrace({ graph, facts: normalizeCodeGraphFacts({ graph }) });
  return buildCodeGraphImpact({ trace });
}

function graphNode(
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

function buildPacket(): TargetedContextPacket {
  return {
    packetId: "ctx_prompt",
    rootTargetFile: "src/app.ts",
    targetSafeLabel: "src/app.ts",
    targetKind: "explicit-code-target",
    readBudget: {
      limits: {
        maxCandidateCount: 24,
        maxFilesRead: 12,
        maxBytesPerFile: 8000,
        maxTotalBytes: 32000,
      },
      filesRead: 2,
      bytesUsed: 200,
      includedCount: 2,
    },
    contextSources: [],
    selectedCandidateSummaries: [
      {
        kind: "target-file-summary",
        pathLabel: "src/app.ts",
        relation: "target file",
        status: "included",
        summary: "exports runApp without raw file dump",
        byteLength: 100,
        redactionApplied: false,
      },
      {
        kind: "nearby-test",
        pathLabel: "src/app.test.ts",
        relation: "nearby test",
        status: "included",
        summary: "covers runApp",
        byteLength: 100,
        redactionApplied: false,
      },
    ],
    omittedCandidateSummaries: [],
    confidence: "high",
    completenessStatus: "complete",
    freshnessFacts: ["context-freshness:read-during-current-turn"],
    redactionStatus: "redacted-and-budgeted",
    replaySafeSummary: "context-packet ctx_prompt; target=src/app.ts",
    mutationAuthority: "not-granted",
    evidence: ["context-packet:id:ctx_prompt"],
  };
}
