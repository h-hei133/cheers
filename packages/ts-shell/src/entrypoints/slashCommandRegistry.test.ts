import { describe, expect, it } from "vitest";
import { listVisibleCommands } from '../core/commands/registry.js';
import { commandInvocations } from '../core/commands/invocation.js';
import {
  getSlashCommand,
  getSlashInvocation,
  listSlashInvocations,
  registerSlashCommand,
  isKnownSlashCommand,
  listSlashCommands,
  renderSessionCommandMap,
  renderUserHelp,
} from "./slashCommandRegistry.js";

function capture(render: (renderer: { renderLine(line: string): void }) => void) {
  const lines: string[] = [];
  render({
    renderLine(line) {
      lines.push(line);
    },
  });
  return lines;
}

describe("slash command registry CLI surface", () => {
  it("keeps known command and alias lookup pure", () => {
    expect(getSlashCommand("/continue")?.name).toBe("continue");
    expect(getSlashCommand("c")?.name).toBe("continue");
    expect(isKnownSlashCommand("/workspace")).toBe(true);
    expect(getSlashCommand("/view")?.argumentHint).toBe("[status|user|developer]");
    expect(isKnownSlashCommand("definitely-missing")).toBe(false);
    expect(listSlashCommands().map((command) => command.name)).toContain("mcp");
  });

  it("renders the existing session command map", () => {
    const lines = capture((renderer) =>
      renderSessionCommandMap(renderer, { compact: true }),
    );

    expect(lines[0]).toBe("Session command map:");
    expect(lines[1]).toContain("/resume switch [id|prefix|title|last]");
    expect(lines[1]).toContain("/resume fork <session-id|here>");
    expect(lines[2]).toBe("Usage: /fork <session-id|here> [--from <value>]");
    expect(lines[3]).toContain("Quote a multi-word session title");
    expect(lines.at(-1)).toContain("/help");
  });

  it("generates the guide from the registry, so it cannot drift from it", () => {
    // A hand-written guide kept advertising commands the router had stopped
    // accepting; generating it makes that impossible.
    const lines = capture(renderUserHelp).join("\n");

    for (const command of listSlashCommands()) {
      expect(lines).toContain(`/${command.name}`);
      expect(lines).toContain(command.summary);
    }
  });

  it("describes no command the registry does not have", () => {
    const names = new Set(listSlashInvocations().map((command) => command.name));
    const advertised = capture(renderUserHelp)
      .flatMap((line) => line.match(/(?<=\s|^)\/[a-z-]+/g) ?? [])
      .map((token) => token.slice(1));
    for (const name of advertised) expect(names.has(name)).toBe(true);
  });

  it("lists the keys that replaced retired commands", () => {
    const lines = capture(renderUserHelp).join("\n");
    expect(lines).toContain("shift+tab");
    expect(lines).toContain("ctrl+j");
  });
});


it("enumerates builtins, the interactive entry, aliases, and distinct invocations", () => {
  expect(listSlashCommands().map(entry => entry.name).sort()).toEqual([...listVisibleCommands().map(entry => entry.name), 'back'].sort());
  expect(listSlashInvocations().map(entry => entry.name).sort()).toEqual([...listVisibleCommands().flatMap(commandInvocations).map(entry => entry.name), 'back'].sort());
  expect(getSlashInvocation('reload-plugins')).toMatchObject({ commandName: 'plugin', kind: 'named' });
  expect(getSlashInvocation("/models")).toMatchObject({ name: "models", commandName: "model", invocation: "/models", kind: "alias" });
  expect(getSlashInvocation("/RECALL")).toMatchObject({ name: "recall", commandName: "memory", invocation: "/recall", kind: "named", argumentHint: "<query>" });
  expect(capture(renderUserHelp).join("\n")).toContain("/recall");
});

it.each(["model", "models", "recall", "back"])("rejects an extension alias that shadows %s", (alias) => {
  expect(() => registerSlashCommand({ name: "fixture", aliases: [alias], group: "workflow", summary: "fixture" })).toThrow(/already registered/);
  expect(getSlashCommand("fixture")).toBeUndefined();
});

it("owns extension names and drops all invocation lookups on removal", () => {
  const aliases = ["fixture-alias"];
  const remove = registerSlashCommand({ name: "fixture", aliases, group: "workflow", summary: "fixture", invocations: [{ name: "fixture-special", summary: "special", argumentHint: "<text>" }] });
  try {
    aliases.push("models");
    expect(getSlashInvocation("models")?.commandName).toBe("model");
    expect(getSlashInvocation("fixture-special")?.kind).toBe("named");
  } finally { remove(); }
  for (const name of ["fixture", "fixture-alias", "fixture-special"]) expect(getSlashInvocation(name)).toBeUndefined();
});
