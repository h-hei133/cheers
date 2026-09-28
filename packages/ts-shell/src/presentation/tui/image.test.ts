import { describe, expect, it } from "vitest";
import { visibleWidth } from "./text/measure.js";
import { detectImageProtocol, inlineImageSequence, kittyPlacementFor, swapTransmittedForPlacement, windowTitle, idleNotification, bell } from "./image.js";

/** The environment of a terminal that identifies itself, with nothing else. */
function env(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    TERM: "xterm-256color",
    ...Object.fromEntries(Object.entries(overrides).map(([k, v]) => [k, v])),
  } as NodeJS.ProcessEnv;
}

describe("image protocol detection", () => {
  it("finds kitty graphics by any of its identifying variables", () => {
    expect(detectImageProtocol(env({ KITTY_WINDOW_ID: "1" }))).toBe("kitty");
    expect(detectImageProtocol(env({ KITTY_PID: "99" }))).toBe("kitty");
    expect(detectImageProtocol(env({ TERM_PROGRAM: "kitty" }))).toBe("kitty");
    expect(detectImageProtocol(env({ TERM_PROGRAM: "ghostty" }))).toBe("kitty");
    expect(detectImageProtocol(env({ WEZTERM_PANE: "0" }))).toBe("kitty");
    expect(detectImageProtocol(env({ WARP_TERMINAL_SESSION_UUID: "x" }))).toBe("kitty");
  });

  it("finds iterm2 by its session variable", () => {
    expect(detectImageProtocol(env({ ITERM_SESSION_ID: "w0" }))).toBe("iterm2");
    expect(detectImageProtocol(env({ TERM_PROGRAM: "iTerm.app" }))).toBe("iterm2");
  });

  it("reports nothing under a multiplexer, which strips graphics on redraw", () => {
    expect(detectImageProtocol(env({ KITTY_WINDOW_ID: "1", TMUX: "/tmp/tmux" }))).toBeUndefined();
    expect(detectImageProtocol(env({ ITERM_SESSION_ID: "w0", TMUX: "/tmp/tmux" }))).toBeUndefined();
    expect(detectImageProtocol(env({ KITTY_WINDOW_ID: "1", TERM: "screen-kitty" }))).toBeUndefined();
  });

  it("reports nothing for a terminal nobody vouched for", () => {
    expect(detectImageProtocol(env())).toBeUndefined();
    expect(detectImageProtocol(env({ TERM_PROGRAM: "vscode" }))).toBeUndefined();
  });
});

describe("inline image sequences", () => {
  const small = Buffer.from("tiny").toString("base64");

  it("encodes a small kitty image in one control sequence", () => {
    const sequence = inlineImageSequence("kitty", small, { columns: 8, rows: 4 });
    expect(sequence.startsWith("\x1b_Ga=T,f=100,q=2,c=8,r=4;")).toBe(true);
    expect(sequence.endsWith("\x1b\\")).toBe(true);
    expect(sequence).toContain(small);
  });

  it("chunks a large kitty payload at 4 KiB with continuation flags", () => {
    const large = "A".repeat(4096 * 2 + 100);
    const sequence = inlineImageSequence("kitty", large);
    const parts = sequence.split("\x1b\\").filter((part) => part.length > 0);
    // First chunk opens with the full parameter list and m=1; the last closes
    // with m=0. A single unchunked sequence would carry no m flag at all.
    expect(parts[0]).toContain(",m=1;");
    expect(sequence).toContain("\x1b_Gm=0;");
  });

  it("encodes an iterm2 file sequence with size and cell sizing", () => {
    const sequence = inlineImageSequence("iterm2", small, { columns: 10, rows: 5, name: "shot.png" });
    expect(sequence.startsWith("\x1b]1337;File=inline=1;size=4;width=10;height=5;name=")).toBe(true);
    expect(sequence.endsWith(`:${small}\x07`)).toBe(true);
  });
});

describe("terminal attention sequences", () => {
  // These are byte contracts with the terminal: an OSC title, an OSC 9/777
  // notification, and a BEL. Each is one small function on the terminal's
  // write path; pinned here so no refactor changes what the terminal hears.
  it("sets the window title over OSC 0", () => {
    expect(windowTitle("cheers — my-project")).toBe("\x1b]0;cheers — my-project\x07");
  });

  it("raises an idle notification over OSC 777 and a bell over BEL", () => {
    expect(idleNotification("Turn finished")).toBe("\x1b]777;notify;cheers;Turn finished\x07");
    expect(bell()).toBe("\x07");
  });
});

describe("transmit-once placement under redraw", () => {
  it("places a transmitted kitty image instead of resending its bytes", () => {
    // First appearance: full transmission, carrying an image id.
    const first = inlineImageSequence("kitty", "QUJD", { columns: 10, imageId: 7 });
    expect(first).toContain("i=7");
    expect(first).toContain("QUJD");
    // A redraw of the same row must not carry the payload again — it says
    // "place image 7", and the bytes never leave twice.
    const again = kittyPlacementFor(first);
    expect(again).toBeDefined();
    expect(again).toContain("a=p");
    expect(again).toContain("i=7");
    expect(again).not.toContain("QUJD");
    // Zero-cell either way, so the layout the row was built for holds.
    expect(visibleWidth(again!)).toBe(0);
  });

  it("collapses a multi-chunk transmission to a single placement, leaving no payload", () => {
    // A payload past 4 KiB is sent as an initiator chunk plus continuations.
    // The placement swap has to consume the whole run: a continuation left
    // behind would reach the terminal as a stray graphics chunk with no
    // initiator and corrupt the frame.
    const big = "Q".repeat(9000);
    const transmission = inlineImageSequence("kitty", big, { columns: 10, imageId: 9 });
    expect(transmission.split("\x1b_G").length - 1).toBeGreaterThan(1);
    const placed = swapTransmittedForPlacement(`before ${transmission} after`, new Set([9]));
    expect(placed).toContain("a=p");
    expect(placed).toContain("i=9");
    // Not one byte of the payload, and not one orphaned continuation chunk.
    expect(placed).not.toContain(big.slice(0, 4096));
    expect(placed).not.toContain("m=1");
    expect(placed).not.toContain("m=0");
    // The surrounding text is untouched, and the placement holds zero cells.
    expect(placed.startsWith("before ")).toBe(true);
    expect(placed.endsWith(" after")).toBe(true);
  });

  it("leaves a transmission whose id was never placed exactly as it was", () => {
    const transmission = inlineImageSequence("kitty", "QUJD", { columns: 10, imageId: 3 });
    expect(swapTransmittedForPlacement(transmission, new Set([7]))).toBe(transmission);
  });

  it("leaves iterm2 sequences alone: that protocol has no placement mode", () => {
    const first = inlineImageSequence("iterm2", "QUJD", { columns: 10 });
    expect(kittyPlacementFor(first)).toBeUndefined();
  });
});
