import fs from "node:fs";
import { runHotkeyCommand } from "../../core/commands/hotkeyCommandRuntime.js";
import { expect, it } from "vitest";
import { reportText } from "../../core/commands/report/projection.js";
import { renderReport } from "../../presentation/tui/report/renderer.js";
import { stripAnsi } from "../../presentation/tui/text/ansi.js";
import { KEY_ACTIONS, Keybindings } from "./keybindings.js";
import { KEY_BINDINGS, PASTE_GESTURE, keyReport } from "../../presentation/tui/chrome/keys.js";

it("keeps default keyboard chords in sync with the display catalogue", () => {
  const advertised = KEY_BINDINGS.filter((row) => row.group !== "pointer" && !row.keys.includes(PASTE_GESTURE));
  expect([...new Set(advertised.flatMap((row) => row.keys))].sort())
    .toEqual([...new Set(Object.values(KEY_ACTIONS).flatMap((action) => action.defaultKeys))].sort());
});

it("displays resolved overrides, unbound actions and conflict winners", () => {
  const bindings = new Keybindings({ "app.retry": "ctrl+g", "app.editor.image": [] });
  const rows = bindings.guide(false);
  expect(rows.find((row) => row.does === "Retry the last prompt")?.keys).toEqual(["ctrl+g"]);
  expect(rows.find((row) => row.does === "Edit the draft in an external editor")?.keys).toEqual([]);
  const text = reportText(keyReport(true, rows));
  expect(text).not.toContain("f5");
  expect(text).not.toContain("alt+v");
  expect(text).toContain("(unbound)");
  expect(text).toContain("requires fullscreen mode");
  expect(text).not.toContain("wheel");
});

it("marks only protocol-dependent alternatives and never invents a rebound newline key", () => {
  const defaults = reportText(keyReport(false, new Keybindings().guide(true)));
  expect(defaults).toContain("shift+enter (not reported)");
  expect(defaults).toContain("ctrl+j |");
  const rebound = reportText(keyReport(false, new Keybindings({ "tui.input.newLine": "f2" }).guide(true)));
  expect(rebound).toContain("f2");
  expect(rebound).not.toContain("ctrl+j");
});

it('retains per-key warning roles, effective bindings and plain output in the shared report', async () => {
  const result = await runHotkeyCommand([], { cwd: process.cwd(), modifierKeysReported: false, keyGuide: [
    { keys: ['shift+enter', 'ctrl+j'], negotiatedKeys: ['shift+enter'], does: 'Insert a newline', group: 'sending' },
    { keys: [], does: 'Retry the last prompt', group: 'session' },
  ] });
  const report = result.report!;
  expect(report.facts.bindings).toMatchObject([
    { keys: [{ key: 'shift+enter', requiresProtocol: true, status: 'not-reported' }, { key: 'ctrl+j', requiresProtocol: false, status: 'bound' }] },
    { keys: [] },
  ]);
  const row = report.lines.find(line => line.kind === 'columns');
  expect(row?.kind === 'columns' && row.cells[0]).toEqual([
    { text: 'shift+enter', role: 'key' }, { text: ' (not reported)', role: 'warning' }, { text: ' / ', role: 'text' }, { text: 'ctrl+j', role: 'key' },
  ]);
  expect(result.output).toBe(reportText(report)); expect(JSON.stringify(report)).not.toContain('\\u001b');
  const narrow = stripAnsi(renderReport(report, 40).join('\n'));
  expect(narrow).toContain('Does: Insert a newline'); expect(narrow).toContain('(unbound)');
});

const guideDocument = fs.readFileSync(new URL("../../../../../.wiki/guides/keybindings.md", import.meta.url), "utf8");
function section(name: string): string {
  return guideDocument.split(`<!-- ${name}:start -->`)[1]!.split(`<!-- ${name}:end -->`)[0]!.trim();
}

it("keeps the documented action and gesture tables equal to the runtime catalogues", () => {
  const rows = Object.entries(KEY_ACTIONS).map(([id, action]) =>
    `| \`${id}\` | ${action.defaultKeys.map(key => `\`${key}\``).join(" / ")} | ${action.description} |`);
  expect(section("key-actions").split("\n").slice(2)).toEqual(rows);
  const gestures = KEY_BINDINGS.filter(row => row.group === "pointer" || row.keys.includes(PASTE_GESTURE))
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
  for (const row of section("example-guide").split("\n").slice(2)) expect(result.output).toContain(row.replace(/[`*]/g, ""));
  expect(bindings.actionFor("f2")).toBe("app.retry");
  expect(bindings.actionFor("f5")).toBeUndefined();
  expect(bindings.keysFor("app.editor.image")).toEqual([]);
});
