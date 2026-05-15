import { describe, expect, it } from "vitest";
import {
  broadPatchUnsupportedEvidence,
  broadPatchUnsupportedReasonInfo,
} from "./broadPatchUnsupportedReason.js";

describe("broadPatchUnsupportedReasonInfo", () => {
  it("centralizes no-write reason metadata for unsupported broad patch shapes", () => {
    const info = broadPatchUnsupportedReasonInfo("unsupported-binary-patch");

    expect(info).toEqual(
      expect.objectContaining({
        reason: "unsupported-binary-patch",
        safeNoWrite: true,
        evidenceTag: "broad-patch-unsupported:binary-patch",
      }),
    );
    expect(info.doNext).toContain("binary-file capability");
    expect(broadPatchUnsupportedEvidence("too-many-operations")).toBe(
      "broad-patch-unsupported:too-many-operations",
    );
  });
});
