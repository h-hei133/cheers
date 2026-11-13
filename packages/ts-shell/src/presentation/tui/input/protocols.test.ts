import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CELL_SIZE_QUERY, detectHyperlinkSupport, parseCellSizeResponse, stripOsc133ZonePrefix } from "./cellSize.js";
import {
  formatProgramStatus,
  isProgramStatusReply,
  PROGRAM_STATUS_QUERY,
  TERMINAL_PROGRESS_ACTIVE,
  TERMINAL_PROGRESS_CLEAR,
  TERMINAL_PROGRESS_KEEPALIVE_MS,
} from "./programStatus.js";
import { StdinBuffer } from "./stdinBuffer.js";
import { parseOscColorResponse, parseOscColorValue, PendingColorQuery } from "./terminalColors.js";
import { getCellDimensions, setCellDimensions } from "../imageDimensions.js";
import { prepareRow } from "../render/paint.js";
import { LINE_TERMINATOR } from "../text/sgr.js";
import { Terminal } from "../terminal.js";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  setCellDimensions({ widthPx: 9, heightPx: 18 });
});

describe("program status (OSC 7501) and progress (OSC 9;4)", () => {
  it("formats status with sanitized base64 message and validates replies", () => {
    const seq = formatProgramStatus({
      state: "blocked",
      app: "cheers",
      kind: "permission",
      message: "Need\napproval\tnow",
    });
    expect(seq).toBe(`\x1b]7501;state=blocked:app=cheers:kind=permission:msg=${Buffer.from("Need approval now", "utf8").toString("base64")}\x1b\\`);
    expect(isProgramStatusReply("\x1b]7501;?\x1b\\")).toBe(true);
    expect(isProgramStatusReply("\x1b]7501;?:v=2\x07")).toBe(true);
    expect(isProgramStatusReply("\x1b]7501;state=idle\x1b\\")).toBe(false);
  });

  it("buffers pre-reply status, emits after probe reply, and clears on stop", () => {
    vi.useFakeTimers();
    const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn(), fd: 0 as const });
    vi.spyOn(process, "stdin", "get").mockReturnValue(input as unknown as NodeJS.ReadStream & { fd: 0 });
    vi.spyOn(process, "stdout", "get").mockReturnValue(Object.assign(new PassThrough(), { isTTY: true, fd: 1 as const }) as unknown as NodeJS.WriteStream & { fd: 1 });
    const terminal = new Terminal({
      hasTrueColor: true,
      has256Color: true,
      supportsDec2026Sync: true,
      supportsKittyKeyboard: false,
      supportsBracketedPaste: true,
      insideMultiplexer: false,
    });
    const write = vi.spyOn(terminal, "write").mockImplementation(() => {});
    const sync = vi.spyOn(terminal, "writeSync").mockImplementation(() => {});
    const forwarded = vi.fn();
    try {
      terminal.start(forwarded, () => {}, () => {});
      expect(write).toHaveBeenCalledWith(PROGRAM_STATUS_QUERY);

      terminal.setProgramStatus({ state: "working", app: "cheers" });
      expect(write.mock.calls.some(([s]) => s.includes("7501;state=working"))).toBe(false);

      input.push("\x1b]7501;?\x1b\\");
      expect(forwarded).not.toHaveBeenCalled();
      expect(write).toHaveBeenCalledWith("\x1b]7501;state=working:app=cheers\x1b\\");

      terminal.stop();
      expect(sync.mock.lastCall?.[0]).toContain("\x1b]7501;state=clear:app=cheers\x1b\\");
    } finally {
      terminal.stop();
      input.destroy();
    }
  });

  it("emits OSC 9;4;3 keepalives while active and clears on stop", () => {
    vi.useFakeTimers();
    const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn(), fd: 0 as const });
    vi.spyOn(process, "stdin", "get").mockReturnValue(input as unknown as NodeJS.ReadStream & { fd: 0 });
    vi.spyOn(process, "stdout", "get").mockReturnValue(Object.assign(new PassThrough(), { isTTY: true, fd: 1 as const }) as unknown as NodeJS.WriteStream & { fd: 1 });
    const terminal = new Terminal();
    const write = vi.spyOn(terminal, "write").mockImplementation(() => {});
    const sync = vi.spyOn(terminal, "writeSync").mockImplementation(() => {});
    try {
      terminal.start(() => {}, () => {}, () => {});
      terminal.setProgress(true);
      expect(write).toHaveBeenCalledWith(TERMINAL_PROGRESS_ACTIVE);

      vi.advanceTimersByTime(TERMINAL_PROGRESS_KEEPALIVE_MS * 2);
      const keepalives = write.mock.calls.filter(([s]) => s === TERMINAL_PROGRESS_ACTIVE);
      expect(keepalives.length).toBeGreaterThanOrEqual(3);

      terminal.stop();
      expect(sync.mock.lastCall?.[0]).toContain(TERMINAL_PROGRESS_CLEAR);
    } finally {
      terminal.stop();
      input.destroy();
    }
  });
});

describe("terminal color queries (OSC 10/11/4)", () => {
  it("parses 16-bit and 8-bit X11 color responses", () => {
    expect(parseOscColorResponse("\x1b]10;rgb:ffff/8080/0000\x1b\\")).toEqual({
      kind: "foreground",
      color: { r: 255, g: 128, b: 0 },
    });
    expect(parseOscColorResponse("\x1b]11;#112233\x07")).toEqual({
      kind: "background",
      color: { r: 17, g: 34, b: 51 },
    });
    expect(parseOscColorResponse("\x1b]4;15;rgb:ff/00/aa\x1b\\")).toEqual({
      kind: "palette",
      index: 15,
      color: { r: 255, g: 0, b: 170 },
    });
  });

  it("collects colors fenced by DA1 and preserves late replies", () => {
    vi.useFakeTimers();
    let resolved: unknown;
    const late: unknown[] = [];
    const query = new PendingColorQuery((colors) => { resolved = colors; }, {
      timeoutMs: 200,
      onLateReply: (colors) => late.push(colors),
    });

    expect(query.consume("\x1b]10;#ffffff\x1b\\")).toBe(true);
    expect(query.consume("\x1b[?62;22c")).toBe(true);
    expect(resolved).toEqual({ foreground: { r: 255, g: 255, b: 255 } });
    expect(query.consume("\x1b[?62;22c")).toBe(false);
    expect(query.consume("\x1b]11;#000000\x1b\\")).toBe(true);
    expect(late).toEqual([{ foreground: { r: 255, g: 255, b: 255 }, background: { r: 0, g: 0, b: 0 } }]);
    expect(parseOscColorValue("#1g2h3i")).toBeUndefined();
    expect(parseOscColorValue("ff/00/00")).toBeUndefined();
  });

  it("resolves queryTerminalColors on stop(), handles split replies, and forwards live OSC 11 afterward", async () => {
    vi.useFakeTimers();
    const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn(), fd: 0 as const });
    vi.spyOn(process, "stdin", "get").mockReturnValue(input as unknown as NodeJS.ReadStream & { fd: 0 });
    vi.spyOn(process, "stdout", "get").mockReturnValue(Object.assign(new PassThrough(), { isTTY: true, fd: 1 as const }) as unknown as NodeJS.WriteStream & { fd: 1 });
    const terminal = new Terminal();
    vi.spyOn(terminal, "write").mockImplementation(() => {});
    vi.spyOn(terminal, "writeSync").mockImplementation(() => {});
    const stdin = new StdinBuffer();
    const appearances: string[] = [];
    stdin.onAppearance((a) => appearances.push(a));
    try {
      terminal.start((chunk) => stdin.feed(chunk), () => {}, () => {});
      input.push("\x1b[?1u");
      const pending = terminal.queryTerminalColors({ timeoutMs: 5000 });
      input.push("\x1b]10;#1122");
      input.push("33\x1b\\\x1b[?62c");
      expect(await pending).toEqual({ foreground: { r: 17, g: 34, b: 51 } });

      // Subsequent DEC 2031 live theme report still reaches StdinBuffer/AppearanceReports
      input.push("\x1b]11;#ffffff\x07");
      expect(appearances).toEqual(["light"]);

      // Stopped query resolves immediately without hanging
      const cancelled = terminal.queryTerminalColors({ timeoutMs: 5000 });
      terminal.stop();
      expect(await cancelled).toEqual({});
    } finally {
      stdin.dispose();
      terminal.stop();
      input.destroy();
    }
  });
});

describe("CSI 16t cell size, OSC 133 stripping, and hyperlink probing", () => {
  it("updates cell dimensions through StdinBuffer without emitting keystrokes", () => {
    const buffer = new StdinBuffer();
    const keys: unknown[] = [];
    const sizes: unknown[] = [];
    buffer.onKey((k) => keys.push(k));
    buffer.onCellSize((s) => sizes.push(s));

    buffer.feed("\x1b[6;24;12t");
    expect(keys).toEqual([]);
    expect(sizes).toEqual([{ widthPx: 12, heightPx: 24 }]);
    expect(getCellDimensions()).toEqual({ widthPx: 12, heightPx: 24 });
    expect(parseCellSizeResponse("\x1b[6;0;10t")).toBeUndefined();
    expect(CELL_SIZE_QUERY).toBe("\x1b[16t");
    buffer.dispose();
  });

  it("strips leading OSC 133 shell prompt zones in prepareRow", () => {
    const raw = "\x1b]133;A\x07\x1b]133;B\x1b\\hello";
    expect(stripOsc133ZonePrefix(raw)).toBe("hello");
    expect(prepareRow(raw, 10)).toBe(`hello${LINE_TERMINATOR}`);
  });

  it("respects hyperlink env overrides without spawning tmux", () => {
    expect(detectHyperlinkSupport({ TERM: "xterm-256color", TSSHELL_TUI_HYPERLINKS: "0" }, false)).toBe(false);
    expect(detectHyperlinkSupport({ TERM: "xterm-256color", PI_HYPERLINKS: "1", TMUX: "/tmp/tmux" }, true)).toBe(true);
    expect(detectHyperlinkSupport({ TERM: "dumb" }, false)).toBe(false);
  });

  it("recovers from interrupted OSC 10/4/7501 reports and clears all listeners on dispose", () => {
    const buffer = new StdinBuffer();
    const keys: string[] = [];
    const pastes: string[] = [];
    const cellSpy = vi.fn();
    buffer.onKey((k) => keys.push(k.keyId));
    buffer.onPaste((text) => pastes.push(text));
    buffer.onCellSize(cellSpy);
    buffer.feed("\x1b]10;incomplete\x1b[200~ok\x1b[201~x");
    buffer.flush();
    expect(pastes).toEqual(["ok"]);
    expect(keys).toEqual(["x"]);
    buffer.dispose();
    buffer.feed("\x1b[6;20;10t");
    expect(cellSpy).not.toHaveBeenCalled();
  });
});
