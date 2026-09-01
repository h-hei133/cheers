import { describe, expect, it } from "vitest";
import { TUI } from "./engine.js";
import { CURSOR_MARKER } from "./paint.js";
import type {
  HistoryBatch,
  TerminalFramePlan,
  TerminalFrameProvider,
  ViewportSize,
} from "./frame.js";
import { ManualScheduler, RecordingTerminal } from "../../../test-utils/terminalDouble.js";

class StubProvider implements TerminalFrameProvider {
  viewport: string[] = ["row"];
  history: HistoryBatch | undefined;
  acknowledged: number[] = [];
  replays = 0;
  flushes = 0;

  renderFrame(_dimensions: ViewportSize): TerminalFramePlan {
    return { history: this.history, viewport: this.viewport };
  }

  acknowledgeHistory(id: number): void {
    this.acknowledged.push(id);
    if (this.history?.id === id) this.history = undefined;
  }

  beginHistoryReplay(): void {
    this.replays += 1;
  }

  beginHistoryFlush(): void {
    this.flushes += 1;
  }
}

function boot(): { tui: TUI; terminal: RecordingTerminal; scheduler: ManualScheduler; provider: StubProvider } {
  const terminal = new RecordingTerminal();
  const scheduler = new ManualScheduler();
  const provider = new StubProvider();
  const tui = new TUI(terminal, scheduler);
  tui.setFrameProvider(provider);
  return { tui, terminal, scheduler, provider };
}

describe("first paint", () => {
  it("starts at the top of the screen and grows downward", () => {
    // Bottom anchoring is the steady state, not the starting state: pinning the
    // first frame to the last rows would have to push blank rows into the
    // terminal's scrollback to get there.
    const { tui, terminal, scheduler, provider } = boot();
    provider.viewport = ["a", "b"];
    tui.start();
    scheduler.flush();
    expect(terminal.drain()).toContain("\x1b[1;1H");
    expect(tui.viewportTopRow).toBe(0);
  });

  it("wraps the frame in synchronized output and disables autowrap", () => {
    const { tui, terminal, scheduler } = boot();
    tui.start();
    scheduler.flush();
    const output = terminal.drain();
    expect(output.startsWith("\x1b[?25l\x1b[?2026h\x1b[?7l")).toBe(true);
    expect(output.endsWith("\x1b[?7h\x1b[?2026l")).toBe(true);
  });

  it("never enters the alternate screen, which has no scrollback", () => {
    const { tui, terminal, scheduler } = boot();
    tui.start();
    scheduler.flush();
    expect(terminal.drain()).not.toContain("?1049");
  });
});

describe("steady-state repaint", () => {
  it("rewrites only the rows that changed", () => {
    const { tui, terminal, scheduler, provider } = boot();
    provider.viewport = ["a", "b", "c"];
    tui.start();
    scheduler.flush();
    terminal.drain();

    provider.viewport = ["a", "B", "c"];
    tui.requestRender();
    scheduler.flush();
    const output = terminal.drain();
    expect(output).toContain("\x1b[2;1H");
    expect(output).toContain("B");
    // One erase-to-end-of-line per rewritten row: exactly one row changed.
    expect(output.match(/\x1b\[K/g)).toHaveLength(1);
  });

  it("writes nothing but frame framing when the frame is identical", () => {
    const { tui, terminal, scheduler } = boot();
    tui.start();
    scheduler.flush();
    terminal.drain();
    tui.requestRender();
    scheduler.flush();
    const output = terminal.drain();
    expect(output).not.toContain("row");
  });

  it("erases rows the frame gave up when it shrinks", () => {
    const { tui, terminal, scheduler, provider } = boot();
    provider.viewport = ["a", "b", "c"];
    tui.start();
    scheduler.flush();
    terminal.drain();
    provider.viewport = ["a"];
    tui.requestRender();
    scheduler.flush();
    expect(terminal.drain()).toContain("\x1b[J");
  });
});

describe("history retirement", () => {
  it("writes the batch, acknowledges it, and moves the anchor down by its height", () => {
    const { tui, terminal, scheduler, provider } = boot();
    provider.viewport = ["v1", "v2"];
    tui.start();
    scheduler.flush();
    terminal.drain();
    expect(tui.viewportTopRow).toBe(0);

    provider.history = { id: 1, rows: ["past-one", "past-two"], kind: "append" };
    tui.requestRender();
    scheduler.flush(2);
    const output = terminal.drain();
    expect(output).toContain("past-one");
    expect(output).toContain("past-two");
    expect(provider.acknowledged).toContain(1);
    expect(tui.viewportTopRow).toBe(2);
  });

  it("stops the anchor at the screen floor so the write scrolls instead", () => {
    const { tui, terminal, scheduler, provider } = boot();
    terminal.rows = 4;
    provider.viewport = ["v1", "v2"];
    tui.start();
    scheduler.flush();
    terminal.drain();

    provider.history = { id: 1, rows: ["p1", "p2", "p3"], kind: "append" };
    tui.requestRender();
    scheduler.flush(2);
    expect(tui.viewportTopRow).toBe(2);
  });

  it("ignores a batch id it already accepted but still acknowledges it", () => {
    const { tui, terminal, scheduler, provider } = boot();
    tui.start();
    scheduler.flush();
    provider.history = { id: 1, rows: ["retired"], kind: "append" };
    tui.requestRender();
    scheduler.flush(2);
    terminal.drain();

    provider.history = { id: 1, rows: ["retired"], kind: "append" };
    provider.acknowledged = [];
    tui.requestRender();
    scheduler.flush(2);
    expect(terminal.drain()).not.toContain("retired");
    expect(provider.acknowledged).toContain(1);
  });

  it("drains what remains into the terminal at shutdown", () => {
    const { tui, terminal, scheduler, provider } = boot();
    tui.start();
    scheduler.flush();
    terminal.drain();
    provider.history = { id: 5, rows: ["final-row"], kind: "append" };
    tui.stop();
    expect(provider.flushes).toBe(1);
    expect(terminal.drain()).toContain("final-row");
    expect(terminal.stopped).toBe(true);
  });
});

describe("frame bounds", () => {
  it("clamps a viewport taller than the screen to its trailing rows", () => {
    const { tui, terminal, scheduler, provider } = boot();
    terminal.rows = 3;
    provider.viewport = ["top-a", "top-b", "keep-c", "keep-d", "keep-e"];
    tui.start();
    scheduler.flush();
    const output = terminal.drain();
    expect(output).toContain("keep-c");
    expect(output).toContain("keep-e");
    expect(output).not.toContain("top-a");
    expect(output).not.toContain("top-b");
  });
});

describe("cursor", () => {
  it("pins and reveals the cursor where a row carries the marker", () => {
    const { tui, terminal, scheduler, provider } = boot();
    provider.viewport = [`ab${CURSOR_MARKER}cd`];
    tui.start();
    scheduler.flush();
    const output = terminal.drain();
    expect(output).toContain("\x1b[1;3H\x1b[?25h");
    expect(output).not.toContain(CURSOR_MARKER);
  });

  it("parks the cursor hidden at the anchor when no row claims it", () => {
    const { tui, terminal, scheduler, provider } = boot();
    provider.viewport = ["plain"];
    tui.start();
    scheduler.flush();
    expect(terminal.drain()).toContain("\x1b[?25l\x1b[1;1H");
  });
});

describe("scrollback reset", () => {
  it("erases screen and scrollback and asks the surface to replay", () => {
    const { tui, terminal, scheduler, provider } = boot();
    tui.start();
    scheduler.flush();
    terminal.drain();
    tui.requestRender({ force: true, clearScrollback: true });
    scheduler.flush();
    expect(terminal.drain()).toContain("\x1b[H\x1b[2J\x1b[3J");
    expect(provider.replays).toBe(1);
  });
});

describe("resize", () => {
  it("rebuilds scrollback once a width change settles", () => {
    const { tui, terminal, scheduler, provider } = boot();
    tui.start();
    scheduler.flush();
    terminal.drain();

    terminal.columns = 60;
    terminal.resize();
    scheduler.flush(4);
    expect(provider.replays).toBe(1);
    expect(terminal.drain()).toContain("\x1b[2J\x1b[3J");
  });

  it("repaints without touching scrollback for a height-only change", () => {
    const { tui, terminal, scheduler, provider } = boot();
    tui.start();
    scheduler.flush();
    terminal.drain();

    terminal.rows = 20;
    terminal.resize();
    scheduler.flush(4);
    expect(provider.replays).toBe(0);
    expect(terminal.drain()).not.toContain("\x1b[3J");
  });

  it("honours the preserve mode for width changes too", () => {
    const { tui, terminal, scheduler, provider } = boot();
    tui.setResizeScrollback("preserve");
    tui.start();
    scheduler.flush();
    terminal.drain();

    terminal.columns = 60;
    terminal.resize();
    scheduler.flush(4);
    expect(provider.replays).toBe(0);
  });
});

describe("slow links", () => {
  it("defers a frame while the device has a large backlog", () => {
    const { tui, terminal, scheduler, provider } = boot();
    tui.start();
    scheduler.flush();
    terminal.drain();

    terminal.pending = 512 * 1024;
    provider.viewport = ["changed"];
    tui.requestRender();
    scheduler.flush(1);
    expect(terminal.drain()).toBe("");

    terminal.pending = 0;
    scheduler.flush(2);
    expect(terminal.drain()).toContain("changed");
  });
});

describe("input ownership", () => {
  it("forwards device input to subscribers", () => {
    const { tui, terminal, scheduler } = boot();
    const seen: string[] = [];
    tui.onInput((data) => seen.push(data));
    tui.start();
    scheduler.flush();
    terminal.input("abc");
    expect(seen).toEqual(["abc"]);
  });
});
