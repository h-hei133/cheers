import { isPublicAddress } from '../../security/egressGuard.js';

export function mcpHttpUrl(input: string): URL {
  if (input.length > 8192) throw new Error('MCP HTTP URL exceeds its limit.');
  const url = new URL(input);
  if (url.username || url.password || url.hash || !['http:', 'https:'].includes(url.protocol)
    || url.protocol === 'http:' && !loopbackHost(url.hostname)) throw new Error('MCP HTTP requires HTTPS or explicit loopback without credentials or fragment.');
  return url;
}

export function loopbackHost(host: string): boolean { return ['127.0.0.1', 'localhost', '[::1]'].includes(host); }

/** Only a configured loopback authority can opt into local addresses. */
export function mcpAddressPolicy(server: URL, target: URL): (address: string) => boolean {
  return loopbackHost(server.hostname) && target.origin === server.origin
    ? address => ['127.0.0.1', '::1'].includes(address) : isPublicAddress;
}

export function mcpIssuer(value: string): string {
  const url = mcpHttpUrl(value);
  if (url.search) throw new Error('OAuth issuer must not contain a query.');
  return url.href.replace(/\/$/, '');
}
