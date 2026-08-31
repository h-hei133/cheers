import { describe, it, expect } from "vitest";
import { detectTerminalCapabilities } from "./terminalCapabilities.js";
import { ProcessTerminal } from "./terminal.js";
import { TUI, type TerminalFrameProvider } from "./tui.js";

describe("Terminal Capabilities and ProcessTerminal", () => {
  it("detects terminal capabilities from environment", () => {
    const caps = detectTerminalCapabilities({ COLORTERM: "truecolor", TERM: "xterm-256color" });
    expect(caps.hasTrueColor).toBe(true);
    expect(caps.has256Color).toBe(true);
    expect(caps.supportsDec2026Sync).toBe(true);
  });

  it("handles ProcessTerminal dimensions and raw mode", () => {
    const term = new ProcessTerminal();
    expect(term.capabilities).toBeDefined();
    const dims = term.getDimensions();
    expect(dims.rows).toBeGreaterThan(0);
    expect(dims.cols).toBeGreaterThan(0);
  });
});

describe("TUI Engine with TerminalFrameProvider", () => {
  it("renders frame and extracts CURSOR_MARKER without throwing", () => {
    const tui = new TUI();
    let historyAcknowledged = false;

    const provider: TerminalFrameProvider = {
      renderFrame: () => ({
        history: { id: 1, lines: ["Welcome line"] },
        viewport: ["╭─ Box ─╮", "│ ❯ \x1b_cursor:c\x07 │", "╰───────╯"],
      }),
      acknowledgeHistory: (id) => {
        if (id === 1) historyAcknowledged = true;
      },
    };

    tui.setFrameProvider(provider);
    tui.start();
    tui.requestRender();

    expect(historyAcknowledged).toBe(true);
    tui.stop();
  });
});
