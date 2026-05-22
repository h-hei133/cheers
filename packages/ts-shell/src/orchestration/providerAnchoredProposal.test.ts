import { describe, expect, it } from "vitest";
import { classifyProviderAnchorQuality } from "./providerAnchorQuality.js";
import {
  buildAnchoredProposalMappingByHunkId,
  buildAnchoredProviderProposalReview,
  buildProviderAnchoredProposal,
} from "./providerAnchoredProposal.js";
import { detectProviderAnchorConflicts } from "./providerAnchorConflict.js";
import { matchProviderAnchorCandidates } from "./providerAnchorMatcher.js";
import { extractProviderProposalAnchors } from "./providerProposalAnchors.js";
import { validateProviderOutput } from "./providerOutputValidator.js";

describe("providerAnchoredProposal", () => {
  it("builds exact anchored proposal manifest and review/apply bridge inputs", () => {
    const rawOutput = {
      operationKind: "exact-fenced-replacement" as const,
      targets: [{ path: "src/app.ts", oldText: "runApp", newText: "startApp" }],
    };
    const validation = validateProviderOutput({
      requestId: "anchored",
      rawOutput,
      explicitTargetLabels: ["src/app.ts"],
    });
    const extraction = extractProviderProposalAnchors({
      requestId: "anchored",
      rawOutput,
      validation,
      sourceProposalId: "provider-edit-anchored",
      sourceDryRunId: "dry-run-anchored",
    });
    const matchResult = matchProviderAnchorCandidates({
      requestId: "anchored",
      candidates: extraction.candidates,
      explicitTargetLabels: ["src/app.ts"],
      currentContentByTargetLabel: new Map([["src/app.ts", "runApp\n"]]),
    });
    const conflict = detectProviderAnchorConflicts({
      requestId: "anchored",
      matchResult,
      currentContentByTargetLabel: new Map([["src/app.ts", "runApp\n"]]),
    });
    const anchorQuality = classifyProviderAnchorQuality({
      requestId: "anchored",
      validation,
      extraction,
      matchResult,
      conflict,
    });
    const manifest = buildProviderAnchoredProposal({
      requestId: "anchored",
      extraction,
      matchResult,
      conflict,
      anchorQuality,
      planQualityId: "plan-quality-194",
    });
    const review = buildAnchoredProviderProposalReview(manifest);
    const mappings = buildAnchoredProposalMappingByHunkId({ manifest, matchResult });

    expect(manifest.handoffReadiness).toBe("exact-single-target");
    expect(manifest.reviewRequirement).toBe("explicit-review-and-confirmation");
    expect(manifest.planQualityId).toBe("plan-quality-194");
    expect(manifest.mutationAuthority).toBe("not-granted");
    expect(review.reviewStatus).toBe("ready-for-selection");
    expect(mappings.get(manifest.exactHunkIds[0]!)?.oldText).toBe("runApp");
  });

  it("keeps partial anchored proposal review-only", () => {
    const rawOutput = {
      operationKind: "generated-replacement" as const,
      targets: [{ path: "src/app.ts", summary: "rename runApp" }],
    };
    const validation = validateProviderOutput({
      requestId: "anchored-partial",
      rawOutput,
      explicitTargetLabels: ["src/app.ts"],
    });
    const extraction = extractProviderProposalAnchors({
      requestId: "anchored-partial",
      rawOutput,
      validation,
    });
    const matchResult = matchProviderAnchorCandidates({
      requestId: "anchored-partial",
      candidates: extraction.candidates,
      explicitTargetLabels: ["src/app.ts"],
    });
    const conflict = detectProviderAnchorConflicts({ requestId: "anchored-partial", matchResult });
    const anchorQuality = classifyProviderAnchorQuality({
      requestId: "anchored-partial",
      validation,
      extraction,
      matchResult,
      conflict,
    });
    const manifest = buildProviderAnchoredProposal({
      requestId: "anchored-partial",
      extraction,
      matchResult,
      conflict,
      anchorQuality,
    });

    expect(manifest.handoffReadiness).toBe("review-only");
    expect(manifest.reviewRequirement).toBe("review-only");
    expect(buildAnchoredProviderProposalReview(manifest).reviewStatus).toBe("review-required");
  });
});
