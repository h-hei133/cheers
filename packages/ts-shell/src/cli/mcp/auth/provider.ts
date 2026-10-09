import { UnauthorizedError, type OAuthClientProvider, type OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js';
import type { OAuthClientInformationMixed, OAuthClientMetadata, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { mcpIssuer, mcpHttpUrl } from '../../../core/mcp/http/policy.js';
import { validateDiscovery, type McpCredentials } from './record.js';

/** Pending verifier/code/client data stays in memory until authorization succeeds. */
export class McpOAuthProvider implements OAuthClientProvider {
  private verifier?: string;
  private client?: OAuthClientInformationMixed;
  private credentialTokens?: OAuthTokens;
  private discovery?: OAuthDiscoveryState;
  constructor(readonly redirectUrl: string, private readonly nonce: string,
    private readonly authorize?: (url: URL) => void, record?: McpCredentials, discovery?: OAuthDiscoveryState) {
    this.client = record?.client; this.credentialTokens = record?.tokens;
    this.discovery = discovery ?? record?.discovery;
  }
  get clientMetadata(): OAuthClientMetadata { return { client_name: 'Cheers', redirect_uris: [this.redirectUrl], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }; }
  state(): string { return this.nonce; }
  clientInformation(): OAuthClientInformationMixed | undefined { return this.client; }
  saveClientInformation(value: OAuthClientInformationMixed): void { this.bind(value.issuer); this.client = value; }
  tokens(): OAuthTokens | undefined { return this.credentialTokens; }
  saveTokens(value: OAuthTokens): void { this.bind(value.issuer); this.credentialTokens = value; }
  redirectToAuthorization(url: URL): void {
    if (!this.authorize) throw new UnauthorizedError('Explicit MCP sign-in is required.');
    const selected = mcpHttpUrl(url.href);
    if (selected.origin !== new URL(this.discovery!.authorizationServerUrl).origin || selected.searchParams.get('state') !== this.nonce) throw new Error('MCP authorization redirect identity changed.');
    this.authorize(selected);
  }
  saveCodeVerifier(value: string): void { this.verifier = value; }
  codeVerifier(): string { if (!this.verifier) throw new Error('MCP PKCE verifier is unavailable.'); return this.verifier; }
  discoveryState(): OAuthDiscoveryState | undefined { return this.discovery; }
  saveDiscoveryState(value: OAuthDiscoveryState): void { this.discovery = validateDiscovery(value); }
  private bind(issuer?: string): void {
    if (!issuer || !this.discovery || mcpIssuer(issuer) !== mcpIssuer(this.discovery.authorizationServerUrl)) throw new Error('MCP credential issuer identity changed.');
  }
  record(): McpCredentials {
    if (!this.client || !this.credentialTokens || !this.discovery) throw new Error('MCP authentication did not provide complete credentials.');
    return { version: 1, issuer: mcpIssuer(this.discovery.authorizationServerUrl), client: this.client, tokens: this.credentialTokens,
      discovery: this.discovery, redirectUri: this.redirectUrl,
      ...(this.credentialTokens.expires_in !== undefined ? { expiresAt: Date.now() + this.credentialTokens.expires_in * 1000 } : {}) };
  }
}
