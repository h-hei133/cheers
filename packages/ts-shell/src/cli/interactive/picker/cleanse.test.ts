import { describe, expect, it, vi } from 'vitest';
import { cleansePicker } from './cleanse.js';
import type { SecurityInspection, SecurityInspector } from '../../../security/view/inspection.js';
import { OverlayHost } from '../overlay.js';
import { stripAnsi } from '../../../presentation/tui/text/ansi.js';

function inspectorFor(initial: SecurityInspection): { inspector: SecurityInspector; publish: (snapshot: SecurityInspection) => void; released: () => boolean } {
  let snapshot = initial;
  const listeners = new Set<(value: SecurityInspection) => void>();
  return {
    inspector: { read: () => snapshot, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; } },
    publish: value => { snapshot = value; for (const listener of listeners) listener(value); },
    released: () => listeners.size === 0,
  };
}

const snapshot = (version: number, workspaceRoot = '/workspace'): SecurityInspection => ({ state: 'ready', snapshot: {
  identity: { sessionId: 'session-1', workspaceRoot }, version: String(version),
  items: [{ identity: 'session-1/scan/scan-1', kind: 'scan', id: 'scan-1', targetId: 'scan-1', status: 'unknown', durability: 'unknown', owner: 'none', summary: 'unknown · 1 findings', detail: ['retained finding'] }],
} });

describe('cleanse picker', () => {
  it('projects structured retained evidence, drafts only inspection, and releases its subscription', async () => {
    const source = inspectorFor(snapshot(1));
    const picker = cleansePicker(source.inspector);
    const rows = await picker.load();
    expect(rows[0]).toMatchObject({ id: 'session-1/scan/scan-1', note: 'unknown · durability unknown' });
    expect(picker.detail?.(rows[0]!.id)).toEqual(['retained finding']);
    expect(await picker.apply([rows[0]!.id])).toEqual({ draft: '/cleanse diagnose "scan-1"' });
    expect(await picker.apply(['unoffered'])).toBeUndefined();
    expect(await picker.apply([rows[0]!.id, rows[0]!.id])).toBeUndefined();

    const watching = cleansePicker(source.inspector);
    await watching.load();
    const publish = vi.fn();
    const unsubscribe = watching.subscribe!(options => publish(options));
    source.publish(snapshot(2));
    expect(publish).toHaveBeenCalledTimes(1);
    unsubscribe();
    expect(source.released()).toBe(true);
    source.publish(snapshot(3));
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('refuses a draft after the bound session or workspace changes', async () => {
    const source = inspectorFor(snapshot(1));
    const picker = cleansePicker(source.inspector);
    const row = (await picker.load())[0]!;
    source.publish(snapshot(2, '/other-workspace'));
    expect((await picker.apply([row.id]))?.note).toContain('session or workspace changed');
    const reopened = cleansePicker(source.inspector);
    const reopenedRow = (await reopened.load())[0]!;
    source.publish(snapshot(3));
    expect((await reopened.apply([reopenedRow.id]))?.note).toContain('Retained evidence');
  });

  it('keeps unavailable capability distinct from an empty retained history', async () => {
    const unavailable = cleansePicker(undefined);
    expect(await unavailable.load()).toEqual([]);
    expect(unavailable.status?.([])).toContain('Cleanse unavailable');
    const empty = cleansePicker({ read: () => ({ state: 'ready', snapshot: { identity: { sessionId: 's', workspaceRoot: '/w' }, version: '1', items: [] } }), subscribe: () => () => undefined });
    expect(await empty.load()).toEqual([]);
    expect(empty.status?.([])).toContain('No retained security');
  });

  it('awaits cancellable source acquisition and publishes no rows after browser cancellation', async () => {
    const controller = new AbortController();
    const readAsync = vi.fn((signal?: AbortSignal) => new Promise<SecurityInspection>((_resolve, reject) => {
      signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
    }));
    const picker = cleansePicker({
      read: () => snapshot(1),
      readAsync,
      subscribe: () => () => undefined,
    });
    const loading = picker.load(controller.signal);
    expect(readAsync).toHaveBeenCalledWith(controller.signal);
    controller.abort(new Error('Clean source cancelled'));
    await expect(loading).rejects.toThrow('Clean source cancelled');
    expect(picker.detail?.('session-1/scan/scan-1')).toEqual([]);
  });

  it.each([false, true])('keeps an older cancelled load from clearing a newer source result (newer first=%s)', async newerFirst => {
    const pending: Array<(value: SecurityInspection) => void> = [];
    const readAsync = vi.fn(() => new Promise<SecurityInspection>(resolve => { pending.push(resolve); }));
    const picker = cleansePicker({ read: () => snapshot(1), readAsync, subscribe: () => () => undefined });
    const older = new AbortController();
    const newer = new AbortController();
    const first = picker.load(older.signal);
    const second = picker.load(newer.signal);
    if (newerFirst) {
      pending[1]!(snapshot(2));
      expect((await second)[0]?.id).toBe('session-1/scan/scan-1');
    }
    older.abort(new Error('Older load cancelled'));
    pending[0]!(snapshot(1));
    await expect(first).rejects.toThrow('Older load cancelled');
    if (!newerFirst) {
      pending[1]!(snapshot(2));
      expect((await second)[0]?.id).toBe('session-1/scan/scan-1');
    }
    expect(picker.status?.([])).not.toContain('unavailable');
    expect(picker.detail?.('session-1/scan/scan-1')).toEqual(['retained finding']);
  });

  it('passes the browser cancellation signal to retained source subscriptions', async () => {
    const source = inspectorFor(snapshot(1));
    const subscribe = vi.spyOn(source.inspector, 'subscribe');
    const picker = cleansePicker(source.inspector);
    const controller = new AbortController();
    await picker.load(controller.signal);
    const stop = picker.subscribe!(vi.fn());
    expect(subscribe).toHaveBeenCalledWith(expect.any(Function), controller.signal);
    stop();
  });

  it.each(['scan-\x9b31m api_key=synthetic-draft-canary', 'api_key=synthetic-draft-canary', 'scan-\x1b[31m', 's'.repeat(300)])('refuses unsafe exact draft targets', async targetId => {
    const inspection = snapshot(1);
    if (inspection.state !== 'ready') throw new Error('fixture');
    const source = inspectorFor({ ...inspection, snapshot: { ...inspection.snapshot, items: inspection.snapshot.items.map(item => ({ ...item, targetId })) } });
    const picker = cleansePicker(source.inspector); const rows = await picker.load();
    expect(await picker.apply([rows[0]!.id])).toBeUndefined();
  });

  it('clears unavailable live data, recovers, distinguishes no-match and releases on overlay replacement', async () => {
    const source = inspectorFor(snapshot(1));
    const overlay = new OverlayHost(() => undefined);
    const picker = cleansePicker(source.inspector);
    overlay.open(picker);
    await vi.waitFor(() => expect(stripAnsi(overlay.render(130, 30).join('\n'))).toContain('retained finding'));
    source.publish({ state: 'unavailable' });
    let frame = stripAnsi(overlay.render(130, 30).join('\n'));
    expect(frame).toContain('Cleanse unavailable');
    expect(frame).not.toContain('retained finding');
    source.publish(snapshot(2));
    overlay.handlePaste('unmatched');
    frame = stripAnsi(overlay.render(130, 30).join('\n'));
    expect(frame).toContain('No retained diagnostics match this search.');
    overlay.open(cleansePicker(undefined));
    expect(source.released()).toBe(true);
    source.publish(snapshot(3));
    overlay.close();
    expect(overlay.active).toBe(false);
  });
});
