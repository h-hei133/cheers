import { describe, expect, it } from "vitest";
import {
  getSlashCommand,
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

    expect(lines).toEqual([
      "Session command map:",
      "- /resume              open the session surface (interactive panel in TTY; overview in print/non-TTY).",
      "- /resume current      inspect the active session.",
      "- /resume list         inspect recent sessions for this project.",
      "- /resume switch <id|prefix|title|last> switch active session and project context.",
      "- /resume [id|prefix|title|last] resume the best recoverable context.",
      "- /help                show full command guide.",
    ]);
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
    const names = new Set(listSlashCommands().map((command) => command.name));
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
