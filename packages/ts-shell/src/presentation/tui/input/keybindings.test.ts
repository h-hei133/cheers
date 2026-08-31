import { describe, it, expect, beforeEach } from "vitest";
import { KeybindingsManager } from "./keybindings.js";
import { formatKeyLabel, keyHint } from "./keybindingHints.js";

describe("KeybindingsManager & Hints", () => {
  let manager: KeybindingsManager;

  beforeEach(() => {
    manager = new KeybindingsManager();
  });

  it("resolves default action keybindings", () => {
    const expandKeys = manager.getKeysForAction("app.tools.expand");
    expect(expandKeys).toContain("ctrl+o");

    const cancelKeys = manager.getKeysForAction("tui.select.cancel");
    expect(cancelKeys).toContain("escape");
  });

  it("applies and queries user custom overrides", () => {
    manager.setUserOverrides({
      "app.tools.expand": "ctrl+e",
    });

    expect(manager.getKeysForAction("app.tools.expand")).toEqual(["ctrl+e"]);
    expect(manager.matches("\x05", "app.tools.expand")).toBe(true); // \x05 is ctrl+e
  });

  it("formats platform adaptive key labels and hints", () => {
    const formatted = formatKeyLabel("ctrl+o");
    expect(formatted).toBe("Ctrl+O");

    const hint = keyHint("app.tools.expand", "to expand");
    expect(hint).toContain("to expand");
  });
});
