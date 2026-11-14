import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';
import { acquireCodexWebSocket, clearCodexWebSocketCache, isWebSocketSseFallbackActive, markWebSocketSseFallback } from './codexWsCache.js';
import { connectWebSocket } from './socket.js';
import type { ProviderConnectionLifetime } from '../../request/connection.js';

vi.mock('./socket.js', () => ({ connectWebSocket: vi.fn() }));

class FixtureSocket extends EventEmitter {
  readyState: number = WebSocket.OPEN;
  terminate = vi.fn(() => { this.readyState = WebSocket.CLOSED; this.emit('close'); this.emit('error', new Error('retired')); });
}

function owner(id: string) {
  const controller = new AbortController();
  const lifetime: ProviderConnectionLifetime = { id, signal: controller.signal };
  return { controller, options: { lifetime, connectTimeoutMs: 1000, headersTimeoutMs: 1000, bodyTimeoutMs: 1000 } };
}

function readySocket() {
  const socket = new FixtureSocket();
  vi.mocked(connectWebSocket).mockResolvedValueOnce(socket as unknown as WebSocket);
  return socket;
}

afterEach(() => { clearCodexWebSocketCache(); vi.resetAllMocks(); vi.useRealTimers(); });

describe('WebSocket connection lifetime', () => {
  it('closes idle sockets at the deadline without a later acquisition and cancels lease timers', async () => {
    vi.useFakeTimers();
    const socket = readySocket();
    const scope = owner('idle');
    const lease = await acquireCodexWebSocket('same', 'ws://fixture.invalid', {}, undefined, scope.options);
    lease.release();
    await vi.advanceTimersByTimeAsync(4 * 60_000);
    const reused = await acquireCodexWebSocket('same', 'ws://fixture.invalid', {}, undefined, scope.options);
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    expect(socket.terminate).not.toHaveBeenCalled();
    reused.release();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(socket.terminate).toHaveBeenCalledOnce();
    expect(socket.listenerCount('error')).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('isolates identical credentials/cache keys across two owners and closes only the cancelled owner', async () => {
    const first = owner('sdk-A');
    const second = owner('sdk-B');
    const a = readySocket();
    const leaseA = await acquireCodexWebSocket('same', 'ws://fixture.invalid', {}, undefined, first.options);
    const b = readySocket();
    const leaseB = await acquireCodexWebSocket('same', 'ws://fixture.invalid', {}, undefined, second.options);
    first.controller.abort();
    expect(a.terminate).toHaveBeenCalledOnce();
    expect(b.terminate).not.toHaveBeenCalled();
    leaseA.release();
    leaseB.release();
    const again = await acquireCodexWebSocket('same', 'ws://fixture.invalid', {}, undefined, second.options);
    expect(again.socket).toBe(b);
    again.release();
    second.controller.abort();
  });

  it('rejects pending acquisition after owner reset and never caches a late ready socket', async () => {
    const old = owner('old');
    const late = new FixtureSocket();
    let ready!: (socket: WebSocket) => void;
    vi.mocked(connectWebSocket).mockImplementationOnce(() => new Promise<WebSocket>(resolve => { ready = resolve; }));
    const pending = acquireCodexWebSocket('same', 'ws://fixture.invalid', {}, undefined, old.options);
    old.controller.abort();
    ready(late as unknown as WebSocket);
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(late.terminate).toHaveBeenCalledOnce();
    const next = owner('replacement');
    const fresh = readySocket();
    const lease = await acquireCodexWebSocket('same', 'ws://fixture.invalid', {}, undefined, next.options);
    expect(lease.socket).toBe(fresh);
    lease.release();
    next.controller.abort();
  });

  it('keeps fallback state owner-specific and clears it on owner cancellation', () => {
    const first = owner('A');
    const second = owner('B');
    markWebSocketSseFallback('same', first.options.lifetime);
    expect(isWebSocketSseFallbackActive('same', first.options.lifetime)).toBe(true);
    expect(isWebSocketSseFallbackActive('same', second.options.lifetime)).toBe(false);
    first.controller.abort();
    expect(isWebSocketSseFallbackActive('same', first.options.lifetime)).toBe(false);
  });
});
