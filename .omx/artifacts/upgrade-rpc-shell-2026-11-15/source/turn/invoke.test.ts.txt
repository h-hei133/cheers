import { expect, it, vi } from 'vitest';
import { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import { runPreparedTool } from './invoke.js';
import type { QueryEvent } from '../core/query/runtime/events.js';

it('settles a direct native tool failure after post hooks reject without losing effect evidence', async () => {
  const hooks = new HookDispatcher(), events: QueryEvent[] = [];
  vi.spyOn(hooks, 'dispatch').mockImplementation(async event => {
    if (event.eventName === 'PostToolUse') throw new Error('private hook detail');
    return { decision: 'allow', stopChecks: [] };
  });
  const result = await runPreparedTool({ name: 'read', description: 'Observed tool', argsSchema: { type: 'object' },
    execute: async () => ({ success: true, output: 'actual native effect', metadata: { status: 'completed', exitCode: 0 } }) },
  {}, { workspaceRoot: process.cwd(), sessionId: 'native', permissionScope: 'allow-all', hooks, emit: event => { events.push(event); } });
  expect(result).toMatchObject({ isError: true, output: expect.stringContaining('actual native effect'), metadata: { status: 'completed', exitCode: 0 } });
  expect(events.filter(event => event.type === 'tool.result')).toEqual([
    expect.objectContaining({ success: false, output: expect.stringContaining('actual native effect') }),
  ]);
  expect(JSON.stringify(events)).not.toContain('private hook detail');
});

it('keeps the observed native result when recording the result event fails', async () => {
  const hooks = new HookDispatcher();
  vi.spyOn(hooks, 'dispatch').mockResolvedValue({ decision: 'allow', stopChecks: [] });
  const result = await runPreparedTool({ name: 'read', description: 'Observed tool', argsSchema: { type: 'object' },
    execute: async () => ({ success: true, output: 'native output before event failure', metadata: { status: 'completed', exitCode: 0 } }) },
  {}, { workspaceRoot: process.cwd(), sessionId: 'native', permissionScope: 'allow-all', hooks,
    emit: event => { if (event.type === 'tool.result') throw new Error('private event store failure'); } });
  expect(result).toMatchObject({ isError: true, output: expect.stringContaining('native output before event failure'),
    metadata: { status: 'completed', exitCode: 0 } });
  expect(result.output).not.toContain('private event store failure');
});

it('settles a started event whose recording throws before native execution', async () => {
  const hooks = new HookDispatcher(), events: QueryEvent[] = [];
  vi.spyOn(hooks, 'dispatch').mockResolvedValue({ decision: 'allow', stopChecks: [] });
  const execute = vi.fn(async () => ({ success: true, output: 'must not execute' }));
  const result = await runPreparedTool({ name: 'read', description: 'Observed tool', argsSchema: { type: 'object' }, execute },
    {}, { workspaceRoot: process.cwd(), sessionId: 'native', permissionScope: 'allow-all', hooks,
      emit: event => { events.push(event); if (event.type === 'tool.started') throw new Error('private state write failure'); } });
  expect(execute).not.toHaveBeenCalled();
  expect(result.isError).toBe(true);
  expect(events.filter(event => event.type === 'tool.result')).toEqual([
    expect.objectContaining({ success: false, output: result.output }),
  ]);
  expect(JSON.stringify(events)).not.toContain('private state write failure');
});
