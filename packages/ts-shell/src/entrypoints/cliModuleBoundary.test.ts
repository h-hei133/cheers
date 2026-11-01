import { describe, expect, it } from "vitest";
import {
  hasBlockedRootBindingDiagnostic,
  resolveSessionSwitchDiagnostics,
} from "./cliSessionModule.js";
import {
  isWorkspaceInfoPromptStrict,
  normalizePathForCompare,
} from "./cliWorkspaceModule.js";

describe("CLI module facades", () => {
  it("keeps session switch diagnostics scoped to root-binding mismatch", () => {
    expect(
      resolveSessionSwitchDiagnostics(
        { projectRoot: "/repo", requestedWorkspaceRoot: "/repo" },
        { id: "sess_same", projectRoot: "/repo" },
      ),
    ).toEqual([]);

    const diagnostics = resolveSessionSwitchDiagnostics(
      { projectRoot: "/repo", requestedWorkspaceRoot: "/requested" },
      { id: "sess_other", projectRoot: "/other" },
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      severity: "blocked",
      code: "root-binding-session-mismatch",
    });
    expect(diagnostics[0]?.explanation).toContain("Session sess_other");
    expect(hasBlockedRootBindingDiagnostic(diagnostics)).toBe(true);
  });

  it("keeps workspace prompt classification read-only and question-shaped", () => {
    expect(isWorkspaceInfoPromptStrict("where am I?")).toBe(true);
    expect(isWorkspaceInfoPromptStrict("当前工作目录在哪里？")).toBe(true);
    expect(isWorkspaceInfoPromptStrict("write a file in current directory")).toBe(
      false,
    );
    expect(isWorkspaceInfoPromptStrict("current directory")).toBe(false);
    expect(normalizePathForCompare("/Repo/./src") === normalizePathForCompare("/repo/src")).toBe(process.platform === 'win32');
    expect(normalizePathForCompare('/Repo/./src')).toBe(normalizePathForCompare('/Repo/src'));
  });
});
