import { describe, expect, it } from "vitest";
import { detectImageProtocol, inlineImageSequence } from "./image.js";

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
