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
    expect(isKnownSlashCommand("definitely-missing")).toBe(false);
    expect(listSlashCommands().map((command) => command.name)).toContain("mcp");
  });

  it("renders the existing session command map", () => {
    const lines = capture((renderer) =>
      renderSessionCommandMap(renderer, { compact: true }),
    );

    expect(lines).toEqual([
      "Session command map:",
      "- /sessions            open the session surface (interactive panel in TTY; overview in print/non-TTY).",
      "- /sessions current    inspect the active session.",
      "- /sessions list       inspect recent sessions for this project.",
      "- /sessions switch <id|prefix|title|last> switch active session and project context.",
      "- /resume [id|prefix|title|last] resume the best recoverable context.",
      "- /help                show full command guide.",
    ]);
  });

  it("renders the grouped slash command guide without executing commands", () => {
    const lines = capture(renderUserHelp);

    expect(lines).toContain("\nSlash command guide");
    expect(lines).toContain("1) Session & Continuation");
    expect(lines).toContain("2) Workspace & Navigation");
    expect(lines).toContain("4) Diagnostics & Integrations");
    expect(lines).toContain(
      "- /mcp status|tools|doctor|refresh [server] inspect and recover MCP state.",
    );
    expect(lines.at(-1)).toBe("");
  });
});
