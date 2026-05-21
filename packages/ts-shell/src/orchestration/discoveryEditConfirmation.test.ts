import { describe, expect, it } from "vitest";
import { buildDiscoveryEditManifest } from "./discoveryEditManifest.js";
import { decideDiscoveryEditConfirmation } from "./discoveryEditConfirmation.js";

describe("discoveryEditConfirmation", () => {
  const manifest = buildDiscoveryEditManifest({
    maxCandidates: 5,
    requiredConfirmationStatus: "required-target-selection",
    candidates: [
      { path: "src/app.ts", matchCount: 1 },
      { path: "src/other.ts", matchCount: 1 },
    ],
  });

  it("requires explicit single-target confirmation before handoff", () => {
    const decision = decideDiscoveryEditConfirmation({ manifest });

    expect(decision).toMatchObject({
      state: "required-target-selection",
      canHandoffToExactFencedReplacement: false,
    });
    expect(decision.evidence).toEqual(
      expect.arrayContaining([
        "discovery-edit-confirmation:target-selection-required",
        "discovery-edit-confirmation:mutation:not-run",
      ]),
    );
  });

  it("allows handoff only for one confirmed manifest candidate with exact mapping", () => {
    const decision = decideDiscoveryEditConfirmation({
      manifest,
      confirmationTargetPath: "src/app.ts",
      mapping: {
        oldText: "status: draft",
        newText: "status: ready",
        source: "old-new-fenced-blocks",
      },
    });

    expect(decision).toMatchObject({
      state: "confirmed-single-target",
      canHandoffToExactFencedReplacement: true,
      targetPath: "src/app.ts",
    });
    expect(decision.evidence).toEqual(
      expect.arrayContaining([
        "discovery-edit-confirmation:confirmed-single-target",
        "discovery-edit-confirmation:handoff-ready:exact-fenced-replacement",
      ]),
    );
  });

  it("allows multi-target confirmation to hand off to the bounded target-set route", () => {
    const decision = decideDiscoveryEditConfirmation({
      manifest,
      confirmedTargetSet: ["src/app.ts", "src/other.ts"],
    });

    expect(decision).toMatchObject({
      state: "confirmed-target-set",
      canHandoffToExactFencedReplacement: false,
      canHandoffToTargetSetEdit: true,
    });
    expect(decision.evidence).toContain(
      "discovery-edit-confirmation:handoff-ready:target-set-edit",
    );
  });
});
