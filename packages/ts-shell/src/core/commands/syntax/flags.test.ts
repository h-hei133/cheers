import { beforeEach, describe, expect, it, vi } from "vitest";
import { exportSyntax } from "../export/syntax.js";
import { restoreSyntax } from "../restore/syntax.js";
import { parseSyntax } from "./parse.js";
import { syntaxCompletions } from "./projection.js";
import { parseRestoreCommandArgs, runRestoreLocalCommand } from "../restoreCommandRuntime.js";
import { runRestoreCommand } from "../../../edit/recovery/restoreCommandRunner.js";

vi.mock("../../../edit/recovery/restoreCommandRunner.js", () => ({ runRestoreCommand: vi.fn() }));
beforeEach(() => vi.clearAllMocks());

describe("strict command flags", () => {
  it.each([
    ["markdown", "out.md", "--typo"],
    ["markdown", "out.md", "--outside=false"],
    ["markdown", "out.md", "--outside", "--outside"],
    ["markdown", "out.md", "extra.md"],
    ["markdown", "out.md", "-x"],
  ])("refuses invalid export input %j", (...args) => {
    expect(parseSyntax(exportSyntax, args).ok).toBe(false);
  });

  it("honors the end-of-options marker without changing the input array", () => {
    const args = ["md", "--", "--outside"];
    const parsed = parseSyntax(exportSyntax, args);
    expect(parsed).toMatchObject({ ok: true, action: { name: "markdown" }, args: ["--outside"] });
    if (parsed.ok) expect(parsed.flags.size).toBe(0);
    expect(args).toEqual(["md", "--", "--outside"]);
  });

  it.each([
    ["typo"], ["preview", "ignored"], ["execute", "--unknown"],
    ["execute", "--record"], ["execute", "--record="],
    ["execute", "--record", "a", "--records", "b"],
    ["execute", "--all", "--record", "a"],
    ["execute", "--all=false"], ["execute", "--confirm", "yes"],
    ["execute", "--execute=false"], ["execute", "--dry-run", "--dry-run"],
    ["execute", "--record", "a,,b"], ["execute", "--record", "a,a"],
  ])("rejects invalid restore input %j before invoking recovery", async (...args) => {
    expect(() => parseRestoreCommandArgs(args, { cwd: "/workspace" })).toThrow(SyntaxError);
    const result = await runRestoreLocalCommand(args, { cwd: "/workspace" });
    expect(result.output).toContain("Invalid /restore arguments:");
    expect(result.output).toContain("Nothing was written.");
    expect(runRestoreCommand).not.toHaveBeenCalled();
  });

  it("preserves canonical aliases, inline values and the independent confirmation requirement", () => {
    const args = ["execute", "--records=a,b", "--ledger", "/tmp/ledger", "--workspace", "/tmp/workspace", "--authority", "record-owner"];
    expect(parseRestoreCommandArgs(args, { cwd: "/workspace" })).toMatchObject({
      mode: "execute", ledgerRoot: "/tmp/ledger", workspaceRoot: "/tmp/workspace",
      authorityId: "record-owner", recordSelection: { kind: "records", recordIds: ["a", "b"] },
      requireExplicitExecute: false, dryRun: false,
    });
    expect(parseRestoreCommandArgs([...args, "--confirm=execute"], { cwd: "/workspace" }).requireExplicitExecute).toBe(true);
    expect(parseRestoreCommandArgs([...args, "--execute", "--dry-run"], { cwd: "/workspace" })).toMatchObject({ requireExplicitExecute: true, dryRun: true });
  });

  it("never offers execution confirmation and omits used or conflicting flags", () => {
    expect(syntaxCompletions(restoreSyntax, "execute ")?.map(item => item.value)).toContain("--record");
    for (const prefix of ["execute ", "execute --", "execute --e", "execute --confirm "]) {
      const values = syntaxCompletions(restoreSyntax, prefix)?.map(item => item.value) ?? [];
      expect(values).not.toContain("--execute");
      expect(values).not.toContain("--confirm");
      expect(values).not.toContain("execute");
    }
    const values = syntaxCompletions(restoreSyntax, "execute --all ")?.map(item => item.value);
    expect(values).not.toContain("--all");
    expect(values).not.toContain("--record");
    expect(syntaxCompletions(exportSyntax, "markdown -- ")).toBeNull();
    expect(syntaxCompletions(exportSyntax, "markdown out.md extra.md --")).toBeNull();
    expect(syntaxCompletions(exportSyntax, "md")?.map(item => item.value)).toContain("md");
  });
});
