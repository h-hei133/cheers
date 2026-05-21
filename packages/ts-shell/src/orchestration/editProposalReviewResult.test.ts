import { describe, expect, it } from "vitest";
import { buildProviderEditProposalManifest } from "./providerEditProposal.js";
import { buildProviderEditProposalReview } from "./editProposalReview.js";
import { selectEditProposalHunks } from "./editProposalSelection.js";
import { buildEditProposalReviewResult } from "./editProposalReviewResult.js";

describe("editProposalReviewResult", () => {
  it("projects proposal review required as stopped no-write", () => {
    const review = buildProviderEditProposalReview(
      buildProviderEditProposalManifest({
        providerKindLabel: "fake-provider",
        targetLabels: ["src/app.ts"],
        proposedOperationKind: "generated-replacement",
        targetSummaries: ["summary"],
        exactReadiness: "review-only",
      }),
    );
    const result = buildEditProposalReviewResult({
      sessionId: "sess_proposal",
      prompt: "review proposal",
      review,
    });

    expect(result.terminalClassification).toBe("stopped");
    expect(result.codingResult?.changedFiles).toEqual([]);
    expect(result.codingResult?.continuation.evidence).toContain(
      review.transcriptSummary,
    );
    expect(result.codingResult?.evidence).toContain(
      "edit-proposal-result:no-write-or-stopped",
    );
  });

  it("projects rejected proposal as stopped no-write", () => {
    const review = buildProviderEditProposalReview(
      buildProviderEditProposalManifest({
        providerKindLabel: "fake-provider",
        targetLabels: ["src/app.ts"],
        proposedOperationKind: "exact-fenced-replacement",
        targetSummaries: ["summary"],
        exactReadiness: "exact-single-target",
      }),
    );
    const selection = selectEditProposalHunks({
      review,
      action: "reject-proposal",
    });
    const result = buildEditProposalReviewResult({
      sessionId: "sess_proposal",
      prompt: "reject proposal",
      review,
      selection,
    });

    expect(result.terminalClassification).toBe("stopped");
    expect(result.codingResult?.evidence).toContain(
      "edit-proposal-selection:rejected",
    );
    expect(result.codingResult?.changedFiles).toEqual([]);
  });

  it("projects confirmed apply success as completed without raw content", () => {
    const review = buildProviderEditProposalReview(
      buildProviderEditProposalManifest({
        providerKindLabel: "fake-provider",
        targetLabels: ["src/app.ts"],
        proposedOperationKind: "exact-fenced-replacement",
        targetSummaries: ["summary"],
        exactReadiness: "exact-single-target",
      }),
    );
    const selection = selectEditProposalHunks({
      review,
      action: "select-all-exact",
      explicitConfirmation: true,
    });
    const result = buildEditProposalReviewResult({
      sessionId: "sess_proposal",
      prompt: "apply proposal",
      review,
      selection,
      applyResult: {
        status: "single-target-applied",
        proposalId: review.proposalId,
        source: review.source,
        route: {
          source: "fenced-edit-replacement-route",
          status: "written",
          targetPath: "src/app.ts",
          plan: {
            ok: true,
            targetPath: "src/app.ts",
            rawPatchText: "*** Begin Patch\n*** End Patch\n",
            matchCount: 1,
            changedLines: 1,
            addedLines: 1,
            removedLines: 1,
            summary: "summary",
            evidence: ["fenced-edit-plan:exact-mapping-ready"],
          },
          workspaceRoute: {} as never,
          snapshotReceipt: {} as never,
          changedFiles: ["src/app.ts"],
          postWriteVerification: "passed",
          terminalClassification: "success",
          evidence: ["fenced-edit-route:exact-replacement-written"],
        },
        changedFiles: ["src/app.ts"],
        evidence: ["edit-proposal-apply:existing-fenced-route"],
        transcriptSummary:
          "edit-proposal-apply proposal=x; status=single-target-applied; targets=src/app.ts; changed=src/app.ts; raw-content-excluded",
      },
    });

    expect(result.terminalClassification).toBe("success");
    expect(result.codingResult?.changedFiles).toEqual(["src/app.ts"]);
    expect(result.codingResult?.evidence).toContain(
      "edit-proposal-result:confirmed-applied",
    );
    expect(JSON.stringify(result)).not.toContain("status: ready");
  });
});
