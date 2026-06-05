import { describe, expect, it } from "vitest";

import { correctArtifact, createArtifactReceipt } from "./model.js";

describe("artifact workflow model", () => {
  it("records report artifact intent, sources, validation, and non-success truth", () => {
    const receipt = createArtifactReceipt({
      taskKind: "docs-report",
      outputKind: "artifact",
      requiredPaths: ["reports/summary.md"],
      workspacePaths: ["notes/source-a.md", "notes/source-b.md", "reports/summary.md"],
      verificationState: "selected-passed",
      failureCategories: [],
      requiredContentMarkers: ["source-a", "source-b", "verification-evidence"],
      observedContentMarkers: ["source-a", "source-b", "verification-evidence"],
      verificationEvidence: ["artifact-check:source-coverage:passed"],
      claimEvidence: [
        { claim: "source-a covered", evidenceId: "source-a" },
        { claim: "verification passed", evidenceId: "artifact-check:source-coverage:passed" },
      ],
    });

    expect(receipt).toMatchObject({
      intent: "produce report artifact",
      kind: "report",
      outputPath: "reports/summary.md",
      validationState: "validation-passed",
      terminalSuccessClaim: false,
    });
    expect(receipt?.sourceReceipts).toHaveLength(2);
    expect(receipt?.requiredContentMarkers).toEqual([
      "source-a",
      "source-b",
      "verification-evidence",
    ]);
    expect(receipt?.verificationEvidenceReceipts).toEqual([
      "artifact-check:source-coverage:passed",
    ]);
    expect(receipt?.claimEvidenceReceipts.every((item) => item.proven)).toBe(true);
    expect(receipt?.blockers).toEqual([]);
  });

  it("blocks missing source, unsafe paths, invalid artifacts, and failed validation", () => {
    expect(createArtifactReceipt({
      taskKind: "docs-report",
      outputKind: "artifact",
      requiredPaths: [],
      workspacePaths: ["notes/source.md"],
      verificationState: "selected-passed",
      failureCategories: [],
    })).toMatchObject({
      validationState: "output-missing",
      blockers: ["artifact output path missing"],
      terminalSuccessClaim: false,
    });

    expect(createArtifactReceipt({
      taskKind: "docs-report",
      outputKind: "artifact",
      requiredPaths: ["reports/summary.md"],
      workspacePaths: ["reports/summary.md"],
      verificationState: "selected-passed",
      failureCategories: [],
    })?.validationState).toBe("source-missing");

    expect(createArtifactReceipt({
      taskKind: "docs-report",
      outputKind: "artifact",
      requiredPaths: ["../summary.md"],
      workspacePaths: ["notes/source.md", "../summary.md"],
      verificationState: "selected-passed",
      failureCategories: [],
    })?.validationState).toBe("unsafe-path");

    expect(createArtifactReceipt({
      taskKind: "data-artifact",
      outputKind: "artifact",
      requiredPaths: ["artifacts/totals.json"],
      workspacePaths: ["data/input.csv", "artifacts/totals.json"],
      verificationState: "selected-failed",
      failureCategories: ["artifact invalid"],
    })?.validationState).toBe("validation-failed");

    expect(createArtifactReceipt({
      taskKind: "docs-report",
      outputKind: "artifact",
      requiredPaths: ["reports/summary.md"],
      workspacePaths: ["notes/source.md", "reports/summary.md"],
      verificationState: "selected-not-run",
      failureCategories: [],
    })?.validationState).toBe("not-proven");

    expect(createArtifactReceipt({
      taskKind: "docs-report",
      outputKind: "artifact",
      requiredPaths: ["reports/summary.md"],
      workspacePaths: ["notes/source.md", "reports/summary.md"],
      verificationState: "selected-passed",
      failureCategories: [],
      requiredContentMarkers: ["source-receipt", "verification-evidence"],
      observedContentMarkers: ["source-receipt"],
      verificationEvidence: ["artifact-check:source-coverage:failed"],
    })?.validationState).toBe("invalid");

    expect(createArtifactReceipt({
      taskKind: "docs-report",
      outputKind: "artifact",
      requiredPaths: ["reports/summary.md"],
      workspacePaths: ["notes/source.md", "reports/summary.md"],
      verificationState: "selected-passed",
      failureCategories: [],
      requiredContentMarkers: ["source-receipt"],
      observedContentMarkers: ["source-receipt"],
      verificationEvidence: [],
    })?.validationState).toBe("not-proven");

    expect(createArtifactReceipt({
      taskKind: "docs-report",
      outputKind: "artifact",
      requiredPaths: ["reports/summary.md"],
      workspacePaths: ["notes/source.md", "reports/summary.md"],
      verificationState: "selected-passed",
      failureCategories: [],
      requiredContentMarkers: ["source-receipt"],
      observedContentMarkers: ["source-receipt"],
      verificationEvidence: ["artifact-check:source-coverage:passed"],
      claimEvidence: [{ claim: "verification passed" }],
    })).toMatchObject({
      validationState: "claim-evidence-missing",
      blockers: ["artifact claim evidence missing"],
    });

    const duplicateClaimEvidence = createArtifactReceipt({
      taskKind: "docs-report",
      outputKind: "artifact",
      requiredPaths: ["reports/summary.md"],
      workspacePaths: ["notes/source.md", "reports/summary.md"],
      verificationState: "selected-passed",
      failureCategories: [],
      requiredContentMarkers: ["source-receipt"],
      observedContentMarkers: ["source-receipt"],
      verificationEvidence: ["artifact-check:source-coverage:passed"],
      claimEvidence: [
        { claim: "source covered", evidenceId: "same-receipt" },
        { claim: "verification passed", evidenceId: "same-receipt" },
      ],
    });
    expect(duplicateClaimEvidence).toMatchObject({
      validationState: "claim-evidence-missing",
      blockers: ["artifact claim evidence missing"],
    });
    expect(duplicateClaimEvidence?.claimEvidenceReceipts).toEqual([
      { claim: "source covered", evidenceId: "same-receipt", proven: true },
      { claim: "verification passed", evidenceId: "same-receipt", proven: false },
    ]);

    const mismatchedClaimEvidence = createArtifactReceipt({
      taskKind: "docs-report",
      outputKind: "artifact",
      requiredPaths: ["reports/summary.md"],
      workspacePaths: ["notes/source.md", "reports/summary.md"],
      verificationState: "selected-passed",
      failureCategories: [],
      requiredContentMarkers: ["source-receipt", "verification-evidence"],
      observedContentMarkers: ["source-receipt", "verification-evidence"],
      verificationEvidence: ["artifact-check:source-coverage:passed"],
      claimEvidence: [
        { claim: "source covered", evidenceId: "artifact-check:source-coverage:passed" },
        { claim: "verification passed", evidenceId: "source-receipt" },
      ],
    });
    expect(mismatchedClaimEvidence).toMatchObject({
      validationState: "claim-evidence-missing",
      blockers: ["artifact claim evidence missing"],
    });
    expect(mismatchedClaimEvidence?.claimEvidenceReceipts).toEqual([
      { claim: "source covered", evidenceId: "artifact-check:source-coverage:passed", proven: true },
      { claim: "verification passed", evidenceId: "source-receipt", proven: false },
    ]);
  });

  it("corrects invalid artifacts only when source receipts and artifact action are available", () => {
    const receipt = createArtifactReceipt({
      taskKind: "data-artifact",
      outputKind: "artifact",
      requiredPaths: ["artifacts/totals.json"],
      workspacePaths: ["data/input.csv", "artifacts/totals.json"],
      verificationState: "selected-failed",
      failureCategories: ["artifact invalid"],
      requiredContentMarkers: ["total"],
      observedContentMarkers: ["total"],
      verificationEvidence: ["artifact-check:json-parse:failed"],
    });

    expect(correctArtifact({ receipt, actions: ["artifact", "verify"] })).toMatchObject({
      attempted: true,
      validationState: "validation-passed",
      correctedPath: "artifacts/totals.json",
      terminalSuccessClaim: false,
    });
    expect(correctArtifact({ receipt, actions: ["read"] })?.attempted).toBe(false);

    const missingClaimEvidence = createArtifactReceipt({
      taskKind: "docs-report",
      outputKind: "artifact",
      requiredPaths: ["reports/summary.md"],
      workspacePaths: ["notes/source.md", "reports/summary.md"],
      verificationState: "selected-passed",
      failureCategories: [],
      verificationEvidence: ["artifact-check:source-coverage:passed"],
      claimEvidence: [{ claim: "verification passed" }],
    });

    expect(correctArtifact({ receipt: missingClaimEvidence, actions: ["artifact"] })).toMatchObject({
      attempted: false,
      validationState: "claim-evidence-missing",
      blockers: ["artifact claim evidence missing"],
      terminalSuccessClaim: false,
    });
  });
});
