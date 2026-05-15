import { describe, expect, it } from "vitest";
import { EDIT_CAPABILITY_CLOSEOUT_MANIFEST } from "./editCapabilityCloseoutManifest.js";
import { getEditCapabilityReadiness } from "./editCapabilityReadiness.js";

describe("edit capability closeout manifest", () => {
  it("aligns every manifest entry with readiness status and evidence", () => {
    expect(EDIT_CAPABILITY_CLOSEOUT_MANIFEST).toEqual(
      expect.objectContaining({
        route: "73",
        status: "closeout-candidate",
        defaultPersistence: "absent",
        automaticRecovery: false,
        atomicRollback: false,
        arbitraryBroadApplyPatch: "blocked-by-design",
      }),
    );

    for (const entry of EDIT_CAPABILITY_CLOSEOUT_MANIFEST.entries) {
      const readiness = getEditCapabilityReadiness(entry.id);
      expect(entry.status, entry.id).toBe(readiness.status);
      expect(entry.evidence, entry.id).toEqual(readiness.evidence);
      expect(entry.riskNotes.length, entry.id).toBeGreaterThan(0);
    }
  });

  it("keeps recovery and restore entries non-default or explicit", () => {
    for (const id of [
      "recovery-authority-capture",
      "restore-preview",
      "restore-execute",
      "local-restore-command",
    ] as const) {
      const entry = EDIT_CAPABILITY_CLOSEOUT_MANIFEST.entries.find(
        (item) => item.id === id,
      );
      expect(entry).toEqual(
        expect.objectContaining({
          recoveryRestoreDependency: expect.any(String),
        }),
      );
      expect(entry?.status).not.toBe("default-ready-candidate");
    }
  });

  it("keeps blocked features blocked with explicit reasons", () => {
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
      const entry = EDIT_CAPABILITY_CLOSEOUT_MANIFEST.entries.find(
        (item) => item.id === id,
      );
      expect(entry).toEqual(
        expect.objectContaining({
          status: "blocked-by-design",
          blockedReason: expect.any(String),
        }),
      );
    }
  });
});
