import { describe, expect, it } from "vitest";
import { buildAgentPlan } from "./agentPlan.js";
import { buildContextAwareProviderEditInput } from "./contextAwareProviderEdit.js";
import { buildContextAwareProviderPrompt } from "./contextAwareProviderPrompt.js";
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
  });
});

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
