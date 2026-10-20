import { assertGoogleAccount } from './google.js';
import type { AccountAuthConfig } from '../../../config/account.js';
import { assertCopilotAccount, assertCopilotOrigin } from '../oauth/copilot/policy.js';

/** A login's issuer owns its generation route, independently of model metadata. */
export function accountProtocol(account: AccountAuthConfig | undefined): { readonly baseUrl: string; readonly endpoint?: string } | undefined {
  if (account?.type === 'subscription') {
    assertCopilotAccount(account);
    return { baseUrl: assertCopilotOrigin(account.baseUrl) };
  }
  if (account?.type === 'google-gemini-account') {
    assertGoogleAccount(account);
    return { baseUrl: 'https://generativelanguage.googleapis.com', endpoint: 'google-account-generative-ai' };
  }
  return account?.type === 'openai-chatgpt-account'
    ? { baseUrl: 'https://chatgpt.com/backend-api', endpoint: 'openai-account-responses' } : undefined;
}

export function assertAccountAddress(account: AccountAuthConfig | undefined, address: string | undefined): void {
  const policy = accountProtocol(account);
  if (policy && address !== undefined && address.trim().replace(/\/+$/, '') !== policy.baseUrl) {
    throw new Error('The selected endpoint conflicts with the account issuer. Reconnect using its native account service.');
  }
}
