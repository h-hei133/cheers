import { describe, expect, it } from "vitest";
import { buildAgentPlan } from "./agentPlan.js";
import { planContextAwareProviderProposal } from "./contextAwareProviderProposal.js";
import type { TargetedContextPacket } from "./contextPacket.js";
import { buildPlanQuality } from "../planning/quality/model.js";

describe("contextAwareProviderProposal", () => {
  it("creates a context-aware fake-provider proposal with context and plan ids no-write", async () => {
    const packet = buildPacket("complete");
    const plan = buildPlan(packet, "ready");
    const result = await planContextAwareProviderProposal({
      requestId: "req-provider",
      targetSummary: "src/app.ts",
      contextPacket: packet,
      agentPlan: plan,
      userRequest: "rename runApp",
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      provider: {
        proposeEdit: (context) => {
          expect(context.contextPacketId).toBe(packet.packetId);
          expect(context.agentPlanId).toBe(plan.planId);
          expect(context.mutationAuthority).toBe("not-granted");
          return {
            operationKind: "exact-fenced-replacement",
            targets: [
              {
                path: "src/app.ts",
                summary: "rename runApp to startApp",
                oldText: "runApp",
                newText: "startApp",
              },
            ],
            confidence: "high",
          };
        },
      },
    });

    expect(result.status).toBe("handoff-ready-proposal");
    expect(result.changedFiles).toEqual([]);
    expect(result.mutationAuthority).toBe("not-granted");
    expect(result.mutation).toBe("not-run");
    expect(result.manifest.contextPacketId).toBe(packet.packetId);
    expect(result.manifest.agentPlanId).toBe(plan.planId);
    expect(result.evidence).toContain(
      `provider-edit-proposal:context-packet:${packet.packetId}`,
    );
    expect(result.evidence).toContain(
      "context-aware-provider-proposal:mutation:not-run",
    );
  });

  it("stops missing, over-budget, and needs-more-context before provider calls", async () => {
    let calls = 0;
    const packet = buildPacket("complete");
    const overBudgetPacket = buildPacket("partial", "file byte budget exceeded");
    const needsContextPlan = buildPlan(packet, "needs-more-context");
    const readyPlan = buildPlan(packet, "ready");
    const provider = {
      proposeEdit: () => {
        calls += 1;
        return { operationKind: "generated-replacement" as const };
      },
    };

    const missing = await planContextAwareProviderProposal({
      requestId: "req-missing",
      targetSummary: "src/app.ts",
      userRequest: "rename runApp",
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      provider,
    });
    const needsContext = await planContextAwareProviderProposal({
      requestId: "req-needs-context",
      targetSummary: "src/app.ts",
      contextPacket: packet,
      agentPlan: needsContextPlan,
      userRequest: "rename runApp",
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      provider,
    });
    const overBudget = await planContextAwareProviderProposal({
      requestId: "req-over-budget",
      targetSummary: "src/app.ts",
      contextPacket: overBudgetPacket,
      agentPlan: readyPlan,
      userRequest: "rename runApp",
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      provider,
    });

    expect(missing.status).toBe("context-missing-stopped");
    expect(needsContext.status).toBe("context-missing-stopped");
    expect(overBudget.status).toBe("context-over-budget-stopped");
    expect(calls).toBe(0);
    expect(needsContext.evidence).toContain(
      "context-aware-provider-proposal:provider-call:not-run-or-invalid",
    );
  });

  it("preserves provider unavailable, opt-in, and invalid proposal stopped no-write states", async () => {
    const packet = buildPacket("complete");
    const plan = buildPlan(packet, "ready");
    const unavailable = await planContextAwareProviderProposal({
      requestId: "req-unavailable",
      targetSummary: "src/app.ts",
      contextPacket: packet,
      agentPlan: plan,
      userRequest: "rename runApp",
      availability: { kind: "not-configured" },
    });
    const optIn = await planContextAwareProviderProposal({
      requestId: "req-opt-in",
      targetSummary: "src/app.ts",
      contextPacket: packet,
      agentPlan: plan,
      userRequest: "rename runApp",
      availability: { kind: "opt-in-required" },
    });
    const invalid = await planContextAwareProviderProposal({
      requestId: "req-invalid",
      targetSummary: "src/app.ts",
      contextPacket: packet,
      agentPlan: plan,
      userRequest: "rename runApp",
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      provider: {
        proposeEdit: () => ({
          operationKind: "fuzzy-replacement",
          targets: [{ path: "src/app.ts" }],
        }),
      },
    });

    expect(unavailable.status).toBe("provider-not-configured");
    expect(optIn.status).toBe("provider-opt-in-required");
    expect(invalid.status).toBe("provider-invalid-proposal");
    expect(unavailable.changedFiles).toEqual([]);
    expect(optIn.changedFiles).toEqual([]);
    expect(invalid.changedFiles).toEqual([]);
    expect(invalid.evidence).toContain("provider-edit-proposal:invalid");
  });

  it("blocks provider proposal by low plan quality before fake provider call", async () => {
    let calls = 0;
    const packet = buildPacket("complete");
    const plan = buildPlan(packet, "ready");
    const quality = buildPlanQuality({ agentPlan: plan, contextPacket: packet });

    const result = await planContextAwareProviderProposal({
      requestId: "req-quality",
      targetSummary: "src/app.ts",
      contextPacket: packet,
      agentPlan: plan,
      planQuality: quality,
      userRequest: "rename runApp",
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      provider: {
        proposeEdit: () => {
          calls += 1;
          return { operationKind: "generated-replacement" as const };
        },
      },
    });

    expect(result.status).toBe("provider-quality-blocked");
    expect(calls).toBe(0);
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        `context-aware-provider-edit:agent-plan:${plan.planId}`,
        `plan-quality:agent-plan:${plan.planId}`,
        "plan-quality-gate:provider-call:not-run",
        "context-aware-provider-proposal:mutation:not-run",
      ]),
    );
  });

  it("stops lifecycle provider proposal when analysis brief is missing", async () => {
    let calls = 0;
    const packet = buildPacket("complete");
    const plan = buildPlan(packet, "ready", {
      taskLifecycleId: "task_lifecycle_provider",
      taskLifecycleCurrentStage: "plan",
    });

    const result = await planContextAwareProviderProposal({
      requestId: "req-missing-analysis",
      targetSummary: "src/app.ts",
      contextPacket: packet,
      agentPlan: plan,
      userRequest: "rename runApp",
      availability: { kind: "available", providerKindLabel: "fake-provider" },
      provider: {
        proposeEdit: () => {
          calls += 1;
          return { operationKind: "generated-replacement" as const };
        },
      },
    });

    expect(result.status).toBe("context-missing-stopped");
    expect(result.reason).toContain("analysis brief");
    expect(result.evidence).toContain(
      "context-aware-provider-edit:task-lifecycle:task_lifecycle_provider",
    );
    expect(calls).toBe(0);
  });
});

function buildPlan(
  packet: TargetedContextPacket,
  executionReadiness: "ready" | "needs-more-context",
  lifecycle?: {
    readonly taskLifecycleId?: string;
    readonly taskLifecycleCurrentStage?: string;
    readonly analysisBriefId?: string;
    readonly taskExecutionPlanId?: string;
  },
) {
  return buildAgentPlan({
    ownerCapability: "edit-patch",
    taskKind: "edit-file",
    requestedActionKind: "edit",
    targetSummary: packet.targetSafeLabel,
    ...lifecycle,
    contextPacketIds: [packet.packetId],
    contextCompleteness:
      executionReadiness === "ready" ? "complete" : "partial",
    confidence: executionReadiness === "ready" ? "high" : "medium",
    executionReadiness,
    missingFacts:
      executionReadiness === "ready" ? [] : ["nearby tests not included"],
    suggestedReads:
      executionReadiness === "ready" ? [] : ["src/app.test.ts"],
    suggestedVerification: ["npm test -- app"],
    safeEvidenceMarkers: [],
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    doNext: "review provider proposal",
  });
}

function buildPacket(
  completenessStatus: TargetedContextPacket["completenessStatus"],
  omittedReason?: string,
): TargetedContextPacket {
  return {
    packetId: "ctx_provider",
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
        summary: "exports runApp",
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
    omittedCandidateSummaries: omittedReason
      ? [
          {
            kind: "omitted-over-budget-candidate",
            pathLabel: "src/large.ts",
            relation: "sibling",
            status: "omitted",
            reason: omittedReason,
            byteLength: 9000,
            redactionApplied: false,
          },
        ]
      : [],
    confidence: "high",
    completenessStatus,
    freshnessFacts: ["context-freshness:read-during-current-turn"],
    redactionStatus: "redacted-and-budgeted",
    replaySafeSummary: "context-packet ctx_provider; target=src/app.ts",
    mutationAuthority: "not-granted",
    evidence: ["context-packet:id:ctx_provider"],
  };
}
