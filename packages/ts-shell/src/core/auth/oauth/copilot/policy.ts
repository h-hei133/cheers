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

/** Only the native issuer's known service origins can receive a subscription token. */
export function assertCopilotOrigin(baseUrl: string | undefined): string {
  const address = baseUrl?.trim().replace(/\/+$/, '');
  if (!address || !origins.has(address)) throw new Error('Copilot account service address is unverified. Reconnect before sending.');
  return address;
}

export function copilotBaseUrl(token: string, fallback: string = COPILOT_OAUTH.defaultBaseUrl): string {
  const fields = token.split(';').filter(field => field.startsWith('proxy-ep='));
  if (fields.length > 1) throw new Error('Copilot account service address is ambiguous.');
  const hint = fields[0]?.slice('proxy-ep='.length);
  return assertCopilotOrigin(hint === undefined ? fallback : `https://${hint.replace(/^proxy\./, 'api.')}`);
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
  assertCopilotOrigin(account.baseUrl);
}
