import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listThemes, loadTheme, themeSource } from "./index.js";

/**
 * Where themes come from.
 *
 * Bundling two palettes meant the answer to "can I use my own colors" was no.
 * What matters here is that a theme file is found at all, and that the precedence
 * between a user's copy and a project's is the same one the instruction and skill
 * readers use — a project overrides the user, and a nearer project directory
 * overrides a farther one.
 */
describe("theme discovery", () => {
  let root = "";
  let home = "";

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "themes-"));
    home = path.join(root, "home");
    fs.mkdirSync(home, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function writeTheme(directory: string, fileName: string, body: Record<string, unknown>): void {
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, fileName), JSON.stringify(body), "utf8");
  }

  it("always offers the bundled themes", () => {
    expect(listThemes(root)).toEqual(expect.arrayContaining(["dark", "light"]));
  });

  it("finds a theme in the project's own directory", () => {
    fs.mkdirSync(path.join(root, ".git"), { recursive: true });
    writeTheme(path.join(root, ".agents", "themes"), "ocean.json", {
      name: "ocean",
      description: "blue",
      colors: { text: "#001122" },
    });

    expect(listThemes(root)).toContain("ocean");
    expect(loadTheme("ocean", root)?.colors.text).toBe("#001122");
    expect(themeSource("ocean", root)).toBe("user-or-project");
  });

  it("falls back to the file name when the theme does not name itself", () => {
    fs.mkdirSync(path.join(root, ".git"), { recursive: true });
    writeTheme(path.join(root, ".agents", "themes"), "sunset.json", {
      colors: { text: "#221100" },
    });

    expect(loadTheme("sunset", root)?.name).toBe("sunset");
  });

  it("lets a project theme shadow a bundled one of the same name", () => {
    // So a user can adjust `dark` without losing the original: deleting their
    // file restores it.
    fs.mkdirSync(path.join(root, ".git"), { recursive: true });
    writeTheme(path.join(root, ".agents", "themes"), "dark.json", {
      name: "dark",
      colors: { text: "#ff0000" },
    });
    // A separate project, so the shadowing one does not reach it.
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), "themes-elsewhere-"));
    fs.mkdirSync(path.join(elsewhere, ".git"), { recursive: true });

    try {
      expect(loadTheme("dark", root)?.colors.text).toBe("#ff0000");
      expect(loadTheme("dark", elsewhere)?.colors.text).not.toBe("#ff0000");
    } finally {
      fs.rmSync(elsewhere, { recursive: true, force: true });
    }
  });

  it("ignores a theme file that is not usable", () => {
    // A broken palette is a broken theme, not a broken session.
    fs.mkdirSync(path.join(root, ".git"), { recursive: true });
    const dir = path.join(root, ".agents", "themes");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "broken.json"), "{ not json", "utf8");
    writeTheme(dir, "nocolors.json", { name: "nocolors" });

    expect(listThemes(root)).not.toContain("broken");
    expect(listThemes(root)).not.toContain("nocolors");
    expect(loadTheme("broken", root)).toBeUndefined();
  });

  it("returns nothing for a name no theme claims", () => {
    expect(loadTheme("no-such-theme", root)).toBeUndefined();
  });

  it("does not read a theme directory above a directory that is not a project", () => {
    // The same boundary the instruction reader uses: without a root marker the
    // chain above is part of no project.
    const outer = path.join(root, "not-a-project");
    const inner = path.join(outer, "inner");
    fs.mkdirSync(inner, { recursive: true });
    writeTheme(path.join(outer, ".agents", "themes"), "outside.json", {
      name: "outside",
      colors: { text: "#000000" },
    });

    expect(listThemes(inner)).not.toContain("outside");
  });
});
