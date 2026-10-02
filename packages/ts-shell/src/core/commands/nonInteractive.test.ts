import { afterEach, describe, expect, it, vi } from "vitest";
import * as registry from "./registry.js";
import { routeSlashCommand } from "./slashRouter.js";
import type { CommandDefinition } from "./types.js";

afterEach(() => vi.restoreAllMocks());

describe("non-interactive command declarations", () => {
  it.each(["local", "prompt", "shell-action"] as const)("blocks an undeclared %s command before its handler runs", async (kind) => {
    const execute = vi.fn(async () => ({ kind: "local" as const, output: "unexpected" }));
    const command: CommandDefinition = {
      name: "unannounced", kind, summary: "test command", group: "workflow", execute,
    };
    vi.spyOn(registry, "createCommandRegistry").mockReturnValueOnce(new Map([[command.name, command]]));
    const result = await routeSlashCommand("/unannounced", { cwd: process.cwd(), interactive: false });
    expect(result).toMatchObject({ kind: "local", output: expect.stringContaining("Outcome: blocked") });
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(["/exit", "/quit", "/q"])("allows declared exit command %s", async (prompt) => {
    expect(await routeSlashCommand(prompt, { cwd: process.cwd(), interactive: false }))
      .toMatchObject({ kind: "shell-action", action: "exit-session" });
  });

  it.each(["/clear", "/reset", "/cls"])("allows declared new-session command %s", async (prompt) => {
    expect(await routeSlashCommand(prompt, { cwd: process.cwd(), interactive: false }))
      .toMatchObject({ kind: "shell-action", action: "clear-session" });
  });

  it.each(["retry", "cancel"])("takes the blocked reason for /%s from its declaration", async (name) => {
    const declaration = registry.createCommandRegistry(process.cwd()).get(name)!;
    const result = await routeSlashCommand(`/${name}`, { cwd: process.cwd(), interactive: false });
    expect(result).toMatchObject({ kind: "local", output: expect.stringContaining(declaration.nonInteractiveReason!) });
    expect(await routeSlashCommand(`/${name}`, { cwd: process.cwd(), interactive: true }))
      .toMatchObject({ kind: "shell-action" });
  });
});
