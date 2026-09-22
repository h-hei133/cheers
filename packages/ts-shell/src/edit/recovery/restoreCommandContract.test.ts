import { describe, expect, it } from "vitest";
import { validateRestoreCommandRequest } from "./restoreCommandContract.js";

describe("restore command contract", () => {
  it("validates preview mode with explicit all selection", () => {
    const result = validateRestoreCommandRequest({
      mode: "preview",
      ledgerRoot: "/tmp/ledger",
      workspaceRoot: "/tmp/workspace",
      authorityId: "route-66",
      recordSelection: { kind: "all" },
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.command.mode).toBe("preview");
      expect(result.command.previewOnly).toBe(true);
      expect(result.command.dryRun).toBe(true);
      expect(result.command.recordSelection).toBe("all");
      expect(result.command.automaticRecovery).toBe(false);
      expect(result.command.rollbackAtomicityClaim).toBe(false);
    }
  });

  it("rejects execute mode without explicit execute intent", () => {
    const result = validateRestoreCommandRequest({
      mode: "execute",
      ledgerRoot: "/tmp/ledger",
      workspaceRoot: "/tmp/workspace",
      authorityId: "route-66",
      recordSelection: { kind: "records", recordIds: ["record-1"] },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("explicit-execute-intent-required");
      expect(result.result.executed).toBe(false);
      expect(result.result.automaticRecovery).toBe(false);
      expect(result.result.rollbackAtomicityClaim).toBe(false);
    }
  });

  it("rejects missing roots and authority id", () => {
    const result = validateRestoreCommandRequest({
      mode: "preview",
      recordSelection: { kind: "all" },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toEqual([
        "ledger-root-required",
        "workspace-root-required",
        "authority-or-route-id-required",
      ]);
    }
  });

  it("sanitizes record ids and rejects unsafe values", () => {
    const result = validateRestoreCommandRequest({
      mode: "preview",
      ledgerRoot: "/tmp/ledger",
      workspaceRoot: "/tmp/workspace",
      authorityId: "route-66",
      recordSelection: { kind: "records", recordIds: ["ok", "../bad"] },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toContain("invalid-record-selection");
    }
  });
});
