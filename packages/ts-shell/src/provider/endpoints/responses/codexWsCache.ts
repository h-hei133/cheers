import { createHash } from "node:crypto";
import { WebSocket } from "ws";

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
}

const sessionWebSockets = new Map<string, CachedWebSocketConnection>();
const websocketSseFallbackSessions = new Set<string>();

function evictCachedSocket(cacheKey: string, entry: CachedWebSocketConnection): void {
  if (sessionWebSockets.get(cacheKey) === entry) {
    sessionWebSockets.delete(cacheKey);
  }
  entry.socket.off("error", entry.idleErrorHandler);
  try { entry.socket.close(); } catch { /* ignore */ }
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
    const oldest = sessionWebSockets.entries().next().value;
    if (!oldest || oldest[1].busy) break;
    evictCachedSocket(oldest[0], oldest[1]);
  }
}

export function buildSocketCacheKey(sessionKey: string, url: string, token: string, accountId?: string): string {
  const credentialDigest = createHash("sha256")
    .update(`${url}\0${token}\0${accountId ?? ""}`)
    .digest("hex")
    .slice(0, 24);
  return `${credentialDigest}:${sessionKey}`;
}

export function markWebSocketSseFallback(sessionKey: string): void {
  websocketSseFallbackSessions.add(sessionKey);
  const suffix = `:${sessionKey}`;
  for (const [key, entry] of sessionWebSockets) {
    if (key === sessionKey || key.endsWith(suffix)) {
      evictCachedSocket(key, entry);
    }
  }
}

export function isWebSocketSseFallbackActive(sessionKey: string | undefined): boolean {
  return sessionKey ? websocketSseFallbackSessions.has(sessionKey) : false;
}

export function clearCodexWebSocketCache(): void {
  for (const [key, entry] of sessionWebSockets) {
    evictCachedSocket(key, entry);
  }
  websocketSseFallbackSessions.clear();
}

function connectWebSocket(url: string, headers: Record<string, string>, signal?: AbortSignal): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const socket = new WebSocket(url, { headers, handshakeTimeout: WEBSOCKET_CONNECT_TIMEOUT_MS });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      try { socket.terminate(); } catch { /* ignore */ }
      reject(new Error(`WebSocket connection timed out after ${WEBSOCKET_CONNECT_TIMEOUT_MS}ms`));
    }, WEBSOCKET_CONNECT_TIMEOUT_MS);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("open", onOpen);
      socket.off("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };
    const onOpen = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(socket);
    };
    const onError = (err: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(err instanceof Error ? err : new Error(String(err)));
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      try { socket.terminate(); } catch { /* ignore */ }
      reject(signal?.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError"));
    };
    socket.on("open", onOpen);
    socket.on("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

export async function acquireCodexWebSocket(
  cacheKey: string | undefined,
  url: string,
  headers: Record<string, string>,
  signal?: AbortSignal,
): Promise<{ readonly socket: WebSocket; readonly release: (broken?: boolean) => void }> {
  const now = Date.now();
  pruneWebSocketCache(now);

  if (cacheKey) {
    const existing = sessionWebSockets.get(cacheKey);
    if (existing && !existing.busy) {
      const expired = now - existing.lastUsedAt > SESSION_WEBSOCKET_CACHE_TTL_MS || now - existing.createdAt > SESSION_WEBSOCKET_MAX_AGE_MS;
      if (expired || existing.socket.readyState !== WebSocket.OPEN) {
        evictCachedSocket(cacheKey, existing);
      } else {
        existing.busy = true;
        existing.lastUsedAt = now;
        existing.socket.off("error", existing.idleErrorHandler);
        return {
          socket: existing.socket,
          release: (broken = false) => {
            existing.busy = false;
            existing.lastUsedAt = Date.now();
            if (broken || existing.socket.readyState !== WebSocket.OPEN) {
              evictCachedSocket(cacheKey, existing);
            } else {
              existing.socket.on("error", existing.idleErrorHandler);
            }
          },
        };
      }
    }
  }

  const socket = await connectWebSocket(url, headers, signal);
  if (cacheKey && !sessionWebSockets.has(cacheKey)) {
    const entry: CachedWebSocketConnection = {
      socket,
      idleErrorHandler: () => evictCachedSocket(cacheKey, entry),
      createdAt: now,
      lastUsedAt: now,
      busy: true,
    };
    sessionWebSockets.set(cacheKey, entry);
    return {
      socket,
      release: (broken = false) => {
        entry.busy = false;
        entry.lastUsedAt = Date.now();
        if (broken || socket.readyState !== WebSocket.OPEN) {
          evictCachedSocket(cacheKey, entry);
        } else {
          socket.on("error", entry.idleErrorHandler);
        }
      },
    };
  }
  return {
    socket,
    release: () => {
      try { socket.close(); } catch { /* ignore */ }
    },
  };
}
