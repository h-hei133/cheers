import { afterEach, expect, it, vi } from 'vitest';
import { CollaborationHost } from './client/host.js';
import type { CollaborationClient } from './client/service.js';
import type { QueryEvent } from '../core/query/runtime/events.js';
import { bound, emptySnapshot } from './__tests__/fixture.js';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

it('invalidates and releases the observer immediately when local identity inspection throws', async () => {
  vi.useFakeTimers(); let observer!: (event: QueryEvent) => void;
  const request = vi.fn(); const unsubscribe = vi.fn(); const active = new AbortController();
  const invalid = vi.fn(() => active.abort());
  const client = { request, profile: { check() {} } } as unknown as CollaborationClient;
  const host = new CollaborationHost(client, bound, { roomId: 'room', epoch: 'epoch', sequence: 0,
    expiresAt: Date.now() + 5000, owner: { generation: 1, token: 'opaque' } }, {
    observe: callback => { observer = callback; return unsubscribe; },
    current: () => { throw new Error('Synthetic identity failure'); }, invalid, updated() {}, snapshot: () => emptySnapshot,
  });
  host.start();
  expect(() => observer({ type: 'query.started', sessionId: 's', prompt: 'x' })).not.toThrow();
  expect(host.status()).toBe('disconnected'); expect(active.signal.aborted).toBe(true);
  expect(invalid).toHaveBeenCalledOnce(); expect(unsubscribe).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1000); expect(request).not.toHaveBeenCalled();
  await host.close(false);
});
