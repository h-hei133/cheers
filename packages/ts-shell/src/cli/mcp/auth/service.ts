import { auth } from '@modelcontextprotocol/sdk/client/auth.js';
import { withFileLock } from '../../../runtime/execution/fileLock.js';
import { requestScope, withinRequest } from '../../../core/network/request.js';
import { assertAdmission, type Admission } from '../../../core/network/admission.js';
import { startCallbackServer } from '../../../core/auth/oauth/callback.js';
import { createState } from '../../../core/auth/oauth/pkce.js';
import { mcpFetch, type McpHttpAuthorization } from '../../../core/mcp/http/fetch.js';
import type { ScopedMcpServerConfig } from '../../../core/mcp/types.js';
import type { OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js';
import { McpOAuthProvider } from './provider.js';
import { credentialPath, readCredentials, saveCredentials } from './store.js';

export class McpAuthService implements McpHttpAuthorization {
  readonly target: string;
  constructor(readonly name: string, readonly config: ScopedMcpServerConfig) { this.target = credentialPath(name, config); }
  async token(admission?: Admission, signal?: AbortSignal): Promise<string | undefined> {
    if (Object.keys(this.config.headers ?? {}).some(name => name.toLowerCase() === 'authorization')) return undefined;
    return withFileLock(this.target, async () => {
      assertAdmission(admission); signal?.throwIfAborted();
      const baseline = readCredentials(this.target); const record = baseline.record;
      if (!record) return undefined;
      if (record.expiresAt === undefined || record.expiresAt > Date.now() + 30_000) return record.tokens.access_token;
      const provider = new McpOAuthProvider(record.redirectUri, '', undefined, record);
      if (await auth(provider, { serverUrl: this.config.url!, fetchFn: scopedAuthFetch(this.config.url!, admission, signal) }) !== 'AUTHORIZED') throw new Error('Explicit MCP sign-in is required.');
      assertAdmission(admission); signal?.throwIfAborted();
      saveCredentials(this.target, baseline, provider.record(), admission);
      return provider.record().tokens.access_token;
    });
  }
  async login(discovery: OAuthDiscoveryState, onAuthorizeUrl: (url: string) => void, admission?: Admission, signal?: AbortSignal): Promise<void> {
    const baseline = readCredentials(this.target); const nonce = createState(); const lifetime = requestScope(5 * 60_000, signal);
    const server = await startCallbackServer({ path: '/mcp/callback', port: 0, expectedState: nonce, timeoutMs: 5 * 60_000, label: 'MCP sign-in' });
    try {
      lifetime.check(); assertAdmission(admission);
      // A login gets a fresh registration for its actual callback port and selected issuer.
      const provider = new McpOAuthProvider(server.redirectUri, nonce, url => onAuthorizeUrl(url.href), undefined, discovery);
      const fetchFn = scopedAuthFetch(this.config.url!, admission, lifetime.signal);
      if (await auth(provider, { serverUrl: this.config.url!, fetchFn }) !== 'REDIRECT') throw new Error('MCP sign-in did not produce an authorization request.');
      const callback = await withinRequest(server.received, lifetime);
      assertAdmission(admission); lifetime.check();
      if (await auth(provider, { serverUrl: this.config.url!, authorizationCode: callback.code, fetchFn }) !== 'AUTHORIZED') throw new Error('MCP authentication was not completed.');
      assertAdmission(admission); lifetime.check();
      saveCredentials(this.target, baseline, provider.record(), admission);
    } finally { lifetime.dispose(); server.close(); }
  }
  logout(admission?: Admission): void { const baseline = readCredentials(this.target); saveCredentials(this.target, baseline, undefined, admission); }
}

export function authorizationForMcp(name: string, config: ScopedMcpServerConfig): McpHttpAuthorization | undefined {
  return config.transport === 'http' && config.url ? new McpAuthService(name, config) : undefined;
}

/** OAuth discovery/exchange is bounded and never receives configured MCP headers. */
export function scopedAuthFetch(url: string, admission?: Admission, signal?: AbortSignal) {
  const fetchFn = mcpFetch(url, { admission, streaming: false });
  return (input: Parameters<typeof fetchFn>[0], init?: Parameters<typeof fetchFn>[1]) => fetchFn(input, { ...init, signal });
}
