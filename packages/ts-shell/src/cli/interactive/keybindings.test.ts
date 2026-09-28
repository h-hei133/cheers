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
  const originalHome = process.env.HOME;
  const originalUserProfile = process.env.USERPROFILE;
  let home: string;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "keybindings-"));
    process.env.HOME = home;
    process.env.USERPROFILE = home;
  });

  afterEach(() => {
    fs.rmSync(home, { recursive: true, force: true });
    if (originalUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = originalUserProfile;
    if (originalHome === undefined) delete process.env.HOME;
    else process.env.HOME = originalHome;
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

  it("refuses a chord it cannot produce instead of binding the bare key", () => {
    // `cmd+z` is not a key this parser emits. Dropping the segment it does not
    // know would leave a binding on `z`, and typing would fire the shortcut.
    const bindings = new Keybindings();
    bindings.setUserConfig({ "tui.editor.undo": "cmd+z" });

    expect(bindings.actionFor("z")).toBeUndefined();
    expect(bindings.keysFor("tui.editor.undo")).toEqual([]);
  });

  it("refuses a misspelled modifier for the same reason", () => {
    const bindings = new Keybindings();
    bindings.setUserConfig({ "app.retry": "cotrl+x" });
    expect(bindings.actionFor("x")).toBeUndefined();
  });

  it("refuses a modifier with no key after it", () => {
    const bindings = new Keybindings();
    bindings.setUserConfig({ "app.retry": "ctrl+" });
    // `ctrl` is not a key id the parser ever reports, so this would never fire.
    expect(bindings.actionFor("ctrl")).toBeUndefined();
    expect(bindings.keysFor("app.retry")).toEqual([]);
  });

  it("keeps meta, which the parser does emit", () => {
    const bindings = new Keybindings();
    bindings.setUserConfig({ "app.exit": "meta+q" });
    expect(bindings.actionFor("meta+q")).toBe("app.exit");
  });

  it("reports a key it cannot produce, and keeps the rest of the entry", () => {
    writeConfig(
      JSON.stringify({
        "tui.editor.undo": "cmd+z",
        "tui.editor.redo": ["ctrl+shift+z", "super+r"],
      }),
    );
    const loaded = loadUserKeybindings();

    expect(loaded.problems.map((problem) => problem.message).join("\n")).toContain("cmd+z");
    expect(loaded.problems.map((problem) => problem.message).join("\n")).toContain("super+r");
    // The usable half of the list survives. The action whose only key was
    // unusable is recorded with no keys rather than left out: an omitted action
    // keeps its default binding, which would leave the user pressing `ctrl+z`
    // after asking for a key this terminal cannot send.
    expect(loaded.config).toEqual({ "tui.editor.undo": [], "tui.editor.redo": ["ctrl+shift+z"] });
  });

  it("leaves an action unbound when its key cannot be produced, as a direct config does", () => {
    // The same config must mean the same thing whichever way it arrives. Handing
    // this object straight to `setUserConfig` always unbound the action; loading
    // it from disk used to restore the default instead.
    writeConfig(JSON.stringify({ "tui.editor.undo": "cmd+z" }));
    const fromDisk = new Keybindings(loadUserKeybindings().config);
    const direct = new Keybindings();
    direct.setUserConfig({ "tui.editor.undo": "cmd+z" });

    expect(fromDisk.keysFor("tui.editor.undo")).toEqual([]);
    expect(fromDisk.keysFor("tui.editor.undo")).toEqual(direct.keysFor("tui.editor.undo"));
    expect(fromDisk.actionFor("ctrl+z")).toBeUndefined();
  });

  it("binds a literal plus, in both spellings the parser reports", () => {
    const bindings = new Keybindings();
    bindings.setUserConfig({ "tui.editor.undo": "+", "tui.editor.redo": "ctrl++" });

    expect(bindings.actionFor("+")).toBe("tui.editor.undo");
    expect(bindings.actionFor("ctrl++")).toBe("tui.editor.redo");
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
