import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import { createSecurityHarness, cleanupSecurityHarnesses } from '../../test-utils/security.js';
import { installSecurityRuntime, securityInspectorFor } from './security.js';
import { SecurityService } from '../../security/service.js';

afterEach(() => { vi.useRealTimers(); cleanupSecurityHarnesses(); });

function pollingHarness() {
  const h = createSecurityHarness();
  const context = { session: h.session, cwd: h.root } as ShellRuntimeContext;
  installSecurityRuntime(context, h.manager, { getCurrentRunController: () => null } as unknown as ShellSessionRuntime, h.host.gate);
  const original = SecurityService.prototype.inspection;
  let owner!: SecurityService;
  const inspect = vi.spyOn(SecurityService.prototype, 'inspection').mockImplementation(function (this: SecurityService) {
    owner = this; return original.call(this);
  });
  vi.useFakeTimers();
  const inspector = securityInspectorFor(context)!;
  const listener = vi.fn(); const release = inspector.subscribe(listener);
  return { ...h, context, inspector, listener, release, inspect, owner: () => owner,
    statePath: path.join(h.manager.getSessionDirPath(h.session.id), 'state.json') };
}

it('skips unchanged subscribed source bodies and inspection but keeps direct reads fresh', () => {
  const h = pollingHarness(); const read = vi.spyOn(fs, 'readSync');
  h.inspect.mockClear(); vi.advanceTimersByTime(10000);
  expect(read).not.toHaveBeenCalled(); expect(h.inspect).not.toHaveBeenCalled();
  expect(h.listener).toHaveBeenCalledTimes(1);
  expect(h.inspector.read().state).toBe('ready');
  expect(h.inspect).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalled();
  h.release(); h.release(); h.inspect.mockClear(); read.mockClear();
  vi.advanceTimersByTime(10000); h.owner().publication.notify();
  expect(vi.getTimerCount()).toBe(0); expect(read).not.toHaveBeenCalled(); expect(h.inspect).not.toHaveBeenCalled();
});

it.each(['metadata.json', 'state.json', 'transcript.jsonl'])('rechecks external %s changes before suppressing a duplicate frame', name => {
  const h = pollingHarness(); h.inspect.mockClear();
  fs.appendFileSync(path.join(h.manager.getSessionDirPath(h.session.id), name), ' ');
  vi.advanceTimersByTime(1000);
  expect(h.inspect).toHaveBeenCalledTimes(1); expect(h.listener).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1000); expect(h.inspect).toHaveBeenCalledTimes(1); h.release();
});

it('does not admit a failed inspection even when source revision remains unchanged', () => {
  const h = pollingHarness();
  h.inspect.mockImplementationOnce(() => { throw new Error('synthetic unavailable'); });
  h.owner().publication.notify();
  expect(h.listener.mock.lastCall![0]).toEqual({ state: 'unavailable' });
  h.inspect.mockClear(); vi.advanceTimersByTime(1000);
  expect(h.inspect).toHaveBeenCalledTimes(1); expect(h.listener.mock.lastCall![0].state).toBe('ready');
  vi.advanceTimersByTime(1000); expect(h.inspect).toHaveBeenCalledTimes(1); h.release();
});

it('invalidates all subscribed skip tokens after a direct fresh read fails', () => {
  const h = pollingHarness(); const second = vi.fn(); const release = h.inspector.subscribe(second);
  h.inspect.mockImplementationOnce(() => { throw new Error('synthetic direct failure'); });
  expect(h.inspector.read()).toEqual({ state: 'unavailable' });
  h.inspect.mockClear(); vi.advanceTimersByTime(1000);
  expect(h.inspect).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(1000); expect(h.inspect).toHaveBeenCalledTimes(2);
  expect(h.listener).toHaveBeenCalledTimes(1); expect(second).toHaveBeenCalledTimes(1);
  release(); h.release();
});

it('retries after revision failure and falls back for stores without revision', () => {
  const h = pollingHarness(); const original = h.owner().host.store.revision!;
  vi.spyOn(h.owner().host.store, 'revision').mockImplementation(() => { throw new Error('synthetic revision unavailable'); });
  h.inspect.mockClear(); vi.advanceTimersByTime(2000); expect(h.inspect).toHaveBeenCalledTimes(2);
  h.owner().host.store.revision = undefined;
  vi.advanceTimersByTime(2000); expect(h.inspect).toHaveBeenCalledTimes(4);
  h.owner().host.store.revision = original;
  vi.advanceTimersByTime(2000); expect(h.inspect).toHaveBeenCalledTimes(5); h.release();
});

it('does not admit a source that changes during its actual inspection', () => {
  const h = pollingHarness();
  // The spy retains its original implementation, so use the actual owner read port.
  const read = h.owner().host.store.read;
  vi.spyOn(h.owner().host.store, 'read').mockImplementationOnce(() => {
    const result = read(); fs.appendFileSync(h.statePath, ' '); return result;
  });
  h.owner().publication.notify(); h.inspect.mockClear();
  vi.advanceTimersByTime(1000); expect(h.inspect).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1000); expect(h.inspect).toHaveBeenCalledTimes(1);
  h.release();
});

it('forces immediate native inspection and retains process-only unknown evidence', () => {
  const h = pollingHarness(); const id = h.plan();
  vi.advanceTimersByTime(1000); const saved = h.service.scanRecord(id);
  const bytes = fs.readFileSync(h.statePath);
  h.owner().publication.scans.set(id, { ...saved, durability: 'unknown' });
  h.inspect.mockClear(); h.owner().publication.notify();
  expect(h.inspect).toHaveBeenCalledTimes(1);
  expect(h.listener.mock.lastCall![0]).toMatchObject({ state: 'ready', snapshot: { items: [{ id, durability: 'unknown' }] } });
  expect(fs.readFileSync(h.statePath)).toEqual(bytes); expect(h.run).not.toHaveBeenCalled();
  vi.advanceTimersByTime(1000); expect(h.inspect).toHaveBeenCalledTimes(1); h.release();
});

it('never skips stale session objects or a replaced physical workspace', () => {
  const h = pollingHarness(); h.context.session = { ...h.session };
  vi.advanceTimersByTime(1000); expect(h.listener.mock.lastCall![0]).toEqual({ state: 'stale' });
  h.context.session = h.session;
  fs.renameSync(h.root, h.root+'.held'); fs.mkdirSync(h.root);
  h.inspect.mockClear(); vi.advanceTimersByTime(1000); expect(h.inspect).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1000); expect(h.inspect).toHaveBeenCalledTimes(1);
  h.release();
});

it('rechecks an ancestor replacement even when original session files keep their identities', () => {
  const h = pollingHarness(); const directory = h.manager.getSessionDirPath(h.session.id);
  const before = fs.statSync(directory); const parent = path.dirname(directory);
  fs.renameSync(parent, parent+'.held'); fs.mkdirSync(parent);
  fs.renameSync(path.join(parent+'.held', h.session.id), directory);
  expect(fs.statSync(directory).ino).toBe(before.ino);
  h.inspect.mockClear(); vi.advanceTimersByTime(1000);
  expect(h.inspect).toHaveBeenCalledTimes(1); expect(h.listener.mock.lastCall![0].state).toBe('ready');
  vi.advanceTimersByTime(1000); expect(h.inspect).toHaveBeenCalledTimes(1); h.release();
});

it('suppresses a queued native callback and publication after release during an inspection', () => {
  const h = pollingHarness(); const subscribe = vi.spyOn(h.owner(), 'subscribeInspection');
  const listener = vi.fn(); const release = h.inspector.subscribe(listener);
  const queued = subscribe.mock.calls[0]![0];
  const read = h.owner().host.store.read;
  vi.spyOn(h.owner().host.store, 'read').mockImplementationOnce(() => { release(); return read(); });
  h.owner().publication.notify();
  const count = listener.mock.calls.length; h.inspect.mockClear(); queued();
  expect(listener).toHaveBeenCalledTimes(count); expect(h.inspect).not.toHaveBeenCalled();
  expect(count).toBe(1); h.release();
});

it('does not acquire source bodies when revision checking synchronously closes the subscription', () => {
  const h = pollingHarness(); const revision = h.owner().host.store.revision!;
  vi.spyOn(h.owner().host.store, 'revision').mockImplementationOnce(() => { h.release(); return revision(); });
  h.inspect.mockClear(); const read = vi.spyOn(fs, 'readSync');
  h.owner().publication.notify();
  expect(h.inspect).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
  expect(h.listener).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
});

it('observes external evidence and storage failure only while subscribed, without invoking a tool gate', () => {
  const h = createSecurityHarness();
  const context = { session: h.session, cwd: h.root } as ShellRuntimeContext;
  const gate = vi.fn(h.host.gate);
  installSecurityRuntime(context, h.manager, { getCurrentRunController: () => null } as unknown as ShellSessionRuntime, gate);
  const inspector = securityInspectorFor(context)!;
  const statePath = path.join(h.manager.getSessionDirPath(h.session.id), 'state.json');
  const initialBytes = fs.readFileSync(statePath);
  expect(inspector.read().state).toBe('ready');
  vi.useFakeTimers();
  const listener = vi.fn();
  const release = inspector.subscribe(listener);
  expect(fs.readFileSync(statePath)).toEqual(initialBytes);
  expect(vi.getTimerCount()).toBe(1);
  const id = h.plan();
  vi.advanceTimersByTime(1000);
  expect(listener.mock.lastCall![0]).toMatchObject({ state: 'ready', snapshot: { items: [{ id }] } });
  const beforeLoss = fs.readFileSync(statePath);
  fs.renameSync(statePath, statePath + '.held');
  vi.advanceTimersByTime(1000);
  expect(listener.mock.lastCall![0]).toEqual({ state: 'unavailable' });
  fs.renameSync(statePath + '.held', statePath);
  vi.advanceTimersByTime(1000);
  expect(listener.mock.lastCall![0].state).toBe('ready');
  expect(fs.readFileSync(statePath)).toEqual(beforeLoss);
  release(); release();
  expect(vi.getTimerCount()).toBe(0);
  const count = listener.mock.calls.length;
  h.plan(); vi.advanceTimersByTime(2000);
  expect(listener).toHaveBeenCalledTimes(count);
  expect(gate).not.toHaveBeenCalled(); expect(h.run).not.toHaveBeenCalled();
});

it('refuses a captured inspector when its session object or workspace changes', () => {
  const h = createSecurityHarness();
  const context = { session: h.session, cwd: h.root } as ShellRuntimeContext;
  installSecurityRuntime(context, h.manager, { getCurrentRunController: () => null } as unknown as ShellSessionRuntime, h.host.gate);
  const inspector = securityInspectorFor(context)!;
  context.cwd = path.join(h.root, 'other');
  expect(inspector.read()).toEqual({ state: 'stale' });
  context.cwd = h.root;
  context.session = { ...h.session };
  expect(inspector.read()).toEqual({ state: 'stale' });
  expect(securityInspectorFor(context)!.read().state).toBe('ready');
});

it('reopens on the current workspace after a same-session project-root rebind', () => {
  const h = createSecurityHarness();
  const context = { session: h.session, cwd: h.root } as ShellRuntimeContext;
  installSecurityRuntime(context, h.manager, { getCurrentRunController: () => null } as unknown as ShellSessionRuntime, h.host.gate);
  const original = securityInspectorFor(context)!;
  const target = path.join(h.directory, 'rebound'); fs.mkdirSync(target);
  const directory = h.manager.getSessionDirPath(h.session.id);
  for (const name of ['metadata.json', 'state.json']) {
    const file = path.join(directory, name); const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify({ ...value, projectRoot: target }));
  }
  context.session = { ...h.session, projectRoot: target }; context.cwd = target;
  expect(original.read()).toEqual({ state: 'stale' });
  expect(securityInspectorFor(context)!.read()).toMatchObject({ state: 'ready', snapshot: { identity: { sessionId: h.session.id, workspaceRoot: target } } });
  expect(h.run).not.toHaveBeenCalled();
});

it('preserves process-only observed receipts across same-binding session object refreshes', async () => {
  const h = createSecurityHarness(); const id = h.plan(); await h.service.scan(id);
  const context = { session: h.session, cwd: h.root } as ShellRuntimeContext;
  installSecurityRuntime(context, h.manager, { getCurrentRunController: () => null } as unknown as ShellSessionRuntime, h.host.gate);
  const inspect = SecurityService.prototype.inspection;
  const owners: SecurityService[] = [];
  vi.spyOn(SecurityService.prototype, 'inspection').mockImplementation(function (this: SecurityService) {
    owners.push(this); return inspect.call(this);
  });
  securityInspectorFor(context)!.read();
  const owner = owners[0]!;
  const observed = { ...h.service.scanRecord(id), durability: 'unknown' as const };
  expect(observed.receipts).toHaveLength(3);
  owner.publication.scans.set(id, observed);
  context.session = { ...h.session };
  const next = securityInspectorFor(context)!.read();
  expect(owners.at(-1)).toBe(owner);
  expect(next).toMatchObject({ state: 'ready', snapshot: { items: [{ id, status: 'completed', durability: 'unknown' }] } });
});
