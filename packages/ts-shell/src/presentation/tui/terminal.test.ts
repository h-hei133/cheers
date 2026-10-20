import { PassThrough } from "node:stream";
import { afterEach, expect, it, vi } from "vitest";
import { QUERY_APPEARANCE, STOP_APPEARANCE } from "./input/appearance.js";
import { Terminal } from "./terminal.js";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

it.each([false, true])('reports installed input only after enablement with deferred=%s', deferInput => {
  vi.useFakeTimers();
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn() });
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as NodeJS.ReadStream);
  const terminal = new Terminal(); const ready = vi.fn(() => {
    expect(input.listenerCount('data')).toBeGreaterThan(0);
    expect(input.setRawMode).toHaveBeenCalledWith(true);
  });
  vi.spyOn(terminal, 'write').mockImplementation(() => {});
  vi.spyOn(terminal, 'writeSync').mockImplementation(() => {});
  try {
    terminal.start(() => {}, () => {}, () => {}, { deferInput, onInputReady: ready });
    expect(ready).toHaveBeenCalledTimes(deferInput ? 0 : 1);
    terminal.enableInput(); terminal.enableInput(); expect(ready).toHaveBeenCalledOnce();
  } finally { terminal.stop(); input.destroy(); }
});

it('marks successful stream completion only when its callback succeeds', () => {
  const callbacks: Array<(error?: Error | null) => void> = [];
  vi.spyOn(process.stdout, 'write').mockImplementation((_data, callback: unknown) => {
    callbacks.push(callback as (error?: Error | null) => void); return true;
  });
  const terminal = new Terminal(); const written = vi.fn();
  terminal.write('first frame', written); expect(written).not.toHaveBeenCalled();
  callbacks[0]!(new Error('write failed')); expect(written).not.toHaveBeenCalled();
  terminal.write('second frame', written); callbacks[1]!(); expect(written).toHaveBeenCalledOnce();
  expect(terminal.getPendingOutputBytes()).toBe(0);
});

it("reassembles a UTF-8 code point split across stdin chunks", () => {
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn() });
  vi.spyOn(process, "stdin", "get").mockReturnValue(input as unknown as NodeJS.ReadStream);
  const terminal = new Terminal({
    hasTrueColor: false,
    has256Color: false,
    supportsDec2026Sync: false,
    supportsKittyKeyboard: false,
    supportsBracketedPaste: false,
    insideMultiplexer: false,
  });
  const forwarded = vi.fn();
  vi.spyOn(terminal, "write").mockImplementation(() => {});
  vi.spyOn(terminal, "writeSync").mockImplementation(() => {});
  terminal.start(forwarded, () => {}, () => {});
  try {
    const bytes = Buffer.from("🙂", "utf8");
    input.emit("data", bytes.subarray(0, 2));
    expect(forwarded).not.toHaveBeenCalled();
    input.emit("data", bytes.subarray(2));
    expect(forwarded).toHaveBeenCalledWith("🙂");
  } finally {
    terminal.stop();
    input.destroy();
  }
});

it("flushes pending bytes before a string chunk and starts a fresh decoder", () => {
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn() });
  vi.spyOn(process, "stdin", "get").mockReturnValue(input as unknown as NodeJS.ReadStream);
  const terminal = new Terminal({
    hasTrueColor: false,
    has256Color: false,
    supportsDec2026Sync: false,
    supportsKittyKeyboard: false,
    supportsBracketedPaste: false,
    insideMultiplexer: false,
  });
  const forwarded = vi.fn();
  vi.spyOn(terminal, "write").mockImplementation(() => {});
  vi.spyOn(terminal, "writeSync").mockImplementation(() => {});
  terminal.start(forwarded, () => {}, () => {});
  try {
    const bytes = Buffer.from("🙂", "utf8");
    input.emit("data", bytes.subarray(0, 2));
    input.emit("data", "x");
    input.emit("data", bytes);
    expect(forwarded).toHaveBeenNthCalledWith(1, "�x");
    expect(forwarded).toHaveBeenNthCalledWith(2, "🙂");
  } finally {
    terminal.stop();
    input.destroy();
  }
});

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
