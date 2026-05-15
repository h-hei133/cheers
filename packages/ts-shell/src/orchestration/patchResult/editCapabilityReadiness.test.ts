import { describe, expect, it } from "vitest";
import {
  getEditCapabilityReadiness,
  listEditCapabilityReadiness,
} from "./editCapabilityReadiness.js";

describe("edit capability readiness model", () => {
  it("classifies current bounded edit surfaces without claiming recovery or rollback", () => {
    expect(getEditCapabilityReadiness("fenced-bounded-broad-patch-safe-subset")).toEqual(
      expect.objectContaining({
        status: "default-ready-candidate",
        evidence: expect.arrayContaining([
          "fenced patch extractor tests",
          "Route 72 compatibility gauntlet fenced fixtures",
        ]),
        nonClaims: expect.arrayContaining([
          "does not imply automatic recovery",
          "does not imply atomic rollback",
        ]),
      }),
    );

    expect(getEditCapabilityReadiness("recovery-authority-capture")).toEqual(
      expect.objectContaining({
        status: "explicit-opt-in-only",
      }),
    );
    expect(getEditCapabilityReadiness("restore-execute")).toEqual(
      expect.objectContaining({
        status: "explicit-opt-in-only",
      }),
    );
  });

  it("keeps unsupported broad, fuzzy, automatic recovery, and rollback surfaces blocked", () => {
    for (const id of [
      "arbitrary-broad-apply-patch",
      "fuzzy-patch",
      "automatic-recovery",
      "atomic-rollback",
    ] as const) {
      expect(getEditCapabilityReadiness(id)).toEqual(
        expect.objectContaining({
          status: "blocked-by-design",
          nonClaims: expect.arrayContaining(["no default readiness claim"]),
        }),
      );
    }
  });

  it("keeps one explicit readiness row per capability id", () => {
    const rows = listEditCapabilityReadiness();
    const ids = rows.map((row) => row.id);

    expect(new Set(ids).size).toBe(ids.length);
    expect(rows).toHaveLength(14);
  });
});
