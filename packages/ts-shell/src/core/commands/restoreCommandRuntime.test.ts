import { describe, expect, it } from "vitest";
import {
  formatRestoreCommandResult,
  parseRestoreCommandArgs,
} from "./restoreCommandRuntime.js";

describe("restore command runtime", () => {
  it("parses preview as the default restore action", () => {
    const request = parseRestoreCommandArgs(
      [
        "--ledger-root",
        "/tmp/ledger",
        "--authority-id",
        "route-66",
        "--records",
        "a,b",
      ],
      { cwd: "/workspace" },
    );

    expect(request).toMatchObject({
      mode: "preview",
      ledgerRoot: "/tmp/ledger",
      workspaceRoot: "/workspace",
      authorityId: "route-66",
      requireExplicitExecute: false,
      dryRun: true,
    });
    expect(request.recordSelection).toEqual({
      kind: "records",
      recordIds: ["a", "b"],
    });
  });

  it("requires an explicit execute flag for execute mode", () => {
    const request = parseRestoreCommandArgs(
      [
        "execute",
        "--ledger-root",
        "/tmp/ledger",
        "--authority-id",
        "route-66",
        "--all",
        "--execute",
      ],
      { cwd: "/workspace" },
    );

    expect(request.mode).toBe("execute");
    expect(request.requireExplicitExecute).toBe(true);
    expect(request.recordSelection).toEqual({ kind: "all" });
  });

  it("formats restore output without raw file contents", () => {
    const output = formatRestoreCommandResult({
      mode: "execute",
      executed: true,
      restorableFiles: [],
      restoredFiles: ["src/a.ts"],
      blockedFiles: [],
      inspectedFiles: ["src/a.ts"],
      missingRecords: [],
      automaticRecovery: false,
      rollbackAtomicityClaim: false,
      evidence: ["restore-command-runner:no-automatic-recovery"],
    });

    expect(output).toContain("- Restored files: src/a.ts");
    expect(output).toContain("- Automatic recovery: no");
    expect(output).toContain("- Atomic rollback: no");
    expect(output).not.toContain("secret original content");
  });
});
