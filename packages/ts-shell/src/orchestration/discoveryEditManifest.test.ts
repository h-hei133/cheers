import { describe, expect, it } from "vitest";
import { buildDiscoveryEditManifest } from "./discoveryEditManifest.js";

describe("discoveryEditManifest", () => {
  it("projects bounded no-write candidates without raw content", () => {
    const manifest = buildDiscoveryEditManifest({
      workspaceRoot: "/workspace/project",
      maxCandidates: 5,
      requiredConfirmationStatus: "required-target-selection",
      candidates: [
        { path: "src/app.ts", matchCount: 1 },
        { path: "src/other.ts", matchCount: 1 },
      ],
    });

    expect(manifest).toMatchObject({
      requestedMode: "discovery-edit",
      requestedOperationKind: "exact-fenced-replacement",
      mutationAuthority: "not-granted",
      snapshotRequirement: "required-before-write",
      verificationRequirement: "required-before-write",
      redactionStatus: "raw-content-excluded",
      ambiguityStatus: "multiple-candidates",
      maxCandidateGuardStatus: "within-limit",
      requiredConfirmationStatus: "required-target-selection",
    });
    expect(manifest.candidates.map((candidate) => candidate.pathLabel)).toEqual([
      "src/app.ts",
      "src/other.ts",
    ]);
    expect(manifest.evidence).toEqual(
      expect.arrayContaining([
        "discovery-edit-manifest:mutation-authority:not-granted",
        "discovery-edit-manifest:raw-content-excluded",
      ]),
    );
    expect(JSON.stringify(manifest)).not.toContain("status: draft");
  });

  it("caps over-limit candidates and records the guard status", () => {
    const manifest = buildDiscoveryEditManifest({
      maxCandidates: 2,
      requiredConfirmationStatus: "required-target-selection",
      candidates: [
        { path: "a.ts", matchCount: 1 },
        { path: "b.ts", matchCount: 1 },
        { path: "c.ts", matchCount: 1 },
      ],
    });

    expect(manifest.candidates.map((candidate) => candidate.path)).toEqual([
      "a.ts",
      "b.ts",
    ]);
    expect(manifest.ambiguityStatus).toBe("too-many-candidates");
    expect(manifest.maxCandidateGuardStatus).toBe("over-limit");
  });
});
