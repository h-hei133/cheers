import { afterEach, expect, it, vi } from 'vitest';
import { bindTerminalTheme, selectTheme, updateAppearance } from './selection.js';
import { defaultTheme } from './theme.js';
import { requestTerminalPalette } from './terminal.js';
import type { ColorQueryOptions, TerminalColors } from '../tui/input/terminalColors.js';

afterEach(() => {
  bindTerminalTheme().dispose(); selectTheme('dark'); updateAppearance('dark');
  vi.useRealTimers(); vi.unstubAllEnvs();
});

it('bounds initial discovery and rejects replaced queries without publishing their pending result', async () => {
  vi.useFakeTimers(); const reports = vi.fn();
  let resolve: (colors: TerminalColors) => void = () => {};
  let options: ColorQueryOptions | undefined;
  const release = requestTerminalPalette({ queryTerminalColors: next => {
    options = next; return new Promise<TerminalColors>(finish => { resolve = finish; });
  } }, reports);
  vi.advanceTimersByTime(99); expect(reports).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1); expect(reports).toHaveBeenCalledWith({});
  options?.onLateReply?.({ foreground: { r: 1, g: 2, b: 3 } }); expect(reports).toHaveBeenCalledTimes(2);
  options?.onCancel?.(); resolve({ foreground: { r: 4, g: 5, b: 6 } });
  options?.onLateReply?.({ foreground: { r: 7, g: 8, b: 9 } }); await Promise.resolve();
  expect(reports).toHaveBeenCalledTimes(2); release();
});

it('keeps replies after the host timeout newer than a delayed initial device snapshot', async () => {
  vi.useFakeTimers(); const reports: TerminalColors[] = [];
  let resolve: (colors: TerminalColors) => void = () => {};
  let options: ColorQueryOptions | undefined;
  const release = requestTerminalPalette({ queryTerminalColors: next => {
    options = next; return new Promise<TerminalColors>(finish => { resolve = finish; });
  } }, colors => reports.push(colors));
  vi.advanceTimersByTime(100);
  options?.onLateReply?.({ palette: [undefined, undefined, { r: 4, g: 5, b: 6 }] });
  resolve({ palette: [undefined, undefined, { r: 1, g: 2, b: 3 }] }); await Promise.resolve();
  expect(reports.at(-1)?.palette?.[2]).toEqual({ r: 4, g: 5, b: 6 }); release();
});

it('captures partial slots and caller colors while fencing reports from a replaced terminal owner', () => {
  vi.stubEnv('FORCE_COLOR', '3'); const old = bindTerminalTheme(); selectTheme('auto');
  const palette = new Array<{ r: number; g: number; b: number } | undefined>(16);
  palette[2] = { r: 22, g: 33, b: 44 };
  expect(old.update({ palette })).toBe(true);
  expect(defaultTheme.fg('success', 'ok')).toContain('\x1b[38;2;22;33;44m');
  palette[2]!.r = 99;
  expect(defaultTheme.fg('success', 'ok')).toContain('\x1b[38;2;22;33;44m');
  const next = bindTerminalTheme(); next.update({ foreground: { r: 55, g: 66, b: 77 } });
  const revision = defaultTheme.colorRevision;
  expect(old.update({ foreground: { r: 88, g: 99, b: 111 } })).toBe(false);
  expect(old.appearance('light')).toBe(false); old.dispose();
  expect(defaultTheme.colorRevision).toBe(revision);
  expect(defaultTheme.fg('text', 'x')).toContain('\x1b[38;2;55;66;77m'); next.dispose();
});

it('keeps discovery failures optional and retires late callbacks on host release', async () => {
  const reports = vi.fn();
  const release = requestTerminalPalette({ queryTerminalColors: () => { throw new Error('unsupported'); } }, reports);
  expect(reports).toHaveBeenCalledWith({}); release();
  const rejected = requestTerminalPalette({ queryTerminalColors: () => Promise.reject(new Error('failed')) }, reports);
  await Promise.resolve(); expect(reports).toHaveBeenCalledTimes(2); rejected();
});

it('applies all sixteen reported ANSI slots to the existing automatic theme roles', () => {
  vi.stubEnv('FORCE_COLOR', '3'); const owner = bindTerminalTheme(); selectTheme('auto');
  const palette = Array.from({ length: 16 }, (_, index) => ({ r: index + 20, g: index + 40, b: index + 60 }));
  owner.update({ foreground: { r: 200, g: 201, b: 202 }, background: palette[0], palette });
  const tokens = ['error', 'success', 'accent', 'border', 'syntaxNumber', 'statusLinePath', 'mdCodeBorder', 'dim', 'syntaxString',
    'statusLineGitClean', 'warning', 'borderAccent', 'mdCode', 'syntaxType', 'scrollbarThumb'] as const;
  const slots = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
  for (let index = 0; index < tokens.length; index++) {
    const color = palette[slots[index]!]!;
    expect(defaultTheme.fg(tokens[index]!, 'x')).toContain(`\x1b[38;2;${color.r};${color.g};${color.b}m`);
  }
  expect(defaultTheme.bg('statusBandBg', 'x')).toContain('\x1b[48;2;20;40;60m');
  owner.dispose();
});

it('keeps live appearance changes while automatic colors are captured without granting old owners access', () => {
  vi.stubEnv('FORCE_COLOR', '3'); const owner = bindTerminalTheme(); updateAppearance('dark'); selectTheme('auto');
  const foreground = { r: 230, g: 231, b: 232 };
  owner.update({ foreground }); expect(owner.appearance('light')).toBe(true);
  expect(defaultTheme.name).toBe('light');
  expect(defaultTheme.fg('text', 'x')).toContain('\x1b[38;2;230;231;232m');
  const revision = defaultTheme.colorRevision;
  expect(owner.appearance('light')).toBe(false); expect(defaultTheme.colorRevision).toBe(revision);
  owner.dispose(); expect(owner.appearance('dark')).toBe(false);
});
