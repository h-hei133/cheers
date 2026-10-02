import fs from "node:fs";
import { runHotkeyCommand } from "../../core/commands/hotkeyCommandRuntime.js";
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

const guideDocument = fs.readFileSync(new URL("../../../../../.wiki/guides/keybindings.md", import.meta.url), "utf8");
function section(name: string): string {
  return guideDocument.split(`<!-- ${name}:start -->`)[1]!.split(`<!-- ${name}:end -->`)[0]!.trim();
}

it("keeps the documented action and gesture tables equal to the runtime catalogues", () => {
  const rows = Object.entries(KEY_ACTIONS).map(([id, action]) =>
    `| \`${id}\` | ${action.defaultKeys.map(key => `\`${key}\``).join(" / ")} | ${action.description} |`);
  expect(section("key-actions").split("\n").slice(2)).toEqual(rows);
  const gestures = KEY_BINDINGS.filter(row => row.group === "pointer" || row.keys.includes("paste twice"))
    .map(row => `| ${row.keys.map(key => `\`${key}\``).join(" / ")} | ${row.does} |`);
  expect(section("key-gestures").split("\n").slice(2)).toEqual(gestures);
  const index = fs.readFileSync(new URL("../../../../../.wiki/_index.md", import.meta.url), "utf8");
  expect(index).toContain("(guides/keybindings.md)");
});

it("shows the documented rebinding example in the effective hotkey command", async () => {
  const config = JSON.parse(section("config-example").replace(/^```json\n|\n```$/g, ""));
  const bindings = new Keybindings(config);
  const result = await runHotkeyCommand([], {
    cwd: process.cwd(), modifierKeysReported: true, keyGuide: bindings.guide(true),
  });
  for (const row of section("example-guide").split("\n").slice(2)) expect(result.output).toContain(row);
  expect(bindings.actionFor("f2")).toBe("app.retry");
  expect(bindings.actionFor("f5")).toBeUndefined();
  expect(bindings.keysFor("app.editor.image")).toEqual([]);
});
