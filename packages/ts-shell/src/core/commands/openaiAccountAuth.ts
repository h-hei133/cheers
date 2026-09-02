import type { ProviderAuthContract } from "../auth/providerAuthContract.js";
import {
  refreshOAuthTokens,
  runOAuthLogin,
  type OAuthLoginOptions,
  type OAuthTokens,
} from "../auth/oauth/flow.js";
import { openAIOAuthConfig } from "../auth/oauth/providers.js";

/**
 * Signing in with an OpenAI account.
 *
 * Everything mechanical — PKCE, the loopback server, the browser launch, the token
 * exchange, refresh — is in the shared flow. What is left here is this provider's
 * declaration and the shape the connection store expects, which is all that was
 * ever provider-specific about it.
 */

export interface OpenAIAccountAuthResult {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
  readonly accountId?: string;
  readonly authorizeUrl: string;
  readonly callbackUrl: string;
}

export async function loginOpenAIAccountViaAuthorizationCodeFlow(
  options?: OAuthLoginOptions,
): Promise<OpenAIAccountAuthResult> {
  const result = await runOAuthLogin(openAIOAuthConfig(), options ?? {});
  return {
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresAt: result.expiresAt,
    ...(result.accountId ? { accountId: result.accountId } : {}),
    authorizeUrl: result.authorizeUrl,
    callbackUrl: result.callbackUrl,
  };
}

/** Trade a stored refresh token for a fresh access token. */
export async function refreshOpenAIAccountTokens(refreshToken: string): Promise<OAuthTokens> {
  return refreshOAuthTokens(openAIOAuthConfig(), refreshToken);
}

export const openAIProviderAuthContract: ProviderAuthContract = {
  provider: "openai",
  methods: [
    { kind: "account-auth", label: "Sign in with an OpenAI account (browser)" },
    { kind: "api-key", label: "Use an API key" },
    { kind: "browser-assisted-capture", label: "Capture a local credential from a browser" },
  ],
  loginAccountAuth: async (options) => loginOpenAIAccountViaAuthorizationCodeFlow(options),
};
