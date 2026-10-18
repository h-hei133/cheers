import { isIP } from 'node:net';
import { Agent, Pool, ProxyAgent, buildConnector } from 'undici/index.js';

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
