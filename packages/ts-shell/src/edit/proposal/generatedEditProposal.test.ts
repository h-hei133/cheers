import { describe, expect, it } from "vitest";
import { buildGeneratedEditProposalManifest } from "./generatedEditProposal.js";

describe("generatedEditProposal", () => {
  it("builds a no-write manifest without raw content authority", () => {
    const manifest = buildGeneratedEditProposalManifest({
      targets: ["src/app.ts"],
      requestedOperationKind: "generated-replacement",
      proposedContentStatus: "safe-summary-only",
      exactMappingStatus: "not-exact",
    });

    expect(manifest.requestedMode).toBe("generated-edit");
    expect(manifest.targetScope).toBe("explicit-target");
    expect(manifest.mutationAuthority).toBe("not-granted");
    expect(manifest.mutationReadiness).toBe("review-required-no-write");
    expect(manifest.snapshotRequirement).toBe("required-before-write");
    expect(manifest.verificationRequirement).toBe("required-before-write");
    expect(manifest.redactionStatus).toBe("raw-content-excluded");
    expect(manifest.transcriptSummary).toContain("mutation:not-run");
    expect(manifest.transcriptSummary).toContain("raw-content-excluded");
    expect(manifest.safeSummary).not.toContain("old secret");
    expect(manifest.evidence).toContain(
      "generated-edit-proposal:mutation-authority:not-granted",
    );
  });
});
