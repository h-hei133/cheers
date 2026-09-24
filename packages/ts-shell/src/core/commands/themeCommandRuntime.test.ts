import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
    if (result.kind === "local") expect(result.output).toContain("Theme set to `mine`");
  });

  it("names what is available when the theme asked for is not there", async () => {
    const result = await runThemeCommand(["nosuch"], { cwd: workspace });

    expect(result.kind).toBe("local");
    if (result.kind === "local") {
      expect(result.output).toContain("No theme named `nosuch`");
      expect(result.output).toContain("dark");
    }
  });
});
