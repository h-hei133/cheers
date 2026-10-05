import { describe, expect, it, vi } from "vitest";
import { createCommandRegistry } from "../registry.js";
import { runClearCommand } from "../clearCommandRuntime.js";
import { runExitCommand } from "../exitCommandRuntime.js";
import { runRetryCommand } from "../retryCommandRuntime.js";
import { runReloadCommand } from "../reloadCommandRuntime.js";
import { runUndoCommand } from "../undoCommandRuntime.js";
import { runCancelShellAction } from "../shellActionRuntime.js";
import type { CommandContext } from "../types.js";

const names = ["diagnose", "cancel", "pwd", "help", "exit", "clear", "reload", "init", "cost", "undo", "retry", "hotkey", "context", "timings"];

describe("parameterless command boundaries", () => {
  it.each(names)("rejects ignored arguments before %s reads context or emits an action", async name => {
    const command = createCommandRegistry().get(name)!;
    const context = new Proxy({} as CommandContext, { get: () => { throw new Error("Context must not be read"); } });
    for (const args of [["extra"], ["--preview"], ["--force=false"], ["--", "literal"]]) {
      const result = await command.execute(args, context);
      expect(result).toMatchObject({ kind: "local", output: expect.stringContaining(`Invalid /${name} arguments:`) });
      expect(result).not.toHaveProperty("action");
    }
  });

  it("guards direct action entrypoints and preserves the valid bare actions", async () => {
    const context = { cwd: "/tmp/empty-command" };
    expect(runClearCommand(["--preview"], context).kind).toBe("local");
    expect(runExitCommand(context, ["later"]).kind).toBe("local");
    expect((await runRetryCommand(["different prompt"], context)).kind).toBe("local");
    expect((await runCancelShellAction(["other-session"], context)).kind).toBe("local");
    expect(runClearCommand([], context)).toEqual({ kind: "shell-action", action: "clear-session" });
    expect(runExitCommand(context)).toEqual({ kind: "shell-action", action: "exit-session" });
    expect(await runRetryCommand([], context)).toEqual({ kind: "shell-action", action: "retry-turn" });
    expect(await runCancelShellAction([], context)).toEqual({ kind: "shell-action", action: "cancel-run" });
  });

  it("never refreshes settings for an invalid reload", async () => {
    const refreshRuntimeConfig = vi.fn(() => { throw new Error("must not refresh"); });
    const result = await runReloadCommand(["--preview"], { cwd: "/tmp/empty-command", refreshRuntimeConfig });
    expect(result.output).toContain("Invalid /reload arguments");
    expect(refreshRuntimeConfig).not.toHaveBeenCalled();
  });

  it("retains the explicit retired undo migration guidance", async () => {
    for (const flag of ["--hard", "--discard"]) {
      const result = await runUndoCommand([flag], { cwd: "/tmp/empty-command" });
      expect(result.output).toContain("including files this session never touched");
    }
  });
});
