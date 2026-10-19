import type { ProviderAuthContract } from "../auth/providerAuthContract.js";
import {
  refreshOAuthTokens,
  runOAuthLogin,
  type OAuthLoginOptions,
  type OAuthTokens,
} from "../auth/oauth/flow.js";
import { assertGoogleAccount } from '../auth/account/google.js';
import { googleOAuthConfig, resolveGoogleClientId } from "../auth/oauth/providers.js";

/**
 * Signing in with a Google account.
 *
 * The client id is the user's own, because Google has no public desktop client for
 * this and shipping someone else's would mean signing in as their application. The
 * rest is the shared flow.
 */

export interface GoogleAccountAuthResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  readonly accountEmail?: string;
  readonly clientId: string;
  readonly authorizeUrl: string;
  readonly callbackUrl: string;
  readonly production?: object;
  readonly clientSecret?: string;
  readonly scopes?: readonly string[];
  readonly quotaProject?: string;
}

export interface GoogleAccountAuthOptions extends OAuthLoginOptions {
  /** Desktop OAuth client id; falls back to GOOGLE_OAUTH_CLIENT_ID. */
  readonly clientId?: string;
  readonly clientSecret?: string;
  readonly quotaProject?: string;
}

export async function loginGoogleAccountViaAuthorizationCodeFlow(
  options?: GoogleAccountAuthOptions,
): Promise<GoogleAccountAuthResult> {
  const clientId = resolveGoogleClientId(options?.clientId);
  const secret = options?.clientSecret?.trim() || process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const quotaProject = options?.quotaProject?.trim() || process.env.GOOGLE_CLOUD_QUOTA_PROJECT?.trim()
    || process.env.GOOGLE_CLOUD_PROJECT?.trim();
  const config = { ...googleOAuthConfig(clientId, secret), quotaProject };
  assertGoogleAccount({ scopes: config.scope.split(/\s+/), quotaProject });
  const result = await runOAuthLogin(config, options ?? {});
  assertGoogleAccount({ scopes: result.scopes, quotaProject });
  return {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresAt: result.expiresAt,
    ...(result.accountEmail ? { accountEmail: result.accountEmail } : {}),
    clientId,
    ...(secret ? { clientSecret: secret } : {}),
    scopes: result.scopes,
    quotaProject,
    authorizeUrl: result.authorizeUrl,
    callbackUrl: result.callbackUrl,
    production: result.production,
  };
}

/** Trade a stored refresh token for a fresh access token. */
export async function refreshGoogleAccountTokens(
  refreshToken: string,
  clientId?: string,
): Promise<OAuthTokens> {
  const resolved = resolveGoogleClientId(clientId);
  const secret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  return refreshOAuthTokens(googleOAuthConfig(resolved, secret), refreshToken);
}

export const googleProviderAuthContract: ProviderAuthContract = {
  provider: "google",
  methods: [
    { kind: "account-auth", label: "Sign in with a Google account (browser)" },
    { kind: "api-key", label: "Use an API key" },
  ],
  loginAccountAuth: async (options) => loginGoogleAccountViaAuthorizationCodeFlow(options),
};
