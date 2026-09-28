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

describe("keeping the terminal's own screen", () => {
  it("does not take the alternate screen when asked not to", () => {
    // What `tuiMode: "regular"` selects: no screen is taken, so none has to be
    // given back and the conversation stays in the scrollback.
    const { tui, terminal, scheduler } = boot();
    tui.start({ useAlternateScreen: false });
    scheduler.flush();

    expect(terminal.drain()).not.toContain("\x1b[?1049h");
  });

  it("still asks for the mouse on the terminal's own screen", () => {
    const { tui, terminal, scheduler } = boot();
    tui.start({ useAlternateScreen: false });
    scheduler.flush();

    expect(terminal.drain()).toContain("\x1b[?1002h");
  });

  it("keeps content out of the alternate screen's full repaint", () => {
    // On this screen the frame is appended, never repainted from the top, so the
    // rows that scrolled past stay where the terminal put them.
    const { tui, terminal, scheduler, provider } = boot();
    tui.start({ useAlternateScreen: false });
    provider.rows = ["content", "chrome"];
    tui.renderNow();
    terminal.drain();
    tui.renderNow();

    expect(terminal.drain()).not.toContain("\x1b[2J");
  });

  it("takes the alternate screen by default", () => {
    const { tui, terminal, scheduler } = boot();
    tui.start();
    scheduler.flush();

    expect(terminal.drain()).toContain("\x1b[?1049h");
  });
});

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

  it("leaves the document under the restored screen, one row per line", () => {
    const { tui, terminal, scheduler } = boot();
    tui.start();
    scheduler.flush();
    terminal.drain();
    tui.stop({ document: ["first row", `second ${CURSOR_MARKER}row`, ""] });
    const written = terminal.drain();

    const left = written.indexOf("\x1b[?1049l");
    expect(left).toBeGreaterThan(-1);
    const document = written.slice(left);
    expect(document).toContain("\x1b[?7l\r\x1b[2Kfirst row");
    expect(document).toContain("\r\n\r\x1b[2Ksecond row");
    expect(document).not.toContain(CURSOR_MARKER);
    // The tail: reset, autowrap back on, a fresh line, and the cursor shown.
    expect(document).toMatch(/\x1b\[0m\x1b\[\?7h\r\n\x1b\[\?25h\x1b\[\?2026l$/);
  });

  it("fits document rows to the width the same way a frame is fitted", () => {
    const { tui, terminal, scheduler } = boot();
    terminal.columns = 10;
    tui.start();
    scheduler.flush();
    terminal.drain();
    tui.stop({ document: ["0123456789abcdef"] });
    const written = terminal.drain();
    expect(written).toContain("012345678…");
    expect(written).not.toContain("9abcdef");
  });

  it("only gives the screen back when there is no document", () => {
    const { tui, terminal, scheduler } = boot();
    tui.start();
    scheduler.flush();
    terminal.drain();
    tui.stop();
    const written = terminal.drain();
    expect(written).toContain("\x1b[?1049l");
    expect(written).not.toContain("\x1b[2K");
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

describe("disconnect lifecycle", () => {
  it("delegates terminal disconnect to the host handler", () => {
    const { tui, terminal, scheduler } = boot();
    let hostCleaned = 0;
    tui.setDisconnectHandler(() => {
      hostCleaned += 1;
      tui.stop();
    });
    tui.start();
    scheduler.flush();
    terminal.disconnect();
    expect(hostCleaned).toBe(1);
    expect(terminal.stopped).toBe(true);
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

describe("lifecycle stress", () => {
  it("coalesces repeated resize requests into bounded repaint work", () => {
    const { tui, terminal, scheduler } = boot();
    tui.start();
    scheduler.flush();
    terminal.drain();
    for (let index = 0; index < 100; index++) {
      terminal.columns = 20 + (index % 40);
      terminal.resize();
    }
    scheduler.flush();
    expect(terminal.writes.length).toBeLessThan(6);
  });

  it("keeps repeated disconnect and stop idempotent", () => {
    const { tui, terminal, scheduler } = boot();
    let cleanups = 0;
    tui.setDisconnectHandler(() => {
      cleanups += 1;
      tui.stop();
    });
    tui.start();
    scheduler.flush();
    terminal.disconnect();
    tui.stop();
    tui.stop();
    expect(cleanups).toBe(1);
    expect(terminal.stopped).toBe(true);
  });

  it("prepares a long exit document within a bounded budget", () => {
    const { tui, terminal, scheduler, provider } = boot();
    provider.rows = Array.from({ length: 2000 }, (_, index) => `history row ${index}`);
    tui.start();
    scheduler.flush();
    terminal.drain();
    const started = scheduler.now();
    tui.stop({ document: provider.rows });
    const elapsed = scheduler.now() - started;
    expect(terminal.drain()).toContain("\x1b[?1049l");
    expect(elapsed).toBeLessThan(1000);
  });
  it("ignores render requests after disconnect", () => {
    const { tui, terminal, scheduler } = boot();
    tui.start();
    scheduler.flush();
    terminal.drain();
    terminal.disconnect();
    terminal.drain();
    tui.requestRender({ force: true });
    scheduler.flush();
    expect(terminal.drain()).toBe("");
  });
});

describe("handing the terminal to a child process", () => {
  it("gives the terminal back before the child runs", () => {
    // The child is an editor, and an editor cannot start inside raw mode on a
    // screen this surface owns: no echo, no line editing, and output the next
    // frame overwrites.
    const { tui, terminal, scheduler } = boot();
    tui.start();
    scheduler.flush();
    terminal.drain();

    let stoppedDuringChild = false;
    tui.suspend(() => {
      stoppedDuringChild = terminal.stopped;
    });

    expect(stoppedDuringChild).toBe(true);
    expect(terminal.drain()).toContain("\x1b[?1049l");
  });

  it("takes the terminal back afterwards", () => {
    const { tui, terminal, scheduler } = boot();
    tui.start();
    scheduler.flush();
    terminal.drain();

    tui.suspend(() => {});
    scheduler.flush();

    // Stopped for the child, then started again for the session.
    expect(terminal.stopped).toBe(false);
    expect(terminal.drain()).toContain("\x1b[?1049h");
  });

  it("takes the terminal back when the child throws", () => {
    // The failure that matters is not the child failing — it is the child failing
    // and leaving the session with no terminal, which reads as a hang.
    const { tui, terminal, scheduler } = boot();
    tui.start();
    scheduler.flush();
    terminal.drain();

    expect(() => tui.suspend(() => {
      throw new Error("child died");
    })).toThrow("child died");

    scheduler.flush();
    expect(terminal.stopped).toBe(false);
    expect(terminal.drain()).toContain("\x1b[?1049h");
  });

  it("leaves a screen it never took alone", () => {
    // `tuiMode: "regular"` keeps the conversation in the terminal's own
    // scrollback, so there is no screen to hand over.
    const { tui, terminal, scheduler } = boot();
    tui.start({ useAlternateScreen: false });
    scheduler.flush();
    terminal.drain();

    tui.suspend(() => {});
    scheduler.flush();

    expect(terminal.drain()).not.toContain("\x1b[?1049");
  });

  it("repaints fully afterwards rather than diffing against rows the child erased", () => {
    const { tui, terminal, scheduler, provider } = boot();
    tui.start();
    provider.rows = ["before"];
    tui.renderNow();
    scheduler.flush();
    terminal.drain();

    tui.suspend(() => {});
    provider.rows = ["after"];
    scheduler.flush();
    tui.renderNow();

    // A diff would leave the old row in place; a full paint clears first.
    expect(terminal.drain()).toContain("\x1b[J");
  });

  it("runs the child even when the session is not started", () => {
    // Nothing to hand over, so the call is a plain passthrough.
    const { tui } = boot();
    expect(tui.suspend(() => "ran")).toBe("ran");
  });
});

describe("kitty image rows under redraw", () => {
  it("sends the payload once and places it on every later paint", () => {
    const { tui, terminal, scheduler, provider } = boot();
    const transmitted =
      "text before \x1b_Ga=T,f=100,q=2,c=10,i=7;QUJD\x1b\\ text after";
    provider.rows = [transmitted];

    tui.start();
    scheduler.flush();
    const bytesAfterFirst = transmittedBytes(terminal);
    expect(bytesAfterFirst).toContain("QUJD");

    // Scroll: the row moves position, so the diff rewrites it. The rewrite
    // must place image 7, not resend the bytes.
    provider.rows = ["", transmitted];
    tui.requestRender();
    scheduler.flush();
    const bytesAfterSecond = transmittedBytes(terminal);
    expect(bytesAfterSecond).toContain("a=p");
    // And the payload left the process exactly once, in the first paint.
    expect(bytesAfterSecond.split("QUJD").length).toBe(bytesAfterFirst.split("QUJD").length);
  });
});

/** The bytes the terminal has received so far, joined for substring checks. */
function transmittedBytes(terminal: RecordingTerminal): string {
  return terminal.writes.join("");
}
