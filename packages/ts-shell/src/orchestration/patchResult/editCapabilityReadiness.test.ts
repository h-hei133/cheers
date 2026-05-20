import { describe, expect, it } from "vitest";
import {
  getEditCapabilityReadiness,
  listEditCapabilityReadiness,
} from "./editCapabilityReadiness.js";

describe("edit capability readiness model", () => {
  it("classifies current bounded edit surfaces as default-ready candidates without recovery or rollback claims", () => {
    for (const id of [
      "single-update-create-delete-move",
      "bounded-update-only-2-32",
      "bounded-mixed-2-32",
      "bounded-delete-only-2-32",
      "bounded-move-only-2-32",
      "bounded-marker-apply-patch-candidates",
      "bounded-broad-patch-safe-subset",
      "fenced-bounded-broad-patch-safe-subset",
      "exact-fenced-replacement",
      "rename-with-content-decomposition",
      "unsupported-broad-shape-taxonomy",
    ] as const) {
      const readiness = getEditCapabilityReadiness(id);
      expect(readiness).toEqual(
        expect.objectContaining({
          status: "default-ready-candidate",
          nonClaims: expect.arrayContaining([
            "does not imply automatic recovery",
            "does not imply atomic rollback",
          ]),
        }),
      );
      expect(readiness.evidence.length).toBeGreaterThan(0);
    }

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
    expect(getEditCapabilityReadiness("local-restore-command")).toEqual(
      expect.objectContaining({
        status: "explicit-opt-in-only",
      }),
    );
    expect(getEditCapabilityReadiness("restore-preview")).toEqual(
      expect.objectContaining({
        status: "non-default-ready-candidate",
      }),
    );
  });

  it("keeps unsupported broad, unsafe metadata, automatic recovery, rollback, and default persistence blocked", () => {
    for (const id of [
      "arbitrary-broad-apply-patch",
      "fuzzy-patch",
      "binary-mode-symlink-submodule-copy",
      "directory-operations",
      "overwrite",
      "automatic-recovery",
      "atomic-rollback",
      "default-durable-persistence",
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
    expect(rows).toHaveLength(23);
  });
});
