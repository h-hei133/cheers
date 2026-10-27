import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { selectTheme, selectedTheme, updateAppearance } from "../../presentation/theme/selection.js";
import { currentTheme } from "../../presentation/theme/theme.js";
import { runThemeCommand } from "./themeCommandRuntime.js";

/**
 * `/theme` over a run that named a theme path.
 *
 * The startup path loads `--theme` paths, so a session that started with one must
 * still be able to list it and switch back to it. A command that searched only the
 * user and project directories would offer a theme the run was already using as
 * though it did not exist.
 */
describe("the theme command", () => {
  let workspace = "";
  let named = "";

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "theme-cmd-ws-"));
    named = fs.mkdtempSync(path.join(os.tmpdir(), "theme-cmd-"));
  });

  afterEach(() => {
    selectTheme("dark");
    updateAppearance("dark");
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(named, { recursive: true, force: true });
  });

  function writeTheme(filePath: string, name: string, accent: string): void {
    fs.writeFileSync(
      filePath,
      JSON.stringify({ name, description: "named", colors: { accent } }),
      "utf8",
    );
  }

  it("lists a theme the run named on the command line", async () => {
    const file = path.join(named, "mine.json");
    writeTheme(file, "mine", "#ff00ff");

    const result = await runThemeCommand([], { cwd: workspace, themePaths: [file] });

    expect(result.kind).toBe("local");
    if (result.kind === "local") {
      expect(result.output).toContain("mine");
      expect(result.output).toContain("named");
    }
  });

  it("selects a theme the run named on the command line", async () => {
    const file = path.join(named, "mine.json");
    writeTheme(file, "mine", "#ff00ff");

    const result = await runThemeCommand(["mine"], { cwd: workspace, themePaths: [file] });

    expect(result.kind).toBe("local");
    if (result.kind === "local") {
      expect(result.output).toContain("Theme set to `mine` for this session");
      expect(result.output).toContain("/settings Appearance");
    }
  });

  it("names what is available when the theme asked for is not there", async () => {
    const result = await runThemeCommand(["nosuch"], { cwd: workspace });

    expect(result.kind).toBe("local");
    if (result.kind === "local") {
      expect(result.output).toContain("No theme named `nosuch`");
      expect(result.output).toContain("dark");
    }
  });

  it("reports invalid tokens and keeps other themes selectable", async () => {
    const file = path.join(named, "broken.json");
    fs.writeFileSync(file, JSON.stringify({ colors: { accentt: "#ffffff" } }));
    const context = { cwd: workspace, themePaths: [file] };
    expect((await runThemeCommand(["broken"], context)).output).toContain("Unknown color token: accentt");
    expect((await runThemeCommand([], context)).output).toContain("Invalid theme broken");
    expect((await runThemeCommand(["dark"], context)).output).toContain("Theme set to");
  });

  it("preserves a theme name containing spaces and uppercase letters", async () => {
    const file = path.join(named, "custom.json");
    writeTheme(file, "Dark Mode", "#ff00ff");
    expect((await runThemeCommand(["Dark Mode"], { cwd: workspace, themePaths: [file] })).output).toContain("Theme set to `Dark Mode`");
  });
});


it("lists and selects auto without confusing the resolved theme with a named selection", async () => {
  const context = { cwd: process.cwd() };
  try {
    updateAppearance("light");
    expect((await runThemeCommand(["auto"], context)).output).toContain("currently `light`");
    expect(selectedTheme()).toBe("auto");
    const listing = (await runThemeCommand([], context)).output;
    expect(listing).toMatch(/auto.*in use/);
    expect(listing).not.toMatch(/^- `light`.*in use/m);
    await runThemeCommand(["light"], context);
    updateAppearance("dark");
    expect(currentTheme()).toBe("light");
  } finally { selectTheme("dark"); updateAppearance("dark"); }
});
