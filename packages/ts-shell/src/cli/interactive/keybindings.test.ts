import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  KEY_ACTIONS,
  Keybindings,
  loadUserKeybindings,
  normalizeEntry,
} from "./keybindings.js";

/**
 * Rebinding, and what happens when the config is wrong.
 *
 * The behaviours worth pinning are the ones a person would notice as broken:
 * a binding that silently never fires, a rebind that leaves the old key working
 * too, and a malformed file that stops the session from starting.
 */
describe("keybindings", () => {
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "keybindings-"));
    process.env.HOME = home;
    process.env.USERPROFILE = home;
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
  });

  function writeConfig(contents: string): void {
    fs.mkdirSync(path.join(home, ".cheers"), { recursive: true });
    fs.writeFileSync(path.join(home, ".cheers", "keybindings.json"), contents, "utf8");
  }

  it("binds the defaults when there is no config", () => {
    const bindings = new Keybindings();
    expect(bindings.actionFor("ctrl+z")).toBe("tui.editor.undo");
    expect(bindings.actionFor("ctrl+g")).toBe("app.editor.external");
  });

  it("leaves a key no action claims unbound, so it can still be text", () => {
    // An unbound key is not an error: it falls through to the editor.
    expect(new Keybindings().actionFor("ctrl+p")).toBeUndefined();
  });

  it("replaces the defaults for a rebound action rather than adding to them", () => {
    const bindings = new Keybindings();
    bindings.setUserConfig({ "tui.editor.undo": "ctrl+-" });

    expect(bindings.actionFor("ctrl+-")).toBe("tui.editor.undo");
    // The old key is free: someone who rebinds wants one key, not two.
    expect(bindings.actionFor("ctrl+z")).toBeUndefined();
  });

  it("accepts a list of keys for one action", () => {
    const bindings = new Keybindings();
    bindings.setUserConfig({ "tui.editor.undo": ["ctrl+-", "alt+z"] });
    expect(bindings.actionFor("ctrl+-")).toBe("tui.editor.undo");
    expect(bindings.actionFor("alt+z")).toBe("tui.editor.undo");
  });

  it("unbinds an action given an empty list", () => {
    const bindings = new Keybindings();
    bindings.setUserConfig({ "app.retry": [] });
    expect(bindings.actionFor("f5")).toBeUndefined();
  });

  it("treats a bare string as one key, not one binding per character", () => {
    // Iterating the string would bind `c`, `t`, `r`, `l` and `+` separately.
    const bindings = new Keybindings();
    bindings.setUserConfig({ "tui.editor.undo": "ctrl+-" });
    expect(bindings.actionFor("c")).toBeUndefined();
    expect(bindings.keysFor("tui.editor.undo")).toEqual(["ctrl+-"]);
  });

  it("normalizes case and modifier order, so a config that looks right works", () => {
    const bindings = new Keybindings();
    bindings.setUserConfig({ "tui.editor.redo": "Ctrl+Shift+Z" });
    expect(bindings.actionFor("ctrl+shift+z")).toBe("tui.editor.redo");
  });

  it("lets a user binding take a key from a default binding", () => {
    // Otherwise the config file would say one thing and the surface do another.
    const bindings = new Keybindings();
    bindings.setUserConfig({ "app.retry": "ctrl+l" });

    expect(bindings.actionFor("ctrl+l")).toBe("app.retry");
    expect(bindings.conflicts()).toEqual([
      { key: "ctrl+l", actionIds: ["app.retry", "app.clearScreen"] },
    ]);
  });

  it("reports an unknown action id instead of ignoring it", () => {
    // A binding that never fires with nothing said is the hardest bug to find.
    writeConfig(JSON.stringify({ "not.a.real.action": "ctrl+m" }));
    const loaded = loadUserKeybindings();

    expect(loaded.config).toEqual({});
    expect(loaded.problems[0]?.message).toContain("not.a.real.action");
  });

  it("reports a value that is not a key or list of keys", () => {
    writeConfig(JSON.stringify({ "app.retry": 42 }));
    const loaded = loadUserKeybindings();

    expect(loaded.config).toEqual({});
    expect(loaded.problems[0]?.message).toContain("app.retry");
  });

  it("keeps the good bindings when one entry is wrong", () => {
    writeConfig(JSON.stringify({ "tui.editor.undo": "ctrl+-", "app.retry": 42 }));
    const loaded = loadUserKeybindings();

    expect(loaded.config).toEqual({ "tui.editor.undo": ["ctrl+-"] });
    expect(loaded.problems).toHaveLength(1);
  });

  it("reports a malformed file rather than refusing to start", () => {
    writeConfig("{ not json");
    const loaded = loadUserKeybindings();

    expect(loaded.config).toEqual({});
    expect(loaded.problems[0]?.message).toContain("not valid JSON");
    // The defaults are still in force, so the session works.
    expect(new Keybindings(loaded.config).actionFor("ctrl+z")).toBe("tui.editor.undo");
  });

  it("reports a file that is not an object of action ids", () => {
    writeConfig("[1, 2, 3]");
    const loaded = loadUserKeybindings();
    expect(loaded.problems[0]?.message).toContain("JSON object");
  });

  it("treats a missing file as the ordinary case, not a problem", () => {
    expect(loadUserKeybindings()).toEqual({ config: {}, problems: [] });
  });

  it("covers every action the catalogue declares", () => {
    // A definition with no default is deliberately unbound, but the catalogue
    // must not be empty or accidentally truncated.
    expect(Object.keys(KEY_ACTIONS).length).toBeGreaterThan(20);
    for (const [id, definition] of Object.entries(KEY_ACTIONS)) {
      expect(id).toMatch(/^[a-z]+(\.[a-z][A-Za-z]*)+$/);
      expect(definition.description).not.toBe("");
    }
  });

  it("normalizes entries the same way wherever they are read", () => {
    expect(normalizeEntry("Ctrl+A")).toEqual(["ctrl+a"]);
    expect(normalizeEntry(["Ctrl+A", "alt+b"])).toEqual(["ctrl+a", "alt+b"]);
    expect(normalizeEntry("")).toEqual([]);
    expect(normalizeEntry(42)).toBeUndefined();
    expect(normalizeEntry(["ok", 7])).toBeUndefined();
  });
});
