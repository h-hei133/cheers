import { describe, expect, it, vi } from 'vitest';
import { BoundedTerminalWriter, writeBoundedFrame } from './boundedWriter.js';
import { MainScreenPainter } from './mainScreen.js';
import { TUI } from './engine.js';
import { ManualScheduler, RecordingTerminal } from '../../../test-utils/terminalDouble.js';

describe('terminal byte budget', () => {
  it('keeps CJK and emoji writes within the configured byte cap with exact text', () => {
    const chunks: string[] = [];
    const done = vi.fn();
    const text = '汉字😀ab'.repeat(30);
    writeBoundedFrame({ write(data, callback) { chunks.push(data); callback?.(); } }, text, done, 13);
    expect(chunks.join('')).toBe(text);
    expect(chunks.every(chunk => Buffer.byteLength(chunk) <= 13)).toBe(true);
    expect(chunks.some(chunk => /\uFFFD/.test(Buffer.from(chunk).toString('utf8')))).toBe(false);
    expect(done).toHaveBeenCalledOnce();
  });

  it('keeps a surrogate pair together when its halves arrive in separate fragments', () => {
    const chunks: string[] = [];
    const writer = new BoundedTerminalWriter({ write(data) { chunks.push(data); } }, 4);
    writer.append('ab\ud83d');
    writer.append('\ude00cd');
    writer.flush();
    expect(chunks.map(chunk => Buffer.from(chunk).toString('utf8')).join('')).toBe('ab😀cd');
    expect(chunks.every(chunk => Buffer.byteLength(chunk) <= 4)).toBe(true);
    expect(writer.length).toBe('ab😀cd'.length);
  });

  it('streams main-screen rows into bounded fragments before constructing a whole frame', () => {
    const frames: number[] = [];
    const append = vi.spyOn(BoundedTerminalWriter.prototype, 'append');
    const device = { capabilities: { supportsDec2026Sync: true },
      getDimensions: () => ({ columns: 600, rows: 24 }),
      write(data: string, done?: () => void) { frames.push(Buffer.byteLength(data)); done?.(); } };
    const painter = new MainScreenPainter(device);
    try {
      painter.start();
      const done = vi.fn();
      painter.paint(Array.from({ length: 2200 }, (_, index) => `${index} ${'汉'.repeat(250)}`), [], done);
      expect(frames.every(bytes => bytes <= 1024 * 1024)).toBe(true);
      expect(append.mock.calls.length).toBeGreaterThan(2200);
      expect(append.mock.calls.every(([fragment]) => fragment.length < 2048)).toBe(true);
      expect(done).toHaveBeenCalledOnce();
    } finally { append.mockRestore(); }
  });

  it('streams full and changed alternate-screen rows before constructing a whole frame', () => {
    const terminal = new RecordingTerminal();
    terminal.columns = 600;
    terminal.rows = 24;
    const rows = Array.from({ length: terminal.rows }, (_, index) => `${index} ${'汉'.repeat(250)}`);
    const tui = new TUI(terminal, new ManualScheduler());
    tui.setFrameProvider({ renderFrame: () => ({ rows }) });
    const append = vi.spyOn(BoundedTerminalWriter.prototype, 'append');
    try {
      tui.start({ useAlternateScreen: true });
      tui.renderNow();
      expect(append.mock.calls.length).toBeGreaterThan(terminal.rows);
      expect(append.mock.calls.every(([fragment]) => fragment.length < 2048)).toBe(true);
      append.mockClear();
      rows[3] = 'changed';
      tui.renderNow();
      expect(append.mock.calls.some(([fragment]) => fragment.includes('changed'))).toBe(true);
      expect(append.mock.calls.every(([fragment]) => !fragment.includes('汉'))).toBe(true);
    } finally { append.mockRestore(); tui.stop(); }
  });
});
