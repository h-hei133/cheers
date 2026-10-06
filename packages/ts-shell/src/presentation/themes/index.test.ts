import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listThemes, loadTheme, themeNamesFromPaths, themeSource } from "./index.js";
import { projectTrust } from "../../core/security/trust/store.js";

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
    vi.stubEnv("HOME", home); vi.stubEnv("USERPROFILE", home);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
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
    projectTrust.setProjectTrust(root, "session-only");
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
    projectTrust.setProjectTrust(root, "session-only");
    fs.mkdirSync(path.join(root, ".git"), { recursive: true });
    writeTheme(path.join(root, ".agents", "themes"), "sunset.json", {
      colors: { text: "#221100" },
    });

    expect(loadTheme("sunset", root)?.name).toBe("sunset");
  });

  it("lets a project theme shadow a bundled one of the same name", () => {
    projectTrust.setProjectTrust(root, "session-only");
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

  it("lists invalid themes but reports why they cannot be selected", () => {
    projectTrust.setProjectTrust(root, "session-only");
    // A broken palette is a broken theme, not a broken session.
    fs.mkdirSync(path.join(root, ".git"), { recursive: true });
    const dir = path.join(root, ".agents", "themes");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "broken.json"), "{ not json", "utf8");
    writeTheme(dir, "nocolors.json", { name: "nocolors" });

    expect(listThemes(root)).toContain("broken");
    expect(listThemes(root)).toContain("nocolors");
    expect(() => loadTheme("broken", root)).toThrow("Invalid theme broken");
    expect(() => loadTheme("nocolors", root)).toThrow("colors must be an object");
  });

  it("returns nothing for a name no theme claims", () => {
    expect(loadTheme("no-such-theme", root)).toBeUndefined();
  });

  it("fills in the tokens a theme does not name", () => {
    projectTrust.setProjectTrust(root, "session-only");
    // A theme defining only `accent` used to be rendered with the renderer's
    // per-token fallback for everything else — a hardcoded white for text, which
    // is unreadable on a light terminal, from a file that looked valid.
    fs.mkdirSync(path.join(root, ".git"), { recursive: true });
    const dir = path.join(root, ".agents", "themes");
    fs.mkdirSync(dir, { recursive: true });
    writeTheme(dir, "sparse.json", { name: "sparse", colors: { accent: "#ff0000" } });

    const loaded = loadTheme("sparse", root);
    const dark = loadTheme("dark", root);

    expect(loaded?.colors.accent).toBe("#ff0000");
    // Every token the bundled theme has is present, and the ones the file did not
    // name come from the bundled theme rather than being absent.
    expect(Object.keys(loaded!.colors).sort()).toEqual(Object.keys(dark!.colors).sort());
    expect(loaded?.colors.text).toBe(dark?.colors.text);
  });

  it("does not read a theme directory above a directory that is not a project", () => {
    projectTrust.setProjectTrust(root, "session-only");
    // The same boundary the instruction reader uses: without a root marker the
    // chain above is part of no project.
    const outer = path.join(root, "not-a-project");
    const inner = path.join(outer, "inner");
    fs.mkdirSync(inner, { recursive: true });
    writeTheme(path.join(outer, ".agents", "themes"), "outside.json", {
      name: "outside",
      colors: { text: "#000000" },
    });

    // TMPDIR may itself be inside a repository. Model the required absence of
    // root markers without depending on the host's directory ancestry.
    const exists = fs.existsSync;
    const marker = vi.spyOn(fs, "existsSync").mockImplementation(file =>
      path.basename(String(file)) === ".git" ? false : exists(file));
    try {
      expect(listThemes(inner)).not.toContain("outside");
    } finally {
      marker.mockRestore();
    }
  });
});

describe("themes a path named on the command line", () => {
  let workspace = "";
  let named = "";

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), "theme-named-ws-"));
    named = fs.mkdtempSync(path.join(os.tmpdir(), "theme-named-"));
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

  it("loads a theme from a file path", () => {
    // The reason the flag exists: trying a theme out before installing it, from
    // wherever it happens to have been written.
    const file = path.join(named, "mine.json");
    writeTheme(file, "mine", "#abcdef");

    const config = loadTheme("mine", workspace, [file]);

    expect(config?.colors.accent).toBe("#abcdef");
    expect(listThemes(workspace, [file])).toContain("mine");
  });

  it("loads every theme in a directory path", () => {
    // A theme collection is shared as a directory, which is the shape the
    // reference uses too.
    writeTheme(path.join(named, "one.json"), "one", "#111111");
    writeTheme(path.join(named, "two.json"), "two", "#222222");

    const names = listThemes(workspace, [named]);

    expect(names).toContain("one");
    expect(names).toContain("two");
  });

  it("lets a named theme shadow a bundled one of the same name", () => {
    // Naming a file is a more specific statement than what the directories
    // happen to contain, so it wins — otherwise pointing at a theme called
    // `dark` would silently render the built-in one.
    writeTheme(path.join(named, "dark.json"), "dark", "#123456");

    expect(loadTheme("dark", workspace, [path.join(named, "dark.json")])?.colors.accent).toBe("#123456");
  });

  it("reports the names a path actually provides", () => {
    // A mistyped path and a file whose theme lost a name collision both look
    // like the flag being ignored, which is the one outcome a user cannot
    // diagnose from the rendered palette alone.
    const file = path.join(named, "mine.json");
    writeTheme(file, "mine", "#abcdef");

    expect(themeNamesFromPaths([file])).toEqual(["mine"]);
    expect(themeNamesFromPaths([path.join(named, "typo.json")])).toEqual([]);
  });

  it("ignores a path that holds nothing readable", () => {
    // A broken theme is a broken theme, not a broken session: the caller
    // reports it and the default palette stands.
    fs.writeFileSync(path.join(named, "broken.json"), "{ not json", "utf8");

    expect(themeNamesFromPaths([path.join(named, "broken.json")])).toEqual(["broken"]);
    expect(() => loadTheme("broken", workspace, [path.join(named, "broken.json")])).toThrow("Invalid theme broken");
    expect(listThemes(workspace, [path.join(named, "broken.json")])).toEqual(
      expect.arrayContaining(["dark", "light"]),
    );
  });
});
