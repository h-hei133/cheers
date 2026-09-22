import { describe, expect, it } from "vitest";
import {
  buildProviderEditProposalManifest,
  normalizeProviderEditProposal,
} from "./providerEditProposal.js";

describe("providerEditProposal", () => {
  it("builds a no-write provider proposal manifest", () => {
    const manifest = buildProviderEditProposalManifest({
      providerKindLabel: "fake-provider",
      targetLabels: ["src/app.ts"],
      proposedOperationKind: "generated-replacement",
      targetSummaries: ["replace the selected function"],
      exactReadiness: "review-only",
      riskSummary: "low risk",
      verificationPlan: ["run focused test"],
    });

    expect(manifest.mutationAuthority).toBe("not-granted");
    expect(manifest.reviewRequired).toBe(true);
    expect(manifest.handoffReadiness).toBe("review-only");
    expect(manifest.redactionStatus).toBe("raw-content-excluded");
    expect(manifest.transcriptSummary).toContain("mutation:not-run");
    expect(manifest.evidence).toContain(
      "provider-edit-proposal:mutation-authority:not-granted",
    );
  });

  it("normalizes exact provider output into single-target readiness", () => {
    const normalized = normalizeProviderEditProposal({
      providerKindLabel: "fake-provider",
      explicitTargetLabels: ["src/app.ts"],
      rawProposal: {
        operationKind: "exact-fenced-replacement",
        targets: [
          {
            path: "src/app.ts",
            summary: "replace exact block",
            oldText: "old",
            newText: "new",
          },
        ],
      },
    });

    expect(normalized.ok).toBe(true);
    if (normalized.ok) {
      expect(normalized.manifest.handoffReadiness).toBe("exact-single-target");
      expect(normalized.manifest.targets[0]?.proposedSummary).toBe(
        "replace exact block",
      );
    }
  });

  it("rejects unsupported broad/fuzzy or non-explicit targets", () => {
    expect(
      normalizeProviderEditProposal({
        providerKindLabel: "fake-provider",
        explicitTargetLabels: ["src/app.ts"],
        rawProposal: {
          operationKind: "fuzzy-replacement",
          targets: [{ path: "src/app.ts" }],
        },
      }).ok,
    ).toBe(false);

    const outside = normalizeProviderEditProposal({
      providerKindLabel: "fake-provider",
      explicitTargetLabels: ["src/app.ts"],
      rawProposal: {
        operationKind: "exact-fenced-replacement",
        targets: [{ path: "src/other.ts", oldText: "old", newText: "new" }],
      },
    });
    expect(outside.ok).toBe(false);
    if (!outside.ok) {
      expect(outside.reasonCode).toBe("ambiguous-target");
    }
  });
});
