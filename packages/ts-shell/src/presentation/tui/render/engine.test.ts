import { ENABLE_MOUSE, DISABLE_MOUSE, ENABLE_MOUSE_MOTION, DISABLE_MOUSE_MOTION } from '../input/mouse.js';
import { describe, expect, it, vi } from "vitest";
import { TUI } from "./engine.js";
import { CURSOR_MARKER } from "./paint.js";
import type { FrameLayout, TerminalFramePlan, TerminalFrameProvider, ViewportSize } from "./frame.js";
import { ManualScheduler, RecordingTerminal } from "../../../test-utils/terminalDouble.js";

class StubProvider implements TerminalFrameProvider {
  rows: string[] = ["row"];
  /** The fixed block at the end of the frame, for the screen that redraws it. */
  chrome: string[] = [];
  layouts: FrameLayout[] = [];
  fullScreen = false;
  pointerMotion = false;

  renderFrame(_dimensions: ViewportSize, layout: FrameLayout = "viewport"): TerminalFramePlan {
    this.layouts.push(layout);
    if (this.chrome.length === 0) return { rows: this.rows, fullScreen: this.fullScreen, pointerMotion: this.pointerMotion };
    return {
      rows: [...this.rows, ...this.chrome],
      chromeRows: this.chrome,
    };
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
  it.each([false, true])('requests hover only for an owned picker frame and restores drag reports in alternate=%s', useAlternateScreen => {
    const { tui, terminal, provider } = boot();
    tui.start({ useAlternateScreen }); tui.renderNow(); terminal.drain();
    provider.pointerMotion = true;
    tui.renderNow();
    if (useAlternateScreen) expect(terminal.drain()).toContain(ENABLE_MOUSE_MOTION);
    else expect(terminal.drain()).not.toContain(ENABLE_MOUSE_MOTION);
    provider.fullScreen = true; tui.renderNow();
    const entered = terminal.drain();
    if (!useAlternateScreen) expect(entered).toContain(ENABLE_MOUSE_MOTION);
    // A full-screen session already owns reports even when its picker is inline.
    if (useAlternateScreen) {
      provider.pointerMotion = false; tui.renderNow(); terminal.drain();
      provider.pointerMotion = true; tui.renderNow(); expect(terminal.drain()).toContain(ENABLE_MOUSE_MOTION);
    }
    tui.renderNow(); expect(terminal.drain()).not.toContain(ENABLE_MOUSE_MOTION);
    provider.pointerMotion = false; provider.fullScreen = false; tui.renderNow();
    const restored = terminal.drain(); expect(restored).toContain(DISABLE_MOUSE_MOTION);
    expect(restored).toContain(useAlternateScreen ? ENABLE_MOUSE : DISABLE_MOUSE);
    tui.stop();
  });

  it.each(['stop', 'suspend'])('releases any-motion reports before %s and restores them only after a picker repaint', action => {
    const { tui, terminal, provider } = boot();
    tui.start(); provider.pointerMotion = true; tui.renderNow(); terminal.drain();
    if (action === 'stop') { tui.stop(); expect(terminal.drain()).toContain(DISABLE_MOUSE_MOTION); }
    else {
      tui.suspend(() => { expect(terminal.drain()).toContain(DISABLE_MOUSE_MOTION); });
      expect(terminal.drain()).not.toContain(ENABLE_MOUSE_MOTION);
      tui.renderNow(); expect(terminal.drain()).toContain(ENABLE_MOUSE_MOTION); tui.stop();
    }
  });
  it.each([false, true])('reports first layout and actual stream completion separately in alternate=%s', useAlternateScreen => {
    const { tui, terminal, scheduler } = boot();
    const layout = vi.fn(); const written = vi.fn(); const completions: Array<() => void> = [];
    vi.spyOn(terminal, 'write').mockImplementation((data, callback?: () => void) => {
      terminal.writes.push(data); if (callback) completions.push(callback);
    });
    tui.start({ useAlternateScreen, onFirstLayout: layout, onFirstWrite: written });
    expect(layout).not.toHaveBeenCalled(); expect(written).not.toHaveBeenCalled();
    scheduler.flush();
    expect(layout).toHaveBeenCalledOnce(); expect(written).not.toHaveBeenCalled();
    expect(completions).toHaveLength(1);
    completions[0]!(); expect(written).toHaveBeenCalledOnce();
    tui.renderNow(); expect(layout).toHaveBeenCalledOnce(); expect(completions).toHaveLength(1);
    tui.stop();
  });

  it('does not report invalid layouts or an obsolete write after restarting the renderer', () => {
    const { tui, terminal } = boot(); const oldWrite = vi.fn(); const nextWrite = vi.fn(); const layout = vi.fn();
    const completions: Array<() => void> = [];
    vi.spyOn(terminal, 'write').mockImplementation((_data, callback?: () => void) => { if (callback) completions.push(callback); });
    tui.start({ onFirstLayout: layout, onFirstWrite: oldWrite });
    terminal.columns = 0; tui.renderNow(); expect(layout).not.toHaveBeenCalled();
    terminal.columns = 40; tui.renderNow(); expect(layout).toHaveBeenCalledOnce();
    tui.stop(); tui.start({ onFirstWrite: nextWrite });
    completions[0]!(); expect(oldWrite).not.toHaveBeenCalled(); expect(nextWrite).not.toHaveBeenCalled();
    tui.renderNow(); completions[1]!(); expect(nextWrite).toHaveBeenCalledOnce(); tui.stop();
  });

  it("borrows a screen for paging and resumes history without duplicating it", () => {
    const { tui, terminal, provider } = boot();
    tui.start({ useAlternateScreen: false });
    provider.rows = ["history"];
    tui.renderNow();
    terminal.drain();

    provider.fullScreen = true;
    provider.rows = ["page one"];
    tui.renderNow();
    const entered = terminal.drain();
    expect(entered).toContain("\x1b[?1049h");
    expect(entered).toContain(ENABLE_MOUSE);
    provider.rows = ["page two"];
    tui.renderNow();
    const page = terminal.drain();
    expect(page).toContain("page two");
    expect(page).not.toContain("\x1b[?1049h");
    expect(page).not.toContain("page two\r\n");

    provider.fullScreen = false;
    provider.rows = ["history", "new content"];
    tui.renderNow();
    const restored = terminal.drain();
    expect(restored).toContain("\x1b[?1049l");
    expect(restored).toContain(DISABLE_MOUSE);
    expect(restored).not.toContain("history");
    expect(restored).toContain("new content");
  });

  it.each(["stop", "suspend"])("releases a borrowed screen before %s", (action) => {
    const { tui, terminal, provider } = boot();
    tui.start({ useAlternateScreen: false });
    tui.renderNow();
    provider.fullScreen = true;
    provider.rows = ["reader"];
    tui.renderNow();
    terminal.drain();
    if (action === "stop") tui.stop();
    else tui.suspend(() => {
      const released = terminal.drain();
      expect(released).toContain("\x1b[?1049l"); expect(released).toContain(DISABLE_MOUSE);
    });
    if (action === "stop") {
      const released = terminal.drain();
      expect(released).toContain("\x1b[?1049l"); expect(released).toContain(DISABLE_MOUSE);
    }
    else {
      tui.renderNow();
      const resumed = terminal.drain();
      expect(resumed).toContain("\x1b[?1049h"); expect(resumed).toContain(ENABLE_MOUSE);
    }
  });

  it("does not nest alternate screens for an overlay in a full-screen session", () => {
    const { tui, terminal, provider } = boot();
    tui.start();
    tui.renderNow();
    terminal.drain();
    provider.fullScreen = true;
    tui.renderNow();
    provider.fullScreen = false;
    tui.renderNow();
    expect(terminal.drain()).not.toMatch(/\x1b\[\?1049[hl]/);
  });

  it.each([false, true])("requests one layout before rendering (alternate screen: %s)", (useAlternateScreen) => {
    const { tui, provider } = boot();
    tui.start({ useAlternateScreen });
    tui.renderNow();

    expect(provider.layouts).toEqual([useAlternateScreen ? "viewport" : "document"]);
  });

  it("does not write the transcript again after a child had the terminal", () => {
    // An external editor runs inside `suspend`, and the session comes back to
    // the same screen. Appending the document a second time there is invisible
    // until the user scrolls back and finds the conversation twice — and the
    // child's own output is what a user reads to know the editor ran at all.
    const { tui, terminal, provider } = boot();
    tui.start({ useAlternateScreen: false });
    provider.rows = ["t1", "t2"];
    provider.chrome = ["chrome"];
    tui.renderNow();
    terminal.drain();

    tui.suspend(() => {});
    tui.renderNow();

    const written = terminal.drain();
    expect(written).not.toContain("t1");
    expect(written).not.toContain("t2");
    // The block is redrawn, because the handoff erased it and the session comes
    // back to a screen that still needs one.
    expect(written).toContain("chrome");
  });

  it("still takes the alternate screen again after a child", () => {
    // The other mode's answer is the opposite one: the child drew over the
    // private screen, so it is taken again and the frame is a full repaint.
    const { tui, terminal, scheduler } = boot();
    tui.start();
    scheduler.flush();
    terminal.drain();

    tui.suspend(() => {});
    scheduler.flush();
    tui.renderNow();

    expect(terminal.drain()).toContain("\x1b[?1049h");
  });

  it("does not take the alternate screen when asked not to", () => {
    // What `tuiMode: "regular"` selects: no screen is taken, so none has to be
    // given back and the conversation stays in the scrollback.
    const { tui, terminal, scheduler } = boot();
    tui.start({ useAlternateScreen: false });
    scheduler.flush();

    expect(terminal.drain()).not.toContain("\x1b[?1049h");
  });

  it("leaves wheel and drag ownership with the terminal on its own screen", () => {
    const { tui, terminal, scheduler } = boot();
    tui.start({ useAlternateScreen: false });
    scheduler.flush();

    const output = terminal.drain();
    expect(output).not.toContain("\x1b[?1002h");
    expect(output).not.toContain("\x1b[?1006h");
  });

  it.each([false, true])("restores mouse ownership after a child (alternate screen: %s)", (useAlternateScreen) => {
    const { tui, terminal, scheduler } = boot();
    tui.start({ useAlternateScreen });
    scheduler.flush();
    terminal.drain();

    tui.suspend(() => {});
    scheduler.flush();

    expect(terminal.drain().includes("\x1b[?1002h")).toBe(useAlternateScreen);
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

  it("keeps one pending frame when a request lands after the immediate ran", () => {
    // Every streamed token asks for a frame. The immediate-coalescing only folds
    // requests made in one tick: a request arriving in the next tick — which is
    // what a provider chunk does — queues its own immediate, and that immediate
    // used to schedule a second frame timer without cancelling the first. Both
    // then fired, each composing the whole screen, so the delay was not a
    // throttle at all.
    const terminal = new RecordingTerminal();
    const immediates: Array<() => void> = [];
    const timers: Array<{ id: number; run: () => void }> = [];
    let nextId = 1;
    const scheduler = {
      setTimeout: (callback: () => void) => { const id = nextId++; timers.push({ id, run: callback }); return id; },
      clearTimeout: (handle: unknown) => {
        const at = timers.findIndex(entry => entry.id === handle);
        if (at >= 0) timers.splice(at, 1);
      },
      setImmediate: (callback: () => void) => { immediates.push(callback); return nextId++; },
      now: () => 0,
    };
    const provider = new StubProvider();
    const tui = new TUI(terminal, scheduler);
    tui.setFrameProvider(provider);
    tui.start();
    while (immediates.length) immediates.shift()!();
    timers.length = 0;
    provider.layouts.length = 0;

    tui.requestRender();
    immediates.shift()!();            // first request schedules its frame timer
    expect(timers).toHaveLength(1);
    tui.requestRender();              // next tick, before that frame is painted
    immediates.shift()!();
    expect(timers).toHaveLength(1);   // still one pending frame, not two
    while (timers.length) timers.shift()!.run();

    expect(provider.layouts).toHaveLength(1);
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
  it("consumes markers across the regular screen, borrowed overlay, and restored editor", () => {
    const { tui, terminal, provider } = boot();
    const chrome = [`prompt${CURSOR_MARKER}more`, 'hint'];
    provider.rows = ['history']; provider.chrome = chrome;
    tui.start({ useAlternateScreen: false }); tui.renderNow();
    const initial = terminal.drain();
    expect(initial).not.toContain(CURSOR_MARKER);
    expect(initial).toContain('\x1b[6C\x1b[?25h');
    provider.fullScreen = true; provider.chrome = []; provider.rows = [`overlay${CURSOR_MARKER}`];
    tui.renderNow(); const overlay = terminal.drain();
    expect(overlay).not.toContain(CURSOR_MARKER);
    expect(overlay).toContain('\x1b[1;8H');
    provider.fullScreen = false; provider.rows = ['history']; provider.chrome = chrome;
    tui.renderNow(); const restored = terminal.drain();
    expect(restored).not.toContain(CURSOR_MARKER);
    expect(restored).not.toContain('history');
    expect(restored).toContain('\x1b[6C\x1b[?25h');
    tui.stop();
  });

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

  it("places an image that scrolls back into view rather than resending it", () => {
    // The terminal still holds the pixels while the row is off screen, so the
    // registry is the session's, not the previous frame's viewport: rebuilding
    // it from the visible rows resent the whole payload on every return.
    const { tui, terminal, scheduler, provider } = boot();
    const image = "image row \x1b_Ga=T,f=100,q=2,c=10,i=11;QUJD\x1b\\";
    provider.rows = [image, "under it"];
    tui.start();
    scheduler.flush();
    expect(terminal.drain()).toContain("QUJD");

    // Scroll it off: only the other row remains.
    provider.rows = ["under it"];
    tui.requestRender();
    scheduler.flush();
    terminal.drain();
    // Scroll back: the row returns and must be placed, not retransmitted.
    provider.rows = ["under it", image];
    tui.requestRender();
    scheduler.flush();
    const bytes = terminal.drain();
    expect(bytes).toContain("a=p");
    expect(bytes).not.toContain("QUJD");
  });

  it("frees offscreen images once the session holds more than the budget", () => {
    // Kitty holds every image until it is deleted, so without a budget an
    // afternoon of screenshots is an afternoon of decoded pixels the terminal
    // never releases. Past the cap, the offscreen ones are freed oldest-first.
    const { tui, terminal, scheduler, provider } = boot();
    tui.start();
    scheduler.flush();
    // Each image passes through the viewport alone, so all but the last are
    // offscreen by the time the budget is next tested.
    const imageRow = (index: number): string =>
      `row ${index} \x1b_Ga=T,f=100,q=2,c=4,i=${2000 + index};${"QUJD".repeat(4)}\x1b\\`;
    for (let index = 0; index < 60; index += 1) {
      provider.rows = [imageRow(index)];
      tui.renderNow();
    }
    scheduler.flush();

    const bytes = terminal.drain();
    const deletions = bytes.match(/\x1b_Ga=d,d=i,i=\d+/g) ?? [];
    // 60 images, a budget of 32 offscreen plus the one on screen: the rest go.
    expect(deletions.length).toBeGreaterThan(0);
    expect(deletions.length).toBeLessThan(60);
  });

  it("frees the terminal's images when the session gives the screen back", () => {
    // Kitty keeps a transmitted image until it is deleted or the emulator
    // exits, so a session that ends without saying so leaves the process's
    // pixels behind for the whole emulator lifetime.
    const { tui, terminal, scheduler, provider } = boot();
    provider.rows = ["image row \x1b_Ga=T,f=100,q=2,c=10,i=13;QUJD\x1b\\"];
    tui.start();
    scheduler.flush();
    terminal.drain();

    tui.stop();
    expect(terminal.drain()).toContain("\x1b_Ga=d,d=A");
  });

  it("forgets image ids across a child process, which may clear the screen", () => {
    // The child owns the screen and may erase it. Freeing the images says so to
    // the terminal, and forgetting the ids makes the next frame transmit them
    // again — a remembered id would be re-placed onto an emptied slot, showing a
    // blank row where a picture was.
    const { tui, terminal, scheduler, provider } = boot();
    const image = "image row \x1b_Ga=T,f=100,q=2,c=10,i=17;QUJD\x1b\\";
    provider.rows = [image];
    tui.start();
    scheduler.flush();
    expect(terminal.drain()).toContain("QUJD");

    tui.suspend(() => {});
    scheduler.flush();
    const afterChild = terminal.drain();
    // Freed, and then sent again because the id is no longer remembered.
    expect(afterChild).toContain("\x1b_Ga=d,d=A");
    expect(afterChild).toContain("QUJD");
    // And the frame after that places it, since this one just transmitted it.
    tui.renderNow();
    expect(terminal.drain()).not.toContain("QUJD");
  });
});

/** The bytes the terminal has received so far, joined for substring checks. */
function transmittedBytes(terminal: RecordingTerminal): string {
  return terminal.writes.join("");
}
