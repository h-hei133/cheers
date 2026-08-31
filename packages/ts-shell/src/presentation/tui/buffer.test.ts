import { describe, it, expect } from "vitest";
import { DifferentialTerminalBuffer } from "./buffer.js";

describe("DifferentialTerminalBuffer with DECAWM & Hardware Cursor Pinning", () => {
  it("wraps rendered frame in DECAWM disable and sync output markers", () => {
    const buffer = new DifferentialTerminalBuffer();
    const frame = ["Line 1", "Line 2"];

    const output = buffer.render(frame);
    expect(output).toContain("\x1b[?25l"); // Hide cursor
    expect(output).toContain("\x1b[?2026h"); // Begin sync
    expect(output).toContain("\x1b[?7l"); // Disable autowrap
    expect(output).toContain("\x1b[?7h"); // Restore autowrap
    expect(output).toContain("\x1b[?2026l"); // End sync
  });

  it("pins hardware cursor to exact physical coordinates and restores visibility", () => {
    const buffer = new DifferentialTerminalBuffer();
    const frame = ["╭─ Box ─╮", "│ ❯ abc │", "╰───────╯"];

    const output = buffer.render(frame, { row: 2, col: 8 });
    expect(output).toContain("\x1b[2;8H\x1b[?25h"); // Pin hardware cursor to row 2, col 8 and show
  });
});
