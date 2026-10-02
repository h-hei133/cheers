import { PassThrough } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { QUERY_APPEARANCE, STOP_APPEARANCE } from "./input/appearance.js";
import { Terminal } from "./terminal.js";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it("disables keyboard reports before draining and restores raw mode only afterward", async () => {
  vi.useFakeTimers();
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn() });
  vi.spyOn(process, "stdin", "get").mockReturnValue(input as unknown as NodeJS.ReadStream);
  const terminal = new Terminal();
  const write = vi.spyOn(terminal, "write").mockImplementation(() => {});
  const sync = vi.spyOn(terminal, "writeSync").mockImplementation(() => {});
  const forwarded = vi.fn();
  terminal.start(forwarded, () => {}, () => {});
  try {
    input.emit("data", "\x1b[?1u");
    const draining = terminal.drainInput();
    expect(sync).toHaveBeenCalledWith("\x1b[<u" + STOP_APPEARANCE);
    input.emit("data", "\x1b[13;1:3u");
    expect(forwarded).not.toHaveBeenCalled();
    expect(input.setRawMode).not.toHaveBeenCalledWith(false);
    await vi.advanceTimersByTimeAsync(50);
    await draining;
    terminal.stop();
    expect(input.setRawMode).toHaveBeenLastCalledWith(false);
    expect(sync.mock.calls.filter(([s]) => s.includes("\x1b[<u"))).toHaveLength(1);
    write.mockClear();
    terminal.start(forwarded, () => {}, () => {});
    input.emit("data", "\x1b[?1u");
    expect(write.mock.calls.some(([s]) => s.includes("\x1b[>5u"))).toBe(true);
  } finally {
    terminal.stop();
    input.destroy();
  }
});


it("queries appearance on each start and disables reports on stop and crash restore", () => {
  vi.useFakeTimers();
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn() });
  vi.spyOn(process, "stdin", "get").mockReturnValue(input as unknown as NodeJS.ReadStream);
  vi.spyOn(process, "stdout", "get").mockReturnValue(Object.assign(new PassThrough(), { isTTY: true }) as unknown as NodeJS.WriteStream);
  const terminal = new Terminal({ hasTrueColor: true, has256Color: true, supportsDec2026Sync: true,
    supportsKittyKeyboard: false, supportsBracketedPaste: true, insideMultiplexer: false });
  const write = vi.spyOn(terminal, "write").mockImplementation(() => {});
  const sync = vi.spyOn(terminal, "writeSync").mockImplementation(() => {});
  try {
    terminal.start(() => {}, () => {}, () => {});
    expect(write).toHaveBeenCalledWith(QUERY_APPEARANCE);
    terminal.stop();
    expect(sync.mock.lastCall?.[0]).toContain(STOP_APPEARANCE);
    write.mockClear();
    terminal.start(() => {}, () => {}, () => {});
    expect(write).toHaveBeenCalledWith(QUERY_APPEARANCE);
    terminal.restoreSync();
    expect(sync.mock.lastCall?.[0]).toContain(STOP_APPEARANCE);
  } finally { terminal.stop(); input.destroy(); }
});
