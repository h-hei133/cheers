import { expect, it } from 'vitest';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { CompactionSetup } from '../../turn/session.js';
import { currentProviderConnections } from '../../provider/request/connection.js';
import { createProviderConnections } from './connections.js';
import type { PreparedTurnContext } from '../../turn/context/contract.js';

it('captures workspace/profile identity and blocks late callbacks after reset', async () => {
  const context = { session: { id: 'session', createdAt: 'created' }, projectRoot: '/A', cwd: '/A',
    profile: { id: 'profile', rootIdentity: 'original' } } as unknown as ShellRuntimeContext;
  const connections = createProviderConnections(context);
  const original = connections.capture();
  let calls = 0;
  const summarize = Object.assign(async () => { calls++; return currentProviderConnections()!.id; },
    { dispatchAware: true, preflight: () => {} });
  const setup = connections.compaction({ summarize } as unknown as CompactionSetup, original);
  expect(setup.summarize.dispatchAware).toBe(true);
  expect(setup.summarize.preflight).toBe(summarize.preflight);
  expect(await setup.summarize({ messages: [] })).toBe(original.id);
  context.cwd = '/B';
  const next = connections.capture();
  expect(next.id).not.toBe(original.id);
  expect(original.signal.aborted).toBe(true);
  expect(() => setup.summarize({ messages: [] })).toThrow();
  expect(calls).toBe(1);
  expect(connections.reset()).toBe('reset');
  expect(next.signal.aborted).toBe(true);
});

it('retains asynchronous summary preparation and its later send under the same connection owner', async () => {
  const context = { session: { id: 'prepared', createdAt: 'created' }, projectRoot: '/A', cwd: '/A' } as unknown as ShellRuntimeContext;
  const connections = createProviderConnections(context);
  const owner = connections.capture();
  let sends = 0;
  const summarize = Object.assign(async () => 'unused', { prepare: async () => {
    expect(currentProviderConnections()!.id).toBe(owner.id);
    await Promise.resolve();
    return { identity: 'capture', tokens: 1, send: async () => { sends++; return currentProviderConnections()!.id; } };
  } });
  const setup = connections.compaction({ summarize, summarizeTurnPrefix: Object.assign(async () => 'unused',
    { prepare: summarize.prepare }) } as unknown as CompactionSetup, owner);
  const history = await setup.summarize.prepare!({ messages: [] });
  const prefix = await setup.summarizeTurnPrefix!.prepare!([]);
  expect(await history.send()).toBe(owner.id);
  connections.reset();
  expect(() => prefix.send()).toThrow();
  expect(sends).toBe(1);
});

it('carries request-bound history and prefix summaries through the original connection lifetime', async () => {
  const context = { session: { id: 'bound', createdAt: 'created' }, projectRoot: '/A', cwd: '/A' } as unknown as ShellRuntimeContext;
  const connections = createProviderConnections(context), owner = connections.capture();
  let sends = 0;
  const prepare = async () => {
    expect(currentProviderConnections()?.id).toBe(owner.id);
    return { identity: 'physical', tokens: 1, send: async () => { sends++; return currentProviderConnections()!.id; } };
  };
  const summarize = Object.assign(async () => 'unused', { prepare });
  const binding = { policy: { contextWindow: 1000 }, summarize, summarizeTurnPrefix: Object.assign(async () => 'unused', { prepare }) };
  const setup = connections.compaction({ ...binding, onCompact: () => {}, forRequest: () => {
    expect(currentProviderConnections()?.id).toBe(owner.id); return binding;
  } }, owner);
  const bound = setup.forRequest!({} as PreparedTurnContext, () => undefined);
  const history = await bound.summarize.prepare!({ messages: [] });
  const prefix = await bound.summarizeTurnPrefix!.prepare!([]);
  expect(await history.send()).toBe(owner.id);
  connections.reset();
  expect(() => prefix.send()).toThrow(); expect(sends).toBe(1);
  expect(() => setup.forRequest!({} as PreparedTurnContext, () => undefined)).toThrow();
});
