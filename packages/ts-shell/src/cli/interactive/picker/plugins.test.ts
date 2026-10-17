import { beforeEach, expect, it, vi } from 'vitest';
import { pluginPicker } from './plugins.js';
import type { CommandContext } from '../../../core/commands/types.js';

const { calls, runPluginCommand } = vi.hoisted(() => {
  const calls: string[][] = [];
  const runPluginCommand = async (args: readonly string[]) => {
    calls.push([...args]);
    return { kind: 'local' as const, output: `${args[0]} ${args[1]}` };
  };
  return { calls, runPluginCommand };
});
vi.mock('../../../core/commands/pluginCommandRuntime.js', () => ({
  getInstalledPlugins: () => [
    { name: 'alpha', description: 'first', version: '1', enabled: true },
    { name: 'beta', description: 'second', version: '2', enabled: true },
  ],
  runPluginCommand,
}));

const context = { cwd: '/workspace' } as CommandContext;

beforeEach(() => { calls.length = 0; });

it('confirms each change before running it', async () => {
  const picker = pluginPicker(context);
  expect((await picker.load()).map(row => row.id)).toEqual(['alpha', 'beta']);
  const first = (await picker.apply([]))!.next!;
  expect(first.title).toContain('disable alpha');
  const second = (await first.apply(['apply']))!.next!;
  expect(second.title).toContain('disable beta');
  expect(calls[0]).toEqual(['disable', 'alpha']);
  const done = await second.apply(['apply']);
  expect(done?.note).toContain('disable beta');
  expect(calls).toHaveLength(2);
});

it('skips one change and cancels the rest', async () => {
  const picker = pluginPicker(context);
  const first = (await picker.apply([]))!.next!;
  const second = (await first.apply(['skip']))!.next!;
  expect(calls).toHaveLength(0);
  const cancelled = await second.apply(['cancel']);
  expect(cancelled?.note).toContain('cancelled');
  expect(calls).toHaveLength(0);
});
