import { afterEach, describe, expect, it, vi } from "vitest";
import { runThemeCommand, themeSyntax } from "../themeCommandRuntime.js";
import { runSkillCommand } from "../skillCommandRuntime.js";
import { runToolsCommand } from "../toolsCommandRuntime.js";
import { routeSlashCommand } from "../slashRouter.js";
import { selectTheme, selectedTheme } from "../../../presentation/theme/selection.js";
import { syntaxHint } from "./projection.js";
import type { CommandContext } from "../types.js";
import type { ToolDefinition } from "../../../tools/types.js";

afterEach(() => selectTheme("dark"));

describe("named entity command boundaries", () => {
  it.each([runThemeCommand, runSkillCommand, runToolsCommand])("rejects extra names and flags before catalog access", async run => {
    const context = new Proxy({} as CommandContext, { get: () => { throw new Error("must not read catalog"); } });
    for (const args of [["light", "extra"], ["--preview"], ["light", "--save"], ["--", "first", "second"], [""]]) {
      expect(await run(args, context)).toMatchObject({ kind: "local", output: expect.stringContaining("Invalid /") });
    }
  });

  it("does not switch the theme when extra input is present", async () => {
    selectTheme("dark");
    const result = await routeSlashCommand("/theme light extra", { cwd: process.cwd() });
    expect(result).toMatchObject({ kind: "local", output: expect.stringContaining("Invalid /theme arguments") });
    expect(selectedTheme()).toBe("dark");
    expect(syntaxHint(themeSyntax)).toBe("[name]");
  });

  it("keeps an exact quoted or dash-leading tool name and does not fetch the pool for invalid input", async () => {
    const tool = { name: "Fixture Tool", description: "Fixture detail.", argsSchema: { type: "object", properties: {} } } as ToolDefinition;
    const dashed = { ...tool, name: "--fixture" };
    const getToolPool = vi.fn(async () => new Map([[tool.name, tool], [dashed.name, dashed]]));
    const context = { cwd: process.cwd(), getToolPool };
    const quoted = await routeSlashCommand('/tools "Fixture Tool"', context);
    expect(quoted).toMatchObject({ kind: "local", output: expect.stringContaining("### Fixture Tool") });
    const literal = await routeSlashCommand("/tools -- --fixture", context);
    expect(literal).toMatchObject({ kind: "local", output: expect.stringContaining("### --fixture") });
    getToolPool.mockClear();
    await runToolsCommand(["Fixture Tool", "extra"], context);
    expect(getToolPool).not.toHaveBeenCalled();
  });
});
