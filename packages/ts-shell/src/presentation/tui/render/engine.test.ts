import { describe, expect, it } from "vitest";
import { TUI } from "./engine.js";
import { CURSOR_MARKER } from "./paint.js";
import type { TerminalFramePlan, TerminalFrameProvider, ViewportSize } from "./frame.js";
import { ManualScheduler, RecordingTerminal } from "../../../test-utils/terminalDouble.js";

class StubProvider implements TerminalFrameProvider {
  rows: string[] = ["row"];

  renderFrame(_dimensions: ViewportSize): TerminalFramePlan {
    return { rows: this.rows };
  }
}

function boot(): {
  tui: TUI;
  terminal: RecordingTerminal;
  scheduler: ManualScheduler;
  provider: StubProvider;
} {
  const terminal = new RecordingTerminal();
  const scheduler = new ManualScheduler();
  const provider = new StubProvider();
  const tui = new TUI(terminal, scheduler);
  tui.setFrameProvider(provider);
  return { tui, terminal, scheduler, provider };
}

describe("taking the screen", () => {
  it("enters a screen of its own and asks for the mouse", () => {
    const { tui, terminal, scheduler } = boot();
    tui.start();
    scheduler.flush();
    const written = terminal.drain();

    expect(written).toContain("\x1b[?1049h");
    expect(written).toContain("\x1b[?1002h");
  });

  it("gives the screen and the mouse back on stop", () => {
    const { tui, terminal, scheduler } = boot();
    tui.start();
    scheduler.flush();
    terminal.drain();
    tui.stop();
    const written = terminal.drain();

    expect(written).toContain("\x1b[?1049l");
    expect(written).toContain("\x1b[?1006l");
  });

  it("paints nothing once stopped", () => {
    const { tui, terminal, scheduler } = boot();
    tui.start();
    scheduler.flush();
    tui.stop();
    terminal.drain();
    tui.requestRender({ force: true });
    scheduler.flush();

    expect(terminal.drain()).toBe("");
  });
});

describe("first paint", () => {
  it("writes the frame from the top of the screen", () => {
    const { tui, terminal, scheduler, provider } = boot();
    provider.rows = ["first", "second"];
    tui.start();
    scheduler.flush();
    const written = terminal.drain();

    expect(written).toContain("first");
    expect(written).toContain("second");
    expect(written.indexOf("first")).toBeLessThan(written.indexOf("second"));
  });

  it("wraps the frame in synchronized output and disables autowrap", () => {
    const { tui, terminal, scheduler } = boot();
    tui.start();
    scheduler.flush();
    const written = terminal.drain();

    expect(written).toContain("\x1b[?2026h");
    expect(written).toContain("\x1b[?7l");
    expect(written).toContain("\x1b[?2026l");
  });

  it("fills the screen, so a short frame cannot leave the last one showing", () => {
    const { tui, terminal, scheduler, provider } = boot();
    provider.rows = ["only"];
    tui.start();
    scheduler.flush();

    // The recording device is 10 rows tall; every one of them is addressed.
    const written = terminal.drain();
    expect(written).toContain("\x1b[10;1H");
  });
});

describe("steady-state repaint", () => {
  it("rewrites only the rows that changed", () => {
    const { tui, terminal, scheduler, provider } = boot();
    provider.rows = ["one", "two", "three"];
    tui.start();
    scheduler.flush();
    terminal.drain();

    provider.rows = ["one", "CHANGED", "three"];
    tui.requestRender();
    scheduler.flush();
    const written = terminal.drain();

    expect(written).toContain("CHANGED");
    expect(written).not.toContain("three");
  });

  it("writes nothing but framing when the frame is identical", () => {
    const { tui, terminal, scheduler } = boot();
    tui.start();
    scheduler.flush();
    terminal.drain();

    tui.requestRender();
    scheduler.flush();
    const written = terminal.drain().replace(/\x1b\[\?(2026|7)[hl]/g, "");

    expect(written).not.toContain("row");
  });

  it("repaints in full after a resize, since every row may have rewrapped", () => {
    const { tui, terminal, scheduler, provider } = boot();
    provider.rows = ["one", "two"];
    tui.start();
    scheduler.flush();
    terminal.drain();

    terminal.columns = 20;
    terminal.resize();
    scheduler.flush();
    const written = terminal.drain();

    expect(written).toContain("one");
    expect(written).toContain("two");
  });
});

describe("the cursor", () => {
  it("pins the cursor where the frame marks it", () => {
    const { tui, terminal, scheduler, provider } = boot();
    provider.rows = ["no cursor", `pre${CURSOR_MARKER}post`];
    tui.start();
    scheduler.flush();
    const written = terminal.drain();

    expect(written).toContain("\x1b[2;4H");
    expect(written).toContain("\x1b[?25h");
  });

  it("hides the cursor when the frame marks nowhere for it", () => {
    const { tui, terminal, scheduler, provider } = boot();
    provider.rows = ["nothing to pin"];
    tui.start();
    scheduler.flush();

    expect(terminal.drain()).toContain("\x1b[?25l");
  });

  it("never leaves the marker on screen", () => {
    const { tui, terminal, scheduler, provider } = boot();
    provider.rows = [`draft${CURSOR_MARKER}`];
    tui.start();
    scheduler.flush();

    expect(terminal.drain()).not.toContain(CURSOR_MARKER);
  });
});

describe("backpressure", () => {
  it("defers a frame while the link is behind", () => {
    const { tui, terminal, scheduler } = boot();
    tui.start();
    scheduler.flush();
    terminal.drain();

    terminal.pending = 1024 * 1024;
    tui.requestRender();
    scheduler.flush();
    expect(terminal.drain()).toBe("");

    terminal.pending = 0;
    scheduler.flush();
    expect(terminal.drain()).not.toBe("");
  });

  it("paints a forced frame even when the link is behind", () => {
    const { tui, terminal, scheduler } = boot();
    tui.start();
    scheduler.flush();
    terminal.drain();

    terminal.pending = 1024 * 1024;
    tui.requestRender({ force: true });
    scheduler.flush();

    expect(terminal.drain()).not.toBe("");
  });
});
