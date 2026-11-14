import { WebSocket } from "ws";
import { providerSocket, type ProviderSocketOptions } from "../../request/connection.js";
import { assertAdmission } from "../../../core/network/admission.js";

export async function connectWebSocket(url: string, headers: Record<string, string>, signal: AbortSignal | undefined,
  options: ProviderSocketOptions): Promise<WebSocket> {
  const connected = await providerSocket(new URL(url), options, signal);
  try { signal?.throwIfAborted(); assertAdmission(options.admission); }
  catch (error) { connected.destroy(); throw error; }
  return new Promise((resolve, reject) => {
    let socket: WebSocket;
    try { socket = new WebSocket(url, { headers,
      handshakeTimeout: options.headersTimeoutMs, createConnection: () => connected }); }
    catch (error) { connected.destroy(); reject(error); return; }
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      terminate();
      reject(Object.assign(new Error('Provider WebSocket handshake timed out.'), { code: 'UND_ERR_HEADERS_TIMEOUT' }));
    }, options.headersTimeoutMs);
    const cleanup = () => {
      clearTimeout(timer);
      socket.off("open", onOpen);
      socket.off("error", onError);
      signal?.removeEventListener("abort", onAbort);
    };
    const terminate = () => { socket.once('error', () => {}); socket.terminate(); };
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
      connected.destroy();
      reject(err instanceof Error && err.message === 'Opening handshake has timed out'
        ? Object.assign(new Error('Provider WebSocket handshake timed out.'), { code: 'UND_ERR_HEADERS_TIMEOUT' })
        : err instanceof Error ? err : new Error('Provider WebSocket connection failed.'));
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      terminate();
      reject(signal?.reason instanceof Error ? signal.reason : new DOMException("Aborted", "AbortError"));
    };
    socket.on("open", onOpen);
    socket.on("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}
