import {
  acquireCodexWebSocket,
  buildSocketCacheKey,
  clearCodexWebSocketCache,
  isWebSocketSseFallbackActive,
  markWebSocketSseFallback,
} from "./codexWsCache.js";

/**
 * Codex Responses WebSocket transport with session-scoped connection caching
 * and automatic per-session SSE fallback.
 */

export { clearCodexWebSocketCache, isWebSocketSseFallbackActive, markWebSocketSseFallback };

const WEBSOCKET_BETA_HEADER = "responses_websockets=2026-02-06";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
  "content-encoding",
  "sec-websocket-key",
  "sec-websocket-version",
  "sec-websocket-extensions",
  "sec-websocket-protocol",
]);

function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.message === "The operation was aborted.");
}

export function buildCodexWebSocketUrl(baseUrl: string, pathSuffix = "/codex/responses"): string {
  const url = new URL(`${baseUrl.replace(/\/+$/, "")}${pathSuffix}`);
  url.protocol = url.protocol === "http:" ? "ws:" : "wss:";
  return url.toString();
}

export function buildCodexWebSocketHeaders(input: {
  readonly token: string;
  readonly accountId?: string;
  readonly requestId: string;
  readonly extraHeaders?: Readonly<Record<string, string>>;
}): Record<string, string> {
  const merged: Record<string, string> = {};
  if (input.extraHeaders) {
    for (const [name, value] of Object.entries(input.extraHeaders)) {
      if (!HOP_BY_HOP_HEADERS.has(name.toLowerCase())) {
        merged[name] = value;
      }
    }
  }
  return {
    ...merged,
    Authorization: `Bearer ${input.token}`,
    ...(input.accountId ? { "chatgpt-account-id": input.accountId } : {}),
    "OpenAI-Beta": WEBSOCKET_BETA_HEADER,
    originator: "cheers",
    "x-client-request-id": input.requestId,
    "session-id": input.requestId,
  };
}

function encodeSseFrame(text: string): string {
  return `${text.split(/\r\n|\r|\n/).map((line) => `data: ${line}`).join("\n")}\n\n`;
}

/**
 * Send a Responses request over WebSocket and adapt incoming JSON frames into an SSE
 * `ReadableStream<Uint8Array>` compatible with `readResponseStream`.
 */
export async function streamCodexWebSocket(input: {
  readonly baseUrl: string;
  readonly path?: string;
  readonly token: string;
  readonly accountId?: string;
  readonly requestId: string;
  readonly cacheKey?: string;
  readonly extraHeaders?: Readonly<Record<string, string>>;
  readonly body: Record<string, unknown>;
  readonly signal?: AbortSignal;
}): Promise<ReadableStream<Uint8Array>> {
  const url = buildCodexWebSocketUrl(input.baseUrl, input.path);
  const headers = buildCodexWebSocketHeaders({
    token: input.token,
    accountId: input.accountId,
    requestId: input.requestId,
    extraHeaders: input.extraHeaders,
  });
  const scopedCacheKey = input.cacheKey
    ? buildSocketCacheKey(input.cacheKey, url, input.token, input.accountId)
    : undefined;

  const { socket, release } = await acquireCodexWebSocket(scopedCacheKey, url, headers, input.signal);
  const encoder = new TextEncoder();
  let finishStream: ((broken: boolean) => void) | undefined;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let finished = false;
      const cleanup = (broken = false) => {
        socket.off("message", onMessage);
        socket.off("error", onError);
        socket.off("close", onClose);
        input.signal?.removeEventListener("abort", onAbort);
        release(broken);
      };
      finishStream = (broken: boolean) => {
        if (finished) return;
        finished = true;
        cleanup(broken);
      };
      const onMessage = (raw: unknown) => {
        if (finished) return;
        const text = typeof raw === "string" ? raw : Buffer.isBuffer(raw) ? raw.toString("utf8") : String(raw);
        controller.enqueue(encoder.encode(encodeSseFrame(text)));
        try {
          const parsed = JSON.parse(text) as { readonly type?: string };
          if (
            parsed.type === "response.completed" ||
            parsed.type === "response.done" ||
            parsed.type === "response.incomplete" ||
            parsed.type === "response.failed" ||
            parsed.type === "error"
          ) {
            finished = true;
            cleanup(false);
            controller.close();
          }
        } catch {
          // Forward unparseable frames for downstream handling.
        }
      };
      const onError = (err: unknown) => {
        if (finished) return;
        finished = true;
        cleanup(true);
        controller.error(err instanceof Error ? err : new Error(String(err)));
      };
      const onClose = () => {
        if (finished) return;
        finished = true;
        cleanup(true);
        controller.close();
      };
      const onAbort = () => {
        if (finished) return;
        finished = true;
        cleanup(true);
        controller.error(input.signal?.reason ?? new DOMException("Codex WebSocket aborted", "AbortError"));
      };

      socket.on("message", onMessage);
      socket.on("error", onError);
      socket.on("close", onClose);
      input.signal?.addEventListener("abort", onAbort, { once: true });

      const frame = JSON.stringify({ type: "response.create", ...input.body });
      socket.send(frame, (err) => {
        if (err && !finished) {
          finished = true;
          cleanup(true);
          controller.error(err);
        }
      });
    },
    cancel() {
      finishStream?.(true);
    },
  });
}

/**
 * Attempt Codex Responses over WebSocket and automatically fall back to HTTP SSE
 * on connection/handshake errors (in `auto` mode), caching fallback per session key.
 */
export async function tryCodexWebSocketFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  sseFallback: (url: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
  allowSseFallback = true,
): Promise<Response> {
  const urlString = input instanceof Request ? input.url : String(input);
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  if (init?.headers) {
    new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  }
  const sessionKey = headers.get("session-id") ?? headers.get("x-client-request-id") ?? undefined;
  if (allowSseFallback && isWebSocketSseFallbackActive(sessionKey)) {
    return sseFallback(input, init);
  }
  const auth = headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const bodyText = typeof init?.body === "string" ? init.body : undefined;
  if (!token || !bodyText) {
    return sseFallback(input, init);
  }
  const extraHeaders: Record<string, string> = {};
  headers.forEach((value, key) => {
    const lower = key.toLowerCase();
    if (lower !== "authorization" && lower !== "chatgpt-account-id" && lower !== "session-id" && lower !== "x-client-request-id") {
      extraHeaders[key] = value;
    }
  });
  const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);

  try {
    const parsedBody = JSON.parse(bodyText) as Record<string, unknown>;
    const targetUrl = new URL(urlString);
    const stream = await streamCodexWebSocket({
      baseUrl: targetUrl.origin,
      path: `${targetUrl.pathname}${targetUrl.search}`,
      token,
      accountId: headers.get("chatgpt-account-id") ?? undefined,
      requestId: sessionKey ?? `req_${Date.now()}`,
      cacheKey: sessionKey,
      extraHeaders,
      body: parsedBody,
      signal: signal ?? undefined,
    });
    return new Response(stream, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  } catch (err) {
    if (signal?.aborted || isAbortError(err) || !allowSseFallback) {
      throw err;
    }
    if (sessionKey) markWebSocketSseFallback(sessionKey);
    return sseFallback(input, init);
  }
}
