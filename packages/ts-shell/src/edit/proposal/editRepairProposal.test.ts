import { describe, expect, it } from "vitest";
import { buildEditRepairContext } from "./editRepairContext.js";
import {
  buildEditRepairProposalManifest,
  normalizeEditRepairProposal,
} from "./editRepairProposal.js";

describe("editRepairProposal", () => {
  it("normalizes exact repair hunks into a no-write manifest and separate handoff mappings", () => {
    const context = contextFixture();
    const normalized = normalizeEditRepairProposal({
      context,
      rawProposal: {
        hunks: [
          {
            hunkId: "repair-h1",
            targetPath: "src/app.ts",
            summary: "fix assertion",
            oldText: "expect(value).toBe(false)",
            newText: "expect(value).toBe(true)",
          },
        ],
        riskSummary: "low risk; no token=secret",
      },
    });

    expect(normalized.ok).toBe(true);
    if (!normalized.ok) {
      return;
    }
    expect(normalized.manifest.mutationAuthority).toBe("not-granted");
    expect(normalized.manifest.reviewRequired).toBe(true);
    expect(normalized.manifest.handoffReadiness).toBe("exact-single-target");
    expect(normalized.mappingByHunkId.get("repair-h1")?.oldText).toBe(
      "expect(value).toBe(false)",
    );
    expect(JSON.stringify(normalized.manifest)).not.toContain(
      "expect(value).toBe(false)",
    );
    expect(JSON.stringify(normalized.manifest)).not.toContain("secret");
  });

  it("stops invalid repair proposals no-write", () => {
    const normalized = normalizeEditRepairProposal({
      context: contextFixture(),
      rawProposal: {
        hunks: [{ hunkId: "h1", targetPath: "src/other.ts", oldText: "a", newText: "b" }],
      },
    });

    expect(normalized.ok).toBe(false);
    if (normalized.ok) {
      return;
    }
    expect(normalized.reasonCode).toBe("target-outside-context");
    expect(normalized.evidence).toContain("edit-repair-proposal:mutation:not-run");
  });

  it("builds review-only manifests without raw content", () => {
    const manifest = buildEditRepairProposalManifest({
      context: contextFixture(),
      exactMappingReadiness: "review-only",
      proposedHunks: [
        {
          hunkId: "h1",
          targetLabel: "src/app.ts",
          operationSummary: "describe repair",
          exactMappingReady: false,
          unsupportedReason: "missing exact mapping",
          redactionStatus: "raw-content-excluded",
        },
      ],
    });

    expect(manifest.handoffReadiness).toBe("review-only");
    expect(manifest.evidence).toContain("edit-repair-proposal:review-required");
    expect(manifest.transcriptSummary).toContain("mutation:not-run");
  });
});

function contextFixture() {
  return buildEditRepairContext({
    verification: { status: "failed", reason: "verification failed" },
    failedFiles: [{ path: "src/app.ts" }],
    changedFiles: ["src/app.ts"],
  });
}
