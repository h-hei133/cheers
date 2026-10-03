import { describe, expect, it } from "vitest";
import { isResumeLikeShellAction, isShellAction, renderInteractiveOnlyShellActionBlocked } from "./shellActionBridge.js";
import type { ShellActionResult } from "../commands/types.js";

describe("shell action boundary", () => {
  it("requires an actual shell action and preserves its specific action", () => {
    const resume: ShellActionResult = { kind: "shell-action", action: "resume-session", sessionId: "saved" };
    const continuation: ShellActionResult = { kind: "shell-action", action: "continue-session" };
    expect(isResumeLikeShellAction(resume)).toBe(true);
    expect(isResumeLikeShellAction(continuation)).toBe(true);
    expect(isShellAction(resume, "resume-session")).toBe(true);
    expect(isShellAction(resume, "exit-session")).toBe(false);
    for (const value of [null, undefined, { kind: "local", action: "resume-session" }, { kind: "shell-action", action: "exit-session" }]) {
      expect(isResumeLikeShellAction(value as ShellActionResult)).toBe(false);
    }
    expect(isShellAction({ kind: "local", action: "exit-session" } as unknown as ShellActionResult, "exit-session")).toBe(false);
  });

  it.each([true, false])("reports an interactive-only action as blocked (print=%s)", printMode => {
    const lines: string[] = [];
    renderInteractiveOnlyShellActionBlocked({ renderLine: (line: string) => lines.push(line) } as never, { printMode });
    expect(lines[0]).toBe(printMode ? "Result" : "\nResult");
    expect(lines).toContain("- Outcome: blocked");
    expect(lines).toContain("- BlockerKind: command-not-allowlisted");
    expect(lines.join("\n")).toContain("interactive-only");
    expect(lines.join("\n")).not.toContain("success");
    expect(lines.at(-1) === "").toBe(!printMode);
  });
});
