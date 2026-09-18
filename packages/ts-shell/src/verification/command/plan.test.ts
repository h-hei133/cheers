import { describe, expect, it } from "vitest";
import { buildAgentPlan } from "../../planning/task/agentPlan.js";
import { buildCodeGraphImpact } from "../../context/acquisition/code/impact.js";
import { normalizeCodeGraphFacts } from "../../context/acquisition/code/facts.js";
import { buildCodeGraphTrace } from "../../context/acquisition/code/trace.js";
import { buildContextGraph } from "../../orchestration/contextGraph.js";
import { buildPlanQuality } from "../../planning/quality/model.js";
import {
  buildVerificationCommandPlan,
  projectTaskStateVerificationPlan,
} from "./plan.js";

describe("verificationCommandPlan", () => {
  it("selects an allowlisted Agent Plan verification command without granting authority", () => {
    const agentPlan = buildAgentPlan({
      ownerCapability: "edit-patch",
      taskKind: "edit-file",
      requestedActionKind: "verify",
      targetSummary: "src/app.ts",
      taskLifecycleId: "task_lifecycle_verify",
      analysisBriefId: "analysis_brief_verify",
      taskExecutionPlanId: "task_execution_plan_verify",
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
    expect(plan.sourceTaskLifecycleId).toBe("task_lifecycle_verify");
    expect(plan.sourceAnalysisBriefId).toBe("analysis_brief_verify");
    expect(plan.sourceTaskExecutionPlanId).toBe("task_execution_plan_verify");
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
        "verification-command-plan:task-lifecycle:task_lifecycle_verify",
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


  it("maps the Route219 benchmark verifier to a product task-quality command kind", () => {
    const plan = buildVerificationCommandPlan({
      explicitCommand: "npm run verify:route219-real-task-quality-benchmark",
      sourceProposalId: "proposal_route219_benchmark",
    });

    expect(plan.state).toBe("ready");
    expect(plan.commandKind).toBe("task-quality-verifier");
    expect(plan.allowlistStatus).toBe("allowlisted");
    expect(plan.evidence).toContain("verification-command-plan:kind:task-quality-verifier");
  });

  it("keeps shell metacharacters outside the focused test allowlist", () => {
    const plan = buildVerificationCommandPlan({
      explicitCommand:
        "npm test -w packages/ts-shell -- src/verification/verificationCommandPlan.test.ts; echo unsafe",
      sourceProposalId: "proposal_route219_unsafe",
    });

    expect(plan.state).toBe("not-allowlisted");
    expect(plan.commandKind).toBe("unsupported");
    expect(plan.executionReadiness).toBe("not-ready");
  });

  it("keeps nonexistent focused test names outside the Route219 task allowlist", () => {
    const plan = buildVerificationCommandPlan({
      explicitCommand:
        "npm test -w packages/ts-shell -- src/orchestration/doesNotExist.test.ts",
      sourceProposalId: "proposal_route219_missing_test",
    });

    expect(plan.state).toBe("not-allowlisted");
    expect(plan.commandKind).toBe("unsupported");
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

  it("projects task-state verification targets from changed and failed files", () => {
    const plan = projectTaskStateVerificationPlan({
      taskKind: "edit-file",
      changedFiles: ["src/order/rules.ts"],
      failedFiles: [{ path: "src/order/rules.test.ts", reason: "expected ready" }],
      patches: [],
      repair: { status: "failed", attempts: 1, recoveredItems: [], failedItems: [], notes: [] },
      continuation: { status: "failed-after-bounded-continuation", attempts: 1, evidence: [] },
      changeSet: {
        gitAware: false,
        preExistingDirtyFiles: [],
        postRunDirtyFiles: ["src/order/rules.ts"],
        attemptedFiles: ["src/order/rules.ts"],
        changedFiles: ["src/order/rules.ts"],
        unchangedAttemptedFiles: [],
      },
      taskSatisfaction: {
        verdict: "partial",
        reasons: [],
        requiredEvidence: ["focused verification"],
        observedEvidence: [],
      },
      verifiedFiles: [],
      unverifiedFiles: [{ path: "src/order/rules.ts", reason: "not verified" }],
      verification: {
        status: "failed",
        command: "npm test -- src/order/rules.test.ts",
        reason: "expected ready",
        blockerKind: "test-failed",
        nextAction: "repair then rerun focused verification",
      },
      evidence: [],
    });

    expect(plan).toMatchObject({
      command: "npm test -- src/order/rules.test.ts",
      failedFiles: ["src/order/rules.test.ts"],
      status: "failed",
      nextAction: "repair then rerun focused verification",
    });
    expect(plan.targetFiles).toEqual([
      "src/order/rules.ts",
      "src/order/rules.test.ts",
    ]);
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

  it("prefers focused ready test-impact commands over generic readiness probes", () => {
    const plan = buildVerificationCommandPlan({
      testImpactPlan: {
        impactPlanId: "test_impact_focused",
        graphId: "ctx_graph_focused",
        likelyTestFiles: ["packages/ts-shell/src/verification/command/plan.test.ts"],
        likelyVerificationCommandCandidates: [
          {
            command: "npm test -- --help",
            source: "allowlisted-generic",
            readiness: "ready",
            reason: "generic readiness probe",
          },
          {
            command: "npm run build -w packages/ts-shell",
            source: "targeted-test",
            readiness: "ready",
            reason: "focused command covers changed owner",
          },
        ],
        confidence: "high",
        missingTestContext: [],
        suggestedReads: [],
        commandReadiness: "ready",
        noWriteEvidence: ["test-impact:commands:not-executed"],
        replaySafeSummary: "test-impact test_impact_focused",
        evidence: ["test-impact:id:test_impact_focused"],
      },
    });

    expect(plan.state).toBe("ready");
    expect(plan.source).toBe("test-impact");
    expect(plan.command).toBe("npm run build -w packages/ts-shell");
    expect(plan.commandKind).toBe("npm-build-ts-shell");
  });

  it("can select allowlisted code graph impact verification candidates without executing them", () => {
    const impact = impactFixture();
    const plan = buildVerificationCommandPlan({ codeGraphImpact: impact });

    expect(plan.state).toBe("ready");
    expect(plan.source).toBe("code-graph-impact");
    expect(plan.command).toBe("npm test -- --help");
    expect(plan.sourceImpactQueryId).toBe(impact.impactQueryId);
    expect(plan.evidence).toContain(
      `verification-command-plan:impact-query:${impact.impactQueryId}`,
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

  it("respects plan quality gate before command dispatch planning", () => {
    const agentPlan = buildAgentPlan({
      ownerCapability: "edit-patch",
      taskKind: "edit-file",
      requestedActionKind: "verify",
      targetSummary: "src/app.ts",
      contextPacketIds: ["ctx_188"],
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
    const quality = buildPlanQuality({ agentPlan });

    const plan = buildVerificationCommandPlan({
      agentPlan,
      planQuality: quality,
      requireContext: true,
    });

    expect(plan.state).toBe("quality-blocked");
    expect(plan.executionReadiness).toBe("not-ready");
    expect(plan.sourcePlanQualityId).toBe(quality.qualityId);
    expect(plan.evidence).toEqual(
      expect.arrayContaining([
        `verification-command-plan:plan-quality:${quality.qualityId}`,
        "verification-command-plan:quality-gate:stop-missing-verification",
        "plan-quality-gate:command:not-executed",
      ]),
    );
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
  const trace = buildCodeGraphTrace({
    graph,
    facts: normalizeCodeGraphFacts({
      graph,
      testImpactPlan: {
        impactPlanId: "test_impact_impact",
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
        noWriteEvidence: ["test-impact:commands:not-executed"],
        replaySafeSummary: "test-impact test_impact_impact",
        evidence: ["test-impact:id:test_impact_impact"],
      },
    }),
  });
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
