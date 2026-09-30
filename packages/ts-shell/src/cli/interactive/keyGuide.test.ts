import { expect, it } from "vitest";
import { KEY_ACTIONS, Keybindings } from "./keybindings.js";
import { KEY_BINDINGS, renderKeyGuide } from "../../presentation/tui/chrome/keys.js";

it("keeps default keyboard chords in sync with the display catalogue", () => {
  const advertised = KEY_BINDINGS.filter((row) => row.group !== "pointer" && !row.keys.includes("paste twice"));
  expect([...new Set(advertised.flatMap((row) => row.keys))].sort())
    .toEqual([...new Set(Object.values(KEY_ACTIONS).flatMap((action) => action.defaultKeys))].sort());
});

it("displays resolved overrides, unbound actions and conflict winners", () => {
  const bindings = new Keybindings({ "app.retry": "ctrl+g", "app.editor.image": [] });
  const rows = bindings.guide(false);
  expect(rows.find((row) => row.does === "Retry the last prompt")?.keys).toEqual(["ctrl+g"]);
  expect(rows.find((row) => row.does === "Edit the draft in an external editor")?.keys).toEqual([]);
  const text = renderKeyGuide(true, rows);
  expect(text).not.toContain("`f5`");
  expect(text).not.toContain("`alt+v`");
  expect(text).toContain("*(unbound)*");
  expect(text).toContain("requires fullscreen mode");
  expect(text).not.toContain("`wheel`");
});

it("marks only protocol-dependent alternatives and never invents a rebound newline key", () => {
  const defaults = renderKeyGuide(false, new Keybindings().guide(true));
  expect(defaults).toContain("`shift+enter` *(not reported)*");
  expect(defaults).toContain("`ctrl+j` |");
  const rebound = renderKeyGuide(false, new Keybindings({ "tui.input.newLine": "f2" }).guide(true));
  expect(rebound).toContain("`f2`");
  expect(rebound).not.toContain("ctrl+j");
});
