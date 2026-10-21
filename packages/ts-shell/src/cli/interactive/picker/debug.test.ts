import { beforeEach, describe, expect, it, vi } from 'vitest';
import { debugPicker } from './debug.js';
import { opensPicker, pickerFor, type PickerHost } from './registry.js';
import { debugSyntax } from '../../../core/commands/debug/syntax.js';
import { createReport } from '../../../core/commands/report/projection.js';
import { runDebugCommand } from '../../../core/commands/debugCommandRuntime.js';
import { OverlayHost } from '../overlay.js';
import { parseKeyEvent } from '../../../presentation/tui/input/keys.js';

vi.mock('../../../core/commands/debugCommandRuntime.js', () => ({ runDebugCommand: vi.fn() }));
const report = createReport({ title: 'Probe diagnostics', lines: [], facts: { status: 'partial' } });
beforeEach(() => { vi.mocked(runDebugCommand).mockReset().mockResolvedValue({ kind: 'local', output: 'probe', report }); });

describe('/debug picker', () => {
  it('opens only the bare interactive invocation and retains direct argument routes', () => {
    expect(opensPicker('/debug')).toBe(true);
    expect(opensPicker('/debug summary')).toBe(false);
    expect(opensPicker('/debug logs')).toBe(false);
    const picker = pickerFor('debug', { commandContext: { cwd: '/synthetic' } } as PickerHost);
    expect(picker?.title).toBe('Debug diagnostics');
  });

  it('opens and filters a static action menu without reading or exporting diagnostics', async () => {
    const picker = debugPicker({ cwd: '/synthetic' });
    expect(picker.holdInput).not.toBe(true);
    expect((await picker.load()).map(option => option.id)).toEqual(debugSyntax.actions.map(action => action.name));
    expect(runDebugCommand).not.toHaveBeenCalled();
    picker.previewEnd?.();
    expect(await picker.apply(['summary'])).toBeUndefined();
    expect(runDebugCommand).not.toHaveBeenCalled();
  });

  it.each(['summary', 'logs', 'crashes', 'metrics', 'timings', 'tools'])('routes %s once to the read-only owner and retains report status', async action => {
    const context = { cwd: '/synthetic' };
    const picker = debugPicker(context);
    expect(await picker.apply([action])).toBeUndefined();
    await picker.load();
    expect(await picker.apply(['export'])).toBeUndefined();
    expect(await picker.apply([action, 'logs'])).toBeUndefined();
    expect(await picker.apply([action])).toEqual({ report });
    expect(await picker.apply([action])).toBeUndefined();
    expect(runDebugCommand).toHaveBeenCalledTimes(1);
    expect(runDebugCommand).toHaveBeenCalledWith([action], context);
  });

  it('displays report-safe failure without leaking source errors', async () => {
    vi.mocked(runDebugCommand).mockRejectedValue(new Error('sk-synthetic-sensitive-source'));
    const picker = debugPicker({ cwd: '/synthetic' });
    await picker.load();
    expect(await picker.apply(['summary'])).toEqual({ note: 'Diagnostic source unavailable. Reopen /debug to retry.' });
  });

  it('does not read diagnostics after the original session or configuration binding expires', async () => {
    let stale = false;
    const picker = debugPicker({ cwd: '/synthetic', admission: () => stale ? 'changed' : undefined });
    await picker.load();
    stale = true;
    expect(picker.isCurrent?.()).toBe(false);
    expect(picker.status?.([], '')).toContain('changed');
    expect(await picker.apply(['tools'])).toBeUndefined();
    expect(runDebugCommand).not.toHaveBeenCalled();
  });

  it.each(['success', 'failure'])('suppresses a late %s after the captured owner changes', async settlement => {
    let stale = false;
    let finish!: () => void;
    vi.mocked(runDebugCommand).mockImplementation(() => new Promise((resolve, reject) => {
      finish = () => settlement === 'success' ? resolve({ kind: 'local', output: 'old owner', report }) : reject(new Error('old owner error'));
    }));
    const picker = debugPicker({ cwd: '/synthetic', admission: () => stale ? 'changed' : undefined });
    await picker.load();
    const result = picker.apply(['summary']);
    stale = true;
    finish();
    expect(await result).toBeUndefined();
  });

  it('fails closed when the captured admission check throws', async () => {
    const picker = debugPicker({ cwd: '/synthetic', admission: () => { throw new Error('private source'); } });
    expect(await picker.load()).toEqual([]);
    expect(await picker.apply(['summary'])).toBeUndefined();
    expect(runDebugCommand).not.toHaveBeenCalled();
  });

  it('honors cancellation and host no-match behavior without dispatching a diagnostic read', async () => {
    const host = new OverlayHost(() => undefined);
    const picker = debugPicker({ cwd: '/synthetic' });
    host.open(picker);
    await new Promise(resolve => setImmediate(resolve));
    for (const char of 'impossible-debug-view') host.handleKey(parseKeyEvent(char), () => { throw new Error('unexpected selection'); });
    expect(host.render(110, 35).join('\n')).toContain('No matching diagnostic views');
    host.handleKey(parseKeyEvent('\x1b'), () => { throw new Error('unexpected selection'); });
    expect(host.active).toBe(false);
    expect(await picker.apply(['summary'])).toBeUndefined();
    expect(runDebugCommand).not.toHaveBeenCalled();
  });
});
