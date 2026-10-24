import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { ShellRuntimeContext } from '../../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../../core/shell/sessionRuntime.js';
import { createSecurityHarness, cleanupSecurityHarnesses } from '../../../test-utils/security.js';
import { SecurityService } from '../../../security/service.js';
import { installSecurityRuntime, securityInspectorFor } from '../security.js';
import { cleansePicker } from '../../interactive/picker/cleanse.js';
import { OverlayHost } from '../../interactive/overlay.js';
import { stripAnsi } from '../../../presentation/tui/text/ansi.js';

afterEach(() => { vi.useRealTimers(); cleanupSecurityHarnesses(); });

function boundInspector() {
  const h = createSecurityHarness();
  const id = h.plan();
  const context = { session: h.session, cwd: h.root } as ShellRuntimeContext;
  installSecurityRuntime(context, h.manager, { getCurrentRunController: () => null } as unknown as ShellSessionRuntime, h.host.gate);
  return { ...h, id, inspector: securityInspectorFor(context)!, metadata: path.join(h.manager.getSessionDirPath(h.session.id), 'metadata.json') };
}

function pendingRead(metadata: string, holdAt = 1) {
  let release!: () => void, entered = false, metadataOpens = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const open = fs.promises.open.bind(fs.promises);
  const counts = { opened: 0, closed: 0, active: 0, peak: 0, bytes: 0 };
  vi.spyOn(fs.promises, 'open').mockImplementation((async (target, ...args) => {
    const handle = await open(target, ...args);
    counts.opened++; counts.active++; counts.peak = Math.max(counts.peak, counts.active);
    const close = handle.close.bind(handle), read = handle.read.bind(handle);
    handle.close = async () => { await close(); counts.closed++; counts.active--; };
    handle.read = (async (buffer: Buffer, offset: number, length: number, position: number) => {
      const result = await read(buffer, offset, length, position);
      counts.bytes += result.bytesRead; return result;
    }) as typeof handle.read;
    // Hold the actual opened descriptor before the source owner receives it.
    if (String(target) === metadata && ++metadataOpens === holdAt) { entered = true; await gate; }
    return handle;
  }) as typeof fs.promises.open);
  const original = SecurityService.prototype.inspectionAsync;
  let owner!: SecurityService, active = 0, peak = 0;
  const reads: Promise<unknown>[] = [];
  const inspect = vi.spyOn(SecurityService.prototype, 'inspectionAsync').mockImplementation(function (this: SecurityService, signal) {
    owner = this; active++; peak = Math.max(peak, active);
    const reading = original.call(this, signal).finally(() => { active--; });
    reads.push(reading); return reading;
  });
  return { counts, inspect, owner: () => owner, entered: () => entered, peak: () => peak, release,
    drain: async () => { await Promise.allSettled(reads); } };
}

function pausePolling(): void {
  const interval = setInterval;
  // A real disposable timer preserves cleanup without a polling fallback.
  vi.spyOn(globalThis, 'setInterval').mockImplementation(() => interval(() => {}, 60_000));
}

it('coalesces native refresh bursts until the cancelled descriptor acquisition drains', async () => {
  const h = boundInspector(), pending = pendingRead(h.metadata);
  pausePolling();
  const browser = new AbortController(), listener = vi.fn();
  const stop = h.inspector.subscribe(listener, browser.signal);
  try {
    await vi.waitFor(() => expect(pending.entered()).toBe(true));
    const owner = pending.owner(), saved = h.service.scanRecord(h.id);
    for (let notice = 0; notice < 50; notice++) {
      owner.publication.scans.set(h.id, { ...saved, status: 'cancelled', durability: 'unknown', note: `latest notice ${notice}` });
      owner.publication.notify();
    }
    expect(pending.inspect).toHaveBeenCalledTimes(1);
    expect(pending.peak()).toBe(1);
    expect(listener).not.toHaveBeenCalled();
    pending.release();
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(1));
    expect(listener.mock.lastCall![0]).toMatchObject({ state: 'ready', snapshot: { items: [
      { id: h.id, status: 'cancelled', detail: expect.arrayContaining(['latest notice 49']) },
    ] } });
    await pending.drain();
    expect(pending.inspect).toHaveBeenCalledTimes(2);
    expect(pending.peak()).toBe(1);
    expect(pending.counts).toMatchObject({ opened: 3, closed: 3, active: 0, peak: 1 });
    const state = path.join(h.manager.getSessionDirPath(h.session.id), 'state.json');
    expect(pending.counts.bytes).toBe(fs.statSync(h.metadata).size + fs.statSync(state).size);
    expect(h.run).not.toHaveBeenCalled(); expect(h.approvals).toEqual([]);
  } finally { stop(); pending.release(); await pending.drain(); }
});

it('drops the coalesced refresh when the browser closes before the old read drains', async () => {
  const h = boundInspector(), pending = pendingRead(h.metadata);
  pausePolling();
  const browser = new AbortController(), listener = vi.fn();
  const stop = h.inspector.subscribe(listener, browser.signal);
  try {
    await vi.waitFor(() => expect(pending.entered()).toBe(true));
    for (let notice = 0; notice < 50; notice++) pending.owner().publication.notify();
    browser.abort(); pending.release(); await pending.drain();
    pending.owner().publication.notify();
    expect(pending.inspect).toHaveBeenCalledTimes(1);
    expect(pending.counts).toMatchObject({ opened: 1, closed: 1, active: 0, peak: 1, bytes: 0 });
    expect(listener).not.toHaveBeenCalled(); expect(h.run).not.toHaveBeenCalled();
  } finally { stop(); pending.release(); await pending.drain(); }
});

it('updates the real cleanse overlay after a burst and releases its subscription on close', async () => {
  const h = boundInspector(), pending = pendingRead(h.metadata, 2);
  pausePolling();
  const picker = cleansePicker(h.inspector, { cwd: h.root, sessionId: h.session.id });
  const loading = vi.spyOn(picker, 'load'), changed = vi.fn(), host = new OverlayHost(changed);
  host.open(picker);
  const load = loading.mock.results[0]!.value as ReturnType<typeof picker.load>;
  try {
    await load;
    await vi.waitFor(() => expect(pending.entered()).toBe(true));
    expect(host.render(120, 24).map(stripAnsi).join('\n')).toContain('planned');
    const owner = pending.owner(), saved = h.service.scanRecord(h.id);
    for (let notice = 0; notice < 50; notice++) {
      owner.publication.scans.set(h.id, { ...saved, status: 'cancelled', durability: 'unknown', note: `overlay notice ${notice}` });
      owner.publication.notify();
    }
    expect(pending.inspect).toHaveBeenCalledTimes(2);
    pending.release();
    const identity = `${h.session.id}/scan/${h.id}`;
    await vi.waitFor(() => expect(picker.detail?.(identity)).toContain('overlay notice 49'));
    expect(host.render(120, 24).map(stripAnsi).join('\n')).toContain('cancelled');
    await pending.drain();
    expect(pending.inspect).toHaveBeenCalledTimes(3); expect(pending.peak()).toBe(1);
    expect(pending.counts).toMatchObject({ opened: 5, closed: 5, active: 0, peak: 1 });
    const state = path.join(h.manager.getSessionDirPath(h.session.id), 'state.json');
    expect(pending.counts.bytes).toBe(2 * (fs.statSync(h.metadata).size + fs.statSync(state).size));
    host.close();
    const reads = pending.inspect.mock.calls.length, changes = changed.mock.calls.length;
    owner.publication.notify(); await pending.drain();
    expect(pending.inspect).toHaveBeenCalledTimes(reads); expect(changed).toHaveBeenCalledTimes(changes);
    expect(picker.detail?.(identity)).toEqual([]); expect(await picker.apply([identity])).toBeUndefined();
    expect(host.render(120, 24)).toEqual([]); expect(h.run).not.toHaveBeenCalled(); expect(h.approvals).toEqual([]);
  } finally { host.close(); pending.release(); await load.catch(() => {}); await pending.drain(); }
});

it('releases a failed async inspection so a later poll can recover without overlapping work', async () => {
  const h = boundInspector();
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const inspect = vi.spyOn(SecurityService.prototype, 'inspectionAsync').mockRejectedValueOnce(new Error('Synthetic acquisition failure'));
  const listener = vi.fn(), stop = h.inspector.subscribe(listener, new AbortController().signal);
  try {
    await vi.waitFor(() => expect(listener).toHaveBeenCalledWith({ state: 'unavailable' }));
    vi.advanceTimersByTime(1000);
    await vi.waitFor(() => expect(listener).toHaveBeenCalledTimes(2));
    expect(listener.mock.lastCall![0]).toMatchObject({ state: 'ready', snapshot: { items: [{ id: h.id }] } });
    expect(inspect).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(10_000);
    expect(inspect).toHaveBeenCalledTimes(2);
    expect(h.run).not.toHaveBeenCalled();
  } finally { stop(); }
});
