import { PassThrough } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
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
    expect(sync).toHaveBeenCalledWith("\x1b[<u");
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
