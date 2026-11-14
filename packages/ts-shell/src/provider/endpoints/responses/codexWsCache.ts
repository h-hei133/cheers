import { createHash } from "node:crypto";
import { WebSocket } from "ws";
import type { ProviderConnectionLifetime, ProviderSocketOptions } from '../../request/connection.js';
import { assertAdmission } from '../../../core/network/admission.js';
import { connectWebSocket } from './socket.js';

const SESSION_WEBSOCKET_CACHE_TTL_MS = 5 * 60_000;
const SESSION_WEBSOCKET_MAX_AGE_MS = 55 * 60_000;
const WEBSOCKET_CONNECT_TIMEOUT_MS = 15_000;
const MAX_CACHED_WEBSOCKETS = 64;

interface CachedWebSocketConnection {
  readonly socket: WebSocket;
  readonly idleErrorHandler: () => void;
  readonly createdAt: number;
  lastUsedAt: number;
  busy: boolean;
  retired: boolean;
  idleTimer?: ReturnType<typeof setTimeout>;
  readonly lifetime?: ProviderConnectionLifetime;
  readonly onOwnerAbort: () => void;
  readonly onClose: () => void;
}

const sessionWebSockets = new Map<string, CachedWebSocketConnection>();
const websocketSseFallbackSessions = new Map<string, { readonly lifetime?: ProviderConnectionLifetime; readonly onAbort: () => void }>();

function evictCachedSocket(cacheKey: string, entry: CachedWebSocketConnection): void {
  if (entry.retired) return;
  entry.retired = true;
  clearTimeout(entry.idleTimer);
  entry.lifetime?.signal.removeEventListener('abort', entry.onOwnerAbort);
  if (sessionWebSockets.get(cacheKey) === entry) {
    sessionWebSockets.delete(cacheKey);
  }
  entry.socket.off("error", entry.idleErrorHandler);
  entry.socket.off('close', entry.onClose);
  entry.socket.once('error', () => {});
  entry.socket.terminate();
}

function idleSocket(cacheKey: string, entry: CachedWebSocketConnection): void {
  if (entry.retired || entry.lifetime?.signal.aborted || entry.socket.readyState !== WebSocket.OPEN) {
    evictCachedSocket(cacheKey, entry);
    return;
  }
  entry.socket.on('error', entry.idleErrorHandler);
  const remaining = Math.min(SESSION_WEBSOCKET_CACHE_TTL_MS,
    Math.max(0, entry.createdAt + SESSION_WEBSOCKET_MAX_AGE_MS - Date.now()));
  entry.idleTimer = setTimeout(() => evictCachedSocket(cacheKey, entry), remaining);
  entry.idleTimer.unref();
}

function cachedLease(cacheKey: string, entry: CachedWebSocketConnection) {
  clearTimeout(entry.idleTimer);
  entry.idleTimer = undefined;
  entry.socket.off('error', entry.idleErrorHandler);
  entry.busy = true;
  let released = false;
  return { socket: entry.socket, release: (broken = false) => {
    if (released || entry.retired) return;
    released = true;
    entry.busy = false;
    entry.lastUsedAt = Date.now();
    if (broken) evictCachedSocket(cacheKey, entry);
    else idleSocket(cacheKey, entry);
  } };
}

function pruneWebSocketCache(now: number): void {
  for (const [key, entry] of sessionWebSockets) {
    if (entry.busy) continue;
    const expired = now - entry.lastUsedAt > SESSION_WEBSOCKET_CACHE_TTL_MS || now - entry.createdAt > SESSION_WEBSOCKET_MAX_AGE_MS;
    if (expired || entry.socket.readyState !== WebSocket.OPEN) {
      evictCachedSocket(key, entry);
    }
  }
  while (sessionWebSockets.size >= MAX_CACHED_WEBSOCKETS) {
    const oldest = [...sessionWebSockets].filter(([, entry]) => !entry.busy)
      .sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt)[0];
    if (!oldest) break;
    evictCachedSocket(oldest[0], oldest[1]);
  }
}

export function buildSocketCacheKey(sessionKey: string, url: string, token: string, accountId?: string,
  transport?: ProviderSocketOptions): string {
  const credentialDigest = createHash("sha256")
    .update(`${url}\0${token}\0${accountId ?? ""}`)
    .update(JSON.stringify(transport ? [transport.proxyUrl, transport.connectTimeoutMs,
      transport.headersTimeoutMs, transport.bodyTimeoutMs, transport.lifetime?.id] : []))
    .digest("hex")
    .slice(0, 24);
  return `${credentialDigest}:${sessionKey}`;
}

function fallbackKey(sessionKey: string, lifetime?: ProviderConnectionLifetime): string {
  return JSON.stringify([lifetime?.id, sessionKey]);
}

function removeFallback(key: string): void {
  const entry = websocketSseFallbackSessions.get(key);
  entry?.lifetime?.signal.removeEventListener('abort', entry.onAbort);
  websocketSseFallbackSessions.delete(key);
}

export function markWebSocketSseFallback(sessionKey: string, lifetime?: ProviderConnectionLifetime): void {
  if (lifetime?.signal.aborted) return;
  const key = fallbackKey(sessionKey, lifetime);
  removeFallback(key);
  const onAbort = () => removeFallback(key);
  websocketSseFallbackSessions.set(key, { lifetime, onAbort });
  lifetime?.signal.addEventListener('abort', onAbort, { once: true });
  if (websocketSseFallbackSessions.size > MAX_CACHED_WEBSOCKETS) {
    removeFallback(websocketSseFallbackSessions.keys().next().value!);
  }
  const suffix = `:${sessionKey}`;
  for (const [key, entry] of sessionWebSockets) {
    if ((key === sessionKey || key.endsWith(suffix)) && entry.lifetime?.id === lifetime?.id) {
      evictCachedSocket(key, entry);
    }
  }
}

export function isWebSocketSseFallbackActive(sessionKey: string | undefined, lifetime?: ProviderConnectionLifetime): boolean {
  return sessionKey ? websocketSseFallbackSessions.has(fallbackKey(sessionKey, lifetime)) : false;
}

export function clearCodexWebSocketCache(): void {
  for (const [key, entry] of sessionWebSockets) {
    evictCachedSocket(key, entry);
  }
  for (const key of websocketSseFallbackSessions.keys()) removeFallback(key);
}


export async function acquireCodexWebSocket(
  cacheKey: string | undefined,
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
  options: ProviderSocketOptions = { connectTimeoutMs: WEBSOCKET_CONNECT_TIMEOUT_MS,
    headersTimeoutMs: WEBSOCKET_CONNECT_TIMEOUT_MS, bodyTimeoutMs: 120_000 },
): Promise<{ readonly socket: WebSocket; readonly release: (broken?: boolean) => void }> {
  const lifetime = options.lifetime;
  if (lifetime && cacheKey) cacheKey = `${lifetime.id}:${cacheKey}`;
  lifetime?.signal.throwIfAborted();
  if (lifetime) signal = signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal;
  signal?.throwIfAborted();
  assertAdmission(options.admission);
  const now = Date.now();
  pruneWebSocketCache(now);

  if (cacheKey) {
    const existing = sessionWebSockets.get(cacheKey);
    if (existing && !existing.busy) {
      const expired = now - existing.lastUsedAt > SESSION_WEBSOCKET_CACHE_TTL_MS || now - existing.createdAt > SESSION_WEBSOCKET_MAX_AGE_MS;
      if (expired || existing.socket.readyState !== WebSocket.OPEN) {
        evictCachedSocket(cacheKey, existing);
      } else {
        existing.lastUsedAt = now;
        return cachedLease(cacheKey, existing);
      }
    }
  }

  const socket = await connectWebSocket(url, headers, signal, options);
  try { signal?.throwIfAborted(); assertAdmission(options.admission); }
  catch (error) { socket.once('error', () => {}); socket.terminate(); throw error; }
  if (cacheKey && !sessionWebSockets.has(cacheKey) && sessionWebSockets.size < MAX_CACHED_WEBSOCKETS) {
    const key = cacheKey;
    const entry: CachedWebSocketConnection = {
      socket,
      idleErrorHandler: () => evictCachedSocket(key, entry),
      createdAt: now,
      lastUsedAt: now,
      busy: true,
      retired: false,
      lifetime,
      onOwnerAbort: () => evictCachedSocket(key, entry),
      onClose: () => evictCachedSocket(key, entry),
    };
    sessionWebSockets.set(key, entry);
    lifetime?.signal.addEventListener('abort', entry.onOwnerAbort, { once: true });
    socket.once('close', entry.onClose);
    return cachedLease(key, entry);
  }
  const terminate = () => { socket.once('error', () => {}); socket.terminate(); };
  const detach = () => lifetime?.signal.removeEventListener('abort', terminate);
  lifetime?.signal.addEventListener('abort', terminate, { once: true });
  socket.once('close', detach);
  let released = false;
  return {
    socket,
    release: () => {
      if (released) return;
      released = true;
      detach();
      terminate();
    },
  };
}
