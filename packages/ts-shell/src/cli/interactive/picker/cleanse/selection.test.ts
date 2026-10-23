import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleansePicker } from '../cleanse.js';
import type { SecurityInspection, SecurityInspector } from '../../../../security/view/inspection.js';
let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanse-selection-')); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
function source(): { inspector: SecurityInspector; publish: (value: SecurityInspection) => void; current: () => SecurityInspection } {
  let value: SecurityInspection = { state: 'ready', snapshot: { identity: { sessionId: 'session-a', workspaceRoot: root }, version: '1', items: [
    { identity: 'session-a/scan/scan-a', kind: 'scan', id: 'scan-a', targetId: 'scan-a', status: 'unknown', durability: 'unknown', owner: 'none', summary: 'unknown', detail: ['Retained detail'] },
  ] } };
  const listeners = new Set<(value: SecurityInspection) => void>();
  return { inspector: { read: () => value, subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; } },
    publish: next => { value = next; for (const listener of listeners) listener(value); }, current: () => value };
}

it('consumes an offered diagnosis exactly once and clears details after closing', async () => {
  const s = source(), picker = cleansePicker(s.inspector, { cwd: root, sessionId: 'session-a' }); const row = (await picker.load())[0]!;
  expect(await picker.apply([row.id])).toEqual({ draft: '/cleanse diagnose "scan-a"' });
  expect(await picker.apply([row.id])).toBeUndefined(); expect(picker.detail?.(row.id)).toEqual([]);
  await expect(picker.load()).rejects.toThrow('closed');
});

it('blocks revoked original admission before inspector reads and after actual synchronous acquisition', async () => {
  const s = source(); const read = vi.spyOn(s.inspector, 'read');
  await expect(cleansePicker(s.inspector, { cwd: root, admission: () => 'Original read refused' }).load()).rejects.toThrow('Original read refused'); expect(read).not.toHaveBeenCalled();
  let denied = false; read.mockImplementation(() => { denied = true; return s.current(); });
  await expect(cleansePicker(s.inspector, { cwd: root, admission: () => denied ? 'Publication refused' : undefined }).load()).rejects.toThrow('Publication refused');
});

it('rejects source cardinality and text before joining option search bodies', async () => {
  const s = source(); const current = s.current(); if (current.state !== 'ready') throw Error('fixture');
  s.publish({ state: 'ready', snapshot: { ...current.snapshot, items: Array.from({ length: 97 }, (_, i) => ({ ...current.snapshot.items[0]!, identity: String(i) })) } });
  await expect(cleansePicker(s.inspector).load()).rejects.toThrow('browsing limits');
  s.publish({ state: 'ready', snapshot: { ...current.snapshot, items: [{ ...current.snapshot.items[0]!, detail: Array(4097).fill('') }] } });
  await expect(cleansePicker(s.inspector).load()).rejects.toThrow('browsing limits');
  s.publish({ state: 'ready', snapshot: { ...current.snapshot, items: [{ ...current.snapshot.items[0]!, detail: ['x'.repeat(8 * 1024 * 1024 + 1)] }] } });
  await expect(cleansePicker(s.inspector).load()).rejects.toThrow('browsing limits');
});

it('suppresses late subscription callbacks and never reopens a closed selection', async () => {
  const s = source(), picker = cleansePicker(s.inspector, { cwd: root }); const row = (await picker.load())[0]!;
  const publish = vi.fn(); const release = picker.subscribe!(publish); picker.previewEnd?.();
  s.publish(s.current()); expect(publish).not.toHaveBeenCalled(); expect(picker.detail?.(row.id)).toEqual([]);
  expect(await picker.apply([row.id])).toBeUndefined(); release();
});

it('rejects original signal cancelled by inspector acquisition before publishing options', async () => {
  const s = source(), controller = new AbortController(); vi.spyOn(s.inspector, 'read').mockImplementation(() => { controller.abort(new Error('Load cancelled')); return s.current(); });
  await expect(cleansePicker(s.inspector, { cwd: root, signal: controller.signal }).load()).rejects.toThrow('Load cancelled');
});

it('refuses a physically replaced workspace before inspecting or drafting the original retained source', async () => {
  const s = source(), picker = cleansePicker(s.inspector, { cwd: root }); const row = (await picker.load())[0]!;
  const moved = root + '-held'; fs.renameSync(root, moved); fs.mkdirSync(root);
  try { const result = await picker.apply([row.id]); expect(result?.draft).toBeUndefined(); expect(result).toEqual({ note: 'Retained diagnostics are unavailable or the opening owner changed. Reopen /cleanse.' }); expect(picker.detail?.(row.id)).toEqual([]); }
  finally { fs.rmSync(root, { recursive: true }); fs.renameSync(moved, root); }
});

it('refuses mutable original context identity after opening while preserving the captured owner', async () => {
  const s = source(), context = { cwd: root, sessionId: 'session-a' }, picker = cleansePicker(s.inspector, context);
  const row = (await picker.load())[0]!; context.sessionId = 'session-b';
  expect((await picker.apply([row.id]))?.draft).toBeUndefined(); expect(picker.detail?.(row.id)).toEqual([]);
});

it('does not inherit an ended browser load signal when the selected draft is accepted', async () => {
  const s = source(), controller = new AbortController(), picker = cleansePicker(s.inspector, { cwd: root });
  const row = (await picker.load(controller.signal))[0]!; picker.previewAccept?.(); controller.abort();
  expect(await picker.apply([row.id])).toEqual({ draft: '/cleanse diagnose "scan-a"' });
});

it('refuses original admission revoked by the final fresh inspector read instead of publishing a draft', async () => {
  const s = source(); let denied = false, calls = 0;
  vi.spyOn(s.inspector, 'read').mockImplementation(() => { if (++calls === 2) denied = true; return s.current(); });
  const picker = cleansePicker(s.inspector, { cwd: root, admission: () => denied ? 'Original diagnosis refused' : undefined }), row = (await picker.load())[0]!;
  let result; try { result = await picker.apply([row.id]); } catch { result = undefined; }
  expect(result).toEqual({ note: 'Retained diagnostics are unavailable or the opening owner changed. Reopen /cleanse.' });
});

it('clears retained rows when an oversized source arrives through the live subscription', async () => {
  const s = source(), picker = cleansePicker(s.inspector), row = (await picker.load())[0]!, publish = vi.fn();
  const stop = picker.subscribe!(publish), current = s.current(); if (current.state !== 'ready') throw Error('fixture');
  s.publish({ state: 'ready', snapshot: { ...current.snapshot, items: Array(97).fill(current.snapshot.items[0]) } });
  expect(publish).toHaveBeenCalledWith([]); expect(picker.detail?.(row.id)).toEqual([]);
  expect(picker.status?.([])).toContain('unavailable'); stop();
});

it('rejects browser cancellation after loading until the host explicitly accepts a current choice', async () => {
  const s = source(), local = new AbortController(), picker = cleansePicker(s.inspector, { cwd: root });
  const row = (await picker.load(local.signal))[0]!; local.abort();
  expect((await picker.apply([row.id]))?.draft).toBeUndefined();
  expect(picker.detail?.(row.id)).toEqual([]);
});

it('replaces subscriptions, ignores stopped queued callbacks and releases a synchronous late handle', async () => {
  const s = source(), callbacks: ((value: SecurityInspection) => void)[] = [], releases = vi.fn();
  s.inspector.subscribe = cb => { callbacks.push(cb); return releases; };
  const picker = cleansePicker(s.inspector), publish = vi.fn(); await picker.load();
  const first = picker.subscribe!(publish); picker.subscribe!(publish);
  expect(releases).toHaveBeenCalledOnce();
  first(); callbacks[0]!(s.current()); expect(publish).not.toHaveBeenCalled();
  picker.previewEnd?.(); callbacks[1]!(s.current()); expect(releases).toHaveBeenCalledTimes(2);
  const synchronous = cleansePicker({ read: s.inspector.read, subscribe: cb => { cb(s.current()); return releases; } });
  await synchronous.load(); synchronous.subscribe!(() => synchronous.previewEnd?.());
  expect(releases).toHaveBeenCalledTimes(3);
});

it('captures offered version, target and detail independently of mutable inspector snapshots', async () => {
  const s = source(), picker = cleansePicker(s.inspector), row = (await picker.load())[0]!;
  const value = s.current(); if (value.state !== 'ready') throw Error('fixture');
  const item = value.snapshot.items[0] as { targetId: string; detail: string[] };
  item.targetId = 'scan-b'; item.detail[0] = 'mutated detail';
  expect(picker.detail?.(row.id)).toEqual(['Retained detail']);
  expect((await picker.apply([row.id]))?.draft).toBeUndefined();
});

it('invalidates prior offers when reload fails and preserves the first owner across live recovery', async () => {
  const s = source(), picker = cleansePicker(s.inspector), row = (await picker.load())[0]!;
  const read = vi.spyOn(s.inspector, 'read').mockImplementation(() => { throw Error('Read unavailable'); });
  await expect(picker.load()).rejects.toThrow('Read unavailable'); read.mockRestore();
  expect(picker.detail?.(row.id)).toEqual([]); expect(await picker.apply([row.id])).toBeUndefined();
  await picker.load(); const publish = vi.fn(); picker.subscribe!(publish);
  s.publish({ state: 'unavailable' });
  s.publish({ state: 'ready', snapshot: { identity: { sessionId: 'session-b', workspaceRoot: root }, version: '1', items: [] } });
  expect(publish).toHaveBeenLastCalledWith([]); expect(picker.status?.([])).toContain('unavailable');
  picker.previewEnd?.();
});

it('checks render admission and callback-triggered cancellation before original acquisition', async () => {
  const s = source(), controller = new AbortController(); let refuse = false;
  const picker = cleansePicker(s.inspector, { cwd: root, admission: () => refuse ? 'Render refused' : undefined });
  const row = (await picker.load())[0]!; refuse = true;
  expect(picker.detail?.(row.id)).toEqual([]); expect(picker.status?.([])).toContain('unavailable');
  const read = vi.spyOn(s.inspector, 'read'); let cancel = false;
  const cancelled = cleansePicker(s.inspector, { cwd: root, signal: controller.signal, admission: () => { if (cancel) controller.abort(); return undefined; } });
  cancel = true; await expect(cancelled.load()).rejects.toThrow(); expect(read).not.toHaveBeenCalled();
});

it('keeps accepted outcome current for the consumer and rejects a later live session change', async () => {
  const s = source(), context = { cwd: root, sessionId: 'session-a' }, picker = cleansePicker(s.inspector, context);
  const row = (await picker.load())[0]!; expect(await picker.apply([row.id])).toEqual({ draft: '/cleanse diagnose "scan-a"' });
  expect(picker.isCurrent?.()).toBe(true); context.sessionId = 'session-b'; expect(picker.isCurrent?.()).toBe(false);
});

it('uses the live session owner for accepted publication even when command context is an opening snapshot', async () => {
  const s = source(); let sessionId = 'session-a';
  const picker = cleansePicker(s.inspector, { cwd: root, sessionId: 'session-a' }, () => ({ sessionId, projectRoot: root, busy: false }));
  const row = (await picker.load())[0]!; expect(await picker.apply([row.id])).toEqual({ draft: '/cleanse diagnose "scan-a"' });
  expect(picker.isCurrent?.()).toBe(true); sessionId = 'session-b'; expect(picker.isCurrent?.()).toBe(false);
});

it('captures primitive live owner identity even when the owner reuses a mutable context object', async () => {
  const s = source(), owner = { sessionId: 'session-a', projectRoot: root, busy: false };
  const picker = cleansePicker(s.inspector, { cwd: root, sessionId: 'session-a' }, () => owner);
  const row = (await picker.load())[0]!; owner.sessionId = 'session-b';
  expect((await picker.apply([row.id]))?.draft).toBeUndefined(); expect(picker.isCurrent?.()).toBe(false);
});

it('rechecks browser and closure controls after admission callbacks during source acquisition', async () => {
  const s = source(), local = new AbortController(); let checks = 0, cancel = false;
  const picker = cleansePicker(s.inspector, { cwd: root, admission: () => { if (cancel && ++checks === 3) local.abort(); return undefined; } });
  cancel = true; await expect(picker.load(local.signal)).rejects.toThrow();
  expect(picker.detail?.('session-a/scan/scan-a')).toEqual([]); expect(await picker.apply(['session-a/scan/scan-a'])).toBeUndefined();
  let close = false; const closed = cleansePicker(s.inspector, { cwd: root, admission: () => { if (close) closed.previewEnd?.(); return undefined; } });
  close = true; await expect(closed.load()).rejects.toThrow('closed');
  expect(closed.detail?.('session-a/scan/scan-a')).toEqual([]);
});
