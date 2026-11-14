import { expect, it } from 'vitest';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { CompactionSetup } from '../../turn/session.js';
import { currentProviderConnections } from '../../provider/request/connection.js';
import { createProviderConnections } from './connections.js';

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
