import { describe, expect, it } from "vitest";
import type { ContextAwareProviderPromptContext } from "./contextAwareProviderPrompt.js";
import { runRealProviderProposalDryRun } from "./realProviderProposalDryRun.js";

describe("realProviderProposalDryRun", () => {
  it("stops no opt-in and provider-not-configured before provider call", async () => {
    let calls = 0;
    const provider = {
      proposeEdit: () => {
        calls += 1;
        return { operationKind: "generated-replacement" as const };
      },
    };

    const noOptIn = await runRealProviderProposalDryRun({
      ...readyInput(),
      dryRunOptIn: false,
      provider,
    });
    const notConfigured = await runRealProviderProposalDryRun({
      ...readyInput(),
      providerAvailability: { kind: "not-configured", reason: "provider-readiness:missing-key" },
      provider,
    });

    expect(noOptIn.status).toBe("dry-run-stopped-no-opt-in");
    expect(notConfigured.status).toBe("dry-run-provider-not-configured");
    expect(noOptIn.providerCalled).toBe(false);
    expect(notConfigured.providerCalled).toBe(false);
    expect(calls).toBe(0);
  });

  it("stops missing lifecycle analysis and low plan quality before provider call", async () => {
    let calls = 0;
    const provider = {
      proposeEdit: () => {
        calls += 1;
        return { operationKind: "generated-replacement" as const };
      },
    };

    expect(
      (
        await runRealProviderProposalDryRun({
          ...readyInput(),
          lifecycleId: undefined,
          provider,
        })
      ).status,
    ).toBe("dry-run-missing-lifecycle");
    expect(
      (
        await runRealProviderProposalDryRun({
          ...readyInput(),
          analysisBriefId: undefined,
          provider,
        })
      ).status,
    ).toBe("dry-run-missing-analysis");
    expect(
      (
        await runRealProviderProposalDryRun({
          ...readyInput(),
          planQualityLevel: "needs-more-context",
          provider,
        })
      ).status,
    ).toBe("dry-run-low-plan-quality");
    expect(calls).toBe(0);
  });

  it("stops missing context, over-budget context, and redaction risk before provider call", async () => {
    let calls = 0;
    const provider = {
      proposeEdit: () => {
        calls += 1;
        return { operationKind: "generated-replacement" as const };
      },
    };

    expect(
      (
        await runRealProviderProposalDryRun({
          ...readyInput(),
          contextPacketId: undefined,
          provider,
        })
      ).status,
    ).toBe("dry-run-missing-context");
    expect(
      (
        await runRealProviderProposalDryRun({
          ...readyInput(),
          contextOverBudget: true,
          provider,
        })
      ).status,
    ).toBe("dry-run-context-over-budget");
    expect(
      (
        await runRealProviderProposalDryRun({
          ...readyInput(),
          redactionStatus: "risk",
          provider,
        })
      ).status,
    ).toBe("dry-run-redaction-risk");
    expect(calls).toBe(0);
  });

  it("creates exact-ready fake-provider dry-run proposal no-write with manifest ids", async () => {
    const result = await runRealProviderProposalDryRun({
      ...readyInput(),
      provider: {
        proposeEdit: (context) => {
          expect(context.mutationAuthority).toBe("not-granted");
          return {
            operationKind: "exact-fenced-replacement",
            targets: [
              {
                path: "src/app.ts",
                summary: "rename runApp",
                oldText: "runApp",
                newText: "startApp",
              },
            ],
            verificationPlan: ["npm test -- app"],
          };
        },
      },
      currentContentByTargetLabel: new Map([["src/app.ts", "runApp\n"]]),
    });

    expect(result.status).toBe("dry-run-exact-ready-no-write");
    expect(result.providerCalled).toBe(true);
    expect(result.changedFiles).toEqual([]);
    expect(result.mutationAuthority).toBe("not-granted");
    expect(result.manifest.dryRunId).toBe(result.dryRunId);
    expect(result.manifest.promptAuditId).toBe(result.promptAudit.auditId);
    expect(result.manifest.outputValidationId).toBe(result.outputValidation.validationId);
    expect(result.manifest.anchorQualityId).toBe(result.anchorQuality.qualityId);
    expect(result.manifest.planQualityId).toBe("plan_quality_193");
    expect(result.anchoredProposal.handoffReadiness).toBe("exact-single-target");
    expect(result.anchoringResult.status).toBe("anchored-proposal-handoff-ready");
    expect(result.evidence).toContain("provider-anchored-proposal:mutation-authority:not-granted");
  });

  it("keeps exact provider output review-only until current safe reads anchor it", async () => {
    const result = await runRealProviderProposalDryRun({
      ...readyInput("needs-current-read"),
      provider: {
        proposeEdit: () => ({
          operationKind: "exact-fenced-replacement",
          targets: [{ path: "src/app.ts", oldText: "runApp", newText: "startApp" }],
        }),
      },
    });

    expect(result.status).toBe("dry-run-review-required");
    expect(result.anchorQuality.level).toBe("review-only");
    expect(result.anchoringResult.suggestedReads).toEqual(["src/app.ts"]);
    expect(result.changedFiles).toEqual([]);
  });

  it("keeps unanchored malformed and unsafe fake-provider outputs no-write", async () => {
    const unanchored = await runRealProviderProposalDryRun({
      ...readyInput("unanchored"),
      provider: {
        proposeEdit: () => ({ operationKind: "generated-replacement" }),
      },
    });
    const malformed = await runRealProviderProposalDryRun({
      ...readyInput("malformed"),
      provider: {
        proposeEdit: () => ({
          operationKind: "exact-fenced-replacement",
          targets: [{ path: "src/other.ts", oldText: "a", newText: "b" }],
        }),
      },
    });
    const unsafe = await runRealProviderProposalDryRun({
      ...readyInput("unsafe"),
      provider: {
        proposeEdit: () => ({
          operationKind: "exact-fenced-replacement",
          targets: [{ path: "src/app.ts", oldText: "a", newText: "rm -rf /" }],
        }),
      },
    });

    expect(unanchored.status).toBe("dry-run-provider-invalid-output");
    expect(malformed.status).toBe("dry-run-provider-invalid-output");
    expect(unsafe.status).toBe("dry-run-anchor-quality-low");
    expect(unanchored.mutationAuthority).toBe("not-granted");
    expect(malformed.changedFiles).toEqual([]);
    expect(unsafe.evidence).toContain("provider-anchor-quality:level:unsafe");
  });

  it("stops prompt audit failure before provider call", async () => {
    let calls = 0;
    const result = await runRealProviderProposalDryRun({
      ...readyInput("audit"),
      promptContext: {
        ...buildPrompt("audit"),
        providerPrompt: "Authorization: Bearer abcdefgh12345 /home/wang/.private-agents-real",
      },
      provider: {
        proposeEdit: () => {
          calls += 1;
          return { operationKind: "generated-replacement" as const };
        },
      },
    });

    expect(result.status).toBe("dry-run-prompt-audit-failed");
    expect(result.providerCalled).toBe(false);
    expect(calls).toBe(0);
  });
});

function readyInput(requestId = "req-193") {
  return {
    requestId,
    dryRunOptIn: true,
    promptContext: buildPrompt(requestId),
    explicitTargetLabels: ["src/app.ts"],
    lifecycleId: "life_193",
    analysisBriefId: "analysis_193",
    analysisQualityId: "analysis_quality_193",
    analysisQualityDecision: "allow",
    planQualityId: "plan_quality_193",
    planQualityLevel: "ready",
    contextPacketId: "ctx_193",
    contextGraphId: "graph_193",
    codeGraphTraceId: "code_trace_193",
    taskExecutionPlanId: "exec_193",
    providerAvailability: { kind: "available", providerKindLabel: "fake-real-provider" } as const,
    redactionStatus: "redacted-and-budgeted",
  };
}

function buildPrompt(requestId: string): ContextAwareProviderPromptContext {
  return {
    requestId,
    contextPacketId: "ctx_193",
    contextGraphId: "graph_193",
    agentPlanId: "plan_193",
    taskLifecycleId: "life_193",
    analysisBriefId: "analysis_193",
    taskExecutionPlanId: "exec_193",
    userRequest: "rename runApp",
    targetSummary: "src/app.ts",
    target: { pathLabel: "src/app.ts", summary: "exports runApp" },
    relatedContext: [],
    constraints: ["keep no-write"],
    nonGoals: ["do not apply"],
    missingFacts: [],
    suggestedReads: [],
    suggestedVerification: ["npm test -- app"],
    omittedContentReasons: [],
    verificationExpectation: "review-before-apply",
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    providerPrompt:
      "Create a review-only provider edit proposal. Target: src/app.ts. Analysis brief: analysis_193. Return a bounded proposal only; mutation authority is not granted and changes must not be applied.",
    evidence: ["context-aware-provider-prompt:redacted-and-budgeted"],
  };
}
