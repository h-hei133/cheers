import { isIP, type Socket } from 'node:net';
import { Agent, Client, Pool, ProxyAgent, buildConnector } from 'undici/index.js';
import { assertAdmission, type Admission } from '../../core/network/admission.js';
import { AsyncLocalStorage } from 'node:async_hooks';

export interface ProviderConnectionLifetime {
  readonly id: string;
  readonly signal: AbortSignal;
}

const connectionLifetimes = new AsyncLocalStorage<ProviderConnectionLifetime>();

export function currentProviderConnections(): ProviderConnectionLifetime | undefined {
  return connectionLifetimes.getStore();
}

/** The session resource owner supplies lifetime; async children retain that owner. */
export function withProviderConnections<T>(lifetime: ProviderConnectionLifetime, operation: () => T): T {
  lifetime.signal.throwIfAborted();
  return connectionLifetimes.run(lifetime, operation);
}

export interface ProviderSocketOptions {
  readonly lifetime?: ProviderConnectionLifetime;
  readonly proxyUrl?: string;
  readonly connectTimeoutMs: number;
  readonly headersTimeoutMs: number;
  readonly bodyTimeoutMs: number;
  readonly admission?: Admission;
}

/** Establish an HTTP upgrade socket using the same proxy and TLS policy as requests. */
export async function providerSocket(
  url: URL, options: ProviderSocketOptions, signal?: AbortSignal,
): Promise<Socket> {
  signal?.throwIfAborted();
  assertAdmission(options.admission);
  const secure = url.protocol === 'wss:' || url.protocol === 'https:';
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const port = url.port || (secure ? '443' : '80');
  let tunnel: Socket | undefined;
  if (options.proxyUrl) {
    const proxy = new URL(options.proxyUrl);
    const authorization = proxy.username || proxy.password
      ? 'Basic ' + Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString('base64')
      : undefined;
    const client = new Client(proxy.origin, {
      connect: { timeout: options.connectTimeoutMs },
      headersTimeout: options.connectTimeoutMs, bodyTimeout: options.connectTimeoutMs,
    });
    try {
      const result = await client.connect({ path: `${url.hostname}:${port}`, signal,
        headers: { host: `${url.hostname}:${port}`, ...(authorization ? { 'proxy-authorization': authorization } : {}) } });
      tunnel = result.socket as Socket;
      // Detached CONNECT sockets outlive the dispatcher, but never its authority.
      tunnel.on('error', ignoreSocketError);
      if (result.statusCode !== 200) throw new Error('Provider proxy refused the connection.');
      signal?.throwIfAborted();
      assertAdmission(options.admission);
      if (!secure) return tunnel;
    } catch (error) {
      tunnel?.destroy();
      throw error;
    } finally {
      await client.close();
    }
  }
  return new Promise<Socket>((resolve, reject) => {
    let socket: Socket | undefined;
    let settled = false;
    const abort = () => finish(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
    const finish = (error: unknown, connected?: Socket | null) => {
      if (settled) { connected?.destroy(); return; }
      settled = true;
      signal?.removeEventListener('abort', abort);
      if (error) { socket?.destroy(); tunnel?.destroy(); reject(error); }
      else { resolve(connected!); }
    };
    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) { abort(); return; }
    // undici's public declaration omits the socket returned by its connector.
    const connect = buildConnector({ timeout: options.connectTimeoutMs }) as (
      input: buildConnector.Options, callback: buildConnector.Callback,
    ) => Socket;
    socket = connect({
      hostname, port, protocol: secure ? 'https:' : 'http:',
      servername: isIP(hostname) ? undefined : hostname,
      ...(tunnel ? { httpSocket: tunnel } : {}),
    }, (error, connected) => finish(error, connected));
    socket.on('error', ignoreSocketError);
  });
}

function ignoreSocketError(): void { /* The pending operation owns the failure. */ }

interface ConnectionOptions {
  readonly proxyUrl?: string;
  readonly connectTimeoutMs: number;
  readonly headersTimeoutMs: number;
  readonly bodyTimeoutMs: number;
}

export function providerDispatchers(config: ConnectionOptions): { direct: Agent; proxy?: ProxyAgent } {
  const deadlines = { headersTimeout: config.headersTimeoutMs, bodyTimeout: config.bodyTimeoutMs };
  return {
    direct: new Agent({ connect: { timeout: config.connectTimeoutMs }, ...deadlines }),
    proxy: config.proxyUrl ? new ProxyAgent({
      uri: config.proxyUrl, ...deadlines,
      proxyTls: { timeout: config.connectTimeoutMs },
      requestTls: { timeout: config.connectTimeoutMs },
      clientFactory: origin => proxyClient(origin, config.connectTimeoutMs),
    }) : undefined,
  };
}

function proxyClient(origin: URL, timeout: number): Pool {
  const connect = buildConnector({ timeout });
  return new Pool(origin, {
    // CONNECT headers belong to connection establishment, before provider headers.
    headersTimeout: timeout, bodyTimeout: timeout,
    connect: (input, callback) => connect({ ...input,
      // IP certificates still verify against hostname; SNI only accepts DNS names.
      servername: isIP((input.servername ?? '').replace(/^\[|\]$/g, '')) ? undefined : input.servername,
    }, callback),
  });
}
