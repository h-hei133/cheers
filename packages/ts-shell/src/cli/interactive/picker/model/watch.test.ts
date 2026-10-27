import { expect, it, vi } from 'vitest';
import { watchModels } from './watch.js';
import type { CommandContext } from '../../../../core/commands/types.js';

it('refreshes only changed publication and discards a late refresh after close', async () => {
  vi.useFakeTimers();
  let revision = 1; const publish = vi.fn();
  let resolve!: (rows: readonly { id: string; label: string }[]) => void;
  const load = vi.fn(() => new Promise<readonly { id: string; label: string }[]>(done => { resolve = done; }));
  const context = { readConfiguration: () => ({ revision }) } as unknown as CommandContext;
  const close = watchModels(context, load, publish);
  try {
    await vi.advanceTimersByTimeAsync(500); expect(load).not.toHaveBeenCalled();
    revision++;
    await vi.advanceTimersByTimeAsync(500); expect(load).toHaveBeenCalledOnce();
    resolve([{ id: 'ready', label: 'ready' }]); await vi.advanceTimersByTimeAsync(0);
    expect(publish).toHaveBeenCalledWith([{ id: 'ready', label: 'ready' }]);
    revision++;
    await vi.advanceTimersByTimeAsync(500); close();
    resolve([{ id: 'late', label: 'late' }]); await vi.advanceTimersByTimeAsync(0);
    expect(publish).toHaveBeenCalledOnce();
  } finally { close(); vi.useRealTimers(); }
});

it('publishes a failure instead of retaining changed rows when reload rejects', async () => {
  vi.useFakeTimers();
  let revision = 1; const publish = vi.fn(), failed = vi.fn();
  const load = vi.fn()
    .mockRejectedValueOnce(new Error('rejected catalogue'))
    .mockResolvedValueOnce([{ id: 'fresh', label: 'fresh' }]);
  const context = { readConfiguration: () => ({ revision }) } as unknown as CommandContext;
  const close = watchModels(context, load, publish, undefined, failed);
  try {
    revision++;
    await vi.advanceTimersByTimeAsync(500);
    expect(failed).toHaveBeenCalledOnce(); expect(publish).not.toHaveBeenCalled();
    revision++;
    await vi.advanceTimersByTimeAsync(500);
    expect(publish).toHaveBeenCalledWith([{ id: 'fresh', label: 'fresh' }]);
  } finally { close(); vi.useRealTimers(); }
});

it('publishes a failure when the accepted revision cannot be read', async () => {
  vi.useFakeTimers();
  let reads = 0; const fail = vi.fn();
  const context = { readConfiguration: () => {
    if (++reads === 1) return { revision: 1 };
    throw new Error('configuration unavailable');
  } } as unknown as CommandContext;
  const close = watchModels(context, vi.fn(async () => []), vi.fn(), undefined, fail);
  try {
    await vi.advanceTimersByTimeAsync(500);
    expect(fail).toHaveBeenCalledOnce();
  } finally { close(); vi.useRealTimers(); }
});
