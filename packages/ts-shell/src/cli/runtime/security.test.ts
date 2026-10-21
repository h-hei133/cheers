import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import { createSecurityHarness, cleanupSecurityHarnesses } from '../../test-utils/security.js';
import { installSecurityRuntime, securityInspectorFor } from './security.js';
import { SecurityService } from '../../security/service.js';

afterEach(() => { vi.useRealTimers(); cleanupSecurityHarnesses(); });

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
