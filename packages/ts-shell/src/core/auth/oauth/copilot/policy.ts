import type { SubscriptionAccountAuthConfig } from '../../../../config/account.js';

export const COPILOT_OAUTH = {
  issuer: 'https://api.github.com/copilot_internal/v2/token',
  deviceCode: 'https://github.com/login/device/code',
  accessToken: 'https://github.com/login/oauth/access_token',
  clientId: 'Iv1.b507a08c87ecfe98',
  scope: 'read:user',
  defaultBaseUrl: 'https://api.individual.githubcopilot.com',
} as const;

const origins = new Set(['individual', 'business', 'enterprise'].map(tier => `https://api.${tier}.githubcopilot.com`));
const tokenField = /^([a-z][a-z0-9-]*)=(.*)$/;

/** Only the native issuer's known service origins can receive a subscription token. */
export function assertCopilotOrigin(baseUrl: string | undefined): string {
  const address = baseUrl?.trim().replace(/\/+$/, '');
  if (!address || !origins.has(address)) throw new Error('Copilot account service address is unverified. Reconnect before sending.');
  return address;
}

function tokenFields(token: string): ReadonlyMap<string, string> {
  if (typeof token !== 'string' || token.length === 0 || token.length > 32 * 1024) {
    throw new Error('Copilot account token metadata is invalid.');
  }
  const fields = new Map<string, string>();
  for (const part of token.split(';').filter(Boolean)) {
    const match = part.match(tokenField);
    if (!match || fields.has(match[1]!)) throw new Error('Copilot account token metadata is ambiguous.');
    fields.set(match[1]!, match[2]!);
  }
  return fields;
}

/**
 * Bind the opaque session token to its tenant and native service audience.
 * Older individual tokens omit the audience hint; callers may supply that
 * default, while business and enterprise callers must pass null.
 */
export function copilotTokenIdentity(token: string, fallbackBaseUrl: string | null = COPILOT_OAUTH.defaultBaseUrl): {
  readonly tenantId: string;
  readonly baseUrl: string;
} {
  const fields = tokenFields(token);
  const tenantId = fields.get('tid')?.trim();
  const rawHint = fields.get('proxy-ep');
  const hint = rawHint?.trim();
  if (!tenantId || tenantId.length > 256) throw new Error('Copilot account token has no tenant identity.');
  if (rawHint !== undefined && !hint) throw new Error('Copilot account token has no service audience.');
  let baseUrl: string;
  if (hint) {
    baseUrl = assertCopilotOrigin(`https://${hint.replace(/^proxy\./, 'api.')}`);
  } else {
    if (fallbackBaseUrl === null) throw new Error('Copilot account token has no service audience.');
    baseUrl = assertCopilotOrigin(fallbackBaseUrl);
  }
  return { tenantId, baseUrl };
}

export function copilotBaseUrl(token: string, fallbackBaseUrl: string = COPILOT_OAUTH.defaultBaseUrl): string {
  return copilotTokenIdentity(token, fallbackBaseUrl).baseUrl;
}

/** Public wire codecs are mapped to thin native declarations, never to a foreign signer. */
export function copilotEndpoint(endpoint: string | undefined): string {
  if (endpoint === undefined || endpoint === 'openai-compatible' || endpoint === 'copilot-chat-completions') return 'copilot-chat-completions';
  if (endpoint === 'anthropic-messages' || endpoint === 'copilot-messages') return 'copilot-messages';
  throw new Error('The selected protocol is unsupported by this Copilot account.');
}

export function assertCopilotAccount(account: SubscriptionAccountAuthConfig): void {
  if (account.provider !== 'github-copilot') {
    throw new Error(account.provider === 'anthropic' ? 'Anthropic subscription login is unsupported. Configure an API key.'
      : 'Subscription issuer is unverified. Reconnect using the native account login.');
  }
  const audience = assertCopilotOrigin(account.baseUrl);
  const fallback = audience === COPILOT_OAUTH.defaultBaseUrl ? audience : null;
  if (copilotTokenIdentity(account.accessToken, fallback).baseUrl !== audience) {
    throw new Error('Copilot account token audience conflicts with its stored service address. Reconnect using the native account login.');
  }
}
