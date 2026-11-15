import { afterEach, expect, it, vi } from 'vitest';
import { PendingColorQuery, type TerminalColors } from './terminalColors.js';
import { Terminal } from '../terminal.js';
import { requestTerminalPalette } from '../../theme/terminal.js';
import { PassThrough } from 'node:stream';
import { StdinBuffer } from './stdinBuffer.js';

const negotiationCapabilities = {
  hasTrueColor: true, has256Color: true, supportsDec2026Sync: false,
  supportsKittyKeyboard: true, supportsBracketedPaste: true, insideMultiplexer: false, supportsHyperlinks: false,
};

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('retires cancelled color queries even after their first settlement', () => {
  vi.useFakeTimers(); const late = vi.fn();
  const query = new PendingColorQuery(() => {}, { timeoutMs: 100, onLateReply: late });
  query.consume('\x1b[?62c'); query.cancel();
  expect(query.consume('\x1b]10;#010203\x07')).toBe(false);
  expect(late).not.toHaveBeenCalled();
});

it('returns detached color snapshots and captures changed palette entries after the fence', () => {
  vi.useFakeTimers(); const reports: TerminalColors[] = [];
  const query = new PendingColorQuery(() => {}, { timeoutMs: 100, onLateReply: colors => reports.push(colors) });
  for (let index = 0; index < 16; index++) query.consume(`\x1b]4;${index};#010203\x07`);
  query.consume('\x1b[?62c');
  const original = query.snapshot();
  try { (original.palette![2] as { r: number }).r = 99; } catch { /* Frozen snapshots are also detached. */ }
  expect(query.snapshot().palette?.[2]).toEqual({ r: 1, g: 2, b: 3 });
  query.consume('\x1b]4;2;#040506\x07');
  expect(reports.at(-1)?.palette?.[2]).toEqual({ r: 4, g: 5, b: 6 });
  expect(original.palette?.[2]).not.toEqual({ r: 4, g: 5, b: 6 });
  query.cancel();
});

it('retains partial palette replies at the fence and after the bounded query timeout', () => {
  vi.useFakeTimers(); let settled: TerminalColors | undefined;
  const query = new PendingColorQuery(colors => { settled = colors; }, { timeoutMs: 100 });
  query.consume('\x1b]4;2;#102030\x07');
  vi.advanceTimersByTime(100);
  expect(settled?.palette?.[2]).toEqual({ r: 16, g: 32, b: 48 });
  expect(settled?.palette?.[1]).toBeUndefined();
  query.cancel();
});

it('keeps a replacement device query from publishing the cancelled query result or late callbacks', async () => {
  vi.useFakeTimers(); const terminal = new Terminal(), reports = vi.fn();
  const write = vi.spyOn(terminal, 'write').mockImplementation(() => {});
  const release = requestTerminalPalette(terminal, reports);
  const old = (terminal as unknown as { colorQuery: PendingColorQuery }).colorQuery;
  const replacement = terminal.queryTerminalColors({ timeoutMs: 100 });
  try {
    await Promise.resolve(); expect(reports).not.toHaveBeenCalled();
    expect(old.consume('\x1b]10;#010203\x07')).toBe(false);
    expect(reports).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100); expect(await replacement).toEqual({});
    expect(reports).not.toHaveBeenCalled();
  } finally { release(); write.mockRestore(); }
});

it.each([false, true].flatMap(split => [false, true].map(bound => ({ split, bound }))))(
  'preserves protocol bytes inside bracketed paste through the actual terminal reader (split=$split, bound=$bound)', async ({ split, bound }) => {
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn(), fd: 0 as const });
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as NodeJS.ReadStream & { fd: 0 });
  vi.spyOn(process, 'stdout', 'get').mockReturnValue(Object.assign(new PassThrough(), { isTTY: true, fd: 1 as const }) as unknown as NodeJS.WriteStream & { fd: 1 });
  const terminal = new Terminal(), stdin = new StdinBuffer(), late = vi.fn(), pasted = vi.fn(), forwarded = vi.fn();
  vi.spyOn(terminal, 'write').mockImplementation(() => {}); vi.spyOn(terminal, 'writeSync').mockImplementation(() => {});
  stdin.onPaste(pasted);
  const releaseProtocol = bound ? terminal.bindProtocolInput(stdin) : undefined;
  terminal.start(chunk => { forwarded(chunk); stdin.feed(chunk); }, () => {}, () => {});
  try {
    input.push('\x1b[?1u');
    const query = terminal.queryTerminalColors({ timeoutMs: 100, onLateReply: late });
    input.push('\x1b[?62c'); await query; forwarded.mockClear();
    const content = 'a\x1b]4;2;#010203\x07b\x1b]10;#040506\x1b\\c\x1b]11;#070809\x07d';
    const bytes = `\x1b[200~${content}\x1b[201~`;
    if (split) { input.push(bytes.slice(0, 4)); input.push(bytes.slice(4, 20)); input.push(bytes.slice(20, -2)); input.push(bytes.slice(-2)); }
    else input.push(bytes);
    expect(late).not.toHaveBeenCalled();
    expect(pasted.mock.calls[0]?.[0]).toBe(content);
    expect(forwarded.mock.calls.map(call => call[0]).join('')).toBe(bytes);
  } finally { terminal.stop(); releaseProtocol?.(); stdin.dispose(); input.destroy(); }
});

it('keeps a same-chunk late palette reply newer than the resolved device query snapshot', async () => {
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn(), fd: 0 as const });
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as NodeJS.ReadStream & { fd: 0 });
  vi.spyOn(process, 'stdout', 'get').mockReturnValue(Object.assign(new PassThrough(), { isTTY: true, fd: 1 as const }) as unknown as NodeJS.WriteStream & { fd: 1 });
  const terminal = new Terminal(negotiationCapabilities), reports: TerminalColors[] = [];
  vi.spyOn(terminal, 'write').mockImplementation(() => {}); vi.spyOn(terminal, 'writeSync').mockImplementation(() => {});
  terminal.start(() => {}, () => {}, () => {}); const release = requestTerminalPalette(terminal, colors => reports.push(colors));
  try {
    input.push('\x1b[?1u'); input.push('\x1b[?62c\x1b]4;2;#010203\x07\x1b[?62c\x1b]4;2;#040506\x07');
    await Promise.resolve();
    expect(reports.at(-1)?.palette?.[2]).toEqual({ r: 4, g: 5, b: 6 });
  } finally { release(); terminal.stop(); input.destroy(); }
});

it('does not confirm terminal reports from a bound input after the device stopped', () => {
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn(), fd: 0 as const });
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as NodeJS.ReadStream & { fd: 0 });
  vi.spyOn(process, 'stdout', 'get').mockReturnValue(Object.assign(new PassThrough(), { isTTY: true, fd: 1 as const }) as unknown as NodeJS.WriteStream & { fd: 1 });
  const terminal = new Terminal(), stdin = new StdinBuffer();
  const write = vi.spyOn(terminal, 'write').mockImplementation(() => {}); vi.spyOn(terminal, 'writeSync').mockImplementation(() => {});
  const release = terminal.bindProtocolInput(stdin); terminal.start(chunk => stdin.feed(chunk), () => {}, () => {});
  terminal.setProgramStatus({ state: 'working', app: 'cheers' }); terminal.stop(); write.mockClear();
  try { stdin.feed('\x1b]7501;?\x1b\\\x1b]4;2;#010203\x07'); expect(write).not.toHaveBeenCalled(); }
  finally { release(); stdin.dispose(); input.destroy(); }
});

it.each([false, true].flatMap(split => [false, true].map(bound => ({ split, bound }))))(
  'preserves pasted keyboard replies during actual terminal negotiation (split=$split, bound=$bound)', ({ split, bound }) => {
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn(), fd: 0 as const });
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as NodeJS.ReadStream & { fd: 0 });
  vi.spyOn(process, 'stdout', 'get').mockReturnValue(Object.assign(new PassThrough(), { isTTY: true, fd: 1 as const }) as unknown as NodeJS.WriteStream & { fd: 1 });
  const terminal = new Terminal(), stdin = new StdinBuffer(), pasted = vi.fn();
  vi.spyOn(terminal, 'write').mockImplementation(() => {}); vi.spyOn(terminal, 'writeSync').mockImplementation(() => {});
  const release = bound ? terminal.bindProtocolInput(stdin) : undefined;
  stdin.onPaste(pasted); terminal.start(chunk => stdin.feed(chunk), () => {}, () => {});
  try {
    expect(terminal.keyboardProtocol).toBe('legacy');
    const content = 'before\x1b[?62cbetween\x1b[?1uafter';
    const bytes = `\x1b[200~${content}\x1b[201~`;
    if (split) {
      input.push(bytes.slice(0, 4)); input.push(bytes.slice(4, 19));
      input.push(bytes.slice(19, -2)); input.push(bytes.slice(-2));
    } else input.push(bytes);
    expect(pasted.mock.calls[0]?.[0]).toBe(content);
    expect(terminal.keyboardProtocol).toBe('legacy');
    input.push('\x1b[?'); input.push('1u'); expect(terminal.keyboardProtocol).toBe('enhanced');
  } finally { terminal.stop(); release?.(); stdin.dispose(); input.destroy(); }
});

it.each([false, true])('frames real keyboard fallback and preserves Escape before negotiation (bound=%s)', bound => {
  vi.useFakeTimers();
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn(), fd: 0 as const });
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as NodeJS.ReadStream & { fd: 0 });
  const terminal = new Terminal(negotiationCapabilities), stdin = new StdinBuffer(), keys: string[] = [], forwarded = vi.fn();
  const write = vi.spyOn(terminal, 'write').mockImplementation(() => {});
  vi.spyOn(terminal, 'writeSync').mockImplementation(() => {});
  const release = bound ? terminal.bindProtocolInput(stdin) : undefined;
  stdin.onKey(event => keys.push(event.keyId)); terminal.start(chunk => { forwarded(chunk); stdin.feed(chunk); }, () => {}, () => {});
  try {
    input.push('\x1b'); vi.advanceTimersByTime(39);
    expect(keys).toEqual([]); if (!bound) expect(forwarded).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    if (bound) expect(keys).toEqual(['escape']);
    else { expect(forwarded).toHaveBeenCalledWith('\x1b'); vi.advanceTimersByTime(40); }
    expect(keys).toEqual(['escape']); expect(terminal.keyboardProtocol).toBe('legacy');
    input.push('\x1b[?62;'); input.push('22c');
    expect(terminal.keyboardProtocol).toBe('modify-other-keys');
    expect(write).toHaveBeenCalledWith('\x1b[>4;2m');
    expect(keys).toEqual(['escape']);
  } finally { terminal.stop(); release?.(); stdin.dispose(); input.destroy(); }
});

it.each([false, true])('expires keyboard negotiation without accepting a late framed reply (bound=%s)', bound => {
  vi.useFakeTimers();
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn(), fd: 0 as const });
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as NodeJS.ReadStream & { fd: 0 });
  const terminal = new Terminal(negotiationCapabilities), stdin = new StdinBuffer();
  const write = vi.spyOn(terminal, 'write').mockImplementation(() => {});
  vi.spyOn(terminal, 'writeSync').mockImplementation(() => {});
  const release = bound ? terminal.bindProtocolInput(stdin) : undefined;
  terminal.start(chunk => stdin.feed(chunk), () => {}, () => {});
  try {
    vi.advanceTimersByTime(250); write.mockClear();
    input.push('\x1b[?1u');
    expect(terminal.keyboardProtocol).toBe('legacy'); expect(write).not.toHaveBeenCalled();
    terminal.stop(); stdin.feed('\x1b[?1u'); expect(terminal.keyboardProtocol).toBe('legacy');
  } finally { terminal.stop(); release?.(); stdin.dispose(); input.destroy(); }
});

it.each([false, true])('retains a split keyboard reply beyond the ordinary partial hold within negotiation (bound=%s)', bound => {
  vi.useFakeTimers();
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn(), fd: 0 as const });
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as NodeJS.ReadStream & { fd: 0 });
  const terminal = new Terminal(negotiationCapabilities), stdin = new StdinBuffer(), keys = vi.fn();
  const write = vi.spyOn(terminal, 'write').mockImplementation(() => {});
  vi.spyOn(terminal, 'writeSync').mockImplementation(() => {});
  const release = bound ? terminal.bindProtocolInput(stdin) : undefined;
  stdin.onKey(keys); terminal.start(chunk => stdin.feed(chunk), () => {}, () => {});
  try {
    input.push('\x1b[?'); vi.advanceTimersByTime(100);
    expect(keys).not.toHaveBeenCalled(); expect(terminal.keyboardProtocol).toBe('legacy');
    input.push('1u');
    expect(terminal.keyboardProtocol).toBe('enhanced'); expect(keys).not.toHaveBeenCalled();
    expect(write.mock.calls.some(([data]) => data === '\x1b[>5u' || data === '\x1b[>1u')).toBe(true);
  } finally { terminal.stop(); release?.(); stdin.dispose(); input.destroy(); }
});

it.each([false, true])('preserves a paste spanning the keyboard negotiation deadline (bound=%s)', bound => {
  vi.useFakeTimers();
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn(), fd: 0 as const });
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as NodeJS.ReadStream & { fd: 0 });
  const terminal = new Terminal(negotiationCapabilities), stdin = new StdinBuffer(), pasted = vi.fn();
  vi.spyOn(terminal, 'write').mockImplementation(() => {}); vi.spyOn(terminal, 'writeSync').mockImplementation(() => {});
  const release = bound ? terminal.bindProtocolInput(stdin) : undefined;
  stdin.onPaste(pasted); terminal.start(chunk => stdin.feed(chunk), () => {}, () => {});
  try {
    input.push('\x1b[200~before\x1b[?'); vi.advanceTimersByTime(300);
    expect(pasted).not.toHaveBeenCalled(); expect(terminal.keyboardProtocol).toBe('legacy');
    input.push('1uafter\x1b[201~');
    expect(pasted.mock.calls[0]?.[0]).toBe('before\x1b[?1uafter');
    expect(pasted).toHaveBeenCalledOnce(); expect(terminal.keyboardProtocol).toBe('legacy');
  } finally { terminal.stop(); release?.(); stdin.dispose(); input.destroy(); }
});

it.each([false, true])('keyboard owner boundary: interrupted reply cannot swallow a fresh paste (bound=%s)', bound => {
  vi.useFakeTimers();
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn(), fd: 0 as const });
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as NodeJS.ReadStream & { fd: 0 });
  const terminal = new Terminal(negotiationCapabilities), stdin = new StdinBuffer(), pasted = vi.fn();
  vi.spyOn(terminal, 'write').mockImplementation(() => {}); vi.spyOn(terminal, 'writeSync').mockImplementation(() => {});
  const release = bound ? terminal.bindProtocolInput(stdin) : undefined;
  stdin.onPaste(pasted); terminal.start(chunk => stdin.feed(chunk), () => {}, () => {});
  try {
    input.push('\x1b[?1'); vi.advanceTimersByTime(100);
    input.push('\x1b[200~a\x1b[?1ub\x1b[201~');
    expect(pasted.mock.calls[0]?.[0]).toBe('a\x1b[?1ub'); expect(pasted).toHaveBeenCalledOnce();
    expect(terminal.keyboardProtocol).toBe('legacy');
    input.push('\x1b[?1u'); expect(terminal.keyboardProtocol).toBe('enhanced');
  } finally { terminal.stop(); release?.(); stdin.dispose(); input.destroy(); }
});

it.each([false, true])('keyboard owner boundary: shared appearance prefix retires at the reply deadline (bound=%s)', bound => {
  vi.useFakeTimers();
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn(), fd: 0 as const });
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as NodeJS.ReadStream & { fd: 0 });
  const terminal = new Terminal(negotiationCapabilities), stdin = new StdinBuffer(), frames = vi.fn(), forwarded = vi.fn();
  vi.spyOn(terminal, 'write').mockImplementation(() => {}); vi.spyOn(terminal, 'writeSync').mockImplementation(() => {});
  const release = bound ? terminal.bindProtocolInput(stdin) : undefined;
  stdin.onSequence(frames); terminal.start(chunk => { forwarded(chunk); stdin.feed(chunk); }, () => {}, () => {});
  try {
    input.push('\x1b[?'); forwarded.mockClear(); vi.advanceTimersByTime(250);
    if (bound) expect(frames).toHaveBeenCalledWith('\x1b[?', false);
    else expect(forwarded).toHaveBeenCalledWith('\x1b[?');
    expect(terminal.keyboardProtocol).toBe('legacy');
    input.push('1u'); expect(terminal.keyboardProtocol).toBe('legacy');
  } finally { terminal.stop(); release?.(); stdin.dispose(); input.destroy(); }
});

it('keyboard owner boundary: restarting a bound parser retires the former reply prefix', () => {
  vi.useFakeTimers();
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn(), fd: 0 as const });
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as NodeJS.ReadStream & { fd: 0 });
  const terminal = new Terminal(negotiationCapabilities), stdin = new StdinBuffer();
  vi.spyOn(terminal, 'write').mockImplementation(() => {}); vi.spyOn(terminal, 'writeSync').mockImplementation(() => {});
  const release = terminal.bindProtocolInput(stdin), accept = (chunk: string) => stdin.feed(chunk);
  terminal.start(accept, () => {}, () => {});
  try {
    input.push('\x1b[?1'); vi.advanceTimersByTime(100); terminal.stop(); terminal.start(accept, () => {}, () => {});
    input.push('u'); expect(terminal.keyboardProtocol).toBe('legacy');
    input.push('\x1b[?1u'); expect(terminal.keyboardProtocol).toBe('enhanced');
  } finally { terminal.stop(); release(); stdin.dispose(); input.destroy(); }
});

it.each([false, true])('keyboard owner boundary: readiness palette fence cannot settle keyboard before its query (bound=%s)', bound => {
  vi.useFakeTimers();
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn(), fd: 0 as const });
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as NodeJS.ReadStream & { fd: 0 });
  const terminal = new Terminal(negotiationCapabilities), stdin = new StdinBuffer(), writes: string[] = [];
  vi.spyOn(terminal, 'write').mockImplementation(data => { writes.push(data); });
  vi.spyOn(terminal, 'writeSync').mockImplementation(() => {});
  const release = bound ? terminal.bindProtocolInput(stdin) : undefined;
  terminal.start(chunk => stdin.feed(chunk), () => {}, () => {}, {
    onInputReady: () => { void terminal.queryTerminalColors({ timeoutMs: 100 }); },
  });
  try {
    // Reply in the order requests actually reached the device.
    for (const data of writes.slice()) {
      if (data.startsWith('\x1b[?u')) input.push('\x1b[?1u\x1b[?62c');
      else if (data.startsWith('\x1b]10;?')) input.push('\x1b]4;2;#010203\x07\x1b[?62c');
    }
    expect(terminal.keyboardProtocol).toBe('enhanced');
    expect(writes.findIndex(data => data.startsWith('\x1b[?u'))).toBeLessThan(writes.findIndex(data => data.startsWith('\x1b]10;?')));
  } finally { terminal.stop(); release?.(); stdin.dispose(); input.destroy(); }
});

it.each([false, true])('keyboard owner fence: readiness palette promise retains its own initial snapshot (bound=%s)', async bound => {
  vi.useFakeTimers();
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn(), fd: 0 as const });
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as NodeJS.ReadStream & { fd: 0 });
  const terminal = new Terminal(negotiationCapabilities), stdin = new StdinBuffer(), writes: string[] = [];
  let palette: Promise<TerminalColors> | undefined;
  vi.spyOn(terminal, 'write').mockImplementation(data => { writes.push(data); });
  vi.spyOn(terminal, 'writeSync').mockImplementation(() => {});
  const release = bound ? terminal.bindProtocolInput(stdin) : undefined;
  terminal.start(chunk => stdin.feed(chunk), () => {}, () => {}, {
    onInputReady: () => { palette = terminal.queryTerminalColors({ timeoutMs: 100 }); },
  });
  try {
    for (const data of writes.slice()) {
      if (data.startsWith('\x1b[?u')) input.push('\x1b[?1u\x1b[?62c');
      else if (data.startsWith('\x1b]10;?')) input.push('\x1b]4;2;#010203\x07\x1b[?62c');
    }
    expect(terminal.keyboardProtocol).toBe('enhanced');
    expect((await palette)?.palette?.[2]).toEqual({ r: 1, g: 2, b: 3 });
  } finally { terminal.stop(); release?.(); stdin.dispose(); input.destroy(); }
});

it.each([false, true])('keyboard owner fence: delayed split DA1 stays with the settled enhanced query (bound=%s)', async bound => {
  vi.useFakeTimers();
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn(), fd: 0 as const });
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as NodeJS.ReadStream & { fd: 0 });
  const terminal = new Terminal(negotiationCapabilities), stdin = new StdinBuffer(), keys = vi.fn();
  vi.spyOn(terminal, 'write').mockImplementation(() => {}); vi.spyOn(terminal, 'writeSync').mockImplementation(() => {});
  const release = bound ? terminal.bindProtocolInput(stdin) : undefined;
  let palette: Promise<TerminalColors> | undefined;
  const settled = vi.fn();
  stdin.onKey(keys); terminal.start(chunk => stdin.feed(chunk), () => {}, () => {}, {
    onInputReady: () => { palette = terminal.queryTerminalColors({ timeoutMs: 200 }); void palette.then(settled); },
  });
  try {
    input.push('\x1b[?1u'); expect(terminal.keyboardProtocol).toBe('enhanced');
    input.push('\x1b[?62;'); vi.advanceTimersByTime(60); input.push('22c');
    input.push('\x1b]4;2;#010203\x07\x1b[?62c');
    await Promise.resolve();
    expect(settled).toHaveBeenCalledWith(expect.objectContaining({ palette: expect.arrayContaining([{ r: 1, g: 2, b: 3 }]) }));
    const snapshot = await palette;
    expect(snapshot?.palette?.[2]).toEqual({ r: 1, g: 2, b: 3 });
    expect(keys).not.toHaveBeenCalled(); expect(terminal.keyboardProtocol).toBe('enhanced');
  } finally { terminal.stop(); release?.(); stdin.dispose(); input.destroy(); }
});

it.each([false, true])('keyboard owner fence: the remaining enhanced sentinel releases its prefix at 250ms (bound=%s)', bound => {
  vi.useFakeTimers();
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn(), fd: 0 as const });
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as NodeJS.ReadStream & { fd: 0 });
  const terminal = new Terminal(negotiationCapabilities), stdin = new StdinBuffer(), frames = vi.fn(), forwarded = vi.fn();
  vi.spyOn(terminal, 'write').mockImplementation(() => {}); vi.spyOn(terminal, 'writeSync').mockImplementation(() => {});
  const release = bound ? terminal.bindProtocolInput(stdin) : undefined;
  stdin.onSequence(frames); terminal.start(chunk => { forwarded(chunk); stdin.feed(chunk); }, () => {}, () => {});
  try {
    input.push('\x1b[?1u'); input.push('\x1b[?62;'); forwarded.mockClear(); frames.mockClear();
    vi.advanceTimersByTime(249);
    expect(frames).not.toHaveBeenCalled(); expect(forwarded).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    if (bound) expect(frames).toHaveBeenCalledWith('\x1b[?62;', false);
    else expect(forwarded).toHaveBeenCalledWith('\x1b[?62;');
    expect(terminal.keyboardProtocol).toBe('enhanced');
    frames.mockClear(); input.push('\x1b[?62;'); vi.advanceTimersByTime(bound ? 40 : 80);
    expect(frames).toHaveBeenCalledWith('\x1b[?62;', false);
  } finally { terminal.stop(); release?.(); stdin.dispose(); input.destroy(); }
});

it.each([false, true])('keyboard owner boundary: draining drops residual partial forwarding (bound=%s)', async bound => {
  vi.useFakeTimers();
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn(), fd: 0 as const });
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as NodeJS.ReadStream & { fd: 0 });
  const terminal = new Terminal(negotiationCapabilities), stdin = new StdinBuffer(), forwarded = vi.fn(), keys = vi.fn();
  vi.spyOn(terminal, 'write').mockImplementation(() => {}); vi.spyOn(terminal, 'writeSync').mockImplementation(() => {});
  const release = bound ? terminal.bindProtocolInput(stdin) : undefined;
  stdin.onKey(keys); terminal.start(chunk => { forwarded(chunk); stdin.feed(chunk); }, () => {}, () => {});
  try {
    input.push('\x1b'); forwarded.mockClear(); const draining = terminal.drainInput();
    await vi.advanceTimersByTimeAsync(50); await draining;
    expect(forwarded).not.toHaveBeenCalled(); expect(keys).not.toHaveBeenCalled();
  } finally { terminal.stop(); release?.(); stdin.dispose(); input.destroy(); }
});

it.each([false, true])('keyboard owner boundary: deadline does not flush an unfinished paste marker (bound=%s)', bound => {
  vi.useFakeTimers();
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn(), fd: 0 as const });
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as NodeJS.ReadStream & { fd: 0 });
  const terminal = new Terminal(negotiationCapabilities), stdin = new StdinBuffer(), pasted = vi.fn();
  vi.spyOn(terminal, 'write').mockImplementation(() => {}); vi.spyOn(terminal, 'writeSync').mockImplementation(() => {});
  const release = bound ? terminal.bindProtocolInput(stdin) : undefined;
  stdin.onPaste(pasted); terminal.start(chunk => stdin.feed(chunk), () => {}, () => {});
  try {
    vi.advanceTimersByTime(245); input.push('\x1b[200'); vi.advanceTimersByTime(6);
    input.push('~payload\x1b[201~');
    expect(pasted).toHaveBeenCalledWith('payload'); expect(pasted).toHaveBeenCalledOnce();
    expect(terminal.keyboardProtocol).toBe('legacy');
  } finally { terminal.stop(); release?.(); stdin.dispose(); input.destroy(); }
});
