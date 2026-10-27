import { expect, it, vi } from 'vitest';
import { watchModels } from './watch.js';
import type { CommandContext } from '../../../../core/commands/types.js';
import { catalogueDetailSource, modelDetailsPicker, type ModelDetailRecord } from './details.js';
import { OverlayHost } from '../../overlay.js';
import { stripAnsi } from '../../../../presentation/tui/text/ansi.js';

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

it('discards a superseded refresh and waits for it to drain before loading the current publication', async () => {
  vi.useFakeTimers();
  let revision = 1;
  let resolve!: (rows: readonly { id: string; label: string }[]) => void;
  const publish = vi.fn(), fail = vi.fn();
  const load = vi.fn()
    .mockImplementationOnce(() => new Promise<readonly { id: string; label: string }[]>(done => { resolve = done; }))
    .mockResolvedValue([{ id: 'current', label: 'current' }]);
  const context = { readConfiguration: () => ({ revision }) } as unknown as CommandContext;
  const close = watchModels(context, load, publish, 1, fail);
  try {
    revision = 2;
    await vi.advanceTimersByTimeAsync(500);
    revision = 3;
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenCalledOnce();
    resolve([{ id: 'retired', label: 'retired' }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(publish).not.toHaveBeenCalled();
    expect(fail).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(500);
    expect(load).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith([{ id: 'current', label: 'current' }]);
    await vi.advanceTimersByTimeAsync(500);
    expect(load).toHaveBeenCalledTimes(2);
  } finally { close(); vi.useRealTimers(); }
});

it('withholds a completed refresh when the final publication cannot be verified and retries after recovery', async () => {
  vi.useFakeTimers();
  let revision = 1, readable = true;
  let resolve!: (rows: readonly { id: string; label: string }[]) => void;
  const publish = vi.fn(), fail = vi.fn();
  const load = vi.fn()
    .mockImplementationOnce(() => new Promise<readonly { id: string; label: string }[]>(done => { resolve = done; }))
    .mockResolvedValue([{ id: 'verified', label: 'verified' }]);
  const context = { readConfiguration: () => {
    if (!readable) throw new Error('publication unavailable');
    return { revision };
  } } as unknown as CommandContext;
  const close = watchModels(context, load, publish, 1, fail);
  try {
    revision = 2;
    await vi.advanceTimersByTimeAsync(500);
    readable = false;
    resolve([{ id: 'unverified', label: 'unverified' }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(publish).not.toHaveBeenCalled();
    expect(fail).toHaveBeenCalledOnce();
    readable = true;
    await vi.advanceTimersByTimeAsync(500);
    expect(load).toHaveBeenCalledTimes(2);
    expect(publish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith([{ id: 'verified', label: 'verified' }]);
  } finally { close(); vi.useRealTimers(); }
});

it('keeps superseded model details out of the painted inspector and then shows the current catalogue', async () => {
  vi.useFakeTimers();
  let revision = 1;
  let release!: () => void;
  const pending = new Promise<void>(done => { release = done; });
  const record = (value: number): ModelDetailRecord => ({ identity: 'target', view: {
    label: 'Target', available: true, revision: value, actions: [], lines: [`Context: ${value * 1000} tokens`],
  } });
  let current = record(revision);
  const context = { readConfiguration: () => ({ revision }) } as unknown as CommandContext;
  const details = modelDetailsPicker(catalogueDetailSource({
    label: 'Target', identity: 'target', read: () => current, revision: () => revision,
    reload: async () => {
      const captured = revision;
      if (captured === 2) await pending;
      current = record(captured);
    },
    currentRows: () => ({ rows: [], crossCategory: false }),
    back: () => { throw new Error('Unexpected navigation'); },
    watch: (load, publish, observed, onFailure) => watchModels(context, load, publish, observed, onFailure),
  }));
  const host = new OverlayHost(() => {});
  host.open(details);
  const frame = () => host.render(100, 24).map(stripAnsi).join('\n');
  try {
    await vi.advanceTimersByTimeAsync(0);
    expect(frame()).toContain('Context: 1000 tokens');
    revision = 2;
    await vi.advanceTimersByTimeAsync(500);
    revision = 3;
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(frame()).not.toContain('Context: 2000 tokens');
    await vi.advanceTimersByTimeAsync(500);
    expect(frame()).toContain('Context: 3000 tokens');
    expect(frame()).not.toContain('Context: 1000 tokens');
  } finally { release(); host.close(); vi.useRealTimers(); }
});
