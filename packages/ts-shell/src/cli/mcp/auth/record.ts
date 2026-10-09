import { OAuthTokensSchema, OAuthClientInformationSchema, OAuthMetadataSchema, OAuthProtectedResourceMetadataSchema,
  type OAuthTokens, type OAuthClientInformationMixed } from '@modelcontextprotocol/sdk/shared/auth.js';
import type { OAuthDiscoveryState } from '@modelcontextprotocol/sdk/client/auth.js';
import { isRecord } from '../../../core/values/record.js';
import { parseConfigText } from '../../../config/syntax.js';
import { mcpHttpUrl, mcpIssuer } from '../../../core/mcp/http/policy.js';

export interface McpCredentials {
  readonly version: 1; readonly issuer: string; readonly client: OAuthClientInformationMixed;
  readonly tokens: OAuthTokens; readonly discovery: OAuthDiscoveryState; readonly redirectUri: string; readonly expiresAt?: number;
}

/** Registration and token endpoints must belong to the selected issuer. */
export function validateDiscovery(state: OAuthDiscoveryState): OAuthDiscoveryState {
  const issuer = mcpIssuer(state.authorizationServerUrl);
  const metadata = OAuthMetadataSchema.parse(state.authorizationServerMetadata);
  if (mcpIssuer(metadata.issuer) !== issuer) throw new Error('MCP OAuth metadata issuer differs from the selected authorization server.');
  for (const value of [metadata.authorization_endpoint, metadata.token_endpoint, metadata.registration_endpoint]) {
    if (value && mcpHttpUrl(value).origin !== new URL(issuer).origin) throw new Error('MCP OAuth endpoints must belong to the selected issuer origin.');
  }
  return { authorizationServerUrl: issuer, authorizationServerMetadata: metadata,
    ...(state.resourceMetadata ? { resourceMetadata: OAuthProtectedResourceMetadataSchema.parse(state.resourceMetadata) } : {}),
    ...(state.resourceMetadataUrl ? { resourceMetadataUrl: mcpHttpUrl(state.resourceMetadataUrl).href } : {}),
  };
}

export function parseCredentials(text: string | undefined): McpCredentials | undefined {
  if (text === undefined) return undefined;
  const values = parseConfigText(text);
  if (values.version === 1 && values.revoked === true && typeof values.revision === 'string' && Object.keys(values).length === 3) return undefined;
  if (values.version !== 1 || typeof values.issuer !== 'string' || typeof values.redirectUri !== 'string' || !isRecord(values.discovery)) throw new Error('MCP credential record is invalid.');
  const discovery = validateDiscovery(values.discovery as unknown as OAuthDiscoveryState);
  const client = OAuthClientInformationSchema.parse(values.client); const tokens = OAuthTokensSchema.parse(values.tokens);
  const issuer = mcpIssuer(values.issuer);
  if (client.issuer === undefined || tokens.issuer === undefined || mcpIssuer(client.issuer) !== issuer || mcpIssuer(tokens.issuer) !== issuer
    || discovery.authorizationServerUrl !== issuer || tokens.token_type.toLowerCase() !== 'bearer' || !tokens.access_token
    || tokens.access_token.length > 8192 || /[\x00-\x20\x7f]/.test(tokens.access_token)
    || values.expiresAt !== undefined && (typeof values.expiresAt !== 'number' || !Number.isFinite(values.expiresAt))) throw new Error('MCP credentials are not bound to this issuer.');
  const redirect = new URL(values.redirectUri);
  if (redirect.protocol !== 'http:' || redirect.hostname !== 'localhost' || redirect.username || redirect.password || redirect.search || redirect.hash) throw new Error('Invalid MCP callback identity.');
  return { version: 1, issuer, client, tokens, discovery, redirectUri: values.redirectUri,
    ...(typeof values.expiresAt === 'number' ? { expiresAt: values.expiresAt } : {}) };
}
