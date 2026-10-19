import type { GoogleAccountAuthConfig } from '../../../config/account.js';

export const GOOGLE_GENERATION_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

/** Public Gemini OAuth and subscription service access are different grants. */
export function assertGoogleScopes(scopes: readonly string[] | undefined): void {
  if (!scopes?.includes(GOOGLE_GENERATION_SCOPE)) {
    throw new Error('Google account generation scope is unverified. Reconnect using the native API login.');
  }
}

/** Native OAuth requests bill the project captured with the selected account. */
export function assertGoogleAccount(account: Pick<GoogleAccountAuthConfig, 'scopes' | 'quotaProject'>): void {
  assertGoogleScopes(account.scopes);
  if (!account.quotaProject || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(account.quotaProject)) {
    throw new Error('Google account needs its own billing project. Set GOOGLE_CLOUD_QUOTA_PROJECT before reconnecting.');
  }
}
