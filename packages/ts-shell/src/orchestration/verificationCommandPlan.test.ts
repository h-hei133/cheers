import { describe, expect, it } from "vitest";
import { buildAgentPlan } from "./agentPlan.js";
import { buildVerificationCommandPlan } from "./verificationCommandPlan.js";

describe("verificationCommandPlan", () => {
  it("selects an allowlisted Agent Plan verification command without granting authority", () => {
    const agentPlan = buildAgentPlan({
      ownerCapability: "edit-patch",
      taskKind: "edit-file",
      requestedActionKind: "verify",
      targetSummary: "src/app.ts",
      contextPacketIds: ["ctx_186"],
      contextCompleteness: "complete",
      confidence: "high",
      executionReadiness: "ready",
      missingFacts: [],
      suggestedReads: [],
      suggestedVerification: ["npm test -- --help"],
      safeEvidenceMarkers: [],
      mutationAuthority: "not-granted",
      redactionStatus: "redacted-and-budgeted",
      doNext: "run verification",
    });

    const plan = buildVerificationCommandPlan({ agentPlan, requireContext: true });

    expect(plan.state).toBe("ready");
    expect(plan.commandSafeLabel).toBe("npm test -- --help");
    expect(plan.sourceAgentPlanId).toBe(agentPlan.planId);
    expect(plan.sourceContextPacketId).toBe("ctx_186");
    expect(plan.allowlistStatus).toBe("allowlisted");
    expect(plan.permissionRequirement).toBe("checked-by-existing-runtime");
    expect(plan.executionReadiness).toBe("ready");
    expect(plan.evidence).toEqual(
      expect.arrayContaining([
        "verification-command-plan:state:ready",
        "verification-command-plan:allowlist:allowlisted",
        "verification-command-plan:mutation:not-run",
        "verification-command-plan:provider-call:not-run",
      ]),
    );
  });

  it("stops not-allowlisted commands before runtime execution", () => {
    const plan = buildVerificationCommandPlan({
      explicitCommand: "npm run lint",
      sourceProposalId: "proposal_186",
    });

    expect(plan.state).toBe("not-allowlisted");
    expect(plan.allowlistStatus).toBe("not-allowlisted");
    expect(plan.executionReadiness).toBe("not-ready");
    expect(plan.nextAction).toContain("Allowed commands");
  });

  it("can select proposal and edit-result verification command candidates", () => {
    const proposalPlan = buildVerificationCommandPlan({
      proposalVerificationCommand: "npm run build -- --help",
      sourceProposalId: "proposal_186",
    });
    const editResultPlan = buildVerificationCommandPlan({
      editResultVerificationCommand: "node --version",
      sourceEditTransactionId: "txn_186",
    });

    expect(proposalPlan.state).toBe("ready");
    expect(proposalPlan.source).toBe("proposal");
    expect(proposalPlan.sourceProposalId).toBe("proposal_186");
    expect(editResultPlan.state).toBe("ready");
    expect(editResultPlan.source).toBe("edit-result");
    expect(editResultPlan.sourceEditTransactionId).toBe("txn_186");
  });

  it("can select allowlisted test-impact verification candidates without executing them", () => {
    const plan = buildVerificationCommandPlan({
      testImpactPlan: {
        impactPlanId: "test_impact_187",
        graphId: "ctx_graph_187",
        likelyTestFiles: ["src/target.test.ts"],
        likelyVerificationCommandCandidates: [
          {
            command: "npm test -- src/target.test.ts",
            source: "targeted-test",
            readiness: "not-allowlisted",
            reason: "outside allowlist",
          },
          {
            command: "npm test -- --help",
            source: "allowlisted-generic",
            readiness: "ready",
            reason: "allowlisted",
          },
        ],
        confidence: "medium",
        missingTestContext: [],
        suggestedReads: [],
        commandReadiness: "ready",
        noWriteEvidence: ["test-impact:commands:not-executed"],
        replaySafeSummary: "test-impact test_impact_187",
        evidence: ["test-impact:id:test_impact_187"],
      },
    });

    expect(plan.state).toBe("ready");
    expect(plan.source).toBe("test-impact");
    expect(plan.command).toBe("npm test -- --help");
    expect(plan.sourceContextGraphId).toBe("ctx_graph_187");
    expect(plan.sourceTestImpactPlanId).toBe("test_impact_187");
    expect(plan.evidence).toContain(
      "verification-command-plan:test-impact:test_impact_187",
    );
  });

  it("surfaces explicit approval-required plans without dispatch authority", () => {
    const plan = buildVerificationCommandPlan({
      explicitCommand: "node --version",
      permissionState: "approval-required",
    });

    expect(plan.state).toBe("permission-required");
    expect(plan.permissionRequirement).toBe("explicit-approval-required");
    expect(plan.executionReadiness).toBe("not-ready");
  });

  it("can require context packet and Agent Plan ids before repair-loop bridging", () => {
    const plan = buildVerificationCommandPlan({
      explicitCommand: "node --version",
      requireContext: true,
    });

    expect(plan.state).toBe("context-missing");
    expect(plan.commandSafeLabel).toBe("node --version");
    expect(plan.permissionRequirement).toBe("not-applicable");
  });
});
