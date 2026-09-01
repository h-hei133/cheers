import { describe, it, expect } from "vitest";
import { detectTerminalCapabilities } from "./terminalCapabilities.js";
import { processTerminal, Terminal } from "./terminal.js";
import { TUI } from "./tui.js";

describe("Terminal Capabilities and ProcessTerminal", () => {
  it("detects terminal capabilities from environment", () => {
    const caps = detectTerminalCapabilities({ COLORTERM: "truecolor", TERM: "xterm-256color" });
    expect(caps.hasTrueColor).toBe(true);
    expect(caps.has256Color).toBe(true);
    expect(caps.supportsDec2026Sync).toBe(true);
  });

  it("handles ProcessTerminal dimensions", () => {
    const dims = processTerminal.getDimensions();
    expect(dims.rows).toBeGreaterThan(0);
    expect(dims.columns).toBeGreaterThan(0);
  });

  it("constructs Terminal instance", () => {
    const term = new Terminal();
    expect(term.capabilities).toBeDefined();
  });
});

describe("TUI Engine with TerminalFrameProvider", () => {
  it("renders frame and extracts CURSOR_MARKER without throwing", () => {
    const term = new Terminal();
    const tui = new TUI(term);
    let historyAcknowledged = false;

    const provider = {
      renderFrame: () => ({
        history: { id: 1, rows: ["Welcome line"] },
        viewport: ["╭─ Box ─╮", "│ ❯ \x1b_cursor:c\x07 │", "╰───────╯"],
      }),
      acknowledgeHistory: (id: number) => {
        if (id === 1) historyAcknowledged = true;
      },
    };

    tui.setFrameProvider(provider);
    tui.renderNow();

    expect(historyAcknowledged).toBe(true);
    tui.stop();
  });
});
