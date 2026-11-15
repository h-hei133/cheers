import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Terminal } from '../terminal.js';
import { getCellDimensions, setCellDimensions } from '../imageDimensions.js';
import { StdinBuffer } from './stdinBuffer.js';
import { PROGRAM_STATUS_QUERY, TERMINAL_PROGRESS_ACTIVE, TERMINAL_PROGRESS_CLEAR } from './programStatus.js';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); setCellDimensions({ widthPx: 9, heightPx: 18 }); });

function device(bound = false) {
  vi.useFakeTimers();
  const input = Object.assign(new PassThrough(), { isTTY: true, isRaw: false, setRawMode: vi.fn(), fd: 0 as const });
  vi.spyOn(process, 'stdin', 'get').mockReturnValue(input as unknown as NodeJS.ReadStream & { fd: 0 });
  vi.spyOn(process, 'stdout', 'get').mockReturnValue(Object.assign(new PassThrough(), { isTTY: true, fd: 1 as const }) as unknown as NodeJS.WriteStream & { fd: 1 });
  const terminal = new Terminal({ hasTrueColor: true, has256Color: true, supportsDec2026Sync: true,
    supportsKittyKeyboard: true, supportsBracketedPaste: true, insideMultiplexer: false }), stdin = new StdinBuffer();
  const write = vi.spyOn(terminal, 'write').mockImplementation(() => {});
  const sync = vi.spyOn(terminal, 'writeSync').mockImplementation(() => {});
  const forwarded = vi.fn(), keys = vi.fn(), pasted = vi.fn();
  stdin.onKey(keys); stdin.onPaste(pasted);
  const release = bound ? terminal.bindProtocolInput(stdin) : undefined;
  const start = () => terminal.start(chunk => { forwarded(chunk); stdin.feed(chunk); }, () => {}, () => {});
  start();
  return { terminal, stdin, input, write, sync, forwarded, keys, pasted, start,
    dispose() { terminal.stop(); release?.(); stdin.dispose(); input.destroy(); } };
}

describe('status probe and terminal lifetime', () => {
  it('places the status query before the shared startup DA1 sentinel', () => {
    const d = device();
    try {
      const batch = d.write.mock.calls.find(([data]) => data.startsWith('\x1b[?u'))?.[0];
      expect(batch).toBe(`\x1b[?u${PROGRAM_STATUS_QUERY}\x1b[c`);
    } finally { d.dispose(); }
  });

  it.each([false, true])('expires status at DA1 and ignores a same-chunk late echo (bound=%s)', bound => {
    const d = device(bound);
    try {
      d.terminal.setProgramStatus({ state: 'working', app: 'cheers' });
      d.input.push(`\x1b[?1u\x1b[?62c${PROGRAM_STATUS_QUERY}`);
      d.terminal.setProgramStatus({ state: 'blocked', kind: 'question', app: 'cheers' });
      expect(d.write.mock.calls.some(([data]) => data.includes('7501;state='))).toBe(false);
      if (!bound) expect(d.forwarded).not.toHaveBeenCalled();
      expect(d.keys).not.toHaveBeenCalled();
    } finally { d.dispose(); }
  });

  it.each([false, true])('confirms a split echo before DA1 and keeps ordinary modified keys (bound=%s)', bound => {
    const d = device(bound);
    try {
      d.terminal.setProgramStatus({ state: 'working', app: 'cheers' });
      d.input.push('\x1b]7501;'); d.input.push('?\x1b'); d.input.push('\\\x1b[?1u\x1b[?62c');
      expect(d.write.mock.calls.filter(([data]) => data.includes('7501;state=working'))).toHaveLength(1);
      d.terminal.setProgramStatus({ state: 'blocked', kind: 'question', app: 'cheers' });
      expect(d.write).toHaveBeenCalledWith('\x1b]7501;state=blocked:app=cheers:kind=question\x1b\\');
      d.input.push('\x1b[97;5u');
      expect(d.keys).toHaveBeenCalledWith(expect.objectContaining({ name: 'a', ctrl: true }));
    } finally { d.dispose(); }
  });

  it.each([false, true])('retires progress, capability and late setters on stop (bound=%s)', bound => {
    const d = device(bound);
    try {
      d.input.push(`${PROGRAM_STATUS_QUERY}\x1b[?1u\x1b[?62c`);
      d.terminal.setProgramStatus({ state: 'working', app: 'cheers' }); d.terminal.setProgress(true);
      d.terminal.stop();
      expect(d.sync.mock.lastCall?.[0]).toContain(TERMINAL_PROGRESS_CLEAR);
      expect(d.sync.mock.lastCall?.[0]).toContain('7501;state=clear');
      d.write.mockClear();
      d.terminal.setProgress(true); d.terminal.setProgramStatus({ state: 'idle', app: 'cheers' });
      d.stdin.feed(PROGRAM_STATUS_QUERY); vi.advanceTimersByTime(2500);
      expect(d.write).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    } finally { d.dispose(); }
  });

  it('clears active status before drainage and blocks setters throughout shutdown', async () => {
    const d = device();
    try {
      d.input.push(`${PROGRAM_STATUS_QUERY}\x1b[?1u\x1b[?62c`);
      d.terminal.setProgramStatus({ state: 'working', app: 'cheers' }); d.terminal.setProgress(true);
      const draining = d.terminal.drainInput();
      expect(d.sync.mock.lastCall?.[0]).toContain(TERMINAL_PROGRESS_CLEAR);
      expect(d.sync.mock.lastCall?.[0]).toContain('7501;state=clear');
      d.write.mockClear(); d.terminal.setProgress(true); d.terminal.setProgramStatus({ state: 'done', app: 'cheers' });
      await vi.advanceTimersByTimeAsync(2500); await draining; d.terminal.stop();
      expect(d.write).not.toHaveBeenCalled();
      expect(d.sync.mock.calls.filter(([data]) => data.includes(TERMINAL_PROGRESS_CLEAR))).toHaveLength(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally { d.dispose(); }
  });

  it.each([false, true])('keeps an owed pre-restart echo and DA1 from confirming the new probe (bound=%s)', bound => {
    const d = device(bound);
    try {
      d.terminal.stop(); d.start();
      d.terminal.setProgramStatus({ state: 'blocked', kind: 'question', app: 'cheers' });
      d.input.push(`${PROGRAM_STATUS_QUERY}\x1b[?62c`);
      expect(d.write.mock.calls.some(([data]) => data.includes('7501;state='))).toBe(false);
      d.input.push(`${PROGRAM_STATUS_QUERY}\x1b[?1u\x1b[?62c`);
      expect(d.write.mock.calls.filter(([data]) => data.includes('7501;state=blocked'))).toHaveLength(1);
      expect(d.terminal.keyboardProtocol).toBe('enhanced');
      expect(d.keys).not.toHaveBeenCalled();
    } finally { d.dispose(); }
  });

  it.each([false, true])('keeps a cancelled pre-restart color sentinel separate from the new status query (bound=%s)', async bound => {
    const d = device(bound);
    try {
      const oldColors = d.terminal.queryTerminalColors({ timeoutMs: 5000 });
      d.terminal.stop(); expect(await oldColors).toEqual({}); d.start();
      d.terminal.setProgramStatus({ state: 'working', app: 'cheers' });
      d.input.push('\x1b[?62c\x1b[?62c');
      d.input.push(`${PROGRAM_STATUS_QUERY}\x1b[?1u\x1b[?62c`);
      expect(d.write.mock.calls.filter(([data]) => data.includes('7501;state=working'))).toHaveLength(1);
      const colors = d.terminal.queryTerminalColors({ timeoutMs: 5000 });
      d.input.push('\x1b]4;2;#010203\x07\x1b[?62c');
      expect((await colors).palette?.[2]).toEqual({ r: 1, g: 2, b: 3 });
      expect(d.keys).not.toHaveBeenCalled();
    } finally { d.dispose(); }
  });

  it('does not attach listeners or a deadline after the startup write synchronously stops the device', () => {
    const d = device();
    try {
      d.terminal.stop();
      d.write.mockImplementation(() => d.terminal.stop());
      d.start();
      expect(d.input.listenerCount('data')).toBe(0);
      expect(d.input.listenerCount('end')).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally { d.dispose(); }
  });

  it('keeps a bounded number of owed color sentinels and declines further device queries', async () => {
    const d = device();
    try {
      const queries = Array.from({ length: 64 }, () => d.terminal.queryTerminalColors({ timeoutMs: 5000 }));
      const sent = d.write.mock.calls.filter(([data]) => data.startsWith('\x1b]10;?'));
      expect(sent.length).toBeLessThan(64);
      await vi.advanceTimersByTimeAsync(5000); await Promise.all(queries);
      d.write.mockClear();
      const next = d.terminal.queryTerminalColors({ timeoutMs: 100 });
      expect(d.write).toHaveBeenCalledOnce();
      d.input.push('\x1b]4;2;#010203\x07\x1b[?62c');
      expect((await next).palette?.[2]).toEqual({ r: 1, g: 2, b: 3 });
    } finally { d.dispose(); }
  });

  it('keeps a successor query started by the declined query cancellation callback', async () => {
    const d = device(true);
    try {
      const held = Array.from({ length: 31 }, () => d.terminal.queryTerminalColors({ timeoutMs: 5000 }));
      let successor: ReturnType<Terminal['queryTerminalColors']> | undefined;
      const settled = vi.fn();
      const declined = d.terminal.queryTerminalColors({ timeoutMs: 5000, onCancel: () => {
        d.input.push('\x1b[?62c');
        successor = d.terminal.queryTerminalColors({ timeoutMs: 100 });
        void successor.then(settled);
      } });
      expect(await declined).toEqual({});
      d.input.push('\x1b]4;2;#010203\x07' + '\x1b[?62c'.repeat(32));
      await Promise.resolve();
      expect(settled).toHaveBeenCalledWith(expect.objectContaining({ palette: expect.arrayContaining([{ r: 1, g: 2, b: 3 }]) }));
      expect((await successor)?.palette?.[2]).toEqual({ r: 1, g: 2, b: 3 });
      await Promise.all(held);
    } finally { d.dispose(); }
  });

  it('does not restart status output after crash-mode restoration', () => {
    const d = device();
    try {
      d.input.push(PROGRAM_STATUS_QUERY); d.terminal.setProgress(true);
      expect(d.write).toHaveBeenCalledWith(TERMINAL_PROGRESS_ACTIVE);
      d.terminal.restoreSync(); d.write.mockClear();
      d.terminal.setProgress(true); d.terminal.setProgramStatus({ state: 'working', app: 'cheers' });
      vi.advanceTimersByTime(2500); expect(d.write).not.toHaveBeenCalled();
    } finally { d.dispose(); }
  });

  it('does not create a keepalive when the active write stops the device synchronously', () => {
    const d = device();
    try {
      d.write.mockImplementation(data => { if (data === TERMINAL_PROGRESS_ACTIVE) d.terminal.stop(); });
      d.terminal.setProgress(true);
      d.write.mockClear(); vi.advanceTimersByTime(2500);
      expect(d.write).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
    } finally { d.dispose(); }
  });

  it.each([false, true])('keeps protocol-looking paste inert while the status probe is pending (bound=%s)', bound => {
    const d = device(bound);
    try {
      const dimensions = getCellDimensions();
      const content = `${PROGRAM_STATUS_QUERY}\x1b]133;A\x07\x1b[6;40;20t\x1b[?62c\x1b]4;2;#010203\x07\x1b[97;5u`;
      const bytes = `\x1b[200~${content}\x1b[201~`;
      d.input.push(bytes.slice(0, 4)); d.input.push(bytes.slice(4, -2)); d.input.push(bytes.slice(-2));
      expect(d.pasted).toHaveBeenCalledWith(content);
      expect(d.forwarded.mock.calls.map(([data]) => data).join('')).toBe(bytes);
      expect(getCellDimensions()).toBe(dimensions); expect(d.terminal.keyboardProtocol).toBe('legacy');
      d.terminal.setProgramStatus({ state: 'working', app: 'cheers' });
      expect(d.write.mock.calls.some(([data]) => data.includes('7501;state='))).toBe(false);
    } finally { d.dispose(); }
  });
});
