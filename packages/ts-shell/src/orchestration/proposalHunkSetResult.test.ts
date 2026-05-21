import { describe, expect, it } from "vitest";
import { buildProposalHunkSetRouteResult } from "./proposalHunkSetResult.js";
import type { ProposalHunkSetRoute } from "./proposalHunkSetRoute.js";

describe("proposalHunkSetResult", () => {
  it("projects hunk-set apply summaries without raw old/new content", () => {
    const route = routeFixture();
    const result = buildProposalHunkSetRouteResult({
      sessionId: "session-hunk-set",
      prompt: "apply confirmed proposal hunk set",
      route,
    });

    expect(result.status).toBe("completed");
    expect(result.terminalClassification).toBe("success");
    expect(result.codingResult?.changedFiles).toEqual(["src/a.ts"]);
    expect(result.codingResult?.continuation.evidence).toEqual(
      expect.arrayContaining([
        "proposal-hunk-set-apply proposal=provider-edit-test; hunkSet=proposal-hunk-set-test; status=written; targets=src/a.ts; hunks=h1; changed=src/a.ts; failed=none; unattempted=none; verification=passed; recovery=not-needed; raw-content-excluded",
        "proposal-hunk-set-result:raw-content-excluded",
      ]),
    );
    expect(JSON.stringify(result)).not.toContain("status: draft");
    expect(JSON.stringify(result)).not.toContain("status: ready");
  });
});

function routeFixture(): ProposalHunkSetRoute {
  return {
    source: "proposal-hunk-set-route",
    status: "written",
    proposalId: "provider-edit-test",
    hunkSetId: "proposal-hunk-set-test",
    transactionId: "target-set-txn-test",
    manifest: {
      hunkSetId: "proposal-hunk-set-test",
      sourceProposalId: "provider-edit-test",
      source: "provider",
      selectedTargetPaths: ["src/a.ts"],
      selectedHunks: [
        {
          hunkId: "h1",
          targetLabel: "src/a.ts",
          targetPath: "src/a.ts",
          operationSummary: "safe exact replacement",
          exactMappingStatus: "exact",
          targetBinding: "single-target",
          redactionStatus: "raw-content-excluded",
        },
      ],
      mutationAuthority: "not-granted",
      redactionStatus: "raw-content-excluded",
      evidence: ["proposal-hunk-set:raw-content-excluded"],
      transcriptSummary:
        "proposal-hunk-set proposal=provider-edit-test; hunkSet=proposal-hunk-set-test; source=provider; targets=src/a.ts; hunks=h1; mutationAuthority:not-granted; raw-content-excluded",
    },
    plan: {
      status: "ready",
      hunkSetId: "proposal-hunk-set-test",
      sourceProposalId: "provider-edit-test",
      targetCount: 1,
      hunkCount: 1,
      maxFiles: 3,
      maxHunks: 5,
      maxHunksPerFile: 1,
      targets: [],
      evidence: ["proposal-hunk-set-plan:ready"],
      nextAction: "Apply exact hunk.",
    },
    targetCount: 1,
    hunkCount: 1,
    changedFiles: ["src/a.ts"],
    failedFiles: [],
    unattemptedFiles: [],
    fileResults: [],
    journal: [],
    transaction: {
      transactionId: "target-set-txn-test",
      manifestId: "proposal-hunk-set-test",
      confirmedTargetSet: ["src/a.ts"],
      maxFileGuardStatus: "within-limit",
      preflightStatus: "passed",
      executionStatus: "succeeded",
      verificationStatus: "passed",
      recoveryStatus: "not-needed",
      redactionStatus: "raw-content-excluded",
      outcome: "succeeded",
      journal: [],
      evidence: ["target-set-edit-transaction:raw-content-excluded"],
    },
    verificationAggregate: {
      overallStatus: "passed",
      hardFailure: false,
      warning: false,
      passedFiles: ["src/a.ts"],
      failedFiles: [],
      skippedFiles: [],
      perFile: [],
      evidence: ["target-set-edit-verification:overall:passed"],
    },
    recoveryWorkflow: {
      status: "not-needed",
      eligibleRollbackTargets: [],
      ineligibleRollbackTargets: [],
      requiredConfirmation: "explicit-rollback-apply",
      safeSnapshotIds: [],
      recommendation: "No recovery needed after target-set success.",
      doNext: "Review the changed files if desired.",
      automaticRollback: false,
      atomicRollback: false,
      evidence: ["target-set-edit-recovery-workflow:status:not-needed"],
    },
    terminalClassification: "success",
    postWriteVerification: "passed",
    nextAction: "Proposal hunk-set exact replacements completed through existing fenced lanes.",
    evidence: ["proposal-hunk-set-route:raw-content-excluded"],
    transcriptSummary:
      "proposal-hunk-set-apply proposal=provider-edit-test; hunkSet=proposal-hunk-set-test; status=written; targets=src/a.ts; hunks=h1; changed=src/a.ts; failed=none; unattempted=none; verification=passed; recovery=not-needed; raw-content-excluded",
  };
}
